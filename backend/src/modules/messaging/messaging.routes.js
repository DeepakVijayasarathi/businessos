const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created } = require('../../utils/response');

router.use(authenticate, sameCompany);

// GET /messaging/conversations — list all conversations for current user
router.get('/conversations', async (req, res, next) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        companyId: req.companyId,
        participants: { some: { userId: req.userId } },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true, isOnline: true } } },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Count unread per conversation in a single aggregated query
    const conversationIds = conversations.map(c => c.id);
    const unreadCounts = await prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: conversationIds },
        isRead: false,
        NOT: { senderId: req.userId },
      },
      _count: { id: true },
    });
    const unreadMap = Object.fromEntries(unreadCounts.map(u => [u.conversationId, u._count.id]));
    const enriched = conversations.map(c => ({ ...c, unreadCount: unreadMap[c.id] || 0 }));

    return success(res, enriched);
  } catch (err) { next(err); }
});

// POST /messaging/conversations — start a new conversation
router.post('/conversations', async (req, res, next) => {
  try {
    const { userIds = [], name, type = 'internal', phone } = req.body;
    const allParticipants = [...new Set([req.userId, ...userIds])];

    // For 1-on-1, check if conversation already exists
    if (type === 'internal' && allParticipants.length === 2) {
      const existing = await prisma.conversation.findFirst({
        where: {
          companyId: req.companyId,
          type: 'internal',
          isGroup: false,
          participants: { every: { userId: { in: allParticipants } } },
        },
        include: { participants: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } } },
      });
      if (existing) return success(res, existing);
    }

    const conversation = await prisma.conversation.create({
      data: {
        companyId: req.companyId,
        type,
        name: name || null,
        phone: phone || null,
        isGroup: allParticipants.length > 2,
        participants: { create: allParticipants.map(uid => ({ userId: uid })) },
      },
      include: { participants: { include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } } } },
    });

    return created(res, conversation, 'Conversation started');
  } catch (err) { next(err); }
});

// GET /messaging/conversations/:id/messages — get messages in a conversation
router.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const take = parseInt(limit);
    const skip = (parseInt(page) - 1) * take;

    // Verify participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: { conversationId: req.params.id, userId: req.userId },
    });
    if (!participant) return res.status(403).json({ success: false, message: 'Not a participant' });

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId: req.params.id },
        include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        orderBy: { createdAt: 'desc' },
        take, skip,
      }),
      prisma.message.count({ where: { conversationId: req.params.id } }),
    ]);

    // Mark as read
    await prisma.message.updateMany({
      where: { conversationId: req.params.id, isRead: false, NOT: { senderId: req.userId } },
      data: { isRead: true },
    });
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: req.params.id, userId: req.userId } },
      data: { lastReadAt: new Date() },
    });

    return res.json({ success: true, data: messages.reverse(), total });
  } catch (err) { next(err); }
});

// POST /messaging/conversations/:id/messages — send a message
router.post('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { content, type = 'text', mediaUrl } = req.body;
    if (!content?.trim() && !mediaUrl) return res.status(400).json({ success: false, message: 'Content required' });

    // Verify participant
    const participant = await prisma.conversationParticipant.findFirst({
      where: { conversationId: req.params.id, userId: req.userId },
    });
    if (!participant) return res.status(403).json({ success: false, message: 'Not a participant' });

    const message = await prisma.message.create({
      data: {
        conversationId: req.params.id,
        senderId: req.userId,
        content: content?.trim() || '',
        type,
        mediaUrl: mediaUrl || null,
      },
      include: { sender: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });

    // Update conversation lastMessage
    await prisma.conversation.update({
      where: { id: req.params.id },
      data: { lastMessage: content?.slice(0, 100) || `[${type}]`, lastMessageAt: new Date() },
    });

    // Emit via Socket.IO
    const io = req.app.get('io');
    if (io) {
      const conv = await prisma.conversation.findUnique({
        where: { id: req.params.id },
        select: { participants: { select: { userId: true } } },
      });
      conv?.participants.forEach(p => {
        if (p.userId !== req.userId) {
          io.to(`user:${p.userId}`).emit('message:new', { conversationId: req.params.id, message });
        }
      });
      io.to(`conv:${req.params.id}`).emit('message:new', { conversationId: req.params.id, message });
    }

    return created(res, message);
  } catch (err) { next(err); }
});

// GET /messaging/users — list users in same company to start chat with
router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { companyId: req.companyId, isActive: true, id: { not: req.userId } },
      select: { id: true, firstName: true, lastName: true, email: true, avatar: true, isOnline: true },
      orderBy: { firstName: 'asc' },
    });
    return success(res, users);
  } catch (err) { next(err); }
});

// POST /messaging/conversations/:id/join — join a Socket.IO room
router.post('/conversations/:id/join', async (req, res, next) => {
  try {
    return success(res, { room: `conv:${req.params.id}` });
  } catch (err) { next(err); }
});

module.exports = router;
