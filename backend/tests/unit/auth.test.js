const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { describe, it, expect, jest, beforeEach } = require('@jest/globals');

// Mock prisma
jest.mock('../../src/config/prisma', () => ({
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  plan: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  company: {
    create: jest.fn(),
  },
  role: {
    create: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn({
    company: { create: jest.fn().mockResolvedValue({ id: 'c1' }) },
    role: { create: jest.fn().mockResolvedValue({ id: 'r1' }) },
    user: { create: jest.fn().mockResolvedValue({ id: 'u1', firstName: 'Test', email: 'test@test.com' }) },
  })),
}));

const authService = require('../../src/modules/auth/auth.service');
const prisma = require('../../src/config/prisma');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret-key-32-chars-minimum!!';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars!!';
    process.env.JWT_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  });

  describe('login', () => {
    it('should throw on invalid email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(authService.login({ email: 'bad@test.com', password: 'pw' }))
        .rejects.toThrow('Invalid credentials');
    });

    it('should throw for inactive user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'test@test.com', password: 'hash', isActive: false });
      await expect(authService.login({ email: 'test@test.com', password: 'pw' }))
        .rejects.toThrow('Account is deactivated');
    });

    it('should throw on wrong password', async () => {
      const hash = await bcrypt.hash('correct', 12);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1', email: 'test@test.com', password: hash, isActive: true, roles: [], companyId: 'c1',
      });
      prisma.user.update.mockResolvedValue({});
      await expect(authService.login({ email: 'test@test.com', password: 'wrong' }))
        .rejects.toThrow('Invalid credentials');
    });

    it('should return tokens on valid login', async () => {
      const hash = await bcrypt.hash('Password@123', 12);
      const mockUser = { id: 'u1', email: 'test@test.com', password: hash, isActive: true, roles: [], companyId: 'c1', isSuperAdmin: false };
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.user.update.mockResolvedValue(mockUser);

      const result = await authService.login({ email: 'test@test.com', password: 'Password@123' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('user');
      expect(result.user).not.toHaveProperty('password');
    });
  });

  describe('_sanitizeUser', () => {
    it('should remove sensitive fields', () => {
      const user = {
        id: 'u1', email: 'test@test.com', firstName: 'John',
        password: 'secret', resetToken: 'tok', refreshToken: 'ref', twoFactorSecret: '2fa',
      };
      const safe = authService._sanitizeUser(user);
      expect(safe).not.toHaveProperty('password');
      expect(safe).not.toHaveProperty('resetToken');
      expect(safe).not.toHaveProperty('refreshToken');
      expect(safe).toHaveProperty('email');
    });
  });

  describe('_generateSlug', () => {
    it('should generate a valid slug', () => {
      const slug = authService._generateSlug('Acme Corp!');
      expect(slug).toMatch(/^acme-corp-/);
    });
  });
});
