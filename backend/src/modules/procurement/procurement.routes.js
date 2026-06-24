const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate: auth } = require('../../middleware/auth');
const { success, error } = require('../../utils/response');

const prisma = new PrismaClient();

async function nextPoNumber(companyId) {
  const last = await prisma.purchaseOrder.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    select: { poNumber: true },
  });
  if (!last) return 'PO-0001';
  const num = parseInt(last.poNumber.replace(/\D/g, ''), 10) || 0;
  return `PO-${String(num + 1).padStart(4, '0')}`;
}

// GET /procurement - list POs
router.get('/', auth, async (req, res) => {
  try {
    const { status, search, limit = 50, page = 1 } = req.query;
    const where = { companyId: req.user.companyId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { poNumber: { contains: search, mode: 'insensitive' } },
        { vendorName: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: (Number(page) - 1) * Number(limit),
      }),
      prisma.purchaseOrder.count({ where }),
    ]);
    return success(res, { orders, total });
  } catch (e) {
    return error(res, e.message);
  }
});

// GET /procurement/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
      include: { items: true },
    });
    if (!po) return error(res, 'Not found', 404);
    return success(res, po);
  } catch (e) {
    return error(res, e.message);
  }
});

// POST /procurement
router.post('/', auth, async (req, res) => {
  try {
    const { vendorName, vendorEmail, vendorPhone, vendorAddress,
            issueDate, expectedDate, notes, items = [] } = req.body;
    if (!vendorName) return error(res, 'Vendor name is required', 400);

    const poNumber = await nextPoNumber(req.user.companyId);
    let subtotal = 0;
    const itemData = items.map(it => {
      const total = Number(it.quantity) * Number(it.unitPrice);
      subtotal += total;
      return { description: it.description, quantity: Number(it.quantity), unitPrice: Number(it.unitPrice), total, unit: it.unit };
    });
    const taxAmount = 0;
    const totalAmount = subtotal + taxAmount;

    const po = await prisma.purchaseOrder.create({
      data: {
        companyId: req.user.companyId,
        poNumber, vendorName, vendorEmail, vendorPhone, vendorAddress,
        issueDate: issueDate ? new Date(issueDate) : new Date(),
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        notes, subtotal, tax: taxAmount, total: totalAmount,
        items: { create: itemData },
      },
      include: { items: true },
    });
    return success(res, po, 201);
  } catch (e) {
    return error(res, e.message);
  }
});

// PUT /procurement/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return error(res, 'Not found', 404);
    const { vendorName, vendorEmail, vendorPhone, vendorAddress,
            issueDate, expectedDate, receivedDate, notes, status, items } = req.body;

    let subtotal = existing.subtotal;
    if (items) {
      await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: req.params.id } });
      subtotal = 0;
      const itemData = items.map(it => {
        const total = Number(it.quantity) * Number(it.unitPrice);
        subtotal += total;
        return { purchaseOrderId: req.params.id, description: it.description, quantity: Number(it.quantity), unitPrice: Number(it.unitPrice), total, unit: it.unit };
      });
      await prisma.purchaseOrderItem.createMany({ data: itemData });
    }

    let approvedAt = existing.approvedAt;
    let approvedById = existing.approvedById;
    if (status === 'approved' && existing.status !== 'approved') {
      approvedAt = new Date();
      approvedById = req.user.id;
    }

    const po = await prisma.purchaseOrder.update({
      where: { id: req.params.id },
      data: {
        vendorName, vendorEmail, vendorPhone, vendorAddress,
        issueDate: issueDate ? new Date(issueDate) : undefined,
        expectedDate: expectedDate !== undefined ? (expectedDate ? new Date(expectedDate) : null) : undefined,
        receivedDate: receivedDate !== undefined ? (receivedDate ? new Date(receivedDate) : null) : undefined,
        notes, status,
        subtotal: items ? subtotal : undefined,
        total: items ? subtotal : undefined,
        approvedAt, approvedById,
      },
      include: { items: true },
    });
    return success(res, po);
  } catch (e) {
    return error(res, e.message);
  }
});

// DELETE /procurement/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return error(res, 'Not found', 404);
    await prisma.purchaseOrder.delete({ where: { id: req.params.id } });
    return success(res, { deleted: true });
  } catch (e) {
    return error(res, e.message);
  }
});

module.exports = router;
