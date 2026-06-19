const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created } = require('../../utils/response');
const { paginate, paginateMeta } = require('../../utils/helpers');

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
    const payment = await prisma.payment.create({
      data: {
        invoiceId: req.body.invoiceId,
        amount: parseFloat(req.body.amount),
        method: req.body.method || 'manual',
        reference: req.body.reference || null,
        notes: req.body.notes || null,
        paidAt: req.body.paidAt ? new Date(req.body.paidAt) : new Date(),
        status: 'completed',
      },
    });
    // Mark invoice as paid if fully covered
    const invoice = await prisma.invoice.findUnique({ where: { id: req.body.invoiceId } });
    const totalPaid = await prisma.payment.aggregate({ where: { invoiceId: req.body.invoiceId, status: 'completed' }, _sum: { amount: true } });
    if (invoice && totalPaid._sum.amount >= invoice.total) {
      await prisma.invoice.update({ where: { id: req.body.invoiceId }, data: { status: 'paid', paidAt: new Date() } });
    }
    return created(res, payment, 'Payment recorded');
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.payment.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Payment deleted');
  } catch (err) { next(err); }
});

module.exports = router;
