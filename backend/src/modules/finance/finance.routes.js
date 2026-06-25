const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created, paginated, notFound, error } = require('../../utils/response');
const { paginate, paginateMeta, generateNumber, pick } = require('../../utils/helpers');

const INVOICE_WRITABLE_FIELDS = ['clientName', 'clientEmail', 'clientAddress', 'clientGst', 'dueDate', 'subtotal', 'taxAmount', 'discountAmount', 'total', 'currency', 'notes', 'terms', 'items', 'projectId', 'dealId'];
const EXPENSE_WRITABLE_FIELDS = ['title', 'category', 'amount', 'currency', 'date', 'receipt', 'description', 'isReimbursable', 'employeeId'];
const emailService = require('../../services/email.service');
const { auditLog } = require('../../middleware/audit');
const { sendCsv } = require('../../utils/csv');
const logger = require('../../config/logger');

router.use(authenticate, sameCompany);

// ── INVOICES ─────────────────────────────────────────────────

router.get('/invoices', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search, clientEmail } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(status && { status }),
      ...(clientEmail && { clientEmail }),
      ...(search && { OR: [
        { invoiceNo: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } },
      ]}),
    };
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({ where, take, skip, orderBy: { createdAt: 'desc' } }),
      prisma.invoice.count({ where }),
    ]);
    return paginated(res, invoices, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.get('/invoices/summary', async (req, res, next) => {
  try {
    const [paid, pending, overdue, draft] = await Promise.all([
      prisma.invoice.aggregate({ where: { companyId: req.companyId, status: 'paid' }, _sum: { total: true }, _count: true }),
      prisma.invoice.aggregate({ where: { companyId: req.companyId, status: 'sent' }, _sum: { total: true }, _count: true }),
      prisma.invoice.aggregate({ where: { companyId: req.companyId, status: 'overdue' }, _sum: { total: true }, _count: true }),
      prisma.invoice.aggregate({ where: { companyId: req.companyId, status: 'draft' }, _sum: { total: true }, _count: true }),
    ]);
    const num = (agg) => ({ ...agg, _sum: { total: Number(agg._sum.total || 0) } });
    return success(res, { paid: num(paid), pending: num(pending), overdue: num(overdue), draft: num(draft) });
  } catch (err) { next(err); }
});

// GET /finance/invoices/export — CSV export (must precede /invoices/:id)
router.get('/invoices/export', async (req, res, next) => {
  try {
    const { status, search, clientEmail } = req.query;
    const where = {
      companyId: req.companyId,
      ...(status && { status }),
      ...(clientEmail && { clientEmail }),
      ...(search && { OR: [
        { invoiceNo: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } },
      ]}),
    };
    const invoices = await prisma.invoice.findMany({ where, orderBy: { createdAt: 'desc' } });
    sendCsv(res, 'invoices.csv', invoices, [
      'invoiceNo', 'clientName', 'clientEmail', 'status',
      'subtotal', 'taxAmount', 'discountAmount', 'total', 'currency',
      'issueDate', 'dueDate', 'paidAt', 'createdAt',
    ]);
  } catch (err) { next(err); }
});

router.get('/invoices/:id', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!invoice) return notFound(res, 'Invoice not found');
    return success(res, invoice);
  } catch (err) { next(err); }
});

function normalizeInvoiceBody(body) {
  const data = pick(body, INVOICE_WRITABLE_FIELDS);
  // <input type="date"> sends "YYYY-MM-DD"; PostgreSQL DateTime needs a full ISO string
  if (data.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(data.dueDate)) {
    data.dueDate = new Date(data.dueDate + 'T00:00:00.000Z');
  }
  return data;
}

router.post('/invoices', auditLog('finance.invoices', 'invoice'), async (req, res, next) => {
  try {
    if (!req.body.clientName) return error(res, 'Client name is required', 400);
    if (req.body.total == null) return error(res, 'Total is required', 400);
    const cid = req.companyId;
    const invoice = await prisma.$transaction(async (tx) => {
      const count = await tx.invoice.count({ where: { companyId: cid } });
      const invoiceNo = generateNumber('INV', count + 1);
      return tx.invoice.create({ data: { ...normalizeInvoiceBody(req.body), companyId: cid, invoiceNo } });
    });
    return created(res, invoice, 'Invoice created');
  } catch (err) { next(err); }
});

