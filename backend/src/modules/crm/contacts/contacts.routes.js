const router = require('express').Router();
const prisma = require('../../../config/prisma');
const { authenticate, sameCompany } = require('../../../middleware/auth');
const { success, created, paginated, notFound, error } = require('../../../utils/response');
const { paginate, paginateMeta } = require('../../../utils/helpers');
const { auditLog } = require('../../../middleware/audit');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(authenticate, sameCompany);

router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, status, crmCompanyId } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(status && { status }),
      ...(crmCompanyId && { crmCompanyId }),
      ...(search && { OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ]}),
    };
    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({ where, take, skip, include: { crmCompany: true }, orderBy: { createdAt: 'desc' } }),
      prisma.contact.count({ where }),
    ]);
    return paginated(res, contacts, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: {
        crmCompany: true,
        deals: { include: { deal: { include: { stage: true } } } },
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
        appointments: { orderBy: { startAt: 'desc' }, take: 5 },
      },
    });
    if (!contact) return notFound(res, 'Contact not found');
    return success(res, contact);
  } catch (err) { next(err); }
});

router.post('/', auditLog('crm.contacts', 'contact'), async (req, res, next) => {
  try {
    const contact = await prisma.contact.create({
      data: { ...req.body, companyId: req.companyId },
    });
    return created(res, contact, 'Contact created');
  } catch (err) { next(err); }
});

router.put('/:id', auditLog('crm.contacts', 'contact'), async (req, res, next) => {
  try {
    const existing = await prisma.contact.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Contact not found');
    const contact = await prisma.contact.update({ where: { id: req.params.id }, data: req.body });
    return success(res, contact, 'Contact updated');
  } catch (err) { next(err); }
});

router.delete('/:id', auditLog('crm.contacts', 'contact'), async (req, res, next) => {
  try {
    const existing = await prisma.contact.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Contact not found');
    await prisma.contact.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Contact deleted');
  } catch (err) { next(err); }
});

// POST /crm/contacts/import — CSV import
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

    const importable = rows.filter(row => row.email || row.firstName || row.first_name);
    const CHUNK = 25;
    let createdCount = 0, skipped = 0;
    for (let i = 0; i < importable.length; i += CHUNK) {
      const chunk = importable.slice(i, i + CHUNK);
      const results = await Promise.allSettled(chunk.map(row =>
        prisma.contact.create({
          data: {
            companyId: req.companyId,
            firstName: row.firstName || row.first_name || 'Unknown',
            lastName: row.lastName || row.last_name || '',
            email: row.email || null,
            phone: row.phone || null,
            jobTitle: row.jobTitle || row.job_title || row.title || null,
            department: row.department || null,
            linkedIn: row.linkedIn || row.linkedin || null,
          },
        })
      ));
      results.forEach(r => r.status === 'fulfilled' ? createdCount++ : skipped++);
    }
    return success(res, { created: createdCount, skipped }, `${createdCount} contacts imported`);
  } catch (err) { next(err); }
});

// GET /crm/contacts/:id/timeline — all activity for a contact
router.get('/:id/timeline', async (req, res, next) => {
  try {
    const contact = await prisma.contact.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!contact) return notFound(res, 'Contact not found');

    const email = contact.email;
    const [deals, tickets, invoices, activities, notes] = await Promise.all([
      prisma.deal.findMany({ where: { companyId: req.companyId, contacts: { some: { contactId: contact.id } } }, select: { id: true, name: true, value: true, status: true, createdAt: true, updatedAt: true }, take: 20, orderBy: { createdAt: 'desc' } }),
      email ? prisma.ticket.findMany({ where: { companyId: req.companyId, clientEmail: email }, select: { id: true, ticketNo: true, subject: true, status: true, priority: true, createdAt: true, resolvedAt: true }, take: 20, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
      email ? prisma.invoice.findMany({ where: { companyId: req.companyId, clientEmail: email }, select: { id: true, invoiceNo: true, total: true, status: true, createdAt: true, paidAt: true }, take: 20, orderBy: { createdAt: 'desc' } }) : Promise.resolve([]),
      prisma.activity.findMany({ where: { companyId: req.companyId, contactId: contact.id }, select: { id: true, type: true, subject: true, notes: true, status: true, dueAt: true, completedAt: true, createdAt: true }, take: 30, orderBy: { createdAt: 'desc' } }),
      prisma.activity.findMany({ where: { companyId: req.companyId, contactId: contact.id, type: 'note' }, select: { id: true, notes: true, createdAt: true }, take: 10, orderBy: { createdAt: 'desc' } }),
    ]);

    const timeline = [
      ...deals.map(d => ({ type: 'deal', icon: 'Briefcase', title: `Deal: ${d.name}`, subtitle: d.value ? `$${d.value}` : d.status, status: d.status, date: d.updatedAt, id: d.id })),
      ...tickets.map(t => ({ type: 'ticket', icon: 'Headphones', title: `#${t.ticketNo} ${t.subject}`, subtitle: t.priority, status: t.status, date: t.createdAt, id: t.id })),
      ...invoices.map(i => ({ type: 'invoice', icon: 'FileText', title: `Invoice ${i.invoiceNo}`, subtitle: `$${i.total}`, status: i.status, date: i.paidAt || i.createdAt, id: i.id })),
      ...activities.map(a => ({ type: 'activity', icon: a.type === 'email' ? 'Mail' : a.type === 'call' ? 'Phone' : a.type === 'meeting' ? 'Calendar' : 'MessageSquare', title: a.subject || a.type, subtitle: a.notes?.slice(0, 80), status: a.status, date: a.completedAt || a.dueAt || a.createdAt, id: a.id })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return res.json({ success: true, data: { contact, timeline, stats: { deals: deals.length, tickets: tickets.length, invoices: invoices.length, activities: activities.length } } });
  } catch (err) { next(err); }
});

module.exports = router;
