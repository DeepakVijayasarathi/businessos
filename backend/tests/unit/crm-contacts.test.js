const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  contact: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  deal: { findMany: jest.fn() },
  ticket: { findMany: jest.fn() },
  invoice: { findMany: jest.fn() },
  activity: { findMany: jest.fn() },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
}));

jest.mock('../../src/middleware/audit', () => ({
  auditLog: () => (req, res, next) => next(),
}));

const prisma = require('../../src/config/prisma');
const router = require('../../src/modules/crm/contacts/contacts.routes');

const app = express();
app.use(express.json());
app.use('/', router);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_CONTACT = {
  id: 'ct1', firstName: 'Bob', lastName: 'Smith', email: 'bob@example.com',
  phone: '+1-555-0002', companyId: 'c1', crmCompany: null, createdAt: new Date(),
};

describe('CRM Contacts — List & Filter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / — returns paginated contacts', async () => {
    prisma.contact.findMany.mockResolvedValue([MOCK_CONTACT]);
    prisma.contact.count.mockResolvedValue(1);
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('GET / — filters by status', async () => {
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.contact.count.mockResolvedValue(0);
    await request(app).get('/?status=active');
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'active' }) })
    );
  });

  it('GET / — filters by crmCompanyId', async () => {
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.contact.count.mockResolvedValue(0);
    await request(app).get('/?crmCompanyId=crm-co-1');
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ crmCompanyId: 'crm-co-1' }) })
    );
  });

  it('GET / — supports search across name and email', async () => {
    prisma.contact.findMany.mockResolvedValue([]);
    prisma.contact.count.mockResolvedValue(0);
    await request(app).get('/?search=bob');
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });
});

describe('CRM Contacts — CRUD', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /:id — returns full contact with relations', async () => {
    prisma.contact.findFirst.mockResolvedValue({
      ...MOCK_CONTACT, deals: [], activities: [], appointments: [],
    });
    const res = await request(app).get('/ct1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('ct1');
  });

  it('GET /:id — 404 when not found', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/missing');
    expect(res.status).toBe(404);
  });

  it('POST / — creates contact', async () => {
    prisma.contact.create.mockResolvedValue(MOCK_CONTACT);
    const res = await request(app).post('/').send({ firstName: 'Bob', lastName: 'Smith', email: 'bob@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.data.firstName).toBe('Bob');
  });

  it('POST / — injects companyId from auth context', async () => {
    prisma.contact.create.mockResolvedValue(MOCK_CONTACT);
    await request(app).post('/').send({ firstName: 'Bob' });
    expect(prisma.contact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ companyId: 'c1' }),
    }));
  });

  it('PUT /:id — updates contact', async () => {
    prisma.contact.findFirst.mockResolvedValue(MOCK_CONTACT);
    prisma.contact.update.mockResolvedValue({ ...MOCK_CONTACT, firstName: 'Robert' });
    const res = await request(app).put('/ct1').send({ firstName: 'Robert' });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('Robert');
  });

  it('PUT /:id — 404 when not found', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/missing').send({ firstName: 'X' });
    expect(res.status).toBe(404);
  });

  it('DELETE /:id — deletes contact', async () => {
    prisma.contact.findFirst.mockResolvedValue(MOCK_CONTACT);
    prisma.contact.delete.mockResolvedValue({});
    const res = await request(app).delete('/ct1');
    expect(res.status).toBe(200);
  });

  it('DELETE /:id — 404 when not found', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);
    const res = await request(app).delete('/missing');
    expect(res.status).toBe(404);
  });
});

describe('CRM Contacts — Timeline', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /:id/timeline — returns ordered timeline', async () => {
    prisma.contact.findFirst.mockResolvedValue(MOCK_CONTACT);
    prisma.deal.findMany.mockResolvedValue([{ id: 'd1', name: 'Deal A', value: 5000, status: 'open', createdAt: new Date(), updatedAt: new Date() }]);
    prisma.ticket.findMany.mockResolvedValue([]);
    prisma.invoice.findMany.mockResolvedValue([]);
    prisma.activity.findMany.mockResolvedValue([]);

    const res = await request(app).get('/ct1/timeline');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('contact');
    expect(res.body.data).toHaveProperty('timeline');
    expect(res.body.data).toHaveProperty('stats');
    expect(res.body.data.stats.deals).toBe(1);
  });

  it('GET /:id/timeline — 404 when contact not found', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/missing/timeline');
    expect(res.status).toBe(404);
  });

  it('GET /:id/timeline — skips email-based queries when contact has no email', async () => {
    prisma.contact.findFirst.mockResolvedValue({ ...MOCK_CONTACT, email: null });
    prisma.deal.findMany.mockResolvedValue([]);
    prisma.activity.findMany.mockResolvedValue([]);

    const res = await request(app).get('/ct1/timeline');
    expect(res.status).toBe(200);
    expect(res.body.data.stats.tickets).toBe(0);
    expect(res.body.data.stats.invoices).toBe(0);
  });
});
