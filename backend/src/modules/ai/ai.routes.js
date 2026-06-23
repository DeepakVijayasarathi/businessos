const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created, error, notFound } = require('../../utils/response');
const { decrypt } = require('../../utils/helpers');
const config = require('../../config');

router.use(authenticate, sameCompany);

// Unified AI call — routes to Claude or OpenAI
// companyAnthropicKey / companyOpenaiKey are the *encrypted* DB values; we decrypt them here
async function callAI({ messages, system, companyAnthropicKey, companyOpenaiKey, companyProvider, maxTokens }) {
  const provider = companyProvider || config.ai.provider;
  const tokens = maxTokens || config.ai.maxTokens;

  if (provider === 'openai') {
    const rawKey = (companyOpenaiKey ? decrypt(companyOpenaiKey) : null) || config.ai.openaiKey;
    if (!rawKey) throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY in .env or add it in Settings → AI.');
    const client = new OpenAI({ apiKey: rawKey });
    const chatMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;
    const response = await client.chat.completions.create({
      model: config.ai.openaiModel,
      max_tokens: tokens,
      messages: chatMessages,
    });
    const text = response.choices[0].message.content;
    return { text, model: config.ai.openaiModel, provider: 'openai', usage: { input: response.usage.prompt_tokens, output: response.usage.completion_tokens } };
  }

  // Default: Claude
  const rawKey = (companyAnthropicKey ? decrypt(companyAnthropicKey) : null) || config.ai.anthropicKey;
  if (!rawKey) throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY in .env or add it in Settings → AI.');
  const client = new Anthropic({ apiKey: rawKey });
  const response = await client.messages.create({
    model: config.ai.claudeModel,
    max_tokens: tokens,
    ...(system && { system }),
    messages,
  });
  const text = response.content[0].text;
  return { text, model: config.ai.claudeModel, provider: 'claude', usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } };
}

// POST /ai/chat — General AI chat
router.post('/chat', async (req, res, next) => {
  try {
    const { message, sessionId, type = 'support', agentId, history = [] } = req.body;

    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true },
    });

    let systemPrompt = `You are an AI assistant for ${company.name}. Be helpful, concise, and professional.`;

    if (agentId) {
      const agent = await prisma.aiAgent.findUnique({ where: { id: agentId } });
      if (agent?.systemPrompt) systemPrompt = agent.systemPrompt;
    }

    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const result = await callAI({
      messages,
      system: systemPrompt,
      companyAnthropicKey: company.anthropicKey,
      companyOpenaiKey: company.openaiKey,
      companyProvider: company.aiProvider,
    });

    // Save conversation
    let conversation = await prisma.aiConversation.findFirst({
      where: { sessionId, companyId: req.companyId },
    });

    if (!conversation) {
      conversation = await prisma.aiConversation.create({
        data: { companyId: req.companyId, userId: req.userId, sessionId, type },
      });
    }

    await prisma.aiMessage.createMany({
      data: [
        { conversationId: conversation.id, role: 'user', content: message, model: result.model },
        { conversationId: conversation.id, role: 'assistant', content: result.text, tokens: result.usage.output, model: result.model },
      ],
    });

    return success(res, {
      message: result.text,
      conversationId: conversation.id,
      provider: config.ai.provider,
      model: result.model,
      usage: result.usage,
    });
  } catch (err) {
    next(err);
  }
});

