const prisma = require('../config/prisma');
const logger = require('../config/logger');

function auditLog(module) {
  return async (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const originalJson = res.json.bind(res);
    res.json = function(body) {
      if (body?.success && req.userId) {
        prisma.auditLog.create({
          data: {
            companyId: req.companyId || null,
            userId: req.userId,
            action: req.method,
            module,
            resourceId: req.params?.id || body?.data?.id || null,
            after: body?.data ? JSON.parse(JSON.stringify(body.data)) : null,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']?.slice(0, 200),
          },
        }).catch(() => {});
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { auditLog };
