const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  ticket: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
  },
  comment: { create: jest.fn() },
  ticketCategory: { findMany: jest.fn(), create: jest.fn() },
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

jest.mock('../../src/services/email.service', () => ({ send: jest.fn().mockResolvedValue({}) }));
jest.mock('../../src/services/ai.service', () => ({ callAI: jest.fn() }));

const prisma = require('../../src/config/prisma');
const helpdeskRouter = require('../../src/modules/helpdesk/helpdesk.routes');

const app = express();
app.use(express.json());
app.use('/', helpdeskRouter);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_TICKET = {
  id: 'tkt1', ticketNo: 'TKT-00001', subject: 'Login broken', status: 'open',
  priority: 'high', companyId: 'c1', _count: { comments: 0 },
};

describe('Helpdesk — Tickets', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / — returns paginated tickets', async () => {
    prisma.ticket.findMany.mockResolvedValue([MOCK_TICKET]);
    prisma.ticket.count.mockResolvedValue(1);

    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('GET / — filters by status', async () => {
    prisma.ticket.findMany.mockResolvedValue([]);
    prisma.ticket.count.mockResolvedValue(0);

    await request(app).get('/?status=open');
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'open' }) })
    );
  });

  it('GET /stats — returns grouped counts', async () => {
    prisma.ticket.groupBy.mockResolvedValue([{ status: 'open', _count: 3 }, { status: 'resolved', _count: 10 }]);
    prisma.ticket.count.mockResolvedValue(2);

    const res = await request(app).get('/stats');
    expect(res.status).toBe(200);
    expect(res.body.data.byStatus).toHaveLength(2);
    expect(res.body.data.urgentCount).toBe(2);
  });

  it('GET /:id — returns ticket with comments', async () => {
    prisma.ticket.findFirst.mockResolvedValue({ ...MOCK_TICKET, comments: [] });
    const res = await request(app).get('/tkt1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('tkt1');
  });

  it('GET /:id — 404 when not found', async () => {
    prisma.ticket.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/missing');
    expect(res.status).toBe(404);
  });

  it('POST / — creates ticket with auto ticketNo', async () => {
    prisma.ticket.count.mockResolvedValue(0);
    prisma.ticket.create.mockResolvedValue(MOCK_TICKET);

    const res = await request(app).post('/').send({ subject: 'Login broken', description: 'Cannot login' });
    expect(res.status).toBe(201);
    expect(res.body.data.ticketNo).toBe('TKT-00001');
  });

  it('POST / — 400 when subject missing', async () => {
    const res = await request(app).post('/').send({ description: 'No subject' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/subject/i);
  });

  it('PUT /:id — updates ticket status', async () => {
    prisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET);
    prisma.ticket.update.mockResolvedValue({ ...MOCK_TICKET, status: 'resolved' });

    const res = await request(app).put('/tkt1').send({ status: 'resolved' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('resolved');
  });

  it('PUT /:id — sets resolvedAt when status becomes resolved', async () => {
    prisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET);
    prisma.ticket.update.mockResolvedValue({ ...MOCK_TICKET, status: 'resolved', resolvedAt: new Date() });

    await request(app).put('/tkt1').send({ status: 'resolved' });
    const updateCall = prisma.ticket.update.mock.calls[0][0];
    expect(updateCall.data.resolvedAt).toBeDefined();
  });

  it('POST /:id/comments — adds comment', async () => {
    prisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET);
    prisma.comment.create.mockResolvedValue({ id: 'cmt1', content: 'Working on it', user: {} });

    const res = await request(app).post('/tkt1/comments').send({ content: 'Working on it' });
    expect(res.status).toBe(201);
    expect(res.body.data.content).toBe('Working on it');
  });

  it('POST /:id/comments — 400 on empty content', async () => {
    const res = await request(app).post('/tkt1/comments').send({ content: '   ' });
    expect(res.status).toBe(400);
  });

  it('POST /:id/comments — 404 when ticket not found', async () => {
    prisma.ticket.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/missing/comments').send({ content: 'test' });
    expect(res.status).toBe(404);
  });

  it('GET /categories/list — returns categories', async () => {
    prisma.ticketCategory.findMany.mockResolvedValue([{ id: 'cat1', name: 'Billing' }]);
    const res = await request(app).get('/categories/list');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('Helpdesk — AI Triage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /:id/ai-triage — returns triage result', async () => {
    const { callAI } = require('../../src/services/ai.service');
    prisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET);
    prisma.company.findUnique.mockResolvedValue({ name: 'TestCo', anthropicKey: null, openaiKey: null, aiProvider: 'claude' });
    callAI.mockResolvedValue({ text: '{"priority":"high","sentiment":"frustrated","category":"technical","suggestedReply":"We will fix this.","summary":"Login issue"}' });
    prisma.ticket.update.mockResolvedValue(MOCK_TICKET);
    prisma.auditLog.create.mockResolvedValue({});

    const res = await request(app).post('/tkt1/ai-triage');
    expect(res.status).toBe(200);
    expect(res.body.data.priority).toBe('high');
    expect(res.body.data.suggestedReply).toBeDefined();
  });

  it('POST /:id/ai-triage — falls back gracefully when AI fails', async () => {
    const { callAI } = require('../../src/services/ai.service');
    prisma.ticket.findFirst.mockResolvedValue(MOCK_TICKET);
    prisma.company.findUnique.mockResolvedValue({ name: 'TestCo', anthropicKey: null, openaiKey: null, aiProvider: 'claude' });
    callAI.mockRejectedValue(new Error('API key not configured'));

    const res = await request(app).post('/tkt1/ai-triage');
    expect(res.status).toBe(200);
    expect(res.body.data.suggestedReply).toBeDefined();
  });

  it('POST /:id/ai-triage — auto-escalates to urgent', async () => {
    const { callAI } = require('../../src/services/ai.service');
    const lowTicket = { ...MOCK_TICKET, priority: 'low' };
    prisma.ticket.findFirst.mockResolvedValue(lowTicket);
    prisma.company.findUnique.mockResolvedValue({ name: 'TestCo', anthropicKey: null, openaiKey: null, aiProvider: 'claude' });
    callAI.mockResolvedValue({ text: '{"priority":"urgent","sentiment":"angry","category":"billing","suggestedReply":"We apologize.","summary":"Critical issue"}' });
    prisma.ticket.update.mockResolvedValue({ ...lowTicket, priority: 'urgent' });
    prisma.auditLog.create.mockResolvedValue({});

    const res = await request(app).post('/tkt1/ai-triage');
    expect(res.status).toBe(200);
    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { priority: 'urgent' } })
    );
  });

  it('POST /:id/ai-triage — 404 when ticket not found', async () => {
    prisma.ticket.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/missing/ai-triage');
    expect(res.status).toBe(404);
  });
});
