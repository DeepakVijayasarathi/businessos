const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  invoice: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
  },
  expense: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  income: {
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
  },
  company: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
}));

jest.mock('../../src/middleware/audit', () => ({
  auditLog: () => (req, res, next) => next(),
}));

jest.mock('../../src/services/email.service', () => ({
  sendInvoice: jest.fn().mockResolvedValue({}),
}));

const prisma = require('../../src/config/prisma');
const financeRouter = require('../../src/modules/finance/finance.routes');

const app = express();
app.use(express.json());
app.use('/', financeRouter);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_INVOICE = { id: 'inv1', invoiceNo: 'INV-00001', clientName: 'ACME', clientEmail: 'acme@test.com', total: 1000, status: 'draft', companyId: 'c1' };
const MOCK_EXPENSE = { id: 'exp1', title: 'Office Supplies', category: 'office', amount: 50, date: new Date().toISOString(), companyId: 'c1' };

describe('Finance — Invoices', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /invoices — returns paginated list', async () => {
    prisma.invoice.findMany.mockResolvedValue([MOCK_INVOICE]);
    prisma.invoice.count.mockResolvedValue(1);

    const res = await request(app).get('/invoices');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('GET /invoices — filters by status', async () => {
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.invoice.count.mockResolvedValue(0);

    const res = await request(app).get('/invoices?status=paid');
    expect(res.status).toBe(200);
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'paid' }) })
    );
  });

  it('GET /invoices/summary — returns aggregated totals, nulls become 0', async () => {
    const emptyAgg = { _sum: { total: null }, _count: 0 };
    prisma.invoice.aggregate.mockResolvedValue(emptyAgg);

    const res = await request(app).get('/invoices/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.paid._sum.total).toBe(0);
    expect(res.body.data.pending._sum.total).toBe(0);
  });

  it('GET /invoices/:id — returns invoice', async () => {
    prisma.invoice.findFirst.mockResolvedValue(MOCK_INVOICE);
    const res = await request(app).get('/invoices/inv1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('inv1');
  });

  it('GET /invoices/:id — 404 when not found', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/invoices/missing');
    expect(res.status).toBe(404);
  });

  it('POST /invoices — creates invoice with auto-number', async () => {
    prisma.invoice.count.mockResolvedValue(0);
    prisma.invoice.create.mockResolvedValue({ ...MOCK_INVOICE, invoiceNo: 'INV-00001' });

    const res = await request(app).post('/invoices').send({ clientName: 'ACME', total: 1000 });
    expect(res.status).toBe(201);
    expect(res.body.data.invoiceNo).toBe('INV-00001');
  });

  it('POST /invoices — 400 when clientName missing', async () => {
    const res = await request(app).post('/invoices').send({ total: 1000 });
    expect(res.status).toBe(400);
  });

  it('POST /invoices — 400 when total missing', async () => {
    const res = await request(app).post('/invoices').send({ clientName: 'ACME' });
    expect(res.status).toBe(400);
  });

  it('POST /invoices/:id/send — marks as sent', async () => {
    prisma.invoice.findFirst.mockResolvedValue(MOCK_INVOICE);
    prisma.invoice.update.mockResolvedValue({ ...MOCK_INVOICE, status: 'sent' });

    const res = await request(app).post('/invoices/inv1/send');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('sent');
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'sent' } })
    );
  });

  it('POST /invoices/:id/mark-paid — sets status paid + paidAt', async () => {
    prisma.invoice.findFirst.mockResolvedValue(MOCK_INVOICE);
    prisma.invoice.update.mockResolvedValue({ ...MOCK_INVOICE, status: 'paid', paidAt: new Date() });

    const res = await request(app).post('/invoices/inv1/mark-paid');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('paid');
  });

  it('PUT /invoices/:id — updates invoice', async () => {
    prisma.invoice.findFirst.mockResolvedValue(MOCK_INVOICE);
    prisma.invoice.update.mockResolvedValue({ ...MOCK_INVOICE, clientName: 'Updated Corp' });

    const res = await request(app).put('/invoices/inv1').send({ clientName: 'Updated Corp' });
    expect(res.status).toBe(200);
    expect(res.body.data.clientName).toBe('Updated Corp');
  });

  it('PUT /invoices/:id — 404 when not found', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/invoices/missing').send({ clientName: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('Finance — Expenses', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /expenses — returns list', async () => {
    prisma.expense.findMany.mockResolvedValue([MOCK_EXPENSE]);
    prisma.expense.count.mockResolvedValue(1);

    const res = await request(app).get('/expenses');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /expenses — creates expense', async () => {
    prisma.expense.create.mockResolvedValue(MOCK_EXPENSE);
    const res = await request(app).post('/expenses').send({
      title: 'Office Supplies', category: 'office', amount: 50, date: new Date().toISOString(),
    });
    expect(res.status).toBe(201);
  });

  it('POST /expenses — 400 when title missing', async () => {
    const res = await request(app).post('/expenses').send({ category: 'office', amount: 50, date: new Date() });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('POST /expenses — 400 when amount missing', async () => {
    const res = await request(app).post('/expenses').send({ title: 'X', category: 'office', date: new Date() });
    expect(res.status).toBe(400);
  });

  it('PUT /expenses/:id — updates expense', async () => {
    prisma.expense.findFirst.mockResolvedValue(MOCK_EXPENSE);
    prisma.expense.update.mockResolvedValue({ ...MOCK_EXPENSE, amount: 75 });

    const res = await request(app).put('/expenses/exp1').send({ amount: 75 });
    expect(res.status).toBe(200);
    expect(res.body.data.amount).toBe(75);
  });
});
