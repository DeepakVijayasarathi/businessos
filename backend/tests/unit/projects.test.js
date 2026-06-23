const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  project: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  task: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  comment: { findMany: jest.fn(), create: jest.fn() },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
}));

jest.mock('../../src/middleware/audit', () => ({
  auditLog: () => (req, res, next) => next(),
}));

const prisma = require('../../src/config/prisma');
const projectsRouter = require('../../src/modules/projects/projects.routes');

const app = express();
app.use(express.json());
app.use('/', projectsRouter);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_PROJECT = { id: 'p1', name: 'Website Redesign', status: 'active', companyId: 'c1', milestones: [], members: [], _count: { tasks: 3 } };
const MOCK_TASK = { id: 't1', title: 'Design mockups', status: 'todo', priority: 'medium', companyId: 'c1', projectId: 'p1', assignee: null };

describe('Projects', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / — returns paginated projects', async () => {
    prisma.project.findMany.mockResolvedValue([MOCK_PROJECT]);
    prisma.project.count.mockResolvedValue(1);

    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('GET /:id — returns project with tasks', async () => {
    prisma.project.findFirst.mockResolvedValue({ ...MOCK_PROJECT, tasks: [MOCK_TASK], files: [] });
    const res = await request(app).get('/p1');
    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toHaveLength(1);
  });

  it('GET /:id — 404 when not found', async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/missing');
    expect(res.status).toBe(404);
  });

  it('POST / — creates project', async () => {
    prisma.project.create.mockResolvedValue(MOCK_PROJECT);
    const res = await request(app).post('/').send({ name: 'Website Redesign' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Website Redesign');
  });

  it('POST / — 400 when name missing', async () => {
    const res = await request(app).post('/').send({ status: 'active' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/name/i);
  });

  it('PUT /:id — updates project', async () => {
    prisma.project.findFirst.mockResolvedValue(MOCK_PROJECT);
    prisma.project.update.mockResolvedValue({ ...MOCK_PROJECT, status: 'completed' });

    const res = await request(app).put('/p1').send({ status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
  });

  it('DELETE /:id — deletes project', async () => {
    prisma.project.findFirst.mockResolvedValue(MOCK_PROJECT);
    prisma.project.delete.mockResolvedValue({});

    const res = await request(app).delete('/p1');
    expect(res.status).toBe(200);
  });
});

describe('Projects — Tasks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /tasks — creates task', async () => {
    prisma.task.create.mockResolvedValue(MOCK_TASK);
    const res = await request(app).post('/tasks').send({ title: 'Design mockups', projectId: 'p1' });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Design mockups');
  });

  it('POST /tasks — 400 when title missing', async () => {
    const res = await request(app).post('/tasks').send({ projectId: 'p1' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('PUT /tasks/:id — updates task', async () => {
    prisma.task.findFirst.mockResolvedValue(MOCK_TASK);
    prisma.task.update.mockResolvedValue({ ...MOCK_TASK, status: 'in_progress' });

    const res = await request(app).put('/tasks/t1').send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('in_progress');
  });

  it('PUT /tasks/:id — 400 on invalid status', async () => {
    const res = await request(app).put('/tasks/t1').send({ status: 'flying' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid status/i);
  });

  it('PUT /tasks/:id — 400 on any unknown status value', async () => {
    const res = await request(app).put('/tasks/t1').send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(400);
  });

  it('PUT /tasks/:id — 404 when not found', async () => {
    prisma.task.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/tasks/missing').send({ status: 'done' });
    expect(res.status).toBe(404);
  });

  it('DELETE /tasks/:id — deletes task', async () => {
    prisma.task.findFirst.mockResolvedValue(MOCK_TASK);
    prisma.task.delete.mockResolvedValue({});

    const res = await request(app).delete('/tasks/t1');
    expect(res.status).toBe(200);
  });

  it('GET /:id/kanban — returns board grouped by status', async () => {
    prisma.task.findMany.mockResolvedValue([]);
    const res = await request(app).get('/p1/kanban');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('todo');
    expect(res.body.data).toHaveProperty('in_progress');
    expect(res.body.data).toHaveProperty('review');
    expect(res.body.data).toHaveProperty('done');
  });

  it('POST /tasks/:id/comments — adds comment', async () => {
    prisma.task.findFirst.mockResolvedValue(MOCK_TASK);
    prisma.comment.create.mockResolvedValue({ id: 'cmt1', content: 'Looks good', user: {} });

    const res = await request(app).post('/tasks/t1/comments').send({ content: 'Looks good' });
    expect(res.status).toBe(201);
  });
});
