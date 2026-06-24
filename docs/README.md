# BusinessOS AI — Production Documentation

## Overview

BusinessOS AI is an all-in-one AI-powered SaaS platform designed to replace multiple business tools with a single unified system. It provides CRM, HR Management, Project Management, Finance, Helpdesk, Knowledge Base, Document Management, AI Automation, Workflow Engine, WhatsApp Automation, Email Marketing, Appointment Booking, Analytics, and more — all in a multi-tenant architecture. Test

---

## Architecture

```
businessos/
├── backend/              # Node.js + Express + Prisma API
│   ├── src/
│   │   ├── config/       # App, DB, Logger config
│   │   ├── middleware/   # Auth, RBAC, audit logs, validation
│   │   ├── modules/      # Feature modules (auth, crm, hr, finance, ai...)
│   │   ├── services/     # Email, storage services
│   │   ├── utils/        # Helpers, response formatters
│   │   └── server.js     # Express app entry point
│   ├── prisma/           # Schema + migrations + seed
│   └── tests/            # Unit + integration tests
│
├── frontend/             # Next.js 14 + TailwindCSS + ShadCN
│   ├── src/
│   │   ├── app/          # App router pages
│   │   ├── components/   # Reusable components
│   │   ├── lib/          # API client, utilities
│   │   └── store/        # Zustand state management
│
├── nginx/                # Nginx reverse proxy config
├── docker-compose.yml    # Full stack deployment
└── docs/                 # Documentation
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TailwindCSS, ShadCN UI |
| State Management | Zustand, TanStack Query |
| Backend | Node.js 20, Express 4 |
| Database | PostgreSQL 16, Prisma ORM |
| Cache/Queue | Redis 7, Bull |
| Authentication | JWT + Refresh Tokens, RBAC |
| AI | Claude (Anthropic) |
| Real-time | Socket.IO |
| Storage | Local / S3-compatible |
| Email | Nodemailer (SMTP) |
| WhatsApp | Meta WhatsApp Business API |
| Payments | Stripe |
| Deployment | Docker, Nginx |

---

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Docker & Docker Compose (for containerized deployment)

### Development Setup

```bash
# 1. Clone the repo
git clone https://github.com/yourorg/businessos.git
cd businessos

# 2. Backend setup
cd backend
cp .env.example .env
# Edit .env with your settings
npm install
npx prisma generate
npx prisma migrate dev --name init
node prisma/seed.js

# Start backend
npm run dev

# 3. Frontend setup (new terminal)
cd ../frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:5000
npm install
npm run dev
```

### Docker Deployment

```bash
# Copy and configure environment
cp backend/.env.example backend/.env
# Edit backend/.env

# Build and start all services
docker-compose up -d --build

# Run migrations + seed (first time)
docker exec bos-backend npx prisma migrate deploy
docker exec bos-backend node prisma/seed.js
```

---

## Environment Variables

### Backend `.env`

```env
# Core
NODE_ENV=production
PORT=5000
APP_URL=https://app.yourdomain.com
API_URL=https://api.yourdomain.com

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/businessos_db

# JWT (minimum 32 chars each)
JWT_SECRET=your-super-secret-32-char-minimum
JWT_REFRESH_SECRET=your-refresh-secret-32-char-min

# Redis
REDIS_URL=redis://localhost:6379

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourdomain.com

# Stripe (for subscriptions)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Encryption
ENCRYPTION_KEY=32-char-random-encryption-key!!
```

### Frontend `.env.local`

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
```

---

## API Reference

Base URL: `https://api.yourdomain.com/api/v1`

### Authentication
```
POST /auth/register        — Create account
POST /auth/login           — Login
POST /auth/refresh-token   — Refresh access token
POST /auth/logout          — Logout
POST /auth/forgot-password — Request password reset
POST /auth/reset-password  — Reset password
GET  /auth/me              — Get current user
PUT  /auth/me              — Update profile
```

### CRM
```
GET/POST /crm/leads              — List/Create leads
GET/PUT/DELETE /crm/leads/:id    — Get/Update/Delete lead
POST /crm/leads/:id/convert      — Convert lead to contact
GET /crm/leads/stats             — Lead statistics

GET/POST /crm/contacts           — Contacts
GET/POST /crm/pipelines          — Pipelines
GET /crm/kanban/:pipelineId      — Kanban board
GET/POST /crm/deals              — Deals
PUT /crm/deals/:id/move          — Move deal stage
GET/POST /crm/activities         — Activity log
```

