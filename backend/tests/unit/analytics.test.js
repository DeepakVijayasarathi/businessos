const request = require('supertest');
const express = require('express');
const { describe, it, expect, beforeEach } = require('@jest/globals');

jest.mock('../../src/config/prisma', () => ({
  lead: { count: jest.fn(), groupBy: jest.fn() },
  contact: { count: jest.fn() },
  deal: { count: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
  ticket: { count: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
  employee: { count: jest.fn() },
  project: { count: jest.fn() },
  invoice: { aggregate: jest.fn(), count: jest.fn() },
  aiConversation: { count: jest.fn(), groupBy: jest.fn() },
  aiMessage: { count: jest.fn() },
  task: { groupBy: jest.fn() },
  attendance: { groupBy: jest.fn() },
  leaveRequest: { groupBy: jest.fn() },
  pipelineStage: { findMany: jest.fn() },
}));

jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.userId = 'u1'; req.companyId = 'c1'; req.permissions = new Set(['*']); next(); },
  sameCompany: (req, res, next) => next(),
}));

const prisma = require('../../src/config/prisma');
const router = require('../../src/modules/analytics/analytics.routes');

const app = express();
app.use(express.json());
app.use('/', router);
app.use((err, req, res, next) => res.status(500).json({ success: false, message: err.message }));

const zeroAgg = { _sum: { total: null }, _count: 0 };

describe('Analytics — Dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.lead.count.mockResolvedValue(0);
    prisma.contact.count.mockResolvedValue(0);
    prisma.deal.count.mockResolvedValue(0);
    prisma.deal.aggregate.mockResolvedValue({ _sum: { value: null }, _count: 0 });
    prisma.ticket.count.mockResolvedValue(0);
    prisma.employee.count.mockResolvedValue(0);
    prisma.project.count.mockResolvedValue(0);
    prisma.invoice.aggregate.mockResolvedValue(zeroAgg);
    prisma.aiConversation.count.mockResolvedValue(0);
  });

  it('GET /dashboard — returns all KPI fields', async () => {
    prisma.lead.count.mockResolvedValueOnce(100).mockResolvedValueOnce(20).mockResolvedValueOnce(15);
    prisma.invoice.aggregate.mockResolvedValueOnce({ _sum: { total: 50000 } }).mockResolvedValueOnce({ _sum: { total: 5000 } });
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toHaveProperty('leads');
    expect(d).toHaveProperty('contacts');
    expect(d).toHaveProperty('deals');
    expect(d).toHaveProperty('tickets');
    expect(d).toHaveProperty('revenue');
    expect(d).toHaveProperty('ai');
  });

  it('GET /dashboard — coerces null aggregates to 0', async () => {
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.data.revenue.total).toBe(0);
    expect(res.body.data.deals.wonValue).toBe(0);
  });

  it('GET /dashboard — calculates lead growth when last month has data', async () => {
    // thisMonth=10, lastMonth=5 → growth = 100%
    prisma.lead.count
      .mockResolvedValueOnce(50)   // total
      .mockResolvedValueOnce(10)   // thisMonth
      .mockResolvedValueOnce(5);   // lastMonth
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(200);
    expect(Number(res.body.data.leads.growth)).toBe(100);
  });

  it('GET /dashboard — defaults growth to 100 when last month is 0', async () => {
    prisma.lead.count
      .mockResolvedValueOnce(10).mockResolvedValueOnce(10).mockResolvedValueOnce(0);
    const res = await request(app).get('/dashboard');
    expect(res.body.data.leads.growth).toBe(100);
  });
});

describe('Analytics — Revenue Chart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.invoice.aggregate.mockResolvedValue(zeroAgg);
  });

  it('GET /revenue — returns 12 months of data', async () => {
    const res = await request(app).get('/revenue');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(12);
    expect(res.body.data[0]).toHaveProperty('month');
    expect(res.body.data[0]).toHaveProperty('revenue');
  });

  it('GET /revenue — accepts year param', async () => {
    const res = await request(app).get('/revenue?year=2025');
    expect(res.status).toBe(200);
    expect(prisma.invoice.aggregate).toHaveBeenCalledTimes(12);
  });
});

