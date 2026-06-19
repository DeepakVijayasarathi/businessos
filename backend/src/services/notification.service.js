const prisma = require('../config/prisma');
const logger = require('../config/logger');

class NotificationService {
  constructor() { this.io = null; }
  setIO(io) { this.io = io; }

  async create({ companyId, userId, type, title, message, link = null, data = {} }) {
    try {
      const notification = await prisma.notification.create({
        data: { companyId, userId, type, title, message, link, data },
      });
      this.io?.to(`user:${userId}`).emit('notification:new', notification);
      return notification;
    } catch (err) {
      logger.error('Notification create failed:', err.message);
    }
  }

  async createForRole({ companyId, roleSlug, type, title, message, link, data }) {
    try {
      const users = await prisma.user.findMany({
        where: { companyId, isActive: true, roles: { some: { role: { slug: roleSlug } } } },
        select: { id: true },
      });
      await Promise.all(users.map(u => this.create({ companyId, userId: u.id, type, title, message, link, data })));
    } catch (err) { logger.error('Notification createForRole failed:', err.message); }
  }

  async createForCompany({ companyId, excludeUserId, type, title, message, link, data }) {
    try {
      const users = await prisma.user.findMany({
        where: { companyId, isActive: true, ...(excludeUserId && { id: { not: excludeUserId } }) },
        select: { id: true },
      });
      await Promise.all(users.map(u => this.create({ companyId, userId: u.id, type, title, message, link, data })));
    } catch (err) { logger.error('Notification createForCompany failed:', err.message); }
  }
}

module.exports = new NotificationService();
