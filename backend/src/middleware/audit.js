const prisma = require('../config/prisma');
const logger = require('../config/logger');

// prismaModel: optional Prisma client property name (e.g. 'lead', 'contact') used to
// fetch the record's state before a PUT/PATCH/DELETE so the audit entry can store a
// real before/after diff instead of just the post-mutation state.
function auditLog(module, prismaModel) {
  return async (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

    let before = null;
    if (prismaModel && req.params?.id && req.method !== 'POST') {
      try {
        before = await prisma[prismaModel].findUnique({ where: { id: req.params.id } });
      } catch (err) {
        logger.warn(`audit middleware: failed to fetch before-state for ${module}: ${err.message}`);
      }
    }

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
            before: before ? JSON.parse(JSON.stringify(before)) : null,
            after: body?.data ? JSON.parse(JSON.stringify(body.data)) : null,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']?.slice(0, 200),
          },
        }).catch((err) => logger.warn(`audit log write failed: ${err.message}`));
      }
      return originalJson(body);
    };
    next();
  };
}

module.exports = { auditLog };
