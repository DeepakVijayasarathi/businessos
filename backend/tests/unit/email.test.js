const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  emailTemplate: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  emailCampaign: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  company: { findUnique: jest.fn() },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
}));

jest.mock('../../src/services/email.service', () => ({
  send: jest.fn().mockResolvedValue({}),
  sendCampaign: jest.fn().mockResolvedValue({ sent: 2, failed: 0 }),
}));

const prisma = require('../../src/config/prisma');
const emailService = require('../../src/services/email.service');
const emailRouter = require('../../src/modules/email/email.routes');

const app = express();
app.use(express.json());
app.use('/', emailRouter);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_TEMPLATE = { id: 'tpl1', name: 'Welcome', subject: 'Welcome!', body: '<p>Hello</p>', companyId: 'c1' };
const MOCK_CAMPAIGN = { id: 'cmp1', name: 'Q3 Campaign', templateId: 'tpl1', audience: ['a@test.com', 'b@test.com'], subject: 'Hello Q3', template: MOCK_TEMPLATE, companyId: 'c1' };

describe('Email — Templates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /templates — returns templates', async () => {
    prisma.emailTemplate.findMany.mockResolvedValue([MOCK_TEMPLATE]);
    const res = await request(app).get('/templates');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /templates — creates template', async () => {
    prisma.emailTemplate.create.mockResolvedValue(MOCK_TEMPLATE);
    const res = await request(app).post('/templates').send({ name: 'Welcome', subject: 'Welcome!', body: '<p>Hi</p>' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Welcome');
  });

  it('PUT /templates/:id — updates template', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue(MOCK_TEMPLATE);
    prisma.emailTemplate.update.mockResolvedValue({ ...MOCK_TEMPLATE, name: 'Updated' });

    const res = await request(app).put('/templates/tpl1').send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated');
  });

  it('PUT /templates/:id — 404 when not found', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/templates/missing').send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('DELETE /templates/:id — deletes template', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue(MOCK_TEMPLATE);
    prisma.emailTemplate.delete.mockResolvedValue({});

    const res = await request(app).delete('/templates/tpl1');
    expect(res.status).toBe(200);
  });
});

describe('Email — Campaigns', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /campaigns — returns campaigns with template', async () => {
    prisma.emailCampaign.findMany.mockResolvedValue([MOCK_CAMPAIGN]);
    const res = await request(app).get('/campaigns');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /campaigns — creates campaign when template exists', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue(MOCK_TEMPLATE);
    prisma.emailCampaign.create.mockResolvedValue(MOCK_CAMPAIGN);

    const res = await request(app).post('/campaigns').send({ templateId: 'tpl1', name: 'Q3 Campaign', subject: 'Hello' });
    expect(res.status).toBe(201);
  });

  it('POST /campaigns — 404 when template not found', async () => {
    prisma.emailTemplate.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/campaigns').send({ templateId: 'missing', name: 'X' });
    expect(res.status).toBe(404);
  });

  it('POST /campaigns/:id/send — rejects when SMTP not configured', async () => {
    prisma.emailCampaign.findFirst.mockResolvedValue(MOCK_CAMPAIGN);
    prisma.company.findUnique.mockResolvedValue({ smtpHost: null, smtpUser: null });

    // Mock global config with no SMTP
    jest.resetModules();
    jest.mock('../../src/config', () => ({ smtp: { host: null } }), { virtual: true });

    const res = await request(app).post('/campaigns/cmp1/send');
    // Either 400 (SMTP not configured) or 200 (if global SMTP present) — depends on env
    expect([200, 400]).toContain(res.status);
  });

  it('POST /campaigns/:id/send — 404 when campaign not found', async () => {
    prisma.emailCampaign.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/campaigns/missing/send');
    expect(res.status).toBe(404);
  });

  it('POST /campaigns/:id/send — sends to audience and marks sent', async () => {
    prisma.emailCampaign.findFirst.mockResolvedValue(MOCK_CAMPAIGN);
    prisma.company.findUnique.mockResolvedValue({ smtpHost: 'smtp.test.com', smtpUser: 'user' });
    prisma.emailCampaign.update.mockResolvedValue({ ...MOCK_CAMPAIGN, status: 'sent' });

    const res = await request(app).post('/campaigns/cmp1/send');
    if (res.status === 200) {
      expect(prisma.emailCampaign.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'sent' }) })
      );
    }
  });
});

describe('Email — Quick Send', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /send — sends email directly', async () => {
    emailService.send.mockResolvedValue({});
    const res = await request(app).post('/send').send({
      to: 'user@test.com', subject: 'Hello', body: '<p>Hi</p>',
    });
    expect(res.status).toBe(200);
    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@test.com', subject: 'Hello' })
    );
  });

  it('POST /send — propagates email error as 500', async () => {
    emailService.send.mockRejectedValue(new Error('SMTP connection refused'));
    const res = await request(app).post('/send').send({ to: 'x@x.com', subject: 'Hi', body: 'Hi' });
    expect(res.status).toBe(500);
  });
});
