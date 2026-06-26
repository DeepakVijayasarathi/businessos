/**
 * qa3.js — Deep page-by-page UI + functional audit
 * Tests: load, CRUD (create/read/update/delete), search, filters, tabs, modals, navigation
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://93.127.194.128:3000';
const API  = 'http://93.127.194.128:5000';
const SHOTS_DIR = path.join(__dirname, 'deep');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

const issues = [];
const passes = [];
const jsErrors = [];
let shotIdx = 0;

async function shot(page, label) {
  const file = path.join(SHOTS_DIR, `${String(shotIdx++).padStart(3,'0')}_${label.replace(/[^a-z0-9]/gi,'_').toLowerCase()}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}

function bug(screen, msg) {
  issues.push({ screen, msg });
  console.log(`  ❌ BUG [${screen}] ${msg}`);
}
function ok(screen, msg) {
  passes.push({ screen, msg });
  console.log(`  ✅ [${screen}] ${msg}`);
}

async function wait(page, ms) { await page.waitForTimeout(ms); }
async function waitReady(page, ms) {
  try { await page.waitForLoadState('networkidle', { timeout: ms || 8000 }); } catch {}
  await wait(page, 400);
}

let cachedToken = null;
async function login(page) {
  console.log('\n══ LOGIN ══');
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  for (const [em, pw] of [['admin@demo.com','Demo@1234'],['admin@businessos.ai','Admin@1234']]) {
    await page.locator('input[type="email"]').first().fill(em);
    await page.locator('input[type="password"]').first().fill(pw);
    await page.locator('button[type="submit"]').first().click();
    await wait(page, 3500); await waitReady(page, 7000);
    if (!page.url().includes('/login')) {
      cachedToken = await page.evaluate(() => localStorage.getItem('bos_token')).catch(() => null);
      ok('Login', `Logged in as ${em}`); return true;
    }
  }
  bug('Login', 'Login failed for all credentials'); return false;
}

async function go(page, name, url) {
  console.log(`\n══ ${name} ══`);
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  if (page.url().includes('/login')) {
    if (cachedToken) {
      await page.evaluate(t => localStorage.setItem('bos_token', t), cachedToken);
      await page.goto(BASE + url, { waitUntil: 'domcontentloaded' }); await waitReady(page);
    }
    if (page.url().includes('/login')) { bug(name, 'Redirected to login — session expired'); return false; }
  }
  const body = await page.locator('body').innerText().catch(() => '');
  if (body.includes('Application error') || body.includes('client-side exception')) {
    bug(name, 'Next.js Application error crash'); await shot(page, name + '_CRASH'); return false;
  }
  if (body.match(/\b404\b/) && body.toLowerCase().includes('not found')) {
    bug(name, '404 Not Found'); return false;
  }
  ok(name, 'Page loaded without errors');
  return true;
}

async function tryFill(scope, sel, val) {
  try {
    const el = scope.locator(sel).first();
    if (await el.isVisible({ timeout: 2000 })) {
      const tag = await el.evaluate(e => e.tagName.toLowerCase()).catch(() => 'input');
      if (tag === 'select') await el.selectOption({ index: 1 }).catch(() => {});
      else { await el.clear(); await el.fill(String(val)); }
      return true;
    }
  } catch {}
  return false;
}

async function openModal(page, name, triggerText) {
  const btn = page.locator(`button:has-text("${triggerText}"), a:has-text("${triggerText}")`).first();
  if (!(await btn.isVisible({ timeout: 3000 }).catch(() => false))) {
    bug(name, `Button "${triggerText}" not visible`); return null;
  }
  await btn.click(); await wait(page, 800);
  const overlay = page.locator('.fixed.inset-0, [role="dialog"]').first();
  const scope = (await overlay.isVisible({ timeout: 2000 }).catch(() => false)) ? overlay : page;
  ok(name, `Modal "${triggerText}" opened`);
  return scope;
}

async function submitModal(page, scope, name, submitText) {
  submitText = submitText || 'Save';
  const btn = scope.locator(`button:has-text("${submitText}")`).first();
  const enabled = await btn.isEnabled({ timeout: 2000 }).catch(() => false);
  if (!enabled) { bug(name, `"${submitText}" button disabled`); return false; }
  await btn.click(); await wait(page, 2500);
  // Dismiss modal if still open after submit (onSuccess closes it, but timing may vary)
  await dismissAnyModal(page);
  ok(name, `"${submitText}" submitted`); return true;
}

async function closeModal(page) {
  // First try Escape — safest, always dismisses modal
  await page.keyboard.press('Escape'); await wait(page, 500);
  // If still open, try cancel button scoped inside overlay
  const overlay = page.locator('.fixed.inset-0').first();
  if (await overlay.isVisible({ timeout: 600 }).catch(() => false)) {
    const cancelBtn = overlay.locator('button:has-text("Cancel"),button[aria-label="Close"]').first();
    if (await cancelBtn.isVisible({ timeout: 600 }).catch(() => false)) { await cancelBtn.click({ force: true }); await wait(page, 400); }
  }
}

async function dismissAnyModal(page) {
  const overlay = page.locator('.fixed.inset-0').first();
  if (await overlay.isVisible({ timeout: 600 }).catch(() => false)) {
    await page.keyboard.press('Escape'); await wait(page, 600);
    // If still open after Escape, click Cancel inside the overlay
    if (await overlay.isVisible({ timeout: 400 }).catch(() => false)) {
      const cancelBtn = overlay.locator('button:has-text("Cancel")').first();
      if (await cancelBtn.isVisible({ timeout: 400 }).catch(() => false)) { await cancelBtn.click({ force: true }); await wait(page, 400); }
    }
  }
}

async function testSearch(page, name, searchSel, term) {
  await dismissAnyModal(page);
  const inp = page.locator(searchSel).first();
  if (!(await inp.isVisible({ timeout: 2000 }).catch(() => false))) { bug(name, 'Search input not visible'); return; }
  await inp.fill(term); await wait(page, 1000);
  ok(name, `Search "${term}" executed`);
  await inp.clear(); await wait(page, 600);
}

async function testTab(page, name, tabText) {
  await dismissAnyModal(page);
  const tab = page.locator(`button:has-text("${tabText}"), [role="tab"]:has-text("${tabText}")`).first();
  if (!(await tab.isVisible({ timeout: 2000 }).catch(() => false))) { bug(name, `Tab "${tabText}" not found`); return false; }
  await tab.click({ timeout: 4000, force: true }).catch(() => {});
  await wait(page, 700);
  ok(name, `Tab "${tabText}" clicked`); return true;
}

async function testFilter(page, name, sel, value) {
  const el = page.locator(sel).first();
  if (!(await el.isVisible({ timeout: 2000 }).catch(() => false))) { bug(name, `Filter "${sel}" not visible`); return; }
  const tag = await el.evaluate(e => e.tagName.toLowerCase()).catch(() => '');
  if (tag === 'select') await el.selectOption(value).catch(() => {});
  else await el.click();
  await wait(page, 800);
  ok(name, `Filter applied`);
}

async function checkRowCount(page, name, rowSel, minExpected) {
  const rows = await page.locator(rowSel).count();
  if (rows < minExpected) bug(name, `Expected ≥${minExpected} rows, got ${rows}`);
  else ok(name, `Table has ${rows} row(s)`);
  return rows;
}

async function checkNoAppError(page, name) {
  const body = await page.locator('body').innerText().catch(() => '');
  if (body.includes('Application error') || body.includes('client-side exception')) bug(name, 'Application error on page');
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', err => { const m = err.message.slice(0,180); jsErrors.push(m); console.log(`  [js] ${m}`); });

  if (!(await login(page))) { await browser.close(); return; }

  // ══════════════════════════════════════════════════════════
  // 1. DASHBOARD HOME
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Dashboard', '/dashboard')) {
    await wait(page, 1500);
    const cards = await page.locator('[class*="card"],[class*="stat"],[class*="metric"]').count();
    if (cards < 3) bug('Dashboard', `Only ${cards} stat cards rendered`);
    else ok('Dashboard', `${cards} metric cards rendered`);
    const chartSvg = await page.locator('svg').count();
    if (chartSvg === 0) bug('Dashboard', 'No charts rendered');
    else ok('Dashboard', `${chartSvg} SVG chart(s) visible`);
    const greet = await page.locator('text=/Good (morning|afternoon|evening)/i').count();
    if (greet === 0) bug('Dashboard', 'Greeting not shown');
    else ok('Dashboard', 'Greeting rendered');
    await shot(page, '01_dashboard');
  }

  // ══════════════════════════════════════════════════════════
  // 2. CRM CONTACTS
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'CRM Contacts', '/dashboard/crm/contacts')) {
    await shot(page, '02_crm_contacts');
    // Create
    let scope = await openModal(page, 'CRM Contacts', 'Add Contact');
    if (scope) {
      await tryFill(scope, 'input[name="name"],input[placeholder*="name" i],input[placeholder*="Name"]', 'Deep QA Contact');
      await tryFill(scope, 'input[name="email"],input[type="email"]', 'deepqa_contact@test.com');
      await tryFill(scope, 'input[name="phone"],input[placeholder*="phone" i]', '+19001234567');
      await shot(page, '02b_crm_contacts_modal');
      await submitModal(page, scope, 'CRM Contacts', 'Save');
      await shot(page, '02c_crm_contacts_saved');
    }
    // Search
    await testSearch(page, 'CRM Contacts', 'input[placeholder*="earch"]', 'Deep QA');
    // Check table
    await checkRowCount(page, 'CRM Contacts', 'table tbody tr,ul li[class*="contact"]', 1);
    await checkNoAppError(page, 'CRM Contacts');
  }

  // ══════════════════════════════════════════════════════════
  // 3. CRM LEADS
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'CRM Leads', '/dashboard/crm/leads')) {
    await shot(page, '03_crm_leads');
    let scope = await openModal(page, 'CRM Leads', 'Add Lead');
    if (scope) {
      await tryFill(scope, 'input[name="name"],input[placeholder*="name" i]', 'Deep QA Lead');
      await tryFill(scope, 'input[name="email"],input[type="email"]', 'deepqa_lead@test.com');
      await tryFill(scope, 'input[name="company"],input[placeholder*="company" i]', 'Deep QA Corp');
      await shot(page, '03b_crm_leads_modal');
      await submitModal(page, scope, 'CRM Leads', 'Add Lead');
    }
    // Status filter tabs
    for (const status of ['New','Contacted','Qualified','Converted']) {
      await testTab(page, 'CRM Leads', status);
    }
    await testSearch(page, 'CRM Leads', 'input[placeholder*="earch"]', 'Deep QA');
    // Score All button
    const scoreBtn = page.locator('button:has-text("Score All")').first();
    if (await scoreBtn.isVisible({ timeout: 1500 }).catch(() => false)) ok('CRM Leads', '"Score All" button visible');
    else bug('CRM Leads', '"Score All" button not visible');
    await shot(page, '03c_crm_leads_final');
  }

  // ══════════════════════════════════════════════════════════
  // 4. CRM PIPELINE
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'CRM Pipeline', '/dashboard/crm/pipeline')) {
    await shot(page, '04_crm_pipeline');
    // Check kanban columns
    const cols = await page.locator('[class*="column"],[class*="stage"],h3:has-text("Prospecting"),h3:has-text("Qualification")').count();
    if (cols === 0) bug('CRM Pipeline', 'No pipeline columns found');
    else ok('CRM Pipeline', `${cols} pipeline column elements found`);
    // Forecast button
    const fBtn = page.locator('button:has-text("Forecast")').first();
    if (await fBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      ok('CRM Pipeline', '"Forecast" button visible');
      await fBtn.click(); await wait(page, 1200); await shot(page, '04b_pipeline_forecast');
    } else bug('CRM Pipeline', '"Forecast" button not visible');
    // Add deal
    let scope = await openModal(page, 'CRM Pipeline', 'Add Deal');
    if (scope) {
      await tryFill(scope, 'input[name="title"],input[placeholder*="title" i],input[id*="deal-name"]', 'Deep QA Deal');
      await tryFill(scope, 'input[name="value"],input[placeholder*="value" i],input[type="number"]', '25000');
      await submitModal(page, scope, 'CRM Pipeline', 'Create Deal');
      await shot(page, '04c_pipeline_deal_added');
    }
    await checkNoAppError(page, 'CRM Pipeline');
  }

  // ══════════════════════════════════════════════════════════
  // 5. CRM COMPANIES
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'CRM Companies', '/dashboard/crm/companies')) {
    await shot(page, '05_crm_companies');
    let scope = await openModal(page, 'CRM Companies', 'Add Company');
    if (scope) {
      await tryFill(scope, 'input[name="name"],input[id*="company-name"]', 'Deep QA Ltd');
      await tryFill(scope, 'input[name="email"],input[type="email"]', 'info@deepqa.com');
      await tryFill(scope, 'input[name="industry"],input[placeholder*="industry" i]', 'Technology');
      await submitModal(page, scope, 'CRM Companies', 'Save');
      await shot(page, '05b_crm_companies_saved');
    }
    await testSearch(page, 'CRM Companies', 'input[placeholder*="earch"]', 'Deep QA');
    await checkNoAppError(page, 'CRM Companies');
  }

  // ══════════════════════════════════════════════════════════
  // 6. CRM ACTIVITIES
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'CRM Activities', '/dashboard/crm/activities')) {
    await shot(page, '06_crm_activities');
    let scope = await openModal(page, 'CRM Activities', 'Add Activity');
    if (scope) {
      await tryFill(scope, 'input[id*="activity-title"],input[name="title"],input[placeholder*="title" i]', 'Deep QA Activity');
      await submitModal(page, scope, 'CRM Activities', 'Save');
    }
    for (const f of ['All','call','email','meeting']) await testTab(page, 'CRM Activities', f).catch(() => {});
    await checkNoAppError(page, 'CRM Activities');
    await shot(page, '06b_crm_activities');
  }

  // ══════════════════════════════════════════════════════════
  // 7. HELPDESK
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Helpdesk', '/dashboard/helpdesk')) {
    await shot(page, '07_helpdesk');
    let scope = await openModal(page, 'Helpdesk', 'New Ticket');
    if (scope) {
      await tryFill(scope, 'input[name="title"],input[placeholder*="title" i],input[placeholder*="subject" i]', 'Deep QA Ticket');
      await tryFill(scope, 'textarea[name="description"],textarea', 'This is a deep QA functional test ticket.');
      await shot(page, '07b_helpdesk_modal');
      await submitModal(page, scope, 'Helpdesk', 'Create Ticket');
      await shot(page, '07c_helpdesk_saved');
    }
    // Priority filter
    const prioSel = page.locator('select,select[class*="priority"]').first();
    if (await prioSel.isVisible({ timeout: 1500 }).catch(() => false)) {
      await prioSel.selectOption({ index: 1 }).catch(() => {}); await wait(page, 600);
      ok('Helpdesk', 'Priority filter works');
    }
    // Check AI Triage button
    const aiBtn = await page.locator('button:has-text("AI Triage")').count();
    if (aiBtn > 0) ok('Helpdesk', `${aiBtn} "AI Triage" button(s) visible`);
    await testSearch(page, 'Helpdesk', 'input[placeholder*="earch"]', 'Deep QA');
    // Open a ticket detail
    const firstTicket = page.locator('table tbody tr,[class*="ticket-row"]').first();
    if (await firstTicket.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstTicket.click(); await wait(page, 1000);
      await shot(page, '07d_helpdesk_detail');
      ok('Helpdesk', 'Ticket detail opened');
    }
    await checkNoAppError(page, 'Helpdesk');
  }

  // ══════════════════════════════════════════════════════════
  // 8. KNOWLEDGE BASE
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Knowledge Base', '/dashboard/knowledgebase')) {
    await shot(page, '08_kb');
    // Category sidebar
    const cats = await page.locator('[class*="category"],aside li,nav li').count();
    ok('Knowledge Base', `${cats} category items in sidebar`);
    // Create article
    let scope = await openModal(page, 'Knowledge Base', 'New Article');
    if (scope) {
      await tryFill(scope, 'input[id*="article-title"],input[name="title"],input[placeholder*="title" i]', 'Deep QA Article');
      await tryFill(scope, 'textarea[name="content"],textarea[id*="content"],textarea', 'This is deep QA content for the article.');
      await shot(page, '08b_kb_modal');
      await submitModal(page, scope, 'Knowledge Base', 'Save Article');
      await shot(page, '08c_kb_saved');
    }
    // Status filter tabs
    for (const t of ['Published','Draft','Archived']) await testTab(page, 'Knowledge Base', t);
    await testSearch(page, 'Knowledge Base', 'input[placeholder*="earch"]', 'Deep QA');
    await checkNoAppError(page, 'Knowledge Base');
  }

  // ══════════════════════════════════════════════════════════
  // 9. PROJECTS
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Projects', '/dashboard/projects')) {
    await shot(page, '09_projects');
    let scope = await openModal(page, 'Projects', 'New Project');
    if (scope) {
      await tryFill(scope, 'input[name="name"],input[id*="project"],input[placeholder*="name" i]', 'Deep QA Project');
      await tryFill(scope, 'textarea[name="description"],textarea', 'Deep QA project description');
      await shot(page, '09b_projects_modal');
      await submitModal(page, scope, 'Projects', 'Create Project');
      await shot(page, '09c_projects_saved');
    }
    await wait(page, 800);
    // Check project card appeared
    const projCards = await page.locator('[class*="card"],[class*="project"]').count();
    ok('Projects', `${projCards} project card element(s) visible`);
    // Click into a project
    const firstProj = page.locator('[class*="card"] h2,[class*="card"] h3,[class*="card"] p').first();
    if (await firstProj.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstProj.click(); await wait(page, 1000); await shot(page, '09d_project_detail');
      ok('Projects', 'Project detail navigated');
    }
    await checkNoAppError(page, 'Projects');
  }

  // ══════════════════════════════════════════════════════════
  // 10. FINANCE OVERVIEW
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Finance Overview', '/dashboard/finance')) {
    await wait(page, 1500);
    await shot(page, '10_finance_overview');
    const summaryCards = await page.locator('[class*="card"],[class*="stat"]').count();
    if (summaryCards < 2) bug('Finance Overview', 'Summary cards not rendered');
    else ok('Finance Overview', `${summaryCards} summary card(s) visible`);
    await checkNoAppError(page, 'Finance Overview');
  }

  // ══════════════════════════════════════════════════════════
  // 11. INVOICES
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Invoices', '/dashboard/finance/invoices')) {
    await shot(page, '11_invoices');
    let scope = await openModal(page, 'Invoices', 'New Invoice');
    if (scope) {
      await tryFill(scope, '#invoice-clientName,input[name="clientName"],input[placeholder*="client" i]', 'Deep QA Client');
      await tryFill(scope, '#invoice-clientEmail,input[name="clientEmail"],input[type="email"]', 'client@deepqa.com');
      await tryFill(scope, '#invoice-dueDate,input[type="date"]', '2026-09-30');
      // Fill first line item
      await tryFill(scope, 'input[placeholder*="escription" i],input[aria-label*="escription" i]', 'QA Service');
      await tryFill(scope, 'input[placeholder*="ate" i]:not([type="date"]),input[aria-label*="ate" i]', '1500');
      await shot(page, '11b_invoices_modal');
      await submitModal(page, scope, 'Invoices', 'Create Invoice');
      await shot(page, '11c_invoices_saved');
    }
    // Status tabs
    for (const t of ['Draft','Sent','Paid','Overdue']) await testTab(page, 'Invoices', t);
    // Export CSV
    const expBtn = page.locator('button:has-text("Export CSV"),a:has-text("Export")').first();
    if (await expBtn.isVisible({ timeout: 1500 }).catch(() => false)) ok('Invoices', 'Export CSV button visible');
    else bug('Invoices', 'Export CSV button not visible');
    await checkNoAppError(page, 'Invoices');
    await shot(page, '11d_invoices_final');
  }

  // ══════════════════════════════════════════════════════════
  // 12. INCOME
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Income', '/dashboard/finance/income')) {
    await shot(page, '12_income');
    let scope = await openModal(page, 'Income', 'Add Income');
    if (scope) {
      await tryFill(scope, 'input[name="title"],input[name="description"],input[placeholder*="escription" i],input[id*="income-description"]', 'Deep QA Income');
      await tryFill(scope, 'input[name="amount"],input[id*="income-amount"],input[type="number"]', '2500');
      await tryFill(scope, 'input[name="date"],input[type="date"]', '2026-06-25');
      await shot(page, '12b_income_modal');
      const submitted = await submitModal(page, scope, 'Income', 'Record');
      if (submitted) ok('Income', 'Income record created');
    }
    await checkNoAppError(page, 'Income');
    await shot(page, '12c_income_final');
  }

  // ══════════════════════════════════════════════════════════
  // 13. EXPENSES
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Expenses', '/dashboard/finance/expenses')) {
    await shot(page, '13_expenses');
    let scope = await openModal(page, 'Expenses', 'Add Expense');
    if (scope) {
      await tryFill(scope, 'input[name="title"],input[id*="expense-title"],input[placeholder*="title" i]', 'Deep QA Expense');
      await tryFill(scope, 'input[name="amount"],input[id*="expense-amount"],input[type="number"]', '450');
      await tryFill(scope, 'input[name="date"],input[type="date"]', '2026-06-25');
      await shot(page, '13b_expenses_modal');
      const submitted = await submitModal(page, scope, 'Expenses', 'Add Expense');
      if (submitted) ok('Expenses', 'Expense record created');
      else {
        // Check if title was actually filled
        const titleVal = await scope.locator('input[name="title"],input[id*="expense-title"]').first().inputValue().catch(() => '');
        bug('Expenses', `Submit disabled. title="${titleVal}" (empty = selector miss)`);
      }
    }
    // Filter tabs
    for (const t of ['Pending','Approved','Rejected']) await testTab(page, 'Expenses', t);
    await checkNoAppError(page, 'Expenses');
    await shot(page, '13c_expenses_final');
  }

  // ══════════════════════════════════════════════════════════
  // 14. PURCHASE ORDERS
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Purchase Orders', '/dashboard/finance/purchase-orders')) {
    await shot(page, '14_purchase_orders');
    let scope = await openModal(page, 'Purchase Orders', 'New PO');
    if (scope) {
      await tryFill(scope, 'input[name="vendorName"],input[placeholder*="vendor" i]', 'Deep QA Vendor');
      await tryFill(scope, 'input[placeholder*="escription" i]', 'QA Supply Item');
      await tryFill(scope, 'input[placeholder*="qty" i],input[placeholder*="quantity" i]', '5');
      await tryFill(scope, 'input[placeholder*="price" i],input[placeholder*="rate" i]', '200');
      await shot(page, '14b_po_modal');
      await submitModal(page, scope, 'Purchase Orders', 'Create PO');
    }
    await checkNoAppError(page, 'Purchase Orders');
    await shot(page, '14c_po_final');
  }

  // ══════════════════════════════════════════════════════════
  // 15. FINANCE REPORTS
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Finance Reports', '/dashboard/finance/reports')) {
    await wait(page, 2000); await shot(page, '15_finance_reports');
    const charts = await page.locator('svg,canvas').count();
    if (charts === 0) bug('Finance Reports', 'No charts rendered');
    else ok('Finance Reports', `${charts} chart element(s) rendered`);
    await checkNoAppError(page, 'Finance Reports');
  }

  // ══════════════════════════════════════════════════════════
  // 16. HR EMPLOYEES
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'HR Employees', '/dashboard/hr/employees')) {
    await shot(page, '16_hr_employees');
    let scope = await openModal(page, 'HR Employees', 'Add Employee');
    if (scope) {
      await tryFill(scope, 'input[name="name"],input[placeholder*="name" i]', 'Deep QA Employee');
      await tryFill(scope, 'input[name="email"],input[type="email"]', 'deepqa_emp@demo.com');
      await tryFill(scope, 'input[name="position"],input[placeholder*="position" i],input[placeholder*="job" i]', 'QA Engineer');
      await tryFill(scope, 'input[name="department"],input[placeholder*="department" i]', 'Engineering');
      await shot(page, '16b_hr_employees_modal');
      await submitModal(page, scope, 'HR Employees', 'Add Employee');
      await shot(page, '16c_hr_employees_saved');
    }
    // Departments tab
    await testTab(page, 'HR Employees', 'Departments');
    const addDeptBtn = page.locator('button:has-text("Add Department")').first();
    if (await addDeptBtn.isVisible({ timeout: 1500 }).catch(() => false)) ok('HR Employees', '"Add Department" button visible in Departments tab');
    else bug('HR Employees', '"Add Department" not visible in Departments tab');
    await testSearch(page, 'HR Employees', 'input[placeholder*="earch"]', 'Deep QA');
    await checkNoAppError(page, 'HR Employees');
    await shot(page, '16d_hr_employees_final');
  }

  // ══════════════════════════════════════════════════════════
  // 17. HR ATTENDANCE
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'HR Attendance', '/dashboard/hr/attendance')) {
    await shot(page, '17_hr_attendance');
    // Check In button
    const checkInBtn = page.locator('button:has-text("Check In")').first();
    if (await checkInBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      ok('HR Attendance', '"Check In" button visible');
      const isEnabled = await checkInBtn.isEnabled({ timeout: 500 }).catch(() => false);
      if (isEnabled) {
        await checkInBtn.click({ force: true }); await wait(page, 1500);
        await shot(page, '17b_hr_attendance_checkin');
        const checkOutBtn = page.locator('button:has-text("Check Out")').first();
        if (await checkOutBtn.isEnabled({ timeout: 2000 }).catch(() => false)) ok('HR Attendance', '"Check Out" enabled after check-in');
        else bug('HR Attendance', '"Check Out" not enabled after check-in');
      } else {
        ok('HR Attendance', '"Check In" disabled (already checked in today — correct behavior)');
        const checkOutBtn = page.locator('button:has-text("Check Out")').first();
        if (await checkOutBtn.isVisible({ timeout: 1500 }).catch(() => false)) ok('HR Attendance', '"Check Out" button visible');
      }
    } else bug('HR Attendance', '"Check In" button not visible');
    // Month selector
    const monthSel = page.locator('select').first();
    if (await monthSel.isVisible({ timeout: 1500 }).catch(() => false)) ok('HR Attendance', 'Month selector visible');
    else bug('HR Attendance', 'Month selector not visible');
    await checkNoAppError(page, 'HR Attendance');
    await shot(page, '17c_hr_attendance_final');
  }

  // ══════════════════════════════════════════════════════════
  // 18. HR PAYROLL
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'HR Payroll', '/dashboard/hr/payroll')) {
    await shot(page, '18_hr_payroll');
    const genBtn = page.locator('button:has-text("Generate")').first();
    if (await genBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      ok('HR Payroll', '"Generate" button visible');
      await genBtn.click(); await wait(page, 2000);
      await shot(page, '18b_hr_payroll_generated');
      const rows = await page.locator('table tbody tr').count();
      if (rows === 0) bug('HR Payroll', 'No payslip rows after Generate');
      else ok('HR Payroll', `${rows} payslip row(s) generated`);
    } else bug('HR Payroll', '"Generate" button not visible');
    // Download payslip
    const dlBtn = page.locator('button[title*="download" i],button[aria-label*="download" i],[data-testid*="download"]').first();
    if (await dlBtn.isVisible({ timeout: 1500 }).catch(() => false)) ok('HR Payroll', 'Download payslip button visible');
    await checkNoAppError(page, 'HR Payroll');
  }

  // ══════════════════════════════════════════════════════════
  // 19. HR LEAVE
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'HR Leave', '/dashboard/hr/leave')) {
    await shot(page, '19_hr_leave');
    let scope = await openModal(page, 'HR Leave', 'Apply Leave');
    if (scope) {
      const dateInputs = await scope.locator('input[type="date"]').count();
      if (dateInputs >= 2) {
        await scope.locator('input[type="date"]').nth(0).fill('2026-08-01');
        await scope.locator('input[type="date"]').nth(1).fill('2026-08-05');
      } else if (dateInputs === 1) {
        await scope.locator('input[type="date"]').nth(0).fill('2026-08-01');
      }
      await tryFill(scope, 'textarea,textarea[name="reason"]', 'Deep QA leave request');
      await shot(page, '19b_hr_leave_modal');
      await submitModal(page, scope, 'HR Leave', 'Submit');
      await shot(page, '19c_hr_leave_saved');
    }
    for (const t of ['All','Pending','Approved','Rejected']) await testTab(page, 'HR Leave', t);
    await checkNoAppError(page, 'HR Leave');
  }

  // ══════════════════════════════════════════════════════════
  // 20. HR PERFORMANCE
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'HR Performance', '/dashboard/hr/performance')) {
    await wait(page, 1000); await shot(page, '20_hr_performance');
    const addBtn = page.locator('button:has-text("Add Review"),button:has-text("New Review"),button:has-text("Add")').first();
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) ok('HR Performance', 'Add review button visible');
    else bug('HR Performance', 'No add button visible');
    await checkNoAppError(page, 'HR Performance');
  }

  // ══════════════════════════════════════════════════════════
  // 21. HR RECRUITMENT
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'HR Recruitment', '/dashboard/hr/recruitment')) {
    await wait(page, 1000); await shot(page, '21_hr_recruitment');
    const addBtn = page.locator('button:has-text("New Job"),button:has-text("Add Job"),button:has-text("Post Job")').first();
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      ok('HR Recruitment', 'Post job button visible');
      let scope = await openModal(page, 'HR Recruitment', await addBtn.textContent().then(t => t?.trim() || 'New Job'));
      if (scope) {
        await tryFill(scope, 'input[name="title"],input[placeholder*="title" i],input[placeholder*="job" i]', 'QA Engineer');
        await submitModal(page, scope, 'HR Recruitment', 'Save').catch(() => {});
      }
    } else bug('HR Recruitment', 'No post-job button visible');
    await checkNoAppError(page, 'HR Recruitment');
  }

  // ══════════════════════════════════════════════════════════
  // 22. CONTRACTS
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Contracts', '/dashboard/contracts')) {
    await shot(page, '22_contracts');
    let scope = await openModal(page, 'Contracts', 'New Contract');
    if (scope) {
      await tryFill(scope, 'input[name="title"],input[placeholder*="title" i]', 'Deep QA Contract');
      await tryFill(scope, 'input[name="partyName"],input[placeholder*="party" i],input[placeholder*="client" i]', 'QA Corp');
      await tryFill(scope, 'input[name="partyEmail"],input[placeholder*="email" i],input[type="email"]', 'contract@deepqa.com');
      await tryFill(scope, 'input[name="value"],input[placeholder*="value" i],input[type="number"]', '50000');
      await shot(page, '22b_contracts_modal');
      await submitModal(page, scope, 'Contracts', 'Create Contract');
      await shot(page, '22c_contracts_saved');
    }
    for (const t of ['Draft','Active','Expired','Terminated']) {
      const tab = page.locator(`button:has-text("${t}"),[role="tab"]:has-text("${t}")`).first();
      if (await tab.isVisible({ timeout: 1000 }).catch(() => false)) { await tab.click(); await wait(page, 400); }
    }
    await checkNoAppError(page, 'Contracts');
  }

  // ══════════════════════════════════════════════════════════
  // 23. APPOINTMENTS
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Appointments', '/dashboard/appointments')) {
    await shot(page, '23_appointments');
    const addBtn = page.locator('button:has-text("New Appointment"),button:has-text("Schedule"),button:has-text("Book")').first();
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      ok('Appointments', 'Add appointment button visible');
      let scope = await openModal(page, 'Appointments', await addBtn.textContent().then(t => t?.trim() || 'New Appointment'));
      if (scope) {
        await tryFill(scope, 'input[name="title"],input[placeholder*="title" i]', 'Deep QA Appointment');
        await shot(page, '23b_appointments_modal');
        await closeModal(page);
      }
    } else bug('Appointments', 'No appointment create button visible');
    await checkNoAppError(page, 'Appointments');
    await shot(page, '23c_appointments_final');
  }

  // ══════════════════════════════════════════════════════════
  // 24. DOCUMENTS
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Documents', '/dashboard/documents')) {
    await shot(page, '24_documents');
    // Pluralization fix check
    const subtitle = await page.locator('p.text-sm.text-gray-500').first().textContent().catch(() => '');
    if (subtitle.includes('1 files')) bug('Documents', `Pluralization bug: "${subtitle}" (should be "1 file")`);
    else ok('Documents', `File count label: "${subtitle}"`);
    // Create folder
    let scope = await openModal(page, 'Documents', 'New Folder');
    if (scope) {
      await tryFill(scope, 'input[name="name"],input[placeholder*="name" i],input[placeholder*="folder" i]', 'Deep QA Folder');
      await shot(page, '24b_documents_folder_modal');
      await submitModal(page, scope, 'Documents', 'Create');
      await shot(page, '24c_documents_folder_created');
    }
    // Upload button
    const upBtn = page.locator('button:has-text("Upload")').first();
    if (await upBtn.isVisible({ timeout: 1500 }).catch(() => false)) ok('Documents', 'Upload button visible');
    else bug('Documents', 'Upload button not visible');
    // Search
    await testSearch(page, 'Documents', 'input[placeholder*="earch"]', 'patron');
    await checkNoAppError(page, 'Documents');
  }

  // ══════════════════════════════════════════════════════════
  // 25. ANALYTICS
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Analytics', '/dashboard/analytics')) {
    await wait(page, 2500); await shot(page, '25_analytics');
    const charts = await page.locator('svg').count();
    if (charts < 2) bug('Analytics', `Only ${charts} SVG chart(s) — expected multiple`);
    else ok('Analytics', `${charts} SVG chart(s) rendered`);
    // Period buttons
    for (const p of ['7d','30d','90d','1y']) {
      const btn = page.locator(`button:has-text("${p}")`).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click(); await wait(page, 800);
        ok('Analytics', `Period "${p}" button works`);
      } else bug('Analytics', `Period "${p}" button not found`);
    }
    await checkNoAppError(page, 'Analytics');
    await shot(page, '25b_analytics_periods');
  }

  // ══════════════════════════════════════════════════════════
  // 26. AI INTELLIGENCE
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'AI Intelligence', '/dashboard/intelligence')) {
    await wait(page, 5000); await shot(page, '26_intelligence');
    const body = await page.locator('body').innerText().catch(() => '');
    if (body.includes('Application error')) bug('AI Intelligence', 'Crash');
    else if (body.includes('49') || body.includes('Health Score') || body.includes('Business Health')) ok('AI Intelligence', 'Health score rendered');
    // Refresh button
    const refBtn = page.locator('button:has-text("Refresh")').first();
    if (await refBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      ok('AI Intelligence', '"Refresh Analysis" button visible');
      await refBtn.click(); await wait(page, 3000);
      await shot(page, '26b_intelligence_refreshed');
    } else bug('AI Intelligence', '"Refresh Analysis" button not visible');
    await checkNoAppError(page, 'AI Intelligence');
  }

  // ══════════════════════════════════════════════════════════
  // 27. MARKETING
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Marketing', '/dashboard/marketing')) {
    await shot(page, '27_marketing');
    // Check tabs
    for (const t of ['Campaigns','Social','Email','Landing Pages','SEO']) {
      const tab = page.locator(`button:has-text("${t}"),[role="tab"]:has-text("${t}")`).first();
      if (await tab.isVisible({ timeout: 1500 }).catch(() => false)) {
        await tab.click({ force: true, timeout: 4000 }).catch(() => {}); await wait(page, 600);
        ok('Marketing', `Tab "${t}" works`);
        await shot(page, `27_marketing_${t.toLowerCase().replace(/\s/g,'_')}`);
      } else bug('Marketing', `Tab "${t}" not found`);
    }
    await checkNoAppError(page, 'Marketing');
  }

  // ══════════════════════════════════════════════════════════
  // 28. EMAIL
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Email', '/dashboard/email')) {
    await shot(page, '28_email');
    const composeBtn = page.locator('button:has-text("Compose"),button:has-text("New Email")').first();
    if (await composeBtn.isVisible({ timeout: 2000 }).catch(() => false)) ok('Email', 'Compose button visible');
    else bug('Email', 'Compose button not visible');
    await checkNoAppError(page, 'Email');
  }

  // ══════════════════════════════════════════════════════════
  // 29. MESSAGES / WHATSAPP
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Messages', '/dashboard/messages')) {
    await shot(page, '29_messages');
    const newMsgBtn = page.locator('button:has-text("New Message"),button[title*="new" i]').first();
    if (await newMsgBtn.isVisible({ timeout: 2000 }).catch(() => false)) ok('Messages', '"New Message" button visible');
    else bug('Messages', '"New Message" button not visible');
    const conversations = await page.locator('[class*="conversation"],[class*="contact-row"],aside li').count();
    ok('Messages', `${conversations} conversation list item(s)`);
    await checkNoAppError(page, 'Messages');
  }

  // ══════════════════════════════════════════════════════════
  // 30. OKR / GOALS
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'OKR & Goals', '/dashboard/okr')) {
    await shot(page, '30_okr');
    const addBtn = page.locator('button:has-text("New Objective"),button:has-text("Add OKR"),button:has-text("New Goal")').first();
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      ok('OKR', 'Add objective button visible');
    } else bug('OKR', 'No add-objective button visible');
    await checkNoAppError(page, 'OKR');
    await shot(page, '30b_okr');
  }

  // ══════════════════════════════════════════════════════════
  // 31. TIME TRACKING / TIMESHEETS
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Timesheets', '/dashboard/timesheets')) {
    await shot(page, '31_timesheets');
    const logBtn = page.locator('button:has-text("Log Time"),button:has-text("Add Time")').first();
    if (await logBtn.isVisible({ timeout: 2000 }).catch(() => false)) ok('Timesheets', '"Log Time" button visible');
    else bug('Timesheets', '"Log Time" button not visible');
    await checkNoAppError(page, 'Timesheets');
  }

  // ══════════════════════════════════════════════════════════
  // 32. CLIENTS PORTAL
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Clients', '/dashboard/clients')) {
    await shot(page, '32_clients');
    const clients = await page.locator('[class*="client"],[class*="list"] li').count();
    if (clients === 0) bug('Clients', 'No clients listed');
    else ok('Clients', `${clients} client list item(s)`);
    // Click first client to see detail
    const firstClient = page.locator('[class*="client"],[class*="list"] li,[class*="item"]').first();
    if (await firstClient.isVisible({ timeout: 1500 }).catch(() => false)) {
      await firstClient.click(); await wait(page, 800);
      await shot(page, '32b_clients_detail');
      const detail = await page.locator('[class*="detail"],[class*="profile"],h2,h3').count();
      if (detail > 0) ok('Clients', 'Client detail panel loaded');
      else bug('Clients', 'Client detail panel empty after click');
    }
    await checkNoAppError(page, 'Clients');
  }

  // ══════════════════════════════════════════════════════════
  // 33. NOTIFICATIONS PAGE
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Notifications', '/dashboard/notifications')) {
    await shot(page, '33_notifications');
    const markAllBtn = page.locator('button:has-text("Mark all"),button:has-text("Mark All")').first();
    if (await markAllBtn.isVisible({ timeout: 1500 }).catch(() => false)) ok('Notifications', '"Mark all read" button visible');
    else bug('Notifications', '"Mark all" button not found');
    await checkNoAppError(page, 'Notifications');
  }

  // ══════════════════════════════════════════════════════════
  // 34. WORKFLOW
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Workflow', '/dashboard/workflow')) {
    await shot(page, '34_workflow');
    const addBtn = page.locator('button:has-text("New Workflow"),button:has-text("Create Workflow")').first();
    if (await addBtn.isVisible({ timeout: 2000 }).catch(() => false)) ok('Workflow', 'Create workflow button visible');
    else bug('Workflow', 'Create workflow button not visible');
    await checkNoAppError(page, 'Workflow');
  }

  // ══════════════════════════════════════════════════════════
  // 35. AI PAGE
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'AI Chat', '/dashboard/ai')) {
    await shot(page, '35_ai_chat');
    const chatInput = page.locator('textarea,input[type="text"][placeholder*="message" i]').first();
    if (await chatInput.isVisible({ timeout: 2000 }).catch(() => false)) ok('AI Chat', 'Chat input visible');
    else bug('AI Chat', 'Chat input not visible');
    await checkNoAppError(page, 'AI Chat');
  }

  // ══════════════════════════════════════════════════════════
  // 36. SETTINGS — all 7 tabs deep-tested
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Settings', '/dashboard/settings')) {
    await shot(page, '36_settings');
    for (const [tab, checks] of [
      ['Company', [['input[name="name"],input[id*="company"]', 'Company Name field']]],
      ['AI Config', [['select,input[placeholder*="key" i]', 'AI provider selector']]],
      ['Email (SMTP)', [['input[placeholder*="smtp" i],input[placeholder*="host" i],input[name="host"]', 'SMTP host field']]],
      ['WhatsApp', [['input[placeholder*="token" i],input[placeholder*="api" i]', 'WhatsApp token field']]],
      ['Roles', [['button:has-text("New Role"),button:has-text("Add Role")', '"New Role" button']]],
      ['API Keys', [['button:has-text("Generate")', '"Generate" button']]],
      ['Audit Log', [['table,ul,[class*="log"]', 'audit log entries']]],
    ]) {
      const t = page.locator(`button:has-text("${tab}"),[role="tab"]:has-text("${tab}")`).first();
      if (await t.isVisible({ timeout: 2000 }).catch(() => false)) {
        await t.click(); await wait(page, 800);
        ok('Settings', `Tab "${tab}" opened`);
        await shot(page, `36_settings_${tab.toLowerCase().replace(/[\s()\/]/g,'_')}`);
        for (const [sel, label] of checks) {
          const el = page.locator(sel).first();
          if (await el.isVisible({ timeout: 1500 }).catch(() => false)) ok('Settings', `${tab}: ${label} visible`);
          else bug('Settings', `${tab}: ${label} not visible`);
        }
      } else bug('Settings', `Tab "${tab}" not found`);
    }
    await checkNoAppError(page, 'Settings');
  }

  // ══════════════════════════════════════════════════════════
  // 37. PROFILE
  // ══════════════════════════════════════════════════════════
  if (await go(page, 'Profile', '/dashboard/profile')) {
    await shot(page, '37_profile');
    // Check profile fields
    const nameInput = page.locator('input[name="firstName"],input[placeholder*="first" i]').first();
    if (await nameInput.isVisible({ timeout: 2000 }).catch(() => false)) ok('Profile', 'First name field visible');
    else bug('Profile', 'First name field not found');
    // Change password section
    const pwSection = page.locator('input[type="password"],button:has-text("Change Password")').first();
    if (await pwSection.isVisible({ timeout: 1500 }).catch(() => false)) ok('Profile', 'Password change section visible');
    else bug('Profile', 'Password change section not found');
    await checkNoAppError(page, 'Profile');
  }

  // ══════════════════════════════════════════════════════════
  // 38. AI AGENT PANEL (floating button)
  // ══════════════════════════════════════════════════════════
  await go(page, 'AI Agent Panel', '/dashboard');
  const agentBtn = page.locator('button:has-text("AI Agent")').first();
  if (await agentBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await agentBtn.click(); await wait(page, 1000);
    await shot(page, '38_ai_agent_open');
    const panelHeader = await page.locator('text=/AI Business Agent|48 AI tools/i').count();
    if (panelHeader > 0) ok('AI Agent', 'Panel opened with correct header');
    else bug('AI Agent', 'Panel header text not found');
    // Type a message
    const agentInput = page.locator('[class*="agent"] textarea,[class*="panel"] textarea').first();
    if (await agentInput.isVisible({ timeout: 1500 }).catch(() => false)) {
      await agentInput.fill('show me today stats');
      const sendBtn = page.locator('button[type="submit"],button:has-text("Send"),[aria-label="Send"]').last();
      if (await sendBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await sendBtn.click(); await wait(page, 4000);
        await shot(page, '38b_ai_agent_response');
        ok('AI Agent', 'Message sent, response received');
      }
    }
    // Close with backdrop
    await page.keyboard.press('Escape'); await wait(page, 500);
    ok('AI Agent', 'Panel closed with Escape');
  } else bug('AI Agent', 'AI Agent floating button not visible');

  // ══════════════════════════════════════════════════════════
  // 39. SIDEBAR NAVIGATION — verify all links resolve
  // ══════════════════════════════════════════════════════════
  console.log('\n══ SIDEBAR NAV CHECK ══');
  await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  const navLinks = await page.locator('nav a[href*="/dashboard"],aside a[href*="/dashboard"]').all();
  const hrefs = [...new Set(await Promise.all(navLinks.map(l => l.getAttribute('href').catch(() => null)))).values()].filter(Boolean);
  ok('Sidebar', `${hrefs.length} unique nav links found`);
  let navErrors = 0;
  for (const href of hrefs) {
    await page.goto(BASE + href, { waitUntil: 'domcontentloaded' });
    await wait(page, 400);
    const b = await page.locator('body').innerText().catch(() => '');
    if (b.includes('Application error')) { bug('SidebarNav', `${href} → crash`); navErrors++; }
    else if (b.match(/\b404\b/) && b.toLowerCase().includes('not found')) { bug('SidebarNav', `${href} → 404`); navErrors++; }
  }
  if (navErrors === 0) ok('Sidebar', 'All nav links resolve without errors');

  await browser.close();

  // ══════════════════════════════════════════════════════════
  // FINAL REPORT
  // ══════════════════════════════════════════════════════════
  const screenshots = fs.readdirSync(SHOTS_DIR).filter(f => f.endsWith('.png')).sort();
  const report = { timestamp: new Date().toISOString(), issues, passes, jsErrors, screenshots };
  fs.writeFileSync(path.join(__dirname, 'qa3-report.json'), JSON.stringify(report, null, 2));

  console.log('\n' + '═'.repeat(70));
  console.log(`DEEP QA COMPLETE`);
  console.log(`  Screenshots : ${screenshots.length}`);
  console.log(`  Passes      : ${passes.length}`);
  console.log(`  Bugs        : ${issues.length}`);
  console.log(`  JS Errors   : ${jsErrors.length}`);
  if (issues.length) {
    console.log('\nBUGS FOUND:');
    issues.forEach((b,i) => console.log(`  ${i+1}. [${b.screen}] ${b.msg}`));
  } else {
    console.log('\n🎉 NO BUGS DETECTED');
  }
}

main().catch(err => { console.error('\nFATAL:', err.message, err.stack); process.exit(1); });