### HR
```
GET/POST /hr/employees           — Employees
GET/POST /hr/departments         — Departments
POST /hr/check-in                — Check in
POST /hr/check-out               — Check out
GET/POST /hr/leaves              — Leave requests
PUT /hr/leaves/:id/approve       — Approve leave
GET/POST /hr/payslips            — Payslips
POST /hr/payslips/generate       — Generate payroll
```

### Finance
```
GET/POST /finance/invoices       — Invoices
POST /finance/invoices/:id/send  — Send invoice
POST /finance/invoices/:id/mark-paid — Mark paid
GET/POST /finance/expenses       — Expenses
GET/POST /finance/income         — Income
GET /finance/reports/profit-loss — P&L report
```

### Projects
```
GET/POST /projects               — Projects
GET /projects/:id/kanban         — Kanban board
GET/POST /projects/tasks         — Tasks
GET/POST /projects/tasks/:id/comments — Comments
```

### AI
```
POST /ai/chat                    — AI chat
POST /ai/qualify-lead            — AI lead qualification
POST /ai/summarize               — Summarize content
POST /ai/reply-suggestion        — Suggest reply
POST /ai/email-draft             — Draft email
GET  /ai/conversations           — Conversation history
GET/POST/PUT/DELETE /ai/agents   — AI agent management
```

### More endpoints available for:
- `/helpdesk` — Tickets, comments, categories
- `/knowledge` — Articles, categories
- `/documents` — Upload, folders, download
- `/workflows` — Builder, executions, triggers
- `/appointments` — Booking, calendar, services
- `/whatsapp` — Templates, campaigns, messages
- `/email` — Templates, campaigns
- `/analytics` — Dashboard, revenue, CRM, HR, AI
- `/marketing` — Landing pages, forms, submissions
- `/notifications` — User notifications
- `/settings` — Company, roles, API keys
- `/admin` — Super admin: companies, plans, health

---

## User Roles

| Role | Access |
|------|--------|
| Super Admin | Full system access, multi-tenant management |
| Company Admin | Full company access, settings, billing |
| Manager | CRM, projects, tasks, helpdesk |
| Sales | Leads, contacts, deals |
| HR | Employees, attendance, payroll |
| Finance | Invoices, expenses, reports |
| Support | Helpdesk, knowledge base |
| Employee | Tasks, self-service HR |
| Client | Client portal (read-only) |

---

## Security

- **JWT + Refresh Tokens** — Short-lived access (15m) with 7-day refresh rotation
- **RBAC** — Granular permissions per role
- **Encryption** — Sensitive fields (API keys, SMTP passwords) encrypted with AES-256-GCM
- **Rate Limiting** — Global (100/15min) + stricter auth endpoints (20/15min)
- **SQL Injection** — Prevented by Prisma parameterized queries
- **XSS** — Helmet headers + input sanitization
- **CSRF** — Cookie SameSite=strict + token validation
- **Audit Logs** — Every write operation logged with user, IP, before/after

---

## CloudPanel Deployment

1. Create a new Node.js site in CloudPanel
2. Set up PostgreSQL database and Redis
3. Clone repo to `/home/cloudpanel/htdocs/yourdomain.com`
4. Configure environment variables
5. Run `npm install && npx prisma migrate deploy && node prisma/seed.js`
6. Configure PM2 for the backend: `pm2 start src/server.js --name bos-api`
7. Build frontend: `npm run build && pm2 start node_modules/.bin/next --name bos-web -- start`
8. Configure Nginx to proxy `/api/` to port 5000 and `/` to port 3000

---

## Default Credentials

After seeding:
- **Super Admin:** `admin@businessos.ai` / `Admin@1234`
- **Demo Admin:** `admin@demo.com` / `Demo@1234`
- **Demo Sales:** `sales@demo.com` / `Demo@1234`

⚠️ **Change all default passwords immediately in production!**

---

## Running Tests

```bash
cd backend

# Unit tests
npm run test:unit

# Integration tests (requires TEST_DATABASE_URL)
TEST_DATABASE_URL=postgresql://... npm run test:integration

# All tests with coverage
npm test
```
