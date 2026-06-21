const router = require('express').Router();
const prisma = require('../../../config/prisma');
const { authenticate, sameCompany } = require('../../../middleware/auth');
const { success, created, paginated, notFound, error } = require('../../../utils/response');
const { paginate, paginateMeta } = require('../../../utils/helpers');
const notificationService = require('../../../services/notification.service');
const { callAI } = require('../../../services/ai.service');
const { auditLog } = require('../../../middleware/audit');

router.use(authenticate, sameCompany);

// GET /crm/leads
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, status, source, assignedToId } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(status && { status }),
      ...(source && { source }),
      ...(assignedToId && { assignedToId }),
      ...(search && { OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ]}),
    };
    const [leads, total] = await Promise.all([
      prisma.lead.findMany({ where, take, skip, orderBy: { createdAt: 'desc' } }),
      prisma.lead.count({ where }),
    ]);
    return paginated(res, leads, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

// GET /crm/leads/stats
router.get('/stats', async (req, res, next) => {
  try {
    const [total, byStatus, recent] = await Promise.all([
      prisma.lead.count({ where: { companyId: req.companyId } }),
      prisma.lead.groupBy({ by: ['status'], where: { companyId: req.companyId }, _count: true }),
      prisma.lead.count({
        where: {
          companyId: req.companyId,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);
    return success(res, { total, byStatus, recent });
  } catch (err) { next(err); }
});

// GET /crm/leads/:id
router.get('/:id', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { activities: { orderBy: { createdAt: 'desc' }, take: 20 }, tasks: { where: { leadId: req.params.id } } },
    });
    if (!lead) return notFound(res, 'Lead not found');
    return success(res, lead);
  } catch (err) { next(err); }
});

// POST /crm/leads
router.post('/', auditLog('crm.leads', 'lead'), async (req, res, next) => {
  try {
    const lead = await prisma.lead.create({
      data: { ...req.body, companyId: req.companyId },
    });
    notificationService.createForRole({
      companyId: req.companyId,
      roleSlug: 'company-admin',
      type: 'lead_created',
      title: 'New Lead',
      message: `${lead.firstName} ${lead.lastName} added as a new lead`,
      link: '/dashboard/crm/leads',
      data: { leadId: lead.id },
    }).catch(() => {});
    return created(res, lead, 'Lead created');
  } catch (err) { next(err); }
});

// PUT /crm/leads/:id
router.put('/:id', auditLog('crm.leads', 'lead'), async (req, res, next) => {
  try {
    const existing = await prisma.lead.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Lead not found');
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: req.body,
    });
    return success(res, lead, 'Lead updated');
  } catch (err) { next(err); }
});

// DELETE /crm/leads/:id
router.delete('/:id', auditLog('crm.leads', 'lead'), async (req, res, next) => {
  try {
    const existing = await prisma.lead.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Lead not found');
    await prisma.lead.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Lead deleted');
  } catch (err) { next(err); }
});

// POST /crm/leads/:id/convert
router.post('/:id/convert', auditLog('crm.leads', 'lead'), async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!lead) return notFound(res, 'Lead not found');

    const result = await prisma.$transaction(async (tx) => {
      const contact = await tx.contact.create({
        data: {
          companyId: req.companyId,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          source: lead.source,
        },
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: { status: 'converted', convertedAt: new Date(), contactId: contact.id },
      });
      return contact;
    });

    return success(res, result, 'Lead converted to contact');
  } catch (err) { next(err); }
});

