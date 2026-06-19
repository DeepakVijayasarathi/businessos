const router = require('express').Router();
const axios = require('axios');
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created, error } = require('../../utils/response');
const config = require('../../config');

router.use(authenticate, sameCompany);

// Templates
router.get('/templates', async (req, res, next) => {
  try {
    const templates = await prisma.whatsappTemplate.findMany({ where: { companyId: req.companyId } });
    return success(res, templates);
  } catch (err) { next(err); }
});

router.post('/templates', async (req, res, next) => {
  try {
    // Accept `body` or `content` from client, store as `content` in DB
    const { body, content, ...rest } = req.body;
    const template = await prisma.whatsappTemplate.create({
      data: { ...rest, content: content || body || null, companyId: req.companyId },
    });
    return created(res, template, 'Template created');
  } catch (err) { next(err); }
});

router.put('/templates/:id', async (req, res, next) => {
  try {
    // Accept `body` or `content` from client, store as `content` in DB
    const { body, content, ...rest } = req.body;
    const updateData = { ...rest };
    if (content !== undefined || body !== undefined) {
      updateData.content = content || body || null;
    }
    const template = await prisma.whatsappTemplate.update({ where: { id: req.params.id }, data: updateData });
    return success(res, template, 'Template updated');
  } catch (err) { next(err); }
});

// Campaigns
router.get('/campaigns', async (req, res, next) => {
  try {
    const campaigns = await prisma.whatsappCampaign.findMany({
      where: { companyId: req.companyId },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
    });
    return success(res, campaigns);
  } catch (err) { next(err); }
});

router.post('/campaigns', async (req, res, next) => {
  try {
    const campaign = await prisma.whatsappCampaign.create({
      data: { ...req.body, companyId: req.companyId },
    });
    return created(res, campaign, 'Campaign created');
  } catch (err) { next(err); }
});

router.post('/campaigns/:id/send', async (req, res, next) => {
  try {
    const campaign = await prisma.whatsappCampaign.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { template: true },
    });
    if (!campaign) return error(res, 'Campaign not found', 404);

    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { whatsappApiKey: true, whatsappPhone: true },
    });

    if (!company?.whatsappApiKey) return error(res, 'WhatsApp not configured', 400);

    const audience = Array.isArray(campaign.audience) ? campaign.audience : [];
    let sent = 0, failed = 0;

    for (const phone of audience) {
      try {
        await axios.post(
          `${config.whatsapp.apiUrl}/${company.whatsappPhone}/messages`,
          {
            messaging_product: 'whatsapp',
            to: phone,
            type: 'template',
            template: { name: campaign.template.name, language: { code: campaign.template.language } },
          },
          { headers: { Authorization: `Bearer ${company.whatsappApiKey}` } }
        );
        sent++;
      } catch { failed++; }
    }

    await prisma.whatsappCampaign.update({
      where: { id: campaign.id },
      data: { status: 'sent', sentAt: new Date(), totalSent: sent, failed },
    });

    return success(res, { sent, failed }, 'Campaign sent');
  } catch (err) { next(err); }
});

// Messages
router.get('/messages', async (req, res, next) => {
  try {
    const { contactId, phone, page = 1, limit = 50 } = req.query;
    const messages = await prisma.whatsappMessage.findMany({
      where: {
        companyId: req.companyId,
        ...(phone && { OR: [{ from: phone }, { to: phone }] }),
        ...(contactId && { contactId }),
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
    });
    return success(res, messages.reverse());
  } catch (err) { next(err); }
});

// Send message
router.post('/send', async (req, res, next) => {
  try {
    const { to, message, type = 'text' } = req.body;
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { whatsappApiKey: true, whatsappPhone: true },
    });

    if (!company?.whatsappApiKey) return error(res, 'WhatsApp not configured', 400);

    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message },
    };

    const response = await axios.post(
      `${config.whatsapp.apiUrl}/${company.whatsappPhone}/messages`,
      payload,
      { headers: { Authorization: `Bearer ${company.whatsappApiKey}` } }
    );

    // Find or create a WhatsApp conversation record for this phone thread
    let conversation = await prisma.conversation.findFirst({
      where: { companyId: req.companyId, type: 'whatsapp', phone: to },
    });
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          companyId: req.companyId,
          type: 'whatsapp',
          phone: to,
          lastMessage: message?.slice(0, 100) || `[${type}]`,
          lastMessageAt: new Date(),
        },
      });
    } else {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessage: message?.slice(0, 100) || `[${type}]`, lastMessageAt: new Date() },
      });
    }

    const saved = await prisma.whatsappMessage.create({
      data: {
        companyId: req.companyId,
        from: company.whatsappPhone,
        to,
        type,
        content: message,
        direction: 'outbound',
        status: 'sent',
        messageId: response.data?.messages?.[0]?.id,
        conversationId: conversation.id,
      },
    });

    return success(res, saved, 'Message sent');
  } catch (err) { next(err); }
});

// Webhook (public — no auth middleware applied here since router.use(authenticate) is at top,
// but webhook must be public. We handle this by placing webhook BEFORE the router.use guard.
// The webhook route is registered directly in server.js as a separate public handler below.)
router.post('/webhook', async (req, res, next) => {
  try {
    const body = req.body;
    if (body?.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const phoneNumberId = change.value?.metadata?.phone_number_id;
          const messages = change.value?.messages || [];

          // Look up the company by their WhatsApp phone number ID
          let companyId = null;
          if (phoneNumberId) {
            const company = await prisma.company.findFirst({
              where: { whatsappPhone: phoneNumberId },
              select: { id: true },
            });
            companyId = company?.id || null;
          }

          for (const msg of messages) {
            const fromPhone = msg.from;

            // Find or create a conversation for this inbound thread
            let conversationId = null;
            if (companyId) {
              let conversation = await prisma.conversation.findFirst({
                where: { companyId, type: 'whatsapp', phone: fromPhone },
              });
              if (!conversation) {
                conversation = await prisma.conversation.create({
                  data: {
                    companyId,
                    type: 'whatsapp',
                    phone: fromPhone,
                    lastMessage: msg.text?.body?.slice(0, 100) || `[${msg.type}]`,
                    lastMessageAt: new Date(),
                  },
                });
              } else {
                await prisma.conversation.update({
                  where: { id: conversation.id },
                  data: {
                    lastMessage: msg.text?.body?.slice(0, 100) || `[${msg.type}]`,
                    lastMessageAt: new Date(),
                  },
                });
              }
              conversationId = conversation.id;
            }

            await prisma.whatsappMessage.create({
              data: {
                companyId,
                from: fromPhone,
                to: phoneNumberId,
                type: msg.type,
                content: msg.text?.body || '',
                direction: 'inbound',
                status: 'delivered',
                messageId: msg.id,
                conversationId,
              },
            }).catch(() => {});
          }
        }
      }
    }
    res.status(200).json({ status: 'ok' });
  } catch (err) { next(err); }
});

module.exports = router;
