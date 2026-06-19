const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, superAdminOnly } = require('../../middleware/auth');
const { success, paginated } = require('../../utils/response');
const { paginate, paginateMeta } = require('../../utils/helpers');

router.use(authenticate, superAdminOnly);

// Companies
router.get('/companies', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      ...(search && { OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]}),
      ...(status === 'active' && { isActive: true }),
      ...(status === 'inactive' && { isActive: false }),
    };
    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where, take, skip,
        include: {
          subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { users: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.company.count({ where }),
    ]);
    return paginated(res, companies, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.get('/companies/:id', async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        subscriptions: { include: { plan: true } },
        _count: { select: { users: true, leads: true, contacts: true, employees: true } },
      },
    });
    return success(res, company);
  } catch (err) { next(err); }
});

router.put('/companies/:id', async (req, res, next) => {
  try {
    const company = await prisma.company.update({ where: { id: req.params.id }, data: req.body });
    return success(res, company, 'Company updated');
  } catch (err) { next(err); }
});

router.post('/companies/:id/toggle', async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    const updated = await prisma.company.update({
      where: { id: req.params.id },
      data: { isActive: !company.isActive },
    });
    return success(res, updated, `Company ${updated.isActive ? 'activated' : 'suspended'}`);
  } catch (err) { next(err); }
});

// Plans
router.get('/plans', async (req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({ include: { _count: { select: { subscriptions: true } } } });
    return success(res, plans);
  } catch (err) { next(err); }
});

router.post('/plans', async (req, res, next) => {
  try {
    const plan = await prisma.plan.create({ data: req.body });
    return success(res, plan, 'Plan created', 201);
  } catch (err) { next(err); }
});

router.put('/plans/:id', async (req, res, next) => {
  try {
    const plan = await prisma.plan.update({ where: { id: req.params.id }, data: req.body });
    return success(res, plan, 'Plan updated');
  } catch (err) { next(err); }
});

// Users (all)
router.get('/users', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = search ? { OR: [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
    ]} : {};
    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, take, skip, include: { company: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.user.count({ where }),
    ]);
    return paginated(res, users.map(u => { const { password, ...s } = u; return s; }), paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

// Audit logs
router.get('/audit-logs', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, companyId, userId, module } = req.query;
    const { take, skip } = paginate(page, limit);
    const logs = await prisma.auditLog.findMany({
      where: {
        ...(companyId && { companyId }),
        ...(userId && { userId }),
        ...(module && { module }),
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        companyRel: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take, skip,
    });
    return success(res, logs);
  } catch (err) { next(err); }
});

// System health
router.get('/health', async (req, res, next) => {
  try {
    const [companies, users, leads, tickets] = await Promise.all([
      prisma.company.count(),
      prisma.user.count(),
      prisma.lead.count(),
      prisma.ticket.count(),
    ]);
    return success(res, {
      status: 'healthy',
      database: 'connected',
      stats: { companies, users, leads, tickets },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      timestamp: new Date(),
    });
  } catch (err) { next(err); }
});

// Subscriptions
router.get('/subscriptions', async (req, res, next) => {
  try {
    const subs = await prisma.subscription.findMany({
      include: { company: { select: { id: true, name: true } }, plan: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return success(res, subs);
  } catch (err) { next(err); }
});

module.exports = router;
