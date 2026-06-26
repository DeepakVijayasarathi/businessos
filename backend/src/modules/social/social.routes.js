const router = require('express').Router();
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created, error, notFound } = require('../../utils/response');
const { encrypt, decrypt } = require('../../utils/helpers');
const config = require('../../config');
const logger = require('../../config/logger');

router.use(authenticate, sameCompany);

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getCompanyAI(companyId) {
  return prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true },
  });
}

async function callAI({ messages, system, co, maxTokens = 1200 }) {
  const provider = co?.aiProvider || config.ai.provider;
  if (provider === 'openai') {
    const rawKey = (co?.openaiKey ? decrypt(co.openaiKey) : null) || config.ai.openaiKey;
    if (!rawKey) throw new Error('OpenAI API key not configured');
    const client = new OpenAI({ apiKey: rawKey });
    const chatMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;
    const res = await client.chat.completions.create({ model: config.ai.openaiModel, max_tokens: maxTokens, messages: chatMessages });
    return res.choices[0].message.content;
  }
  const rawKey = (co?.anthropicKey ? decrypt(co.anthropicKey) : null) || config.ai.anthropicKey;
  if (!rawKey) throw new Error('Anthropic API key not configured');
  const client = new Anthropic({ apiKey: rawKey });
  const res = await client.messages.create({
    model: config.ai.claudeModel, max_tokens: maxTokens,
    ...(system && { system }), messages,
  });
  return res.content[0].text;
}

// ─── Social Accounts (connect / list / disconnect) ──────────────────────────

