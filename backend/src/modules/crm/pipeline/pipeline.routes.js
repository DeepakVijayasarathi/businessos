const router = require('express').Router();
const prisma = require('../../../config/prisma');
const { authenticate, sameCompany } = require('../../../middleware/auth');
const { success, created, paginated, notFound } = require('../../../utils/response');
const { paginate, paginateMeta } = require('../../../utils/helpers');

router.use(authenticate, sameCompany);

// Pipelines
router.get('/pipelines', async (req, res, next) => {
  try {
    const pipelines = await prisma.pipeline.findMany({
      where: { companyId: req.companyId },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
    return success(res, pipelines);
  } catch (err) { next(err); }
});

router.post('/pipelines', async (req, res, next) => {
  try {
    const { name, stages = [] } = req.body;
    const pipeline = await prisma.pipeline.create({
      data: {
        name,
        companyId: req.companyId,
        stages: { create: stages.map((s, i) => ({ name: s.name, order: i, probability: s.probability || 0, color: s.color || '#6366f1' })) },
      },
      include: { stages: true },
    });
    return created(res, pipeline, 'Pipeline created');
  } catch (err) { next(err); }
});

// Deals
router.get('/deals', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, pipelineId, stageId, status, search } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(pipelineId && { pipelineId }),
      ...(stageId && { stageId }),
      ...(status && { status }),
      ...(search && { title: { contains: search, mode: 'insensitive' } }),
    };
    const [deals, total] = await Promise.all([
      prisma.deal.findMany({ where, take, skip, include: { stage: true, crmCompany: true, contacts: { include: { contact: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.deal.count({ where }),
    ]);
    return paginated(res, deals, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.get('/kanban/:pipelineId', async (req, res, next) => {
  try {
    const pipeline = await prisma.pipeline.findFirst({
      where: { id: req.params.pipelineId, companyId: req.companyId },
      include: {
        stages: {
          orderBy: { order: 'asc' },
          include: {
            deals: {
              where: { companyId: req.companyId, status: 'open' },
              include: { crmCompany: true, contacts: { include: { contact: true } } },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });
    if (!pipeline) return notFound(res, 'Pipeline not found');
    return success(res, pipeline);
  } catch (err) { next(err); }
});

router.post('/deals', async (req, res, next) => {
  try {
    const deal = await prisma.deal.create({
      data: { ...req.body, companyId: req.companyId },
      include: { stage: true },
    });
    return created(res, deal, 'Deal created');
  } catch (err) { next(err); }
});

router.put('/deals/:id', async (req, res, next) => {
  try {
    const deal = await prisma.deal.update({
      where: { id: req.params.id },
      data: req.body,
      include: { stage: true },
    });
    return success(res, deal, 'Deal updated');
  } catch (err) { next(err); }
});

router.put('/deals/:id/move', async (req, res, next) => {
  try {
    const { stageId } = req.body;
    const deal = await prisma.deal.update({
      where: { id: req.params.id },
      data: { stageId },
      include: { stage: true },
    });
    return success(res, deal, 'Deal moved');
  } catch (err) { next(err); }
});

router.delete('/deals/:id', async (req, res, next) => {
  try {
    await prisma.deal.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Deal deleted');
  } catch (err) { next(err); }
});

// CRM Companies
router.get('/companies', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };
    const [companies, total] = await Promise.all([
      prisma.crmCompany.findMany({ where, take, skip, orderBy: { name: 'asc' }, include: { _count: { select: { contacts: true } } } }),
      prisma.crmCompany.count({ where }),
    ]);
    return paginated(res, companies, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.post('/companies', async (req, res, next) => {
  try {
    const company = await prisma.crmCompany.create({ data: { ...req.body, companyId: req.companyId } });
    return created(res, company, 'Company created');
  } catch (err) { next(err); }
});

router.put('/companies/:id', async (req, res, next) => {
  try {
    const company = await prisma.crmCompany.update({ where: { id: req.params.id }, data: req.body });
    return success(res, company, 'Company updated');
  } catch (err) { next(err); }
});

router.delete('/companies/:id', async (req, res, next) => {
  try {
    await prisma.crmCompany.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Company deleted');
  } catch (err) { next(err); }
});

// Activities
router.get('/activities', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, leadId, contactId, dealId } = req.query;
    const { take, skip } = paginate(page, limit);
    const activities = await prisma.activity.findMany({
      where: { companyId: req.companyId, ...(type && { type }), ...(leadId && { leadId }), ...(contactId && { contactId }), ...(dealId && { dealId }) },
      take, skip, orderBy: { createdAt: 'desc' },
    });
    return success(res, activities);
  } catch (err) { next(err); }
});

router.post('/activities', async (req, res, next) => {
  try {
    const activity = await prisma.activity.create({
      data: { ...req.body, companyId: req.companyId, userId: req.userId },
    });
    return created(res, activity, 'Activity logged');
  } catch (err) { next(err); }
});

module.exports = router;
