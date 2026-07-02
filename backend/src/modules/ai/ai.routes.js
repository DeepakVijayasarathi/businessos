const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created, error, notFound } = require('../../utils/response');
const { decrypt, generateNumber } = require('../../utils/helpers');
const config = require('../../config');
const logger = require('../../config/logger');
const { generateImage } = require('../../services/ai.service');

// Stricter rate limit for the agentic AI endpoint — each call may make multiple
// upstream API calls, so we cap tighter than the global 500/15min limit.
const agentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30,
  keyGenerator: (req) => req.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many AI agent requests. Please wait a few minutes and try again.' },
});

const uploadDir = process.env.UPLOAD_PATH || path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

router.use(authenticate, sameCompany);

// ─── Token pricing table (per 1M tokens, USD) ────────────────────────────────
const MODEL_PRICING = {
  'gpt-4o':                  { input: 2.50,  output: 10.00 },
  'gpt-4o-mini':             { input: 0.15,  output: 0.60  },
  'gpt-4-turbo':             { input: 10.00, output: 30.00 },
  'gpt-4':                   { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo':           { input: 0.50,  output: 1.50  },
  'claude-sonnet-4-6':       { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-opus-4-8':         { input: 15.00, output: 75.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-3-5-haiku-20241022':  { input: 0.80, output: 4.00 },
  'claude-3-opus-20240229':     { input: 15.00, output: 75.00 },
};

function calcCost(model, inputTokens, outputTokens) {
  const p = MODEL_PRICING[model] || { input: 3.00, output: 15.00 };
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

async function logUsage(companyId, provider, model, module, inputTokens, outputTokens) {
  try {
    await prisma.aiUsageLog.create({
      data: {
        companyId, provider, model, module,
        inputTokens: inputTokens || 0,
        outputTokens: outputTokens || 0,
        costUsd: calcCost(model, inputTokens || 0, outputTokens || 0),
      },
    });
  } catch (e) {
    logger.warn('Failed to log AI usage:', e.message);
  }
}

// Unified AI call — routes to Claude or OpenAI
// companyAnthropicKey / companyOpenaiKey are the *encrypted* DB values; we decrypt them here
// Pass logCtx: { companyId, module } to auto-log usage after the call
async function callAI({ messages, system, companyAnthropicKey, companyOpenaiKey, companyProvider, maxTokens, logCtx }) {
  const provider = companyProvider || config.ai.provider;
  const tokens = maxTokens || config.ai.maxTokens;

  let result;

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
    result = { text, model: config.ai.openaiModel, provider: 'openai', usage: { input: response.usage.prompt_tokens, output: response.usage.completion_tokens } };
  } else {
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
    result = { text, model: config.ai.claudeModel, provider: 'claude', usage: { input: response.usage.input_tokens, output: response.usage.output_tokens } };
  }

  if (logCtx?.companyId) {
    logUsage(logCtx.companyId, result.provider, result.model, logCtx.module || 'ai', result.usage.input, result.usage.output);
  }

  return result;
}

// POST /ai/chat — General AI chat
router.post('/chat', async (req, res, next) => {
  try {
    const { message, sessionId, type = 'support', agentId, history = [] } = req.body;

    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true },
    });
    if (!company) return error(res, 'Company not found', 404);

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
      logCtx: { companyId: req.companyId, module: 'chat' },
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

// POST /ai/extract — parse raw text and extract structured form fields
router.post('/extract', async (req, res, next) => {
  try {
    const { text, type } = req.body;
    if (!text || !type) return error(res, 'text and type are required', 400);

    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { anthropicKey: true, openaiKey: true, aiProvider: true },
    });

    const schemas = {
      lead: `{ "firstName": "", "lastName": "", "email": "", "phone": "", "company": "", "jobTitle": "", "source": "website|referral|social|email|phone|whatsapp|event|other", "notes": "" }`,
      contact: `{ "firstName": "", "lastName": "", "email": "", "phone": "", "jobTitle": "", "notes": "" }`,
      deal: `{ "name": "", "value": 0, "probability": 50, "notes": "" }`,
      ticket: `{ "subject": "", "description": "", "priority": "low|medium|high|urgent" }`,
      invoice: `{ "clientName": "", "clientEmail": "", "items": [{ "description": "", "qty": 1, "rate": 0 }], "notes": "" }`,
      employee: `{ "jobTitle": "", "salary": 0, "jobType": "full_time|part_time|contract|intern" }`,
      task: `{ "title": "", "description": "", "priority": "low|medium|high|urgent" }`,
      contract: `{ "title": "", "partyName": "", "partyEmail": "", "value": 0, "type": "client|vendor|nda|employment|other", "description": "" }`,
      purchase_order: `{ "vendorName": "", "vendorEmail": "", "notes": "", "items": [{ "description": "", "qty": 1, "unitPrice": 0 }] }`,
    };

    const schema = schemas[type];
    if (!schema) return error(res, `Unknown type "${type}"`, 400);

    const prompt = `Extract structured data from the following text and return ONLY a valid JSON object matching this schema. Use null for missing fields, never invent data.

Schema: ${schema}

Text:
${text}

Return only the JSON object, no explanation.`;

    const aiResult = await callAI({
      messages: [{ role: 'user', content: prompt }],
      companyAnthropicKey: company?.anthropicKey,
      companyOpenaiKey: company?.openaiKey,
      companyProvider: company?.aiProvider,
      maxTokens: 1024,
      system: 'You are a data extraction assistant. Extract structured information from text and return valid JSON only.',
    });

    let extracted;
    try {
      const jsonMatch = aiResult.text.match(/\{[\s\S]*\}/);
      extracted = JSON.parse(jsonMatch ? jsonMatch[0] : aiResult.text);
    } catch {
      return error(res, 'AI could not parse the text into structured data', 422);
    }

    // Strip null/empty values so the frontend can merge cleanly
    Object.keys(extracted).forEach(k => {
      if (extracted[k] === null || extracted[k] === '') delete extracted[k];
    });

    return success(res, extracted);
  } catch (err) { next(err); }
});

