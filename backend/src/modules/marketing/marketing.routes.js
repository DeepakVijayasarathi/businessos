const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../../config/prisma');
const { authenticate, sameCompany, optionalAuth } = require('../../middleware/auth');
const { success, created, notFound, error } = require('../../utils/response');
const { slugify, paginate, paginateMeta } = require('../../utils/helpers');
const { generateImage } = require('../../services/ai.service');

const uploadDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const posterUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    if (!allowed.includes(path.extname(file.originalname).toLowerCase())) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

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
    const existing = await prisma.landingPage.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Page not found');
    const page = await prisma.landingPage.update({ where: { id: req.params.id }, data: req.body });
    return success(res, page, 'Page updated');
  } catch (err) { next(err); }
});

router.delete('/pages/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.landingPage.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Page not found');
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

// Posters
router.get('/posters', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = { companyId: req.companyId };
    const [posters, total] = await Promise.all([
      prisma.poster.findMany({ where, take, skip, orderBy: { createdAt: 'desc' } }),
      prisma.poster.count({ where }),
    ]);
    return res.json({ success: true, data: posters, meta: paginateMeta(total, page, limit) });
  } catch (err) { next(err); }
});

router.post('/posters/upload-image', authenticate, sameCompany, (req, res, next) => {
  posterUpload.single('image')(req, res, (err) => {
    if (err) return error(res, err.message || 'Image upload failed', 400);
    if (!req.file) return error(res, 'No image uploaded', 400);
    return success(res, { url: `/uploads/${req.file.filename}` }, 'Image uploaded');
  });
});

router.post('/posters/generate-image', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { prompt, size } = req.body;
    if (!prompt || !prompt.trim()) return error(res, 'A description of the poster is required', 400);

    const company = await prisma.company.findUnique({ where: { id: req.companyId }, select: { openaiKey: true } });
    const { url: remoteUrl } = await generateImage({
      prompt: prompt.trim(),
      companyOpenaiKey: company?.openaiKey,
      size: ['1024x1024', '1024x1792', '1792x1024'].includes(size) ? size : '1024x1024',
    });

    // OpenAI's image URL expires after ~1 hour — download and persist locally.
    const imgResponse = await axios.get(remoteUrl, { responseType: 'arraybuffer', timeout: 30000 });
    const filename = `${uuidv4()}.png`;
    fs.writeFileSync(path.join(uploadDir, filename), imgResponse.data);

    return success(res, { url: `/uploads/${filename}` }, 'Image generated');
  } catch (err) {
    if (err.message?.includes('OpenAI API key')) return error(res, err.message, 400);
    next(err);
  }
});

router.post('/posters', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { title, subtitle, templateKey, primaryColor, secondaryColor, imageUrl } = req.body;
    if (!title || !templateKey) return error(res, 'Title and template are required', 400);

    const poster = await prisma.poster.create({
      data: {
        companyId: req.companyId,
        createdById: req.userId,
        title,
        subtitle: subtitle || null,
        templateKey,
        primaryColor: primaryColor || '#6366f1',
        secondaryColor: secondaryColor || '#8b5cf6',
        imageUrl: imageUrl || null,
      },
    });

    await prisma.marketingActivity.create({
      data: {
        companyId: req.companyId,
        userId: req.userId,
        type: 'poster_created',
        title: `Created poster "${title}"`,
      },
    }).catch(() => {});

    return created(res, poster, 'Poster saved');
  } catch (err) { next(err); }
});

router.delete('/posters/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.poster.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Poster not found');
    await prisma.poster.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Poster deleted');
  } catch (err) { next(err); }
});

// Marketing Activities
router.get('/activities', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { type } = req.query;
    const activities = await prisma.marketingActivity.findMany({
      where: { companyId: req.companyId, ...(type && { type }) },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return success(res, activities);
  } catch (err) { next(err); }
});

router.post('/activities', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { type, title, notes } = req.body;
    if (!type || !title) return error(res, 'Type and title are required', 400);
    const activity = await prisma.marketingActivity.create({
      data: { companyId: req.companyId, userId: req.userId, type, title, notes: notes || null },
    });
    return created(res, activity, 'Activity logged');
  } catch (err) { next(err); }
});

router.delete('/activities/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.marketingActivity.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Activity not found');
    await prisma.marketingActivity.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Activity deleted');
  } catch (err) { next(err); }
});

module.exports = router;
