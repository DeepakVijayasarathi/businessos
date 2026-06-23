const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://93.127.194.128:3000';
const SHOTS_DIR = 'E:\\businessos\\qa-screenshots';

const issues = [];
let shotIdx = 0;

async function shot(page, label) {
  const file = path.join(SHOTS_DIR, `${String(shotIdx++).padStart(3,'0')}_${label.replace(/[^a-z0-9]/gi,'_').toLowerCase()}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(()=>{});
  console.log(`  📸 ${label} → ${path.basename(file)}`);
  return file;
}

function flag(screen, msg) {
  issues.push({ screen, msg });
  console.log(`  ⚠️  BUG: [${screen}] ${msg}`);
}

async function waitReady(page, timeout = 8000) {
  try { await page.waitForLoadState('networkidle', { timeout }); } catch {}
}

async function login(page) {
  console.log('\n=== LOGIN ===');
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  await shot(page, 'login_initial');

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  const passInput  = page.locator('input[type="password"]').first();
  if (!(await emailInput.isVisible())) { flag('Login', 'Email input not visible'); return false; }

  await emailInput.fill('admin@demo.com');
  await passInput.fill('Demo@1234');
  await shot(page, 'login_filled');

  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(3000);
  await waitReady(page, 6000);
  await shot(page, 'login_result');

  if (page.url().includes('/login')) {
    flag('Login', 'Still on login page after submit');
    return false;
  }
  console.log('  ✅ Login OK →', page.url());
  return true;
}

async function go(page, name, url) {
  console.log(`\n=== ${name.toUpperCase()} ===`);
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  const body = await page.locator('body').innerText().catch(() => '');
  if (body.includes('Application error') || body.includes('client-side exception'))
    flag(name, 'Next.js Application error');
  if (body.match(/\b404\b/) && body.toLowerCase().includes('not found'))
    flag(name, '404 page');
  await shot(page, name + '_load');
}

async function openModal(page, name, trigger, formFields, submitText) {
  const btn = page.locator(`button:has-text("${trigger}"), a:has-text("${trigger}")`).first();
  if (!(await btn.isVisible().catch(() => false))) {
    flag(name, `Button "${trigger}" not found`); return;
  }
  await btn.click();
  await page.waitForTimeout(1200);
  await shot(page, `${name}_modal_open`);

  for (const [sel, val] of Object.entries(formFields || {})) {
    const el = page.locator(sel).first();
    if (await el.isVisible().catch(() => false)) {
      const tag = await el.evaluate(e => e.tagName.toLowerCase()).catch(() => 'input');
      if (tag === 'select') await el.selectOption({ index: 1 }).catch(() => {});
      else await el.fill(val).catch(() => {});
    }
  }

  const sub = page.locator(`button:has-text("${submitText || 'Save'}"), button[type="submit"]`).first();
  if (await sub.isVisible().catch(() => false)) {
    await sub.click();
    await page.waitForTimeout(2000);
    await shot(page, `${name}_modal_saved`);
  }

  const close = page.locator('button[aria-label="Close"], button:has-text("Cancel"), button:has-text("×")').first();
  if (await close.isVisible().catch(() => false)) await close.click();
  await page.waitForTimeout(500);
}

async function clickTab(page, tabText) {
  const tab = page.locator(`button:has-text("${tabText}"), [role="tab"]:has-text("${tabText}")`).first();
  if (await tab.isVisible().catch(() => false)) { await tab.click(); await page.waitForTimeout(800); }
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const jsErrors = [];
  page.on('pageerror', err => {
    const msg = err.message.slice(0, 150);
    jsErrors.push(msg);
    console.log(`  [js-error] ${msg}`);
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const t = msg.text();
      if (!t.includes('favicon') && !t.includes('ERR_') && !t.includes('net::')) {
        console.log(`  [console.error] ${t.slice(0, 120)}`);
      }
    }
  });

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  const loggedIn = await login(page);
  if (!loggedIn) {
    console.log('❌ Cannot log in — aborting');
    await browser.close();
    return;
  }

  // ── DASHBOARD HOME ────────────────────────────────────────────────────────
  await go(page, 'dashboard_home', '/dashboard');
  const cards = await page.locator('[class*="card"], [class*="stat"], [class*="metric"]').count();
  console.log(`  Dashboard cards: ${cards}`);
  if (cards === 0) flag('dashboard_home', 'No metric/stat cards rendered');

  // ── CRM CONTACTS ──────────────────────────────────────────────────────────
  await go(page, 'crm_contacts', '/dashboard/crm');
  await openModal(page, 'crm_contacts', 'Add Contact', {
    'input[placeholder*="name" i], input[name="name"]': 'QA Contact',
    'input[placeholder*="email" i], input[name="email"]': 'qa@contacttest.com',
    'input[placeholder*="phone" i], input[name="phone"]': '+10000000001',
  });

  // ── CRM PIPELINE ──────────────────────────────────────────────────────────
  await go(page, 'crm_pipeline', '/dashboard/crm/pipeline');
  await openModal(page, 'crm_pipeline', 'Add Deal', {
    'input[placeholder*="title" i], input[name="title"]': 'QA Deal',
    'input[placeholder*="value" i], input[name="value"]': '9999',
  });

  // ── CRM LEADS ─────────────────────────────────────────────────────────────
  await go(page, 'crm_leads', '/dashboard/crm/leads');
  await openModal(page, 'crm_leads', 'Add Lead', {
    'input[placeholder*="name" i], input[name="name"]': 'QA Lead',
    'input[placeholder*="email" i], input[name="email"]': 'qa@leadtest.com',
  });

  // ── CRM COMPANIES ─────────────────────────────────────────────────────────
  await go(page, 'crm_companies', '/dashboard/crm/companies');
  await openModal(page, 'crm_companies', 'Add Company', {
    'input[placeholder*="name" i], input[name="name"]': 'QA Company Ltd',
  });

  // ── HELPDESK ──────────────────────────────────────────────────────────────
  await go(page, 'helpdesk', '/dashboard/helpdesk');
  await openModal(page, 'helpdesk', 'New Ticket', {
    'input[placeholder*="title" i], input[placeholder*="subject" i], input[name="title"]': 'QA Ticket',
    'textarea[placeholder*="description" i], textarea[name="description"]': 'QA test description',
  });

  // ── KNOWLEDGEBASE ─────────────────────────────────────────────────────────
  await go(page, 'knowledgebase', '/dashboard/knowledgebase');
  await openModal(page, 'knowledgebase', 'New Article', {
    'input[placeholder*="title" i], input[name="title"]': 'QA Article',
  });

  // ── PROJECTS LIST ─────────────────────────────────────────────────────────
  await go(page, 'projects', '/dashboard/projects');
  await openModal(page, 'projects', 'New Project', {
    'input[placeholder*="name" i], input[placeholder*="project" i]': 'QA Project',
  });

  // ── FINANCE DASHBOARD ─────────────────────────────────────────────────────
  await go(page, 'finance', '/dashboard/finance');

  // ── INVOICES ──────────────────────────────────────────────────────────────
  await go(page, 'invoices', '/dashboard/finance/invoices');
  await openModal(page, 'invoices', 'New Invoice', {
    'input[placeholder*="client" i]': 'QA Client',
  });

  // ── INCOME ────────────────────────────────────────────────────────────────
  await go(page, 'income', '/dashboard/finance/income');
  await openModal(page, 'income', 'Add Income', {
    'input[name="title"], input[placeholder*="title" i]': 'QA Income',
    'input[name="amount"], input[placeholder*="amount" i]': '500',
    'input[type="date"]': '2026-06-23',
  });

  // ── EXPENSES ──────────────────────────────────────────────────────────────
  await go(page, 'expenses', '/dashboard/finance/expenses');
  await openModal(page, 'expenses', 'Add Expense', {
    'input[name="title"], input[placeholder*="title" i]': 'QA Expense',
    'input[name="amount"], input[placeholder*="amount" i]': '100',
    'input[type="date"]': '2026-06-23',
  });

  // ── HR EMPLOYEES ──────────────────────────────────────────────────────────
  await go(page, 'hr_employees', '/dashboard/hr');
  await openModal(page, 'hr_employees', 'Add Employee', {
    'input[placeholder*="name" i], input[name="name"]': 'QA Employee',
    'input[placeholder*="email" i], input[name="email"]': 'qaemployee@demo.com',
    'input[placeholder*="position" i], input[name="position"]': 'QA Tester',
    'input[placeholder*="department" i], input[name="department"]': 'QA',
  });

  // ── HR ATTENDANCE ─────────────────────────────────────────────────────────
  await go(page, 'hr_attendance', '/dashboard/hr/attendance');

  // ── HR PAYROLL ────────────────────────────────────────────────────────────
  await go(page, 'hr_payroll', '/dashboard/hr/payroll');

  // ── HR LEAVE ──────────────────────────────────────────────────────────────
  await go(page, 'hr_leave', '/dashboard/hr/leave');
  await openModal(page, 'hr_leave', 'Apply Leave', {
    'input[type="date"]': '2026-07-01',
  });

  // ── ANALYTICS ─────────────────────────────────────────────────────────────
  await go(page, 'analytics', '/dashboard/analytics');
  await page.waitForTimeout(2000);
  await shot(page, 'analytics_loaded');

  // ── AI INTELLIGENCE ───────────────────────────────────────────────────────
  await go(page, 'intelligence', '/dashboard/intelligence');
  await page.waitForTimeout(4000); // let queries settle
  await shot(page, 'intelligence_loaded');
  const intelBody = await page.locator('body').innerText().catch(() => '');
  if (intelBody.includes('Application error')) flag('intelligence', 'Still crashing after fix');
  else if (intelBody.includes('Could not load')) flag('intelligence', 'Error state shown — backend likely returning 500 (check AI keys)');
  else console.log('  ✅ Intelligence rendered without crash');

  // ── DOCUMENTS ─────────────────────────────────────────────────────────────
  await go(page, 'documents', '/dashboard/documents');
  await openModal(page, 'documents', 'New Document', {
    'input[placeholder*="title" i], input[name="title"]': 'QA Doc',
  });
  await openModal(page, 'documents', 'Upload', {}, 'Upload');

  // ── SETTINGS ──────────────────────────────────────────────────────────────
  await go(page, 'settings', '/dashboard/settings');
  for (const tab of ['Roles', 'API Keys', 'Notifications', 'Integrations', 'Billing']) {
    await clickTab(page, tab);
    await shot(page, `settings_${tab.toLowerCase()}`);
  }
  // Back to General and try Save
  await clickTab(page, 'General');
  await shot(page, 'settings_general');

  // ── PROFILE ───────────────────────────────────────────────────────────────
  await go(page, 'profile', '/dashboard/profile');

  // ── NOTIFICATIONS PAGE ────────────────────────────────────────────────────
  await go(page, 'notifications_page', '/dashboard/notifications');

  // ── SIDEBAR NAV — check all links resolve ────────────────────────────────
  console.log('\n=== SIDEBAR LINKS ===');
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  const navLinks = await page.locator('nav a[href], aside a[href]').all();
  const hrefs = new Set();
  for (const link of navLinks) {
    const href = await link.getAttribute('href').catch(() => '');
    if (href && href.startsWith('/dashboard')) hrefs.add(href);
  }
  console.log(`  Found ${hrefs.size} sidebar links:`, [...hrefs].join(', '));
  for (const href of hrefs) {
    await page.goto(BASE + href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const b = await page.locator('body').innerText().catch(() => '');
    if (b.includes('Application error')) flag('SidebarNav', `${href} → Application error`);
    else if (b.match(/\b404\b/) && b.toLowerCase().includes('not found')) flag('SidebarNav', `${href} → 404`);
    else console.log(`  ✅ ${href}`);
  }

  await browser.close();

  // ── FINAL REPORT ─────────────────────────────────────────────────────────
  const files = fs.readdirSync(SHOTS_DIR).filter(f => f.endsWith('.png')).sort();
  console.log('\n' + '═'.repeat(60));
  console.log(`✅ QA COMPLETE — ${files.length} screenshots, ${issues.length} issues`);
  if (issues.length > 0) {
    console.log('\n🐛 ISSUES FOUND:');
    issues.forEach((iss, i) => console.log(`  ${i+1}. [${iss.screen}] ${iss.msg}`));
  } else {
    console.log('  No issues detected!');
  }
  console.log('\n📂 Screenshots:', SHOTS_DIR);
  fs.writeFileSync('E:\\businessos\\qa-screenshots\\qa-report.json', JSON.stringify({ issues, jsErrors, screenshots: files }, null, 2));
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
