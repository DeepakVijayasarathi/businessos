const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  knowledgeCategory: { findMany: jest.fn(), create: jest.fn() },
  knowledgeArticle: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
  optionalAuth: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; next(); },
}));

const prisma = require('../../src/config/prisma');
const router = require('../../src/modules/knowledgebase/kb.routes');

const app = express();
app.use(express.json());
app.use('/', router);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_CATEGORY = {
  id: 'cat-1', name: 'Account', slug: 'account', companyId: 'c1',
  parentId: null, order: 0, children: [], _count: { articles: 3 },
};

const MOCK_ARTICLE = {
  id: 'art-1', title: 'Reset Password', slug: 'reset-password-1000', content: 'Click forgot...',
  status: 'published', views: 5, helpful: 2, notHelpful: 0,
  companyId: 'c1', authorId: 'u1', category: MOCK_CATEGORY, version: 1,
};

describe('Knowledgebase — Categories', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /categories — returns top-level categories with children', async () => {
    prisma.knowledgeCategory.findMany.mockResolvedValue([MOCK_CATEGORY]);
    const res = await request(app).get('/categories');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Account');
  });

  it('GET /categories — returns empty array when none exist', async () => {
    prisma.knowledgeCategory.findMany.mockResolvedValue([]);
    const res = await request(app).get('/categories');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('POST /categories — creates category with auto slug', async () => {
    prisma.knowledgeCategory.create.mockResolvedValue({ ...MOCK_CATEGORY, name: 'Getting Started', slug: 'getting-started' });
    const res = await request(app).post('/categories').send({ name: 'Getting Started', order: 1 });
    expect(res.status).toBe(201);
    expect(prisma.knowledgeCategory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ slug: expect.stringContaining('getting') }),
    }));
  });
});

describe('Knowledgebase — Articles', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /articles — returns published articles with pagination', async () => {
    prisma.knowledgeArticle.findMany.mockResolvedValue([MOCK_ARTICLE]);
    prisma.knowledgeArticle.count.mockResolvedValue(1);
    const res = await request(app).get('/articles');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('GET /articles — filters by categoryId', async () => {
    prisma.knowledgeArticle.findMany.mockResolvedValue([]);
    prisma.knowledgeArticle.count.mockResolvedValue(0);
    await request(app).get('/articles?categoryId=cat-1');
    expect(prisma.knowledgeArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: 'cat-1' }) })
    );
  });

  it('GET /articles — supports search query', async () => {
    prisma.knowledgeArticle.findMany.mockResolvedValue([]);
    prisma.knowledgeArticle.count.mockResolvedValue(0);
    await request(app).get('/articles?search=password');
    expect(prisma.knowledgeArticle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });

  it('GET /articles/:slug — returns article and increments view count', async () => {
    prisma.knowledgeArticle.findFirst.mockResolvedValue(MOCK_ARTICLE);
    prisma.knowledgeArticle.update.mockResolvedValue({ ...MOCK_ARTICLE, views: 6 });
    const res = await request(app).get('/articles/reset-password-1000');
    expect(res.status).toBe(200);
    expect(prisma.knowledgeArticle.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { views: { increment: 1 } },
    }));
  });

  it('GET /articles/:slug — 404 when not found', async () => {
    prisma.knowledgeArticle.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/articles/not-exist');
    expect(res.status).toBe(404);
  });

  it('POST /articles — creates article with timestamp slug', async () => {
    prisma.knowledgeArticle.create.mockResolvedValue(MOCK_ARTICLE);
    const res = await request(app).post('/articles').send({
      title: 'Reset Password', content: 'Click forgot...', status: 'draft',
    });
    expect(res.status).toBe(201);
    expect(prisma.knowledgeArticle.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ authorId: 'u1', companyId: 'c1' }),
    }));
  });

  it('POST /articles — sets publishedAt when status is published', async () => {
    prisma.knowledgeArticle.create.mockResolvedValue({ ...MOCK_ARTICLE, publishedAt: new Date() });
    await request(app).post('/articles').send({ title: 'Public Article', status: 'published', content: '...' });
    expect(prisma.knowledgeArticle.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ publishedAt: expect.any(Date) }),
    }));
  });

  it('PUT /articles/:id — updates existing article and bumps version', async () => {
    prisma.knowledgeArticle.findFirst.mockResolvedValue(MOCK_ARTICLE);
    prisma.knowledgeArticle.update.mockResolvedValue({ ...MOCK_ARTICLE, title: 'Updated', version: 2 });
    const res = await request(app).put('/articles/art-1').send({ title: 'Updated' });
    expect(res.status).toBe(200);
    expect(prisma.knowledgeArticle.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ version: { increment: 1 } }),
    }));
  });

  it('PUT /articles/:id — 404 when not found', async () => {
    prisma.knowledgeArticle.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/articles/missing').send({ title: 'X' });
    expect(res.status).toBe(404);
  });

  it('DELETE /articles/:id — deletes article', async () => {
    prisma.knowledgeArticle.findFirst.mockResolvedValue(MOCK_ARTICLE);
    prisma.knowledgeArticle.delete.mockResolvedValue({});
    const res = await request(app).delete('/articles/art-1');
    expect(res.status).toBe(200);
  });

  it('DELETE /articles/:id — 404 when not found', async () => {
    prisma.knowledgeArticle.findFirst.mockResolvedValue(null);
    const res = await request(app).delete('/articles/missing');
    expect(res.status).toBe(404);
  });
});

describe('Knowledgebase — Article Feedback', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /articles/:id/feedback — increments helpful counter', async () => {
    prisma.knowledgeArticle.update.mockResolvedValue({});
    const res = await request(app).post('/articles/art-1/feedback').send({ helpful: true });
    expect(res.status).toBe(200);
    expect(prisma.knowledgeArticle.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { helpful: { increment: 1 } },
    }));
  });

  it('POST /articles/:id/feedback — increments notHelpful counter', async () => {
    prisma.knowledgeArticle.update.mockResolvedValue({});
    const res = await request(app).post('/articles/art-1/feedback').send({ helpful: false });
    expect(res.status).toBe(200);
    expect(prisma.knowledgeArticle.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { notHelpful: { increment: 1 } },
    }));
  });
});