// GET /ai/status — current provider & model info (includes per-company override)
router.get('/status', async (req, res, next) => {
  try {
    const company = req.companyId ? await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { anthropicKey: true, openaiKey: true, aiProvider: true },
    }) : null;
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

// ─── AI Agent: agentic tool-use endpoint ───────────────────────────────────

const AGENT_TOOLS = [
  {
    name: 'create_lead',
    description: 'Create a new CRM lead',
    input_schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        company: { type: 'string' },
        source: { type: 'string', enum: ['website', 'referral', 'linkedin', 'email', 'phone', 'whatsapp', 'event', 'other'] },
        status: { type: 'string', enum: ['new', 'contacted', 'qualified', 'unqualified', 'converted'] },
        notes: { type: 'string' },
      },
      required: ['firstName'],
    },
  },
  {
    name: 'list_leads',
    description: 'List CRM leads with optional filters',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status: new, contacted, qualified, unqualified, converted' },
        search: { type: 'string', description: 'Search by name, email, or company' },
        limit: { type: 'number', description: 'Max results (default 5, max 20)' },
      },
    },
  },
  {
    name: 'create_contact',
    description: 'Create a new CRM contact',
    input_schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        company: { type: 'string' },
        jobTitle: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['firstName'],
    },
  },
  {
    name: 'create_deal',
    description: 'Create a new deal in the CRM sales pipeline',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Deal title or name' },
        value: { type: 'number', description: 'Estimated deal value in USD' },
        probability: { type: 'number', description: 'Win probability 0-100' },
        notes: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        dueDate: { type: 'string', description: 'ISO date string YYYY-MM-DD' },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_invoice',
    description: 'Create a new invoice',
    input_schema: {
      type: 'object',
      properties: {
        clientName: { type: 'string' },
        clientEmail: { type: 'string' },
        amount: { type: 'number', description: 'Total invoice amount in USD' },
        dueDate: { type: 'string', description: 'Due date YYYY-MM-DD' },
        notes: { type: 'string' },
        description: { type: 'string', description: 'Line item description (defaults to "Services")' },
      },
      required: ['clientName', 'amount'],
    },
  },
  {
    name: 'list_invoices',
    description: 'List invoices with optional status filter',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'] },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
    },
  },
  {
    name: 'create_ticket',
    description: 'Create a new helpdesk support ticket',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      },
      required: ['subject'],
    },
  },
  {
    name: 'list_tickets',
    description: 'List helpdesk tickets',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'in_progress', 'pending', 'resolved', 'closed'] },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
    },
  },
  {
    name: 'get_stats',
    description: 'Get key business dashboard statistics and KPIs',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'create_campaign',
    description: 'Create a new marketing campaign',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string', enum: ['google_ads', 'meta_ads', 'seo', 'content', 'email', 'influencer', 'whatsapp', 'event', 'other'] },
        channel: { type: 'string', description: 'Platform or channel name' },
        budget: { type: 'number', description: 'Budget in USD' },
        description: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_deals',
    description: 'List deals in the CRM pipeline with optional status filter',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'won', 'lost', 'negotiation'], description: 'Filter by deal status' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
    },
  },
  {
    name: 'list_contacts',
    description: 'List CRM contacts with optional search by name, email, or company',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search term (name, email, or company)' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
    },
  },
  {
    name: 'search',
    description: 'Search across CRM leads, contacts, and deals',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        type: { type: 'string', enum: ['leads', 'contacts', 'deals', 'all'], description: 'What to search (default: all)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'send_payment_reminder',
    description: 'Send payment reminder email(s) for overdue or unpaid invoices. Can target a specific client or all overdue clients.',
    input_schema: {
      type: 'object',
      properties: {
        clientName: { type: 'string', description: 'Filter by client name (optional — omit to send to all overdue clients with email)' },
        invoiceNo: { type: 'string', description: 'Target a specific invoice number (optional)' },
      },
    },
  },
  {
    name: 'send_invoice',
    description: 'Send an invoice to the client via email and mark it as sent',
    input_schema: {
      type: 'object',
      properties: {
        invoiceNo: { type: 'string', description: 'Invoice number (e.g. INV-00001)' },
        clientName: { type: 'string', description: 'Client name to find the invoice if invoice number is unknown' },
      },
    },
  },
  {
    name: 'convert_lead',
    description: 'Convert a CRM lead into a contact and automatically create a deal in the pipeline',
    input_schema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'Lead ID to convert' },
        leadName: { type: 'string', description: 'Lead first name (to search if leadId is unknown)' },
        dealValue: { type: 'number', description: 'Optional deal value for the created deal' },
      },
    },
  },
  {
    name: 'update_deal',
    description: 'Update a deal — change its stage, value, or mark it as won/lost',
    input_schema: {
      type: 'object',
      properties: {
        dealTitle: { type: 'string', description: 'Deal title to find and update' },
        stageName: { type: 'string', description: 'New stage name to move the deal to' },
        value: { type: 'number', description: 'New deal value' },
        status: { type: 'string', enum: ['open', 'won', 'lost'], description: 'Update win/loss status' },
        notes: { type: 'string', description: 'Add or update notes' },
      },
      required: ['dealTitle'],
    },
  },
  {
    name: 'get_revenue_report',
    description: 'Get a monthly revenue breakdown for the last N months',
    input_schema: {
      type: 'object',
      properties: {
        months: { type: 'number', description: 'Number of months to include (default 6, max 12)' },
      },
    },
  },
  {
    name: 'list_employees',
    description: 'List HR employees with their job titles and status',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'inactive', 'terminated', 'on_leave'], description: 'Filter by status (default: active)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
    },
  },
  {
    name: 'generate_image',
    description: 'Generate an AI image using DALL-E 3 (OpenAI). Use for banners, product images, marketing visuals, social media graphics, or any visual content.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the image to generate' },
        size: { type: 'string', enum: ['1024x1024', '1024x1792', '1792x1024'], description: 'Image dimensions — square (default), portrait, or landscape' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'bulk_update_leads',
    description: 'Bulk update status for multiple leads at once — e.g. mark all new leads as contacted, or archive all unqualified leads',
    input_schema: {
      type: 'object',
      properties: {
        fromStatus: { type: 'string', enum: ['new', 'contacted', 'qualified', 'unqualified'], description: 'Only update leads with this current status' },
        toStatus: { type: 'string', enum: ['new', 'contacted', 'qualified', 'unqualified', 'converted'], description: 'New status to set' },
        search: { type: 'string', description: 'Optional: only update leads matching this search term (name or company)' },
        limit: { type: 'number', description: 'Max leads to update (default 100)' },
      },
      required: ['toStatus'],
    },
  },
  {
    name: 'mark_invoice_paid',
    description: 'Mark one or more invoices as paid',
    input_schema: {
      type: 'object',
      properties: {
        invoiceNo: { type: 'string', description: 'Specific invoice number to mark paid' },
        clientName: { type: 'string', description: 'Mark all unpaid invoices for this client as paid' },
        all_overdue: { type: 'boolean', description: 'If true, mark ALL overdue invoices as paid' },
      },
    },
  },
  {
    name: 'get_overdue_summary',
    description: 'Get a summary of everything overdue across all modules: invoices, support tickets, and tasks',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_pipeline_summary',
    description: 'Get a breakdown of deals by pipeline stage with counts and total values',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'create_followup',
    description: 'Schedule a follow-up task linked to a lead, deal, or contact',
    input_schema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'What the follow-up is about' },
        dueDate: { type: 'string', description: 'Due date YYYY-MM-DD (default: tomorrow)' },
        leadName: { type: 'string', description: 'Lead name to link the follow-up to' },
        dealTitle: { type: 'string', description: 'Deal title to link the follow-up to' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Priority (default: medium)' },
      },
      required: ['note'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List tasks with optional filters',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'done', 'cancelled'] },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
    },
  },
  {
    name: 'resolve_ticket',
    description: 'Resolve or close a support ticket',
    input_schema: {
      type: 'object',
      properties: {
        ticketNo: { type: 'string', description: 'Ticket number e.g. TKT-00001' },
        subject: { type: 'string', description: 'Ticket subject to find and resolve (if ticketNo unknown)' },
        status: { type: 'string', enum: ['resolved', 'closed'], description: 'New status (default: resolved)' },
      },
    },
  },
  {
    name: 'add_note',
    description: 'Add a note or activity log entry to a lead, contact, or deal',
    input_schema: {
      type: 'object',
      properties: {
        note: { type: 'string', description: 'Note content' },
        type: { type: 'string', enum: ['note', 'call', 'email', 'meeting', 'whatsapp'], description: 'Activity type (default: note)' },
        leadName: { type: 'string', description: 'Lead name to attach note to' },
        dealTitle: { type: 'string', description: 'Deal title to attach note to' },
        contactName: { type: 'string', description: 'Contact name to attach note to' },
      },
      required: ['note'],
    },
  },
  {
    name: 'create_project',
    description: 'Create a new project with optional budget and deadline',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        status: { type: 'string', enum: ['planning', 'active', 'on_hold'], description: 'Initial status (default: planning)' },
        budget: { type: 'number', description: 'Project budget in USD' },
        startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
        endDate: { type: 'string', description: 'End/deadline date YYYY-MM-DD' },
      },
      required: ['name'],
    },
  },
  {
    name: 'list_projects',
    description: 'List projects with optional status filter',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['planning', 'active', 'on_hold', 'completed', 'cancelled'] },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
    },
  },
  {
    name: 'create_contract',
    description: 'Create a new contract for a client, vendor, or employee',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Contract title' },
        type: { type: 'string', enum: ['client', 'vendor', 'employment', 'nda', 'partnership'], description: 'Contract type' },
        partyName: { type: 'string', description: 'Name of the other party' },
        partyEmail: { type: 'string', description: 'Email of the other party' },
        value: { type: 'number', description: 'Contract value in USD' },
        startDate: { type: 'string', description: 'Start date YYYY-MM-DD' },
        endDate: { type: 'string', description: 'End date YYYY-MM-DD' },
        description: { type: 'string', description: 'Contract description or terms summary' },
      },
      required: ['title', 'partyName'],
    },
  },
  {
    name: 'list_contracts',
    description: 'List contracts with optional status or type filter',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'sent', 'signed', 'active', 'expired', 'terminated'] },
        type: { type: 'string', enum: ['client', 'vendor', 'employment', 'nda', 'partnership'] },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
    },
  },
  {
    name: 'create_purchase_order',
    description: 'Create a purchase order (PO) for a vendor',
    input_schema: {
      type: 'object',
      properties: {
        vendorName: { type: 'string', description: 'Vendor / supplier name' },
        vendorEmail: { type: 'string' },
        items: {
          type: 'array',
          description: 'Line items',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              qty: { type: 'number' },
              unitPrice: { type: 'number' },
            },
          },
        },
        notes: { type: 'string' },
        expectedDate: { type: 'string', description: 'Expected delivery date YYYY-MM-DD' },
      },
      required: ['vendorName', 'items'],
    },
  },
  {
    name: 'list_leaves',
    description: 'List employee leave requests, optionally filtered by status',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'approved', 'rejected'], description: 'Filter by status (default: pending)' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
    },
  },
  {
    name: 'approve_leave',
    description: 'Approve or reject an employee leave request',
    input_schema: {
      type: 'object',
      properties: {
        leaveId: { type: 'string', description: 'Leave request ID' },
        employeeName: { type: 'string', description: 'Employee name to find their pending leave if ID is unknown' },
        action: { type: 'string', enum: ['approve', 'reject'], description: 'Action to take' },
        comments: { type: 'string', description: 'Optional comments / reason' },
      },
      required: ['action'],
    },
  },
  {
    name: 'create_expense',
    description: 'Log a business expense',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Expense title / description' },
        category: { type: 'string', description: 'Category e.g. travel, meals, software, office, marketing' },
        amount: { type: 'number', description: 'Amount in USD' },
        date: { type: 'string', description: 'Expense date YYYY-MM-DD (default: today)' },
        isReimbursable: { type: 'boolean', description: 'Whether to reimburse the employee' },
        description: { type: 'string' },
      },
      required: ['title', 'category', 'amount'],
    },
  },
  {
    name: 'schedule_appointment',
    description: 'Schedule a meeting, call, or appointment with a contact or client',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Appointment title' },
        startAt: { type: 'string', description: 'Start datetime ISO string e.g. 2024-06-25T10:00:00' },
        endAt: { type: 'string', description: 'End datetime ISO string' },
        location: { type: 'string', description: 'Physical location or meeting room' },
        meetingUrl: { type: 'string', description: 'Video call link (Zoom, Meet, Teams)' },
        notes: { type: 'string' },
        contactName: { type: 'string', description: 'Contact name to link appointment to' },
      },
      required: ['title', 'startAt'],
    },
  },
  {
    name: 'daily_digest',
    description: 'Get a complete morning briefing — overdue items, today\'s tasks, pipeline health, pending approvals, and revenue snapshot. Use this when the user asks "what needs my attention", "morning summary", or "what\'s happening today".',
    input_schema: { type: 'object', properties: {} },
  },
  // ── AI-powered tools ──────────────────────────────────────────────────────
  {
    name: 'draft_email',
    description: 'AI drafts a personalized email to a lead or contact, then optionally sends it. Use for follow-ups, introductions, proposals, or any outreach.',
    input_schema: {
      type: 'object',
      properties: {
        recipientName: { type: 'string', description: 'Name of the lead or contact to email' },
        purpose: { type: 'string', description: 'Purpose of the email (e.g. follow-up, introduction, proposal, meeting request)' },
        tone: { type: 'string', enum: ['professional', 'friendly', 'urgent', 'formal'], description: 'Email tone (default: professional)' },
        keyPoints: { type: 'string', description: 'Key points or context to include' },
        send: { type: 'boolean', description: 'If true, send the email immediately after drafting' },
      },
      required: ['recipientName', 'purpose'],
    },
  },
  {
    name: 'score_leads',
    description: 'AI scores and ranks leads based on their profile, company, job title, source, and activity level. Updates scores in the CRM.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['new', 'contacted', 'qualified'], description: 'Which leads to score (default: new)' },
        limit: { type: 'number', description: 'Max leads to score (default 10, max 20)' },
      },
    },
  },
  {
    name: 'bulk_qualify_leads',
    description: 'AI analyzes all new leads and automatically qualifies or disqualifies them, updating their status and score in CRM.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max leads to process (default 20)' },
      },
    },
  },
  {
    name: 'send_bulk_email',
    description: 'AI drafts and sends personalized emails to a targeted list — new leads, all contacts, or overdue clients.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['new_leads', 'qualified_leads', 'all_leads', 'contacts', 'overdue_clients'], description: 'Who to email' },
        purpose: { type: 'string', description: 'Email purpose / campaign goal' },
        tone: { type: 'string', enum: ['professional', 'friendly', 'urgent'], description: 'Tone (default: professional)' },
        limit: { type: 'number', description: 'Max recipients (default 15, max 30)' },
      },
      required: ['target', 'purpose'],
    },
  },
  {
    name: 'forecast_revenue',
    description: 'AI forecasts next month revenue using historical data, pipeline value, deal probabilities, and growth trends.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'analyze_pipeline',
    description: 'AI analyzes the sales pipeline to identify at-risk deals, stale opportunities, and quick wins with specific action recommendations.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'create_social_post',
    description: 'AI creates engaging social media post content for LinkedIn, Twitter/X, or Instagram.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic, product, or service to promote' },
        platform: { type: 'string', enum: ['linkedin', 'twitter', 'instagram', 'general'], description: 'Target platform (default: linkedin)' },
        tone: { type: 'string', enum: ['professional', 'casual', 'inspiring', 'promotional'], description: 'Post tone (default: professional)' },
        includeHashtags: { type: 'boolean', description: 'Include relevant hashtags (default: true)' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'reply_to_ticket',
    description: 'AI drafts a professional reply to a support ticket. Analyzes the issue and writes an empathetic, solution-focused response.',
    input_schema: {
      type: 'object',
      properties: {
        ticketNo: { type: 'string', description: 'Ticket number (e.g. TKT-00001)' },
        subject: { type: 'string', description: 'Ticket subject to find it (if ticketNo unknown)' },
        tone: { type: 'string', enum: ['professional', 'empathetic', 'technical'], description: 'Reply tone (default: professional)' },
      },
    },
  },
  {
    name: 'generate_report',
    description: 'AI generates a comprehensive business health report with insights, trends, risk factors, and action recommendations.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['weekly', 'monthly', 'quarterly'], description: 'Report period (default: monthly)' },
      },
    },
  },
];

