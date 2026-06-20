const router = require('express').Router();
const prisma = require('../../../config/prisma');
const { authenticate, sameCompany } = require('../../../middleware/auth');
const { success, created, paginated, notFound } = require('../../../utils/response');

router.use(authenticate, sameCompany);

// GET attendance for employee or date range
router.get('/', async (req, res, next) => {
  try {
    const { employeeId, startDate, endDate, month, year } = req.query;
    const where = {
      employee: { companyId: req.companyId },
      ...(employeeId && { employeeId }),
      ...(startDate && endDate && { date: { gte: new Date(startDate), lte: new Date(endDate) } }),
      ...(month && year && {
        date: {
          gte: new Date(year, month - 1, 1),
          lt: new Date(year, month, 1),
        },
      }),
    };
    const records = await prisma.attendance.findMany({
      where,
      include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: { date: 'desc' },
    });
    return success(res, records);
  } catch (err) { next(err); }
});

// POST check-in
router.post('/check-in', async (req, res, next) => {
  try {
    const { employeeId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (existing) return success(res, existing, 'Already checked in today');

    const record = await prisma.attendance.create({
      data: { employeeId, date: today, checkIn: new Date(), status: 'present' },
    });
    return created(res, record, 'Checked in successfully');
  } catch (err) { next(err); }
});

// POST check-out
router.post('/check-out', async (req, res, next) => {
  try {
    const { employeeId } = req.body;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const record = await prisma.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (!record) return notFound(res, 'No check-in found for today');
    if (record.checkOut) return success(res, record, 'Already checked out');

    const checkOut = new Date();
    const hoursWorked = (checkOut - record.checkIn) / (1000 * 60 * 60);
    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: { checkOut, hoursWorked: Math.round(hoursWorked * 100) / 100 },
    });
    return success(res, updated, 'Checked out successfully');
  } catch (err) { next(err); }
});

// Bulk mark attendance
router.post('/bulk', async (req, res, next) => {
  try {
    const { records } = req.body; // [{ employeeId, date, status }]
    const created = await prisma.$transaction(
      records.map(r => prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: r.employeeId, date: new Date(r.date) } },
        update: { status: r.status },
        create: { ...r, date: new Date(r.date) },
      }))
    );
    return success(res, created, 'Attendance saved');
  } catch (err) { next(err); }
});

// Leave types
router.get('/leave-types', async (req, res, next) => {
  try {
    const types = await prisma.leaveType.findMany({ where: { companyId: req.companyId } });
    return success(res, types);
  } catch (err) { next(err); }
});

router.post('/leave-types', async (req, res, next) => {
  try {
    const lt = await prisma.leaveType.create({ data: { ...req.body, companyId: req.companyId } });
    return created(res, lt, 'Leave type created');
  } catch (err) { next(err); }
});

// Leave requests
router.get('/leaves', async (req, res, next) => {
  try {
    const { employeeId, status } = req.query;
    const leaves = await prisma.leaveRequest.findMany({
      where: {
        employee: { companyId: req.companyId },
        ...(employeeId && { employeeId }),
        ...(status && { status }),
      },
      include: {
        employee: { include: { user: { select: { firstName: true, lastName: true } } } },
        leaveType: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return success(res, leaves);
  } catch (err) { next(err); }
});

router.post('/leaves', async (req, res, next) => {
  try {
    const { employeeId, leaveTypeId, startDate, endDate, reason } = req.body;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    const leave = await prisma.leaveRequest.create({
      data: { employeeId, leaveTypeId, startDate: start, endDate: end, totalDays, reason },
    });
    return created(res, leave, 'Leave request submitted');
  } catch (err) { next(err); }
});

router.put('/leaves/:id/approve', async (req, res, next) => {
  try {
    const leave = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status: 'approved', approvedById: req.userId, approvedAt: new Date() },
    });
    return success(res, leave, 'Leave approved');
  } catch (err) { next(err); }
});

router.put('/leaves/:id/reject', async (req, res, next) => {
  try {
    const leave = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status: 'rejected', rejectedAt: new Date(), comments: req.body.reason },
    });
    return success(res, leave, 'Leave rejected');
  } catch (err) { next(err); }
});