describe('Analytics — Lead Analytics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /leads/sources — returns lead counts by source', async () => {
    prisma.lead.groupBy.mockResolvedValue([{ source: 'website', _count: 15 }, { source: 'referral', _count: 8 }]);
    const res = await request(app).get('/leads/sources');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('GET /leads/funnel — returns lead counts by status', async () => {
    prisma.lead.groupBy.mockResolvedValue([
      { status: 'new', _count: 20 }, { status: 'contacted', _count: 12 }, { status: 'converted', _count: 3 },
    ]);
    const res = await request(app).get('/leads/funnel');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
  });
});

describe('Analytics — Support', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /support — returns ticket breakdown and avg resolution time', async () => {
    prisma.ticket.groupBy
      .mockResolvedValueOnce([{ status: 'open', _count: 5 }])
      .mockResolvedValueOnce([{ priority: 'high', _count: 3 }]);
    prisma.ticket.findMany.mockResolvedValue([
      { createdAt: new Date(Date.now() - 2 * 3600000), resolvedAt: new Date() },
    ]);
    const res = await request(app).get('/support');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('byStatus');
    expect(res.body.data).toHaveProperty('avgResolutionHours');
    expect(typeof res.body.data.avgResolutionHours).toBe('number');
  });

  it('GET /support — avgResolutionHours is 0 when no resolved tickets', async () => {
    prisma.ticket.groupBy.mockResolvedValue([]);
    prisma.ticket.findMany.mockResolvedValue([]);
    const res = await request(app).get('/support');
    expect(res.status).toBe(200);
    expect(res.body.data.avgResolutionHours).toBe(0);
  });
});

describe('Analytics — AI Usage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /ai/usage — returns conversation and message counts', async () => {
    prisma.aiConversation.count.mockResolvedValue(42);
    prisma.aiMessage.count.mockResolvedValue(210);
    prisma.aiConversation.groupBy.mockResolvedValue([{ type: 'support', _count: 30 }]);
    const res = await request(app).get('/ai/usage');
    expect(res.status).toBe(200);
    expect(res.body.data.conversations).toBe(42);
    expect(res.body.data.messages).toBe(210);
    expect(res.body.data.byType).toHaveLength(1);
  });

  it('GET /ai/usage — accepts days param', async () => {
    prisma.aiConversation.count.mockResolvedValue(5);
    prisma.aiMessage.count.mockResolvedValue(25);
    prisma.aiConversation.groupBy.mockResolvedValue([]);
    const res = await request(app).get('/ai/usage?days=7');
    expect(res.status).toBe(200);
    expect(prisma.aiConversation.count).toHaveBeenCalled();
  });
});

describe('Analytics — Employee Productivity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /employees/productivity — returns tasks, attendance, leaves', async () => {
    prisma.task.groupBy.mockResolvedValue([{ assigneeId: 'u1', _count: 5 }]);
    prisma.attendance.groupBy.mockResolvedValue([{ employeeId: 'emp1', _count: 20 }]);
    prisma.leaveRequest.groupBy.mockResolvedValue([{ employeeId: 'emp1', _sum: { totalDays: 2 } }]);
    const res = await request(app).get('/employees/productivity');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('tasksCompleted');
    expect(res.body.data).toHaveProperty('attendanceDays');
    expect(res.body.data).toHaveProperty('leaveDays');
  });
});

describe('Analytics — Forecast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.invoice.aggregate.mockResolvedValue(zeroAgg);
    prisma.deal.aggregate.mockResolvedValue({ _sum: { value: null } });
  });

  it('GET /forecast — returns 6 actual + 3 forecast months', async () => {
    const res = await request(app).get('/forecast');
    expect(res.status).toBe(200);
    expect(res.body.data.months).toHaveLength(9);
    const actuals = res.body.data.months.filter(m => m.type === 'actual');
    const forecasts = res.body.data.months.filter(m => m.type === 'forecast');
    expect(actuals).toHaveLength(6);
    expect(forecasts).toHaveLength(3);
  });

  it('GET /forecast — forecast values are non-negative', async () => {
    const res = await request(app).get('/forecast');
    const forecasts = res.body.data.months.filter(m => m.type === 'forecast');
    forecasts.forEach(f => expect(f.revenue).toBeGreaterThanOrEqual(0));
  });

  it('GET /forecast — includes pipelineValue from deals', async () => {
    prisma.deal.aggregate.mockResolvedValue({ _sum: { value: 75000 } });
    const res = await request(app).get('/forecast');
    expect(res.body.data.pipelineValue).toBe(75000);
  });
});
