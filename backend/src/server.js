require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const config = require('./config');
const logger = require('./config/logger');
const { errorHandler } = require('./middleware/errorHandler');
const prisma = require('./config/prisma');

// Validate required secrets at startup
const requiredEnv = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY', 'DATABASE_URL'];
const missingEnv = requiredEnv.filter(k => !process.env[k]);
if (missingEnv.length) {
  console.error(`FATAL: Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

// Reject the example placeholder values and anything under 32 chars — a
// misconfigured .env left at the .env.example defaults would otherwise boot
// fine with a known, guessable secret.
const PLACEHOLDER_SECRETS = new Set([
  'your-super-secret-jwt-key-min-32-chars',
  'your-refresh-token-secret-min-32-chars',
  '32-char-encryption-key-here-----',
]);
const weakSecrets = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'].filter(
  (k) => process.env[k].length < 32 || PLACEHOLDER_SECRETS.has(process.env[k])
);
if (weakSecrets.length) {
  console.error(`FATAL: ${weakSecrets.join(', ')} must be set to a unique value of at least 32 characters (not the .env.example placeholder).`);
  process.exit(1);
}

// Route modules
const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/users.routes');
const leadsRoutes = require('./modules/crm/leads/leads.routes');
const contactsRoutes = require('./modules/crm/contacts/contacts.routes');
const pipelineRoutes = require('./modules/crm/pipeline/pipeline.routes');
const crmActivitiesRoutes = require('./modules/crm/activities/activities.routes');
const projectsRoutes = require('./modules/projects/projects.routes');
const employeesRoutes = require('./modules/hr/employees/employees.routes');
const hrRoutes = require('./modules/hr/attendance/attendance.routes');
const financeRoutes = require('./modules/finance/finance.routes');
const paymentsRoutes = require('./modules/finance/payments.routes');
const helpdeskRoutes = require('./modules/helpdesk/helpdesk.routes');
const kbRoutes = require('./modules/knowledgebase/kb.routes');
const documentsRoutes = require('./modules/documents/documents.routes');
const aiRoutes = require('./modules/ai/ai.routes');
const { router: workflowRoutes } = require('./modules/workflow/workflow.routes');
const appointmentsRoutes = require('./modules/appointments/appointments.routes');
const whatsappRoutes = require('./modules/whatsapp/whatsapp.routes');
const emailRoutes = require('./modules/email/email.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const superadminRoutes = require('./modules/superadmin/superadmin.routes');
const marketingRoutes = require('./modules/marketing/marketing.routes');
const searchRoutes = require('./modules/search/search.routes');
const messagingRoutes = require('./modules/messaging/messaging.routes');
const activityRoutes = require('./modules/activity/activity.routes');

const app = express();
const server = http.createServer(app);

// ── CORS allowlist ─────────────────────────────────────────────
// Explicit CORS_ORIGINS env var takes priority; otherwise fall back to
// appUrl plus common local-dev origins. Includes a same-origin-IP variant
// of appUrl's port so deployments accessed via server IP (not "localhost")
// still pass.
const appUrlPort = (() => { try { return new URL(config.appUrl).port; } catch { return null; } })();
const allowedOrigins = config.corsOrigins || [
  config.appUrl,
  'http://localhost:3000',
  'http://localhost:3001',
  ...(appUrlPort ? [`http://localhost:${appUrlPort}`] : []),
];

function corsOriginCheck(origin, callback) {
  // Allow non-browser requests (curl, server-to-server, health checks) with no Origin header
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  logger.warn(`CORS blocked request from origin: ${origin}`);
  return callback(new Error('Not allowed by CORS'));
}

// ── Socket.IO for real-time ──────────────────────────────────
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('join-company', (companyId) => {
    socket.join(`company:${companyId}`);
  });

  socket.on('join-user', (userId) => {
    socket.join(`user:${userId}`);
  });

  socket.on('join-conversation', (conversationId) => {
    socket.join(`conv:${conversationId}`);
  });

  socket.on('leave-conversation', (conversationId) => {
    socket.leave(`conv:${conversationId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

app.set('io', io);

const notificationService = require('./services/notification.service');
notificationService.setIO(io);
app.set('notificationService', notificationService);

// ── Security & Middleware ────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: corsOriginCheck,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(hpp());
app.use(morgan('combined', { stream: { write: (msg) => logger.http(msg.trim()) } }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later' },
});
app.use('/api/', limiter);

// Auth endpoints get stricter limits
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts' },
});

// Static uploads — images/video render inline safely (they can't execute
// script), everything else (csv, txt, pdf, office docs, etc.) is forced to
// download rather than render in-browser, since express.static otherwise
// serves them with Content-Disposition: inline and no content sniffing
// protection beyond Helmet's nosniff header.
const INLINE_SAFE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp4', '.mp3']);
app.use('/uploads', (req, res, next) => {
  const ext = path.extname(req.path).toLowerCase();
  if (!INLINE_SAFE_EXTENSIONS.has(ext)) {
    res.setHeader('Content-Disposition', 'attachment');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(path.join(__dirname, '../uploads')));

// ── API Routes ────────────────────────────────────────────────
const v1 = '/api/v1';

// authLimiter only on login/register — refresh-token and logout must never be
// rate-limited, otherwise expired access tokens cause silent logouts when the
// refresh call itself gets a 429 and the client clears auth + redirects to /login
const authRouterWithLimiter = require('express').Router();
authRouterWithLimiter.use(['/login', '/register', '/forgot-password', '/reset-password'], authLimiter);
authRouterWithLimiter.use('/', authRoutes);
app.use(`${v1}/auth`, authRouterWithLimiter);
app.use(`${v1}/users`, userRoutes);
app.use(`${v1}/crm/leads`, leadsRoutes);
app.use(`${v1}/crm/contacts`, contactsRoutes);
app.use(`${v1}/crm/activities`, crmActivitiesRoutes);
app.use(`${v1}/crm`, pipelineRoutes);
app.use(`${v1}/projects`, projectsRoutes);
app.use(`${v1}/hr/employees`, employeesRoutes);
// Mounted at /hr/attendance (not bare /hr) to match what the frontend has
// always called for attendance/leave/payroll (e.g. /hr/attendance/check-in,
// /hr/attendance/leaves, /hr/attendance/payslips/generate) — this router was
// previously mounted at /hr, so every one of those requests 404'd silently.
app.use(`${v1}/hr/attendance`, hrRoutes);
app.use(`${v1}/finance`, financeRoutes);
app.use(`${v1}/finance/payments`, paymentsRoutes);
app.use(`${v1}/helpdesk`, helpdeskRoutes);
app.use(`${v1}/knowledgebase`, kbRoutes);
app.use(`${v1}/documents`, documentsRoutes);
app.use(`${v1}/ai`, aiRoutes);
app.use(`${v1}/workflows`, workflowRoutes);
app.use(`${v1}/appointments`, appointmentsRoutes);
app.use(`${v1}/whatsapp`, whatsappRoutes);
app.use(`${v1}/email`, emailRoutes);
app.use(`${v1}/analytics`, analyticsRoutes);
app.use(`${v1}/notifications`, notificationsRoutes);
app.use(`${v1}/settings`, settingsRoutes);
app.use(`${v1}/admin`, superadminRoutes);
app.use(`${v1}/marketing`, marketingRoutes);
app.use(`${v1}/search`, searchRoutes);
app.use(`${v1}/messaging`, messagingRoutes);
app.use(`${v1}/activity`, activityRoutes);

// WhatsApp webhook verification (GET)
app.get(`${v1}/whatsapp/webhook`, (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date() });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.url} not found` });
});

// Global error handler
app.use(errorHandler);

// ── Graceful Shutdown ─────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err);
});

// ── Start ─────────────────────────────────────────────────────
async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info('Database connected');

    server.listen(config.port, () => {
      logger.info(`BusinessOS API running on port ${config.port} [${config.env}]`);
    });

    const { startAppointmentReminderJob } = require('./jobs/appointmentReminders');
    startAppointmentReminderJob();

    const { startRecurringInvoiceJob } = require('./jobs/recurringInvoices');
    startRecurringInvoiceJob();
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();

module.exports = { app, server, io };
