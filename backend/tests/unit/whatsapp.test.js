const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  whatsappTemplate: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  whatsappCampaign: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  whatsappMessage: {
    findMany: jest.fn(),
    create: jest.fn().mockResolvedValue({ id: 'msg1' }),
  },
  conversation: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  company: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
}));

jest.mock('../../src/services/whatsapp.service', () => ({
  sendTemplate: jest.fn().mockResolvedValue({ messageId: 'wamid.123' }),
  sendText: jest.fn().mockResolvedValue({ messageId: 'wamid.456' }),
}));

const prisma = require('../../src/config/prisma');
const whatsappService = require('../../src/services/whatsapp.service');
const whatsappRouter = require('../../src/modules/whatsapp/whatsapp.routes');

const app = express();
app.use(express.json());
app.use('/', whatsappRouter);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_TEMPLATE = { id: 'tpl1', name: 'welcome_template', language: 'en', content: 'Hello {{1}}', companyId: 'c1' };
const MOCK_CAMPAIGN = {
  id: 'cmp1', name: 'Welcome', templateId: 'tpl1', audience: ['+1234567890', '+9876543210'],
  template: MOCK_TEMPLATE, companyId: 'c1',
};

describe('WhatsApp — Webhook (public)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /webhook — accepts Meta payload and returns ok', async () => {
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.whatsappMessage.create.mockResolvedValue({ id: 'msg1' });

    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: '15550001234' },
            messages: [{ id: 'wamid.abc', from: '+9999999999', type: 'text', text: { body: 'Hello' } }],
          },
        }],
      }],
    };
    const res = await request(app).post('/webhook').send(payload);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /webhook — handles empty entry array gracefully', async () => {
    const res = await request(app).post('/webhook').send({ object: 'whatsapp_business_account', entry: [] });
    expect(res.status).toBe(200);
  });

  it('POST /webhook — ignores non-WhatsApp objects', async () => {
    const res = await request(app).post('/webhook').send({ object: 'page', entry: [] });
    expect(res.status).toBe(200);
  });

  it('POST /webhook/msg91 — accepts MSG91 payload', async () => {
    prisma.company.findFirst.mockResolvedValue(null);
    prisma.whatsappMessage.create.mockResolvedValue({ id: 'msg1' });

    const res = await request(app).post('/webhook/msg91').send({
      from: '+1234567890',
      to: '+0987654321',
      type: 'text',
      message: 'Hello from MSG91',
      id: 'msg91-id-123',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /webhook/msg91 — ignores malformed payload (no from)', async () => {
    const res = await request(app).post('/webhook/msg91').send({ to: '+0987654321' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ignored');
  });

  it('POST /webhook — saves inbound message to DB', async () => {
    prisma.company.findFirst.mockResolvedValue({ id: 'c1' });
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({ id: 'conv1' });
    prisma.whatsappMessage.create.mockResolvedValue({ id: 'msg1' });

    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: '15550001234' },
            messages: [{ id: 'wamid.xyz', from: '+9999999999', type: 'text', text: { body: 'Hi there' } }],
          },
        }],
      }],
    };
    await request(app).post('/webhook').send(payload);
    expect(prisma.whatsappMessage.create).toHaveBeenCalled();
  });
});