// POST /ai/qualify-lead — AI lead qualification
router.post('/qualify-lead', async (req, res, next) => {
  try {
    const { leadId } = req.body;
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, companyId: req.companyId },
      include: { activities: { take: 5 } },
    });
    if (!lead) return error(res, 'Lead not found', 404);

    const prompt = `Analyze this lead and provide a qualification score (0-100) and reasoning:
Lead: ${lead.firstName} ${lead.lastName}
Company: ${lead.company || 'Unknown'}
Job Title: ${lead.jobTitle || 'Unknown'}
Source: ${lead.source || 'Unknown'}
Current Status: ${lead.status}
Activities: ${lead.activities.length} interactions
Notes: ${lead.notes || 'None'}

Respond with JSON: { "score": number, "grade": "A/B/C/D", "reasoning": "string", "nextActions": ["action1", "action2"] }`;

    const aiResult = await callAI({ messages: [{ role: 'user', content: prompt }], maxTokens: 512 });

    let result;
    try {
      result = JSON.parse(aiResult.text);
    } catch {
      result = { score: 50, grade: 'B', reasoning: aiResult.text, nextActions: [] };
    }

    await prisma.lead.update({ where: { id: leadId }, data: { score: result.score } });

    return success(res, result, 'Lead qualified');
  } catch (err) { next(err); }
});

// POST /ai/summarize — Summarize content (notes, tickets, etc.)
router.post('/summarize', async (req, res, next) => {
  try {
    const { content, type = 'general' } = req.body;
    const result = await callAI({
      messages: [{ role: 'user', content: `Summarize the following ${type} in 2-3 sentences:\n\n${content}` }],
      maxTokens: 256,
    });
    return success(res, { summary: result.text });
  } catch (err) { next(err); }
});

// POST /ai/reply-suggestion — Suggest reply for ticket/email
router.post('/reply-suggestion', async (req, res, next) => {
  try {
    const { context, type = 'support', tone = 'professional' } = req.body;
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true },
    });
    const result = await callAI({
      messages: [{ role: 'user', content: `You are a ${tone} ${type} representative at ${company.name}. Write a helpful reply to:\n\n${context}` }],
      companyAnthropicKey: company.anthropicKey,
      companyOpenaiKey: company.openaiKey,
      companyProvider: company.aiProvider,
      maxTokens: 512,
    });
    return success(res, { reply: result.text });
  } catch (err) { next(err); }
});

// POST /ai/email-draft — Draft an email
router.post('/email-draft', async (req, res, next) => {
  try {
    const { purpose, recipient, context, tone = 'professional' } = req.body;
    const result = await callAI({
      messages: [{
        role: 'user',
        content: `Write a ${tone} email for: ${purpose}\nRecipient: ${recipient}\nContext: ${context}\n\nFormat: Subject: ...\n\nBody: ...`,
      }],
      maxTokens: 512,
    });
    const subjectMatch = result.text.match(/Subject:\s*(.+)/);
    const bodyMatch = result.text.match(/Body:\s*([\s\S]+)/);
    return success(res, {
      subject: subjectMatch?.[1]?.trim() || 'Draft',
      body: bodyMatch?.[1]?.trim() || result.text,
    });
  } catch (err) { next(err); }
});

