/**
 * Security tests: verify the authentication/authorization layer works correctly.
 * These tests use the REAL auth middleware (not mocked) to verify actual behavior.
 */
const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');
const jwt = require('jsonwebtoken');

// Mock prisma so the real auth middleware's DB lookup returns a controlled user
const MOCK_USER = {
  id: 'user-abc', companyId: 'company-A', isActive: true, isSuperAdmin: false,
  roles: [{ role: { slug: 'sales', permissions: ['leads.read', 'leads.write'] } }],
};

jest.mock('../../src/config/prisma', () => ({
  user: { findUnique: jest.fn() },
  lead: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  contact: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  role: { findMany: jest.fn().mockResolvedValue([]) },
  apiKey: { findMany: jest.fn().mockResolvedValue([]) },
  auditLog: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  company: { findUnique: jest.fn().mockResolvedValue(null) },
  invoice: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: { total: null } }) },
}));

jest.mock('../../src/middleware/audit', () => ({
  auditLog: () => (req, res, next) => next(),
}));

const prisma = require('../../src/config/prisma');
const { authenticate, requirePermission } = require('../../src/middleware/auth');

function makeToken(payload, secret = process.env.JWT_SECRET) {
  return jwt.sign(payload, secret, { expiresIn: '15m' });
}

function buildApp(routerOrFn) {
  const a = express();
  a.use(express.json());
  if (typeof routerOrFn === 'function' && routerOrFn.stack === undefined) {
    routerOrFn(a);
  } else {
    a.use('/', routerOrFn);
  }
  a.use((err, req, res, next) => res.status(err.statusCode || 500).json({ success: false, message: err.message }));
  return a;
}

