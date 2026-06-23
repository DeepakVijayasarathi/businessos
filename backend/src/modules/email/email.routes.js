const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created, notFound } = require('../../utils/response');
const emailService = require('../../services/email.service');

router.use(authenticate, sameCompany);

router.get('/templates', async (req, res, next) => {
  try {
    const templates = await prisma.emailTemplate.findMany({ where: { companyId: req.companyId } });
    return success(res, templates);
  } catch (err) { next(err); }
});

router.post('/templates', async (req, res, next) => {
  try {
    const template = await prisma.emailTemplate.create({ data: { ...req.body, companyId: req.companyId } });
    return created(res, template, 'Template created');
  } catch (err) { next(err); }
});

router.put('/templates/:id', async (req, res, next) => {
  try {
    const existing = await prisma.emailTemplate.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Template not found');
    const template = await prisma.emailTemplate.update({ where: { id: req.params.id }, data: req.body });
    return success(res, template, 'Template updated');
  } catch (err) { next(err); }
});

router.delete('/templates/:id', async (req, res, next) => {
  try {
    const existing = await prisma.emailTemplate.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Template not found');
    await prisma.emailTemplate.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Template deleted');
  } catch (err) { next(err); }
});

router.get('/campaigns', async (req, res, next) => {
  try {
    const campaigns = await prisma.emailCampaign.findMany({
      where: { companyId: req.companyId },
      include: { template: true },
      orderBy: { createdAt: 'desc' },
    });
    return success(res, campaigns);
  } catch (err) { next(err); }
});

router.post('/campaigns', async (req, res, next) => {
  try {
    const { templateId } = req.body;
    const template = await prisma.emailTemplate.findFirst({ where: { id: templateId, companyId: req.companyId } });
    if (!template) return notFound(res, 'Template not found');
    const campaign = await prisma.emailCampaign.create({ data: { ...req.body, companyId: req.companyId } });
    return created(res, campaign, 'Campaign created');
  } catch (err) { next(err); }
});

router.post('/campaigns/:id/send', async (req, res, next) => {
  try {
    const campaign = await prisma.emailCampaign.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { template: true },
    });
    if (!campaign) return notFound(res, 'Campaign not found');

    const smtpConfig = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { smtpHost: true, smtpUser: true },
    });
    const globalSmtp = require('../../config').smtp;
    if (!smtpConfig?.smtpHost && !globalSmtp.host) {
      return res.status(400).json({ success: false, message: 'SMTP not configured — add SMTP credentials in Settings before sending campaigns' });
    }

    const audience = Array.isArray(campaign.audience) ? campaign.audience : [];
    const result = await emailService.sendCampaign({
      templateId: campaign.templateId,
      audience,
      subject: campaign.subject,
      fromName: campaign.fromName,
      fromEmail: campaign.fromEmail,
      companyId: campaign.template.companyId,
    });

    await prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: { status: 'sent', sentAt: new Date(), totalSent: result.sent },
    });

    return success(res, result, 'Campaign sent');
  } catch (err) { next(err); }
});

router.post('/send', async (req, res, next) => {
  try {
    const { to, subject, body, fromName, fromEmail } = req.body;
    await emailService.send({
      to,
      subject,
      html: body,
      from: fromName && fromEmail ? `${fromName} <${fromEmail}>` : undefined,
      companyId: req.companyId,
    });
    return success(res, {}, 'Email sent');
  } catch (err) { next(err); }
});

module.exports = router;
