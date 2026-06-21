const nodemailer = require('nodemailer');
const { smtp, appUrl } = require('../config');
const { decrypt } = require('../utils/helpers');
const logger = require('../config/logger');
const prisma = require('../config/prisma');

class EmailService {
  async getTransporter(companyId = null) {
    let config = smtp;

    if (companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { smtpHost: true, smtpPort: true, smtpUser: true, smtpPass: true, smtpFrom: true },
      });
      if (company?.smtpHost && company?.smtpUser) {
        config = {
          host: company.smtpHost,
          port: company.smtpPort || 587,
          user: company.smtpUser,
          pass: decrypt(company.smtpPass),   // stored encrypted
          from: company.smtpFrom || smtp.from,
        };
      }
    }

    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send({ to, subject, html, text, companyId, from, attachments } = {}) {
    try {
      const transporter = await this.getTransporter(companyId);
      await transporter.sendMail({
        from: from || smtp.from,
        to,
        subject,
        html,
        text,
        ...(attachments && { attachments }),
      });
      logger.info(`Email sent to ${to}: ${subject}`);
    } catch (err) {
      logger.error(`Email failed to ${to}:`, err.message);
      throw err;
    }
  }

  async sendWelcomeEmail(user) {
    await this.send({
      to: user.email,
      subject: 'Welcome to BusinessOS AI!',
      html: `
        <h1>Welcome, ${user.firstName}!</h1>
        <p>Your BusinessOS AI account has been created. Your 14-day free trial has started.</p>
        <p><a href="${appUrl}/login">Login to your dashboard</a></p>
      `,
    });
  }

  async sendPasswordResetEmail({ email, name, token }) {
    const resetUrl = `${appUrl}/reset-password?token=${token}`;
    await this.send({
      to: email,
      subject: 'Reset your BusinessOS AI password',
      html: `
        <h1>Password Reset Request</h1>
        <p>Hi ${name},</p>
        <p>Click below to reset your password (expires in 1 hour):</p>
        <p><a href="${resetUrl}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">Reset Password</a></p>
        <p>If you didn't request this, ignore this email.</p>
      `,
    });
  }

  async sendInvoice({ to, invoiceNo, invoiceUrl, companyId }) {
    await this.send({
      to,
      subject: `Invoice ${invoiceNo}`,
      html: `
        <h1>Invoice ${invoiceNo}</h1>
        <p>Please find your invoice attached.</p>
        ${invoiceUrl ? `<p><a href="${invoiceUrl}">View Invoice</a></p>` : ''}
      `,
      companyId,
    });
  }

  async sendTicketConfirmation({ to, ticketNo, subject: ticketSubject, companyId }) {
    await this.send({
      to,
      subject: `Support Ticket #${ticketNo} Created`,
      html: `
        <h1>Ticket Created: #${ticketNo}</h1>
        <p>We received your request: <strong>${ticketSubject}</strong></p>
        <p>Our team will respond shortly.</p>
      `,
      companyId,
    });
  }

  async sendAppointmentConfirmation({ to, appointment, companyId }) {
    const { buildAppointmentIcs } = require('../utils/ics');
    await this.send({
      to,
      subject: `Appointment Confirmed: ${appointment.title}`,
      html: `
        <h1>Appointment Confirmed</h1>
        <p><strong>${appointment.title}</strong></p>
        <p>Date: ${new Date(appointment.startAt).toLocaleString()}</p>
        ${appointment.meetingUrl ? `<p>Join: <a href="${appointment.meetingUrl}">${appointment.meetingUrl}</a></p>` : ''}
      `,
      companyId,
      attachments: [{ filename: 'appointment.ics', content: buildAppointmentIcs(appointment), contentType: 'text/calendar' }],
    });
  }

  async sendAppointmentReminder({ to, appointment, companyId }) {
    const { buildAppointmentIcs } = require('../utils/ics');
    await this.send({
      to,
      subject: `Reminder: ${appointment.title}`,
      html: `
        <h1>Upcoming Appointment Reminder</h1>
        <p><strong>${appointment.title}</strong></p>
        <p>Date: ${new Date(appointment.startAt).toLocaleString()}</p>
        ${appointment.location ? `<p>Location: ${appointment.location}</p>` : ''}
        ${appointment.meetingUrl ? `<p>Join: <a href="${appointment.meetingUrl}">${appointment.meetingUrl}</a></p>` : ''}
      `,
      companyId,
      attachments: [{ filename: 'appointment.ics', content: buildAppointmentIcs(appointment), contentType: 'text/calendar' }],
    });
  }

  async sendCampaign({ templateId, audience, subject, fromName, fromEmail, companyId }) {
    const template = await prisma.emailTemplate.findUnique({ where: { id: templateId } });
    if (!template) return;

    let sent = 0, failed = 0;
    for (const email of audience) {
      try {
        await this.send({
          to: email,
          subject,
          html: template.body,
          from: `${fromName} <${fromEmail}>`,
          companyId,
        });
        sent++;
      } catch {
        failed++;
      }
    }
    return { sent, failed };
  }
}

module.exports = new EmailService();