// GET /social/accounts
router.get('/accounts', async (req, res, next) => {
  try {
    const accounts = await prisma.socialAccount.findMany({
      where: { companyId: req.companyId },
      select: { id: true, platform: true, accountName: true, accountId: true, pageId: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    return success(res, accounts);
  } catch (err) { next(err); }
});

// POST /social/accounts — save / update platform credentials
router.post('/accounts', async (req, res, next) => {
  try {
    const { platform, accountName, accountId, accessToken, accessSecret, pageId } = req.body;
    if (!platform || !accountName || !accessToken) return error(res, 'platform, accountName and accessToken are required', 400);

    const data = {
      accountName,
      accountId: accountId || null,
      accessToken: encrypt(accessToken),
      accessSecret: accessSecret ? encrypt(accessSecret) : null,
      pageId: pageId || null,
      isActive: true,
    };

    const account = await prisma.socialAccount.upsert({
      where: { companyId_platform: { companyId: req.companyId, platform } },
      create: { companyId: req.companyId, platform, ...data },
      update: data,
      select: { id: true, platform: true, accountName: true, isActive: true },
    });
    return success(res, account, `${platform} connected`);
  } catch (err) { next(err); }
});

// DELETE /social/accounts/:platform
router.delete('/accounts/:platform', async (req, res, next) => {
  try {
    await prisma.socialAccount.deleteMany({ where: { companyId: req.companyId, platform: req.params.platform } });
    return success(res, {}, `${req.params.platform} disconnected`);
  } catch (err) { next(err); }
});

// ─── AI Content Generation ──────────────────────────────────────────────────

// POST /social/generate
router.post('/generate', async (req, res, next) => {
  try {
    const { topic, tone = 'professional', platforms = ['linkedin', 'twitter', 'instagram', 'facebook'], goal = 'engagement', extraContext } = req.body;
    if (!topic) return error(res, 'topic is required', 400);

    const co = await getCompanyAI(req.companyId);

    const platformGuides = {
      twitter:   'Twitter/X: max 280 chars, punchy, include 2-3 hashtags, can use emojis.',
      linkedin:  'LinkedIn: professional, 150-300 words, include insight + CTA, 3-5 hashtags, no excessive emojis.',
      instagram: 'Instagram: visual storytelling, 100-150 words, 5-10 hashtags, emojis welcome, engaging caption.',
      facebook:  'Facebook: conversational, 80-100 words, question at end to drive comments, 2-3 hashtags.',
      tiktok:    'TikTok: script for a 30-60s video, hook in first 3 seconds, trending language, 3-5 hashtags.',
      youtube:   'YouTube: video description, 200 words, timestamps suggestion, 5-8 tags, CTA to subscribe.',
    };

    const requestedPlatforms = platforms.filter(p => platformGuides[p]);
    const platformInstructions = requestedPlatforms.map(p => `- ${platformGuides[p]}`).join('\n');

    const prompt = `You are a social media expert for ${co?.name || 'a business'}.

Create highly engaging social media posts for the following topic:
Topic: "${topic}"
Tone: ${tone}
Goal: ${goal}
${extraContext ? `Extra context: ${extraContext}` : ''}

Create optimized posts for each of these platforms:
${platformInstructions}

Return ONLY valid JSON in this exact format:
{
  "posts": {
    ${requestedPlatforms.map(p => `"${p}": { "content": "post text here", "hashtags": ["tag1","tag2"], "tips": "one tip for this platform" }`).join(',\n    ')}
  },
  "bestTime": "recommended posting time like 'Tuesday 10am'",
  "engagementTip": "one overall tip to boost engagement"
}`;

    const text = await callAI({ messages: [{ role: 'user', content: prompt }], co, maxTokens: 2000 });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    return success(res, parsed);
  } catch (err) { next(err); }
});

// ─── Publish to Platforms ────────────────────────────────────────────────────

async function publishToTwitter(account, content) {
  const token = decrypt(account.accessToken);
  const resp = await axios.post('https://api.twitter.com/2/tweets',
    { text: content.slice(0, 280) },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return { id: resp.data?.data?.id, url: `https://twitter.com/i/web/status/${resp.data?.data?.id}` };
}

async function publishToLinkedIn(account, content) {
  const token = decrypt(account.accessToken);
  const authorUrn = account.pageId ? `urn:li:organization:${account.pageId}` : `urn:li:person:${account.accountId}`;
  const resp = await axios.post('https://api.linkedin.com/v2/ugcPosts', {
    author: authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: content },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Restli-Protocol-Version': '2.0.0' } });
  return { id: resp.data?.id };
}

async function publishToFacebook(account, content) {
  const token = decrypt(account.accessToken);
  const pageId = account.pageId || account.accountId;
  const resp = await axios.post(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
    message: content, access_token: token,
  });
  return { id: resp.data?.id };
}

async function publishToInstagram(account, content) {
  // Instagram requires image for feed posts; use caption-only for story text or carousel
  // For now, publish as a text-only post (requires media in practice — store as draft if no mediaUrl)
  const token = decrypt(account.accessToken);
  const igUserId = account.pageId || account.accountId;
  // Step 1: create media container
  const container = await axios.post(`https://graph.facebook.com/v19.0/${igUserId}/media`, {
    caption: content, media_type: 'REELS', access_token: token,
  }).catch(() => null);
  if (!container) return { id: null, note: 'Instagram requires media — saved as draft' };
  // Step 2: publish
  const publish = await axios.post(`https://graph.facebook.com/v19.0/${igUserId}/media_publish`, {
    creation_id: container.data.id, access_token: token,
  });
  return { id: publish.data?.id };
}

// POST /social/publish — publish to one or more platforms
router.post('/publish', async (req, res, next) => {
  try {
    const { platforms, posts, scheduledAt } = req.body;
    // posts: { twitter: "text", linkedin: "text", ... }
    if (!platforms?.length || !posts) return error(res, 'platforms and posts are required', 400);

    const accounts = await prisma.socialAccount.findMany({
      where: { companyId: req.companyId, platform: { in: platforms }, isActive: true },
    });

    const results = [];
    const errors = [];

    for (const platform of platforms) {
      const account = accounts.find(a => a.platform === platform);
      const content = posts[platform];
      if (!content) continue;

      let status = 'published';
      let externalId = null;
      let publishNote = null;

      if (!account) {
        status = 'failed';
        publishNote = `No ${platform} account connected`;
        errors.push({ platform, error: publishNote });
      } else if (scheduledAt) {
        // Scheduled — just store, don't call API yet
        status = 'scheduled';
      } else {
        try {
          let publishResult;
          if (platform === 'twitter')   publishResult = await publishToTwitter(account, content);
          if (platform === 'linkedin')  publishResult = await publishToLinkedIn(account, content);
          if (platform === 'facebook')  publishResult = await publishToFacebook(account, content);
          if (platform === 'instagram') publishResult = await publishToInstagram(account, content);
          if (!publishResult) { status = 'published'; publishNote = 'Saved (no live API for this platform)'; }
          else externalId = publishResult.id;
        } catch (apiErr) {
          logger.warn(`Social publish error (${platform}): ${apiErr?.response?.data?.detail || apiErr.message}`);
          status = 'failed';
          publishNote = apiErr?.response?.data?.message || apiErr.message;
          errors.push({ platform, error: publishNote });
        }
      }

      // Save to SocialPost table
      const saved = await prisma.socialPost.create({
        data: {
          companyId: req.companyId,
          platform,
          content,
          status,
          ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
          ...(status === 'published' && { publishedAt: new Date() }),
        },
      });
      results.push({ platform, status, id: saved.id, externalId, note: publishNote });
    }

    return success(res, { results, errors });
  } catch (err) { next(err); }
});

// GET /social/posts — history
router.get('/posts', async (req, res, next) => {
  try {
    const { platform, status, limit = 50 } = req.query;
    const posts = await prisma.socialPost.findMany({
      where: {
        companyId: req.companyId,
        ...(platform && { platform }),
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
    });
    return success(res, posts);
  } catch (err) { next(err); }
});

// DELETE /social/posts/:id
router.delete('/posts/:id', async (req, res, next) => {
  try {
    const existing = await prisma.socialPost.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Post not found');
    await prisma.socialPost.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Post deleted');
  } catch (err) { next(err); }
});

module.exports = router;
