const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  company: { findUnique: jest.fn(), update: jest.fn() },
  role: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
  apiKey: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
  user: { findUnique: jest.fn(), update: jest.fn() },
  auditLog: { findMany: jest.fn(), count: jest.fn() },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
}));

jest.mock('../../src/utils/helpers', () => {
  const real = jest.requireActual('../../src/utils/helpers');
  return { ...real, encrypt: (v) => `enc:${v}`, decrypt: (v) => v.replace('enc:', '') };
});

const prisma = require('../../src/config/prisma');
const router = require('../../src/modules/settings/settings.routes');

const app = express();
app.use(express.json());
app.use('/', router);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

describe('Settings — Company', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /company — returns company settings (safe fields only)', async () => {
    prisma.company.findUnique.mockResolvedValue({ id: 'c1', name: 'Corp', email: 'a@b.com', smtpHost: null });
    const res = await request(app).get('/company');
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Corp');
  });

  it('PUT /company — saves plain fields', async () => {
    prisma.company.update.mockResolvedValue({ id: 'c1', name: 'New Corp' });
    const res = await request(app).put('/company').send({ name: 'New Corp' });
    expect(res.status).toBe(200);
    expect(prisma.company.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'New Corp' }),
    }));
  });

  it('PUT /company — encrypts sensitive fields before saving', async () => {
    prisma.company.update.mockResolvedValue({ id: 'c1', name: 'Corp' });
    await request(app).put('/company').send({ smtpPass: 'secret123', name: 'Corp' });
    expect(prisma.company.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ smtpPass: 'enc:secret123' }),
    }));
  });
});

describe('Settings — Roles', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /roles — returns all company roles', async () => {
    prisma.role.findMany.mockResolvedValue([{ id: 'r1', name: 'Admin', isSystem: true, _count: { userRoles: 3 } }]);
    const res = await request(app).get('/roles');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /roles — creates role with permissions', async () => {
    prisma.role.create.mockResolvedValue({ id: 'r2', name: 'Sales', slug: 'sales', permissions: ['leads.*'] });
    const res = await request(app).post('/roles').send({ name: 'Sales', permissions: ['leads.*'] });
    expect(res.status).toBe(201);
    expect(prisma.role.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ slug: 'sales' }),
    }));
  });

  it('PUT /roles/:id — updates non-system role', async () => {
    prisma.role.findFirst.mockResolvedValue({ id: 'r2', name: 'Sales', isSystem: false });
    prisma.role.update.mockResolvedValue({ id: 'r2', name: 'Sales Pro', permissions: ['leads.*', 'crm.*'] });
    const res = await request(app).put('/roles/r2').send({ name: 'Sales Pro', permissions: ['leads.*', 'crm.*'] });
    expect(res.status).toBe(200);
  });

  it('PUT /roles/:id — 404 for system role (isSystem: false required)', async () => {
    prisma.role.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/roles/system-admin').send({ name: 'Hacked' });
    expect(res.status).toBe(404);
  });

  it('DELETE /roles/:id — deletes non-system role', async () => {
    prisma.role.findFirst.mockResolvedValue({ id: 'r2', isSystem: false });
    prisma.role.delete.mockResolvedValue({});
    const res = await request(app).delete('/roles/r2');
    expect(res.status).toBe(200);
  });

  it('DELETE /roles/:id — 404 when role not found', async () => {
    prisma.role.findFirst.mockResolvedValue(null);
    const res = await request(app).delete('/roles/missing');
    expect(res.status).toBe(404);
  });
});

describe('Settings — API Keys', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /api-keys — returns masked keys', async () => {
    prisma.apiKey.findMany.mockResolvedValue([
      { id: 'k1', name: 'Zapier', key: 'bos_abc123def456xxx', permissions: [], isActive: true, lastUsedAt: null, expiresAt: null, createdAt: new Date() },
    ]);
    const res = await request(app).get('/api-keys');
    expect(res.status).toBe(200);
    const key = res.body.data[0];
    expect(key.key).toMatch(/\*\*\*\*/);
    expect(key.key).not.toContain('def456xxx');
  });

  it('POST /api-keys — creates and returns full key', async () => {
    prisma.apiKey.create.mockResolvedValue({ id: 'k2', name: 'Test Key', key: 'bos_newkey123', permissions: [] });
    const res = await request(app).post('/api-keys').send({ name: 'Test Key', permissions: ['leads.read'] });
    expect(res.status).toBe(201);
    expect(res.body.data.key).toMatch(/^bos_/);
  });

  it('DELETE /api-keys/:id — deletes key', async () => {
    prisma.apiKey.findFirst.mockResolvedValue({ id: 'k1' });
    prisma.apiKey.delete.mockResolvedValue({});
    const res = await request(app).delete('/api-keys/k1');
    expect(res.status).toBe(200);
  });

  it('DELETE /api-keys/:id — 404 when not found', async () => {
    prisma.apiKey.findFirst.mockResolvedValue(null);
    const res = await request(app).delete('/api-keys/missing');
    expect(res.status).toBe(404);
  });
});

describe('Settings — Notification Preferences', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /notifications — returns user preferences', async () => {
    prisma.user.findUnique.mockResolvedValue({ preferences: { notifications: { email: true } } });
    const res = await request(app).get('/notifications');
    expect(res.status).toBe(200);
  });

  it('GET /notifications — returns empty object when no preferences', async () => {
    prisma.user.findUnique.mockResolvedValue({ preferences: null });
    const res = await request(app).get('/notifications');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({});
  });

  it('PUT /notifications — merges and saves preferences', async () => {
    prisma.user.findUnique.mockResolvedValue({ preferences: { theme: 'dark' } });
    prisma.user.update.mockResolvedValue({});
    const res = await request(app).put('/notifications').send({ email: true, slack: false });
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { preferences: expect.objectContaining({ theme: 'dark', notifications: { email: true, slack: false } }) },
    }));
  });
});

describe('Settings — Audit Log', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /audit — returns paginated audit logs', async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'log1', module: 'leads', action: 'create', createdAt: new Date(), user: { firstName: 'Alice', lastName: 'S', email: 'a@s.com' } },
    ]);
    prisma.auditLog.count.mockResolvedValue(1);
    const res = await request(app).get('/audit');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);
  });

  it('GET /audit — filters by module', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
    await request(app).get('/audit?module=leads');
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ module: 'leads' }) })
    );
  });
});
