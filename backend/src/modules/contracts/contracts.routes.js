const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../../middleware/auth');
const { success, error } = require('../../utils/response');

const prisma = new PrismaClient();

async function nextContractNo(companyId) {
  const last = await prisma.contract.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    select: { contractNo: true },
  });
  if (!last) return 'CTR-0001';
  const num = parseInt(last.contractNo.replace(/\D/g, ''), 10) || 0;
  return `CTR-${String(num + 1).padStart(4, '0')}`;
}

// GET /contracts
router.get('/', auth, async (req, res) => {
  try {
    const { status, type, search, limit = 50, page = 1 } = req.query;
    const where = { companyId: req.user.companyId };
    if (status) where.status = status;
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { partyName: { contains: search, mode: 'insensitive' } },
        { contractNo: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [contracts, total] = await Promise.all([
      prisma.contract.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: (Number(page) - 1) * Number(limit),
      }),
      prisma.contract.count({ where }),
    ]);
    return success(res, { contracts, total });
  } catch (e) {
    return error(res, e.message);
  }
});

// GET /contracts/expiring - contracts expiring in next N days
router.get('/expiring', auth, async (req, res) => {
  try {
    const days = Number(req.query.days || 30);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    const contracts = await prisma.contract.findMany({
      where: {
        companyId: req.user.companyId,
        status: 'active',
        endDate: { lte: cutoff, gte: new Date() },
      },
      orderBy: { endDate: 'asc' },
    });
    return success(res, contracts);
  } catch (e) {
    return error(res, e.message);
  }
});

// GET /contracts/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const contract = await prisma.contract.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!contract) return error(res, 'Not found', 404);
    return success(res, contract);
  } catch (e) {
    return error(res, e.message);
  }
});

// POST /contracts
router.post('/', auth, async (req, res) => {
  try {
    const { title, type, partyName, partyEmail, value, currency,
            startDate, endDate, autoRenew, renewalNotice, description, tags } = req.body;
    if (!title || !partyName) return error(res, 'Title and party name are required', 400);
    const contractNo = await nextContractNo(req.user.companyId);
    const contract = await prisma.contract.create({
      data: {
        companyId: req.user.companyId,
        title, contractNo,
        type: type || 'client',
        partyName, partyEmail,
        value: value ? Number(value) : null,
        currency: currency || 'USD',
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        autoRenew: autoRenew || false,
        renewalNotice: renewalNotice ? Number(renewalNotice) : null,
        description,
        tags: tags || [],
      },
    });
    return success(res, contract, 201);
  } catch (e) {
    return error(res, e.message);
  }
});

// PUT /contracts/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.contract.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return error(res, 'Not found', 404);
    const { title, type, partyName, partyEmail, value, currency,
            startDate, endDate, status, autoRenew, renewalNotice, description, fileUrl, tags } = req.body;

    let signedAt = existing.signedAt;
    if (status === 'signed' && existing.status !== 'signed') signedAt = new Date();

    const contract = await prisma.contract.update({
      where: { id: req.params.id },
      data: {
        title, type, partyName, partyEmail, status, description, fileUrl, autoRenew,
        value: value !== undefined ? (value ? Number(value) : null) : undefined,
        currency,
        startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : undefined,
        endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : undefined,
        renewalNotice: renewalNotice !== undefined ? (renewalNotice ? Number(renewalNotice) : null) : undefined,
        signedAt,
        tags: tags || undefined,
      },
    });
    return success(res, contract);
  } catch (e) {
    return error(res, e.message);
  }
});

// DELETE /contracts/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.contract.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return error(res, 'Not found', 404);
    await prisma.contract.delete({ where: { id: req.params.id } });
    return success(res, { deleted: true });
  } catch (e) {
    return error(res, e.message);
  }
});

module.exports = router;
