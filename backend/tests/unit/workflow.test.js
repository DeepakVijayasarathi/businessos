const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  workflow: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  workflowExecution: {
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  task: { create: jest.fn() },
  notification: { create: jest.fn() },
  lead: { updateMany: jest.fn() },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
}));

jest.mock('../../src/services/email.service', () => ({ send: jest.fn().mockResolvedValue({}) }));

const prisma = require('../../src/config/prisma');
const { router: workflowRouter, executeWorkflow } = require('../../src/modules/workflow/workflow.routes');

const app = express();
app.use(express.json());
app.use('/', workflowRouter);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_WORKFLOW = {
  id: 'wf1', name: 'Welcome Email', isActive: true, nodes: [], companyId: 'c1',
  runCount: 0, _count: { executions: 0 },
};

describe('Workflow — CRUD', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / — returns list', async () => {
    prisma.workflow.findMany.mockResolvedValue([MOCK_WORKFLOW]);
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /:id — returns workflow with executions', async () => {
    prisma.workflow.findFirst.mockResolvedValue({ ...MOCK_WORKFLOW, executions: [] });
    const res = await request(app).get('/wf1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('wf1');
  });

  it('GET /:id — 404 when not found', async () => {
    prisma.workflow.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/missing');
    expect(res.status).toBe(404);
  });

  it('POST / — creates workflow', async () => {
    prisma.workflow.create.mockResolvedValue(MOCK_WORKFLOW);
    const res = await request(app).post('/').send({ name: 'Welcome Email', nodes: [] });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Welcome Email');
  });

  it('PUT /:id — updates workflow', async () => {
    prisma.workflow.findFirst.mockResolvedValue(MOCK_WORKFLOW);
    prisma.workflow.update.mockResolvedValue({ ...MOCK_WORKFLOW, name: 'Updated' });

    const res = await request(app).put('/wf1').send({ name: 'Updated' });
    expect(res.status).toBe(200);
  });

  it('DELETE /:id — deletes workflow', async () => {
    prisma.workflow.findFirst.mockResolvedValue(MOCK_WORKFLOW);
    prisma.workflow.delete.mockResolvedValue({});

    const res = await request(app).delete('/wf1');
    expect(res.status).toBe(200);
  });

  it('POST /:id/toggle — toggles active state', async () => {
    prisma.workflow.findFirst.mockResolvedValue({ ...MOCK_WORKFLOW, isActive: true });
    prisma.workflow.update.mockResolvedValue({ ...MOCK_WORKFLOW, isActive: false });

    const res = await request(app).post('/wf1/toggle');
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('POST /:id/toggle — 404 when not found', async () => {
    prisma.workflow.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/missing/toggle');
    expect(res.status).toBe(404);
  });
});

describe('Workflow — Execution', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /:id/trigger — executes workflow', async () => {
    prisma.workflow.findFirst.mockResolvedValue(MOCK_WORKFLOW);
    prisma.workflowExecution.create.mockResolvedValue({ id: 'exec1', status: 'running' });
    prisma.workflowExecution.update.mockResolvedValue({ id: 'exec1', status: 'completed', logs: [] });
    prisma.workflow.update.mockResolvedValue({});

    const res = await request(app).post('/wf1/trigger').send({ triggerData: {} });
    expect(res.status).toBe(200);
    expect(prisma.workflowExecution.create).toHaveBeenCalled();
    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) })
    );
  });

  it('POST /:id/trigger — 404 when workflow not found', async () => {
    prisma.workflow.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/missing/trigger');
    expect(res.status).toBe(404);
  });

  it('executeWorkflow — processes send_email node', async () => {
    const emailService = require('../../src/services/email.service');
    const workflow = {
      id: 'wf1', companyId: 'c1',
      nodes: [{ id: 'n1', type: 'send_email', config: { to: 'test@test.com', subject: 'Hi', body: '<p>Hello</p>' } }],
    };
    prisma.workflowExecution.create.mockResolvedValue({ id: 'exec1', status: 'running' });
    prisma.workflowExecution.update.mockResolvedValue({ id: 'exec1', status: 'completed' });
    prisma.workflow.update.mockResolvedValue({});

    await executeWorkflow(workflow, {});
    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'test@test.com', subject: 'Hi' })
    );
  });

  it('executeWorkflow — processes create_task node', async () => {
    const workflow = {
      id: 'wf1', companyId: 'c1',
      nodes: [{ id: 'n1', type: 'create_task', config: { title: 'Follow up', priority: 'high' } }],
    };
    prisma.workflowExecution.create.mockResolvedValue({ id: 'exec1', status: 'running' });
    prisma.workflowExecution.update.mockResolvedValue({ id: 'exec1', status: 'completed' });
    prisma.workflow.update.mockResolvedValue({});
    prisma.task.create.mockResolvedValue({ id: 't1' });

    await executeWorkflow(workflow, {});
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ title: 'Follow up', status: 'todo' }) })
    );
  });

  it('executeWorkflow — continues on node error when stopOnError is false', async () => {
    const emailService = require('../../src/services/email.service');
    emailService.send.mockRejectedValueOnce(new Error('SMTP error'));
    const workflow = {
      id: 'wf1', companyId: 'c1',
      nodes: [
        { id: 'n1', type: 'send_email', config: { to: 'fail@test.com', subject: 'Hi' }, stopOnError: false },
        { id: 'n2', type: 'create_task', config: { title: 'Fallback task' } },
      ],
    };
    prisma.workflowExecution.create.mockResolvedValue({ id: 'exec1', status: 'running' });
    prisma.workflowExecution.update.mockResolvedValue({ id: 'exec1', status: 'completed' });
    prisma.workflow.update.mockResolvedValue({});
    prisma.task.create.mockResolvedValue({ id: 't1' });

    await executeWorkflow(workflow, {});
    expect(prisma.task.create).toHaveBeenCalled();
    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) })
    );
  });

  it('executeWorkflow — stops and marks failed when stopOnError is true', async () => {
    const emailService = require('../../src/services/email.service');
    emailService.send.mockRejectedValueOnce(new Error('SMTP error'));
    const workflow = {
      id: 'wf1', companyId: 'c1',
      nodes: [
        { id: 'n1', type: 'send_email', config: { to: 'fail@test.com', subject: 'Hi' }, stopOnError: true },
        { id: 'n2', type: 'create_task', config: { title: 'Should not run' } },
      ],
    };
    prisma.workflowExecution.create.mockResolvedValue({ id: 'exec1', status: 'running' });
    prisma.workflowExecution.update.mockResolvedValue({ id: 'exec1', status: 'failed' });
    prisma.workflow.update.mockResolvedValue({});

    await executeWorkflow(workflow, {});
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.workflowExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) })
    );
  });

  it('GET /:id/executions — returns execution history', async () => {
    prisma.workflow.findFirst.mockResolvedValue(MOCK_WORKFLOW);
    prisma.workflowExecution.findMany.mockResolvedValue([{ id: 'exec1', status: 'completed' }]);

    const res = await request(app).get('/wf1/executions');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
