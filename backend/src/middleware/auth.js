const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config');
const prisma = require('../config/prisma');
const { unauthorized, forbidden } = require('../utils/response');

/**
 * Verify JWT and attach user to request
 */
async function authenticate(req, res, next) {
  try {
    const tokenFromCookie = req.cookies?.bos_access_token;
    const authHeader = req.headers.authorization;
    const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const token = tokenFromCookie || tokenFromHeader;

    if (!token) {
      return unauthorized(res, 'No token provided');
    }

    const decoded = jwt.verify(token, jwtConfig.secret);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user || !user.isActive) {
      return unauthorized(res, 'User not found or inactive');
    }

    req.user = user;
    req.userId = user.id;
    req.companyId = user.companyId;
    req.permissions = buildPermissions(user);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return unauthorized(res, 'Token expired');
    }
    return unauthorized(res, 'Invalid token');
  }
}

/**
 * Optional auth — attaches user if token present, continues if not
 */
async function optionalAuth(req, res, next) {
  const tokenFromCookie = req.cookies?.bos_access_token;
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!tokenFromCookie && !tokenFromHeader) {
    return next();
  }
  return authenticate(req, res, next);
}

/**
 * Only super admins
 */
function superAdminOnly(req, res, next) {
  if (!req.user?.isSuperAdmin) {
    return forbidden(res, 'Super admin access required');
  }
  next();
}

/**
 * Permission-based guard factory
 */
function requirePermission(...permissions) {
  return (req, res, next) => {
    if (req.user?.isSuperAdmin) return next();
    const userPerms = req.permissions || [];
    const hasAll = permissions.every((p) => userPerms.includes(p));
    if (!hasAll) {
      return forbidden(res, 'Insufficient permissions');
    }
    next();
  };
}

/**
 * Role-based guard factory
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (req.user?.isSuperAdmin) return next();
    const userRoles = req.user?.roles?.map((ur) => ur.role.slug) || [];
    const hasRole = roles.some((r) => userRoles.includes(r));
    if (!hasRole) {
      return forbidden(res, 'Insufficient role');
    }
    next();
  };
}

/**
 * Ensure user belongs to the same company as the resource
 */
function sameCompany(req, res, next) {
  if (!req.user?.companyId) {
    return forbidden(res, req.user?.isSuperAdmin
      ? 'Super admin has no company — use /admin endpoints or log in to a company account'
      : 'No company assigned to this account');
  }
  next();
}

/**
 * Build flat permissions array from user roles
 */
function buildPermissions(user) {
  const perms = new Set();
  for (const ur of user.roles || []) {
    const rolePerms = ur.role.permissions || [];
    (Array.isArray(rolePerms) ? rolePerms : []).forEach((p) => perms.add(p));
  }
  return [...perms];
}

module.exports = {
  authenticate,
  optionalAuth,
  superAdminOnly,
  requirePermission,
  requireRole,
  sameCompany,
};