async function executeAgentTool(name, input, req) {
  const cid = req.companyId;
  const uid = req.userId;

  switch (name) {
    case 'create_lead': {
      const lead = await prisma.lead.create({
        data: { ...input, companyId: cid, status: input.status || 'new', source: input.source || 'other' },
      });
      return { success: true, id: lead.id, message: `Lead created: ${lead.firstName} ${lead.lastName || ''}`.trim() };
    }
    case 'list_leads': {
      const mode = 'insensitive';
      const leads = await prisma.lead.findMany({
        where: {
          companyId: cid,
          ...(input.status && { status: input.status }),
          ...(input.search && { OR: [
            { firstName: { contains: input.search, mode } },
            { lastName: { contains: input.search, mode } },
            { email: { contains: input.search, mode } },
            { company: { contains: input.search, mode } },
          ] }),
        },
        take: Math.min(input.limit || 5, 20),
        orderBy: { createdAt: 'desc' },
        select: { id: true, firstName: true, lastName: true, email: true, company: true, status: true, createdAt: true },
      });
      return { leads, count: leads.length };
    }
    case 'list_deals': {
      const deals = await prisma.deal.findMany({
        where: { companyId: cid, ...(input.status && { status: input.status }) },
        take: input.limit || 5,
        orderBy: { value: 'desc' },
        select: { id: true, title: true, value: true, status: true, stage: { select: { name: true } } },
      });
      return { deals: deals.map(d => ({ ...d, value: d.value ? Number(d.value) : null })), count: deals.length };
    }
    case 'list_contacts': {
      const mode = 'insensitive';
      const contacts = await prisma.contact.findMany({
        where: {
          companyId: cid,
          ...(input.search && { OR: [
            { firstName: { contains: input.search, mode } },
            { lastName: { contains: input.search, mode } },
            { email: { contains: input.search, mode } },
            { company: { contains: input.search, mode } },
          ] }),
        },
        take: input.limit || 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, company: true, jobTitle: true },
      });
      return { contacts, count: contacts.length };
    }
    case 'create_contact': {
      const contact = await prisma.contact.create({
        data: { ...input, companyId: cid },
      });
      return { success: true, id: contact.id, message: `Contact created: ${contact.firstName} ${contact.lastName || ''}`.trim() };
    }
    case 'create_deal': {
      const pipeline = await prisma.pipeline.findFirst({
        where: { companyId: cid },
        include: { stages: { orderBy: { order: 'asc' }, take: 1 } },
      });
      if (!pipeline?.stages?.length) return { error: 'No pipeline found. Set up your CRM pipeline in Settings first.' };
      const deal = await prisma.deal.create({
        data: {
          title: input.title,
          value: input.value || null,
          probability: input.probability || 50,
          notes: input.notes || null,
          pipelineId: pipeline.id,
          stageId: pipeline.stages[0].id,
          companyId: cid,
          status: 'open',
        },
      });
      return { success: true, id: deal.id, message: `Deal created: ${deal.title}` };
    }
    case 'create_task': {
      const task = await prisma.task.create({
        data: {
          title: input.title,
          description: input.description || null,
          priority: input.priority || 'medium',
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          status: 'todo',
          companyId: cid,
          assigneeId: uid,
          creatorId: uid,
        },
      });
      return { success: true, id: task.id, message: `Task created: ${task.title}` };
    }
    case 'create_invoice': {
      const count = await prisma.invoice.count({ where: { companyId: cid } });
      const invoiceNo = generateNumber('INV', count + 1);
      const amt = Number(input.amount);
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNo,
          clientName: input.clientName,
          clientEmail: input.clientEmail || null,
          subtotal: amt,
          taxAmount: 0,
          discountAmount: 0,
          total: amt,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          notes: input.notes || null,
          status: 'draft',
          companyId: cid,
          items: [{ description: input.description || 'Services', qty: 1, rate: amt, amount: amt }],
        },
      });
      return { success: true, id: invoice.id, invoiceNo, message: `Invoice ${invoiceNo} created for ${input.clientName} — $${amt}` };
    }
    case 'list_invoices': {
      const invoices = await prisma.invoice.findMany({
        where: { companyId: cid, ...(input.status && { status: input.status }) },
        take: input.limit || 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, invoiceNo: true, clientName: true, total: true, status: true, dueDate: true },
      });
      return { invoices: invoices.map(i => ({ ...i, total: Number(i.total) })), count: invoices.length };
    }
    case 'create_ticket': {
      const count = await prisma.ticket.count({ where: { companyId: cid } });
      const ticketNo = generateNumber('TKT', count + 1);
      const ticket = await prisma.ticket.create({
        data: {
          ticketNo,
          subject: input.subject,
          description: input.description || null,
          priority: input.priority || 'medium',
          status: 'open',
          companyId: cid,
          reporterId: uid,
        },
      });
      return { success: true, id: ticket.id, ticketNo, message: `Ticket ${ticketNo} created: ${ticket.subject}` };
    }
    case 'list_tickets': {
      const tickets = await prisma.ticket.findMany({
        where: {
          companyId: cid,
          ...(input.status && { status: input.status }),
          ...(input.priority && { priority: input.priority }),
        },
        take: input.limit || 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, ticketNo: true, subject: true, status: true, priority: true, createdAt: true },
      });
      return { tickets, count: tickets.length };
    }
    case 'get_stats': {
      const now = new Date();
      const [totalLeads, newLeads, openDeals, paidInv, openTickets, overdueInv] = await Promise.all([
        prisma.lead.count({ where: { companyId: cid } }),
        prisma.lead.count({ where: { companyId: cid, status: 'new' } }),
        prisma.deal.count({ where: { companyId: cid, status: { in: ['open', 'negotiation'] } } }),
        prisma.invoice.aggregate({ where: { companyId: cid, status: 'paid' }, _sum: { total: true } }),
        prisma.ticket.count({ where: { companyId: cid, status: { in: ['open', 'pending'] } } }),
        prisma.invoice.count({ where: { companyId: cid, status: { in: ['sent', 'overdue'] }, dueDate: { lt: now } } }),
      ]);
      return {
        totalLeads,
        newLeads,
        openDeals,
        totalRevenue: Number(paidInv._sum.total || 0),
        openTickets,
        overdueInvoices: overdueInv,
      };
    }
    case 'create_campaign': {
      const campaign = await prisma.campaign.create({
        data: {
          name: input.name,
          type: input.type || 'other',
          channel: input.channel || null,
          budget: input.budget || null,
          description: input.description || null,
          status: 'draft',
          companyId: cid,
        },
      });
      return { success: true, id: campaign.id, message: `Campaign created: ${campaign.name}` };
    }
    case 'search': {
      const q = input.query;
      const mode = 'insensitive';
      const all = !input.type || input.type === 'all';
      const [leads, contacts, deals] = await Promise.all([
        all || input.type === 'leads'
          ? prisma.lead.findMany({ where: { companyId: cid, OR: [{ firstName: { contains: q, mode } }, { lastName: { contains: q, mode } }, { email: { contains: q, mode } }, { company: { contains: q, mode } }] }, take: 4, select: { id: true, firstName: true, lastName: true, email: true, status: true } })
          : Promise.resolve([]),
        all || input.type === 'contacts'
          ? prisma.contact.findMany({ where: { companyId: cid, OR: [{ firstName: { contains: q, mode } }, { lastName: { contains: q, mode } }, { email: { contains: q, mode } }] }, take: 4, select: { id: true, firstName: true, lastName: true, email: true } })
          : Promise.resolve([]),
        all || input.type === 'deals'
          ? prisma.deal.findMany({ where: { companyId: cid, title: { contains: q, mode } }, take: 4, select: { id: true, title: true, value: true, status: true } })
          : Promise.resolve([]),
      ]);
      return { leads, contacts, deals: deals.map(d => ({ ...d, value: d.value ? Number(d.value) : null })) };
    }
    case 'send_payment_reminder': {
      const emailService = require('../../services/email.service');
      const company = await prisma.company.findUnique({ where: { id: cid }, select: { name: true, smtpHost: true } });
      const now = new Date();
      const where = {
        companyId: cid,
        status: { in: ['sent', 'overdue'] },
        dueDate: { lt: now },
        clientEmail: { not: null },
        ...(input.clientName && { clientName: { contains: input.clientName, mode: 'insensitive' } }),
        ...(input.invoiceNo && { invoiceNo: input.invoiceNo }),
      };
      const invoices = await prisma.invoice.findMany({
        where,
        select: { id: true, invoiceNo: true, clientName: true, clientEmail: true, total: true, dueDate: true },
        take: 20,
      });
      if (!invoices.length) return { message: 'No overdue invoices with email addresses found.' };
      let sent = 0;
      const results = [];
      for (const inv of invoices) {
        try {
          await emailService.send({
            to: inv.clientEmail,
            subject: `Payment Reminder: Invoice ${inv.invoiceNo} is overdue`,
            html: `<h2>Payment Reminder</h2><p>Dear ${inv.clientName},</p><p>This is a friendly reminder that invoice <strong>${inv.invoiceNo}</strong> for <strong>$${Number(inv.total).toFixed(2)}</strong> was due on <strong>${new Date(inv.dueDate).toLocaleDateString()}</strong> and remains unpaid.</p><p>Please arrange payment at your earliest convenience.</p><p>Thank you,<br>${company?.name || 'The Team'}</p>`,
            companyId: cid,
          });
          await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'overdue' } });
          sent++;
          results.push({ invoiceNo: inv.invoiceNo, client: inv.clientName, email: inv.clientEmail });
        } catch {}
      }
      return { sent, total: invoices.length, results, message: `Payment reminder sent to ${sent} client(s)` };
    }
    case 'send_invoice': {
      const emailService = require('../../services/email.service');
      const mode = 'insensitive';
      const inv = await prisma.invoice.findFirst({
        where: {
          companyId: cid,
          ...(input.invoiceNo ? { invoiceNo: input.invoiceNo } : { clientName: { contains: input.clientName || '', mode } }),
        },
        select: { id: true, invoiceNo: true, clientName: true, clientEmail: true, total: true, status: true },
      });
      if (!inv) return { error: 'Invoice not found.' };
      if (!inv.clientEmail) return { error: `Invoice ${inv.invoiceNo} has no client email on file.` };
      await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'sent' } });
      try {
        await emailService.sendInvoice({ to: inv.clientEmail, invoiceNo: inv.invoiceNo, companyId: cid });
      } catch {}
      return { success: true, message: `Invoice ${inv.invoiceNo} sent to ${inv.clientEmail}` };
    }
    case 'convert_lead': {
      const mode = 'insensitive';
      const lead = input.leadId
        ? await prisma.lead.findFirst({ where: { id: input.leadId, companyId: cid } })
        : await prisma.lead.findFirst({ where: { companyId: cid, firstName: { contains: input.leadName || '', mode } } });
      if (!lead) return { error: 'Lead not found.' };
      if (lead.status === 'converted') return { error: `${lead.firstName} ${lead.lastName || ''} is already converted.` };
      const contact = await prisma.contact.create({
        data: { firstName: lead.firstName, lastName: lead.lastName || null, email: lead.email || null, phone: lead.phone || null, company: lead.company || null, jobTitle: lead.jobTitle || null, notes: lead.notes || null, companyId: cid },
      });
      const pipeline = await prisma.pipeline.findFirst({ where: { companyId: cid }, include: { stages: { orderBy: { order: 'asc' }, take: 1 } } });
      let deal = null;
      if (pipeline?.stages?.length) {
        deal = await prisma.deal.create({
          data: { title: `${lead.firstName} ${lead.lastName || ''} — ${lead.company || 'Deal'}`.trim(), value: input.dealValue || null, probability: 50, pipelineId: pipeline.id, stageId: pipeline.stages[0].id, companyId: cid, status: 'open', notes: lead.notes || null },
        });
      }
      await prisma.lead.update({ where: { id: lead.id }, data: { status: 'converted' } });
      return { success: true, contact: { id: contact.id, name: `${contact.firstName} ${contact.lastName || ''}`.trim() }, deal: deal ? { id: deal.id, title: deal.title } : null, message: `Lead converted: contact created${deal ? ` and deal "${deal.title}" added to pipeline` : ''}` };
    }
    case 'update_deal': {
      const mode = 'insensitive';
      const deal = await prisma.deal.findFirst({ where: { companyId: cid, title: { contains: input.dealTitle, mode } } });
      if (!deal) return { error: `Deal matching "${input.dealTitle}" not found.` };
      const updateData = {};
      if (input.value !== undefined) updateData.value = input.value;
      if (input.status) updateData.status = input.status;
      if (input.notes) updateData.notes = input.notes;
      if (input.stageName) {
        const stage = await prisma.pipelineStage.findFirst({ where: { pipelineId: deal.pipelineId, name: { contains: input.stageName, mode } } });
        if (!stage) return { error: `Stage "${input.stageName}" not found in this pipeline.` };
        updateData.stageId = stage.id;
      }
      const updated = await prisma.deal.update({ where: { id: deal.id }, data: updateData });
      const changes = Object.keys(updateData).map(k => k === 'stageId' ? `stage → ${input.stageName}` : `${k} → ${updateData[k]}`);
      return { success: true, id: updated.id, message: `Deal "${deal.title}" updated: ${changes.join(', ')}` };
    }
    case 'get_revenue_report': {
      const numMonths = Math.min(input.months || 6, 12);
      const months = [];
      for (let i = numMonths - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() - i);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const agg = await prisma.invoice.aggregate({ where: { companyId: cid, status: 'paid', paidAt: { gte: start, lt: end } }, _sum: { total: true }, _count: true });
        months.push({ month: start.toLocaleString('default', { month: 'short', year: 'numeric' }), revenue: Number(agg._sum.total || 0), invoices: agg._count });
      }
      const total = months.reduce((s, m) => s + m.revenue, 0);
      return { months, total, message: `Revenue report for last ${numMonths} months — total: $${total.toFixed(2)}` };
    }
    case 'list_employees': {
      const employees = await prisma.employee.findMany({
        where: { companyId: cid, status: input.status || 'active' },
        take: input.limit || 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, employeeCode: true, jobTitle: true, jobType: true, status: true, startDate: true, user: { select: { firstName: true, lastName: true, email: true } } },
      });
      return { employees: employees.map(e => ({ id: e.id, code: e.employeeCode, name: `${e.user?.firstName || ''} ${e.user?.lastName || ''}`.trim(), email: e.user?.email, jobTitle: e.jobTitle, jobType: e.jobType, status: e.status })), count: employees.length };
    }
    case 'generate_image': {
      const company = await prisma.company.findUnique({ where: { id: cid }, select: { openaiKey: true } });
      const { url: remoteUrl } = await generateImage({
        prompt: input.prompt,
        companyOpenaiKey: company?.openaiKey,
        size: ['1024x1024', '1024x1792', '1792x1024'].includes(input.size) ? input.size : '1024x1024',
      });
      const imgResponse = await axios.get(remoteUrl, { responseType: 'arraybuffer', timeout: 60000 });
      const filename = `${uuidv4()}.png`;
      fs.writeFileSync(path.join(uploadDir, filename), imgResponse.data);
      const imageUrl = `/uploads/${filename}`;
      return { success: true, imageUrl, message: 'Image generated successfully' };
    }
    case 'bulk_update_leads': {
      const mode = 'insensitive';
      const where = {
        companyId: cid,
        ...(input.fromStatus && { status: input.fromStatus }),
        ...(input.search && { OR: [{ firstName: { contains: input.search, mode } }, { lastName: { contains: input.search, mode } }, { company: { contains: input.search, mode } }] }),
      };
      const leads = await prisma.lead.findMany({ where, take: input.limit || 100, select: { id: true } });
      if (!leads.length) return { message: 'No leads matched the criteria.', updated: 0 };
      await prisma.lead.updateMany({ where: { id: { in: leads.map(l => l.id) } }, data: { status: input.toStatus } });
      return { success: true, updated: leads.length, message: `${leads.length} lead(s) updated to status: ${input.toStatus}` };
    }
    case 'mark_invoice_paid': {
      const now = new Date();
      let where = { companyId: cid, status: { in: ['sent', 'overdue', 'draft'] } };
      if (input.invoiceNo) where = { ...where, invoiceNo: input.invoiceNo };
      else if (input.clientName) where = { ...where, clientName: { contains: input.clientName, mode: 'insensitive' } };
      else if (!input.all_overdue) return { error: 'Specify invoiceNo, clientName, or set all_overdue: true.' };
      const invoices = await prisma.invoice.findMany({ where, select: { id: true, invoiceNo: true, clientName: true, total: true } });
      if (!invoices.length) return { message: 'No matching unpaid invoices found.' };
      await prisma.invoice.updateMany({ where: { id: { in: invoices.map(i => i.id) } }, data: { status: 'paid', paidAt: now } });
      return { success: true, marked: invoices.length, invoices: invoices.map(i => ({ invoiceNo: i.invoiceNo, client: i.clientName, amount: Number(i.total) })), message: `${invoices.length} invoice(s) marked as paid` };
    }
    case 'get_overdue_summary': {
      const now = new Date();
      const [overdueInvoices, openTickets, overdueTasks] = await Promise.all([
        prisma.invoice.findMany({ where: { companyId: cid, status: { in: ['sent', 'overdue'] }, dueDate: { lt: now } }, select: { invoiceNo: true, clientName: true, total: true, dueDate: true }, take: 10, orderBy: { dueDate: 'asc' } }),
        prisma.ticket.findMany({ where: { companyId: cid, status: { in: ['open', 'pending'] }, priority: 'urgent' }, select: { ticketNo: true, subject: true, createdAt: true }, take: 10 }),
        prisma.task.findMany({ where: { companyId: cid, status: { in: ['todo', 'in_progress'] }, dueDate: { lt: now } }, select: { title: true, priority: true, dueDate: true }, take: 10 }),
      ]);
      const totalOverdue = overdueInvoices.reduce((s, i) => s + Number(i.total), 0);
      return {
        overdueInvoices: overdueInvoices.map(i => ({ invoiceNo: i.invoiceNo, client: i.clientName, amount: Number(i.total), daysOverdue: Math.floor((now.getTime() - new Date(i.dueDate).getTime()) / 86400000) })),
        urgentTickets: openTickets.map(t => ({ ticketNo: t.ticketNo, subject: t.subject })),
        overdueTasks: overdueTasks.map(t => ({ title: t.title, priority: t.priority, daysOverdue: Math.floor((now.getTime() - new Date(t.dueDate).getTime()) / 86400000) })),
        totalOverdueAmount: totalOverdue,
        summary: { overdueInvoices: overdueInvoices.length, urgentTickets: openTickets.length, overdueTasks: overdueTasks.length },
      };
    }
    case 'get_pipeline_summary': {
      const pipeline = await prisma.pipeline.findFirst({
        where: { companyId: cid },
        include: { stages: { orderBy: { order: 'asc' }, include: { deals: { where: { status: 'open' }, select: { value: true } } } } },
      });
      if (!pipeline) return { error: 'No pipeline configured.' };
      const stages = pipeline.stages.map(s => ({
        name: s.name,
        deals: s.deals.length,
        value: s.deals.reduce((sum, d) => sum + Number(d.value || 0), 0),
      }));
      const totalDeals = stages.reduce((s, st) => s + st.deals, 0);
      const totalValue = stages.reduce((s, st) => s + st.value, 0);
      return { pipelineName: pipeline.name, stages, totalDeals, totalValue };
    }
    case 'create_followup': {
      const mode = 'insensitive';
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const dueDate = input.dueDate ? new Date(input.dueDate) : tomorrow;
      let leadId = null, dealId = null;
      if (input.leadName) {
        const lead = await prisma.lead.findFirst({ where: { companyId: cid, OR: [{ firstName: { contains: input.leadName, mode } }, { lastName: { contains: input.leadName, mode } }] }, select: { id: true } });
        leadId = lead?.id || null;
      }
      if (input.dealTitle) {
        const deal = await prisma.deal.findFirst({ where: { companyId: cid, title: { contains: input.dealTitle, mode } }, select: { id: true } });
        dealId = deal?.id || null;
      }
      const task = await prisma.task.create({
        data: { title: `Follow-up: ${input.note}`, description: input.note, priority: input.priority || 'medium', dueDate, status: 'todo', companyId: cid, assigneeId: uid, creatorId: uid, leadId, dealId },
      });
      if (leadId || dealId) {
        await prisma.activity.create({
          data: { companyId: cid, type: 'note', subject: `Follow-up scheduled`, description: input.note, userId: uid, leadId, dealId, scheduledAt: dueDate },
        });
      }
      return { success: true, id: task.id, message: `Follow-up task created for ${new Date(dueDate).toLocaleDateString()}${leadId ? ' (linked to lead)' : ''}${dealId ? ' (linked to deal)' : ''}` };
    }
    case 'list_tasks': {
      const tasks = await prisma.task.findMany({
        where: { companyId: cid, ...(input.status && { status: input.status }), ...(input.priority && { priority: input.priority }) },
        take: input.limit || 5,
        orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
        select: { id: true, title: true, status: true, priority: true, dueDate: true },
      });
      return { tasks, count: tasks.length };
    }
    case 'resolve_ticket': {
      const mode = 'insensitive';
      const ticket = await prisma.ticket.findFirst({
        where: { companyId: cid, ...(input.ticketNo ? { ticketNo: input.ticketNo } : { subject: { contains: input.subject || '', mode } }), status: { notIn: ['resolved', 'closed'] } },
        select: { id: true, ticketNo: true, subject: true },
      });
      if (!ticket) return { error: 'Ticket not found or already resolved.' };
      const newStatus = input.status || 'resolved';
      await prisma.ticket.update({ where: { id: ticket.id }, data: { status: newStatus, resolvedAt: new Date() } });
      return { success: true, ticketNo: ticket.ticketNo, message: `Ticket ${ticket.ticketNo} marked as ${newStatus}: "${ticket.subject}"` };
    }
    case 'add_note': {
      const mode = 'insensitive';
      let leadId = null, dealId = null, contactId = null;
      if (input.leadName) {
        const lead = await prisma.lead.findFirst({ where: { companyId: cid, OR: [{ firstName: { contains: input.leadName, mode } }, { lastName: { contains: input.leadName, mode } }] }, select: { id: true } });
        leadId = lead?.id || null;
      }
      if (input.dealTitle) {
        const deal = await prisma.deal.findFirst({ where: { companyId: cid, title: { contains: input.dealTitle, mode } }, select: { id: true } });
        dealId = deal?.id || null;
      }
      if (input.contactName) {
        const contact = await prisma.contact.findFirst({ where: { companyId: cid, OR: [{ firstName: { contains: input.contactName, mode } }, { lastName: { contains: input.contactName, mode } }] }, select: { id: true } });
        contactId = contact?.id || null;
      }
      if (!leadId && !dealId && !contactId) return { error: 'Could not find the specified lead, deal, or contact. Please check the name.' };
      const activity = await prisma.activity.create({
        data: { companyId: cid, type: input.type || 'note', subject: input.note.slice(0, 100), description: input.note, userId: uid, leadId, dealId, contactId, completedAt: new Date() },
      });
      return { success: true, id: activity.id, message: `Note added${leadId ? ' to lead' : ''}${dealId ? ' to deal' : ''}${contactId ? ' to contact' : ''}` };
    }
    case 'create_project': {
      const project = await prisma.project.create({
        data: {
          name: input.name,
          description: input.description || null,
          priority: input.priority || 'medium',
          status: input.status || 'planning',
          budget: input.budget ? Number(input.budget) : null,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          companyId: cid,
          managerId: uid,
        },
      });
      return { success: true, id: project.id, message: `Project created: "${project.name}" (${project.status})` };
    }
    case 'list_projects': {
      const projects = await prisma.project.findMany({
        where: { companyId: cid, ...(input.status && { status: input.status }) },
        take: input.limit || 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, status: true, priority: true, progress: true, endDate: true, budget: true },
      });
      return { projects: projects.map(p => ({ ...p, budget: p.budget ? Number(p.budget) : null })), count: projects.length };
    }
    case 'create_contract': {
      const count = await prisma.contract.count({ where: { companyId: cid } });
      const contractNo = generateNumber('CTR', count + 1);
      const contract = await prisma.contract.create({
        data: {
          contractNo,
          title: input.title,
          type: input.type || 'client',
          partyName: input.partyName,
          partyEmail: input.partyEmail || null,
          value: input.value ? Number(input.value) : null,
          startDate: input.startDate ? new Date(input.startDate) : null,
          endDate: input.endDate ? new Date(input.endDate) : null,
          description: input.description || null,
          status: 'draft',
          companyId: cid,
        },
      });
      return { success: true, id: contract.id, contractNo, message: `Contract ${contractNo} created: "${input.title}" with ${input.partyName}` };
    }
    case 'list_contracts': {
      const contracts = await prisma.contract.findMany({
        where: { companyId: cid, ...(input.status && { status: input.status }), ...(input.type && { type: input.type }) },
        take: input.limit || 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, contractNo: true, title: true, type: true, partyName: true, value: true, status: true, endDate: true },
      });
      return { contracts: contracts.map(c => ({ ...c, value: c.value ? Number(c.value) : null })), count: contracts.length };
    }
    case 'create_purchase_order': {
      const count = await prisma.purchaseOrder.count({ where: { companyId: cid } });
      const poNumber = generateNumber('PO', count + 1);
      const items = (input.items || []).map(i => ({ ...i, amount: Number(i.qty || 1) * Number(i.unitPrice || 0) }));
      const subtotal = items.reduce((s, i) => s + i.amount, 0);
      const po = await prisma.purchaseOrder.create({
        data: {
          poNumber,
          vendorName: input.vendorName,
          vendorEmail: input.vendorEmail || null,
          subtotal,
          tax: 0,
          total: subtotal,
          notes: input.notes || null,
          expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
          status: 'draft',
          companyId: cid,
          items: { create: items.map(i => ({ description: i.description, quantity: Number(i.qty || 1), unitPrice: Number(i.unitPrice || 0), total: i.amount })) },
        },
      });
      return { success: true, id: po.id, poNumber, message: `PO ${poNumber} created for ${input.vendorName} — total $${subtotal.toFixed(2)}` };
    }
    case 'list_leaves': {
      const leaves = await prisma.leaveRequest.findMany({
        where: { status: input.status || 'pending', employee: { companyId: cid } },
        take: input.limit || 10,
        orderBy: { createdAt: 'desc' },
        include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } }, leaveType: { select: { name: true } } },
      });
      return {
        leaves: leaves.map(l => ({
          id: l.id,
          employee: `${l.employee.user?.firstName || ''} ${l.employee.user?.lastName || ''}`.trim(),
          leaveType: l.leaveType?.name,
          startDate: l.startDate,
          endDate: l.endDate,
          totalDays: l.totalDays,
          status: l.status,
          reason: l.reason,
        })),
        count: leaves.length,
      };
    }
    case 'approve_leave': {
      let leave = input.leaveId
        ? await prisma.leaveRequest.findFirst({ where: { id: input.leaveId, status: 'pending' }, include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } } })
        : await prisma.leaveRequest.findFirst({
            where: { status: 'pending', employee: { companyId: cid, user: { OR: [{ firstName: { contains: input.employeeName || '', mode: 'insensitive' } }, { lastName: { contains: input.employeeName || '', mode: 'insensitive' } }] } } },
            include: { employee: { include: { user: { select: { firstName: true, lastName: true } } } } },
          });
      if (!leave) return { error: 'No pending leave request found.' };
      const isApprove = input.action === 'approve';
      await prisma.leaveRequest.update({
        where: { id: leave.id },
        data: { status: isApprove ? 'approved' : 'rejected', approvedById: isApprove ? uid : null, approvedAt: isApprove ? new Date() : null, rejectedAt: isApprove ? null : new Date(), comments: input.comments || null },
      });
      const empName = `${leave.employee.user?.firstName || ''} ${leave.employee.user?.lastName || ''}`.trim();
      return { success: true, message: `Leave request for ${empName} has been ${isApprove ? 'approved' : 'rejected'}` };
    }
    case 'create_expense': {
      const expense = await prisma.expense.create({
        data: {
          title: input.title,
          category: input.category,
          amount: Number(input.amount),
          date: input.date ? new Date(input.date) : new Date(),
          description: input.description || null,
          isReimbursable: input.isReimbursable || false,
          status: 'pending',
          companyId: cid,
        },
      });
      return { success: true, id: expense.id, message: `Expense logged: "${input.title}" — $${Number(input.amount).toFixed(2)} (${input.category})` };
    }
    case 'schedule_appointment': {
      const appt = await prisma.appointment.create({
        data: {
          title: input.title,
          startAt: new Date(input.startAt),
          endAt: input.endAt ? new Date(input.endAt) : new Date(new Date(input.startAt).getTime() + 60 * 60 * 1000),
          location: input.location || null,
          meetingUrl: input.meetingUrl || null,
          notes: input.notes || null,
          status: 'scheduled',
          companyId: cid,
          bookedById: uid,
        },
      });
      return { success: true, id: appt.id, message: `Appointment scheduled: "${input.title}" on ${new Date(appt.startAt).toLocaleString()}` };
    }
    case 'daily_digest': {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 86400000);
      const [
        todayTasks, overdueTasks,
        overdueInvoices,
        pendingLeaves,
        openTickets, urgentTickets,
        newLeads,
        activeDeals,
        todayAppts,
        monthRevenue,
      ] = await Promise.all([
        prisma.task.count({ where: { companyId: cid, status: { in: ['todo', 'in_progress'] }, dueDate: { gte: todayStart, lt: todayEnd } } }),
        prisma.task.count({ where: { companyId: cid, status: { in: ['todo', 'in_progress'] }, dueDate: { lt: todayStart } } }),
        prisma.invoice.findMany({ where: { companyId: cid, status: { in: ['sent', 'overdue'] }, dueDate: { lt: now } }, select: { invoiceNo: true, clientName: true, total: true, dueDate: true }, take: 5, orderBy: { dueDate: 'asc' } }),
        prisma.leaveRequest.count({ where: { status: 'pending', employee: { companyId: cid } } }),
        prisma.ticket.count({ where: { companyId: cid, status: { in: ['open', 'pending'] } } }),
        prisma.ticket.count({ where: { companyId: cid, status: { in: ['open', 'pending'] }, priority: 'urgent' } }),
        prisma.lead.count({ where: { companyId: cid, status: 'new' } }),
        prisma.deal.aggregate({ where: { companyId: cid, status: { in: ['open', 'negotiation'] } }, _sum: { value: true }, _count: true }),
        prisma.appointment.findMany({ where: { companyId: cid, startAt: { gte: todayStart, lt: todayEnd } }, select: { title: true, startAt: true, location: true, meetingUrl: true }, orderBy: { startAt: 'asc' } }),
        prisma.invoice.aggregate({ where: { companyId: cid, status: 'paid', paidAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } }, _sum: { total: true } }),
      ]);
      return {
        todaysTasks: todayTasks,
        overdueTasks,
        overdueInvoices: overdueInvoices.map(i => ({ invoiceNo: i.invoiceNo, client: i.clientName, amount: Number(i.total), daysOverdue: Math.floor((now.getTime() - new Date(i.dueDate).getTime()) / 86400000) })),
        pendingLeaveRequests: pendingLeaves,
        openTickets,
        urgentTickets,
        newLeads,
        activeDeals: activeDeals._count,
        pipelineValue: Number(activeDeals._sum.value || 0),
        todaysAppointments: todayAppts.map(a => ({ title: a.title, time: new Date(a.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), location: a.location, meetingUrl: a.meetingUrl })),
        monthRevenue: Number(monthRevenue._sum.total || 0),
      };
    }
    // ── AI-powered tool executors ───────────────────────────────────────────
    case 'draft_email': {
      const mode = 'insensitive';
      const company = await prisma.company.findUnique({ where: { id: cid }, select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true } });
      // Find recipient in leads or contacts
      const lead = await prisma.lead.findFirst({
        where: { companyId: cid, OR: [{ firstName: { contains: input.recipientName, mode } }, { lastName: { contains: input.recipientName, mode } }] },
        select: { id: true, firstName: true, lastName: true, email: true, company: true, jobTitle: true, notes: true },
      });
      const contact = !lead ? await prisma.contact.findFirst({
        where: { companyId: cid, OR: [{ firstName: { contains: input.recipientName, mode } }, { lastName: { contains: input.recipientName, mode } }] },
        select: { id: true, firstName: true, lastName: true, email: true, company: true, jobTitle: true },
      }) : null;
      const recipient = lead || contact;
      if (!recipient) return { error: `"${input.recipientName}" not found in CRM. Try their exact first name.` };

      const aiResult = await callAI({
        messages: [{ role: 'user', content: `Write a ${input.tone || 'professional'} email to ${recipient.firstName} ${recipient.lastName || ''}${recipient.company ? ` at ${recipient.company}` : ''}${recipient.jobTitle ? ` (${recipient.jobTitle})` : ''} for: "${input.purpose}". ${input.keyPoints ? `Key points: ${input.keyPoints}.` : ''} From: ${company?.name}. Write a complete email with Subject line and body. Keep it under 200 words.` }],
        companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider,
        maxTokens: 500, system: 'Write professional business emails. Format: Subject: ...\n\n[Body]. No extra commentary.',
      });

      const subjectMatch = aiResult.text.match(/Subject:\s*(.+)/);
      const subject = subjectMatch?.[1]?.trim() || input.purpose;
      const body = aiResult.text.replace(/Subject:.*\n?/, '').trim();

      if (input.send && recipient.email) {
        const emailService = require('../../services/email.service');
        await emailService.send({ to: recipient.email, subject, html: `<div style="font-family:sans-serif;line-height:1.6;white-space:pre-wrap">${body}</div>`, companyId: cid }).catch(e => logger.warn(`draft_email: send failed to ${recipient.email}: ${e.message}`));
      }
      return { success: true, subject, body, recipient: `${recipient.firstName} ${recipient.lastName || ''}`.trim(), email: recipient.email, sent: !!(input.send && recipient.email), message: `Email drafted${input.send && recipient.email ? ' and sent' : ''} to ${recipient.firstName}` };
    }

    case 'score_leads': {
      const company = await prisma.company.findUnique({ where: { id: cid }, select: { anthropicKey: true, openaiKey: true, aiProvider: true } });
      const leads = await prisma.lead.findMany({
        where: { companyId: cid, status: input.status || 'new' },
        take: Math.min(input.limit || 10, 20),
        orderBy: { createdAt: 'desc' },
        include: { activities: { take: 3 } },
      });
      if (!leads.length) return { message: 'No leads found to score.' };

      const aiResult = await callAI({
        messages: [{ role: 'user', content: `Score these ${leads.length} B2B sales leads from 0-100. Higher scores for: senior titles (CEO/VP/Director/Owner), known companies, referral source, more activities. Return JSON array only: [{"id":"...","score":0-100,"grade":"A/B/C/D","reason":"brief"}]\n\nLeads:\n${leads.map((l, i) => `${i+1}. id:${l.id} | ${l.firstName} ${l.lastName || ''} | ${l.jobTitle || 'no title'} @ ${l.company || 'unknown'} | source:${l.source} | activities:${l.activities.length}`).join('\n')}` }],
        companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider,
        maxTokens: 1000, system: 'Return only valid JSON array, no other text.',
      });

      let scores;
      try { const m = aiResult.text.match(/\[[\s\S]*\]/); scores = JSON.parse(m ? m[0] : aiResult.text); }
      catch { return { error: 'AI scoring failed. Try with fewer leads.' }; }

      for (const s of scores) {
        await prisma.lead.update({ where: { id: s.id }, data: { score: Math.round(Number(s.score)) } }).catch(e => logger.warn(`score_leads: update failed for lead ${s.id}: ${e.message}`));
      }
      const ranked = scores.sort((a, b) => b.score - a.score);
      return { success: true, scored: scores.length, results: ranked, topLead: leads.find(l => l.id === ranked[0]?.id)?.firstName, message: `${scores.length} leads scored by AI. Top score: ${ranked[0]?.score}/100 (grade ${ranked[0]?.grade})` };
    }

    case 'bulk_qualify_leads': {
      const company = await prisma.company.findUnique({ where: { id: cid }, select: { anthropicKey: true, openaiKey: true, aiProvider: true } });
      const leads = await prisma.lead.findMany({
        where: { companyId: cid, status: 'new' },
        take: Math.min(input.limit || 20, 30),
        include: { activities: { take: 3 } },
      });
      if (!leads.length) return { message: 'No new leads to qualify.' };

      const aiResult = await callAI({
        messages: [{ role: 'user', content: `Qualify these ${leads.length} B2B leads. "qualified" = worth pursuing (decision maker, relevant company, engaged). "unqualified" = poor fit (no company, junior role, no engagement). Return JSON array: [{"id":"...","status":"qualified|unqualified","score":0-100,"reason":"brief"}]\n\nLeads:\n${leads.map((l, i) => `${i+1}. id:${l.id} | ${l.firstName} ${l.lastName || ''} | ${l.jobTitle || 'no title'} @ ${l.company || 'unknown'} | source:${l.source} | activities:${l.activities.length}`).join('\n')}` }],
        companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider,
        maxTokens: 1200, system: 'Return only valid JSON array.',
      });

      let results;
      try { const m = aiResult.text.match(/\[[\s\S]*\]/); results = JSON.parse(m ? m[0] : aiResult.text); }
      catch { return { error: 'AI qualification failed.' }; }

      let qualified = 0, unqualified = 0;
      for (const r of results) {
        await prisma.lead.update({ where: { id: r.id }, data: { status: r.status, score: Math.round(Number(r.score || 50)) } }).catch(e => logger.warn(`bulk_qualify_leads: update failed for lead ${r.id}: ${e.message}`));
        if (r.status === 'qualified') qualified++; else unqualified++;
      }
      return { success: true, processed: results.length, qualified, unqualified, results, message: `${results.length} leads qualified by AI: ${qualified} qualified, ${unqualified} unqualified` };
    }

    case 'send_bulk_email': {
      const company = await prisma.company.findUnique({ where: { id: cid }, select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true } });
      const emailService = require('../../services/email.service');
      const lim = Math.min(input.limit || 15, 30);
      let recipients = [];

      if (input.target === 'new_leads' || input.target === 'all_leads') {
        const where = { companyId: cid, email: { not: null }, ...(input.target === 'new_leads' && { status: 'new' }) };
        const rows = await prisma.lead.findMany({ where, take: lim, select: { firstName: true, lastName: true, email: true, company: true, jobTitle: true } });
        recipients = rows;
      } else if (input.target === 'qualified_leads') {
        const rows = await prisma.lead.findMany({ where: { companyId: cid, status: 'qualified', email: { not: null } }, take: lim, select: { firstName: true, lastName: true, email: true, company: true, jobTitle: true } });
        recipients = rows;
      } else if (input.target === 'contacts') {
        const rows = await prisma.contact.findMany({ where: { companyId: cid, email: { not: null } }, take: lim, select: { firstName: true, lastName: true, email: true, company: true, jobTitle: true } });
        recipients = rows;
      } else if (input.target === 'overdue_clients') {
        const rows = await prisma.invoice.findMany({ where: { companyId: cid, status: { in: ['sent', 'overdue'] }, dueDate: { lt: new Date() }, clientEmail: { not: null } }, take: lim, select: { clientName: true, clientEmail: true }, distinct: ['clientEmail'] });
        recipients = rows.map(r => ({ firstName: r.clientName, email: r.clientEmail }));
      }

      if (!recipients.length) return { message: 'No recipients with email addresses found.' };

      // Single AI call for all drafts
      const aiResult = await callAI({
        messages: [{ role: 'user', content: `Draft ${recipients.length} short personalized emails. Purpose: "${input.purpose}". Tone: ${input.tone || 'professional'}. From: ${company?.name}. Max 100 words each.\n\nRecipients:\n${recipients.map((r, i) => `${i+1}. ${r.firstName} ${r.lastName || ''}${r.company ? ` @ ${r.company}` : ''} | ${r.email}`).join('\n')}\n\nReturn JSON array: [{"email":"...","subject":"...","body":"..."}]` }],
        companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider,
        maxTokens: 2000, system: 'Return only valid JSON array.',
      });

      let drafts;
      try { const m = aiResult.text.match(/\[[\s\S]*\]/); drafts = JSON.parse(m ? m[0] : aiResult.text); }
      catch { return { error: 'AI could not draft emails.' }; }

      let sent = 0;
      const results = [];
      for (const d of drafts) {
        try {
          await emailService.send({ to: d.email, subject: d.subject, html: `<div style="font-family:sans-serif;line-height:1.6;white-space:pre-wrap">${d.body}</div>`, companyId: cid });
          sent++;
          results.push({ email: d.email, status: 'sent' });
        } catch { results.push({ email: d.email, status: 'failed' }); }
      }
      return { success: true, total: recipients.length, sent, results, message: `${sent}/${recipients.length} personalized emails sent by AI` };
    }

    case 'forecast_revenue': {
      const company = await prisma.company.findUnique({ where: { id: cid }, select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true } });
      const now = new Date();
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const agg = await prisma.invoice.aggregate({ where: { companyId: cid, status: 'paid', paidAt: { gte: start, lt: end } }, _sum: { total: true } });
        months.push({ month: start.toLocaleString('default', { month: 'short', year: 'numeric' }), revenue: Number(agg._sum.total || 0) });
      }
      const pipeline = await prisma.deal.findMany({ where: { companyId: cid, status: { in: ['open', 'negotiation'] } }, select: { value: true, probability: true } });
      const expectedPipeline = pipeline.reduce((s, d) => s + (Number(d.value || 0) * (d.probability || 50) / 100), 0);
      const avgMonthly = months.reduce((s, m) => s + m.revenue, 0) / 6 || 0;

      const aiResult = await callAI({
        messages: [{ role: 'user', content: `Forecast next month revenue for ${company?.name}.\n\nLast 6 months revenue:\n${months.map(m => `${m.month}: $${m.revenue.toFixed(0)}`).join('\n')}\n\nWeighted pipeline value: $${expectedPipeline.toFixed(0)}\n6-month avg: $${avgMonthly.toFixed(0)}\n\nReturn JSON: {"forecast":number,"confidence":"high|medium|low","trend":"growing|stable|declining","factors":["string"],"recommendations":["string"]}` }],
        companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider,
        maxTokens: 500, system: 'Return only valid JSON.',
      });

      let result;
      try { const m = aiResult.text.match(/\{[\s\S]*\}/); result = JSON.parse(m ? m[0] : aiResult.text); }
      catch { result = { forecast: avgMonthly * 1.05, confidence: 'medium', trend: 'stable', factors: [], recommendations: [] }; }

      return { historicalMonths: months, expectedPipeline, avgMonthly, ...result, message: `Next month forecast: $${Number(result.forecast || 0).toFixed(0)} (${result.confidence} confidence · ${result.trend} trend)` };
    }

    case 'analyze_pipeline': {
      const company = await prisma.company.findUnique({ where: { id: cid }, select: { anthropicKey: true, openaiKey: true, aiProvider: true } });
      const deals = await prisma.deal.findMany({
        where: { companyId: cid, status: { in: ['open', 'negotiation'] } },
        include: { stage: { select: { name: true } } },
        orderBy: { value: 'desc' }, take: 20,
      });
      if (!deals.length) return { message: 'No open deals in pipeline to analyze.' };

      const now = new Date();
      const aiResult = await callAI({
        messages: [{ role: 'user', content: `Analyze this sales pipeline. Identify at-risk deals (stale, low prob), quick wins (high prob, good value), and give specific next actions.\n\nDeals:\n${deals.map((d, i) => `${i+1}. "${d.title}" | Stage:${d.stage?.name} | Value:$${Number(d.value||0).toFixed(0)} | Prob:${d.probability}% | Age:${Math.floor((now.getTime()-new Date(d.createdAt).getTime())/86400000)}d`).join('\n')}\n\nReturn JSON: {"atRisk":[{"title":"...","reason":"...","action":"..."}],"quickWins":[{"title":"...","value":number,"action":"..."}],"stale":[{"title":"...","daysOld":number,"recommendation":"..."}],"summary":"2 sentences"}` }],
        companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider,
        maxTokens: 800, system: 'Return only valid JSON.',
      });

      let analysis;
      try { const m = aiResult.text.match(/\{[\s\S]*\}/); analysis = JSON.parse(m ? m[0] : aiResult.text); }
      catch { return { error: 'Pipeline analysis failed.' }; }

      return { ...analysis, totalDeals: deals.length, totalValue: deals.reduce((s, d) => s + Number(d.value || 0), 0), message: `Pipeline analyzed: ${analysis.atRisk?.length || 0} at-risk, ${analysis.quickWins?.length || 0} quick wins, ${analysis.stale?.length || 0} stale deals` };
    }

    case 'create_social_post': {
      const company = await prisma.company.findUnique({ where: { id: cid }, select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true } });
      const platformGuide = { linkedin: '1300 chars max, thought leadership style, 3-5 hashtags', twitter: '280 chars max, punchy and concise, 2-3 hashtags', instagram: 'Visual caption, 2200 chars max, 20-30 hashtags', general: 'Adaptable for any platform, 500 chars' };
      const platform = input.platform || 'linkedin';

      const aiResult = await callAI({
        messages: [{ role: 'user', content: `Write a ${input.tone || 'professional'} ${platform} post for ${company?.name} about: "${input.topic}". Platform rules: ${platformGuide[platform] || platformGuide.general}. ${input.includeHashtags !== false ? 'Include relevant hashtags.' : 'No hashtags.'} Write only the post content, ready to copy-paste.` }],
        companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider,
        maxTokens: 600, system: 'Write engaging social media content. Post content only, no preamble.',
      });

      let savedId = null;
      try {
        const post = await prisma.socialPost.create({ data: { companyId: cid, platform, content: aiResult.text, status: 'draft' } });
        savedId = post.id;
      } catch {}

      return { success: true, content: aiResult.text, platform, savedId, message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} post drafted about "${input.topic}"` };
    }

    case 'reply_to_ticket': {
      const mode = 'insensitive';
      const company = await prisma.company.findUnique({ where: { id: cid }, select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true } });
      const ticket = await prisma.ticket.findFirst({
        where: { companyId: cid, ...(input.ticketNo ? { ticketNo: input.ticketNo } : { subject: { contains: input.subject || '', mode } }), status: { notIn: ['resolved', 'closed'] } },
        select: { id: true, ticketNo: true, subject: true, description: true, priority: true },
      });
      if (!ticket) return { error: 'Ticket not found or already resolved.' };

      const aiResult = await callAI({
        messages: [{ role: 'user', content: `Write a ${input.tone || 'professional'} support reply for:\n\nTicket: ${ticket.ticketNo}\nSubject: ${ticket.subject}\nPriority: ${ticket.priority}\nCustomer message: ${ticket.description || 'No description'}\n\nFrom: ${company?.name} Support Team. Be helpful, acknowledge the issue, provide clear next steps. Under 150 words. Reply only, no subject line.` }],
        companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider,
        maxTokens: 400, system: 'Write empathetic, solution-focused customer support replies.',
      });

      await prisma.activity.create({ data: { companyId: cid, type: 'email', subject: `AI Reply: ${ticket.subject}`, description: aiResult.text, userId: uid, completedAt: new Date() } }).catch(e => logger.warn(`reply_to_ticket: activity log failed: ${e.message}`));
      return { success: true, ticketNo: ticket.ticketNo, reply: aiResult.text, message: `AI reply drafted for ticket ${ticket.ticketNo}` };
    }

    case 'generate_report': {
      const company = await prisma.company.findUnique({ where: { id: cid }, select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true } });
      const now = new Date();
      const since = new Date(now - 30 * 24 * 60 * 60 * 1000);

      const [newLeads, qualifiedLeads, convertedLeads, openDeals, wonDeals, dealValue, revenue, outstanding, openTickets, resolvedTickets, activeProjects, activeTasks, pendingLeaves, activeEmps] = await Promise.all([
        prisma.lead.count({ where: { companyId: cid, createdAt: { gte: since } } }),
        prisma.lead.count({ where: { companyId: cid, status: 'qualified' } }),
        prisma.lead.count({ where: { companyId: cid, status: 'converted', updatedAt: { gte: since } } }),
        prisma.deal.count({ where: { companyId: cid, status: { in: ['open', 'negotiation'] } } }),
        prisma.deal.count({ where: { companyId: cid, status: 'won', updatedAt: { gte: since } } }),
        prisma.deal.aggregate({ where: { companyId: cid, status: { in: ['open', 'negotiation'] } }, _sum: { value: true } }),
        prisma.invoice.aggregate({ where: { companyId: cid, status: 'paid', paidAt: { gte: since } }, _sum: { total: true } }),
        prisma.invoice.aggregate({ where: { companyId: cid, status: { in: ['sent', 'overdue'] } }, _sum: { total: true } }),
        prisma.ticket.count({ where: { companyId: cid, status: { in: ['open', 'pending'] } } }),
        prisma.ticket.count({ where: { companyId: cid, status: 'resolved', updatedAt: { gte: since } } }),
        prisma.project.count({ where: { companyId: cid, status: 'active' } }),
        prisma.task.count({ where: { companyId: cid, status: { in: ['todo', 'in_progress'] } } }),
        prisma.leaveRequest.count({ where: { status: 'pending', employee: { companyId: cid } } }),
        prisma.employee.count({ where: { companyId: cid, status: 'active' } }),
      ]);

      const aiResult = await callAI({
        messages: [{ role: 'user', content: `Write a ${input.type || 'monthly'} business report for ${company?.name} (last 30 days).\n\nMetrics:\n- New leads: ${newLeads} | Qualified: ${qualifiedLeads} | Converted: ${convertedLeads}\n- Open deals: ${openDeals} worth $${Number(dealValue._sum.value||0).toFixed(0)} | Won: ${wonDeals}\n- Revenue collected: $${Number(revenue._sum.total||0).toFixed(0)} | Outstanding: $${Number(outstanding._sum.total||0).toFixed(0)}\n- Open tickets: ${openTickets} | Resolved: ${resolvedTickets}\n- Active projects: ${activeProjects} | Open tasks: ${activeTasks}\n- Employees: ${activeEmps} | Pending leaves: ${pendingLeaves}\n\nWrite: Executive Summary, Performance Highlights, Areas of Concern, Key Metrics table, Strategic Recommendations. Use markdown headers and bullet points.` }],
        companyAnthropicKey: company?.anthropicKey, companyOpenaiKey: company?.openaiKey, companyProvider: company?.aiProvider,
        maxTokens: 1500, system: 'Write comprehensive, data-driven business reports in clear markdown.',
      });

      return { success: true, report: aiResult.text, generatedAt: now.toISOString(), period: input.type || 'monthly', message: `${input.type || 'Monthly'} business report generated (${now.toLocaleDateString()})` };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function getAgentSuggestions(actions) {
  const used = new Set(actions.map(a => a.tool));
  const s = [];
  if (used.has('daily_digest') || used.has('get_stats') || used.has('get_overdue_summary')) {
    s.push('Send payment reminders to all overdue clients', 'Approve all pending leave requests', 'Show pipeline summary');
  }
  if (used.has('list_leads') || used.has('create_lead')) {
    s.push('Convert this lead to a contact and deal', 'Schedule a follow-up for this lead', 'Bulk mark all new leads as contacted');
  }
  if (used.has('list_invoices') || used.has('create_invoice')) {
    s.push('Send payment reminders', 'Show revenue report last 6 months', 'Mark overdue invoices as paid');
  }
  if (used.has('get_pipeline_summary') || used.has('create_deal') || used.has('update_deal')) {
    s.push('Show all won deals this month', 'Create follow-up tasks for top 3 deals', 'List leads to convert');
  }
  if (used.has('create_ticket') || used.has('list_tickets')) {
    s.push('Resolve all urgent tickets', 'Show today\'s digest', 'List all open tickets');
  }
  if (used.has('get_revenue_report')) {
    s.push("Show today's digest", 'List unpaid invoices', 'Create a purchase order');
  }
  if (used.has('convert_lead')) {
    s.push('Schedule a follow-up for the new deal', 'Create an invoice for this client', 'Add a note to the contact');
  }
  if (used.has('list_deals') || used.has('list_contacts')) {
    s.push('Convert top lead to a deal', 'Draft email to top contact', 'Create an invoice for this client');
  }
  if (used.has('draft_email')) {
    s.push('Draft emails to all new leads', 'Add a follow-up task for this contact', 'Create a deal for this client');
  }
  if (used.has('score_leads') || used.has('bulk_qualify_leads')) {
    s.push('Send emails to all qualified leads', 'Convert top qualified lead', 'Draft follow-up for top scored lead');
  }
  if (used.has('send_bulk_email')) {
    s.push('Score all leads that responded', 'Show pipeline summary', 'Generate a monthly report');
  }
  if (used.has('forecast_revenue') || used.has('analyze_pipeline')) {
    s.push('Show revenue report last 6 months', 'Create follow-ups for at-risk deals', 'Send payment reminders');
  }
  if (used.has('create_social_post')) {
    s.push('Generate another post for Instagram', 'Create a campaign for this topic', 'Generate a LinkedIn post about services');
  }
  if (used.has('reply_to_ticket')) {
    s.push('Resolve this ticket after sending reply', 'List all urgent tickets', 'Show overdue summary');
  }
  if (used.has('generate_report')) {
    s.push('Forecast next month revenue', 'Analyze pipeline for risks', 'Show today\'s digest');
  }
  if (used.has('list_leaves') || used.has('approve_leave')) {
    s.push('Show employee list', 'Log a business expense', 'Show today\'s digest');
  }
  if (used.has('create_project') || used.has('list_projects')) {
    s.push('Create tasks for this project', 'Show pipeline summary', 'List active projects');
  }
  if (used.has('create_contract') || used.has('list_contracts')) {
    s.push('Create an invoice for this client', 'Schedule a follow-up meeting', 'Show revenue report');
  }
  if (used.has('create_purchase_order')) {
    s.push('Log this as an expense', 'List all purchase orders', 'Show overdue summary');
  }
  if (used.has('schedule_appointment')) {
    s.push('Add a follow-up task', 'Send the client an invoice', 'Show today\'s digest');
  }
  return [...new Set(s)].slice(0, 3);
}

// POST /ai/generate-image — direct DALL-E 3 image generation (always OpenAI)
router.post('/generate-image', async (req, res, next) => {
  try {
    const { prompt, size = '1024x1024' } = req.body;
    if (!prompt?.trim()) return error(res, 'Prompt is required', 400);
    const company = await prisma.company.findUnique({ where: { id: req.companyId }, select: { openaiKey: true } });
    const { url: remoteUrl } = await generateImage({
      prompt: prompt.trim(),
      companyOpenaiKey: company?.openaiKey,
      size: ['1024x1024', '1024x1792', '1792x1024'].includes(size) ? size : '1024x1024',
    });
    const imgResponse = await axios.get(remoteUrl, { responseType: 'arraybuffer', timeout: 60000 });
    const filename = `${uuidv4()}.png`;
    fs.writeFileSync(path.join(uploadDir, filename), imgResponse.data);
    return success(res, { url: `/uploads/${filename}` }, 'Image generated');
  } catch (err) { next(err); }
});

// OpenAI tool format (converted from Anthropic input_schema format)
const OPENAI_TOOLS = AGENT_TOOLS.map(t => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

// POST /ai/agent — Agentic AI with tool use (supports both Anthropic and OpenAI)
router.post('/agent', agentLimiter, async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;
    if (!message?.trim()) return error(res, 'Message is required', 400);

    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true },
    });

    const provider = company?.aiProvider || config.ai.provider || 'anthropic';
    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = `You are an AI business autopilot for ${company?.name || 'this company'}. You can take real actions and use AI to create content, analyze data, score leads, draft emails, and automate complex workflows — all from a single message.

