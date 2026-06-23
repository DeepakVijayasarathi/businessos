const request = require('supertest');
const express = require('express');
const path = require('path');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  documentFolder: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  document: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
}));

const prisma = require('../../src/config/prisma');
const documentsRouter = require('../../src/modules/documents/documents.routes');

const app = express();
app.use(express.json());
app.use('/', documentsRouter);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_FOLDER = { id: 'fld1', name: 'Reports', companyId: 'c1', _count: { documents: 0, children: 0 } };
const MOCK_DOC = { id: 'doc1', name: 'report.pdf', mimeType: 'application/pdf', size: 10240, companyId: 'c1', path: '/uploads/test.pdf', url: '/uploads/test.pdf' };

describe('Documents — Folders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /folders — returns folders for root', async () => {
    prisma.documentFolder.findMany.mockResolvedValue([MOCK_FOLDER]);
    const res = await request(app).get('/folders');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /folders — creates folder', async () => {
    prisma.documentFolder.create.mockResolvedValue(MOCK_FOLDER);
    const res = await request(app).post('/folders').send({ name: 'Reports' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Reports');
  });

  it('DELETE /folders/:id — deletes empty folder', async () => {
    prisma.documentFolder.findFirst.mockResolvedValue(MOCK_FOLDER);
    prisma.documentFolder.delete.mockResolvedValue({});

    const res = await request(app).delete('/folders/fld1');
    expect(res.status).toBe(200);
  });

  it('DELETE /folders/:id — 400 when folder has documents', async () => {
    prisma.documentFolder.findFirst.mockResolvedValue({ ...MOCK_FOLDER, _count: { documents: 3, children: 0 } });

    const res = await request(app).delete('/folders/fld1');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not empty/i);
  });

  it('DELETE /folders/:id — 400 when folder has sub-folders', async () => {
    prisma.documentFolder.findFirst.mockResolvedValue({ ...MOCK_FOLDER, _count: { documents: 0, children: 2 } });

    const res = await request(app).delete('/folders/fld1');
    expect(res.status).toBe(400);
  });

  it('DELETE /folders/:id — 404 when not found', async () => {
    prisma.documentFolder.findFirst.mockResolvedValue(null);
    const res = await request(app).delete('/folders/missing');
    expect(res.status).toBe(404);
  });
});

describe('Documents — Files', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / — returns paginated documents', async () => {
    prisma.document.findMany.mockResolvedValue([MOCK_DOC]);
    prisma.document.count.mockResolvedValue(1);

    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('GET /:id — returns document', async () => {
    prisma.document.findFirst.mockResolvedValue(MOCK_DOC);
    const res = await request(app).get('/doc1');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('doc1');
  });

  it('GET /:id — 404 when not found', async () => {
    prisma.document.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/missing');
    expect(res.status).toBe(404);
  });

  it('PUT /:id — updates document name/tags', async () => {
    prisma.document.findFirst.mockResolvedValue(MOCK_DOC);
    prisma.document.update.mockResolvedValue({ ...MOCK_DOC, name: 'updated.pdf' });

    const res = await request(app).put('/doc1').send({ name: 'updated.pdf' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('updated.pdf');
  });

  it('PUT /:id — 404 when not found', async () => {
    prisma.document.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/missing').send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('DELETE /:id — deletes document', async () => {
    prisma.document.findFirst.mockResolvedValue({ ...MOCK_DOC, path: null });
    prisma.document.delete.mockResolvedValue({});

    const res = await request(app).delete('/doc1');
    expect(res.status).toBe(200);
  });

  it('DELETE /:id — 404 when not found', async () => {
    prisma.document.findFirst.mockResolvedValue(null);
    const res = await request(app).delete('/missing');
    expect(res.status).toBe(404);
  });
});

describe('Documents — File Upload Validation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /upload — rejects disallowed file type', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('malware content'), { filename: 'evil.exe', contentType: 'application/octet-stream' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not allowed/i);
  });

  it('POST /upload — 400 when no file attached', async () => {
    const res = await request(app).post('/upload');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no file/i);
  });

  it('POST /upload-multiple — 400 when no files attached', async () => {
    const res = await request(app).post('/upload-multiple');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no files/i);
  });
});
