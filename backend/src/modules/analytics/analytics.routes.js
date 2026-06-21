const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success } = require('../../utils/response');

router.use(authenticate, sameCompany);

// Dashboard overview stats
router.get('/dashboard', async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totalLeads, newLeadsThisMonth, newLeadsLastMonth,
      totalContacts, totalDeals, wonDeals,
      openTickets, resolvedTickets,
      totalEmployees, activeProjects,
      totalRevenue, monthRevenue,
      aiConversations,
    ] = await Promise.all([
      prisma.lead.count({ where: { companyId } }),
      prisma.lead.count({ where: { companyId, createdAt: { gte: thisMonth } } }),
      prisma.lead.count({ where: { companyId, createdAt: { gte: lastMonth, lte: lastMonthEnd } } }),
      prisma.contact.count({ where: { companyId } }),
      prisma.deal.count({ where: { companyId, status: 'open' } }),
      prisma.deal.aggregate({ where: { companyId, status: 'won' }, _sum: { value: true }, _count: true }),
      prisma.ticket.count({ where: { companyId, status: { in: ['open', 'in_progress'] } } }),
      prisma.ticket.count({ where: { companyId, status: 'resolved', updatedAt: { gte: thisMonth } } }),
      prisma.employee.count({ where: { companyId, status: 'active' } }),
      prisma.project.count({ where: { companyId, status: 'active' } }),
      prisma.invoice.aggregate({ where: { companyId, status: 'paid' }, _sum: { total: true } }),
      prisma.invoice.aggregate({ where: { companyId, status: 'paid', paidAt: { gte: thisMonth } }, _sum: { total: true } }),
      prisma.aiConversation.count({ where: { companyId, createdAt: { gte: thisMonth } } }),
    ]);

    const leadGrowth = newLeadsLastMonth > 0
      ? (((newLeadsThisMonth - newLeadsLastMonth) / newLeadsLastMonth) * 100).toFixed(1)
      : 100;

    return success(res, {
      leads: { total: totalLeads, thisMonth: newLeadsThisMonth, growth: leadGrowth },
      contacts: { total: totalContacts },
      deals: { open: totalDeals, wonCount: wonDeals._count, wonValue: Number(wonDeals._sum.value || 0) },
      tickets: { open: openTickets, resolvedThisMonth: resolvedTickets },
      employees: { active: totalEmployees },
      projects: { active: activeProjects },
      revenue: { total: Number(totalRevenue._sum.total || 0), thisMonth: Number(monthRevenue._sum.total || 0) },
      ai: { conversationsThisMonth: aiConversations },
    });
  } catch (err) { next(err); }
});

// Revenue chart (monthly)
router.get('/revenue', async (req, res, next) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const results = await Promise.all(Array.from({ length: 12 }, (_, m) => {
      const start = new Date(year, m, 1);
      const end = new Date(year, m + 1, 0);
      return prisma.invoice.aggregate({
        where: { companyId: req.companyId, status: 'paid', paidAt: { gte: start, lte: end } },
        _sum: { total: true },
      });
    }));
    const months = results.map((result, m) => ({ month: m + 1, revenue: Number(result._sum.total || 0) }));
    return success(res, months);
  } catch (err) { next(err); }
});

// Lead sources
router.get('/leads/sources', async (req, res, next) => {
  try {
    const sources = await prisma.lead.groupBy({
      by: ['source'],
      where: { companyId: req.companyId },
      _count: true,
    });
    return success(res, sources);
  } catch (err) { next(err); }
});

// Lead status funnel
router.get('/leads/funnel', async (req, res, next) => {
  try {
    const statuses = await prisma.lead.groupBy({
      by: ['status'],
      where: { companyId: req.companyId },
      _count: true,
    });
    return success(res, statuses);
  } catch (err) { next(err); }
});

// CRM pipeline analytics
router.get('/crm/pipeline', async (req, res, next) => {
  try {
    const stages = await prisma.deal.groupBy({
      by: ['stageId'],
      where: { companyId: req.companyId, status: 'open' },
      _count: true,
      _sum: { value: true },
    });
    const stageDetails = await prisma.pipelineStage.findMany({
      where: { id: { in: stages.map(s => s.stageId) } },
    });
    const result = stages.map(s => ({
      ...s,
      stage: stageDetails.find(d => d.id === s.stageId),
    }));
    return success(res, result);
  } catch (err) { next(err); }
});