// Payroll
router.get('/payslips', async (req, res, next) => {
  try {
    const { employeeId, month, year } = req.query;
    const payslips = await prisma.payslip.findMany({
      where: {
        employee: { companyId: req.companyId },
        ...(employeeId && { employeeId }),
        ...(month && { month: parseInt(month) }),
        ...(year && { year: parseInt(year) }),
      },
      include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return success(res, payslips);
  } catch (err) { next(err); }
});

router.get('/payslips/:id/pdf', async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const payslip = await prisma.payslip.findFirst({
      where: { id: req.params.id, employee: { companyId: req.companyId } },
      include: { employee: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } },
    });
    if (!payslip) return notFound(res, 'Payslip not found');

    const company = await prisma.company.findUnique({ where: { id: req.companyId }, select: { name: true, email: true } });
    const monthName = new Date(payslip.year, payslip.month - 1, 1).toLocaleString('default', { month: 'long' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payslip-${monthName}-${payslip.year}.pdf"`);
    doc.pipe(res);

    doc.rect(0, 0, 595, 80).fill('#6366f1');
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('PAYSLIP', 50, 28);
    doc.fontSize(10).font('Helvetica').text(`${monthName} ${payslip.year}`, 50, 55);
    doc.fillColor('#ffffff').fontSize(10).text(company?.name || '', 350, 30, { width: 200, align: 'right' });

    const emp = payslip.employee.user;
    doc.fillColor('#111827').fontSize(11).font('Helvetica-Bold').text('Employee:', 50, 110);
    doc.font('Helvetica').fontSize(10).fillColor('#374151')
      .text(`${emp.firstName} ${emp.lastName}`, 50, 126)
      .text(emp.email || '', 50, 141);

    const rows = [
      ['Basic Salary', payslip.basicSalary],
      ['Allowances', payslip.allowances],
      ['Deductions', `-${payslip.deductions}`],
      ['Tax', `-${payslip.tax}`],
    ];
    let dy = 190;
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text('Earnings & Deductions', 50, dy);
    dy += 25;
    rows.forEach(([label, value]) => {
      doc.fillColor('#6b7280').font('Helvetica').fontSize(10).text(label, 50, dy);
      doc.fillColor('#111827').font('Helvetica').fontSize(10).text(String(value), 450, dy, { width: 95, align: 'right' });
      dy += 20;
    });

    dy += 10;
    doc.moveTo(50, dy).lineTo(545, dy).strokeColor('#e5e7eb').stroke();
    dy += 15;
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text('Net Salary', 50, dy);
    doc.fillColor('#6366f1').font('Helvetica-Bold').fontSize(12).text(String(payslip.netSalary), 450, dy, { width: 95, align: 'right' });

    doc.end();
  } catch (err) { next(err); }
});

router.post('/payslips/generate', async (req, res, next) => {
  try {
    const { employeeIds, month, year } = req.body;
    const employees = await prisma.employee.findMany({
      where: { companyId: req.companyId, id: { in: employeeIds } },
    });

    const payslips = await Promise.all(employees.map(async (emp) => {
      const basic = emp.salary || 0;
      const net = Number(basic);
      return prisma.payslip.upsert({
        where: { employeeId_month_year: { employeeId: emp.id, month, year } },
        update: { basicSalary: basic, netSalary: net, status: 'draft' },
        create: { employeeId: emp.id, month, year, basicSalary: basic, netSalary: net, status: 'draft' },
      });
    }));

    return success(res, payslips, 'Payslips generated');
  } catch (err) { next(err); }
});

// Departments
router.get('/departments', async (req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      where: { companyId: req.companyId },
      include: { _count: { select: { employees: true } }, manager: { select: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: { name: 'asc' },
    });
    return success(res, departments);
  } catch (err) { next(err); }
});

router.post('/departments', async (req, res, next) => {
  try {
    const dept = await prisma.department.create({
      data: { companyId: req.companyId, name: req.body.name, description: req.body.description, managerId: req.body.managerId || null },
    });
    return created(res, dept, 'Department created');
  } catch (err) { next(err); }
});

router.put('/departments/:id', async (req, res, next) => {
  try {
    const dept = await prisma.department.update({ where: { id: req.params.id }, data: req.body });
    return success(res, dept, 'Department updated');
  } catch (err) { next(err); }
});

router.delete('/departments/:id', async (req, res, next) => {
  try {
    await prisma.department.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Department deleted');
  } catch (err) { next(err); }
});

module.exports = router;