Rules:
- Act immediately — call tools without confirmation unless critical info is missing.
- Chain tools intelligently: e.g. daily_digest → analyze_pipeline → send_payment_reminder.
- For "morning briefing" or "what needs attention" → call daily_digest then analyze_pipeline.
- For "score my leads" or "qualify leads" → call bulk_qualify_leads then score_leads.
- For "email all leads" or "reach out" → use send_bulk_email.
- For "analyze pipeline" or "at-risk deals" → call analyze_pipeline.
- For "forecast revenue" or "next month prediction" → call forecast_revenue.
- After actions: confirm with key numbers (sent X emails, scored Y leads, forecast $Z).
- Format responses with **bold** for values, bullets for lists.
- Today: ${today}.`;

    const actions = [];
    let assistantText = 'Done.';

    if (provider === 'openai') {
      // ── OpenAI path ──────────────────────────────────────────────────────────
      const rawKey = (company?.openaiKey ? decrypt(company.openaiKey) : null) || config.ai.openaiKey;
      if (!rawKey) return error(res, 'OpenAI API key not configured. Add it in Settings → AI Config.', 400);

      const openai = new OpenAI({ apiKey: rawKey });
      const oaiMessages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ];

      let oaiRes = await openai.chat.completions.create({
        model: config.ai.openaiModel,
        max_tokens: 2048,
        messages: oaiMessages,
        tools: OPENAI_TOOLS,
        tool_choice: 'auto',
      });

      let iterations = 0;
      while (oaiRes.choices[0].finish_reason === 'tool_calls' && iterations < 6) {
        iterations++;
        const assistantMsg = oaiRes.choices[0].message;
        oaiMessages.push(assistantMsg);

        for (const toolCall of (assistantMsg.tool_calls || [])) {
          let input = {};
          try { input = JSON.parse(toolCall.function.arguments); } catch {}
          let result;
          try { result = await executeAgentTool(toolCall.function.name, input, req); }
          catch (e) { result = { error: e.message }; }
          actions.push({ tool: toolCall.function.name, input, result });
          oaiMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
        }

        oaiRes = await openai.chat.completions.create({
          model: config.ai.openaiModel,
          max_tokens: 2048,
          messages: oaiMessages,
          tools: OPENAI_TOOLS,
          tool_choice: 'auto',
        });
      }

      assistantText = oaiRes.choices[0].message.content || 'Done.';

    } else {
      // ── Anthropic path ───────────────────────────────────────────────────────
      const rawKey = (company?.anthropicKey ? decrypt(company.anthropicKey) : null) || config.ai.anthropicKey;
      if (!rawKey) return error(res, 'Anthropic API key not configured. Add it in Settings → AI Config.', 400);

      const anthropic = new Anthropic({ apiKey: rawKey });
      const claudeMessages = [...history, { role: 'user', content: message }];

      let claudeRes = await anthropic.messages.create({
        model: config.ai.claudeModel,
        max_tokens: 2048,
        system: systemPrompt,
        messages: claudeMessages,
        tools: AGENT_TOOLS,
      });

      let iterations = 0;
      while (claudeRes.stop_reason === 'tool_use' && iterations < 6) {
        iterations++;
        const toolResults = [];

        for (const block of claudeRes.content) {
          if (block.type === 'tool_use') {
            let result;
            try { result = await executeAgentTool(block.name, block.input, req); }
            catch (e) { result = { error: e.message }; }
            actions.push({ tool: block.name, input: block.input, result });
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
          }
        }

        claudeMessages.push({ role: 'assistant', content: claudeRes.content });
        claudeMessages.push({ role: 'user', content: toolResults });

        claudeRes = await anthropic.messages.create({
          model: config.ai.claudeModel,
          max_tokens: 2048,
          system: systemPrompt,
          messages: claudeMessages,
          tools: AGENT_TOOLS,
        });
      }

      assistantText = claudeRes.content.find(b => b.type === 'text')?.text || 'Done.';
    }

    const nextHistory = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: assistantText },
    ].slice(-20);

    const suggestions = getAgentSuggestions(actions);
    return success(res, { message: assistantText, actions, history: nextHistory, suggestions });
  } catch (err) {
    logger.error('AI agent error:', err?.message || err);
    const clientMsg = err?.message?.includes('API key') || err?.status
      ? err.message
      : 'AI agent failed. Check your API key and model in Settings → AI Config.';
    return error(res, clientMsg, err?.status || 500);
  }
});

// ─── Helper: get company AI keys ─────────────────────────────────────────────
async function getCompanyKeys(companyId) {
  return prisma.company.findUnique({ where: { id: companyId }, select: { name: true, industry: true, anthropicKey: true, openaiKey: true, aiProvider: true } });
}

// ─── POST /ai/contract-review ─────────────────────────────────────────────────
router.post('/contract-review', async (req, res, next) => {
  try {
    const { title, content, partyName, value } = req.body;
    if (!title && !content) return error(res, 'Contract title or content required', 400);
    const co = await getCompanyKeys(req.companyId);
    const result = await callAI({
      messages: [{ role: 'user', content: `Review this contract and provide a risk assessment.\n\nTitle: ${title || 'Untitled'}\nParty: ${partyName || 'Unknown'}\nValue: ${value ? '$' + value : 'Not specified'}\n\nContent excerpt:\n${(content || '').slice(0, 3000) || '(no content provided)'}\n\nReturn JSON only:\n{\n  "riskLevel": "low|medium|high",\n  "riskScore": 0-100,\n  "summary": "2-3 sentence overview",\n  "risks": ["risk1", "risk2", "risk3"],\n  "recommendations": ["rec1", "rec2", "rec3"],\n  "keyTerms": ["important clause or term1", "term2"],\n  "negotiationTips": "1-2 tips for negotiation"\n}` }],
      system: 'You are a contract lawyer and risk analyst. Return only valid JSON. Be specific and practical.',
      companyAnthropicKey: co?.anthropicKey, companyOpenaiKey: co?.openaiKey, companyProvider: co?.aiProvider, maxTokens: 1200,
      logCtx: { companyId: req.companyId, module: 'contract-review' },
    });
    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
    return success(res, parsed);
  } catch (err) { next(err); }
});

// ─── POST /ai/project-breakdown ───────────────────────────────────────────────
router.post('/project-breakdown', async (req, res, next) => {
  try {
    const { name, description, deadline } = req.body;
    if (!name) return error(res, 'Project name required', 400);
    const co = await getCompanyKeys(req.companyId);
    const result = await callAI({
      messages: [{ role: 'user', content: `Break down this project into actionable tasks.\n\nProject: ${name}\nDescription: ${description || 'No description'}\nDeadline: ${deadline || 'Not set'}\n\nReturn JSON only:\n{\n  "phases": [\n    { "name": "phase name", "tasks": [{ "title": "task", "description": "brief", "priority": "high|medium|low", "estimatedHours": 2 }] }\n  ],\n  "totalEstimatedHours": 0,\n  "criticalPath": ["most critical task1", "task2"],\n  "risks": ["risk1", "risk2"],\n  "recommendation": "brief project advice"\n}` }],
      system: 'You are a senior project manager. Return only valid JSON. Be realistic with estimates.',
      companyAnthropicKey: co?.anthropicKey, companyOpenaiKey: co?.openaiKey, companyProvider: co?.aiProvider, maxTokens: 1500,
      logCtx: { companyId: req.companyId, module: 'project-ai' },
    });
    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
    return success(res, parsed);
  } catch (err) { next(err); }
});

// ─── POST /ai/kb-article ──────────────────────────────────────────────────────
router.post('/kb-article', async (req, res, next) => {
  try {
    const { topic, audience, tone, outline } = req.body;
    if (!topic) return error(res, 'Topic required', 400);
    const co = await getCompanyKeys(req.companyId);
    const result = await callAI({
      messages: [{ role: 'user', content: `Write a comprehensive knowledge base article.\n\nTopic: ${topic}\nAudience: ${audience || 'general users'}\nTone: ${tone || 'professional and helpful'}\n${outline ? `Outline to follow: ${outline}` : ''}\n\nReturn JSON only:\n{\n  "title": "article title",\n  "content": "full markdown article with headers, bullet points, steps",\n  "summary": "1-2 sentence summary",\n  "tags": ["tag1", "tag2", "tag3"]\n}` }],
      system: 'You are a technical writer. Write clear, helpful articles. Return only valid JSON. Use markdown in the content field.',
      companyAnthropicKey: co?.anthropicKey, companyOpenaiKey: co?.openaiKey, companyProvider: co?.aiProvider, maxTokens: 2000,
      logCtx: { companyId: req.companyId, module: 'knowledge-base' },
    });
    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
    return success(res, parsed);
  } catch (err) { next(err); }
});

// ─── POST /ai/okr-suggest ─────────────────────────────────────────────────────
router.post('/okr-suggest', async (req, res, next) => {
  try {
    const { focus, timeframe, existingOkrs } = req.body;
    const co = await getCompanyKeys(req.companyId);
    // Pull recent stats for context
    const [leads, invoices, employees] = await Promise.all([
      prisma.lead.count({ where: { companyId: req.companyId } }),
      prisma.invoice.aggregate({ where: { companyId: req.companyId, status: 'paid' }, _sum: { total: true } }),
      prisma.employee.count({ where: { companyId: req.companyId } }),
    ]);
    const result = await callAI({
      messages: [{ role: 'user', content: `Suggest OKRs for ${co?.name || 'our company'} (${co?.industry || 'business'}).\n\nContext: ${leads} leads, $${Math.round((invoices._sum.total||0)/100)/10}K revenue, ${employees} employees.\nFocus area: ${focus || 'overall growth'}\nTimeframe: ${timeframe || 'Q3 2026'}\n${existingOkrs ? `Existing OKRs: ${existingOkrs}` : ''}\n\nReturn JSON only:\n{\n  "objectives": [\n    {\n      "objective": "objective statement",\n      "keyResults": [\n        { "kr": "key result", "metric": "measurable target", "current": "current value", "target": "goal value" }\n      ]\n    }\n  ],\n  "reasoning": "brief explanation of why these OKRs"\n}` }],
      system: 'You are a strategic business consultant specializing in OKRs. Return only valid JSON. Make OKRs specific, measurable, and ambitious.',
      companyAnthropicKey: co?.anthropicKey, companyOpenaiKey: co?.openaiKey, companyProvider: co?.aiProvider, maxTokens: 1500,
      logCtx: { companyId: req.companyId, module: 'okr' },
    });
    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
    return success(res, parsed);
  } catch (err) { next(err); }
});

// ─── POST /ai/meeting-agenda ──────────────────────────────────────────────────
router.post('/meeting-agenda', async (req, res, next) => {
  try {
    const { title, attendees, duration, purpose, notes } = req.body;
    if (!title) return error(res, 'Meeting title required', 400);
    const co = await getCompanyKeys(req.companyId);
    const result = await callAI({
      messages: [{ role: 'user', content: `Create a meeting agenda.\n\nMeeting: ${title}\nAttendees: ${attendees || 'team'}\nDuration: ${duration || '60 minutes'}\nPurpose: ${purpose || 'general discussion'}\n${notes ? `Notes: ${notes}` : ''}\n\nReturn JSON only:\n{\n  "agenda": [\n    { "item": "agenda item", "duration": "X min", "owner": "who leads this", "goal": "what to achieve" }\n  ],\n  "preMeetingTasks": ["task1 to do before meeting", "task2"],\n  "expectedOutcomes": ["outcome1", "outcome2"],\n  "followUpTemplate": "template for follow-up email after meeting"\n}` }],
      system: 'You are an expert meeting facilitator. Return only valid JSON. Be time-efficient and outcome-focused.',
      companyAnthropicKey: co?.anthropicKey, companyOpenaiKey: co?.openaiKey, companyProvider: co?.aiProvider, maxTokens: 1200,
    });
    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
    return success(res, parsed);
  } catch (err) { next(err); }
});

// ─── POST /ai/hr-insights ─────────────────────────────────────────────────────
router.post('/hr-insights', async (req, res, next) => {
  try {
    const co = await getCompanyKeys(req.companyId);
    const [employees, leaves, attendance] = await Promise.all([
      prisma.employee.findMany({ where: { companyId: req.companyId }, include: { user: { select: { firstName: true, lastName: true } }, department: true }, take: 50 }),
      prisma.leave.findMany({ where: { companyId: req.companyId, status: 'pending' }, take: 20 }),
      prisma.attendance.count({ where: { companyId: req.companyId, date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
    ]);
    const deptBreakdown = employees.reduce((acc, e) => { const d = e.department?.name || 'Unassigned'; acc[d] = (acc[d]||0)+1; return acc; }, {});
    const result = await callAI({
      messages: [{ role: 'user', content: `Analyze our HR data and provide insights.\n\nCompany: ${co?.name}\nTotal Employees: ${employees.length}\nPending Leaves: ${leaves.length}\nAttendance Records (30d): ${attendance}\nDepartment Breakdown: ${JSON.stringify(deptBreakdown)}\n\nReturn JSON only:\n{\n  "healthScore": 0-100,\n  "insights": ["insight1", "insight2", "insight3"],\n  "alerts": ["urgent action1", "urgent action2"],\n  "recommendations": ["recommendation1", "recommendation2", "recommendation3"],\n  "trends": { "retention": "trend", "productivity": "trend", "engagement": "trend" },\n  "priorities": ["top priority1", "top priority2"]\n}` }],
      system: 'You are an HR analytics expert. Return only valid JSON with actionable, data-driven insights.',
      companyAnthropicKey: co?.anthropicKey, companyOpenaiKey: co?.openaiKey, companyProvider: co?.aiProvider, maxTokens: 1200,
    });
    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
    return success(res, parsed);
  } catch (err) { next(err); }
});

// ─── POST /ai/cashflow-forecast ───────────────────────────────────────────────
router.post('/cashflow-forecast', async (req, res, next) => {
  try {
    const co = await getCompanyKeys(req.companyId);
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const [invoices, expenses, income] = await Promise.all([
      prisma.invoice.findMany({ where: { companyId: req.companyId, createdAt: { gte: sixMonthsAgo } }, select: { total: true, status: true, dueDate: true, createdAt: true } }),
      prisma.expense.findMany({ where: { companyId: req.companyId, createdAt: { gte: sixMonthsAgo } }, select: { amount: true, date: true, category: true } }),
      prisma.income.findMany({ where: { companyId: req.companyId, createdAt: { gte: sixMonthsAgo } }, select: { amount: true, date: true, category: true } }),
    ]);
    const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
    const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const totalIncome = income.reduce((s, i) => s + (i.amount || 0), 0);
    const overdueInvoices = invoices.filter(i => i.status !== 'paid' && i.dueDate && new Date(i.dueDate) < now);
    const result = await callAI({
      messages: [{ role: 'user', content: `Analyze cash flow and forecast next 3 months.\n\nCompany: ${co?.name} (${co?.industry || 'business'})\nLast 6 months revenue: $${Math.round(totalRevenue)}\nLast 6 months expenses: $${Math.round(totalExpenses)}\nOther income: $${Math.round(totalIncome)}\nOverdue invoices: ${overdueInvoices.length} invoices\nNet profit: $${Math.round(totalRevenue + totalIncome - totalExpenses)}\n\nReturn JSON only:\n{\n  "currentCashHealth": "healthy|caution|critical",\n  "healthScore": 0-100,\n  "summary": "2-3 sentence overview",\n  "forecast": [\n    { "month": "July 2026", "projectedRevenue": 0, "projectedExpenses": 0, "netCashFlow": 0, "confidence": "high|medium|low" }\n  ],\n  "insights": ["insight1", "insight2"],\n  "risks": ["risk1", "risk2"],\n  "recommendations": ["rec1", "rec2", "rec3"]\n}` }],
      system: 'You are a CFO and financial analyst. Return only valid JSON with realistic projections.',
      companyAnthropicKey: co?.anthropicKey, companyOpenaiKey: co?.openaiKey, companyProvider: co?.aiProvider, maxTokens: 1500,
    });
    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
    return success(res, parsed);
  } catch (err) { next(err); }
});

// ─── POST /ai/helpdesk-triage ─────────────────────────────────────────────────
router.post('/helpdesk-triage', async (req, res, next) => {
  try {
    const co = await getCompanyKeys(req.companyId);
    const openTickets = await prisma.ticket.findMany({
      where: { companyId: req.companyId, status: { in: ['open', 'in_progress'] } },
      select: { title: true, description: true, priority: true, status: true, createdAt: true, category: true },
      take: 30,
      orderBy: { createdAt: 'desc' },
    });
    const result = await callAI({
      messages: [{ role: 'user', content: `Triage and analyze our open support tickets.\n\nOpen Tickets (${openTickets.length}):\n${openTickets.map((t, i) => `${i+1}. [${t.priority}] ${t.title} — ${(t.description||'').slice(0,100)}`).join('\n')}\n\nReturn JSON only:\n{\n  "urgentCount": 0,\n  "summary": "brief overview",\n  "priorityActions": ["urgent action1", "action2", "action3"],\n  "patterns": ["common issue pattern1", "pattern2"],\n  "sentimentSummary": "overall customer sentiment",\n  "suggestions": ["process improvement1", "suggestion2"],\n  "autoResponses": [\n    { "category": "category name", "template": "suggested auto-response template" }\n  ]\n}` }],
      system: 'You are a customer success and support operations expert. Return only valid JSON.',
      companyAnthropicKey: co?.anthropicKey, companyOpenaiKey: co?.openaiKey, companyProvider: co?.aiProvider, maxTokens: 1500,
    });
    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
    return success(res, parsed);
  } catch (err) { next(err); }
});

// ─── POST /ai/timesheet-insights ──────────────────────────────────────────────
router.post('/timesheet-insights', async (req, res, next) => {
  try {
    const co = await getCompanyKeys(req.companyId);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const logs = await prisma.timeLog.findMany({
      where: { companyId: req.companyId, date: { gte: since } },
      include: { task: { select: { title: true } }, project: { select: { name: true } }, user: { select: { firstName: true, lastName: true } } },
      take: 100,
    }).catch(() => []);
    const totalHours = logs.reduce((s, l) => s + (l.hours || 0), 0);
    const byProject = logs.reduce((acc, l) => { const p = l.project?.name || 'General'; acc[p] = (acc[p]||0) + (l.hours||0); return acc; }, {});
    const result = await callAI({
      messages: [{ role: 'user', content: `Analyze our time tracking data for the last 30 days.\n\nTotal hours logged: ${Math.round(totalHours)}\nTeam members: ${[...new Set(logs.map(l => l.user?.firstName))].length}\nProjects: ${JSON.stringify(byProject)}\n\nReturn JSON only:\n{\n  "productivityScore": 0-100,\n  "summary": "brief overview",\n  "topInsights": ["insight1", "insight2", "insight3"],\n  "bottlenecks": ["bottleneck1", "bottleneck2"],\n  "recommendations": ["rec1", "rec2"],\n  "burnoutRisk": "low|medium|high",\n  "focusAreas": ["area1", "area2"]\n}` }],
      system: 'You are a productivity and team management expert. Return only valid JSON with actionable insights.',
      companyAnthropicKey: co?.anthropicKey, companyOpenaiKey: co?.openaiKey, companyProvider: co?.aiProvider, maxTokens: 1000,
    });
    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
    return success(res, parsed);
  } catch (err) { next(err); }
});

// ─── POST /ai/workflow-suggest ────────────────────────────────────────────────
router.post('/workflow-suggest', async (req, res, next) => {
  try {
    const co = await getCompanyKeys(req.companyId);
    const [leads, tickets, invoices, employees] = await Promise.all([
      prisma.lead.count({ where: { companyId: req.companyId } }),
      prisma.ticket.count({ where: { companyId: req.companyId, status: 'open' } }),
      prisma.invoice.count({ where: { companyId: req.companyId, status: 'overdue' } }),
      prisma.employee.count({ where: { companyId: req.companyId } }),
    ]);
    const result = await callAI({
      messages: [{ role: 'user', content: `Suggest automation workflows for ${co?.name} (${co?.industry || 'business'}).\n\nContext: ${leads} leads, ${tickets} open tickets, ${invoices} overdue invoices, ${employees} employees.\n\nReturn JSON only:\n{\n  "workflows": [\n    {\n      "name": "workflow name",\n      "trigger": "what triggers this",\n      "actions": ["action1", "action2", "action3"],\n      "impact": "high|medium|low",\n      "timeSavedPerWeek": "X hours",\n      "category": "sales|support|finance|hr|marketing"\n    }\n  ],\n  "topPriority": "which workflow to implement first and why"\n}` }],
      system: 'You are a business process automation expert. Return only valid JSON. Focus on ROI and quick wins.',
      companyAnthropicKey: co?.anthropicKey, companyOpenaiKey: co?.openaiKey, companyProvider: co?.aiProvider, maxTokens: 1500,
    });
    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
    return success(res, parsed);
  } catch (err) { next(err); }
});

// ─── POST /ai/document-summary ────────────────────────────────────────────────
router.post('/document-summary', async (req, res, next) => {
  try {
    const { documentId, text } = req.body;
    let content = text;
    if (!content && documentId) {
      const doc = await prisma.document.findFirst({ where: { id: documentId, companyId: req.companyId }, select: { name: true, content: true } });
      content = doc?.content || doc?.name;
    }
    if (!content) return error(res, 'Document content required', 400);
    const co = await getCompanyKeys(req.companyId);
    const result = await callAI({
      messages: [{ role: 'user', content: `Summarize and extract key information from this document.\n\nContent:\n${String(content).slice(0, 4000)}\n\nReturn JSON only:\n{\n  "title": "document title if detectable",\n  "summary": "2-3 sentence overview",\n  "keyPoints": ["key point1", "key point2", "key point3", "key point4"],\n  "actionItems": ["action item1", "action item2"],\n  "entities": { "people": ["name1"], "companies": ["company1"], "dates": ["date1"], "amounts": ["amount1"] },\n  "sentiment": "positive|neutral|negative",\n  "suggestedTags": ["tag1", "tag2", "tag3"]\n}` }],
      system: 'You are a document intelligence expert. Return only valid JSON. Be precise and concise.',
      companyAnthropicKey: co?.anthropicKey, companyOpenaiKey: co?.openaiKey, companyProvider: co?.aiProvider, maxTokens: 1200,
    });
    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
    return success(res, parsed);
  } catch (err) { next(err); }
});

// ─── POST /ai/email-template ──────────────────────────────────────────────────
router.post('/email-template', async (req, res, next) => {
  try {
    const { purpose, audience, tone, keyPoints } = req.body;
    if (!purpose) return error(res, 'Purpose required', 400);
    const co = await getCompanyKeys(req.companyId);
    const result = await callAI({
      messages: [{ role: 'user', content: `Write a professional email template.\n\nPurpose: ${purpose}\nAudience: ${audience || 'general'}\nTone: ${tone || 'professional'}\nKey points to include: ${keyPoints || 'not specified'}\nCompany: ${co?.name || 'our company'}\n\nReturn JSON only:\n{\n  "subject": "email subject line",\n  "previewText": "email preview text (50 chars)",\n  "body": "full email body with placeholders like {{firstName}}, {{companyName}}",\n  "cta": "call-to-action text",\n  "tips": ["personalization tip1", "tip2"]\n}` }],
      system: 'You are an email marketing expert. Return only valid JSON. Write compelling, conversion-focused copy.',
      companyAnthropicKey: co?.anthropicKey, companyOpenaiKey: co?.openaiKey, companyProvider: co?.aiProvider, maxTokens: 1200,
    });
    const parsed = JSON.parse(result.text.replace(/```json\n?|\n?```/g, '').trim());
    return success(res, parsed);
  } catch (err) { next(err); }
});

// POST /ai/brain-chat — conversational AI with full live business context
router.post('/brain-chat', async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return error(res, 'message required', 400);

    const cid = req.companyId;
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const co = await getCompanyKeys(cid);

    // Load live business data from all modules in parallel
    const [
      totalLeads, newLeads30, convertedLeads30,
      openDeals, wonDeals30, dealValue,
      contacts,
      openTickets, urgentTickets, resolvedTickets30,
      revenue30, outstandingInvoices, overdueCount,
      activeEmployees, onLeave,
      activeProjects, overdueTasksCount,
      recentExpenses,
    ] = await Promise.all([
      prisma.lead.count({ where: { companyId: cid } }),
      prisma.lead.count({ where: { companyId: cid, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.lead.count({ where: { companyId: cid, status: 'converted', updatedAt: { gte: thirtyDaysAgo } } }),
      prisma.deal.count({ where: { companyId: cid, status: { in: ['open', 'negotiation'] } } }),
      prisma.deal.count({ where: { companyId: cid, status: 'won', updatedAt: { gte: thirtyDaysAgo } } }),
      prisma.deal.aggregate({ where: { companyId: cid, status: { in: ['open', 'negotiation'] } }, _sum: { value: true } }),
      prisma.contact.count({ where: { companyId: cid } }).catch(() => 0),
      prisma.ticket.count({ where: { companyId: cid, status: { in: ['open', 'pending'] } } }),
      prisma.ticket.count({ where: { companyId: cid, status: { in: ['open', 'pending'] }, priority: 'urgent' } }),
      prisma.ticket.count({ where: { companyId: cid, status: 'resolved', resolvedAt: { gte: thirtyDaysAgo } } }).catch(() => 0),
      prisma.invoice.aggregate({ where: { companyId: cid, status: 'paid', paidAt: { gte: thirtyDaysAgo } }, _sum: { total: true } }),
      prisma.invoice.aggregate({ where: { companyId: cid, status: { in: ['sent', 'overdue', 'draft'] } }, _sum: { total: true } }),
      prisma.invoice.count({ where: { companyId: cid, status: { in: ['sent', 'overdue'] }, dueDate: { lt: now } } }),
      prisma.employee.count({ where: { companyId: cid, status: 'active' } }).catch(() => 0),
      prisma.leaveRequest.count({ where: { companyId: cid, status: 'approved', startDate: { lte: now }, endDate: { gte: now } } }).catch(() => 0),
      prisma.project.count({ where: { companyId: cid, status: { in: ['active', 'in_progress'] } } }).catch(() => 0),
      prisma.task.count({ where: { companyId: cid, status: { not: 'done' }, dueDate: { lt: now } } }).catch(() => 0),
      prisma.expense.aggregate({ where: { companyId: cid, createdAt: { gte: thirtyDaysAgo } }, _sum: { amount: true } }).catch(() => ({ _sum: { amount: 0 } })),
    ]);

    const rev = Number(revenue30._sum.total || 0);
    const pipeline = Number(dealValue._sum.value || 0);
    const outstanding = Number(outstandingInvoices._sum.total || 0);
    const expenses = Number(recentExpenses._sum?.amount || 0);
    const convRate = newLeads30 > 0 ? ((convertedLeads30 / newLeads30) * 100).toFixed(1) : '0';

    const businessContext = `
