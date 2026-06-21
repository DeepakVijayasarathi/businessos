const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany, requirePermission } = require('../../middleware/auth');
const { success, created, notFound, error } = require('../../utils/response');
const { paginate, paginateMeta } = require('../../utils/helpers');
const { auditLog } = require('../../middleware/audit');
const logger = require('../../config/logger');

router.use(authenticate, sameCompany);

router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, invoiceId, status } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      invoice: { companyId: req.companyId },
      ...(invoiceId && { invoiceId }),
      ...(status && { status }),
    };
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where, take, skip, orderBy: { paidAt: 'desc' },
        include: { invoice: { select: { invoiceNo: true, clientName: true, total: true } } },
      }),
      prisma.payment.count({ where }),
    ]);
    return res.json({ success: true, data: payments, meta: paginateMeta(total, page, limit) });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({ where: { id: req.body.invoiceId, companyId: req.companyId } });
    if (!invoice) return notFound(res, 'Invoice not found');

    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) return error(res, 'A positive payment amount is required', 400);

    // Atomic: create the payment and re-check/update invoice status in one transaction,
    // so concurrent payments against the same invoice can't both read a stale total.
    const payment = await prisma.$transaction(async (tx) => {
      const newPayment = await tx.payment.create({
        data: {
          invoiceId: req.body.invoiceId,
          amount,
          method: req.body.method || 'manual',
          reference: req.body.reference || null,
          notes: req.body.notes || null,
          paidAt: req.body.paidAt ? new Date(req.body.paidAt) : new Date(),
          status: 'completed',
        },
      });
      const totalPaid = await tx.payment.aggregate({
        where: { invoiceId: req.body.invoiceId, status: 'completed' },
        _sum: { amount: true },
      });
      if (Number(totalPaid._sum.amount || 0) >= Number(invoice.total)) {
        await tx.invoice.update({ where: { id: req.body.invoiceId }, data: { status: 'paid', paidAt: new Date() } });
      }
      return newPayment;
    });

    logger.info(`Payment recorded: ${payment.id} amount=${amount} invoiceId=${req.body.invoiceId} companyId=${req.companyId} userId=${req.userId}`);
    return created(res, payment, 'Payment recorded');
  } catch (err) { next(err); }
});

router.delete('/:id', requirePermission('finance.*'), auditLog('finance.payments', 'payment'), async (req, res, next) => {
  try {
    const existing = await prisma.payment.findFirst({ where: { id: req.params.id, invoice: { companyId: req.companyId } } });
    if (!existing) return notFound(res, 'Payment not found');
    await prisma.payment.delete({ where: { id: req.params.id } });
    logger.warn(`Payment deleted: ${existing.id} amount=${existing.amount} invoiceId=${existing.invoiceId} companyId=${req.companyId} userId=${req.userId}`);
    return success(res, {}, 'Payment deleted');
  } catch (err) { next(err); }
});

module.exports = router;
