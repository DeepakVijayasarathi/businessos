const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate } = require('../../middleware/auth');
const { success, notFound } = require('../../utils/response');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unread } = req.query;
    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.userId,
        ...(unread === 'true' && { isRead: false }),
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
    });
    const unreadCount = await prisma.notification.count({ where: { userId: req.userId, isRead: false } });
    return success(res, { notifications, unreadCount });
  } catch (err) { next(err); }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const existing = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) return notFound(res, 'Notification not found');
    await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
    return success(res, {}, 'Marked as read');
  } catch (err) { next(err); }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { userId: req.userId, isRead: false }, data: { isRead: true } });
    return success(res, {}, 'All notifications marked as read');
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.notification.findFirst({ where: { id: req.params.id, userId: req.userId } });
    if (!existing) return notFound(res, 'Notification not found');
    await prisma.notification.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Notification deleted');
  } catch (err) { next(err); }
});

module.exports = router;
