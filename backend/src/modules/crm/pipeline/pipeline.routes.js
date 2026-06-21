const router = require('express').Router();
const prisma = require('../../../config/prisma');
const { authenticate, sameCompany } = require('../../../middleware/auth');
const { success, created, paginated, notFound, error } = require('../../../utils/response');
const { paginate, paginateMeta, pick } = require('../../../utils/helpers');
const { auditLog } = require('../../../middleware/audit');

router.use(authenticate, sameCompany);

const DEAL_WRITABLE_FIELDS = ['title', 'pipelineId', 'stageId', 'crmCompanyId', 'value', 'currency', 'probability', 'expectedCloseAt', 'closedAt', 'status', 'lostReason', 'assignedToId', 'notes', 'customFields', 'tags'];
const CRM_COMPANY_WRITABLE_FIELDS = ['name', 'website', 'email', 'phone', 'industry', 'size', 'revenue', 'address', 'city', 'country', 'status', 'assignedToId', 'notes', 'customFields', 'tags'];

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
    // Coerce Decimal `value` to a plain number — Prisma Decimals serialize to
    // strings over JSON, which silently string-concatenates in frontend sums.
    pipeline.stages = pipeline.stages.map((stage) => ({
      ...stage,
      deals: stage.deals.map((deal) => ({ ...deal, value: deal.value != null ? Number(deal.value) : null })),
    }));
    return success(res, pipeline);
  } catch (err) { next(err); }
});

router.post('/deals', auditLog('crm.deals', 'deal'), async (req, res, next) => {
  try {
    if (!req.body.title) return error(res, 'Deal title is required', 400);
    if (!req.body.pipelineId || !req.body.stageId) return error(res, 'pipelineId and stageId are required', 400);
    const deal = await prisma.deal.create({
      data: { ...pick(req.body, DEAL_WRITABLE_FIELDS), companyId: req.companyId },
      include: { stage: true },
    });
    return created(res, deal, 'Deal created');
  } catch (err) { next(err); }
});

router.put('/deals/:id', auditLog('crm.deals', 'deal'), async (req, res, next) => {
  try {
    const existing = await prisma.deal.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Deal not found');
    const deal = await prisma.deal.update({
      where: { id: req.params.id },
      data: pick(req.body, DEAL_WRITABLE_FIELDS),
      include: { stage: true },
    });
    return success(res, deal, 'Deal updated');
  } catch (err) { next(err); }
});

router.put('/deals/:id/move', auditLog('crm.deals', 'deal'), async (req, res, next) => {
  try {
    const existing = await prisma.deal.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Deal not found');
    const { stageId } = req.body;
    const deal = await prisma.deal.update({
      where: { id: req.params.id },
      data: { stageId },
      include: { stage: true },
    });
    return success(res, deal, 'Deal moved');
  } catch (err) { next(err); }
});

router.delete('/deals/:id', auditLog('crm.deals', 'deal'), async (req, res, next) => {
  try {
    const existing = await prisma.deal.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Deal not found');
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

router.post('/companies', auditLog('crm.companies', 'crmCompany'), async (req, res, next) => {
  try {
    if (!req.body.name) return error(res, 'Company name is required', 400);
    const company = await prisma.crmCompany.create({ data: { ...pick(req.body, CRM_COMPANY_WRITABLE_FIELDS), companyId: req.companyId } });
    return created(res, company, 'Company created');
  } catch (err) { next(err); }
});

router.put('/companies/:id', auditLog('crm.companies', 'crmCompany'), async (req, res, next) => {
  try {
    const existing = await prisma.crmCompany.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Company not found');
    const company = await prisma.crmCompany.update({ where: { id: req.params.id }, data: pick(req.body, CRM_COMPANY_WRITABLE_FIELDS) });
    return success(res, company, 'Company updated');
  } catch (err) { next(err); }
});

router.delete('/companies/:id', auditLog('crm.companies', 'crmCompany'), async (req, res, next) => {
  try {
    const existing = await prisma.crmCompany.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Company not found');
    await prisma.crmCompany.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Company deleted');
  } catch (err) { next(err); }
});

module.exports = router;
