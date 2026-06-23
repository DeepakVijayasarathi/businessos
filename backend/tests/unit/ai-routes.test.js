const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

// Mock Anthropic and OpenAI before any require
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: 'AI response text' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    },
  }));
});

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'OpenAI response' } }],
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
      },
    },
  }));
});

jest.mock('../../src/config/prisma', () => ({
  company: { findUnique: jest.fn() },
  lead: { findFirst: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  deal: { count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: { value: null }, _count: 0 }) },
  ticket: { count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _avg: {} }) },
  employee: { count: jest.fn().mockResolvedValue(5) },
  invoice: { aggregate: jest.fn().mockResolvedValue({ _sum: { total: null } }), count: jest.fn().mockResolvedValue(0) },
  aiAgent: { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  aiConversation: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  aiMessage: { createMany: jest.fn() },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
}));

jest.mock('../../src/config', () => ({
  ai: {
    provider: 'claude',
    anthropicKey: 'test-anthropic-key',
    openaiKey: 'test-openai-key',
    claudeModel: 'claude-3-haiku-20240307',
    openaiModel: 'gpt-4o-mini',
    maxTokens: 1024,
  },
  jwt: { secret: process.env.JWT_SECRET || 'test-secret' },
  smtp: { host: '', user: '', pass: '', from: '' },
  app: { env: 'test', port: 3000, clientUrl: 'http://localhost:3001' },
}));

jest.mock('../../src/utils/helpers', () => {
  const real = jest.requireActual('../../src/utils/helpers');
  return { ...real, decrypt: (v) => v };
});

const prisma = require('../../src/config/prisma');
const router = require('../../src/modules/ai/ai.routes');

const app = express();
app.use(express.json());
app.use('/', router);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_COMPANY = { id: 'c1', name: 'TestCo', anthropicKey: 'enc-key', openaiKey: null, aiProvider: 'claude' };

describe('AI Routes — Chat', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /chat — sends message and saves conversation', async () => {
    prisma.company.findUnique.mockResolvedValue(MOCK_COMPANY);
    prisma.aiConversation.findFirst.mockResolvedValue(null);
    prisma.aiConversation.create.mockResolvedValue({ id: 'conv1' });
    prisma.aiMessage.createMany.mockResolvedValue({});

    const res = await request(app).post('/chat').send({
      message: 'Hello!', sessionId: 'sess-1', type: 'support',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('AI response text');
    expect(res.body.data.conversationId).toBe('conv1');
    expect(prisma.aiMessage.createMany).toHaveBeenCalled();
  });

  it('POST /chat — reuses existing conversation', async () => {
    prisma.company.findUnique.mockResolvedValue(MOCK_COMPANY);
    prisma.aiConversation.findFirst.mockResolvedValue({ id: 'conv-existing' });
    prisma.aiMessage.createMany.mockResolvedValue({});

    const res = await request(app).post('/chat').send({ message: 'Hi again', sessionId: 'sess-1' });
    expect(res.status).toBe(200);
    expect(res.body.data.conversationId).toBe('conv-existing');
    expect(prisma.aiConversation.create).not.toHaveBeenCalled();
  });

  it('POST /chat — uses custom agent system prompt', async () => {
    prisma.company.findUnique.mockResolvedValue(MOCK_COMPANY);
    prisma.aiAgent.findUnique.mockResolvedValue({ id: 'ag1', systemPrompt: 'You are a sales bot.' });
    prisma.aiConversation.findFirst.mockResolvedValue({ id: 'conv1' });
    prisma.aiMessage.createMany.mockResolvedValue({});

    const res = await request(app).post('/chat').send({ message: 'Help', sessionId: 's', agentId: 'ag1' });
    expect(res.status).toBe(200);
  });
});

describe('AI Routes — Lead Qualification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /qualify-lead — returns score and updates lead', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: '{"score":85,"grade":"A","reasoning":"Strong fit","nextActions":["Follow up"]}' }],
          usage: { input_tokens: 50, output_tokens: 30 },
        }),
      },
    }));

    prisma.lead.findFirst.mockResolvedValue({
      id: 'lead1', firstName: 'Jane', lastName: 'Doe', company: 'ACME', jobTitle: 'CTO',
      source: 'website', status: 'new', activities: [], notes: null, companyId: 'c1',
    });
    prisma.lead.update.mockResolvedValue({});
    // No company lookup needed for qualify-lead (uses global config)
    prisma.company.findUnique.mockResolvedValue(MOCK_COMPANY);

    const res = await request(app).post('/qualify-lead').send({ leadId: 'lead1' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('score');
    expect(prisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({ data: { score: expect.any(Number) } }));
  });

  it('POST /qualify-lead — gracefully handles malformed AI JSON', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: 'Not JSON at all' }],
          usage: { input_tokens: 10, output_tokens: 10 },
        }),
      },
    }));

    prisma.lead.findFirst.mockResolvedValue({
      id: 'lead1', firstName: 'X', lastName: 'Y', activities: [], companyId: 'c1',
    });
    prisma.lead.update.mockResolvedValue({});

    const res = await request(app).post('/qualify-lead').send({ leadId: 'lead1' });
    expect(res.status).toBe(200);
    expect(res.body.data.score).toBe(50);
  });

  it('POST /qualify-lead — 404 when lead not found', async () => {
    prisma.lead.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/qualify-lead').send({ leadId: 'missing' });
    expect(res.status).toBe(404);
  });
});