LIVE BUSINESS DATA as of ${now.toDateString()}:

COMPANY: ${co?.name || 'Your Company'}

REVENUE & FINANCE:
- Revenue (last 30 days): $${rev.toLocaleString()}
- Expenses (last 30 days): $${expenses.toLocaleString()}
- Net profit estimate: $${(rev - expenses).toLocaleString()}
- Outstanding invoices: $${outstanding.toLocaleString()}
- Overdue invoices: ${overdueCount}

CRM:
- Total leads: ${totalLeads} | New (30d): ${newLeads30} | Converted (30d): ${convertedLeads30}
- Lead conversion rate: ${convRate}%
- Total contacts: ${contacts}
- Open deals: ${openDeals} worth $${pipeline.toLocaleString()}
- Won deals (30d): ${wonDeals30}

SUPPORT / HELPDESK:
- Open tickets: ${openTickets} (${urgentTickets} urgent)
- Resolved (30d): ${resolvedTickets30}

PROJECTS:
- Active projects: ${activeProjects}
- Overdue tasks: ${overdueTasksCount}

HR:
- Active employees: ${activeEmployees}
- Currently on leave: ${onLeave}
`.trim();

    const systemPrompt = `You are the AI Brain for ${co?.name || 'this business'} — a senior business advisor with real-time access to every module: CRM, finance, HR, projects, helpdesk, and more.

