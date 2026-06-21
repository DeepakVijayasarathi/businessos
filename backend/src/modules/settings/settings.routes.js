const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany, requirePermission } = require('../../middleware/auth');
const { success, created, notFound } = require('../../utils/response');
const { encrypt } = require('../../utils/helpers');
const { v4: uuidv4 } = require('uuid');

router.use(authenticate, sameCompany, requirePermission('settings.*'));

// Company settings
router.get('/company', async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: {
        id: true, name: true, email: true, phone: true, website: true,
        address: true, city: true, state: true, country: true, zipCode: true,
        logo: true, favicon: true, primaryColor: true, secondaryColor: true,
        timezone: true, currency: true, language: true, industry: true, size: true,
        taxId: true, gstNumber: true, storageType: true,
        smtpHost: true, smtpPort: true, smtpUser: true, smtpFrom: true,
        whatsappPhone: true, whatsappProvider: true, aiProvider: true,
      },
    });
    return success(res, company);
  } catch (err) { next(err); }
});

router.put('/company', async (req, res, next) => {
  try {
    const { smtpPass, whatsappApiKey, openaiKey, anthropicKey, s3Key, s3Secret, ...rest } = req.body;
    const encryptedFields = {};
    if (smtpPass) encryptedFields.smtpPass = encrypt(smtpPass);
    if (whatsappApiKey) encryptedFields.whatsappApiKey = encrypt(whatsappApiKey);
    if (openaiKey) encryptedFields.openaiKey = encrypt(openaiKey);
    if (anthropicKey) encryptedFields.anthropicKey = encrypt(anthropicKey);
    if (s3Key) encryptedFields.s3Key = encrypt(s3Key);
    if (s3Secret) encryptedFields.s3Secret = encrypt(s3Secret);

    const company = await prisma.company.update({
      where: { id: req.companyId },
      data: { ...rest, ...encryptedFields },
    });
    return success(res, { id: company.id, name: company.name }, 'Settings saved');
  } catch (err) { next(err); }
});

// Roles
router.get('/roles', async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      where: { companyId: req.companyId },
      include: { _count: { select: { userRoles: true } } },
    });
    return success(res, roles);
  } catch (err) { next(err); }
});

router.post('/roles', async (req, res, next) => {
  try {
    const { name, permissions = [] } = req.body;
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const role = await prisma.role.create({
      data: { name, slug, companyId: req.companyId, permissions },
    });
    return created(res, role, 'Role created');
  } catch (err) { next(err); }
});

router.put('/roles/:id', async (req, res, next) => {
  try {
    const existing = await prisma.role.findFirst({ where: { id: req.params.id, companyId: req.companyId, isSystem: false } });
    if (!existing) return notFound(res, 'Role not found');
    const role = await prisma.role.update({ where: { id: req.params.id }, data: req.body });
    return success(res, role, 'Role updated');
  } catch (err) { next(err); }
});

router.delete('/roles/:id', async (req, res, next) => {
  try {
    const existing = await prisma.role.findFirst({ where: { id: req.params.id, companyId: req.companyId, isSystem: false } });
    if (!existing) return notFound(res, 'Role not found');
    await prisma.role.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Role deleted');
  } catch (err) { next(err); }
});

// API Keys
router.get('/api-keys', async (req, res, next) => {
  try {
    const keys = await prisma.apiKey.findMany({
      where: { companyId: req.companyId },
      select: { id: true, name: true, key: true, permissions: true, isActive: true, lastUsedAt: true, expiresAt: true, createdAt: true },
    });
    // Mask keys
    const masked = keys.map(k => ({ ...k, key: k.key.substring(0, 8) + '****' }));
    return success(res, masked);
  } catch (err) { next(err); }
});

router.post('/api-keys', async (req, res, next) => {
  try {
    const key = `bos_${uuidv4().replace(/-/g, '')}`;
    const apiKey = await prisma.apiKey.create({
      data: { companyId: req.companyId, name: req.body.name, key, permissions: req.body.permissions || [] },
    });
    return created(res, apiKey, 'API key created — save it now, it will not be shown again');
  } catch (err) { next(err); }
});

router.delete('/api-keys/:id', async (req, res, next) => {
  try {
    const existing = await prisma.apiKey.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'API key not found');
    await prisma.apiKey.delete({ where: { id: req.params.id } });
    return success(res, {}, 'API key deleted');
  } catch (err) { next(err); }
});

// Notifications preferences (GET/PUT for current user)
router.get('/notifications', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { preferences: true } });
    return success(res, user?.preferences || {});
  } catch (err) { next(err); }
});

router.put('/notifications', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { preferences: true } });
    const preferences = { ...(user?.preferences || {}), notifications: req.body };
    await prisma.user.update({ where: { id: req.userId }, data: { preferences } });
    return success(res, preferences, 'Notification preferences saved');
  } catch (err) { next(err); }
});

// Audit log
router.get('/audit', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, module: mod, userId } = req.query;
    const { take, skip } = require('../../utils/helpers').paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(mod && { module: mod }),
      ...(userId && { userId }),
    };
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where, take, skip, orderBy: { createdAt: 'desc' },
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    const { paginateMeta } = require('../../utils/helpers');
    return res.json({ success: true, data: logs, meta: paginateMeta(total, page, limit) });
  } catch (err) { next(err); }
});

module.exports = router;
