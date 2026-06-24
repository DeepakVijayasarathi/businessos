const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../../middleware/auth');
const { success, error } = require('../../utils/response');

const prisma = new PrismaClient();

// GET /okr - list OKRs
router.get('/', auth, async (req, res) => {
  try {
    const { period, type, ownerId } = req.query;
    const where = { companyId: req.user.companyId };
    if (period) where.period = period;
    if (type) where.type = type;
    if (ownerId) where.ownerId = ownerId;

    const okrs = await prisma.oKR.findMany({
      where,
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        keyResults: true,
      },
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
    });

    // Recompute progress from key results
    const enriched = okrs.map(okr => {
      if (okr.keyResults.length === 0) return { ...okr, progress: 0 };
      const avg = okr.keyResults.reduce((s, kr) => s + kr.progress, 0) / okr.keyResults.length;
      return { ...okr, progress: Math.round(avg) };
    });

    return success(res, enriched);
  } catch (e) {
    return error(res, e.message);
  }
});

// POST /okr
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, period, type, startDate, endDate, ownerId } = req.body;
    if (!title || !period || !startDate || !endDate) {
      return error(res, 'Title, period, start and end date are required', 400);
    }
    const okr = await prisma.oKR.create({
      data: {
        companyId: req.user.companyId,
        ownerId: ownerId || req.user.id,
        title, description,
        period,
        type: type || 'company',
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        keyResults: true,
      },
    });
    return success(res, okr, 201);
  } catch (e) {
    return error(res, e.message);
  }
});

// PUT /okr/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.oKR.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return error(res, 'Not found', 404);
    const { title, description, period, type, status, startDate, endDate, ownerId } = req.body;
    const okr = await prisma.oKR.update({
      where: { id: req.params.id },
      data: {
        title, description, period, type, status,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        ownerId: ownerId || undefined,
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
        keyResults: true,
      },
    });
    return success(res, okr);
  } catch (e) {
    return error(res, e.message);
  }
});

// DELETE /okr/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.oKR.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return error(res, 'Not found', 404);
    await prisma.oKR.delete({ where: { id: req.params.id } });
    return success(res, { deleted: true });
  } catch (e) {
    return error(res, e.message);
  }
});

// ─── KEY RESULTS ──────────────────────────────────────────────────────────────

// POST /okr/:okrId/key-results
router.post('/:okrId/key-results', auth, async (req, res) => {
  try {
    const okr = await prisma.oKR.findFirst({ where: { id: req.params.okrId, companyId: req.user.companyId } });
    if (!okr) return error(res, 'OKR not found', 404);
    const { title, type, current, target, unit } = req.body;
    if (!title || !target) return error(res, 'Title and target are required', 400);
    const currentVal = current ? Number(current) : 0;
    const targetVal = Number(target);
    const progress = targetVal > 0 ? Math.min(100, Math.round((currentVal / targetVal) * 100)) : 0;
    const kr = await prisma.keyResult.create({
      data: {
        okrId: req.params.okrId,
        title, unit,
        type: type || 'numeric',
        current: currentVal,
        target: targetVal,
        progress,
      },
    });
    return success(res, kr, 201);
  } catch (e) {
    return error(res, e.message);
  }
});

// PUT /okr/key-results/:id
router.put('/key-results/:id', auth, async (req, res) => {
  try {
    const kr = await prisma.keyResult.findUnique({ where: { id: req.params.id }, include: { okr: true } });
    if (!kr || kr.okr.companyId !== req.user.companyId) return error(res, 'Not found', 404);
    const { title, type, current, target, unit, status } = req.body;
    const currentVal = current !== undefined ? Number(current) : Number(kr.current);
    const targetVal = target !== undefined ? Number(target) : Number(kr.target);
    const progress = targetVal > 0 ? Math.min(100, Math.round((currentVal / targetVal) * 100)) : 0;
    const updated = await prisma.keyResult.update({
      where: { id: req.params.id },
      data: {
        title, type, unit, status,
        current: currentVal,
        target: targetVal,
        progress,
      },
    });
    return success(res, updated);
  } catch (e) {
    return error(res, e.message);
  }
});

// DELETE /okr/key-results/:id
router.delete('/key-results/:id', auth, async (req, res) => {
  try {
    const kr = await prisma.keyResult.findUnique({ where: { id: req.params.id }, include: { okr: true } });
    if (!kr || kr.okr.companyId !== req.user.companyId) return error(res, 'Not found', 404);
    await prisma.keyResult.delete({ where: { id: req.params.id } });
    return success(res, { deleted: true });
  } catch (e) {
    return error(res, e.message);
  }
});

module.exports = router;