router.put('/invoices/:id', auditLog('finance.invoices', 'invoice'), async (req, res, next) => {
  try {
    const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Invoice not found');
    const invoice = await prisma.invoice.update({ where: { id: req.params.id }, data: normalizeInvoiceBody(req.body) });
    return success(res, invoice, 'Invoice updated');
  } catch (err) { next(err); }
});

router.post('/invoices/:id/send', auditLog('finance.invoices', 'invoice'), async (req, res, next) => {
  try {
    const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Invoice not found');
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: 'sent' },
    });
    if (invoice.clientEmail) {
      emailService.sendInvoice({
        to: invoice.clientEmail,
        invoiceNo: invoice.invoiceNo,
        companyId: req.companyId,
      }).catch((err) => logger.warn(`Failed to email invoice ${invoice.invoiceNo} to ${invoice.clientEmail}: ${err.message}`));
    }
    return success(res, invoice, 'Invoice sent');
  } catch (err) { next(err); }
});

router.post('/invoices/:id/mark-paid', auditLog('finance.invoices', 'invoice'), async (req, res, next) => {
  try {
    const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Invoice not found');
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: 'paid', paidAt: new Date() },
    });
    return success(res, invoice, 'Invoice marked as paid');
  } catch (err) { next(err); }
});

// ── EXPENSES ─────────────────────────────────────────────────

router.get('/expenses/export', async (req, res, next) => {
  try {
    const { category, status } = req.query;
    const where = {
      companyId: req.companyId,
      ...(category && { category }),
      ...(status && { status }),
    };
    const expenses = await prisma.expense.findMany({ where, orderBy: { date: 'desc' } });
    const rows = expenses.map(e => ({
      title: e.title || e.description || '',
      category: e.category,
      amount: Number(e.amount),
      date: e.date ? e.date.toISOString().split('T')[0] : '',
      status: e.status,
    }));
    sendCsv(res, 'expenses.csv', rows, ['title', 'category', 'amount', 'date', 'status']);
  } catch (err) { next(err); }
});

router.get('/expenses', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, status, startDate, endDate } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(category && { category }),
      ...(status && { status }),
      ...(startDate && endDate && { date: { gte: new Date(startDate), lte: new Date(endDate) } }),
    };
    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({ where, take, skip, orderBy: { date: 'desc' } }),
      prisma.expense.count({ where }),
    ]);
    return paginated(res, expenses, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.post('/expenses', async (req, res, next) => {
  try {
    if (!req.body.title) return error(res, 'Title is required', 400);
    if (!req.body.category) return error(res, 'Category is required', 400);
    if (req.body.amount == null) return error(res, 'Amount is required', 400);
    if (!req.body.date) return error(res, 'Date is required', 400);
    const expense = await prisma.expense.create({
      data: { ...pick(req.body, EXPENSE_WRITABLE_FIELDS), companyId: req.companyId },
    });
    return created(res, expense, 'Expense recorded');
  } catch (err) { next(err); }
});

router.put('/expenses/:id', async (req, res, next) => {
  try {
    const existing = await prisma.expense.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Expense not found');
    const expense = await prisma.expense.update({ where: { id: req.params.id }, data: pick(req.body, EXPENSE_WRITABLE_FIELDS) });
    return success(res, expense, 'Expense updated');
  } catch (err) { next(err); }
});

router.post('/expenses/:id/approve', async (req, res, next) => {
  try {
    const existing = await prisma.expense.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Expense not found');
    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: { status: 'approved', approvedById: req.userId, approvedAt: new Date() },
    });
    return success(res, expense, 'Expense approved');
  } catch (err) { next(err); }
});

router.post('/expenses/:id/reject', async (req, res, next) => {
  try {
    const existing = await prisma.expense.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Expense not found');
    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: { status: 'rejected' },
    });
    return success(res, expense, 'Expense rejected');
  } catch (err) { next(err); }
});

// ── INCOME ─────────────────────────────────────────────────

