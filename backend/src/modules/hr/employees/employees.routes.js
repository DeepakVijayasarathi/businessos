const router = require('express').Router();
const prisma = require('../../../config/prisma');
const { authenticate, sameCompany } = require('../../../middleware/auth');
const { success, created, paginated, notFound, error } = require('../../../utils/response');
const { paginate, paginateMeta, pick } = require('../../../utils/helpers');
const { auditLog } = require('../../../middleware/audit');
const { sendCsv } = require('../../../utils/csv');

router.use(authenticate, sameCompany);

const EMPLOYEE_WRITABLE_FIELDS = [
  'userId', 'employeeCode', 'departmentId', 'managerId', 'jobTitle', 'jobType', 'status',
  'startDate', 'endDate', 'salary', 'salaryType', 'currency', 'bankName', 'bankAccount',
  'bankRoutingNo', 'nationalId', 'taxId', 'emergencyContact', 'address', 'city', 'country',
  'skills', 'customFields',
];

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

// GET /hr/employees/export — CSV export (must precede /:id)
router.get('/export', async (req, res, next) => {
  try {
    const { search, departmentId, status } = req.query;
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
    const employees = await prisma.employee.findMany({
      where,
      include: {
        user: { select: { firstName: true, lastName: true, email: true } },
        department: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    sendCsv(res, 'employees.csv', employees, [
      { key: 'firstName', label: 'firstName', accessor: (e) => e.user?.firstName },
      { key: 'lastName', label: 'lastName', accessor: (e) => e.user?.lastName },
      { key: 'email', label: 'email', accessor: (e) => e.user?.email },
      { key: 'employeeCode', label: 'employeeCode' },
      { key: 'department', label: 'department', accessor: (e) => e.department?.name },
      { key: 'jobTitle', label: 'jobTitle' },
      { key: 'status', label: 'status' },
      { key: 'startDate', label: 'startDate' },
      { key: 'createdAt', label: 'createdAt' },
    ]);
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

// HTML date inputs (and most API clients) send plain "YYYY-MM-DD" strings,
// which Prisma's DateTime fields reject outright ("premature end of input,
// expected ISO-8601 DateTime") — coerce before writing.
function coerceEmployeeDates(data) {
  if (data.startDate) data.startDate = new Date(data.startDate);
  if (data.endDate) data.endDate = new Date(data.endDate);
  return data;
}

router.post('/', auditLog('hr.employees', 'employee'), async (req, res, next) => {
  try {
    if (!req.body.userId) return error(res, 'userId is required', 400);
    if (!req.body.employeeCode) return error(res, 'employeeCode is required', 400);
    if (!req.body.startDate) return error(res, 'startDate is required', 400);
    const employee = await prisma.employee.create({
      data: { ...coerceEmployeeDates(pick(req.body, EMPLOYEE_WRITABLE_FIELDS)), companyId: req.companyId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return created(res, employee, 'Employee created');
  } catch (err) { next(err); }
});

router.put('/:id', auditLog('hr.employees', 'employee'), async (req, res, next) => {
  try {
    const existing = await prisma.employee.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Employee not found');
    const employee = await prisma.employee.update({ where: { id: req.params.id }, data: coerceEmployeeDates(pick(req.body, EMPLOYEE_WRITABLE_FIELDS)) });
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
    const existing = await prisma.performanceReview.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Review not found');
    const review = await prisma.performanceReview.update({ where: { id: req.params.id }, data: req.body });
    return success(res, review, 'Review updated');
  } catch (err) { next(err); }
});

router.delete('/performance-reviews/:id', async (req, res, next) => {
  try {
    const existing = await prisma.performanceReview.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Review not found');
    await prisma.performanceReview.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Review deleted');
  } catch (err) { next(err); }
});

module.exports = router;