describe('WhatsApp — Templates (authenticated)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /templates — returns templates', async () => {
    prisma.whatsappTemplate.findMany.mockResolvedValue([MOCK_TEMPLATE]);
    const res = await request(app).get('/templates');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /templates — creates template accepting body or content field', async () => {
    prisma.whatsappTemplate.create.mockResolvedValue(MOCK_TEMPLATE);
    const res = await request(app).post('/templates').send({ name: 'welcome_template', body: 'Hello {{1}}', language: 'en' });
    expect(res.status).toBe(201);
    expect(prisma.whatsappTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ content: 'Hello {{1}}' }) })
    );
  });

  it('PUT /templates/:id — updates template', async () => {
    prisma.whatsappTemplate.findFirst.mockResolvedValue(MOCK_TEMPLATE);
    prisma.whatsappTemplate.update.mockResolvedValue({ ...MOCK_TEMPLATE, name: 'updated_template' });

    const res = await request(app).put('/templates/tpl1').send({ name: 'updated_template' });
    expect(res.status).toBe(200);
  });

  it('PUT /templates/:id — 404 when not found', async () => {
    prisma.whatsappTemplate.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/templates/missing').send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('WhatsApp — Campaigns', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /campaigns — creates campaign', async () => {
    prisma.whatsappCampaign.create.mockResolvedValue(MOCK_CAMPAIGN);
    const res = await request(app).post('/campaigns').send({ name: 'Welcome', templateId: 'tpl1' });
    expect(res.status).toBe(201);
  });

  it('POST /campaigns/:id/send — sends to all recipients', async () => {
    prisma.whatsappCampaign.findFirst.mockResolvedValue(MOCK_CAMPAIGN);
    prisma.company.findUnique.mockResolvedValue({ whatsappApiKey: 'key123', whatsappPhone: '15551234', whatsappProvider: 'meta' });
    prisma.whatsappCampaign.update.mockResolvedValue({ ...MOCK_CAMPAIGN, status: 'sent' });

    const res = await request(app).post('/campaigns/cmp1/send');
    expect(res.status).toBe(200);
    expect(whatsappService.sendTemplate).toHaveBeenCalledTimes(2);
    expect(res.body.data.sent).toBe(2);
    expect(res.body.data.failed).toBe(0);
  });

  it('POST /campaigns/:id/send — 400 when WhatsApp not configured', async () => {
    prisma.whatsappCampaign.findFirst.mockResolvedValue(MOCK_CAMPAIGN);
    prisma.company.findUnique.mockResolvedValue({ whatsappApiKey: null });

    const res = await request(app).post('/campaigns/cmp1/send');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not configured/i);
  });

  it('POST /campaigns/:id/send — counts failed sends', async () => {
    prisma.whatsappCampaign.findFirst.mockResolvedValue(MOCK_CAMPAIGN);
    prisma.company.findUnique.mockResolvedValue({ whatsappApiKey: 'key123', whatsappPhone: '15551234', whatsappProvider: 'meta' });
    whatsappService.sendTemplate
      .mockResolvedValueOnce({ messageId: 'wamid.ok' })
      .mockRejectedValueOnce(new Error('Invalid phone'));
    prisma.whatsappCampaign.update.mockResolvedValue({});

    const res = await request(app).post('/campaigns/cmp1/send');
    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(1);
    expect(res.body.data.failed).toBe(1);
  });

  it('POST /campaigns/:id/send — 404 when campaign not found', async () => {
    prisma.whatsappCampaign.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/campaigns/missing/send');
    expect(res.status).toBe(404);
  });
});

describe('WhatsApp — Direct Message', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /send — sends message', async () => {
    prisma.company.findUnique.mockResolvedValue({ whatsappApiKey: 'key', whatsappPhone: '15551234', whatsappProvider: 'meta' });
    prisma.conversation.findFirst.mockResolvedValue(null);
    prisma.conversation.create.mockResolvedValue({ id: 'conv1' });
    prisma.whatsappMessage.create.mockResolvedValue({ id: 'msg1', content: 'Hello' });

    const res = await request(app).post('/send').send({ to: '+9876543210', message: 'Hello' });
    expect(res.status).toBe(200);
    expect(whatsappService.sendText).toHaveBeenCalled();
  });

  it('POST /send — 400 when WhatsApp not configured', async () => {
    prisma.company.findUnique.mockResolvedValue({ whatsappApiKey: null });
    const res = await request(app).post('/send').send({ to: '+9876543210', message: 'Hi' });
    expect(res.status).toBe(400);
  });
});