router.get('/income', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, startDate, endDate } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(category && { category }),
      ...(startDate && endDate && { date: { gte: new Date(startDate), lte: new Date(endDate) } }),
    };
    const [incomes, total] = await Promise.all([
      prisma.income.findMany({ where, take, skip, orderBy: { date: 'desc' } }),
      prisma.income.count({ where }),
    ]);
    return paginated(res, incomes, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.post('/income', async (req, res, next) => {
  try {
    if (!req.body.title) return error(res, 'Title is required', 400);
    if (req.body.amount == null) return error(res, 'Amount is required', 400);
    if (!req.body.date) return error(res, 'Date is required', 400);
    const income = await prisma.income.create({
      data: { ...req.body, companyId: req.companyId },
    });
    return created(res, income, 'Income recorded');
  } catch (err) { next(err); }
});

// GET /finance/invoices/:id/pdf
router.get('/invoices/:id/pdf', async (req, res, next) => {
  try {
    const PDFDocument = require('pdfkit');
    const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!invoice) return notFound(res, 'Invoice not found');

    const company = await prisma.company.findUnique({ where: { id: req.companyId }, select: { name: true, email: true, phone: true, address: true, city: true, country: true } });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNo}.pdf"`);
    doc.pipe(res);

    // Header bar
    doc.rect(0, 0, 595, 80).fill('#6366f1');
    doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold').text('INVOICE', 50, 28);
    doc.fontSize(10).font('Helvetica').text(`${invoice.invoiceNo}`, 50, 55);

    // Company info (right)
    doc.fillColor('#ffffff').fontSize(10).text(company.name, 350, 20, { width: 200, align: 'right' });
    if (company.email) doc.text(company.email, 350, 35, { width: 200, align: 'right' });
    if (company.phone) doc.text(company.phone, 350, 50, { width: 200, align: 'right' });

    // Bill To
    doc.fillColor('#111827').fontSize(11).font('Helvetica-Bold').text('Bill To:', 50, 110);
    doc.font('Helvetica').fontSize(10).fillColor('#374151')
      .text(invoice.clientName || 'Client', 50, 126)
      .text(invoice.clientEmail || '', 50, 141)
      .text(invoice.clientAddress || '', 50, 156);

    // Invoice details (right)
    const details = [
      ['Issue Date', invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString() : '—'],
      ['Due Date', invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'],
      ['Status', (invoice.status || '').toUpperCase()],
    ];
    let dy = 110;
    details.forEach(([k, v]) => {
      doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(9).text(k, 380, dy);
      doc.fillColor('#111827').font('Helvetica').fontSize(10).text(v, 460, dy, { width: 90, align: 'right' });
      dy += 18;
    });

    // Line separator
    doc.moveTo(50, 210).lineTo(545, 210).strokeColor('#e5e7eb').lineWidth(1).stroke();

    // Items table header
    doc.fillColor('#f9fafb').rect(50, 220, 495, 24).fill();
    doc.fillColor('#374151').font('Helvetica-Bold').fontSize(9)
      .text('DESCRIPTION', 58, 229)
      .text('QTY', 340, 229, { width: 50, align: 'right' })
      .text('UNIT PRICE', 390, 229, { width: 80, align: 'right' })
      .text('TOTAL', 470, 229, { width: 75, align: 'right' });

    // Items
    const items = Array.isArray(invoice.items) ? invoice.items : [];
    let y = 254;
    items.forEach((item, i) => {
      if (i % 2 === 1) doc.fillColor('#f9fafb').rect(50, y - 5, 495, 22).fill();
      const qty = Number(item.quantity ?? item.qty ?? 1);
      const price = Number(item.unitPrice ?? item.price ?? item.rate ?? 0);
      const lineTotal = Number(item.total ?? item.amount ?? (qty * price));
      doc.fillColor('#111827').font('Helvetica').fontSize(9)
        .text(item.description || item.name || '', 58, y, { width: 270 })
        .text(String(qty), 340, y, { width: 50, align: 'right' })
        .text(`$${price.toFixed(2)}`, 390, y, { width: 80, align: 'right' })
        .text(`$${lineTotal.toFixed(2)}`, 470, y, { width: 75, align: 'right' });
      y += 22;
    });

    // Totals
    y = Math.max(y + 20, 480);
    doc.moveTo(360, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
    y += 10;
    const totals = [
      ['Subtotal', invoice.subtotal],
      ['Tax', invoice.taxAmount],
      ['Discount', invoice.discountAmount],
      ['Total', invoice.total],
    ].filter(([, v]) => v != null && Number(v) !== 0);

    totals.forEach(([label, val], i) => {
      const isLast = i === totals.length - 1;
      if (isLast) {
        doc.fillColor('#6366f1').rect(360, y - 2, 185, 22).fill();
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11)
          .text('TOTAL DUE', 368, y + 2)
          .text(`$${Number(val).toFixed(2)}`, 450, y + 2, { width: 88, align: 'right' });
      } else {
        doc.fillColor('#6b7280').font('Helvetica').fontSize(9).text(label, 368, y);
        doc.fillColor('#111827').text(`$${Number(val).toFixed(2)}`, 450, y, { width: 88, align: 'right' });
      }
      y += 24;
    });

    // Notes
    if (invoice.notes) {
      y += 20;
      doc.fillColor('#6b7280').font('Helvetica-Bold').fontSize(9).text('Notes:', 50, y);
      doc.fillColor('#374151').font('Helvetica').fontSize(9).text(invoice.notes, 50, y + 14, { width: 300 });
    }

    // Footer
    doc.fillColor('#9ca3af').fontSize(8).text('Thank you for your business.', 50, 760, { align: 'center', width: 495 });

    doc.end();
  } catch (err) { next(err); }
});

