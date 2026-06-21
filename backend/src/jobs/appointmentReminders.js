const prisma = require('../config/prisma');
const emailService = require('../services/email.service');
const logger = require('../config/logger');

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes
const REMINDER_LEAD_MINUTES = parseInt(process.env.APPOINTMENT_REMINDER_LEAD_MINUTES || '1440', 10); // default 24h before

async function sendDueReminders() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_LEAD_MINUTES * 60 * 1000);

  const dueAppointments = await prisma.appointment.findMany({
    where: {
      status: 'scheduled',
      reminderSent: false,
      startAt: { gte: now, lte: windowEnd },
    },
    include: { contact: true },
    take: 100,
  });

  for (const appointment of dueAppointments) {
    const to = appointment.contact?.email;
    if (!to) {
      // No contact email to remind — mark sent so it's not retried every cycle.
      await prisma.appointment.update({ where: { id: appointment.id }, data: { reminderSent: true } });
      continue;
    }
    try {
      await emailService.sendAppointmentReminder({ to, appointment, companyId: appointment.companyId });
      await prisma.appointment.update({ where: { id: appointment.id }, data: { reminderSent: true } });
    } catch (err) {
      logger.warn(`Failed to send appointment reminder for ${appointment.id}: ${err.message}`);
    }
  }

  if (dueAppointments.length) {
    logger.info(`Appointment reminders: processed ${dueAppointments.length} appointment(s)`);
  }
}

function startAppointmentReminderJob() {
  setInterval(() => {
    sendDueReminders().catch((err) => logger.error(`Appointment reminder job failed: ${err.message}`));
  }, CHECK_INTERVAL_MS);
  // Run once shortly after boot too, instead of waiting a full interval.
  setTimeout(() => {
    sendDueReminders().catch((err) => logger.error(`Appointment reminder job failed: ${err.message}`));
  }, 30 * 1000);
}

module.exports = { startAppointmentReminderJob, sendDueReminders };
