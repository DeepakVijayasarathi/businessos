const router = require('express').Router();
const prisma = require('../../../config/prisma');
const { authenticate, sameCompany } = require('../../../middleware/auth');
const { success, created, paginated, notFound, error } = require('../../../utils/response');
const { paginate, paginateMeta, pick } = require('../../../utils/helpers');
const { auditLog } = require('../../../middleware/audit');
const { sendCsv } = require('../../../utils/csv');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

// GET /hr/employees/me/face — return face registration status for the current user
router.get('/me/face', async (req, res, next) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { userId: req.userId, companyId: req.companyId },
      select: { id: true, faceDescriptor: true },
    });
    if (!employee) return notFound(res, 'No employee record found for your account');
    return success(res, {
      id: employee.id,
      descriptor: employee.faceDescriptor || null,
      registered: !!employee.faceDescriptor,
    });
  } catch (err) { next(err); }
});

// POST /hr/employees/me/face — save 128-float face descriptor for the current user
router.post('/me/face', async (req, res, next) => {
  try {
    const { descriptor } = req.body;
    if (!Array.isArray(descriptor) || descriptor.length !== 128 ||
        !descriptor.every(v => typeof v === 'number' && isFinite(v))) {
      return error(res, 'Invalid face descriptor — expected array of 128 finite numbers', 400);
    }
    const employee = await prisma.employee.findFirst({
      where: { userId: req.userId, companyId: req.companyId },
    });
    if (!employee) return notFound(res, 'No employee record found for your account');
    await prisma.employee.update({
      where: { id: employee.id },
      data: { faceDescriptor: descriptor },
    });
    return success(res, {}, 'Face registered successfully');
  } catch (err) { next(err); }
});

// Performance Reviews — must be declared before /:id to avoid route shadowing.
// The PerformanceReview model has: employeeId, reviewerId (plain user id, no
// relation), period, rating, goals (Json), strengths, improvements, comments.
router.get('/performance-reviews', async (req, res, next) => {
  try {
    const { employeeId, page = 1, limit = 20 } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = { employee: { companyId: req.companyId }, ...(employeeId && { employeeId }) };
    const [reviews, total] = await Promise.all([
      prisma.performanceReview.findMany({
        where, take, skip, orderBy: { createdAt: 'desc' },
        include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } },
      }),
      prisma.performanceReview.count({ where }),
    ]);
    // reviewerId has no Prisma relation — resolve names in one query
    const reviewerIds = [...new Set(reviews.map(r => r.reviewerId).filter(Boolean))];
    const reviewers = reviewerIds.length
      ? await prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const reviewerMap = Object.fromEntries(reviewers.map(u => [u.id, u]));
    const shaped = reviews.map(r => ({
      ...r,
      overallRating: r.rating,
      reviewDate: r.createdAt,
      achievements: r.strengths,
      reviewer: reviewerMap[r.reviewerId] || null,
    }));
    return res.json({ success: true, data: shaped, meta: paginateMeta(total, page, limit) });
  } catch (err) { next(err); }
});

router.post('/performance-reviews', async (req, res, next) => {
  try {
    const { employeeId, period } = req.body;
    if (!employeeId) return error(res, 'employeeId is required', 400);
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId: req.companyId } });
    if (!employee) return notFound(res, 'Employee not found');
    const rating = parseFloat(req.body.overallRating ?? req.body.rating);
    const review = await prisma.performanceReview.create({
      data: {
        employeeId,
        reviewerId: req.userId,
        period: period || 'General',
        rating: isFinite(rating) ? rating : 0,
        goals: req.body.goals ? [String(req.body.goals)] : [],
        strengths: req.body.achievements || req.body.strengths || null,
        improvements: req.body.improvements || null,
        comments: req.body.comments || null,
        status: req.body.status || 'submitted',
      },
    });
    return created(res, review, 'Performance review created');
  } catch (err) { next(err); }
});

