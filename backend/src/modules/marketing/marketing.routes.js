const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../../config/prisma');
const { authenticate, sameCompany, optionalAuth } = require('../../middleware/auth');
const { success, created, notFound, error } = require('../../utils/response');
const { slugify, paginate, paginateMeta, pick } = require('../../utils/helpers');

const PAGE_WRITABLE_FIELDS = ['name', 'content', 'seoTitle', 'seoDesc', 'isPublished'];
const FORM_WRITABLE_FIELDS = ['landingPageId', 'name', 'fields', 'successMessage', 'redirectUrl', 'isActive'];
const { generateImage, editImage, callAI } = require('../../services/ai.service');
const logger = require('../../config/logger');

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
    if (!req.body.name) return error(res, 'Page name is required', 400);
    const slug = slugify(req.body.name);
    const page = await prisma.landingPage.create({
      data: { ...pick(req.body, PAGE_WRITABLE_FIELDS), companyId: req.companyId, slug: `${slug}-${Date.now()}` },
    });
    return created(res, page, 'Page created');
  } catch (err) { next(err); }
});

router.put('/pages/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.landingPage.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Page not found');
    const page = await prisma.landingPage.update({ where: { id: req.params.id }, data: pick(req.body, PAGE_WRITABLE_FIELDS) });
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
    if (!req.body.name) return error(res, 'Form name is required', 400);
    const form = await prisma.marketingForm.create({ data: { ...pick(req.body, FORM_WRITABLE_FIELDS), companyId: req.companyId } });
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
      }).catch((err) => { logger.warn(`Failed to auto-create lead from form submission: ${err.message}`); return null; });

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
    const { buffer } = await generateImage({
      prompt: prompt.trim(),
      companyOpenaiKey: company?.openaiKey,
      size: ['1024x1024', '1024x1792', '1792x1024'].includes(size) ? size : '1024x1024',
    });

    const filename = `${uuidv4()}.png`;
    fs.writeFileSync(path.join(uploadDir, filename), buffer);

    return success(res, { url: `/uploads/${filename}` }, 'Image generated');
  } catch (err) {
    if (err.message?.includes('OpenAI API key')) return error(res, err.message, 400);
    next(err);
  }
});

// POST /posters/edit-image — modify an existing generated/uploaded image with a prompt
router.post('/posters/edit-image', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { imageUrl, prompt } = req.body;
    if (!prompt || !prompt.trim()) return error(res, 'Describe the change you want to make', 400);
    if (!imageUrl) return error(res, 'imageUrl is required', 400);

    // Only basename — never trust a client-supplied path
    const filename = path.basename(new URL(imageUrl, 'http://x').pathname);
    if (!/^[\w-]+\.(png|jpg|jpeg|webp)$/i.test(filename)) return error(res, 'Invalid image reference', 400);
    const imagePath = path.join(uploadDir, filename);

    const company = await prisma.company.findUnique({ where: { id: req.companyId }, select: { openaiKey: true } });
    const { buffer } = await editImage({ prompt: prompt.trim(), imagePath, companyOpenaiKey: company?.openaiKey });

    const newFilename = `${uuidv4()}.png`;
    fs.writeFileSync(path.join(uploadDir, newFilename), buffer);
    return success(res, { url: `/uploads/${newFilename}` }, 'Image edited');
  } catch (err) { next(err); }
});

// PUT /posters/:id — update a saved poster (e.g. swap in an edited image)
router.put('/posters/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.poster.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Poster not found');
    const { title, subtitle, imageUrl, primaryColor, secondaryColor } = req.body;
    const poster = await prisma.poster.update({
      where: { id: req.params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(subtitle !== undefined && { subtitle }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(primaryColor !== undefined && { primaryColor }),
        ...(secondaryColor !== undefined && { secondaryColor }),
      },
    });
    return success(res, poster, 'Poster updated');
  } catch (err) { next(err); }
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
    }).catch((err) => logger.warn(`Failed to log poster_created marketing activity: ${err.message}`));

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

