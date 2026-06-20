const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { paginated } = require('../../utils/response');
const { paginate, paginateMeta } = require('../../utils/helpers');

router.use(authenticate, sameCompany);

// GET /activity?module=crm.contacts&resourceId=<id>&page=1&limit=20
// Returns the audit trail for a single record — the entity-scoped activity timeline.
router.get('/', async (req, res, next) => {
  try {
    const { module: mod, resourceId, page = 1, limit = 20 } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(mod && { module: mod }),
      ...(resourceId && { resourceId }),
    };
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where, take, skip,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    return paginated(res, logs, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

module.exports = router;
