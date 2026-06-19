const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany, optionalAuth } = require('../../middleware/auth');
const { success, created } = require('../../utils/response');
const { slugify } = require('../../utils/helpers');

// Landing Pages
router.get('/pages', authenticate, sameCompany, async (req, res, next) => {
  try {
    const pages = await prisma.landingPage.findMany({ where: { companyId: req.companyId } });
    return success(res, pages);
  } catch (err) { next(err); }
});

router.get('/pages/:slug', optionalAuth, async (req, res, next) => {
  try {
    const page = await prisma.landingPage.findFirst({
      where: { slug: req.params.slug, isPublished: true },
      include: { forms: true },
    });
    if (page) {
      await prisma.landingPage.update({ where: { id: page.id }, data: { visits: { increment: 1 } } });
    }
    return success(res, page);
  } catch (err) { next(err); }
});

router.post('/pages', authenticate, sameCompany, async (req, res, next) => {
  try {
    const slug = slugify(req.body.name);
    const page = await prisma.landingPage.create({
      data: { ...req.body, companyId: req.companyId, slug: `${slug}-${Date.now()}` },
    });
    return created(res, page, 'Page created');
  } catch (err) { next(err); }
});

router.put('/pages/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const page = await prisma.landingPage.update({ where: { id: req.params.id }, data: req.body });
    return success(res, page, 'Page updated');
  } catch (err) { next(err); }
});

router.delete('/pages/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    await prisma.landingPage.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Page deleted');
  } catch (err) { next(err); }
});

// Forms
router.get('/forms', authenticate, sameCompany, async (req, res, next) => {
  try {
    const forms = await prisma.marketingForm.findMany({
      where: { companyId: req.companyId },
      include: { _count: { select: { leads: true } } },
    });
    return success(res, forms);
  } catch (err) { next(err); }
});

router.post('/forms', authenticate, sameCompany, async (req, res, next) => {
  try {
    const form = await prisma.marketingForm.create({ data: { ...req.body, companyId: req.companyId } });
    return created(res, form, 'Form created');
  } catch (err) { next(err); }
});

// Form submissions (public)
router.post('/forms/:id/submit', optionalAuth, async (req, res, next) => {
  try {
    const form = await prisma.marketingForm.findUnique({ where: { id: req.params.id } });
    if (!form || !form.isActive) return res.status(404).json({ success: false, message: 'Form not found' });

    const submission = await prisma.formSubmission.create({
      data: {
        formId: form.id,
        data: req.body,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        utmSource: req.query.utm_source,
        utmMedium: req.query.utm_medium,
        utmCampaign: req.query.utm_campaign,
      },
    });

    await prisma.marketingForm.update({ where: { id: form.id }, data: { submissions: { increment: 1 } } });

    // Auto-create lead
    if (req.body.email || req.body.phone) {
      const lead = await prisma.lead.create({
        data: {
          companyId: form.companyId,
          firstName: req.body.firstName || req.body.name?.split(' ')[0] || 'Unknown',
          lastName: req.body.lastName || req.body.name?.split(' ').slice(1).join(' ') || '',
          email: req.body.email,
          phone: req.body.phone,
          source: 'website',
          status: 'new',
        },
      }).catch(() => null);

      if (lead) {
        await prisma.formSubmission.update({ where: { id: submission.id }, data: { leadId: lead.id } });
      }
    }

    return success(res, { message: form.successMessage || 'Thank you for your submission!' });
  } catch (err) { next(err); }
});

router.get('/forms/:id/submissions', authenticate, sameCompany, async (req, res, next) => {
  try {
    const submissions = await prisma.formSubmission.findMany({
      where: { formId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    return success(res, submissions);
  } catch (err) { next(err); }
});

module.exports = router;