// ── Campaigns ────────────────────────────────────────────────
const CAMPAIGN_WRITABLE = ['name', 'type', 'status', 'channel', 'budget', 'spent', 'startDate', 'endDate', 'description', 'targetUrl', 'impressions', 'clicks', 'conversions', 'leads', 'revenue'];

router.get('/campaigns', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { status, type } = req.query;
    const where = {
      companyId: req.companyId,
      ...(status && { status }),
      ...(type && { type }),
    };
    const campaigns = await prisma.campaign.findMany({
      where,
      include: { _count: { select: { posts: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return success(res, campaigns);
  } catch (err) { next(err); }
});

router.post('/campaigns', authenticate, sameCompany, async (req, res, next) => {
  try {
    if (!req.body.name) return error(res, 'Campaign name is required', 400);
    const data = pick(req.body, CAMPAIGN_WRITABLE);
    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.endDate) data.endDate = new Date(data.endDate);
    const campaign = await prisma.campaign.create({ data: { ...data, companyId: req.companyId } });
    return created(res, campaign, 'Campaign created');
  } catch (err) { next(err); }
});

router.put('/campaigns/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.campaign.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Campaign not found');
    const data = pick(req.body, CAMPAIGN_WRITABLE);
    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.endDate) data.endDate = new Date(data.endDate);
    const campaign = await prisma.campaign.update({ where: { id: req.params.id }, data });
    return success(res, campaign, 'Campaign updated');
  } catch (err) { next(err); }
});

router.delete('/campaigns/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.campaign.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Campaign not found');
    await prisma.campaign.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Campaign deleted');
  } catch (err) { next(err); }
});

// ── Social Posts ─────────────────────────────────────────────
const SOCIAL_POST_WRITABLE = ['campaignId', 'platform', 'content', 'mediaUrl', 'hashtags', 'scheduledAt', 'publishedAt', 'status', 'likes', 'shares', 'comments', 'reach'];

router.get('/social-posts', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { platform, status, campaignId } = req.query;
    const where = {
      companyId: req.companyId,
      ...(platform && { platform }),
      ...(status && { status }),
      ...(campaignId && { campaignId }),
    };
    const posts = await prisma.socialPost.findMany({
      where,
      include: { campaign: { select: { id: true, name: true } } },
      orderBy: { scheduledAt: 'desc' },
    });
    return success(res, posts);
  } catch (err) { next(err); }
});

router.post('/social-posts', authenticate, sameCompany, async (req, res, next) => {
  try {
    if (!req.body.content) return error(res, 'Post content is required', 400);
    if (!req.body.platform) return error(res, 'Platform is required', 400);
    const data = pick(req.body, SOCIAL_POST_WRITABLE);
    if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt);
    if (data.publishedAt) data.publishedAt = new Date(data.publishedAt);
    if (!data.campaignId) delete data.campaignId;
    const post = await prisma.socialPost.create({ data: { ...data, companyId: req.companyId } });
    return created(res, post, 'Post created');
  } catch (err) { next(err); }
});

router.put('/social-posts/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.socialPost.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Post not found');
    const data = pick(req.body, SOCIAL_POST_WRITABLE);
    if (data.scheduledAt) data.scheduledAt = new Date(data.scheduledAt);
    if (data.publishedAt) data.publishedAt = new Date(data.publishedAt);
    if (data.campaignId === '') data.campaignId = null;
    const post = await prisma.socialPost.update({ where: { id: req.params.id }, data });
    return success(res, post, 'Post updated');
  } catch (err) { next(err); }
});

router.delete('/social-posts/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.socialPost.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Post not found');
    await prisma.socialPost.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Post deleted');
  } catch (err) { next(err); }
});

// ── COMPETITOR ANALYSIS ──────────────────────────────────────

router.get('/competitors', authenticate, sameCompany, async (req, res, next) => {
  try {
    const competitors = await prisma.competitor.findMany({
      where: { companyId: req.companyId },
      orderBy: { createdAt: 'desc' },
    });
    return success(res, competitors);
  } catch (err) { next(err); }
});

