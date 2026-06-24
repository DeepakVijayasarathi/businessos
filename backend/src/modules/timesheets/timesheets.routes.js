const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate: auth } = require('../../middleware/auth');
const { success, error } = require('../../utils/response');

const prisma = new PrismaClient();

// GET /timesheets - list entries for current user (or all for managers)
router.get('/', auth, async (req, res) => {
  try {
    const { userId, startDate, endDate, projectId, billable, limit = 100, page = 1 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = { companyId: req.user.companyId };
    if (userId) where.userId = userId;
    else if (!req.user.roles?.some(r => ['admin', 'manager', 'hr'].includes(r))) {
      where.userId = req.user.id;
    }
    if (projectId) where.projectId = projectId;
    if (billable !== undefined) where.billable = billable === 'true';
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const [entries, total] = await Promise.all([
      prisma.timeEntry.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          project: { select: { id: true, name: true, color: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: Number(limit),
        skip,
      }),
      prisma.timeEntry.count({ where }),
    ]);

    const totalHours = await prisma.timeEntry.aggregate({
      where,
      _sum: { hours: true },
    });

    return success(res, { entries, total, totalHours: totalHours._sum.hours || 0 });
  } catch (e) {
    return error(res, e.message);
  }
});

// GET /timesheets/summary - weekly/monthly summary
router.get('/summary', auth, async (req, res) => {
  try {
    const { period = 'week', userId } = req.query;
    const now = new Date();
    let startDate;
    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const where = {
      companyId: req.user.companyId,
      date: { gte: startDate },
    };
    if (userId) where.userId = userId;
    else where.userId = req.user.id;

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        project: { select: { id: true, name: true, color: true } },
      },
      orderBy: { date: 'asc' },
    });

    // Group by date
    const byDate = {};
    const byProject = {};
    let totalHours = 0;
    let billableHours = 0;

    for (const e of entries) {
      const dateKey = e.date.toISOString().split('T')[0];
      byDate[dateKey] = (byDate[dateKey] || 0) + Number(e.hours);
      if (e.project) {
        const key = e.project.id;
        if (!byProject[key]) byProject[key] = { ...e.project, hours: 0 };
        byProject[key].hours += Number(e.hours);
      }
      totalHours += Number(e.hours);
      if (e.billable) billableHours += Number(e.hours);
    }

    return success(res, {
      totalHours,
      billableHours,
      nonBillableHours: totalHours - billableHours,
      byDate,
      byProject: Object.values(byProject),
      entries,
    });
  } catch (e) {
    return error(res, e.message);
  }
});

// POST /timesheets - create entry
router.post('/', auth, async (req, res) => {
  try {
    const { projectId, taskId, description, hours, date, billable, startTime, endTime } = req.body;
    if (!hours || !date) return error(res, 'Hours and date are required', 400);

    const entry = await prisma.timeEntry.create({
      data: {
        companyId: req.user.companyId,
        userId: req.user.id,
        projectId: projectId || null,
        taskId: taskId || null,
        description,
        hours: Number(hours),
        date: new Date(date),
        billable: billable !== false,
        startTime,
        endTime,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true, color: true } },
      },
    });
    return success(res, entry, 201);
  } catch (e) {
    return error(res, e.message);
  }
});

// PUT /timesheets/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.timeEntry.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!existing) return error(res, 'Not found', 404);
    if (existing.userId !== req.user.id && !req.user.roles?.some(r => ['admin', 'manager'].includes(r))) {
      return error(res, 'Forbidden', 403);
    }

    const { projectId, taskId, description, hours, date, billable, startTime, endTime } = req.body;
    const updated = await prisma.timeEntry.update({
      where: { id: req.params.id },
      data: {
        projectId: projectId !== undefined ? projectId || null : undefined,
        taskId: taskId !== undefined ? taskId || null : undefined,
        description,
        hours: hours !== undefined ? Number(hours) : undefined,
        date: date ? new Date(date) : undefined,
        billable,
        startTime,
        endTime,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        project: { select: { id: true, name: true, color: true } },
      },
    });
    return success(res, updated);
  } catch (e) {
    return error(res, e.message);
  }
});

// DELETE /timesheets/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.timeEntry.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!existing) return error(res, 'Not found', 404);
    if (existing.userId !== req.user.id && !req.user.roles?.some(r => ['admin', 'manager'].includes(r))) {
      return error(res, 'Forbidden', 403);
    }
    await prisma.timeEntry.delete({ where: { id: req.params.id } });
    return success(res, { deleted: true });
  } catch (e) {
    return error(res, e.message);
  }
});

module.exports = router;
