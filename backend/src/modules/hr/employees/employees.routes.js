const router = require('express').Router();
const prisma = require('../../../config/prisma');
const { authenticate, sameCompany } = require('../../../middleware/auth');
const { success, created, paginated, notFound } = require('../../../utils/response');
const { paginate, paginateMeta } = require('../../../utils/helpers');

router.use(authenticate, sameCompany);

// Employees
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, departmentId, status } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(departmentId && { departmentId }),
      ...(status && { status }),
      ...(search && { user: { OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]}}),
    };
    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where, take, skip,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true } },
          department: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.employee.count({ where }),
    ]);
    return paginated(res, employees, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatar: true } },
        department: true,
        attendances: { orderBy: { date: 'desc' }, take: 30 },
        leaveRequests: { include: { leaveType: true }, orderBy: { createdAt: 'desc' }, take: 10 },
        payslips: { orderBy: { year: 'desc' }, take: 12 },
      },
    });
    if (!employee) return notFound(res, 'Employee not found');
    return success(res, employee);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const employee = await prisma.employee.create({
      data: { ...req.body, companyId: req.companyId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return created(res, employee, 'Employee created');
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const employee = await prisma.employee.update({ where: { id: req.params.id }, data: req.body });
    return success(res, employee, 'Employee updated');
  } catch (err) { next(err); }
});

// Departments
router.get('/departments/list', async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      where: { companyId: req.companyId },
      include: { _count: { select: { employees: true } } },
    });
    return success(res, departments);
  } catch (err) { next(err); }
});

router.post('/departments', async (req, res, next) => {
  try {
    const dept = await prisma.department.create({
      data: { ...req.body, companyId: req.companyId },
    });
    return created(res, dept, 'Department created');
  } catch (err) { next(err); }
});

// Performance Reviews
router.get('/performance-reviews', async (req, res, next) => {
  try {
    const { employeeId, page = 1, limit = 20 } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = { companyId: req.companyId, ...(employeeId && { employeeId }) };
    const [reviews, total] = await Promise.all([
      prisma.performanceReview.findMany({
        where, take, skip, orderBy: { reviewDate: 'desc' },
        include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } }, reviewer: { select: { firstName: true, lastName: true } } },
      }),
      prisma.performanceReview.count({ where }),
    ]);
    return res.json({ success: true, data: reviews, meta: paginateMeta(total, page, limit) });
  } catch (err) { next(err); }
});

router.post('/performance-reviews', async (req, res, next) => {
  try {
    const review = await prisma.performanceReview.create({
      data: {
        companyId: req.companyId,
        employeeId: req.body.employeeId,
        reviewerId: req.userId,
        reviewDate: new Date(req.body.reviewDate || Date.now()),
        period: req.body.period,
        overallRating: req.body.overallRating ? parseFloat(req.body.overallRating) : null,
        goals: req.body.goals || null,
        achievements: req.body.achievements || null,
        improvements: req.body.improvements || null,
        comments: req.body.comments || null,
        status: req.body.status || 'draft',
      },
    });
    return created(res, review, 'Performance review created');
  } catch (err) { next(err); }
});

router.put('/performance-reviews/:id', async (req, res, next) => {
  try {
    const review = await prisma.performanceReview.update({ where: { id: req.params.id }, data: req.body });
    return success(res, review, 'Review updated');
  } catch (err) { next(err); }
});

router.delete('/performance-reviews/:id', async (req, res, next) => {
  try {
    await prisma.performanceReview.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Review deleted');
  } catch (err) { next(err); }
});

module.exports = router;