// GET /ai/intelligence — Business health score + AI insights
router.get('/intelligence', async (req, res, next) => {
  try {
    const cid = req.companyId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);

    const [
      totalLeads, newLeads, convertedLeads, prevLeads,
      openDeals, wonDeals, totalDealValue,
      openTickets, urgentTickets, avgResolutionTime,
      revenue30, revenue60,
      activeEmployees,
      overdueInvoices, totalOutstanding,
    ] = await Promise.all([
      prisma.lead.count({ where: { companyId: cid } }),
      prisma.lead.count({ where: { companyId: cid, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.lead.count({ where: { companyId: cid, status: 'converted', updatedAt: { gte: thirtyDaysAgo } } }),
      prisma.lead.count({ where: { companyId: cid, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
      prisma.deal.count({ where: { companyId: cid, status: { in: ['open', 'negotiation'] } } }),
      prisma.deal.count({ where: { companyId: cid, status: 'won', updatedAt: { gte: thirtyDaysAgo } } }),
      prisma.deal.aggregate({ where: { companyId: cid, status: { in: ['open', 'negotiation'] } }, _sum: { value: true } }),
      prisma.ticket.count({ where: { companyId: cid, status: { in: ['open', 'pending'] } } }),
      prisma.ticket.count({ where: { companyId: cid, status: { in: ['open', 'pending'] }, priority: 'urgent' } }),
      prisma.ticket.count({ where: { companyId: cid, status: 'resolved', resolvedAt: { gte: thirtyDaysAgo } } }).catch(() => 0),
      prisma.invoice.aggregate({ where: { companyId: cid, status: 'paid', paidAt: { gte: thirtyDaysAgo } }, _sum: { total: true } }),
      prisma.invoice.aggregate({ where: { companyId: cid, status: 'paid', paidAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } }, _sum: { total: true } }),
      prisma.employee.count({ where: { companyId: cid, status: 'active' } }),
      prisma.invoice.count({ where: { companyId: cid, status: { in: ['sent', 'overdue'] }, dueDate: { lt: now } } }),
      prisma.invoice.aggregate({ where: { companyId: cid, status: { in: ['sent', 'overdue', 'draft'] } }, _sum: { total: true } }),
    ]);

    const rev30 = Number(revenue30._sum.total || 0);
    const rev60 = Number(revenue60._sum.total || 0);
    const revenueGrowth = rev60 > 0 ? ((rev30 - rev60) / rev60) * 100 : 0;
    const leadGrowth = prevLeads > 0 ? ((newLeads - prevLeads) / prevLeads) * 100 : 0;
    const conversionRate = newLeads > 0 ? (convertedLeads / newLeads) * 100 : 0;
    const pipelineValue = Number(totalDealValue._sum.value || 0);
    const outstanding = Number(totalOutstanding._sum.total || 0);

    // Health score (0-100): weighted across dimensions
    const scores = {
      revenue: Math.min(100, Math.max(0, 50 + revenueGrowth * 2)),
      pipeline: Math.min(100, openDeals * 5 + wonDeals * 10),
      leads: Math.min(100, 50 + leadGrowth),
      support: Math.max(0, 100 - openTickets * 3 - urgentTickets * 5),
      invoicing: Math.max(0, 100 - overdueInvoices * 10),
    };
    const healthScore = Math.round(
      scores.revenue * 0.3 + scores.pipeline * 0.25 + scores.leads * 0.2 + scores.support * 0.15 + scores.invoicing * 0.1
    );

    // AI-generated insights
    const company = await prisma.company.findUnique({ where: { id: cid }, select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true } });
    const dataContext = `Company: ${company?.name}. Last 30 days: Revenue $${rev30.toFixed(0)}, growth ${revenueGrowth.toFixed(1)}%. New leads: ${newLeads} (${leadGrowth > 0 ? '+' : ''}${leadGrowth.toFixed(1)}%). Conversion rate: ${conversionRate.toFixed(1)}%. Open deals: ${openDeals} worth $${pipelineValue.toFixed(0)}. Won deals: ${wonDeals}. Open tickets: ${openTickets} (${urgentTickets} urgent). Employees: ${activeEmployees}. Overdue invoices: ${overdueInvoices}. Outstanding receivables: $${outstanding.toFixed(0)}.`;

    let insights = [];
    try {
      const aiResult = await callAI({
        messages: [{ role: 'user', content: `Based on this business data, provide exactly 4 concise business insights (each max 20 words). Focus on the most important trends, risks, and opportunities. Data: ${dataContext}` }],
        system: 'You are a business analyst. Return a JSON array of exactly 4 strings, each a brief insight. No markdown, just raw JSON array.',
        companyAnthropicKey: company?.anthropicKey,
        companyOpenaiKey: company?.openaiKey,
        companyProvider: company?.aiProvider,
        maxTokens: 300,
      });
      const parsed = JSON.parse(aiResult.text.trim());
      insights = Array.isArray(parsed) ? parsed : [];
    } catch {
      insights = [
        revenueGrowth > 10 ? `Revenue up ${revenueGrowth.toFixed(0)}% this month — strong growth momentum.` : revenueGrowth < -10 ? `Revenue down ${Math.abs(revenueGrowth).toFixed(0)}% — review pricing and pipeline.` : `Revenue stable at $${rev30.toFixed(0)} this month.`,
        openDeals > 5 ? `${openDeals} deals worth $${pipelineValue.toFixed(0)} in pipeline — follow up to accelerate closes.` : `Pipeline thin with only ${openDeals} open deals — increase lead gen.`,
        urgentTickets > 0 ? `${urgentTickets} urgent support tickets need immediate attention.` : `Support queue healthy with no urgent issues.`,
        overdueInvoices > 0 ? `${overdueInvoices} overdue invoices totaling exposure — send payment reminders.` : `All invoices current — great AR management.`,
      ];
    }

    return res.json({
      success: true,
      data: {
        healthScore,
        scores,
        metrics: {
          revenue30: rev30, revenue60: rev60, revenueGrowth,
          newLeads, leadGrowth, conversionRate,
          openDeals, wonDeals, pipelineValue,
          openTickets, urgentTickets,
          activeEmployees, overdueInvoices, outstanding,
        },
        insights,
        trend: healthScore >= 75 ? 'excellent' : healthScore >= 50 ? 'good' : healthScore >= 30 ? 'warning' : 'critical',
      },
    });
  } catch (err) { next(err); }
});

// GET /ai/status — current provider & model info (includes per-company override)
router.get('/status', async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { anthropicKey: true, openaiKey: true, aiProvider: true },
    });
    const provider = company?.aiProvider || config.ai.provider;
    const hasClaudeKey = !!(company?.anthropicKey || config.ai.anthropicKey);
    const hasOpenAIKey = !!(company?.openaiKey || config.ai.openaiKey);
    return success(res, {
      provider,
      model: provider === 'openai' ? config.ai.openaiModel : config.ai.claudeModel,
      claudeEnabled: hasClaudeKey,
      openaiEnabled: hasOpenAIKey,
      activeKeyConfigured: provider === 'openai' ? hasOpenAIKey : hasClaudeKey,
      source: company?.aiProvider ? 'company' : 'global',
    });
  } catch (err) { next(err); }
});