// GET /crm/leads/export — CSV export
router.get('/export', async (req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({
      where: { companyId: req.companyId },
      orderBy: { createdAt: 'desc' },
    });
    const headers = ['firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle', 'source', 'status', 'score', 'notes', 'createdAt'];
    const csv = [
      headers.join(','),
      ...leads.map(l => headers.map(h => `"${String(l[h] ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

// POST /crm/leads/import — CSV import
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return error(res, 'No file uploaded', 400);
    const text = req.file.buffer.toString('utf8');
    const lines = text.split('\n').filter(Boolean);
    if (lines.length < 2) return error(res, 'CSV must have headers + data rows', 400);

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
      const vals = line.match(/(".*?"|[^,]+)(?=,|$)/g) || [];
      return headers.reduce((obj, h, i) => {
        obj[h] = (vals[i] || '').replace(/^"|"$/g, '').trim();
        return obj;
      }, {});
    });

    const created = [];
    const skipped = [];
    for (const [i, row] of rows.entries()) {
      if (!row.email && !row.firstName) continue;
      try {
        const lead = await prisma.lead.create({
          data: {
            companyId: req.companyId,
            firstName: row.firstName || row.first_name || 'Unknown',
            lastName: row.lastName || row.last_name || '',
            email: row.email || null,
            phone: row.phone || null,
            company: row.company || row.companyName || null,
            jobTitle: row.jobTitle || row.job_title || null,
            source: row.source || 'import',
            status: ['new','contacted','qualified','converted','lost'].includes(row.status) ? row.status : 'new',
            notes: row.notes || null,
          },
        });
        created.push(lead.id);
      } catch (err) {
        skipped.push({ row: i + 2, email: row.email || null, reason: err.code === 'P2002' ? 'duplicate' : (err.message || 'unknown error') });
      }
    }

    return success(res, { imported: created.length, total: rows.length, skipped }, `Imported ${created.length} leads`);
  } catch (err) { next(err); }
});

// POST /crm/leads/:id/score — AI lead scoring
router.post('/:id/score', async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!lead) return notFound(res, 'Lead not found');

    // Rule-based score if AI not available
    let score = 0;
    if (lead.email) score += 15;
    if (lead.phone) score += 10;
    if (lead.company) score += 15;
    if (lead.jobTitle) score += 10;
    if (lead.website) score += 5;
    if (lead.source === 'website') score += 10;
    if (lead.source === 'referral') score += 20;
    if (['CEO', 'CTO', 'CFO', 'Founder', 'Director', 'VP', 'President'].some(t => lead.jobTitle?.includes(t))) score += 15;
    if (lead.status === 'qualified') score += 20;
    else if (lead.status === 'contacted') score += 10;
    score = Math.min(100, score);

    // Try AI enhancement
    const company = await prisma.company.findUnique({ where: { id: req.companyId }, select: { anthropicKey: true, openaiKey: true, aiProvider: true } });
    let aiReason = '';
    try {
      const result = await callAI({
        messages: [{ role: 'user', content: `Score this sales lead 0-100 and explain in one sentence. Lead: Name: ${lead.firstName} ${lead.lastName}, Title: ${lead.jobTitle || 'unknown'}, Company: ${lead.company || 'unknown'}, Email: ${lead.email ? 'yes' : 'no'}, Phone: ${lead.phone ? 'yes' : 'no'}, Source: ${lead.source || 'unknown'}, Status: ${lead.status}. Return JSON: {"score": number, "reason": "string"}` }],
        system: 'Return only valid JSON with score (0-100 integer) and reason (one sentence). No markdown.',
        companyAnthropicKey: company?.anthropicKey,
        companyOpenaiKey: company?.openaiKey,
        companyProvider: company?.aiProvider,
        maxTokens: 150,
      });
      const parsed = JSON.parse(result.text.trim());
      if (parsed.score) score = Math.min(100, Math.max(0, parseInt(parsed.score)));
      aiReason = parsed.reason || '';
    } catch { /* use rule-based score */ }

    // Save score
    const updated = await prisma.lead.update({ where: { id: lead.id }, data: { score } });
    return res.json({ success: true, data: { score, reason: aiReason || `Score based on profile completeness and engagement signals.`, lead: updated } });
  } catch (err) { next(err); }
});

// POST /crm/leads/score-all — bulk score all leads
router.post('/score-all', async (req, res, next) => {
  try {
    const leads = await prisma.lead.findMany({ where: { companyId: req.companyId }, take: 100 });
    let scored = 0;
    for (const lead of leads) {
      let score = 0;
      if (lead.email) score += 15;
      if (lead.phone) score += 10;
      if (lead.company) score += 15;
      if (lead.jobTitle) score += 10;
      if (lead.source === 'referral') score += 20;
      else if (lead.source === 'website') score += 10;
      if (['CEO', 'CTO', 'CFO', 'Founder', 'Director', 'VP'].some(t => lead.jobTitle?.includes(t))) score += 15;
      if (lead.status === 'qualified') score += 20;
      else if (lead.status === 'contacted') score += 10;
      score = Math.min(100, score);
      await prisma.lead.update({ where: { id: lead.id }, data: { score } });
      scored++;
    }
    return res.json({ success: true, data: { scored }, message: `${scored} leads scored` });
  } catch (err) { next(err); }
});

module.exports = router;
