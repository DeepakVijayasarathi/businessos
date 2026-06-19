const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany, optionalAuth } = require('../../middleware/auth');
const { success, created, notFound } = require('../../utils/response');
const emailService = require('../../services/email.service');

// Services (public)
router.get('/services', optionalAuth, async (req, res, next) => {
  try {
    const companyId = req.companyId || req.query.companyId;
    const services = await prisma.appointmentService.findMany({
      where: { companyId, isActive: true },
    });
    return success(res, services);
  } catch (err) { next(err); }
});

router.post('/services', authenticate, sameCompany, async (req, res, next) => {
  try {
    const service = await prisma.appointmentService.create({
      data: { ...req.body, companyId: req.companyId },
    });
    return created(res, service, 'Service created');
  } catch (err) { next(err); }
});

router.put('/services/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const service = await prisma.appointmentService.update({ where: { id: req.params.id }, data: req.body });
    return success(res, service, 'Service updated');
  } catch (err) { next(err); }
});

// Appointments
router.get('/', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { startDate, endDate, staffId, status, contactId } = req.query;
    const appointments = await prisma.appointment.findMany({
      where: {
        companyId: req.companyId,
        ...(staffId && { staffId }),
        ...(status && { status }),
        ...(contactId && { contactId }),
        ...(startDate && endDate && { startAt: { gte: new Date(startDate), lte: new Date(endDate) } }),
      },
      include: {
        service: true,
        staff: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        contact: true,
      },
      orderBy: { startAt: 'asc' },
    });
    return success(res, appointments);
  } catch (err) { next(err); }
});

router.get('/calendar', authenticate, sameCompany, async (req, res, next) => {
  try {
    const { year = new Date().getFullYear(), month = new Date().getMonth() + 1 } = req.query;
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const appointments = await prisma.appointment.findMany({
      where: {
        companyId: req.companyId,
        startAt: { gte: start, lte: end },
      },
      include: {
        service: true,
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return success(res, appointments);
  } catch (err) { next(err); }
});

// Public booking
router.post('/book', optionalAuth, async (req, res, next) => {
  try {
    const {
      companyId: bodyCompanyId, serviceId, staffId,
      startAt, startTime, endAt,
      contactName, firstName, lastName, contactEmail, email, phone,
      notes,
    } = req.body;

    const resolvedCompanyId = req.companyId || bodyCompanyId;
    const resolvedStartAt = startAt || startTime;
    const resolvedEmail = contactEmail || email;
    const resolvedName = contactName || [firstName, lastName].filter(Boolean).join(' ');

    // Calculate endAt from service duration if not provided
    let resolvedEndAt = endAt;
    if (!resolvedEndAt && serviceId && resolvedStartAt) {
      const service = await prisma.appointmentService.findUnique({ where: { id: serviceId } });
      if (service) {
        const end = new Date(resolvedStartAt);
        end.setMinutes(end.getMinutes() + (service.duration || 60));
        resolvedEndAt = end.toISOString();
      }
    }

    let contact;
    if (resolvedEmail && resolvedCompanyId) {
      contact = await prisma.contact.upsert({
        where: { companyId_email: { companyId: resolvedCompanyId, email: resolvedEmail } },
        update: { phone: phone || undefined },
        create: {
          companyId: resolvedCompanyId,
          firstName: firstName || resolvedName?.split(' ')[0] || 'Guest',
          lastName: lastName || resolvedName?.split(' ').slice(1).join(' ') || '',
          email: resolvedEmail,
          phone,
        },
      }).catch(() => null);
    }

    const appointment = await prisma.appointment.create({
      data: {
        companyId: resolvedCompanyId,
        serviceId,
        staffId: staffId || null,
        startAt: new Date(resolvedStartAt),
        endAt: resolvedEndAt ? new Date(resolvedEndAt) : new Date(resolvedStartAt),
        status: 'scheduled',
        notes,
        contactId: contact?.id,
        title: resolvedName ? `Appointment - ${resolvedName}` : 'Appointment',
        bookedById: req.userId || null,
      },
      include: { service: true },
    });

    if (resolvedEmail) {
      emailService.sendAppointmentConfirmation({
        to: resolvedEmail,
        appointment,
        companyId: resolvedCompanyId,
      }).catch(() => {});
    }

    return created(res, appointment, 'Appointment booked');
  } catch (err) { next(err); }
});

router.post('/', authenticate, sameCompany, async (req, res, next) => {
  try {
    const appointment = await prisma.appointment.create({
      data: { ...req.body, companyId: req.companyId },
      include: { service: true },
    });
    return created(res, appointment, 'Appointment created');
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, sameCompany, async (req, res, next) => {
  try {
    const appointment = await prisma.appointment.update({ where: { id: req.params.id }, data: req.body });
    return success(res, appointment, 'Appointment updated');
  } catch (err) { next(err); }
});

router.post('/:id/cancel', authenticate, sameCompany, async (req, res, next) => {
  try {
    const appointment = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status: 'cancelled', cancelReason: req.body.reason },
    });
    return success(res, appointment, 'Appointment cancelled');
  } catch (err) { next(err); }
});

module.exports = router;
