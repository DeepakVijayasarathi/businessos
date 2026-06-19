const router = require('express').Router();
const crypto = require('crypto');
const prisma = require('../../config/prisma');
const bcrypt = require('bcryptjs');
const { authenticate, requirePermission, sameCompany } = require('../../middleware/auth');
const { success, created, paginated, notFound, error } = require('../../utils/response');
const { paginate, paginateMeta } = require('../../utils/helpers');

router.use(authenticate, sameCompany);

// GET /users
router.get('/', requirePermission('users.*'), async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, roleId } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(search && { OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]}),
      ...(roleId && { roles: { some: { roleId } } }),
    };
    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, take, skip, include: { roles: { include: { role: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.user.count({ where }),
    ]);
    return paginated(res, users.map(u => { const { password, ...safe } = u; return safe; }), paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

// GET /users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { roles: { include: { role: true } }, employee: true },
    });
    if (!user) return notFound(res, 'User not found');
    const { password, ...safe } = user;
    return success(res, safe);
  } catch (err) { next(err); }
});

// POST /users
router.post('/', requirePermission('users.*'), async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, roleIds = [] } = req.body;
    const tempPassword = password || crypto.randomBytes(12).toString('base64url');
    const hashed = await bcrypt.hash(tempPassword, 12);
    const user = await prisma.user.create({
      data: {
        firstName, lastName, email, password: hashed,
        companyId: req.companyId,
        roles: { create: roleIds.map(rid => ({ roleId: rid })) },
      },
      include: { roles: { include: { role: true } } },
    });
    const { password: _, ...safe } = user;
    return created(
      res,
      { ...safe, tempPassword: !password ? tempPassword : undefined },
      !password ? 'User created with temporary password' : 'User created'
    );
  } catch (err) { next(err); }
});

// PUT /users/:id
router.put('/:id', requirePermission('users.*'), async (req, res, next) => {
  try {
    const { roleIds, ...data } = req.body;
    if (data.password) data.password = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(roleIds && {
          roles: {
            deleteMany: {},
            create: roleIds.map(rid => ({ roleId: rid })),
          },
        }),
      },
      include: { roles: { include: { role: true } } },
    });
    const { password, ...safe } = user;
    return success(res, safe, 'User updated');
  } catch (err) { next(err); }
});

// DELETE /users/:id
router.delete('/:id', requirePermission('users.*'), async (req, res, next) => {
  try {
    if (req.params.id === req.userId) return error(res, 'Cannot delete own account', 400);
    await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
    return success(res, {}, 'User deactivated');
  } catch (err) { next(err); }
});

// GET /users/roles/list
router.get('/roles/list', async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany({ where: { companyId: req.companyId } });
    return success(res, roles);
  } catch (err) { next(err); }
});

// POST /roles
router.post('/roles', requirePermission('roles.*'), async (req, res, next) => {
  try {
    const { name, permissions = [] } = req.body;
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    const role = await prisma.role.create({
      data: { name, slug, companyId: req.companyId, permissions },
    });
    return created(res, role, 'Role created');
  } catch (err) { next(err); }
});

module.exports = router;
