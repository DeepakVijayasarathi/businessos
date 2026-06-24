const router = require('express').Router();
const { PrismaClient } = require('@prisma/client');
const { authenticate: auth } = require('../../middleware/auth');
const { success, error } = require('../../utils/response');

const prisma = new PrismaClient();

// ─── JOBS ────────────────────────────────────────────────────────────────────

router.get('/jobs', auth, async (req, res) => {
  try {
    const { status, department, limit = 50, page = 1 } = req.query;
    const where = { companyId: req.user.companyId };
    if (status) where.status = status;
    if (department) where.department = department;

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: { _count: { select: { candidates: true } } },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
        skip: (Number(page) - 1) * Number(limit),
      }),
      prisma.job.count({ where }),
    ]);
    return success(res, { jobs, total });
  } catch (e) {
    return error(res, e.message);
  }
});

router.post('/jobs', auth, async (req, res) => {
  try {
    const { title, department, location, type, description, requirements,
            salaryMin, salaryMax, status, deadline, openings, hiringManagerId } = req.body;
    if (!title) return error(res, 'Title is required', 400);
    const job = await prisma.job.create({
      data: {
        companyId: req.user.companyId,
        title, department, location,
        type: type || 'full_time',
        description, requirements,
        salaryMin: salaryMin ? Number(salaryMin) : null,
        salaryMax: salaryMax ? Number(salaryMax) : null,
        status: status || 'open',
        deadline: deadline ? new Date(deadline) : null,
        openings: openings ? Number(openings) : 1,
        hiringManagerId: hiringManagerId || null,
      },
    });
    return success(res, job, 201);
  } catch (e) {
    return error(res, e.message);
  }
});

router.put('/jobs/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.job.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return error(res, 'Not found', 404);
    const { title, department, location, type, description, requirements,
            salaryMin, salaryMax, status, deadline, openings, hiringManagerId } = req.body;
    const job = await prisma.job.update({
      where: { id: req.params.id },
      data: {
        title, department, location, type, description, requirements,
        salaryMin: salaryMin !== undefined ? (salaryMin ? Number(salaryMin) : null) : undefined,
        salaryMax: salaryMax !== undefined ? (salaryMax ? Number(salaryMax) : null) : undefined,
        status,
        deadline: deadline !== undefined ? (deadline ? new Date(deadline) : null) : undefined,
        openings: openings !== undefined ? Number(openings) : undefined,
        hiringManagerId: hiringManagerId !== undefined ? hiringManagerId || null : undefined,
      },
    });
    return success(res, job);
  } catch (e) {
    return error(res, e.message);
  }
});

router.delete('/jobs/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.job.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return error(res, 'Not found', 404);
    await prisma.job.delete({ where: { id: req.params.id } });
    return success(res, { deleted: true });
  } catch (e) {
    return error(res, e.message);
  }
});

// ─── CANDIDATES ──────────────────────────────────────────────────────────────

router.get('/candidates', auth, async (req, res) => {
  try {
    const { jobId, stage, search, limit = 100, page = 1 } = req.query;
    const where = { companyId: req.user.companyId };
    if (jobId) where.jobId = jobId;
    if (stage) where.stage = stage;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        include: {
          job: { select: { id: true, title: true, department: true } },
          _count: { select: { interviews: true } },
        },
        orderBy: { appliedAt: 'desc' },
        take: Number(limit),
        skip: (Number(page) - 1) * Number(limit),
      }),
      prisma.candidate.count({ where }),
    ]);
    return success(res, { candidates, total });
  } catch (e) {
    return error(res, e.message);
  }
});