// Employee productivity
router.get('/employees/productivity', async (req, res, next) => {
  try {
    const { month = new Date().getMonth() + 1, year = new Date().getFullYear() } = req.query;
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);

    const [tasksCompleted, attendanceDays, leaveDays] = await Promise.all([
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { companyId: req.companyId, status: 'done', completedAt: { gte: start, lte: end } },
        _count: true,
      }),
      prisma.attendance.groupBy({
        by: ['employeeId'],
        where: { employee: { companyId: req.companyId }, date: { gte: start, lte: end }, status: 'present' },
        _count: true,
      }),
      prisma.leaveRequest.groupBy({
        by: ['employeeId'],
        where: { employee: { companyId: req.companyId }, status: 'approved', startDate: { gte: start, lte: end } },
        _sum: { totalDays: true },
      }),
    ]);

    return success(res, { tasksCompleted, attendanceDays, leaveDays });
  } catch (err) { next(err); }
});

// AI usage stats
router.get('/ai/usage', async (req, res, next) => {
  try {
    const { days = 30 } = req.query;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [conversations, messages, byType] = await Promise.all([
      prisma.aiConversation.count({ where: { companyId: req.companyId, createdAt: { gte: since } } }),
      prisma.aiMessage.count({ where: { conversation: { companyId: req.companyId }, createdAt: { gte: since } } }),
      prisma.aiConversation.groupBy({ by: ['type'], where: { companyId: req.companyId, createdAt: { gte: since } }, _count: true }),
    ]);

    return success(res, { conversations, messages, byType });
  } catch (err) { next(err); }
});

// Support analytics
router.get('/support', async (req, res, next) => {
  try {
    const companyId = req.companyId;
    const [byStatus, byPriority, avgResolutionTime] = await Promise.all([
      prisma.ticket.groupBy({ by: ['status'], where: { companyId }, _count: true }),
      prisma.ticket.groupBy({ by: ['priority'], where: { companyId }, _count: true }),
      prisma.ticket.findMany({
        where: { companyId, status: 'resolved', resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
        take: 100,
      }),
    ]);

    const avgHours = avgResolutionTime.length > 0
      ? avgResolutionTime.reduce((sum, t) => sum + (t.resolvedAt - t.createdAt), 0) / avgResolutionTime.length / (1000 * 60 * 60)
      : 0;

    return success(res, { byStatus, byPriority, avgResolutionHours: Math.round(avgHours * 10) / 10 });
  } catch (err) { next(err); }
});

// GET /analytics/forecast — 6-month revenue forecast
router.get('/forecast', async (req, res, next) => {
  try {
    const cid = req.companyId;
    const now = new Date();

    // Historical: last 6 months — run the 6 aggregates in parallel, then
    // build `months` back in chronological order (the regression below
    // depends on index order matching time order).
    const historicalRanges = Array.from({ length: 6 }, (_, idx) => {
      const i = 5 - idx;
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      return { start, end };
    });
    const historicalResults = await Promise.all(historicalRanges.map(({ start, end }) =>
      prisma.invoice.aggregate({
        where: { companyId: cid, status: 'paid', paidAt: { gte: start, lte: end } },
        _sum: { total: true },
      })
    ));
    const months = historicalRanges.map(({ start }, idx) => ({
      month: start.toISOString().slice(0, 7),
      revenue: Number(historicalResults[idx]._sum.total || 0),
      type: 'actual',
    }));

    // Forecast: next 3 months using linear regression
    const values = months.map(m => m.revenue);
    const n = values.length;
    const sumX = values.reduce((s, _, i) => s + i, 0);
    const sumY = values.reduce((s, v) => s + v, 0);
    const sumXY = values.reduce((s, v, i) => s + i * v, 0);
    const sumX2 = values.reduce((s, _, i) => s + i * i, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
    const intercept = (sumY - slope * sumX) / n;

    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const predicted = Math.max(0, intercept + slope * (n + i - 1));
      months.push({ month: d.toISOString().slice(0, 7), revenue: Math.round(predicted), type: 'forecast' });
    }

    // Pipeline deals as additional signal
    const pipeline = await prisma.deal.aggregate({
      where: { companyId: cid, status: { in: ['open', 'negotiation'] } },
      _sum: { value: true },
    });

    return res.json({
      success: true,
      data: {
        months,
        pipelineValue: Number(pipeline._sum.value || 0),
        growthRate: values[0] > 0 ? ((values[n - 1] - values[0]) / values[0]) * 100 : 0,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
