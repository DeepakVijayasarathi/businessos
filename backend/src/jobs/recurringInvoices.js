const prisma = require('../config/prisma');
const { generateNumber } = require('../utils/helpers');
const logger = require('../config/logger');

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly — invoice due dates are date-grained, not time-sensitive

function nextDateFor(rule, from) {
  const d = new Date(from);
  if (rule === 'weekly') d.setDate(d.getDate() + 7);
  else if (rule === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (rule === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (rule === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1); // unknown rule — default to monthly rather than looping forever
  return d;
}

async function generateDueInvoices() {
  const now = new Date();
  const dueInvoices = await prisma.invoice.findMany({
    where: { isRecurring: true, nextDueDate: { lte: now } },
    take: 100,
  });

  for (const invoice of dueInvoices) {
    try {
      const count = await prisma.invoice.count({ where: { companyId: invoice.companyId } });
      const invoiceNo = generateNumber('INV', count + 1);
      await prisma.invoice.create({
        data: {
          companyId: invoice.companyId,
          invoiceNo,
          clientName: invoice.clientName,
          clientEmail: invoice.clientEmail,
          clientAddress: invoice.clientAddress,
          clientGst: invoice.clientGst,
          status: 'draft',
          subtotal: invoice.subtotal,
          taxAmount: invoice.taxAmount,
          discountAmount: invoice.discountAmount,
          total: invoice.total,
          currency: invoice.currency,
          notes: invoice.notes,
          terms: invoice.terms,
          items: invoice.items,
          projectId: invoice.projectId,
          dealId: invoice.dealId,
        },
      });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { nextDueDate: nextDateFor(invoice.recurringRule, invoice.nextDueDate || now) },
      });
    } catch (err) {
      logger.warn(`Failed to generate recurring invoice from ${invoice.invoiceNo}: ${err.message}`);
    }
  }

  if (dueInvoices.length) {
    logger.info(`Recurring invoices: generated ${dueInvoices.length} new invoice(s)`);
  }
}

function startRecurringInvoiceJob() {
  setInterval(() => {
    generateDueInvoices().catch((err) => logger.error(`Recurring invoice job failed: ${err.message}`));
  }, CHECK_INTERVAL_MS);
  setTimeout(() => {
    generateDueInvoices().catch((err) => logger.error(`Recurring invoice job failed: ${err.message}`));
  }, 45 * 1000);
}

module.exports = { startRecurringInvoiceJob, generateDueInvoices };
