const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  lead: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    groupBy: jest.fn(),
  },
  contact: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  company: { findUnique: jest.fn() },
  auditLog: { create: jest.fn() },
  $transaction: jest.fn(),
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
}));

jest.mock('../../src/middleware/audit', () => ({
  auditLog: () => (req, res, next) => next(),
}));

jest.mock('../../src/services/notification.service', () => ({
  createForRole: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/services/ai.service', () => ({
  callAI: jest.fn(),
}));

const prisma = require('../../src/config/prisma');
const leadsRouter = require('../../src/modules/crm/leads/leads.routes');

const app = express();
app.use(express.json());
app.use('/', leadsRouter);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_LEAD = {
  id: 'lead1', firstName: 'John', lastName: 'Doe', email: 'john@doe.com',
  phone: '555-1234', company: 'ACME', jobTitle: 'CEO', source: 'website',
  status: 'new', score: 0, companyId: 'c1',
};

describe('CRM — Leads', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / — returns paginated leads', async () => {
    prisma.lead.findMany.mockResolvedValue([MOCK_LEAD]);
    prisma.lead.count.mockResolvedValue(1);

    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET / — filters by status and source', async () => {
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);

    await request(app).get('/?status=qualified&source=referral');
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'qualified', source: 'referral' }),
      })
    );
  });

  it('GET /stats — returns total, byStatus, recent', async () => {
    prisma.lead.count.mockResolvedValueOnce(50).mockResolvedValueOnce(5);
    prisma.lead.groupBy.mockResolvedValue([{ status: 'new', _count: 30 }]);

    const res = await request(app).get('/stats');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('byStatus');
    expect(res.body.data).toHaveProperty('recent');
  });

  it('GET /:id — returns lead with activities and tasks', async () => {
    prisma.lead.findFirst.mockResolvedValue({ ...MOCK_LEAD, activities: [], tasks: [] });
    const res = await request(app).get('/lead1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('lead1');
  });

  it('GET /:id — 404 when not found', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/missing');
    expect(res.status).toBe(404);
  });

  it('POST / — creates lead', async () => {
    prisma.lead.create.mockResolvedValue(MOCK_LEAD);
    const res = await request(app).post('/').send({ firstName: 'John', lastName: 'Doe', email: 'john@doe.com' });
    expect(res.status).toBe(201);
    expect(res.body.data.firstName).toBe('John');
  });

  it('POST / — 400 when firstName missing', async () => {
    const res = await request(app).post('/').send({ lastName: 'Doe', email: 'x@x.com' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/first name/i);
  });

  it('PUT /:id — updates lead', async () => {
    prisma.lead.findFirst.mockResolvedValue(MOCK_LEAD);
    prisma.lead.update.mockResolvedValue({ ...MOCK_LEAD, status: 'qualified' });

    const res = await request(app).put('/lead1').send({ status: 'qualified' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('qualified');
  });

  it('PUT /:id — 404 when not found', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/missing').send({ status: 'qualified' });
    expect(res.status).toBe(404);
  });

  it('DELETE /:id — deletes lead', async () => {
    prisma.lead.findFirst.mockResolvedValue(MOCK_LEAD);
    prisma.lead.delete.mockResolvedValue({});

    const res = await request(app).delete('/lead1');
    expect(res.status).toBe(200);
  });

  it('DELETE /:id — 404 when not found', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    const res = await request(app).delete('/missing');
    expect(res.status).toBe(404);
  });

  it('POST /:id/convert — converts lead to contact', async () => {
    prisma.lead.findFirst.mockResolvedValue(MOCK_LEAD);
    const mockContact = { id: 'ct1', firstName: 'John', email: 'john@doe.com' };
    prisma.$transaction.mockImplementation(async (fn) => {
      return fn({
        contact: { create: jest.fn().mockResolvedValue(mockContact) },
        lead: { update: jest.fn().mockResolvedValue({ ...MOCK_LEAD, status: 'converted', contactId: 'ct1' }) },
      });
    });

    const res = await request(app).post('/lead1/convert');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('ct1');
  });

  it('POST /:id/convert — 404 when lead not found', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/missing/convert');
    expect(res.status).toBe(404);
  });
});

describe('CRM — Lead Scoring', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /:id/score — scores based on profile completeness', async () => {
    const { callAI } = require('../../src/services/ai.service');
    prisma.lead.findFirst.mockResolvedValue(MOCK_LEAD);
    prisma.company.findUnique.mockResolvedValue({ anthropicKey: null, openaiKey: null, aiProvider: null });
    callAI.mockRejectedValue(new Error('no key'));
    prisma.lead.update.mockResolvedValue({ ...MOCK_LEAD, score: 70 });

    const res = await request(app).post('/lead1/score');
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBeGreaterThan(0);
  });

  it('POST /:id/score — uses AI score when available', async () => {
    const { callAI } = require('../../src/services/ai.service');
    prisma.lead.findFirst.mockResolvedValue(MOCK_LEAD);
    prisma.company.findUnique.mockResolvedValue({ anthropicKey: null, openaiKey: null, aiProvider: null });
    callAI.mockResolvedValue({ text: '{"score": 85, "reason": "Strong profile"}' });
    prisma.lead.update.mockResolvedValue({ ...MOCK_LEAD, score: 85 });

    const res = await request(app).post('/lead1/score');
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(85);
    expect(res.body.data.reason).toBe('Strong profile');
  });

  it('POST /:id/score — 404 when lead not found', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/missing/score');
    expect(res.status).toBe(404);
  });

  it('POST /score-all — scores all leads (rule-based)', async () => {
    prisma.lead.findMany.mockResolvedValue([MOCK_LEAD, { ...MOCK_LEAD, id: 'lead2', email: null }]);
    prisma.lead.update.mockResolvedValue({});

    const res = await request(app).post('/score-all');
    expect(res.status).toBe(200);
    expect(res.body.data.scored).toBe(2);
    expect(prisma.lead.update).toHaveBeenCalledTimes(2);
  });
});