${businessContext}

Your job: answer questions, give strategic advice, identify risks, and surface opportunities — all grounded in the live data above.
- Be direct, specific, and data-driven. Reference real numbers from the context.
- When asked for advice, give prioritized, actionable recommendations.
- Keep responses concise but complete. Use bullet points for lists. No fluff.
- Today is ${now.toDateString()}.

IMPORTANT: End every response with this exact block on a new line (no extra text after it):
FOLLOWUPS:["short follow-up question 1","short follow-up question 2","short follow-up question 3"]
Each question must be under 10 words. Make them specific to what you just answered.`;

    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message },
    ];

    const result = await callAI({
      messages,
      system: systemPrompt,
      companyAnthropicKey: co?.anthropicKey,
      companyOpenaiKey: co?.openaiKey,
      companyProvider: co?.aiProvider,
      maxTokens: 1600,
      logCtx: { companyId: cid, module: 'brain-chat' },
    });

    // Split answer from follow-up suggestions
    let answer = result.text;
    let followUps = [];
    const fuMatch = result.text.match(/FOLLOWUPS:\[([^\]]+)\]\s*$/);
    if (fuMatch) {
      try {
        followUps = JSON.parse('[' + fuMatch[1] + ']');
      } catch {}
      answer = result.text.slice(0, result.text.lastIndexOf('FOLLOWUPS:')).trimEnd();
    }

    return success(res, {
      message: answer,
      followUps,
      model: result.model,
      provider: result.provider,
      context: {
        revenue30: rev, pipeline, openDeals, openTickets, activeEmployees, overdueCount,
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /ai/usage-stats ──────────────────────────────────────────────────────
router.get('/usage-stats', async (req, res, next) => {
  try {
    const { period = '30' } = req.query;
    const days = Math.min(Number(period) || 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const cid = req.companyId;

    // Check if ai_usage_logs table exists (migration may not have run yet).
    // Only suppress 42P01 (undefined_table) — all other errors (conn failure,
    // permission denied, etc.) should propagate as real errors.
    try {
      await prisma.$queryRaw`SELECT 1 FROM ai_usage_logs LIMIT 1`;
    } catch (tableErr) {
      if (tableErr.code !== '42P01' && !tableErr.message?.includes('does not exist')) {
        throw tableErr;
      }
      return success(res, {
        period: days, migrationRequired: true,
        totals: { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
        byModel: [], byModule: [], daily: [],
      });
    }

    const [logs, byModel, byModule, daily] = await Promise.all([
      // Aggregate totals
      prisma.aiUsageLog.aggregate({
        where: { companyId: cid, createdAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
        _count: { id: true },
      }),
      // By model
      prisma.aiUsageLog.groupBy({
        by: ['model', 'provider'],
        where: { companyId: cid, createdAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
        _count: { id: true },
        orderBy: { _sum: { costUsd: 'desc' } },
      }),
      // By module/feature
      prisma.aiUsageLog.groupBy({
        by: ['module'],
        where: { companyId: cid, createdAt: { gte: since } },
        _sum: { inputTokens: true, outputTokens: true, costUsd: true },
        _count: { id: true },
        orderBy: { _sum: { costUsd: 'desc' } },
      }),
      // Daily breakdown (raw logs, grouped in JS for flexibility)
      prisma.aiUsageLog.findMany({
        where: { companyId: cid, createdAt: { gte: since } },
        select: { createdAt: true, costUsd: true, inputTokens: true, outputTokens: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Group daily into date buckets
    const dailyMap = {};
    for (const log of daily) {
      const date = log.createdAt.toISOString().slice(0, 10);
      if (!dailyMap[date]) dailyMap[date] = { date, cost: 0, inputTokens: 0, outputTokens: 0, requests: 0 };
      dailyMap[date].cost += Number(log.costUsd);
      dailyMap[date].inputTokens += log.inputTokens;
      dailyMap[date].outputTokens += log.outputTokens;
      dailyMap[date].requests += 1;
    }
    const dailyArr = Object.values(dailyMap).map(d => ({ ...d, cost: +d.cost.toFixed(6) }));

    return success(res, {
      period: days,
      totals: {
        requests: logs._count.id || 0,
        inputTokens: logs._sum.inputTokens || 0,
        outputTokens: logs._sum.outputTokens || 0,
        totalTokens: (logs._sum.inputTokens || 0) + (logs._sum.outputTokens || 0),
        costUsd: +(Number(logs._sum.costUsd || 0).toFixed(6)),
      },
      byModel: byModel.map(m => ({
        model: m.model,
        provider: m.provider,
        requests: m._count.id,
        inputTokens: m._sum.inputTokens || 0,
        outputTokens: m._sum.outputTokens || 0,
        costUsd: +(Number(m._sum.costUsd || 0).toFixed(6)),
      })),
      byModule: byModule.map(m => ({
        module: m.module,
        requests: m._count.id,
        inputTokens: m._sum.inputTokens || 0,
        outputTokens: m._sum.outputTokens || 0,
        costUsd: +(Number(m._sum.costUsd || 0).toFixed(6)),
      })),
      daily: dailyArr,
    });
  } catch (err) { next(err); }
});

module.exports = router;
