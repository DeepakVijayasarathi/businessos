const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created, paginated, notFound, error } = require('../../utils/response');
const { paginate, paginateMeta, generateNumber } = require('../../utils/helpers');
const emailService = require('../../services/email.service');

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
    return success(res, { paid, pending, overdue, draft });
  } catch (err) { next(err); }
});

router.get('/invoices/:id', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!invoice) return notFound(res, 'Invoice not found');
    return success(res, invoice);
  } catch (err) { next(err); }
});

router.post('/invoices', async (req, res, next) => {
  try {
    const count = await prisma.invoice.count({ where: { companyId: req.companyId } });
    const invoiceNo = generateNumber('INV', count + 1);
    const invoice = await prisma.invoice.create({
      data: { ...req.body, companyId: req.companyId, invoiceNo },
    });
    return created(res, invoice, 'Invoice created');
  } catch (err) { next(err); }
});

router.put('/invoices/:id', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.update({ where: { id: req.params.id }, data: req.body });
    return success(res, invoice, 'Invoice updated');
  } catch (err) { next(err); }
});

router.post('/invoices/:id/send', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: 'sent' },
    });
    if (invoice.clientEmail) {
      emailService.sendInvoice({
        to: invoice.clientEmail,
        invoiceNo: invoice.invoiceNo,
        companyId: req.companyId,
      }).catch(() => {});
    }
    return success(res, invoice, 'Invoice sent');
  } catch (err) { next(err); }
});

router.post('/invoices/:id/mark-paid', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: 'paid', paidAt: new Date() },
    });
    return success(res, invoice, 'Invoice marked as paid');
  } catch (err) { next(err); }
});

// ── EXPENSES ─────────────────────────────────────────────────

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
    const expense = await prisma.expense.create({
      data: { ...req.body, companyId: req.companyId },
    });
    return created(res, expense, 'Expense recorded');
  } catch (err) { next(err); }
});

router.put('/expenses/:id', async (req, res, next) => {
  try {
    const expense = await prisma.expense.update({ where: { id: req.params.id }, data: req.body });
    return success(res, expense, 'Expense updated');
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
      doc.fillColor('#111827').font('Helvetica').fontSize(9)
        .text(item.description || item.name || '', 58, y, { width: 270 })
        .text(String(item.quantity || 1), 340, y, { width: 50, align: 'right' })
        .text(`$${Number(item.unitPrice || item.price || 0).toFixed(2)}`, 390, y, { width: 80, align: 'right' })
        .text(`$${Number(item.total || (item.quantity * item.unitPrice) || 0).toFixed(2)}`, 470, y, { width: 75, align: 'right' });
      y += 22;
    });

    // Totals
    y = Math.max(y + 20, 480);
    doc.moveTo(360, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
    y += 10;
    const totals = [
      ['Subtotal', invoice.subtotal],
      ['Tax', invoice.tax],
      ['Discount', invoice.discount],
      ['Total', invoice.total],
    ].filter(([, v]) => v != null && v !== 0);

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
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { isRecurring: false, recurringRule: null, nextDueDate: null },
    });
    return success(res, invoice, 'Recurring stopped');
  } catch (err) { next(err); }
});

// ── REPORTS ─────────────────────────────────────────────────

router.get('/reports/profit-loss', async (req, res, next) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const start = new Date(`${year}-01-01`);
    const end = new Date(`${year}-12-31`);

    const [totalIncome, totalExpenses, paidInvoices] = await Promise.all([
      prisma.income.aggregate({ where: { companyId: req.companyId, date: { gte: start, lte: end } }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { companyId: req.companyId, date: { gte: start, lte: end }, status: { not: 'rejected' } }, _sum: { amount: true } }),
      prisma.invoice.aggregate({ where: { companyId: req.companyId, status: 'paid', paidAt: { gte: start, lte: end } }, _sum: { total: true } }),
    ]);

    const totalRevenue = Number(totalIncome._sum.amount || 0) + Number(paidInvoices._sum.total || 0);
    const totalCost = Number(totalExpenses._sum.amount || 0);

    return success(res, {
      year,
      totalRevenue,
      totalExpenses: totalCost,
      grossProfit: totalRevenue - totalCost,
      profitMargin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100).toFixed(2) : 0,
    });
  } catch (err) { next(err); }
});

module.exports = router;
