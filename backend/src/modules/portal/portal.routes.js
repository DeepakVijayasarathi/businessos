const router = require('express').Router();
const jwt = require('jsonwebtoken');
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, error } = require('../../utils/response');
const config = require('../../config');

// POST /portal/token — authenticated admin generates a 30-day portal link for a client email
router.post('/token', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { clientEmail } = req.body;
    if (!clientEmail) return error(res, 'clientEmail is required', 400);

    const token = jwt.sign(
      { clientEmail, companyId: req.companyId, type: 'client-portal' },
      config.jwt.secret,
      { expiresIn: '30d' }
    );
    const url = `${config.appUrl}/portal/${encodeURIComponent(token)}`;
    return success(res, { token, url, clientEmail });
  } catch (err) { next(err); }
});

// GET /portal/me — portal JWT in Authorization header; returns client data
router.get('/me', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return error(res, 'Unauthorized', 401);
    const token = authHeader.slice(7);

    let payload;
    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch {
      return error(res, 'Invalid or expired portal link', 401);
    }

    if (payload.type !== 'client-portal') return error(res, 'Invalid token type', 401);

    const { clientEmail, companyId } = payload;

    const [invoices, tickets, company] = await Promise.all([
      prisma.invoice.findMany({
        where: { companyId, clientEmail },
        orderBy: { createdAt: 'desc' },
        select: { id: true, invoiceNo: true, clientName: true, clientEmail: true, issueDate: true, dueDate: true, total: true, status: true, paidAt: true, items: true, notes: true },
      }),
      prisma.ticket.findMany({
        where: { companyId, clientEmail },
        orderBy: { createdAt: 'desc' },
        select: { id: true, ticketNo: true, subject: true, status: true, priority: true, category: true, createdAt: true, resolvedAt: true },
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true, email: true, phone: true, website: true, logo: true },
      }),
    ]);

    return success(res, { clientEmail, company, invoices, tickets });
  } catch (err) { next(err); }
});

module.exports = router;
