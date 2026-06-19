const request = require('supertest');
const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');

// Integration test — requires a running test DB
// Set TEST_DATABASE_URL in environment before running

const testDbUrl = process.env.TEST_DATABASE_URL;

if (!testDbUrl) {
  describe.skip('Auth Integration (no TEST_DATABASE_URL set)', () => {
    it('skipped', () => {});
  });
} else {
  process.env.DATABASE_URL = testDbUrl;
  process.env.JWT_SECRET = 'test-secret-key-32-chars-minimum!!';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-32-chars!';
  process.env.JWT_EXPIRES_IN = '15m';
  process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  process.env.NODE_ENV = 'test';

  let app;
  let prisma;

  beforeAll(async () => {
    const server = require('../../src/server');
    app = server.app;
    prisma = require('../../src/config/prisma');
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: '@integration-test.com' } } });
    await prisma.$disconnect();
  });

  describe('Auth Integration', () => {
    const testEmail = `user-${Date.now()}@integration-test.com`;

    it('POST /api/v1/auth/register — creates account', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: testEmail,
          password: 'Test@1234',
          companyName: 'Test Company',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testEmail);
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('POST /api/v1/auth/login — returns tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: 'Test@1234' });

      expect(res.status).toBe(200);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe(testEmail);
    });

    it('POST /api/v1/auth/login — rejects wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: 'WrongPassword' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/v1/auth/me — returns user with token', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: testEmail, password: 'Test@1234' });

      const { accessToken } = loginRes.body.data;

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(testEmail);
    });

    it('GET /api/v1/auth/me — 401 without token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });
  });
}