router.post('/competitors', authenticate, sameCompany, async (req, res, next) => {
  try {
    const FIELDS = ['name', 'website', 'industry', 'description', 'monthlyTraffic', 'domainAuthority', 'socialFollowers', 'adPlatforms', 'topKeywords', 'strengths', 'weaknesses', 'notes', 'status'];
    const competitor = await prisma.competitor.create({
      data: { ...pick(req.body, FIELDS), companyId: req.companyId, lastUpdated: new Date() },
    });
    return created(res, competitor, 'Competitor added');
  } catch (err) { next(err); }
});

router.put('/competitors/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.competitor.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Competitor not found');
    const FIELDS = ['name', 'website', 'industry', 'description', 'monthlyTraffic', 'domainAuthority', 'socialFollowers', 'adPlatforms', 'topKeywords', 'strengths', 'weaknesses', 'notes', 'status'];
    const competitor = await prisma.competitor.update({
      where: { id: req.params.id },
      data: { ...pick(req.body, FIELDS), lastUpdated: new Date() },
    });
    return success(res, competitor, 'Competitor updated');
  } catch (err) { next(err); }
});

router.delete('/competitors/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.competitor.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Competitor not found');
    await prisma.competitor.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Competitor deleted');
  } catch (err) { next(err); }
});

// ── KEYWORD RESEARCH ─────────────────────────────────────────

router.get('/keywords', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { status, intent, tag } = req.query;
    const keywords = await prisma.keywordResearch.findMany({
      where: {
        companyId: req.companyId,
        ...(status && { status }),
        ...(intent && { intent }),
        ...(tag && { tags: { has: tag } }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return success(res, keywords);
  } catch (err) { next(err); }
});

router.post('/keywords', authenticate, sameCompany, async (req, res, next) => {
  try {
    const FIELDS = ['keyword', 'searchVolume', 'difficulty', 'cpc', 'currentRank', 'targetRank', 'targetUrl', 'intent', 'status', 'tags', 'notes'];
    const kw = await prisma.keywordResearch.create({
      data: { ...pick(req.body, FIELDS), companyId: req.companyId },
    });
    return created(res, kw, 'Keyword added');
  } catch (err) { next(err); }
});

router.put('/keywords/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.keywordResearch.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Keyword not found');
    const FIELDS = ['keyword', 'searchVolume', 'difficulty', 'cpc', 'currentRank', 'targetRank', 'targetUrl', 'intent', 'status', 'tags', 'notes', 'lastChecked'];
    const kw = await prisma.keywordResearch.update({ where: { id: req.params.id }, data: pick(req.body, FIELDS) });
    return success(res, kw, 'Keyword updated');
  } catch (err) { next(err); }
});

router.delete('/keywords/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.keywordResearch.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Keyword not found');
    await prisma.keywordResearch.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Keyword deleted');
  } catch (err) { next(err); }
});

// ── AI Marketing Endpoints ────────────────────────────────────────────────────

async function getCompanyAI(companyId) {
  return prisma.company.findUnique({ where: { id: companyId }, select: { anthropicKey: true, openaiKey: true, aiProvider: true } });
}

function parseAIJson(text) {
  return JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
}

router.post('/ai/social-post', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { topic, platform } = req.body;
    if (!topic?.trim()) return error(res, 'Topic is required', 400);
    const company = await getCompanyAI(req.companyId);
    const hints = { instagram: 'casual and visual', linkedin: 'professional and insightful', twitter: 'punchy under 280 chars', facebook: 'conversational and shareable', youtube: 'descriptive and keyword-rich', tiktok: 'trendy and energetic' };
    const result = await callAI({
      messages: [{ role: 'user', content: `Write a ${platform || 'social media'} post about: ${topic}\n\nTone: ${hints[platform] || 'engaging'}\n\nReturn JSON only: { "content": "...", "hashtags": "..." }` }],
      system: 'You are a social media expert. Return only valid JSON with "content" and "hashtags" keys. Hashtags should be space-separated.',
      companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider, maxTokens: 1024,
    });
    return success(res, parseAIJson(result.text));
  } catch (err) { next(err); }
});

