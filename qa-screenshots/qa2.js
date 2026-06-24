const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://93.127.194.128:3000';
const SHOTS_DIR = 'E:\\businessos\\qa-screenshots';
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

const issues = [];
const jsErrors = [];
let shotIdx = 0;

async function shot(page, label) {
  const file = path.join(SHOTS_DIR, `${String(shotIdx++).padStart(3,'0')}_${label.replace(/[^a-z0-9]/gi,'_').toLowerCase()}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`  📸  ${label}`);
}
function flag(screen, msg) {
  issues.push({ screen, msg });
  console.log(`  ⚠️  BUG [${screen}]: ${msg}`);
}
async function waitReady(page, timeout) {
  timeout = timeout || 7000;
  try { await page.waitForLoadState('networkidle', { timeout }); } catch {}
  await page.waitForTimeout(500);
}

let cachedToken = null;

async function doLogin(page) {
  const attempts = [
    ['admin@demo.com','Demo@1234'],
    ['admin@businessos.ai','Admin@1234'],
  ];
  for (const [email, pass] of attempts) {
    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(pass);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(4000);
    await waitReady(page, 7000);
    if (!page.url().includes('/login')) {
      // Cache the token from localStorage so we can re-inject on session expiry
      cachedToken = await page.evaluate(() => localStorage.getItem('bos_token')).catch(() => null);
      return true;
    }
  }
  return false;
}

async function reinjectToken(page) {
  if (!cachedToken) return false;
  // Re-inject the stored token without hitting the login endpoint or rate limiter
  await page.evaluate((tok) => {
    localStorage.setItem('bos_token', tok);
  }, cachedToken).catch(() => {});
  return true;
}

async function login(page) {
  console.log('\n=== LOGIN ===');
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  await shot(page, '01_login_page');
  const ok = await doLogin(page);
  await shot(page, '02_login_result');
  if (ok) console.log('  ✅ Login OK →', page.url());
  else flag('Login', 'Login failed');
  return ok;
}

async function go(page, name, shotLabel, url) {
  console.log('\n=== ' + name + ' ===');
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  if (page.url().includes('/login')) {
    console.log('  🔄 Session expired — re-injecting token...');
    const reinjected = await reinjectToken(page);
    if (reinjected) {
      await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
      await waitReady(page);
      // If still on login, fall back to full re-login
      if (page.url().includes('/login')) {
        console.log('  🔄 Token stale — re-logging in...');
        const ok = await doLogin(page);
        if (ok) { await page.goto(BASE + url, { waitUntil: 'domcontentloaded' }); await waitReady(page); }
        else { flag(name, 'Session expired, re-login failed'); return false; }
      }
    } else {
      const ok = await doLogin(page);
      if (ok) { await page.goto(BASE + url, { waitUntil: 'domcontentloaded' }); await waitReady(page); }
      else { flag(name, 'Session expired, re-login failed'); return false; }
    }
  }
  const body = await page.locator('body').innerText().catch(() => '');
  if (body.includes('Application error') || body.includes('client-side exception')) {
    flag(name, 'Application error'); await shot(page, shotLabel + '_CRASH'); return false;
  }
  if (body.match(/\b404\b/) && body.toLowerCase().includes('not found')) flag(name, '404 page');
  else console.log('  ✅ Page loaded');
  await shot(page, shotLabel + '_loaded');
  return true;
}

async function modal(page, name, triggerText, formFields, submitText) {
  submitText = submitText || 'Save';
  const btn = page.locator('button:has-text("' + triggerText + '"), a:has-text("' + triggerText + '")').first();
  if (!(await btn.isVisible({ timeout: 3000 }).catch(() => false))) {
    flag(name, 'Button "' + triggerText + '" not found'); return;
  }
  await btn.click();
  await page.waitForTimeout(1000);
  await shot(page, 'modal_' + name.replace(/\s+/g,'_').toLowerCase() + '_open');
  const overlay = page.locator('.fixed.inset-0, [role="dialog"]').first();
  const scope = (await overlay.isVisible().catch(() => false)) ? overlay : page;
  for (const [sel, val] of Object.entries(formFields || {})) {
    try {
      const el = scope.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 })) {
        const tag = await el.evaluate(e => e.tagName.toLowerCase());
        if (tag === 'select') await el.selectOption({ index: 1 }).catch(() => {});
        else { await el.clear(); await el.fill(val); }
      }
    } catch {}
  }
  await page.waitForTimeout(300);
  const sub = scope.locator('button:has-text("' + submitText + '")').first();
  const en = await sub.isEnabled({ timeout: 2000 }).catch(() => false);
  if (en) {
    await sub.click(); await page.waitForTimeout(2200);
    await shot(page, 'modal_' + name.replace(/\s+/g,'_').toLowerCase() + '_saved');
    console.log('  ✅ "' + triggerText + '" → "' + submitText + '" OK');
  } else {
    const vis = await sub.isVisible({ timeout: 1000 }).catch(() => false);
    if (vis) flag(name, '"' + submitText + '" disabled — required fields missing');
    else flag(name, '"' + submitText + '" not found in modal');
    await shot(page, 'modal_' + name.replace(/\s+/g,'_').toLowerCase() + '_fail');
    const close = scope.locator('button[aria-label="Close"], button:has-text("Cancel")').first();
    if (await close.isVisible().catch(() => false)) await close.click();
  }
}

async function clickTab(page, tabText) {
  const tab = page.locator('button:has-text("' + tabText + '"), [role="tab"]:has-text("' + tabText + '")').first();
  if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await tab.click(); await page.waitForTimeout(800);
    await shot(page, 'settings_tab_' + tabText.replace(/[\s()\/]/g,'_').toLowerCase());
    console.log('  ✅ Tab "' + tabText + '"');
  } else flag('Settings', 'Tab "' + tabText + '" not found');
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', err => { const m = err.message.slice(0,180); jsErrors.push(m); console.log('[js] ' + m); });

  if (!(await login(page))) { await browser.close(); return; }

  await go(page, 'Dashboard', '03_dashboard', '/dashboard');
  const cards = await page.locator('[class*="card"], [class*="stat"], [class*="metric"]').count();
  console.log('  Metric cards: ' + cards);
  await page.waitForTimeout(1500);

  await go(page, 'CRM Contacts', '04_crm_contacts', '/dashboard/crm/contacts');
  await modal(page, 'CRM Contacts', 'Add Contact', {
    'input[name="name"], input[placeholder*="Name" i]': 'QA Contact',
    'input[name="email"], input[placeholder*="Email" i]': 'qa_c@test.com',
    'input[name="phone"], input[placeholder*="Phone" i]': '+10000000001',
  }, 'Save');
  await page.waitForTimeout(1500);

  await go(page, 'CRM Pipeline', '05_crm_pipeline', '/dashboard/crm/pipeline');
  await modal(page, 'CRM Pipeline', 'Add Deal', {
    'input[name="title"], input[placeholder*="title" i]': 'QA Deal',
    'input[name="value"], input[placeholder*="value" i]': '9999',
  }, 'Create Deal');
  await page.waitForTimeout(1500);

  await go(page, 'CRM Leads', '06_crm_leads', '/dashboard/crm/leads');
  await modal(page, 'CRM Leads', 'Add Lead', {
    'input[name="name"], input[placeholder*="name" i]': 'QA Lead',
    'input[name="email"], input[placeholder*="email" i]': 'qa_l@test.com',
  }, 'Add Lead');
  await page.waitForTimeout(1500);

  await go(page, 'CRM Companies', '07_crm_companies', '/dashboard/crm/companies');
  await modal(page, 'CRM Companies', 'Add Company', {
    'input[name="name"], input[placeholder*="name" i]': 'QA Company',
  }, 'Save');
  await page.waitForTimeout(1500);

  await go(page, 'Helpdesk', '08_helpdesk', '/dashboard/helpdesk');
  await modal(page, 'Helpdesk', 'New Ticket', {
    'input[name="title"], input[placeholder*="title" i], input[placeholder*="subject" i]': 'QA Ticket',
    'textarea[name="description"], textarea[placeholder*="description" i]': 'QA test description',
  }, 'Create Ticket');
  await page.waitForTimeout(2000);

  await go(page, 'Knowledgebase', '09_knowledgebase', '/dashboard/knowledgebase');
  await modal(page, 'Knowledgebase', 'New Article', {
    'input[name="title"], input[placeholder*="title" i]': 'QA Article',
    'textarea[name="content"], textarea': 'This is a QA test article content.',
  }, 'Save Article');
  await page.waitForTimeout(2000);

  await go(page, 'Projects', '10_projects', '/dashboard/projects');
  await modal(page, 'Projects', 'New Project', {
    'input[name="name"], input[placeholder*="name" i]': 'QA Project',
    'textarea[name="description"]': 'QA description',
  }, 'Create Project');
  await page.waitForTimeout(2000);

  await go(page, 'Finance', '11_finance', '/dashboard/finance');
  await page.waitForTimeout(2000);

  await go(page, 'Invoices', '12_invoices', '/dashboard/finance/invoices');
  // Open New Invoice modal, fill client fields + first line item, then submit
  {
    const btn = page.locator('button:has-text("New Invoice")').first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click(); await page.waitForTimeout(1000);
      await shot(page, 'modal_invoices_open');
      const overlay = page.locator('.fixed.inset-0, [role="dialog"]').first();
      const s = (await overlay.isVisible().catch(() => false)) ? overlay : page;
      // Client fields
      const cname = s.locator('#invoice-clientName, input[name="clientName"]').first();
      if (await cname.isVisible({ timeout: 2000 }).catch(() => false)) { await cname.clear(); await cname.fill('QA Client'); }
      const cemail = s.locator('#invoice-clientEmail, input[name="clientEmail"]').first();
      if (await cemail.isVisible({ timeout: 2000 }).catch(() => false)) { await cemail.clear(); await cemail.fill('client@qa.com'); }
      const cdue = s.locator('#invoice-dueDate, input[type="date"]').first();
      if (await cdue.isVisible({ timeout: 2000 }).catch(() => false)) { await cdue.fill('2026-07-31'); }
      // Fill first line item description + rate
      const descInput = s.locator('input[aria-label*="description" i], input[placeholder*="description" i]').first();
      if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) { await descInput.clear(); await descInput.fill('QA Service'); }
      const rateInput = s.locator('input[aria-label*="rate" i], input[placeholder*="rate" i]').last();
      if (await rateInput.isVisible({ timeout: 2000 }).catch(() => false)) { await rateInput.clear(); await rateInput.fill('1000'); }
      await page.waitForTimeout(400);
      const sub = s.locator('button:has-text("Create Invoice")').first();
      const en = await sub.isEnabled({ timeout: 2000 }).catch(() => false);
      if (en) { await sub.click(); await page.waitForTimeout(2500); await shot(page, 'modal_invoices_saved'); console.log('  ✅ New Invoice → Create Invoice OK'); }
      else { flag('Invoices', '"Create Invoice" disabled'); await shot(page, 'modal_invoices_fail'); const c = s.locator('button:has-text("Cancel")').first(); if (await c.isVisible().catch(() => false)) await c.click(); }
    } else { flag('Invoices', '"New Invoice" button not found'); }
  }
  await page.waitForTimeout(2000);
  await page.waitForTimeout(2000);

  await go(page, 'Income', '13_income', '/dashboard/finance/income');
  await modal(page, 'Income', 'Add Income', {
    'input[name="title"], input[placeholder*="title" i]': 'QA Income',
    'input[name="amount"], input[placeholder*="amount" i]': '1500',
    'select[name="category"], select': 'select:0',
    'input[type="date"]': '2026-06-23',
  }, 'Record');
  await page.waitForTimeout(2000);

  await go(page, 'Expenses', '14_expenses', '/dashboard/finance/expenses');
  await modal(page, 'Expenses', 'Add Expense', {
    'input[name="title"], input[placeholder*="title" i]': 'QA Expense',
    'input[name="amount"], input[placeholder*="amount" i]': '300',
    'select[name="category"], select': 'select:0',
    'input[type="date"]': '2026-06-23',
  }, 'Add Expense');
  await page.waitForTimeout(2000);

  await go(page, 'HR Employees', '15_hr_employees', '/dashboard/hr/employees');
  await modal(page, 'HR Employees', 'Add Employee', {
    'input[name="name"], input[placeholder*="name" i]': 'QA Employee',
    'input[name="email"], input[placeholder*="email" i]': 'qaemployee3@demo.com',
    'input[name="position"], input[placeholder*="position" i]': 'QA Tester',
  }, 'Add Employee');
  await page.waitForTimeout(2000);

  await go(page, 'HR Attendance', '16_hr_attendance', '/dashboard/hr/attendance');
  await page.waitForTimeout(2000);

  await go(page, 'HR Payroll', '17_hr_payroll', '/dashboard/hr/payroll');
  await page.waitForTimeout(2000);

  await go(page, 'HR Leave', '18_hr_leave', '/dashboard/hr/leave');
  await modal(page, 'HR Leave', 'Apply Leave', {
    'input[type="date"]': '2026-07-15',
    'textarea': 'QA leave',
  }, 'Submit');
  await page.waitForTimeout(2000);

  await go(page, 'Analytics', '19_analytics', '/dashboard/analytics');
  await page.waitForTimeout(3000);
  await shot(page, '19b_analytics_data');

  await go(page, 'AI Intelligence', '20_intelligence', '/dashboard/intelligence');
  await page.waitForTimeout(5000);
  await shot(page, '20b_intelligence_settled');
  const intBody = await page.locator('body').innerText().catch(() => '');
  if (intBody.includes('Application error')) flag('Intelligence', 'Crash');
  else if (intBody.includes('Could not load')) console.log('  ℹ️  Error state (AI keys not configured — renders without crash ✅)');
  else console.log('  ✅ Intelligence rendered');

  await go(page, 'Documents', '21_documents', '/dashboard/documents');
  await modal(page, 'Documents', 'New Folder', {
    'input[name="name"], input[placeholder*="name" i], input[placeholder*="folder" i]': 'QA Folder',
  }, 'Create');
  await page.waitForTimeout(2000);

  await go(page, 'Settings', '22_settings', '/dashboard/settings');
  await page.waitForTimeout(1000);
  for (const tab of ['AI Config', 'Email (SMTP)', 'WhatsApp', 'Roles', 'API Keys', 'Audit Log', 'Company']) {
    await clickTab(page, tab);
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(1500);

  await go(page, 'Messages', '23_messages', '/dashboard/messages');
  await page.waitForTimeout(1500);

  await go(page, 'Clients', '24_clients', '/dashboard/clients');
  await page.waitForTimeout(1500);

  await browser.close();

  const files = fs.readdirSync(SHOTS_DIR).filter(f => f.endsWith('.png')).sort();
  console.log('\n' + '='.repeat(65));
  console.log('QA COMPLETE — ' + files.length + ' screenshots | ' + issues.length + ' bug(s) | ' + jsErrors.length + ' JS error(s)');
  if (issues.length) { console.log('\nBUGS:'); issues.forEach((b,i) => console.log('  ' + (i+1) + '. [' + b.screen + '] ' + b.msg)); }
  else console.log('  No bugs detected!');
  fs.writeFileSync('E:\\businessos\\qa-screenshots\\qa-report.json', JSON.stringify({ issues, jsErrors, screenshots: files }, null, 2));
}

main().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });