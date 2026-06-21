const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../config/prisma');
const { jwt: jwtConfig } = require('../../config');
const { generateToken } = require('../../utils/helpers');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../config/logger');

class AuthService {
  async register({ firstName, lastName, email, password, companyName }) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('Email already registered', 409);

    const hashedPassword = await bcrypt.hash(password, 12);
    const slug = this._generateSlug(companyName);

    // Default plan
    let plan = await prisma.plan.findFirst({ where: { name: 'Starter' } });
    if (!plan) {
      plan = await prisma.plan.create({
        data: {
          name: 'Starter',
          price: 0,
          maxUsers: 5,
          maxStorage: 5,
          features: { crm: true, projects: true },
        },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: companyName,
          email,
          slug,
          subscriptions: {
            create: {
              planId: plan.id,
              status: 'trial',
              billingCycle: 'monthly',
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
              trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
              amount: plan.price,
            },
          },
        },
      });

      const adminRole = await tx.role.create({
        data: {
          name: 'Company Admin',
          slug: 'company-admin',
          companyId: company.id,
          isSystem: true,
          permissions: this._getAdminPermissions(),
        },
      });

      const user = await tx.user.create({
        data: {
          firstName,
          lastName,
          email,
          password: hashedPassword,
          companyId: company.id,
          isEmailVerified: false,
          emailVerifyToken: generateToken(),
          roles: {
            create: { roleId: adminRole.id },
          },
        },
      });

      return { user, company };
    });

    const tokens = this._generateTokens(result.user);
    await this._saveRefreshToken(result.user.id, tokens.refreshToken);

    return { user: this._sanitizeUser(result.user), ...tokens };
  }

  async login({ email, password }) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { roles: { include: { role: true } }, company: true },
    });

    if (!user) throw new AppError('Invalid credentials', 401);
    if (!user.isActive) throw new AppError('Account is deactivated', 401);

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new AppError('Invalid credentials', 401);

    const tokens = this._generateTokens(user);
    await this._saveRefreshToken(user.id, tokens.refreshToken);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    return { user: this._sanitizeUser(user), ...tokens };
  }

  async refreshToken(token) {
    let decoded;
    try {
      decoded = jwt.verify(token, jwtConfig.refreshSecret);
    } catch {
      throw new AppError('Invalid refresh token', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { roles: { include: { role: true } } },
    });

    if (!user) throw new AppError('Refresh token revoked', 401);

    if (user.refreshToken !== token) {
      // The token was valid (signature + expiry) but doesn't match what's on
      // file — it was already rotated, meaning this is either a stale tab or
      // a stolen-and-replayed token. Can't tell which, so the safe response
      // is to kill the current valid session too and force a fresh login,
      // rather than silently 401ing and leaving a possibly-compromised
      // session active.
      if (user.refreshToken) {
        await prisma.user.update({ where: { id: user.id }, data: { refreshToken: null } });
        logger.warn(`Refresh token reuse detected for user ${user.id} — session revoked, forcing re-login`);
      }
      throw new AppError('Refresh token revoked', 401);
    }

    const tokens = this._generateTokens(user);
    await this._saveRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId) {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  async forgotPassword(email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return; // silent — don't reveal existence

    const token = generateToken();
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetTokenExpiry: expiry },
    });

    return { token, email: user.email, name: user.firstName };
  }

  async resetPassword(token, newPassword) {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) throw new AppError('Invalid or expired reset token', 400);

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, resetToken: null, resetTokenExpiry: null, refreshToken: null },
    });
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new AppError('Current password is incorrect', 400);

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  }

  async getProfile(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: true } },
        company: { select: { id: true, name: true, slug: true, logo: true, primaryColor: true } },
      },
    });
    return this._sanitizeUser(user);
  }

  _generateTokens(user) {
    const payload = {
      userId: user.id,
      companyId: user.companyId,
      isSuperAdmin: user.isSuperAdmin,
    };

    const accessToken = jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn });
    const refreshToken = jwt.sign({ userId: user.id }, jwtConfig.refreshSecret, {
      expiresIn: jwtConfig.refreshExpiresIn,
    });

    return { accessToken, refreshToken };
  }

  async _saveRefreshToken(userId, token) {
    await prisma.user.update({ where: { id: userId }, data: { refreshToken: token } });
  }

  _sanitizeUser(user) {
    const { password, resetToken, resetTokenExpiry, refreshToken, twoFactorSecret, ...safe } = user;
    return safe;
  }

  _generateSlug(name) {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${base}-${Math.random().toString(36).substr(2, 5)}`;
  }

  _getAdminPermissions() {
    return [
      'crm.*', 'projects.*', 'tasks.*', 'hr.*', 'finance.*',
      'helpdesk.*', 'knowledge.*', 'documents.*', 'ai.*',
      'workflow.*', 'appointments.*', 'whatsapp.*', 'email.*',
      'marketing.*', 'analytics.*', 'settings.*', 'users.*', 'roles.*',
    ];
  }
}

module.exports = new AuthService();
