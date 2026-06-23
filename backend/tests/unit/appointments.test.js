const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  appointment: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  appointmentService: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  contact: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
  optionalAuth: (req, res, next) => { req.userId = null; req.companyId = null; next(); },
}));

jest.mock('../../src/services/email.service', () => ({
  sendAppointmentConfirmation: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/utils/ics', () => ({
  buildAppointmentIcs: jest.fn().mockReturnValue('BEGIN:VCALENDAR\nEND:VCALENDAR'),
}));

const prisma = require('../../src/config/prisma');
const appointmentsRouter = require('../../src/modules/appointments/appointments.routes');

const app = express();
app.use(express.json());
app.use('/', appointmentsRouter);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const MOCK_APPT = {
  id: 'appt1', title: 'Appointment - John Doe',
  startAt: new Date('2026-07-01T10:00:00Z'),
  endAt: new Date('2026-07-01T11:00:00Z'),
  status: 'scheduled', companyId: 'c1',
};

const MOCK_SERVICE = { id: 'svc1', name: 'Consultation', duration: 60, isActive: true, companyId: 'c1' };

describe('Appointments — Services', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /services — returns active services', async () => {
    prisma.appointmentService.findMany.mockResolvedValue([MOCK_SERVICE]);
    const res = await request(app).get('/services');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /services — creates service', async () => {
    prisma.appointmentService.create.mockResolvedValue(MOCK_SERVICE);
    const res = await request(app).post('/services').send({ name: 'Consultation', duration: 60 });
    expect(res.status).toBe(201);
  });

  it('PUT /services/:id — updates service', async () => {
    prisma.appointmentService.findFirst.mockResolvedValue(MOCK_SERVICE);
    prisma.appointmentService.update.mockResolvedValue({ ...MOCK_SERVICE, name: 'Consulting' });

    const res = await request(app).put('/services/svc1').send({ name: 'Consulting' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Consulting');
  });

  it('PUT /services/:id — 404 when not found', async () => {
    prisma.appointmentService.findFirst.mockResolvedValue(null);
    const res = await request(app).put('/services/missing').send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('Appointments — Booking', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / — returns appointments', async () => {
    prisma.appointment.findMany.mockResolvedValue([MOCK_APPT]);
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('GET /calendar — returns appointments for month', async () => {
    prisma.appointment.findMany.mockResolvedValue([MOCK_APPT]);
    const res = await request(app).get('/calendar?year=2026&month=7');
    expect(res.status).toBe(200);
    expect(prisma.appointment.findMany).toHaveBeenCalled();
  });

  it('POST /book — books appointment and finds existing contact', async () => {
    const mockContact = { id: 'ct1', email: 'john@doe.com' };
    prisma.appointmentService.findUnique.mockResolvedValue(MOCK_SERVICE);
    prisma.contact.findFirst.mockResolvedValue(mockContact);
    prisma.appointment.create.mockResolvedValue({ ...MOCK_APPT, service: MOCK_SERVICE, contactId: 'ct1' });

    const res = await request(app).post('/book').send({
      companyId: 'c1', serviceId: 'svc1',
      startAt: '2026-07-01T10:00:00Z',
      firstName: 'John', lastName: 'Doe',
      email: 'john@doe.com',
    });
    expect(res.status).toBe(201);
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('POST /book — creates new contact if none exists', async () => {
    prisma.appointmentService.findUnique.mockResolvedValue(MOCK_SERVICE);
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'ct2', email: 'new@user.com' });
    prisma.appointment.create.mockResolvedValue({ ...MOCK_APPT, service: MOCK_SERVICE });

    const res = await request(app).post('/book').send({
      companyId: 'c1', serviceId: 'svc1',
      startAt: '2026-07-01T10:00:00Z',
      firstName: 'New', lastName: 'User',
      email: 'new@user.com',
    });
    expect(res.status).toBe(201);
    expect(prisma.contact.create).toHaveBeenCalled();
  });

  it('POST /book — calculates endAt from service duration', async () => {
    prisma.appointmentService.findUnique.mockResolvedValue(MOCK_SERVICE);
    prisma.contact.findFirst.mockResolvedValue(null);
    prisma.contact.create.mockResolvedValue({ id: 'ct1' });
    prisma.appointment.create.mockResolvedValue({ ...MOCK_APPT, service: MOCK_SERVICE });

    await request(app).post('/book').send({
      companyId: 'c1', serviceId: 'svc1',
      startAt: '2026-07-01T10:00:00Z',
      email: 'guest@test.com',
    });

    const createCall = prisma.appointment.create.mock.calls[0][0];
    expect(createCall.data.endAt).toBeDefined();
    const start = new Date('2026-07-01T10:00:00Z');
    const expectedEnd = new Date(start);
    expectedEnd.setMinutes(expectedEnd.getMinutes() + 60);
    expect(new Date(createCall.data.endAt).getTime()).toBe(expectedEnd.getTime());
  });

  it('POST /:id/cancel — cancels appointment', async () => {
    prisma.appointment.findFirst.mockResolvedValue(MOCK_APPT);
    prisma.appointment.update.mockResolvedValue({ ...MOCK_APPT, status: 'cancelled', cancelReason: 'Too busy' });

    const res = await request(app).post('/appt1/cancel').send({ reason: 'Too busy' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });

  it('POST /:id/cancel — 404 when not found', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/missing/cancel').send({ reason: 'X' });
    expect(res.status).toBe(404);
  });

  it('GET /:id/ics — returns calendar file', async () => {
    prisma.appointment.findFirst.mockResolvedValue(MOCK_APPT);
    const res = await request(app).get('/appt1/ics');
    expect(res.status).toBe(200);
    expect(res.header['content-type']).toMatch(/text\/calendar/);
    expect(res.text).toContain('VCALENDAR');
  });

  it('GET /:id/ics — 404 when not found', async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/missing/ics');
    expect(res.status).toBe(404);
  });
});
