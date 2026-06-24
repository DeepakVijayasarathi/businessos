const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const prisma = require('../../config/prisma');
const { authenticate, sameCompany } = require('../../middleware/auth');
const { success, created, error, notFound } = require('../../utils/response');
const { decrypt, generateNumber } = require('../../utils/helpers');
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
        name: { type: 'string', description: 'Deal name or title' },
        value: { type: 'number', description: 'Estimated deal value in USD' },
        probability: { type: 'number', description: 'Win probability 0-100' },
        notes: { type: 'string' },
      },
      required: ['name'],
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
          name: input.name,
          value: input.value || null,
          probability: input.probability || 50,
          notes: input.notes || null,
          pipelineId: pipeline.id,
          stageId: pipeline.stages[0].id,
          companyId: cid,
          status: 'open',
        },
      });
      return { success: true, id: deal.id, message: `Deal created: ${deal.name}` };
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
          ? prisma.deal.findMany({ where: { companyId: cid, name: { contains: q, mode } }, take: 4, select: { id: true, name: true, value: true, status: true } })
          : Promise.resolve([]),
      ]);
      return { leads, contacts, deals: deals.map(d => ({ ...d, value: d.value ? Number(d.value) : null })) };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// POST /ai/agent — Agentic AI with tool use
router.post('/agent', async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;
    if (!message?.trim()) return error(res, 'Message is required', 400);

    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: { name: true, anthropicKey: true, openaiKey: true, aiProvider: true },
    });

    const rawKey = (company?.anthropicKey ? decrypt(company.anthropicKey) : null) || config.ai.anthropicKey;
    if (!rawKey) return error(res, 'Anthropic API key not configured. Add it in Settings → AI Config.', 400);

    const anthropic = new Anthropic({ apiKey: rawKey });
    const today = new Date().toISOString().slice(0, 10);

    const systemPrompt = `You are an AI business assistant for ${company?.name || 'this company'}. You have tools to create and query data across CRM, Finance, Helpdesk, Projects, and Marketing.

Be concise and action-oriented. When asked to create something, call the tool immediately — don't ask for confirmation unless critical info is missing. After each action, briefly confirm what was done. Format lists with bullet points. Today: ${today}.`;

    const messages = [...history, { role: 'user', content: message }];
    const actions = [];

    let response = await anthropic.messages.create({
      model: config.ai.claudeModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      tools: AGENT_TOOLS,
    });

    let iterations = 0;
    while (response.stop_reason === 'tool_use' && iterations < 6) {
      iterations++;
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await executeAgentTool(block.name, block.input, req);
          actions.push({ tool: block.name, input: block.input, result });
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        }
      }

      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await anthropic.messages.create({
        model: config.ai.claudeModel,
        max_tokens: 2048,
        system: systemPrompt,
        messages,
        tools: AGENT_TOOLS,
      });
    }

    const assistantText = response.content.find(b => b.type === 'text')?.text || 'Done.';

    // Build slim history for next turn (keep last 10 turns max)
    const nextHistory = [
      ...history,
      { role: 'user', content: message },
      { role: 'assistant', content: assistantText },
    ].slice(-20);

    return success(res, { message: assistantText, actions, history: nextHistory });
  } catch (err) { next(err); }
});

module.exports = router;