describe('AI Routes — Utility Endpoints', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /summarize — returns summary', async () => {
    const res = await request(app).post('/summarize').send({ content: 'Long text here...', type: 'ticket' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('summary');
  });

  it('POST /reply-suggestion — returns reply text', async () => {
    prisma.company.findUnique.mockResolvedValue(MOCK_COMPANY);
    const res = await request(app).post('/reply-suggestion').send({ context: 'Customer complaint', type: 'support' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('reply');
  });

  it('POST /email-draft — parses subject and body from AI response', async () => {
    const Anthropic = require('@anthropic-ai/sdk');
    Anthropic.mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ text: 'Subject: Welcome aboard!\n\nBody: Thanks for signing up.' }],
          usage: { input_tokens: 10, output_tokens: 30 },
        }),
      },
    }));

    const res = await request(app).post('/email-draft').send({
      purpose: 'Welcome new user', recipient: 'jane@acme.com', context: 'Just signed up',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.subject).toBe('Welcome aboard!');
    expect(res.body.data.body).toContain('Thanks for signing up');
  });
});

describe('AI Routes — Intelligence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.lead.findFirst.mockResolvedValue(null);
  });

  it('GET /intelligence — returns health score and insights', async () => {
    // Mock all the parallel DB queries
    const zeroCount = 0;
    const zeroAgg = { _sum: { total: null, value: null }, _count: 0, _avg: {} };
    jest.spyOn(prisma.lead, 'count').mockResolvedValue(zeroCount);
    jest.spyOn(prisma.deal, 'count').mockResolvedValue(zeroCount);
    jest.spyOn(prisma.deal, 'aggregate').mockResolvedValue(zeroAgg);
    jest.spyOn(prisma.ticket, 'count').mockResolvedValue(zeroCount);
    jest.spyOn(prisma.invoice, 'aggregate').mockResolvedValue(zeroAgg);
    jest.spyOn(prisma.invoice, 'count').mockResolvedValue(zeroCount);
    jest.spyOn(prisma.employee, 'count').mockResolvedValue(5);
    prisma.company.findUnique.mockResolvedValue(MOCK_COMPANY);

    const res = await request(app).get('/intelligence');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('healthScore');
    expect(res.body.data).toHaveProperty('insights');
    expect(typeof res.body.data.healthScore).toBe('number');
    expect(res.body.data.healthScore).toBeGreaterThanOrEqual(0);
    expect(res.body.data.healthScore).toBeLessThanOrEqual(100);
  });
});


describe('AI Routes — Status & Conversations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /status — returns provider info', async () => {
    prisma.company.findUnique.mockResolvedValue(MOCK_COMPANY);
    const res = await request(app).get('/status');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('provider');
    expect(res.body.data).toHaveProperty('claudeEnabled');
    expect(res.body.data).toHaveProperty('openaiEnabled');
  });

  it('GET /conversations — returns conversation list', async () => {
    prisma.aiConversation.findMany.mockResolvedValue([
      { id: 'conv1', type: 'support', messages: [] },
    ]);
    const res = await request(app).get('/conversations');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /conversations/:id — returns single conversation', async () => {
    prisma.aiConversation.findFirst.mockResolvedValue({ id: 'conv1', type: 'support', messages: [] });
    const res = await request(app).get('/conversations/conv1');
    expect(res.status).toBe(200);
  });
});

describe('AI Routes — Agents CRUD', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /agents — returns all agents', async () => {
    prisma.aiAgent.findMany.mockResolvedValue([{ id: 'ag1', name: 'Support Bot' }]);
    const res = await request(app).get('/agents');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /agents — creates agent', async () => {
    prisma.aiAgent.create.mockResolvedValue({ id: 'ag2', name: 'Sales Bot', systemPrompt: 'You are a sales agent.' });
    const res = await request(app).post('/agents').send({ name: 'Sales Bot', systemPrompt: 'You are a sales agent.' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Sales Bot');
  });

  it('PUT /agents/:id — updates agent', async () => {
    prisma.aiAgent.findFirst.mockResolvedValue({ id: 'ag1', companyId: 'c1' });
    prisma.aiAgent.update.mockResolvedValue({ id: 'ag1', name: 'Updated Bot' });
    const res = await request(app).put('/agents/ag1').send({ name: 'Updated Bot' });
    expect(res.status).toBe(200);
  });

  it('PUT /agents/:id — 404 when not found', async () => {
    prisma.aiAgent.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/agents/missing').send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('DELETE /agents/:id — deletes agent', async () => {
    prisma.aiAgent.findFirst.mockResolvedValue({ id: 'ag1' });
    prisma.aiAgent.delete.mockResolvedValue({});
    const res = await request(app).delete('/agents/ag1');
    expect(res.status).toBe(200);
  });

  it('DELETE /agents/:id — 404 when not found', async () => {
    prisma.aiAgent.findFirst.mockResolvedValue(null);
    const res = await request(app).delete('/agents/missing');
    expect(res.status).toBe(404);
  });
});
