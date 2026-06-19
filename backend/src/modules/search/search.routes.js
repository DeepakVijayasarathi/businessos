const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success } = require('../../utils/response');

router.use(authenticate, sameCompany);

router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return success(res, { results: [] });
    const cid = req.companyId;
    const term = q.trim();
    const mode = 'insensitive';

    const [leads, contacts, deals, tickets, invoices, employees, projects] = await Promise.all([
      prisma.lead.findMany({ where: { companyId: cid, OR: [{ firstName: { contains: term, mode } }, { lastName: { contains: term, mode } }, { email: { contains: term, mode } }, { company: { contains: term, mode } }] }, take: 5, select: { id: true, firstName: true, lastName: true, email: true, status: true } }),
      prisma.contact.findMany({ where: { companyId: cid, OR: [{ firstName: { contains: term, mode } }, { lastName: { contains: term, mode } }, { email: { contains: term, mode } }] }, take: 5, select: { id: true, firstName: true, lastName: true, email: true } }),
      prisma.deal.findMany({ where: { companyId: cid, name: { contains: term, mode } }, take: 5, select: { id: true, name: true, value: true, status: true } }),
      prisma.ticket.findMany({ where: { companyId: cid, OR: [{ subject: { contains: term, mode } }, { ticketNo: { contains: term, mode } }] }, take: 5, select: { id: true, ticketNo: true, subject: true, status: true, priority: true } }),
      prisma.invoice.findMany({ where: { companyId: cid, OR: [{ invoiceNo: { contains: term, mode } }, { clientName: { contains: term, mode } }] }, take: 5, select: { id: true, invoiceNo: true, clientName: true, total: true, status: true } }),
      prisma.employee.findMany({ where: { companyId: cid, OR: [{ user: { firstName: { contains: term, mode } } }, { user: { lastName: { contains: term, mode } } }, { jobTitle: { contains: term, mode } }] }, take: 3, select: { id: true, jobTitle: true, user: { select: { firstName: true, lastName: true, email: true } } } }),
      prisma.project.findMany({ where: { companyId: cid, name: { contains: term, mode } }, take: 3, select: { id: true, name: true, status: true } }),
    ]);

    const results = [
      ...leads.map(r => ({ type: 'lead', icon: 'Target', label: `${r.firstName} ${r.lastName}`, sub: r.email, status: r.status, href: `/dashboard/crm/leads` })),
      ...contacts.map(r => ({ type: 'contact', icon: 'User', label: `${r.firstName} ${r.lastName}`, sub: r.email, href: `/dashboard/crm/contacts` })),
      ...deals.map(r => ({ type: 'deal', icon: 'Briefcase', label: r.name, sub: r.value ? `$${r.value}` : r.status, href: `/dashboard/crm/pipeline` })),
      ...tickets.map(r => ({ type: 'ticket', icon: 'Headphones', label: `#${r.ticketNo} ${r.subject}`, sub: r.priority, status: r.status, href: `/dashboard/helpdesk` })),
      ...invoices.map(r => ({ type: 'invoice', icon: 'FileText', label: r.invoiceNo, sub: r.clientName, status: r.status, href: `/dashboard/finance/invoices` })),
      ...employees.map(r => ({ type: 'employee', icon: 'UserSquare', label: `${r.user.firstName} ${r.user.lastName}`, sub: r.jobTitle, href: `/dashboard/hr/employees` })),
      ...projects.map(r => ({ type: 'project', icon: 'FolderKanban', label: r.name, sub: r.status, href: `/dashboard/projects` })),
    ];

    return success(res, { results, total: results.length });
  } catch (err) { next(err); }
});

module.exports = router;
