const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created, paginated, notFound, error } = require('../../utils/response');
const { paginate, paginateMeta, pick } = require('../../utils/helpers');
const { auditLog } = require('../../middleware/audit');

router.use(authenticate, sameCompany);

const PROJECT_WRITABLE_FIELDS = ['name', 'description', 'status', 'priority', 'startDate', 'endDate', 'budget', 'spent', 'progress', 'clientId', 'managerId', 'color', 'tags'];
const TASK_WRITABLE_FIELDS = ['projectId', 'milestoneId', 'leadId', 'contactId', 'dealId', 'title', 'description', 'status', 'priority', 'assigneeId', 'dueDate', 'startDate', 'completedAt', 'estimatedHours', 'actualHours', 'tags', 'parentTaskId'];

// Projects
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(status && { status }),
      ...(search && { name: { contains: search, mode: 'insensitive' } }),
    };
    const [projects, total] = await Promise.all([
      prisma.project.findMany({ where, take, skip, include: { milestones: true, members: true, _count: { select: { tasks: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.project.count({ where }),
    ]);
    return paginated(res, projects, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: {
        milestones: true,
        members: true,
        tasks: { include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } } },
        files: true,
      },
    });
    if (!project) return notFound(res, 'Project not found');
    return success(res, project);
  } catch (err) { next(err); }
});

router.post('/', auditLog('projects', 'project'), async (req, res, next) => {
  try {
    if (!req.body.name) return error(res, 'Project name is required', 400);
    const project = await prisma.project.create({
      data: { ...pick(req.body, PROJECT_WRITABLE_FIELDS), companyId: req.companyId },
    });
    return created(res, project, 'Project created');
  } catch (err) { next(err); }
});

router.put('/:id', auditLog('projects', 'project'), async (req, res, next) => {
  try {
    const existing = await prisma.project.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Project not found');
    const project = await prisma.project.update({ where: { id: req.params.id }, data: pick(req.body, PROJECT_WRITABLE_FIELDS) });
    return success(res, project, 'Project updated');
  } catch (err) { next(err); }
});

router.delete('/:id', auditLog('projects', 'project'), async (req, res, next) => {
  try {
    const existing = await prisma.project.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Project not found');
    await prisma.project.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Project deleted');
  } catch (err) { next(err); }
});

// Tasks
router.get('/tasks/all', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, priority, assigneeId, projectId } = req.query;
    const { take, skip } = paginate(page, limit);
    const where = {
      companyId: req.companyId,
      ...(status && { status }),
      ...(priority && { priority }),
      ...(assigneeId && { assigneeId }),
      ...(projectId && { projectId }),
    };
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where, take, skip,
        include: {
          assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.task.count({ where }),
    ]);
    return paginated(res, tasks, paginateMeta(total, page, limit));
  } catch (err) { next(err); }
});

router.post('/tasks', auditLog('projects.tasks', 'task'), async (req, res, next) => {
  try {
    if (!req.body.title) return error(res, 'Task title is required', 400);
    const task = await prisma.task.create({
      data: { ...pick(req.body, TASK_WRITABLE_FIELDS), companyId: req.companyId, creatorId: req.userId },
      include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });
    return created(res, task, 'Task created');
  } catch (err) { next(err); }
});

router.put('/tasks/:id', auditLog('projects.tasks', 'task'), async (req, res, next) => {
  try {
    const existing = await prisma.task.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Task not found');
    const task = await prisma.task.update({ where: { id: req.params.id }, data: pick(req.body, TASK_WRITABLE_FIELDS) });
    return success(res, task, 'Task updated');
  } catch (err) { next(err); }
});

router.delete('/tasks/:id', auditLog('projects.tasks', 'task'), async (req, res, next) => {
  try {
    const existing = await prisma.task.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Task not found');
    await prisma.task.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Task deleted');
  } catch (err) { next(err); }
});

// Kanban board for project — capped per-column (was previously fetching
// every task for the project unbounded, then bucketing in memory).
router.get('/:id/kanban', async (req, res, next) => {
  try {
    const columns = ['todo', 'in_progress', 'review', 'done'];
    const columnResults = await Promise.all(columns.map(status =>
      prisma.task.findMany({
        where: { projectId: req.params.id, companyId: req.companyId, status },
        include: { assignee: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
        orderBy: { order: 'asc' },
        take: 100,
      })
    ));
    const board = columns.reduce((acc, col, i) => {
      acc[col] = columnResults[i];
      return acc;
    }, {});
    return success(res, board);
  } catch (err) { next(err); }
});

// Comments
router.get('/tasks/:id/comments', async (req, res, next) => {
  try {
    const task = await prisma.task.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!task) return notFound(res, 'Task not found');
    const comments = await prisma.comment.findMany({
      where: { taskId: req.params.id },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return success(res, comments);
  } catch (err) { next(err); }
});

router.post('/tasks/:id/comments', async (req, res, next) => {
  try {
    const task = await prisma.task.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!task) return notFound(res, 'Task not found');
    const comment = await prisma.comment.create({
      data: { taskId: req.params.id, userId: req.userId, content: req.body.content },
      include: { user: { select: { id: true, firstName: true, lastName: true, avatar: true } } },
    });
    return created(res, comment, 'Comment added');
  } catch (err) { next(err); }
});

module.exports = router;
