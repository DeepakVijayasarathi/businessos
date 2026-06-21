const router = require('express').Router();
const prisma = require('../../../config/prisma');
const { authenticate, sameCompany } = require('../../../middleware/auth');
const { success, created, paginated, notFound } = require('../../../utils/response');
const { paginate, paginateMeta } = require('../../../utils/helpers');

router.use(authenticate, sameCompany);

// Maps the CRM Activity model's fields to the shape the frontend reads/writes
// (title/notes/dueDate/isCompleted instead of subject/description/scheduledAt/completedAt).
function toApi(activity) {
  return {
    id: activity.id,
    type: activity.type,
    title: activity.subject,
    notes: activity.description,
    dueDate: activity.scheduledAt,
    isCompleted: !!activity.completedAt,
    lead: activity.lead,
    contact: activity.contact,
    deal: activity.deal && { id: activity.deal.id, name: activity.deal.title },
    createdAt: activity.createdAt,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = { companyId: req.companyId, ...(type && { type }) };
    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where, take, skip,
        include: {
          lead: { select: { id: true, firstName: true, lastName: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
          deal: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.activity.count({ where }),
    ]);
    return paginated(res, activities.map(toApi), paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, type, notes, dueDate, isCompleted, leadId, contactId, dealId } = req.body;
    const activity = await prisma.activity.create({
      data: {
        companyId: req.companyId,
        userId: req.userId,
        type: type || 'other',
        subject: title,
        description: notes || null,
        scheduledAt: dueDate ? new Date(dueDate) : null,
        completedAt: isCompleted ? new Date() : null,
        leadId: leadId || null,
        contactId: contactId || null,
        dealId: dealId || null,
      },
    });
    return created(res, toApi(activity), 'Activity logged');
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.activity.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Activity not found');
    await prisma.activity.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Activity deleted');
  } catch (err) { next(err); }
});

module.exports = router;
