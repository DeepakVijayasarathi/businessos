/**
 * Test data factories — canonical shapes used across all test files.
 * All IDs are stable strings so tests can make precise assertions.
 */

const COMPANY_ID = 'test-company-id';
const USER_ID = 'test-user-id';
const ALT_COMPANY_ID = 'other-company-id';

const makeCompany = (overrides = {}) => ({
  id: COMPANY_ID,
  name: 'Test Corp',
  email: 'admin@testcorp.com',
  smtpHost: null,
  smtpUser: null,
  whatsappApiKey: null,
  whatsappPhone: null,
  whatsappProvider: null,
  anthropicKey: null,
  openaiKey: null,
  aiProvider: 'claude',
  ...overrides,
});

const makeUser = (overrides = {}) => ({
  id: USER_ID,
  firstName: 'Test',
  lastName: 'User',
  email: 'test@testcorp.com',
  companyId: COMPANY_ID,
  isActive: true,
  isSuperAdmin: false,
  roles: [],
  preferences: {},
  ...overrides,
});

const makeLead = (overrides = {}) => ({
  id: 'lead-id-1',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '+1-555-0001',
  company: 'ACME Ltd',
  jobTitle: 'CTO',
  source: 'website',
  status: 'new',
  score: 0,
  companyId: COMPANY_ID,
  activities: [],
  tasks: [],
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeContact = (overrides = {}) => ({
  id: 'contact-id-1',
  firstName: 'Bob',
  lastName: 'Smith',
  email: 'bob@example.com',
  phone: '+1-555-0002',
  companyId: COMPANY_ID,
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeTicket = (overrides = {}) => ({
  id: 'ticket-id-1',
  ticketNo: 'TKT-00001',
  subject: 'Cannot log in',
  description: 'Getting 401 on every request',
  status: 'open',
  priority: 'high',
  companyId: COMPANY_ID,
  reporterId: USER_ID,
  _count: { comments: 0 },
  comments: [],
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeInvoice = (overrides = {}) => ({
  id: 'invoice-id-1',
  invoiceNo: 'INV-00001',
  clientName: 'ACME Ltd',
  clientEmail: 'billing@acme.com',
  total: 2500,
  subtotal: 2500,
  taxAmount: 0,
  discountAmount: 0,
  status: 'draft',
  companyId: COMPANY_ID,
  items: [{ description: 'Consulting', quantity: 10, unitPrice: 250, total: 2500 }],
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeProject = (overrides = {}) => ({
  id: 'project-id-1',
  name: 'Website Redesign',
  status: 'active',
  priority: 'high',
  progress: 0,
  companyId: COMPANY_ID,
  milestones: [],
  members: [],
  _count: { tasks: 5 },
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeTask = (overrides = {}) => ({
  id: 'task-id-1',
  title: 'Design mockups',
  status: 'todo',
  priority: 'medium',
  companyId: COMPANY_ID,
  projectId: 'project-id-1',
  assignee: null,
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeEmployee = (overrides = {}) => ({
  id: 'employee-id-1',
  employeeCode: 'EMP001',
  jobTitle: 'Senior Engineer',
  status: 'active',
  salary: 5000,
  companyId: COMPANY_ID,
  userId: USER_ID,
  user: { id: USER_ID, firstName: 'Test', lastName: 'User', email: 'test@testcorp.com', avatar: null },
  department: { id: 'dept-id-1', name: 'Engineering' },
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeWorkflow = (overrides = {}) => ({
  id: 'workflow-id-1',
  name: 'New Lead Welcome',
  isActive: true,
  nodes: [],
  companyId: COMPANY_ID,
  runCount: 0,
  _count: { executions: 0 },
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeAppointment = (overrides = {}) => ({
  id: 'appointment-id-1',
  title: 'Appointment - Jane Doe',
  status: 'scheduled',
  startAt: new Date('2026-07-01T10:00:00Z'),
  endAt: new Date('2026-07-01T11:00:00Z'),
  companyId: COMPANY_ID,
  service: null,
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeDocument = (overrides = {}) => ({
  id: 'document-id-1',
  name: 'Q1-Report.pdf',
  originalName: 'Q1-Report.pdf',
  mimeType: 'application/pdf',
  size: 204800,
  path: './uploads-test/some-uuid.pdf',
  url: '/uploads/some-uuid.pdf',
  companyId: COMPANY_ID,
  folderId: null,
  tags: [],
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeDocumentFolder = (overrides = {}) => ({
  id: 'folder-id-1',
  name: 'Finance',
  companyId: COMPANY_ID,
  parentId: null,
  _count: { documents: 0, children: 0 },
  ...overrides,
});

const makeWhatsAppTemplate = (overrides = {}) => ({
  id: 'wa-template-id-1',
  name: 'welcome_msg',
  language: 'en',
  content: 'Hello {{1}}, welcome to {{2}}!',
  companyId: COMPANY_ID,
  ...overrides,
});

const makeWhatsAppCampaign = (overrides = {}) => ({
  id: 'wa-campaign-id-1',
  name: 'Q3 Outreach',
  templateId: 'wa-template-id-1',
  audience: ['+15550001', '+15550002'],
  status: 'draft',
  template: makeWhatsAppTemplate(),
  companyId: COMPANY_ID,
  ...overrides,
});

const makeEmailTemplate = (overrides = {}) => ({
  id: 'email-tpl-id-1',
  name: 'Welcome Email',
  subject: 'Welcome to {{company}}!',
  body: '<h1>Hello {{name}}</h1>',
  companyId: COMPANY_ID,
  ...overrides,
});

const makeEmailCampaign = (overrides = {}) => ({
  id: 'email-campaign-id-1',
  name: 'July Newsletter',
  templateId: 'email-tpl-id-1',
  audience: ['a@test.com', 'b@test.com'],
  subject: 'July Newsletter',
  fromName: 'Test Corp',
  fromEmail: 'news@testcorp.com',
  status: 'draft',
  template: makeEmailTemplate(),
  companyId: COMPANY_ID,
  ...overrides,
});

const makeRole = (overrides = {}) => ({
  id: 'role-id-1',
  name: 'Sales Manager',
  slug: 'sales-manager',
  permissions: ['crm.*', 'leads.*'],
  isSystem: false,
  companyId: COMPANY_ID,
  _count: { userRoles: 2 },
  ...overrides,
});

const makeApiKey = (overrides = {}) => ({
  id: 'api-key-id-1',
  name: 'Zapier Integration',
  key: 'bos_abc123def456ghi789jkl012mno345pq',
  permissions: ['leads.read', 'contacts.read'],
  isActive: true,
  lastUsedAt: null,
  expiresAt: null,
  companyId: COMPANY_ID,
  createdAt: new Date('2026-01-01'),
  ...overrides,
});

const makeKbArticle = (overrides = {}) => ({
  id: 'kb-article-id-1',
  title: 'How to reset your password',
  slug: 'how-to-reset-your-password-1704067200000',
  content: '## Steps\n1. Click Forgot Password\n2. Enter your email',
  status: 'published',
  views: 42,
  helpful: 10,
  notHelpful: 1,
  companyId: COMPANY_ID,
  authorId: USER_ID,
  category: { id: 'cat-1', name: 'Account' },
  version: 1,
  ...overrides,
});

const makeKbCategory = (overrides = {}) => ({
  id: 'kb-cat-id-1',
  name: 'Account',
  slug: 'account',
  companyId: COMPANY_ID,
  parentId: null,
  order: 0,
  children: [],
  _count: { articles: 5 },
  ...overrides,
});

const makeDeal = (overrides = {}) => ({
  id: 'deal-id-1',
  name: 'ACME Enterprise Deal',
  value: 50000,
  status: 'open',
  stageId: 'stage-id-1',
  companyId: COMPANY_ID,
  ...overrides,
});

const makeAiConversation = (overrides = {}) => ({
  id: 'conv-id-1',
  sessionId: 'session-abc123',
  type: 'support',
  companyId: COMPANY_ID,
  userId: USER_ID,
  messages: [],
  ...overrides,
});

const makeAiAgent = (overrides = {}) => ({
  id: 'agent-id-1',
  name: 'Support Bot',
  systemPrompt: 'You are a helpful support agent.',
  companyId: COMPANY_ID,
  ...overrides,
});

/** Builds a standard mock auth middleware that injects user/company context */
const authMiddlewareMock = (overrides = {}) => ({
  authenticate: (req, res, next) => {
    req.userId = overrides.userId || USER_ID;
    req.companyId = overrides.companyId || COMPANY_ID;
    req.user = makeUser({ id: req.userId, companyId: req.companyId });
    req.permissions = new Set(['*']);
    next();
  },
  sameCompany: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  optionalAuth: (req, res, next) => {
    req.userId = null;
    req.companyId = null;
    next();
  },
});

/** Returns a 401 for all requests — for testing unauthenticated access */
const unauthMiddlewareMock = () => ({
  authenticate: (req, res, next) => res.status(401).json({ success: false, message: 'No token provided' }),
  sameCompany: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => res.status(403).json({ success: false, message: 'Forbidden' }),
  optionalAuth: (req, res, next) => next(),
});

module.exports = {
  COMPANY_ID,
  USER_ID,
  ALT_COMPANY_ID,
  makeCompany,
  makeUser,
  makeLead,
  makeContact,
  makeTicket,
  makeInvoice,
  makeProject,
  makeTask,
  makeEmployee,
  makeWorkflow,
  makeAppointment,
  makeDocument,
  makeDocumentFolder,
  makeWhatsAppTemplate,
  makeWhatsAppCampaign,
  makeEmailTemplate,
  makeEmailCampaign,
  makeRole,
  makeApiKey,
  makeKbArticle,
  makeKbCategory,
  makeDeal,
  makeAiConversation,
  makeAiAgent,
  authMiddlewareMock,
  unauthMiddlewareMock,
};