// GET /ai/conversations
router.get('/conversations', async (req, res, next) => {
  try {
    const conversations = await prisma.aiConversation.findMany({
      where: { companyId: req.companyId },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return success(res, conversations);
  } catch (err) { next(err); }
});

router.get('/conversations/:id', async (req, res, next) => {
  try {
    const conversation = await prisma.aiConversation.findFirst({
      where: { id: req.params.id, companyId: req.companyId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return success(res, conversation);
  } catch (err) { next(err); }
});

// AI Agents CRUD
router.get('/agents', async (req, res, next) => {
  try {
    const agents = await prisma.aiAgent.findMany({ where: { companyId: req.companyId } });
    return success(res, agents);
  } catch (err) { next(err); }
});

router.post('/agents', async (req, res, next) => {
  try {
    const agent = await prisma.aiAgent.create({ data: { ...req.body, companyId: req.companyId } });
    return created(res, agent, 'AI agent created');
  } catch (err) { next(err); }
});

router.put('/agents/:id', async (req, res, next) => {
  try {
    const existing = await prisma.aiAgent.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'AI agent not found');
    const agent = await prisma.aiAgent.update({ where: { id: req.params.id }, data: req.body });
    return success(res, agent, 'AI agent updated');
  } catch (err) { next(err); }
});

router.delete('/agents/:id', async (req, res, next) => {
  try {
    const existing = await prisma.aiAgent.findFirst({ where: { id: req.params.id, companyId: req.companyId } });
    if (!existing) return notFound(res, 'AI agent not found');
    await prisma.aiAgent.delete({ where: { id: req.params.id } });
    return success(res, {}, 'AI agent deleted');
  } catch (err) { next(err); }
});

module.exports = router;