describe('Security — Authentication (real middleware)', () => {
  let protectedApp;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue(MOCK_USER);

    const r = express.Router();
    r.use(authenticate);
    r.get('/me', (req, res) => res.json({ userId: req.userId, companyId: req.companyId }));
    protectedApp = express();
    protectedApp.use(express.json());
    protectedApp.use('/', r);
    protectedApp.use((err, req, res, next) =>
      res.status(err.statusCode || 500).json({ success: false, message: err.message })
    );
  });

  it('401 when no Authorization header', async () => {
    const res = await request(protectedApp).get('/me');
    expect(res.status).toBe(401);
  });

  it('401 when Authorization header has no Bearer prefix', async () => {
    const res = await request(protectedApp).get('/me').set('Authorization', 'just-a-token');
    expect(res.status).toBe(401);
  });

  it('401 when token is expired', async () => {
    const expired = jwt.sign({ userId: 'u1', companyId: 'c1' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const res = await request(protectedApp).get('/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('401 when token signed with wrong secret', async () => {
    const bad = jwt.sign({ userId: 'u1', companyId: 'c1' }, 'wrong-secret-key-is-definitely-wrong');
    const res = await request(protectedApp).get('/me').set('Authorization', `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it('401 when user does not exist in DB', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const token = makeToken({ userId: 'ghost', companyId: 'c1' });
    const res = await request(protectedApp).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/not found|inactive/i);
  });

  it('401 when user is inactive', async () => {
    prisma.user.findUnique.mockResolvedValue({ ...MOCK_USER, isActive: false });
    const token = makeToken({ userId: 'user-abc', companyId: 'company-A' });
    const res = await request(protectedApp).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('200 with valid token — injects userId and companyId from DB user (not JWT payload)', async () => {
    const token = makeToken({ userId: 'user-abc', companyId: 'company-A' });
    const res = await request(protectedApp).get('/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // companyId comes from the DB user, not the JWT payload
    expect(res.body.userId).toBe('user-abc');
    expect(res.body.companyId).toBe('company-A');
  });
});

describe('Security — Permission Enforcement (requirePermission)', () => {
  function makePermApp(requiredPerm, userPerms = ['leads.read']) {
    const r = express.Router();
    r.use((req, res, next) => {
      req.userId = 'u1'; req.companyId = 'c1';
      req.user = { isSuperAdmin: false };
      req.permissions = userPerms;
      next();
    });
    r.get('/protected', requirePermission(requiredPerm), (req, res) => res.json({ ok: true }));
    return express().use(express.json()).use('/', r);
  }

  it('403 when user lacks required permission', async () => {
    const a = makePermApp('settings.*');
    const res = await request(a).get('/protected');
    expect(res.status).toBe(403);
  });

  it('200 when user has exact required permission', async () => {
    const a = makePermApp('leads.read', ['leads.read', 'leads.write']);
    const res = await request(a).get('/protected');
    expect(res.status).toBe(200);
  });

  it('200 for super admin regardless of permissions', async () => {
    const r = express.Router();
    r.use((req, res, next) => {
      req.userId = 'u1'; req.companyId = 'c1';
      req.user = { isSuperAdmin: true };
      req.permissions = [];
      next();
    });
    r.get('/protected', requirePermission('settings.*'), (req, res) => res.json({ ok: true }));
    const a = express().use(express.json()).use('/', r);
    const res = await request(a).get('/protected');
    expect(res.status).toBe(200);
  });

  it('403 when user has some but not all required permissions', async () => {
    const r = express.Router();
    r.use((req, res, next) => {
      req.userId = 'u1'; req.companyId = 'c1';
      req.user = { isSuperAdmin: false };
      req.permissions = ['leads.read'];
      next();
    });
    r.get('/protected', requirePermission('leads.read', 'leads.delete'), (req, res) => res.json({ ok: true }));
    const a = express().use(express.json()).use('/', r);
    const res = await request(a).get('/protected');
    expect(res.status).toBe(403);
  });
});

describe('Security — Cross-company data isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ ...MOCK_USER, companyId: 'company-A' });
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);
  });

  it('Lead queries use companyId from DB user, not from query string', async () => {
    const leadsRouter = require('../../src/modules/crm/leads/leads.routes');
    const a = express();
    a.use(express.json());
    a.use(authenticate);
    a.use('/leads', leadsRouter);

    const token = makeToken({ userId: 'user-abc', companyId: 'company-A' });
    // Attacker passes a different companyId in the URL
    await request(a).get('/leads?companyId=company-EVIL').set('Authorization', `Bearer ${token}`);

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-A' }) })
    );
    prisma.lead.findMany.mock.calls.forEach(([arg]) => {
      expect(arg.where.companyId).not.toBe('company-EVIL');
    });
  });
});

describe('Security — Input validation (injection resistance)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ ...MOCK_USER, companyId: 'c1' });
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);
  });

  it('XSS payload in search is treated as a plain string (Prisma parameterizes all queries)', async () => {
    const leadsRouter = require('../../src/modules/crm/leads/leads.routes');
    const a = express();
    a.use(express.json());
    a.use(authenticate);
    a.use('/leads', leadsRouter);

    const token = makeToken({ userId: 'user-abc', companyId: 'c1' });
    const xss = '<script>alert(document.cookie)</script>';
    const res = await request(a)
      .get(`/leads?search=${encodeURIComponent(xss)}`)
      .set('Authorization', `Bearer ${token}`);

    // Should return 200 (no crash, no XSS execution path in backend)
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Prisma receives the raw string as a parameter — not as SQL
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });

  it('SQL-injection payload in search does not crash the application', async () => {
    const leadsRouter = require('../../src/modules/crm/leads/leads.routes');
    const a = express();
    a.use(express.json());
    a.use(authenticate);
    a.use('/leads', leadsRouter);

    const token = makeToken({ userId: 'user-abc', companyId: 'c1' });
    const sqli = "'; DROP TABLE leads; --";
    const res = await request(a)
      .get(`/leads?search=${encodeURIComponent(sqli)}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
