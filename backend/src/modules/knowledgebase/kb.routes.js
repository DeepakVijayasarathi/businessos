const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany, optionalAuth } = require('../../middleware/auth');
const { success, created, paginated, notFound } = require('../../utils/response');
const { paginate, paginateMeta, slugify } = require('../../utils/helpers');

router.use(optionalAuth);

// Categories
router.get('/categories', async (req, res, next) => {
  try {
    const companyId = req.companyId || req.query.companyId;
    const categories = await prisma.knowledgeCategory.findMany({
      where: { companyId, parentId: null },
      include: { children: true, _count: { select: { articles: true } } },
      orderBy: { order: 'asc' },
    });
    return success(res, categories);
  } catch (err) { next(err); }
});

router.post('/categories', authenticate, sameCompany, async (req, res, next) => {
  try {
    const slug = slugify(req.body.name);
    const cat = await prisma.knowledgeCategory.create({
      data: { ...req.body, companyId: req.companyId, slug },
    });
    return created(res, cat);
  } catch (err) { next(err); }
});

// Articles
router.get('/articles', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, categoryId, type, status = 'published', search, companyId } = req.query;
    const cid = req.companyId || companyId;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: cid,
      status,
      ...(categoryId && { categoryId }),
      ...(type && { type }),
      ...(search && { OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ]}),
    };
    const [articles, total] = await Promise.all([
      prisma.knowledgeArticle.findMany({
        where, take, skip,
        include: { category: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.knowledgeArticle.count({ where }),
    ]);
    return paginated(res, articles, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.get('/articles/:slug', async (req, res, next) => {
  try {
    const cid = req.companyId || req.query.companyId;
    const article = await prisma.knowledgeArticle.findFirst({
      where: {
        slug: req.params.slug,
        ...(cid && { companyId: cid }),
        ...(!req.companyId && { status: 'published' }),
      },
      include: { category: true },
    });
    if (!article) return notFound(res, 'Article not found');
    // Increment views
    await prisma.knowledgeArticle.update({ where: { id: article.id }, data: { views: { increment: 1 } } });
    return success(res, article);
  } catch (err) { next(err); }
});

router.post('/articles', authenticate, sameCompany, async (req, res, next) => {
  try {
    const slug = slugify(req.body.title);
    const article = await prisma.knowledgeArticle.create({
      data: {
        ...req.body,
        companyId: req.companyId,
        slug: `${slug}-${Date.now()}`,
        authorId: req.userId,
        publishedAt: req.body.status === 'published' ? new Date() : null,
      },
    });
    return created(res, article, 'Article created');
  } catch (err) { next(err); }
});

router.put('/articles/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.knowledgeArticle.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Article not found');
    const article = await prisma.knowledgeArticle.update({
      where: { id: req.params.id },
      data: {
        ...req.body,
        version: { increment: 1 },
        publishedAt: req.body.status === 'published' ? new Date() : undefined,
      },
    });
    return success(res, article, 'Article updated');
  } catch (err) { next(err); }
});

router.delete('/articles/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const existing = await prisma.knowledgeArticle.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Article not found');
    await prisma.knowledgeArticle.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Article deleted');
  } catch (err) { next(err); }
});

router.post('/articles/:id/feedback', async (req, res, next) => {
  try {
    const { helpful } = req.body;
    await prisma.knowledgeArticle.update({
      where: { id: req.params.id },
      data: helpful ? { helpful: { increment: 1 } } : { notHelpful: { increment: 1 } },
    });
    return success(res, {}, 'Feedback recorded');
  } catch (err) { next(err); }
});

module.exports = router;