router.post('/ai/campaign', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { goal, type, channel } = req.body;
    if (!goal?.trim()) return error(res, 'Campaign goal is required', 400);
    const company = await getCompanyAI(req.companyId);
    const today = new Date().toISOString().slice(0, 10);
    const result = await callAI({
      messages: [{ role: 'user', content: `Create a marketing campaign plan.\nGoal: ${goal}\nType: ${type || 'any'}, Channel: ${channel || 'any'}\nToday: ${today}\n\nReturn JSON only: { "name": "...", "description": "...", "budget": 5000, "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }` }],
      system: 'You are a marketing strategist. Return only valid JSON. Budget is a realistic USD number. Dates must be YYYY-MM-DD format, starting from today, typically 30-90 day campaigns.',
      companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider, maxTokens: 1024,
    });
    return success(res, parseAIJson(result.text));
  } catch (err) { next(err); }
});

router.post('/ai/page-copy', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { description, cta } = req.body;
    if (!description?.trim()) return error(res, 'Page description is required', 400);
    const company = await getCompanyAI(req.companyId);
    const result = await callAI({
      messages: [{ role: 'user', content: `Write landing page HTML content.\nOffer: ${description}\nCTA: ${cta || 'Get Started'}\n\nReturn JSON only: { "content": "<html body content>" }` }],
      system: 'You are a conversion copywriter. Write clean semantic HTML5 for a landing page body with hero, benefits, social proof, and CTA sections. Return only valid JSON.',
      companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider, maxTokens: 2048,
    });
    return success(res, parseAIJson(result.text));
  } catch (err) { next(err); }
});

router.post('/ai/keywords', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { topic, count = 10 } = req.body;
    if (!topic?.trim()) return error(res, 'Topic is required', 400);
    const company = await getCompanyAI(req.companyId);
    const result = await callAI({
      messages: [{ role: 'user', content: `Suggest ${count} SEO keywords for: ${topic}\n\nReturn a JSON array only: [{ "keyword": "...", "searchVolume": 0, "difficulty": 0, "intent": "informational|commercial|transactional|navigational", "cpc": 0.00 }]` }],
      system: 'You are an SEO expert. Return only a valid JSON array. searchVolume is estimated monthly US searches. difficulty is 0-100. cpc is in USD.',
      companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider, maxTokens: 2048,
    });
    return success(res, parseAIJson(result.text));
  } catch (err) { next(err); }
});

router.post('/ai/competitor', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { name, website, industry } = req.body;
    if (!name?.trim()) return error(res, 'Competitor name is required', 400);
    const company = await getCompanyAI(req.companyId);
    const myCompany = await prisma.company.findUnique({ where: { id: req.companyId }, select: { name: true, industry: true } });
    const prompt = `You are a senior competitive intelligence analyst. Analyze the competitor "${name}"${website ? ` (${website})` : ''}${industry ? ` in the ${industry} industry` : ''}.
${myCompany?.name ? `Our company: "${myCompany.name}"${myCompany.industry ? ` in the ${myCompany.industry} industry` : ''}` : ''}

Provide a detailed, realistic analysis. Return ONLY a valid JSON object:
{
  "industry": "detected industry / niche",
  "description": "2-3 sentence company overview",
  "monthlyTraffic": <estimated monthly website visitors as integer, e.g. 250000>,
  "domainAuthority": <Moz DA score 1-100 as integer>,
  "adPlatforms": ["platform1", "platform2"],
  "topKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "strengths": "Key strengths and competitive advantages (2-3 points)",
  "weaknesses": "Weaknesses, gaps, or areas where they fall short (2-3 points)",
  "notes": "Strategic notes: how to position against them"
}
All values must be realistic estimates based on known data about the company. monthlyTraffic and domainAuthority must be integers. Arrays must have at least 3 items.`;

    const result = await callAI({
      messages: [{ role: 'user', content: prompt }],
      system: 'You are a competitive intelligence analyst. Return only valid JSON. Never wrap in markdown. Use realistic, data-informed estimates.',
      companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider, maxTokens: 1500,
    });
    return success(res, parseAIJson(result.text));
  } catch (err) { next(err); }
});

module.exports = router;
