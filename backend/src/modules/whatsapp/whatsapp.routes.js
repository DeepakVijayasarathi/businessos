const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created, error } = require('../../utils/response');
const whatsappService = require('../../services/whatsapp.service');
const logger = require('../../config/logger');

/**
 * Records an inbound WhatsApp message and upserts its conversation thread.
 * Shared by every provider's webhook handler so the message-storage logic
 * (and therefore what shows up in the Messages UI) is identical regardless
 * of which BSP delivered it.
 */
async function recordInboundMessage({ companyId, fromPhone, toPhone, type, content, messageId }) {
  let conversationId = null;
  if (companyId) {
    let conversation = await prisma.conversation.findFirst({
      where: { companyId, type: 'whatsapp', phone: fromPhone },
    });
    const lastMessage = content?.slice(0, 100) || `[${type}]`;
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { companyId, type: 'whatsapp', phone: fromPhone, lastMessage, lastMessageAt: new Date() },
      });
    } else {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessage, lastMessageAt: new Date() },
      });
    }
    conversationId = conversation.id;
  }

  await prisma.whatsappMessage.create({
    data: {
      companyId,
      from: fromPhone,
      to: toPhone,
      type,
      content: content || '',
      direction: 'inbound',
      status: 'delivered',
      messageId,
      conversationId,
    },
  }).catch((err) => logger.warn(`Failed to record inbound WhatsApp message: ${err.message}`));
}

// ── Webhooks (public — must be registered BEFORE the authenticate guard
// below, since the provider's servers call these with no user auth token) ──

// Meta WhatsApp Cloud API — incoming messages
router.post('/webhook', async (req, res, next) => {
  try {
    const body = req.body;
    if (body?.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const phoneNumberId = change.value?.metadata?.phone_number_id;
          const messages = change.value?.messages || [];

          let companyId = null;
          if (phoneNumberId) {
            const company = await prisma.company.findFirst({
              where: { whatsappPhone: phoneNumberId },
              select: { id: true },
            });
            companyId = company?.id || null;
          }

          for (const msg of messages) {
            await recordInboundMessage({
              companyId,
              fromPhone: msg.from,
              toPhone: phoneNumberId,
              type: msg.type,
              content: msg.text?.body,
              messageId: msg.id,
            });
          }
        }
      }
    }
    res.status(200).json({ status: 'ok' });
  } catch (err) { next(err); }
});

// MSG91 — incoming messages. Implemented from MSG91's published webhook
// documentation, not verified against a live account; the exact payload
// shape may differ. On a shape we don't recognize, logs the raw body so
// it can be inspected and this parser adjusted.
router.post('/webhook/msg91', async (req, res, next) => {
  try {
    const body = req.body;
    // MSG91 webhook payloads have been observed both flat and nested under
    // `data` — handle both rather than assuming one.
    const payload = body?.data || body;
    const fromPhone = payload?.from || payload?.sender;
    const toPhone = payload?.to || payload?.integrated_number;
    const messageId = payload?.id || payload?.message_id;
    const type = payload?.type || 'text';
    const content = payload?.text?.body || payload?.message || payload?.body;

    if (!fromPhone) {
      logger.warn(`Unrecognized MSG91 webhook payload shape: ${JSON.stringify(body).slice(0, 500)}`);
      return res.status(200).json({ status: 'ignored' });
    }

    let companyId = null;
    if (toPhone) {
      const company = await prisma.company.findFirst({
        where: { whatsappPhone: toPhone, whatsappProvider: 'msg91' },
        select: { id: true },
      });
      companyId = company?.id || null;
    }

    await recordInboundMessage({ companyId, fromPhone, toPhone, type, content, messageId });
    res.status(200).json({ status: 'ok' });
  } catch (err) { next(err); }
});

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
    const existing = await prisma.whatsappTemplate.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return error(res, 'Template not found', 404);
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
      select: { whatsappApiKey: true, whatsappPhone: true, whatsappProvider: true },
    });

    if (!company?.whatsappApiKey) return error(res, 'WhatsApp not configured', 400);

    const audience = Array.isArray(campaign.audience) ? campaign.audience : [];
    let sent = 0, failed = 0;

    for (const phone of audience) {
      try {
        await whatsappService.sendTemplate({
          provider: company.whatsappProvider || 'meta',
          apiKey: company.whatsappApiKey,
          phone: company.whatsappPhone,
          to: phone,
          templateName: campaign.template.name,
          templateLanguage: campaign.template.language,
        });
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
      select: { whatsappApiKey: true, whatsappPhone: true, whatsappProvider: true },
    });

    if (!company?.whatsappApiKey) return error(res, 'WhatsApp not configured', 400);

    const { messageId } = await whatsappService.sendText({
      provider: company.whatsappProvider || 'meta',
      apiKey: company.whatsappApiKey,
      phone: company.whatsappPhone,
      to,
      message,
    });

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
        messageId,
        conversationId: conversation.id,
      },
    });

    return success(res, saved, 'Message sent');
  } catch (err) { next(err); }
});

module.exports = router;
