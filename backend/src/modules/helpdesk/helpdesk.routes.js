const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany, requirePermission } = require('../../middleware/auth');
const { success, created, paginated, notFound, error } = require('../../utils/response');
const { paginate, paginateMeta, generateNumber, pick } = require('../../utils/helpers');
const emailService = require('../../services/email.service');
const { callAI } = require('../../services/ai.service');
const { auditLog } = require('../../middleware/audit');

router.use(authenticate, sameCompany);

const TICKET_WRITABLE_FIELDS = ['subject', 'description', 'status', 'priority', 'categoryId', 'assigneeId', 'contactId', 'source', 'slaDeadline', 'rating', 'feedback', 'tags'];

router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, priority, categoryId, assigneeId, contactId, clientEmail, search } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(status && { status }),
      ...(priority && { priority }),
      ...(categoryId && { categoryId }),
      ...(assigneeId && { assigneeId }),
      ...(contactId && { contactId }),
      ...(clientEmail && { clientEmail }),
      ...(search && { OR: [
        { subject: { contains: search, mode: 'insensitive' } },
        { ticketNo: { contains: search, mode: 'insensitive' } },
      ]}),
    };
    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where, take, skip,
        include: { category: true, _count: { select: { comments: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.ticket.count({ where }),
    ]);
    return paginated(res, tickets, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.get('/stats', async (req, res, next) => {
  try {
    const byStatus = await prisma.ticket.groupBy({
      by: ['status'],
      where: { companyId: req.companyId },
      _count: true,
    });
    const urgentCount = await prisma.ticket.count({
      where: { companyId: req.companyId, priority: 'urgent', status: { notIn: ['resolved', 'closed'] } },
    });
    return success(res, { byStatus, urgentCount });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: {
        category: true,
        comments: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) return notFound(res, 'Ticket not found');
    return success(res, ticket);
  } catch (err) { next(err); }
});

router.post('/', auditLog('helpdesk.tickets', 'ticket'), async (req, res, next) => {
  try {
    if (!req.body.subject) return error(res, 'Subject is required', 400);
    const count = await prisma.ticket.count({ where: { companyId: req.companyId } });
    const ticketNo = generateNumber('TKT', count + 1);
    const ticket = await prisma.ticket.create({
      data: { ...pick(req.body, TICKET_WRITABLE_FIELDS), companyId: req.companyId, ticketNo, reporterId: req.userId },
    });
    return created(res, ticket, 'Ticket created');
  } catch (err) { next(err); }
});

router.put('/:id', requirePermission('helpdesk.*'), auditLog('helpdesk.tickets', 'ticket'), async (req, res, next) => {
  try {
    const existing = await prisma.ticket.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Ticket not found');
    const data = pick(req.body, TICKET_WRITABLE_FIELDS);
    if (data.status === 'resolved' && !data.resolvedAt) data.resolvedAt = new Date();
    if (data.status === 'closed' && !data.closedAt) data.closedAt = new Date();
    const ticket = await prisma.ticket.update({ where: { id: req.params.id }, data });
    return success(res, ticket, 'Ticket updated');
  } catch (err) { next(err); }
});

router.post('/:id/comments', async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!ticket) return notFound(res, 'Ticket not found');
    const comment = await prisma.comment.create({
      data: {
        ticketId: req.params.id,
        userId: req.userId,
        content: req.body.content,
        isInternal: req.body.isInternal || false,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });
    return created(res, comment, 'Comment added');
  } catch (err) { next(err); }
});

// Categories
router.get('/categories/list', async (req, res, next) => {
  try {
    const categories = await prisma.ticketCategory.findMany({ where: { companyId: req.companyId } });
    return success(res, categories);
  } catch (err) { next(err); }
});

router.post('/categories', async (req, res, next) => {
  try {
    const cat = await prisma.ticketCategory.create({ data: { ...req.body, companyId: req.companyId } });
    return created(res, cat);
  } catch (err) { next(err); }
});

// POST /helpdesk/:id/ai-triage — AI priority + category suggestion + reply draft
router.post('/:id/ai-triage', async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const company = await prisma.company.findUnique({ where: { id: req.companyId }, select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true } });

    const result = await callAI({
      messages: [{ role: 'user', content: `Analyze this support ticket and provide triage. Subject: "${ticket.subject}". Message: "${ticket.message || ticket.description || ''}". Return JSON: {"priority": "low|medium|high|urgent", "sentiment": "positive|neutral|frustrated|angry", "category": "billing|technical|general|bug|feature", "suggestedReply": "professional reply draft (2-3 sentences)", "summary": "one sentence summary"}` }],
      system: 'You are a customer support triage AI. Return only valid JSON, no markdown.',
      companyAnthropicKey: company?.anthropicKey,
      companyOpenaiKey: company?.openaiKey,
      companyProvider: company?.aiProvider,
      maxTokens: 400,
    });

    let triage = {};
    try { triage = JSON.parse(result.text.trim()); } catch { triage = { priority: ticket.priority, sentiment: 'neutral', category: ticket.category || 'general', suggestedReply: 'Thank you for contacting us. We have received your request and will respond shortly.', summary: ticket.subject }; }

    // Auto-update priority if AI detected urgent
    if (triage.priority === 'urgent' && ticket.priority !== 'urgent') {
      await prisma.ticket.update({ where: { id: ticket.id }, data: { priority: 'urgent' } });
    }

    return res.json({ success: true, data: triage });
  } catch (err) { next(err); }
});

module.exports = router;
