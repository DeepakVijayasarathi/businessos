const router = require('express').Router();
const prisma = require('../../../config/prisma');
const { authenticate, sameCompany } = require('../../../middleware/auth');
const { success, created, notFound, error } = require('../../../utils/response');

router.use(authenticate, sameCompany);

// GET /hr/departments
router.get('/', async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      where: { companyId: req.companyId },
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    return success(res, departments);
  } catch (err) { next(err); }
});

// POST /hr/departments
router.post('/', async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return error(res, 'Department name is required', 400);
    const dept = await prisma.department.create({
      data: { name: name.trim(), headId: req.body.headId || null, companyId: req.companyId },
    });
    return created(res, dept, 'Department created');
  } catch (err) { next(err); }
});

// PUT /hr/departments/:id
router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.department.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Department not found');
    const dept = await prisma.department.update({
      where: { id: req.params.id },
      data: { ...(req.body.name && { name: req.body.name.trim() }), ...(req.body.headId !== undefined && { headId: req.body.headId || null }) },
    });
    return success(res, dept, 'Department updated');
  } catch (err) { next(err); }
});

// DELETE /hr/departments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.department.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Department not found');
    await prisma.department.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Department deleted');
  } catch (err) { next(err); }
});

module.exports = router;