router.delete('/performance-reviews/:id', async (req, res, next) => {
  try {
    const existing = await prisma.performanceReview.findFirst({
      where: { id: req.params.id, employee: { companyId: req.companyId } },
    });
    if (!existing) return notFound(res, 'Review not found');
    await prisma.performanceReview.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Review deleted');
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

// HTML forms send "" for untouched optional fields — empty strings break
// Prisma FKs (departmentId), Decimals (salary), and DateTimes (endDate).
function normalizeEmployeeInput(data) {
  for (const k of ['departmentId', 'managerId', 'endDate', 'jobTitle', 'nationalId', 'taxId', 'address', 'city', 'country']) {
    if (data[k] === '') data[k] = null;
  }
  if (data.salary === '' || data.salary === undefined) delete data.salary;
  return coerceEmployeeDates(data);
}

router.post('/', auditLog('hr.employees', 'employee'), async (req, res, next) => {
  try {
    let { userId } = req.body;

    // Inline user creation: { newUser: { firstName, lastName, email } }
    if (!userId && req.body.newUser?.email && req.body.newUser?.firstName) {
      const { firstName, lastName, email } = req.body.newUser;
      const existing = await prisma.user.findFirst({ where: { email } });
      if (existing) {
        if (existing.companyId !== req.companyId) return error(res, 'A user with this email already exists in another workspace', 409);
        userId = existing.id;
      } else {
        const tempPw = crypto.randomBytes(10).toString('base64url');
        const hashed = await bcrypt.hash(tempPw, 12);
        const user = await prisma.user.create({
          data: { firstName, lastName: lastName || '', email, password: hashed, companyId: req.companyId },
        });
        userId = user.id;
      }
    }

    if (!userId) return error(res, 'Select an existing user or enter details for a new one', 400);
    if (!req.body.employeeCode) return error(res, 'employeeCode is required', 400);
    if (!req.body.startDate) return error(res, 'startDate is required', 400);

    const alreadyEmployee = await prisma.employee.findFirst({ where: { userId } });
    if (alreadyEmployee) return error(res, 'This user is already registered as an employee', 409);

    const employee = await prisma.employee.create({
      data: { ...normalizeEmployeeInput(pick(req.body, EMPLOYEE_WRITABLE_FIELDS)), userId, companyId: req.companyId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });
    return created(res, employee, 'Employee created');
  } catch (err) { next(err); }
});

router.put('/:id', auditLog('hr.employees', 'employee'), async (req, res, next) => {
  try {
    const existing = await prisma.employee.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Employee not found');
    const data = normalizeEmployeeInput(pick(req.body, EMPLOYEE_WRITABLE_FIELDS));
    delete data.userId; // never re-link an employee to a different user
    const employee = await prisma.employee.update({ where: { id: req.params.id }, data });
    return success(res, employee, 'Employee updated');
  } catch (err) { next(err); }
});

router.delete('/:id', auditLog('hr.employees', 'employee'), async (req, res, next) => {
  try {
    const existing = await prisma.employee.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Employee not found');
    await prisma.employee.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Employee deleted');
  } catch (err) { next(err); }
});

// POST /hr/employees/import — CSV import (creates User + Employee per row)
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return error(res, 'No file uploaded', 400);
    const text = req.file.buffer.toString('utf8');
    const lines = text.split('\n').filter(Boolean);
    if (lines.length < 2) return error(res, 'CSV must have headers + data rows', 400);

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
      const vals = line.match(/(".*?"|[^,]+)(?=,|$)/g) || [];
      return headers.reduce((obj, h, i) => {
        obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim();
        return obj;
      }, {});
    });

    let createdCount = 0, skipped = 0;
    for (const row of rows) {
      const email = row.email;
      const firstName = row.firstName || row.first_name;
      if (!email || !firstName) { skipped++; continue; }
      try {
        // Find or create the user
        let user = await prisma.user.findFirst({ where: { email, companyId: req.companyId } });
        if (!user) {
          const tempPw = crypto.randomBytes(10).toString('base64url');
          const hashed = await bcrypt.hash(tempPw, 12);
          user = await prisma.user.create({
            data: {
              firstName,
              lastName: row.lastName || row.last_name || '',
              email,
              password: hashed,
              companyId: req.companyId,
            },
          });
        }
        // Skip if already an employee
        const existingEmp = await prisma.employee.findFirst({ where: { userId: user.id } });
        if (existingEmp) { skipped++; continue; }

        const code = row.employeeCode || row.employee_code || `EMP-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        await prisma.employee.create({
          data: {
            companyId: req.companyId,
            userId: user.id,
            employeeCode: code,
            jobTitle: row.jobTitle || row.job_title || row.title || null,
            salary: row.salary ? parseFloat(row.salary) : null,
            startDate: row.startDate || row.start_date ? new Date(row.startDate || row.start_date) : new Date(),
            status: 'active',
          },
        });
        createdCount++;
      } catch {
        skipped++;
      }
    }
    return success(res, { created: createdCount, skipped }, `${createdCount} employees imported`);
  } catch (err) { next(err); }
});

module.exports = router;
