const router = require('express').Router();
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created, notFound } = require('../../utils/response');
const emailService = require('../../services/email.service');

router.use(authenticate, sameCompany);

router.get('/', async (req, res, next) => {
  try {
    const workflows = await prisma.workflow.findMany({
      where: { companyId: req.companyId },
      include: { _count: { select: { executions: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return success(res, workflows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: {
        executions: { orderBy: { startedAt: 'desc' }, take: 10 },
      },
    });
    if (!workflow) return notFound(res, 'Workflow not found');
    return success(res, workflow);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const workflow = await prisma.workflow.create({
      data: { ...req.body, companyId: req.companyId },
    });
    return created(res, workflow, 'Workflow created');
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.workflow.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Workflow not found');
    const workflow = await prisma.workflow.update({ where: { id: req.params.id }, data: req.body });
    return success(res, workflow, 'Workflow updated');
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.workflow.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'Workflow not found');
    await prisma.workflow.delete({ where: { id: req.params.id } });
    return success(res, {}, 'Workflow deleted');
  } catch (err) { next(err); }
});

// Toggle active status
router.post('/:id/toggle', async (req, res, next) => {
  try {
    const workflow = await prisma.workflow.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!workflow) return notFound(res, 'Workflow not found');
    const updated = await prisma.workflow.update({
      where: { id: req.params.id },
      data: { isActive: !workflow.isActive },
    });
    return success(res, updated, `Workflow ${updated.isActive ? 'activated' : 'deactivated'}`);
  } catch (err) { next(err); }
});

// Manual trigger
router.post('/:id/trigger', async (req, res, next) => {
  try {
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
    });
    if (!workflow) return notFound(res, 'Workflow not found');

    const execution = await executeWorkflow(workflow, req.body.triggerData || {});
    return success(res, execution, 'Workflow triggered');
  } catch (err) { next(err); }
});

// Executions
router.get('/:id/executions', async (req, res, next) => {
  try {
    const executions = await prisma.workflowExecution.findMany({
      where: { workflowId: req.params.id },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return success(res, executions);
  } catch (err) { next(err); }
});

async function executeWorkflow(workflow, triggerData) {
  const execution = await prisma.workflowExecution.create({
    data: { workflowId: workflow.id, status: 'running', triggerData },
  });

  const logs = [];
  let status = 'completed';

  try {
    const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
    for (const node of nodes) {
      try {
        await executeNode(node, triggerData, workflow.companyId);
        logs.push({ nodeId: node.id, status: 'success', timestamp: new Date() });
      } catch (nodeErr) {
        logs.push({ nodeId: node.id, status: 'error', error: nodeErr.message, timestamp: new Date() });
        if (node.stopOnError) { status = 'failed'; break; }
      }
    }
  } catch (err) {
    status = 'failed';
    logs.push({ error: err.message, timestamp: new Date() });
  }

  await prisma.workflowExecution.update({
    where: { id: execution.id },
    data: { status, logs, completedAt: new Date() },
  });

  await prisma.workflow.update({
    where: { id: workflow.id },
    data: { runCount: { increment: 1 }, lastRunAt: new Date() },
  });

  return execution;
}

async function executeNode(node, triggerData, companyId) {
  switch (node.type) {
    case 'send_email':
      await emailService.send({
        to: node.config.to || triggerData.email,
        subject: node.config.subject,
        html: node.config.body,
        companyId,
      });
      break;
    case 'create_task':
      await prisma.task.create({
        data: {
          companyId,
          title: node.config.title,
          status: 'todo',
          priority: node.config.priority || 'medium',
          assigneeId: node.config.assigneeId,
        },
      });
      break;
    case 'create_notification':
      if (node.config.userId) {
        await prisma.notification.create({
          data: {
            companyId,
            userId: node.config.userId,
            type: 'workflow',
            title: node.config.title,
            message: node.config.message,
          },
        });
      }
      break;
    case 'update_lead':
      if (triggerData.leadId) {
        await prisma.lead.update({ where: { id: triggerData.leadId }, data: node.config.updates });
      }
      break;
    case 'wait':
      // In real implementation, this would use Bull queue for delay
      await new Promise(r => setTimeout(r, Math.min(node.config.delayMs || 0, 5000)));
      break;
    default:
      break;
  }
}

module.exports = { router, executeWorkflow };
