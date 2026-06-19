const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Plans
  const plans = await Promise.all([
    prisma.plan.upsert({
      where: { name: 'Starter' },
      update: {},
      create: {
        name: 'Starter',
        price: 0,
        maxUsers: 5,
        maxStorage: 5,
        trialDays: 14,
        features: { crm: true, projects: true, helpdesk: true },
      },
    }),
    prisma.plan.upsert({
      where: { name: 'Professional' },
      update: {},
      create: {
        name: 'Professional',
        price: 49,
        yearlyPrice: 490,
        maxUsers: 25,
        maxStorage: 50,
        trialDays: 14,
        features: { crm: true, projects: true, helpdesk: true, hr: true, finance: true, ai: true, whatsapp: true, email: true },
      },
    }),
    prisma.plan.upsert({
      where: { name: 'Enterprise' },
      update: {},
      create: {
        name: 'Enterprise',
        price: 149,
        yearlyPrice: 1490,
        maxUsers: 100,
        maxStorage: 200,
        trialDays: 30,
        features: { all: true },
      },
    }),
  ]);
  console.log(`✅ Plans: ${plans.length}`);

  // Super Admin User
  const superAdminPassword = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD || 'Admin@1234', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: process.env.SUPER_ADMIN_EMAIL || 'admin@businessos.ai' },
    update: {},
    create: {
      email: process.env.SUPER_ADMIN_EMAIL || 'admin@businessos.ai',
      password: superAdminPassword,
      firstName: 'Super',
      lastName: 'Admin',
      isSuperAdmin: true,
      isEmailVerified: true,
      isActive: true,
    },
  });
  console.log(`✅ Super Admin: ${superAdmin.email}`);

  // Demo Company
  const demoCompany = await prisma.company.upsert({
    where: { slug: 'demo-company' },
    update: {},
    create: {
      name: 'Demo Company',
      slug: 'demo-company',
      email: 'demo@businessos.ai',
      phone: '+1-555-0100',
      website: 'https://demo.businessos.ai',
      industry: 'Technology',
      size: '11-50',
      primaryColor: '#6366f1',
      country: 'US',
      timezone: 'America/New_York',
      currency: 'USD',
    },
  });

  // Company subscription
  await prisma.subscription.upsert({
    where: { id: 'demo-sub' },
    update: {},
    create: {
      id: 'demo-sub',
      companyId: demoCompany.id,
      planId: plans[1].id, // Professional
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      amount: 49,
    },
  });

  // Roles for demo company
  const adminRole = await prisma.role.upsert({
    where: { slug_companyId: { slug: 'company-admin', companyId: demoCompany.id } },
    update: {},
    create: {
      name: 'Company Admin',
      slug: 'company-admin',
      companyId: demoCompany.id,
      isSystem: true,
      permissions: ['crm.*', 'projects.*', 'hr.*', 'finance.*', 'helpdesk.*', 'knowledge.*', 'documents.*', 'ai.*', 'workflow.*', 'appointments.*', 'whatsapp.*', 'email.*', 'analytics.*', 'settings.*', 'users.*', 'roles.*'],
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { slug_companyId: { slug: 'manager', companyId: demoCompany.id } },
    update: {},
    create: {
      name: 'Manager',
      slug: 'manager',
      companyId: demoCompany.id,
      permissions: ['crm.*', 'projects.*', 'tasks.*', 'helpdesk.*'],
    },
  });

  const salesRole = await prisma.role.upsert({
    where: { slug_companyId: { slug: 'sales', companyId: demoCompany.id } },
    update: {},
    create: {
      name: 'Sales',
      slug: 'sales',
      companyId: demoCompany.id,
      permissions: ['crm.leads.*', 'crm.contacts.*', 'crm.deals.*', 'tasks.*'],
    },
  });

  const supportRole = await prisma.role.upsert({
    where: { slug_companyId: { slug: 'support', companyId: demoCompany.id } },
    update: {},
    create: {
      name: 'Support',
      slug: 'support',
      companyId: demoCompany.id,
      permissions: ['helpdesk.*', 'knowledge.*'],
    },
  });

  console.log(`✅ Roles created`);

  // Demo users
  const demoPassword = await bcrypt.hash('Demo@1234', 12);

  const demoAdmin = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      email: 'admin@demo.com',
      password: demoPassword,
      firstName: 'John',
      lastName: 'Smith',
      companyId: demoCompany.id,
      isEmailVerified: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: demoAdmin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: demoAdmin.id, roleId: adminRole.id },
  });

  const salesUser = await prisma.user.upsert({
    where: { email: 'sales@demo.com' },
    update: {},
    create: {
      email: 'sales@demo.com',
      password: demoPassword,
      firstName: 'Sarah',
      lastName: 'Johnson',
      companyId: demoCompany.id,
      isEmailVerified: true,
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: salesUser.id, roleId: salesRole.id } },
    update: {},
    create: { userId: salesUser.id, roleId: salesRole.id },
  });

  console.log(`✅ Demo users created`);

  // Demo leads
  const leadData = [
    { firstName: 'Alice', lastName: 'Brown', email: 'alice@techcorp.com', phone: '+1-555-1001', company: 'TechCorp', source: 'website', status: 'qualified', score: 85 },
    { firstName: 'Bob', lastName: 'Wilson', email: 'bob@startupxyz.com', phone: '+1-555-1002', company: 'StartupXYZ', source: 'referral', status: 'contacted', score: 65 },
    { firstName: 'Carol', lastName: 'Davis', email: 'carol@enterprise.com', phone: '+1-555-1003', company: 'Enterprise Inc', source: 'social', status: 'new', score: 40 },
    { firstName: 'David', lastName: 'Miller', email: 'david@solutions.com', phone: '+1-555-1004', company: 'Solutions LLC', source: 'email', status: 'qualified', score: 90 },
    { firstName: 'Emma', lastName: 'Garcia', email: 'emma@consulting.com', phone: '+1-555-1005', company: 'Consulting Co', source: 'whatsapp', status: 'new', score: 30 },
  ];

  for (const lead of leadData) {
    await prisma.lead.create({ data: { ...lead, companyId: demoCompany.id } }).catch(() => {});
  }
  console.log(`✅ Demo leads created`);

  // Demo pipeline
  const pipeline = await prisma.pipeline.upsert({
    where: { id: 'demo-pipeline' },
    update: {},
    create: {
      id: 'demo-pipeline',
      name: 'Sales Pipeline',
      companyId: demoCompany.id,
      isDefault: true,
      stages: {
        create: [
          { name: 'Prospecting', order: 0, probability: 10, color: '#94a3b8' },
          { name: 'Qualification', order: 1, probability: 25, color: '#6366f1' },
          { name: 'Proposal', order: 2, probability: 50, color: '#8b5cf6' },
          { name: 'Negotiation', order: 3, probability: 75, color: '#f59e0b' },
          { name: 'Closed Won', order: 4, probability: 100, color: '#10b981' },
        ],
      },
    },
    include: { stages: true },
  });

  // Demo department
  const dept = await prisma.department.upsert({
    where: { id: 'demo-dept' },
    update: {},
    create: { id: 'demo-dept', name: 'Engineering', companyId: demoCompany.id },
  });

  // Demo ticket categories
  await Promise.all([
    prisma.ticketCategory.create({ data: { companyId: demoCompany.id, name: 'Technical', color: '#6366f1' } }).catch(() => {}),
    prisma.ticketCategory.create({ data: { companyId: demoCompany.id, name: 'Billing', color: '#f59e0b' } }).catch(() => {}),
    prisma.ticketCategory.create({ data: { companyId: demoCompany.id, name: 'General', color: '#10b981' } }).catch(() => {}),
  ]);

  // Demo leave types
  await Promise.all([
    prisma.leaveType.create({ data: { companyId: demoCompany.id, name: 'Annual Leave', daysAllowed: 21, isPaid: true } }).catch(() => {}),
    prisma.leaveType.create({ data: { companyId: demoCompany.id, name: 'Sick Leave', daysAllowed: 10, isPaid: true } }).catch(() => {}),
    prisma.leaveType.create({ data: { companyId: demoCompany.id, name: 'Unpaid Leave', daysAllowed: 30, isPaid: false } }).catch(() => {}),
  ]);

  // Demo knowledge article
  await prisma.knowledgeArticle.create({
    data: {
      companyId: demoCompany.id,
      title: 'Getting Started with BusinessOS AI',
      slug: 'getting-started-businessos-ai',
      content: `# Getting Started with BusinessOS AI\n\nWelcome to BusinessOS AI, your all-in-one business platform.\n\n## Key Features\n\n- **CRM**: Manage leads, contacts, and deals\n- **HR Management**: Employee records, attendance, payroll\n- **Project Management**: Tasks, milestones, kanban boards\n- **Finance**: Invoices, expenses, financial reports\n- **AI Assistant**: Get intelligent help across all modules\n\n## Quick Start\n\n1. Set up your company profile in Settings\n2. Invite your team members\n3. Import your existing data\n4. Configure your AI assistant\n5. Start using the dashboard`,
      type: 'article',
      status: 'published',
      isPublic: true,
      publishedAt: new Date(),
      authorId: demoAdmin.id,
    },
  }).catch(() => {});

  console.log(`✅ Seed data complete!`);
  console.log('\n📋 Login Credentials:');
  console.log('  Super Admin: admin@businessos.ai / Admin@1234');
  console.log('  Demo Admin:  admin@demo.com / Demo@1234');
  console.log('  Demo Sales:  sales@demo.com / Demo@1234');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
