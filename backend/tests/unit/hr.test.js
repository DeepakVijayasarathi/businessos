const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  employee: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  attendance: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  department: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
}));

jest.mock('../../src/middleware/audit', () => ({
  auditLog: () => (req, res, next) => next(),
}));

jest.mock('../../src/utils/csv', () => ({
  sendCsv: (res, filename, data, headers) => {
    res.setHeader('Content-Type', 'text/csv');
    res.send(headers.join(','));
  },
}));

const prisma = require('../../src/config/prisma');
const employeesRouter = require('../../src/modules/hr/employees/employees.routes');
const attendanceRouter = require('../../src/modules/hr/attendance/attendance.routes');

const employeeApp = express();
employeeApp.use(express.json());
employeeApp.use('/', employeesRouter);
employeeApp.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const attendanceApp = express();
attendanceApp.use(express.json());
attendanceApp.use('/', attendanceRouter);
attendanceApp.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_EMPLOYEE = {
  id: 'emp1', jobTitle: 'Engineer', status: 'active', companyId: 'c1', userId: 'u1',
  user: { id: 'u1', firstName: 'Alice', lastName: 'Smith', email: 'alice@co.com', avatar: null },
  department: { id: 'dept1', name: 'Engineering' },
};

describe('HR — Employees', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / — returns paginated employees', async () => {
    prisma.employee.findMany.mockResolvedValue([MOCK_EMPLOYEE]);
    prisma.employee.count.mockResolvedValue(1);

    const res = await request(employeeApp).get('/');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('GET / — filters by status', async () => {
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.employee.count.mockResolvedValue(0);

    await request(employeeApp).get('/?status=active');
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'active' }) })
    );
  });

  it('GET /export — returns CSV', async () => {
    prisma.employee.findMany.mockResolvedValue([MOCK_EMPLOYEE]);
    const res = await request(employeeApp).get('/export');
    expect(res.status).toBe(200);
    expect(res.header['content-type']).toMatch(/text\/csv/);
  });

  it('GET /:id — returns employee', async () => {
    prisma.employee.findFirst.mockResolvedValue(MOCK_EMPLOYEE);
    const res = await request(employeeApp).get('/emp1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('emp1');
  });

  it('GET /:id — 404 when not found', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    const res = await request(employeeApp).get('/missing');
    expect(res.status).toBe(404);
  });

  it('POST / — creates employee with required fields', async () => {
    prisma.employee.create.mockResolvedValue(MOCK_EMPLOYEE);
    const res = await request(employeeApp).post('/').send({
      userId: 'u1', employeeCode: 'EMP001', startDate: '2026-01-01', jobTitle: 'Engineer',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.jobTitle).toBe('Engineer');
  });

  it('POST / — 400 when userId missing', async () => {
    const res = await request(employeeApp).post('/').send({ employeeCode: 'EMP001', startDate: '2026-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/userId/i);
  });

  it('POST / — 400 when employeeCode missing', async () => {
    const res = await request(employeeApp).post('/').send({ userId: 'u1', startDate: '2026-01-01' });
    expect(res.status).toBe(400);
  });

  it('PUT /:id — updates employee', async () => {
    prisma.employee.findFirst.mockResolvedValue(MOCK_EMPLOYEE);
    prisma.employee.update.mockResolvedValue({ ...MOCK_EMPLOYEE, jobTitle: 'Senior Engineer' });

    const res = await request(employeeApp).put('/emp1').send({ jobTitle: 'Senior Engineer' });
    expect(res.status).toBe(200);
    expect(res.body.data.jobTitle).toBe('Senior Engineer');
  });
});

describe('HR — Attendance', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / — returns attendance records', async () => {
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'att1', employeeId: 'emp1', date: new Date(), checkIn: new Date(), status: 'present', employee: MOCK_EMPLOYEE },
    ]);
    const res = await request(attendanceApp).get('/');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /check-in — creates attendance record', async () => {
    prisma.employee.findFirst.mockResolvedValue(MOCK_EMPLOYEE);
    prisma.attendance.create.mockResolvedValue({ id: 'att1', employeeId: 'emp1', status: 'present', checkIn: new Date() });

    const res = await request(attendanceApp).post('/check-in');
    expect(res.status).toBe(201);
  });

  it('POST /check-in — 404 when no employee record for user', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    const res = await request(attendanceApp).post('/check-in');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/employee record/i);
  });

  it('POST /check-in — returns 200 when already checked in today', async () => {
    prisma.employee.findFirst.mockResolvedValue(MOCK_EMPLOYEE);
    const dupError = new Error('Unique constraint failed');
    dupError.code = 'P2002';
    prisma.attendance.create.mockRejectedValue(dupError);
    prisma.attendance.findUnique.mockResolvedValue({ id: 'att1', employeeId: 'emp1', checkIn: new Date() });

    const res = await request(attendanceApp).post('/check-in');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already checked in/i);
  });

  it('POST /check-out — updates checkOut time', async () => {
    prisma.employee.findFirst.mockResolvedValue(MOCK_EMPLOYEE);
    prisma.attendance.findUnique.mockResolvedValue({ id: 'att1', employeeId: 'emp1', checkIn: new Date(Date.now() - 3600000), checkOut: null });
    prisma.attendance.update.mockResolvedValue({ id: 'att1', checkOut: new Date() });

    const res = await request(attendanceApp).post('/check-out');
    expect(res.status).toBe(200);
  });

  it('POST /check-out — 404 when no check-in found', async () => {
    prisma.employee.findFirst.mockResolvedValue(MOCK_EMPLOYEE);
    prisma.attendance.findUnique.mockResolvedValue(null);

    const res = await request(attendanceApp).post('/check-out');
    expect(res.status).toBe(404);
  });
});