router.post('/candidates', auth, async (req, res) => {
  try {
    const { jobId, firstName, lastName, email, phone, resumeUrl, linkedIn,
            stage, rating, notes, source, expectedSalary } = req.body;
    if (!jobId || !firstName || !email) return error(res, 'Job, first name and email are required', 400);
    const job = await prisma.job.findFirst({ where: { id: jobId, companyId: req.user.companyId } });
    if (!job) return error(res, 'Job not found', 404);
    const candidate = await prisma.candidate.create({
      data: {
        companyId: req.user.companyId,
        jobId, firstName, lastName, email, phone, resumeUrl, linkedIn,
        stage: stage || 'applied',
        rating: rating ? Number(rating) : null,
        notes, source,
        expectedSalary: expectedSalary ? Number(expectedSalary) : null,
      },
      include: { job: { select: { id: true, title: true } } },
    });
    return success(res, candidate, 201);
  } catch (e) {
    return error(res, e.message);
  }
});

router.put('/candidates/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.candidate.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return error(res, 'Not found', 404);
    const { firstName, lastName, email, phone, resumeUrl, linkedIn,
            stage, rating, notes, source, expectedSalary } = req.body;
    const candidate = await prisma.candidate.update({
      where: { id: req.params.id },
      data: {
        firstName, lastName, email, phone, resumeUrl, linkedIn, stage, notes, source,
        rating: rating !== undefined ? (rating ? Number(rating) : null) : undefined,
        expectedSalary: expectedSalary !== undefined ? (expectedSalary ? Number(expectedSalary) : null) : undefined,
      },
      include: { job: { select: { id: true, title: true } } },
    });
    return success(res, candidate);
  } catch (e) {
    return error(res, e.message);
  }
});

router.delete('/candidates/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.candidate.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return error(res, 'Not found', 404);
    await prisma.candidate.delete({ where: { id: req.params.id } });
    return success(res, { deleted: true });
  } catch (e) {
    return error(res, e.message);
  }
});

// ─── INTERVIEWS ───────────────────────────────────────────────────────────────

router.get('/interviews', auth, async (req, res) => {
  try {
    const { candidateId, jobId } = req.query;
    const where = { companyId: req.user.companyId };
    if (candidateId) where.candidateId = candidateId;
    if (jobId) where.jobId = jobId;
    const interviews = await prisma.interview.findMany({
      where,
      include: {
        candidate: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { scheduledAt: 'desc' },
    });
    return success(res, interviews);
  } catch (e) {
    return error(res, e.message);
  }
});

router.post('/interviews', auth, async (req, res) => {
  try {
    const { candidateId, jobId, scheduledAt, duration, type, interviewers,
            feedback, rating, status, meetingUrl } = req.body;
    if (!candidateId || !scheduledAt) return error(res, 'Candidate and scheduled time required', 400);
    const candidate = await prisma.candidate.findFirst({ where: { id: candidateId, companyId: req.user.companyId } });
    if (!candidate) return error(res, 'Candidate not found', 404);
    const interview = await prisma.interview.create({
      data: {
        companyId: req.user.companyId,
        candidateId,
        jobId: jobId || candidate.jobId,
        scheduledAt: new Date(scheduledAt),
        duration: duration ? Number(duration) : 60,
        type: type || 'video',
        interviewers: interviewers || [],
        feedback, meetingUrl,
        rating: rating ? Number(rating) : null,
        status: status || 'scheduled',
      },
    });
    return success(res, interview, 201);
  } catch (e) {
    return error(res, e.message);
  }
});

router.put('/interviews/:id', auth, async (req, res) => {
  try {
    const existing = await prisma.interview.findFirst({ where: { id: req.params.id, companyId: req.user.companyId } });
    if (!existing) return error(res, 'Not found', 404);
    const { scheduledAt, duration, type, interviewers, feedback, rating, status, meetingUrl } = req.body;
    const interview = await prisma.interview.update({
      where: { id: req.params.id },
      data: {
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        duration: duration !== undefined ? Number(duration) : undefined,
        type, interviewers, feedback, meetingUrl, status,
        rating: rating !== undefined ? (rating ? Number(rating) : null) : undefined,
      },
    });
    return success(res, interview);
  } catch (e) {
    return error(res, e.message);
  }
});

module.exports = router;