// GET /finance/invoices/recurring — list recurring invoices
router.get('/invoices/recurring', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = { companyId: req.companyId, isRecurring: true };
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({ where, take, skip, orderBy: { nextDueDate: 'asc' } }),
      prisma.invoice.count({ where }),
    ]);
    return paginated(res, invoices, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

// POST /finance/invoices/:id/recurring — set invoice as recurring
router.post('/invoices/:id/recurring', async (req, res, next) => {
  try {
    const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Invoice not found');
    const { frequency, nextDueDate } = req.body; // frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { isRecurring: true, recurringRule: frequency, nextDueDate: nextDueDate ? new Date(nextDueDate) : null },
    });
    return success(res, invoice, 'Invoice set to recurring');
  } catch (err) { next(err); }
});

// DELETE /finance/invoices/:id/recurring — stop recurring
router.delete('/invoices/:id/recurring', async (req, res, next) => {
  try {
    const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Invoice not found');
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { isRecurring: false, recurringRule: null, nextDueDate: null },
    });
    return success(res, invoice, 'Recurring stopped');
  } catch (err) { next(err); }
});

// ── REPORTS ─────────────────────────────────────────────────

async function buildProfitLossReport(companyId, year) {
  const start = new Date(`${year}-01-01`);
  const end = new Date(`${year}-12-31T23:59:59.999`);

  const [incomeRows, expenseRows, paidInvoiceRows] = await Promise.all([
    prisma.income.findMany({ where: { companyId, date: { gte: start, lte: end } }, select: { amount: true, date: true } }),
    prisma.expense.findMany({ where: { companyId, date: { gte: start, lte: end }, status: { not: 'rejected' } }, select: { amount: true, date: true } }),
    prisma.invoice.findMany({ where: { companyId, status: 'paid', paidAt: { gte: start, lte: end } }, select: { total: true, paidAt: true } }),
  ]);

  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, revenue: 0, expenses: 0 }));
  for (const row of incomeRows) months[row.date.getMonth()].revenue += Number(row.amount);
  for (const row of paidInvoiceRows) months[row.paidAt.getMonth()].revenue += Number(row.total);
  for (const row of expenseRows) months[row.date.getMonth()].expenses += Number(row.amount);

  const totalRevenue = months.reduce((sum, m) => sum + m.revenue, 0);
  const totalExpenses = months.reduce((sum, m) => sum + m.expenses, 0);

  return {
    year: Number(year),
    totalRevenue,
    totalExpenses,
    grossProfit: totalRevenue - totalExpenses,
    profitMargin: totalRevenue > 0 ? Number(((totalRevenue - totalExpenses) / totalRevenue * 100).toFixed(2)) : 0,
    invoiceCount: paidInvoiceRows.length,
    expenseCount: expenseRows.length,
    months,
  };
}

router.get('/reports/profit-loss', async (req, res, next) => {
  try {
    const report = await buildProfitLossReport(req.companyId, req.query.year || new Date().getFullYear());
    return success(res, report);
  } catch (err) { next(err); }
});

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

router.get('/reports/profit-loss/export', async (req, res, next) => {
  try {
    const report = await buildProfitLossReport(req.companyId, req.query.year || new Date().getFullYear());
    const rows = report.months.map((m) => ({
      month: MONTH_NAMES[m.month - 1],
      revenue: m.revenue.toFixed(2),
      expenses: m.expenses.toFixed(2),
      net: (m.revenue - m.expenses).toFixed(2),
    }));
    sendCsv(res, `profit-loss-${report.year}.csv`, rows, ['month', 'revenue', 'expenses', 'net']);
  } catch (err) { next(err); }
});

module.exports = router;
