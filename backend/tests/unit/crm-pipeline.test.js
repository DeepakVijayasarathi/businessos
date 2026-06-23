const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  pipeline: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
  deal: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  crmCompany: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
}));

jest.mock('../../src/middleware/audit', () => ({
  auditLog: () => (req, res, next) => next(),
}));

const prisma = require('../../src/config/prisma');
const router = require('../../src/modules/crm/pipeline/pipeline.routes');

const app = express();
app.use(express.json());
app.use('/', router);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_STAGE = { id: 's1', name: 'Qualified', order: 1, probability: 30, color: '#6366f1' };
const MOCK_PIPELINE = { id: 'p1', name: 'Sales', companyId: 'c1', stages: [MOCK_STAGE] };
const MOCK_DEAL = {
  id: 'd1', title: 'ACME Deal', value: 50000, status: 'open',
  pipelineId: 'p1', stageId: 's1', companyId: 'c1',
  stage: MOCK_STAGE, crmCompany: null, contacts: [],
};
const MOCK_CRM_COMPANY = { id: 'crm1', name: 'ACME Corp', companyId: 'c1', _count: { contacts: 2 } };

describe('CRM Pipeline — Pipelines', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /pipelines — returns all pipelines with stages', async () => {
    prisma.pipeline.findMany.mockResolvedValue([MOCK_PIPELINE]);
    const res = await request(app).get('/pipelines');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].stages).toHaveLength(1);
  });

  it('POST /pipelines — creates pipeline with nested stages', async () => {
    prisma.pipeline.create.mockResolvedValue({ ...MOCK_PIPELINE, stages: [MOCK_STAGE] });
    const res = await request(app).post('/pipelines').send({
      name: 'Sales', stages: [{ name: 'Qualified', probability: 30 }],
    });
    expect(res.status).toBe(201);
    expect(prisma.pipeline.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'Sales', companyId: 'c1' }),
    }));
  });
});

describe('CRM Pipeline — Deals', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /deals — returns paginated deals', async () => {
    prisma.deal.findMany.mockResolvedValue([MOCK_DEAL]);
    prisma.deal.count.mockResolvedValue(1);
    const res = await request(app).get('/deals');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /deals — filters by stageId', async () => {
    prisma.deal.findMany.mockResolvedValue([]);
    prisma.deal.count.mockResolvedValue(0);
    await request(app).get('/deals?stageId=s1');
    expect(prisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ stageId: 's1' }) })
    );
  });

  it('GET /deals — filters by status', async () => {
    prisma.deal.findMany.mockResolvedValue([]);
    prisma.deal.count.mockResolvedValue(0);
    await request(app).get('/deals?status=won');
    expect(prisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'won' }) })
    );
  });

  it('GET /kanban/:pipelineId — returns pipeline with nested deals', async () => {
    prisma.pipeline.findFirst.mockResolvedValue({
      ...MOCK_PIPELINE,
      stages: [{ ...MOCK_STAGE, deals: [MOCK_DEAL] }],
    });
    const res = await request(app).get('/kanban/p1');
    expect(res.status).toBe(200);
    expect(res.body.data.stages[0].deals).toHaveLength(1);
  });

  it('GET /kanban/:pipelineId — coerces deal.value to number', async () => {
    prisma.pipeline.findFirst.mockResolvedValue({
      ...MOCK_PIPELINE,
      stages: [{ ...MOCK_STAGE, deals: [{ ...MOCK_DEAL, value: '50000' }] }],
    });
    const res = await request(app).get('/kanban/p1');
    expect(typeof res.body.data.stages[0].deals[0].value).toBe('number');
  });

  it('GET /kanban/:pipelineId — 404 when pipeline not found', async () => {
    prisma.pipeline.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/kanban/missing');
    expect(res.status).toBe(404);
  });

  it('POST /deals — creates deal with required fields', async () => {
    prisma.deal.create.mockResolvedValue(MOCK_DEAL);
    const res = await request(app).post('/deals').send({
      title: 'ACME Deal', pipelineId: 'p1', stageId: 's1', value: 50000,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('ACME Deal');
  });

  it('POST /deals — 400 when title missing', async () => {
    const res = await request(app).post('/deals').send({ pipelineId: 'p1', stageId: 's1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('POST /deals — 400 when pipelineId missing', async () => {
    const res = await request(app).post('/deals').send({ title: 'Deal', stageId: 's1' });
    expect(res.status).toBe(400);
  });

  it('PUT /deals/:id — updates deal', async () => {
    prisma.deal.findFirst.mockResolvedValue(MOCK_DEAL);
    prisma.deal.update.mockResolvedValue({ ...MOCK_DEAL, value: 75000 });
    const res = await request(app).put('/deals/d1').send({ value: 75000 });
    expect(res.status).toBe(200);
  });

  it('PUT /deals/:id — 404 when not found', async () => {
    prisma.deal.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/deals/missing').send({ value: 100 });
    expect(res.status).toBe(404);
  });

  it('PUT /deals/:id/move — moves deal to new stage', async () => {
    prisma.deal.findFirst.mockResolvedValue(MOCK_DEAL);
    prisma.deal.update.mockResolvedValue({ ...MOCK_DEAL, stageId: 's2' });
    const res = await request(app).put('/deals/d1/move').send({ stageId: 's2' });
    expect(res.status).toBe(200);
    expect(prisma.deal.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { stageId: 's2' },
    }));
  });

  it('DELETE /deals/:id — deletes deal', async () => {
    prisma.deal.findFirst.mockResolvedValue(MOCK_DEAL);
    prisma.deal.delete.mockResolvedValue({});
    const res = await request(app).delete('/deals/d1');
    expect(res.status).toBe(200);
  });

  it('DELETE /deals/:id — 404 when not found', async () => {
    prisma.deal.findFirst.mockResolvedValue(null);
    const res = await request(app).delete('/deals/missing');
    expect(res.status).toBe(404);
  });
});

