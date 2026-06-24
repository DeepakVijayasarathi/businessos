const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate: auth } = require('../../middleware/auth');
const { success, error } = require('../../utils/response');
const crypto = require('crypto');

const prisma = new PrismaClient();

// GET /api-keys
router.get('/', auth, async (req, res) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { createdAt: 'desc' },
      // Never return the raw key after creation — mask it
      select: {
        id: true, name: true, permissions: true, lastUsedAt: true,
        expiresAt: true, isActive: true, createdAt: true,
        key: true,  // will be masked in response
      },
    });
    const masked = keys.map(k => ({
      ...k,
      key: k.key.slice(0, 8) + '••••••••••••••••' + k.key.slice(-4),
    }));
    return success(res, masked);
  } catch (e) {
    return error(res, e.message);
  }
});

// POST /api-keys - create new key
router.post('/', auth, async (req, res) => {
  try {
    const { name, permissions, expiresAt } = req.body;
    if (!name) return error(res, 'Name is required', 400);
    const rawKey = 'bos_' + crypto.randomBytes(32).toString('hex');
    const apiKey = await prisma.apiKey.create({
      data: {
        companyId: req.user.companyId,
        name,
        key: rawKey,
        permissions: permissions || [],
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    // Return full key only on creation
    return success(res, { ...apiKey }, 201);
  } catch (e) {
    return error(res, e.message);
  }
});

// PUT /api-keys/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.apiKey.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return error(res, 'Not found', 404);
    const { name, permissions, isActive, expiresAt } = req.body;
    const updated = await prisma.apiKey.update({
      where: { id: req.params.id },
      data: {
        name, permissions, isActive,
        expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : undefined,
      },
    });
    return success(res, { ...updated, key: updated.key.slice(0, 8) + '••••••••••••••••' + updated.key.slice(-4) });
  } catch (e) {
    return error(res, e.message);
  }
});

// DELETE /api-keys/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.apiKey.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return error(res, 'Not found', 404);
    await prisma.apiKey.delete({ where: { id: req.params.id } });
    return success(res, { deleted: true });
  } catch (e) {
    return error(res, e.message);
  }
});

module.exports = router;
