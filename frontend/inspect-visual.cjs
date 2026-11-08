const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');

const port = Number(process.env.E2E_PORT || 4179);
const baseUrl = `http://127.0.0.1:${port}`;
let viteProcess;
let browser;

const screenshotDir = path.join(__dirname, 'screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function startVite() {
  viteProcess = spawn(
    process.execPath,
    [path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: __dirname, env: { ...process.env, VITE_API_URL: '' }, stdio: 'ignore' },
  );

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (viteProcess.exitCode !== null) throw new Error(`Vite exited with code ${viteProcess.exitCode}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Vite did not become ready within 45 seconds');
}

const caseData = {
  id: 101,
  case_identifier: 'FS-CASE-D92640C6',
  title: 'Capital Market Disinformation Investigation',
  status: 'Open',
  created_at: new Date().toISOString(),
  evidence_count: 2,
  completed_analyses: 4,
  pending_jobs: 0,
  preliminary_assessment: 'LOW',
  evidence_items: [
    {
      id: 42,
      evidence_identifier: 'FS-EVD-042',
      case_id: 101,
      original_filename: 'wire_transfer_receipt.png',
      mime_type: 'image/png',
      image_format: 'PNG',
      file_size: 204850,
      sha256_hash: '3f786850e387550fdab836ed7e6dc881de23001b70e8707c917bfd7a0be874bc',
      width: 1920,
      height: 1080,
      created_at: new Date().toISOString()
    }
  ],
  recent_audit_events: []
};

const evidenceData = caseData.evidence_items[0];

async function inspectComputedMetrics(page, selector, label) {
  const metrics = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      rect: { width: Math.round(rect.width), height: Math.round(rect.height), top: Math.round(rect.top), left: Math.round(rect.left) },
      color: style.color,
      backgroundColor: style.backgroundColor,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      fontFamily: style.fontFamily,
      border: style.border,
      borderRadius: style.borderRadius,
      padding: style.padding,
      margin: style.margin,
      backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
      opacity: style.opacity,
      boxShadow: style.boxShadow,
      zIndex: style.zIndex
    };
  }, selector);
  console.log(`METRICS [${label}] (${selector}):`, JSON.stringify(metrics, null, 2));
  return metrics;
}

async function main() {
  await startVite();
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = new URL(req.url());
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/auth/login') {
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, username: 'analyst_lead', role: 'ADMIN' }) });
      }
      if (url.pathname === '/api/auth/session') {
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, username: 'analyst_lead', role: 'ADMIN' }) });
      }
      if (url.pathname === '/api/cases') {
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([caseData]) });
      }
      if (url.pathname === `/api/cases/${caseData.case_identifier}` || url.pathname === `/api/cases/${caseData.case_identifier}/overview`) {
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(caseData) });
      }
      if (url.pathname === `/api/cases/${caseData.case_identifier}/evidence`) {
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([evidenceData]) });
      }
      if (url.pathname === `/api/cases/${caseData.case_identifier}/evidence/42` || url.pathname === '/api/evidence/42') {
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(evidenceData) });
      }
      if (url.pathname.includes('/heatmap')) {
        return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ recommended_next_steps: ['Verify integrity seal', 'Run noise variance analysis'] }) });
      }
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    req.continue();
  });

  // ==========================================
  // PAGE A: LOGIN PAGE INSPECTION
  // ==========================================
  console.log('\n=== INSPECTING: PAGE A (LOGIN) ===');
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });

  // Light Mode Login
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.screenshot({ path: path.join(screenshotDir, '01_login_light_desktop.png') });
  await inspectComputedMetrics(page, '.theme-toggle-group', 'Login ThemeToggle Light');
  await inspectComputedMetrics(page, '.login-container, .card, form', 'Login Card Light');

  // Dark Mode Login
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: path.join(screenshotDir, '02_login_dark_desktop.png') });
  await inspectComputedMetrics(page, '.theme-toggle-group', 'Login ThemeToggle Dark');

  // Mobile Login
  await page.setViewport({ width: 375, height: 667 });
  await page.screenshot({ path: path.join(screenshotDir, '03_login_mobile.png') });

  // ==========================================
  // PAGE B: CASES DIRECTORY INSPECTION
  // ==========================================
  console.log('\n=== INSPECTING: PAGE B (CASES DIRECTORY) ===');
  await page.setViewport({ width: 1280, height: 800 });
  // Authenticate
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });
  await page.type('#username', 'analyst_lead');
  await page.type('#password', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname === '/cases');
  await page.waitForSelector('header.topbar');
  await page.waitForSelector('.station-sidebar');

  // Light Mode Cases
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.screenshot({ path: path.join(screenshotDir, '04_cases_light_desktop.png') });
  await inspectComputedMetrics(page, 'header.topbar', 'Topbar Light');
  await inspectComputedMetrics(page, '.topbar-brand', 'Topbar Brand');
  await inspectComputedMetrics(page, '.breadcrumbs-nav', 'Breadcrumbs Station');
  await inspectComputedMetrics(page, '.context-pill', 'Context Pill Station');
  await inspectComputedMetrics(page, '.station-sidebar', 'Station Sidebar Light');
  await inspectComputedMetrics(page, '.sidebar-footer', 'Sidebar Footer');

  // Test Theme Toggle Menu Popup Opacity & Blur
  await page.click('.btn-theme-menu-trigger');
  await page.waitForSelector('.theme-dropdown-menu');
  await inspectComputedMetrics(page, '.theme-dropdown-menu', 'Theme Dropdown Menu Light');
  await page.screenshot({ path: path.join(screenshotDir, '05_theme_dropdown_light.png') });
  await page.click('body'); // dismiss

  // Dark Mode Cases
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: path.join(screenshotDir, '06_cases_dark_desktop.png') });
  await inspectComputedMetrics(page, 'header.topbar', 'Topbar Dark');
  await inspectComputedMetrics(page, '.station-sidebar', 'Station Sidebar Dark');

  await page.click('.btn-theme-menu-trigger');
  await page.waitForSelector('.theme-dropdown-menu');
  await inspectComputedMetrics(page, '.theme-dropdown-menu', 'Theme Dropdown Menu Dark');
  await page.screenshot({ path: path.join(screenshotDir, '07_theme_dropdown_dark.png') });
  await page.click('body');

  // Tablet View Cases (800x800)
  await page.setViewport({ width: 800, height: 800 });
  await page.screenshot({ path: path.join(screenshotDir, '08_cases_tablet.png') });
  await inspectComputedMetrics(page, '.sidebar', 'Sidebar Tablet 800px');

  // Mobile View Cases (375x667)
  await page.setViewport({ width: 375, height: 667 });
  await page.screenshot({ path: path.join(screenshotDir, '09_cases_mobile.png') });
  await inspectComputedMetrics(page, '.mobile-nav-toggle', 'Mobile Toggle');

  // Open mobile drawer
  await page.click('.mobile-nav-toggle');
  await page.waitForSelector('.sidebar.mobile-open');
  await page.screenshot({ path: path.join(screenshotDir, '10_cases_mobile_drawer_open.png') });
  await inspectComputedMetrics(page, '.sidebar.mobile-open', 'Mobile Open Drawer');
  await page.click('.mobile-nav-toggle'); // close

  // ==========================================
  // PAGE C: INDIVIDUAL CASE WORKSPACE
  // ==========================================
  console.log('\n=== INSPECTING: PAGE C (CASE WORKSPACE) ===');
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.goto(`${baseUrl}/cases/${caseData.case_identifier}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.case-sidebar');
  await page.waitForSelector('.case-context-card');

  // Light Mode Case
  await page.screenshot({ path: path.join(screenshotDir, '11_case_workspace_light_desktop.png') });
  await inspectComputedMetrics(page, '.case-context-card', 'Case Context Card Light');
  await inspectComputedMetrics(page, '.case-id-display', 'Case ID Display Light');
  await inspectComputedMetrics(page, '.nav-item.active', 'Active Nav Item Light');
  await inspectComputedMetrics(page, '.breadcrumbs-nav', 'Breadcrumbs Case Overview');
  await inspectComputedMetrics(page, '.context-pill-case', 'Context Pill Case Light');

  // Dark Mode Case
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: path.join(screenshotDir, '12_case_workspace_dark_desktop.png') });
  await inspectComputedMetrics(page, '.case-context-card', 'Case Context Card Dark');
  await inspectComputedMetrics(page, '.nav-item.active', 'Active Nav Item Dark');
  await inspectComputedMetrics(page, '.context-pill-case', 'Context Pill Case Dark');

  // ==========================================
  // PAGE D: NESTED EVIDENCE WORKSPACE
  // ==========================================
  console.log('\n=== INSPECTING: PAGE D (EVIDENCE WORKSPACE) ===');
  await page.goto(`${baseUrl}/cases/${caseData.case_identifier}/evidence/42`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.breadcrumbs-nav');

  // Evidence Detail Light
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.screenshot({ path: path.join(screenshotDir, '13_evidence_detail_light_desktop.png') });
  await inspectComputedMetrics(page, '.breadcrumbs-nav', 'Breadcrumbs Evidence Detail');
  await inspectComputedMetrics(page, '.active-evidence-workbench', 'Active Evidence Workbench Item');

  // Evidence Detail Dark
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: path.join(screenshotDir, '14_evidence_detail_dark_desktop.png') });

  console.log('\n=== ALL INSPECTIONS AND SCREENSHOTS COMPLETED SUCCESSFULLY ===');
}

main()
  .catch(err => {
    console.error('INSPECTION FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (viteProcess) viteProcess.kill();
  });