describe('CRM Pipeline — CRM Companies', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /companies — returns paginated CRM companies', async () => {
    prisma.crmCompany.findMany.mockResolvedValue([MOCK_CRM_COMPANY]);
    prisma.crmCompany.count.mockResolvedValue(1);
    const res = await request(app).get('/companies');
    expect(res.status).toBe(200);
    expect(res.body.data[0].name).toBe('ACME Corp');
  });

  it('GET /companies — supports search by name', async () => {
    prisma.crmCompany.findMany.mockResolvedValue([]);
    prisma.crmCompany.count.mockResolvedValue(0);
    await request(app).get('/companies?search=acme');
    expect(prisma.crmCompany.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ name: { contains: 'acme', mode: 'insensitive' } }) })
    );
  });

  it('POST /companies — creates CRM company', async () => {
    prisma.crmCompany.create.mockResolvedValue(MOCK_CRM_COMPANY);
    const res = await request(app).post('/companies').send({ name: 'ACME Corp', industry: 'Technology' });
    expect(res.status).toBe(201);
  });

  it('POST /companies — 400 when name missing', async () => {
    const res = await request(app).post('/companies').send({ industry: 'Tech' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name/i);
  });

  it('PUT /companies/:id — updates CRM company', async () => {
    prisma.crmCompany.findFirst.mockResolvedValue(MOCK_CRM_COMPANY);
    prisma.crmCompany.update.mockResolvedValue({ ...MOCK_CRM_COMPANY, name: 'ACME Enterprise' });
    const res = await request(app).put('/companies/crm1').send({ name: 'ACME Enterprise' });
    expect(res.status).toBe(200);
  });

  it('PUT /companies/:id — 404 when not found', async () => {
    prisma.crmCompany.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/companies/missing').send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('DELETE /companies/:id — deletes CRM company', async () => {
    prisma.crmCompany.findFirst.mockResolvedValue(MOCK_CRM_COMPANY);
    prisma.crmCompany.delete.mockResolvedValue({});
    const res = await request(app).delete('/companies/crm1');
    expect(res.status).toBe(200);
  });

  it('DELETE /companies/:id — 404 when not found', async () => {
    prisma.crmCompany.findFirst.mockResolvedValue(null);
    const res = await request(app).delete('/companies/missing');
    expect(res.status).toBe(404);
  });
});
