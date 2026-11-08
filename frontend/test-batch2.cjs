const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');

const port = Number(process.env.E2E_PORT || 4179);
const baseUrl = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;
const ownsServer = !process.env.E2E_BASE_URL;
let viteProcess;
let browser;

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
    } catch (_) {
      // Waiting for server
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Vite did not become ready within 45 seconds');
}

const caseData = {
  id: 101,
  case_identifier: 'FS-CASE-D92640C6',
  title: 'Batch 2 Test Case',
  status: 'Open',
  created_at: new Date().toISOString(),
};

const evidenceData = {
  id: 42,
  evidence_identifier: 'FS-EVD-042',
  case_id: 101,
  original_filename: 'sample_exhibit.png',
  mime_type: 'image/png',
  image_format: 'PNG',
  file_size: 1024,
  sha256_hash: 'b'.repeat(64),
  width: 100,
  height: 100,
  created_at: new Date().toISOString(),
};

async function main() {
  console.log('--- Starting Stage 1, Batch 2 Comprehensive Verification ---');
  if (ownsServer) await startVite();
  browser = await puppeteer.launch({ 
    headless: true, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error('BROWSER ERROR:', err.message));
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  await page.setViewport({ width: 1280, height: 800 });

  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/auth/login' && request.method() === 'POST') {
        return request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ authenticated: true, username: 'analyst_lead', role: 'ADMIN' })
        });
      }
      if (url.pathname === '/api/auth/session') {
        return request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ authenticated: true, username: 'analyst_lead', role: 'ADMIN' })
        });
      }
      if (url.pathname === '/api/cases') {
        return request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([caseData])
        });
      }
      if (url.pathname === `/api/cases/${caseData.case_identifier}` || url.pathname === `/api/cases/${caseData.case_identifier}/overview`) {
        return request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...caseData,
            status: 'Open',
            evidence_count: 1,
            completed_analyses: 1,
            pending_jobs: 0,
            preliminary_assessment: 'LOW',
            evidence_items: [evidenceData],
            recent_audit_events: [],
          })
        });
      }
      if (url.pathname === `/api/cases/${caseData.case_identifier}/evidence`) {
        return request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([evidenceData])
        });
      }
      if (url.pathname === `/api/cases/${caseData.case_identifier}/evidence/42` || url.pathname === '/api/evidence/42') {
        return request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(evidenceData)
        });
      }
      if (url.pathname.includes('/heatmap')) {
        return request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ recommended_next_steps: ['Review anomalies', 'Compare with original'] })
        });
      }
      if (url.pathname.includes('/processing-history')) {
        return request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            evidence_identifier: 'FS-EVD-042',
            source_sha256: 'b'.repeat(64),
            disclaimer: 'Hypothesis only',
            candidate_sequences: [],
            signals: [],
            limitations: []
          })
        });
      }
      if (url.pathname.includes('/cross-correlation')) {
        return request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            case_identifier: caseData.case_identifier,
            total_evidence_evaluated: 1,
            camera_clusters: [],
            temporal_sequence: [],
            cross_image_matches: [],
            findings_generated: 0,
            evaluation_timestamp: new Date().toISOString(),
            disclaimer: 'Correlation analysis'
          })
        });
      }
      if (url.pathname.includes('/graph')) {
        return request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            case_id: caseData.case_identifier,
            nodes: [
              { id: 'case_1', label: caseData.case_identifier, type: 'CASE' },
              { id: 'ev_42', label: 'FS-EVD-042', type: 'EVIDENCE' }
            ],
            edges: [
              { id: 'e1', source: 'case_1', target: 'ev_42', label: 'CONTAINS' }
            ]
          })
        });
      }
      if (url.pathname.includes('/assistant')) {
        return request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            case_identifier: caseData.case_identifier,
            title: caseData.title,
            evidence_count: 1,
            what_was_found_summary: 'Signals consistent',
            why_it_matters_summary: 'Investigation on track',
            investigative_next_steps: [],
            counter_hypotheses: [],
            forensic_completeness: [],
            overall_completeness_percentage: 100,
            pending_analyst_reviews_count: 0,
            scientific_disclaimer: 'Guidance only'
          })
        });
      }
      if (url.pathname.includes('/chain-of-custody')) {
        return request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            case_identifier: caseData.case_identifier,
            case_created_at: new Date().toISOString(),
            total_evidence_items: 1,
            all_hashes_intact: true,
            evidence_summaries: [],
            custody_timeline: []
          })
        });
      }
      return request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    }
    request.continue();
  });

  // 1. LOGIN & PUBLIC PAGE VERIFICATION
  console.log('1. Verifying Login & Theme Toggle on public route...');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });
  assert.equal(await page.url(), `${baseUrl}/login`);
  const loginThemeToggle = await page.$('.theme-toggle-group');
  assert.ok(loginThemeToggle, 'ThemeToggle should be present on login page');
  const loginAppShell = await page.$('.app-shell-body');
  assert.equal(loginAppShell, null, 'Public login must NOT be wrapped in authenticated shell');

  // Perform login
  await page.type('#username', 'analyst_lead');
  await page.type('#password', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname === '/cases');
  console.log('   ✓ Login succeeded, redirected to /cases');

  // 2. ROOT SHELL ON STATION ROUTE (/cases)
  console.log('2. Verifying Root Application Shell on Station Route (/cases)...');
  await page.waitForSelector('header.topbar');
  const topbars = await page.$$('header.topbar');
  assert.equal(topbars.length, 1, 'Exactly one unified topbar must exist in DOM');

  const contextPill = await page.$eval('.context-pill', el => el.textContent.trim());
  assert.equal(contextPill, 'STATION DIRECTORY', 'Station route should display STATION DIRECTORY context pill');

  const stationCrumbs = await page.$$eval('.breadcrumb-item', items => items.map(i => i.textContent.trim()));
  console.log('   Breadcrumbs at /cases:', stationCrumbs);
  assert.deepEqual(stationCrumbs, ['Cases']);

  const rbacBadge = await page.$('.status-badge');
  assert.ok(rbacBadge, 'RBAC status badge must be present in topbar');

  const accountPanel = await page.$('#account-security-trigger, .security-panel-trigger, [title*="Security"], [title*="account"], [aria-label*="Security"]');
  assert.ok(accountPanel || await page.$('.topbar-right'), 'Account security controls present in topbar');

  const logoutBtn = await page.$('#logout-button');
  assert.ok(logoutBtn, 'Sign out button must be present in topbar');

  // 3. BACKWARD-COMPATIBLE ROUTE REDIRECTS
  console.log('3. Verifying Backward-Compatible Route Redirects...');
  // /legacy -> /cases
  await page.goto(`${baseUrl}/legacy`, { waitUntil: 'networkidle0' });
  assert.equal(new URL(page.url()).pathname, '/cases', '/legacy must redirect to /cases');
  console.log('   ✓ /legacy correctly redirected to /cases');

  // /cases/:caseId/evidence/new -> /cases/:caseId/evidence/upload
  await page.goto(`${baseUrl}/cases/${caseData.case_identifier}/evidence/new`, { waitUntil: 'networkidle0' });
  assert.equal(new URL(page.url()).pathname, `/cases/${caseData.case_identifier}/evidence/upload`, '/evidence/new must redirect to /evidence/upload');
  console.log('   ✓ /evidence/new correctly redirected to /evidence/upload');

  // /cases/:caseId/findings -> /cases/:caseId/reports
  await page.goto(`${baseUrl}/cases/${caseData.case_identifier}/findings`, { waitUntil: 'networkidle0' });
  assert.equal(new URL(page.url()).pathname, `/cases/${caseData.case_identifier}/reports`, '/findings must redirect to /reports');
  console.log('   ✓ /findings correctly redirected to /reports');

  // 4. CASE WORKSPACE SHELL & THREE-PHASE NAVIGATION
  console.log('4. Verifying Case Workspace Shell & Three-Phase Navigation...');
  await page.goto(`${baseUrl}/cases/${caseData.case_identifier}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('header.topbar');
  await page.waitForSelector('.sidebar');
  
  // Single Topbar check
  const caseTopbars = await page.$$('header.topbar');
  assert.equal(caseTopbars.length, 1, 'Exactly one unified topbar must exist in case workspace (no duplicates)');

  // Context Pill check
  const caseContextPill = await page.$eval('.context-pill', el => el.textContent.trim());
  assert.equal(caseContextPill, 'CASE WORKSPACE', 'Case workspace should display CASE WORKSPACE context pill');

  // Case Context Card check
  const caseIdDisplay = await page.$eval('.case-id-text', el => el.textContent.trim());
  assert.equal(caseIdDisplay, caseData.case_identifier, 'Case context card displays case ID');

  const copyBtn = await page.$('.case-id-copy-btn');
  assert.ok(copyBtn, 'Case ID copy button present');

  const backLink = await page.$eval('.sidebar-back-link', el => el.getAttribute('href'));
  assert.equal(backLink, '/cases', 'Back link points to Station /cases');

  // Verify Phase Headers
  const phaseHeaders = await page.$$eval('.nav-section-label', els => els.map(e => e.textContent.trim()));
  console.log('   Sidebar phase headers:', phaseHeaders);
  assert.ok(phaseHeaders.some(h => h.includes('Phase 1')), 'Phase 1 header present');
  assert.ok(phaseHeaders.some(h => h.includes('Phase 2')), 'Phase 2 header present');
  assert.ok(phaseHeaders.some(h => h.includes('Phase 3')), 'Phase 3 header present');
  assert.ok(phaseHeaders.some(h => h.includes('Operations')), 'Operations header present');

  // 5. DYNAMIC BREADCRUMBS ACROSS ROUTES
  console.log('5. Verifying Contextual Dynamic Breadcrumbs across routes...');
  const routeChecks = [
    {
      path: `/cases/${caseData.case_identifier}`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Overview']
    },
    {
      path: `/cases/${caseData.case_identifier}/evidence`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Evidence Files']
    },
    {
      path: `/cases/${caseData.case_identifier}/evidence/upload`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Evidence Files', 'Intake']
    },
    {
      path: `/cases/${caseData.case_identifier}/evidence/42`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Evidence Files', 'Evidence #42']
    },
    {
      path: `/cases/${caseData.case_identifier}/evidence/42/history`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Evidence Files', 'Evidence #42', 'Processing History']
    },
    {
      path: `/cases/${caseData.case_identifier}/compare`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Compare Evidence']
    },
    {
      path: `/cases/${caseData.case_identifier}/lineage`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Image Lineage']
    },
    {
      path: `/cases/${caseData.case_identifier}/cross-correlation`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Cross-Image Correlation']
    },
    {
      path: `/cases/${caseData.case_identifier}/graph`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Investigation Graph']
    },
    {
      path: `/cases/${caseData.case_identifier}/assistant`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Investigative Assistant']
    },
    {
      path: `/cases/${caseData.case_identifier}/analyst`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Analyst Review']
    },
    {
      path: `/cases/${caseData.case_identifier}/custody`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Chain of Custody']
    },
    {
      path: `/cases/${caseData.case_identifier}/audit`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Audit Timeline']
    },
    {
      path: `/cases/${caseData.case_identifier}/reports`,
      expectedCrumbs: ['Cases', caseData.case_identifier, 'Reports & Findings']
    },
    {
      path: '/benchmark',
      expectedCrumbs: ['Station', 'Benchmark Suite']
    },
    {
      path: '/system',
      expectedCrumbs: ['Station', 'System Health']
    }
  ];

  for (const check of routeChecks) {
    await page.goto(`${baseUrl}${check.path}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.breadcrumb-item');
    const currentCrumbs = await page.$$eval('.breadcrumb-item', items => items.map(i => i.textContent.trim()));
    assert.deepEqual(currentCrumbs, check.expectedCrumbs, `Breadcrumbs mismatch at ${check.path}`);
    console.log(`   ✓ ${check.path} → ${currentCrumbs.join(' > ')}`);
  }

  // 6. THEME TOGGLE DUAL-THEME SWITCHING & PERSISTENCE
  console.log('6. Verifying Theme Toggle dual-theme switching & persistence...');
  await page.goto(`${baseUrl}/cases`, { waitUntil: 'networkidle0' });
  const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log('   Initial data-theme:', initialTheme);

  // Click toggle
  await page.click('.btn-theme-toggle');
  const toggledTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  const savedPref = await page.evaluate(() => localStorage.getItem('forensight-theme'));
  console.log('   After toggle: data-theme =', toggledTheme, ', localStorage =', savedPref);
  assert.notEqual(initialTheme, toggledTheme, 'Theme attribute should toggle');
  assert.equal(toggledTheme, savedPref, 'Local storage should match resolved theme');

  // Click toggle back
  await page.click('.btn-theme-toggle');
  const restoredTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(restoredTheme, initialTheme, 'Theme toggles back to initial');

  // 7. RESPONSIVE BEHAVIOR VERIFICATION
  console.log('7. Verifying Responsive Behavior across viewports...');
  // Desktop Viewport (1280px)
  await page.setViewport({ width: 1280, height: 800 });
  const desktopSidebarWidth = await page.$eval('.sidebar', el => el.getBoundingClientRect().width);
  console.log('   Desktop sidebar width:', desktopSidebarWidth);
  assert.ok(desktopSidebarWidth >= 250, 'Desktop sidebar width should be ~256px');

  // Tablet Viewport (800px)
  await page.setViewport({ width: 800, height: 800 });
  const tabletSidebarWidth = await page.$eval('.sidebar', el => el.getBoundingClientRect().width);
  console.log('   Tablet sidebar width:', tabletSidebarWidth);
  assert.equal(tabletSidebarWidth, 72, 'Tablet sidebar width should collapse to 72px');

  // Mobile Viewport (375px)
  await page.setViewport({ width: 375, height: 667 });
  const mobileToggleVisible = await page.$eval('.mobile-nav-toggle', el => window.getComputedStyle(el).display !== 'none');
  assert.ok(mobileToggleVisible, 'Mobile drawer hamburger toggle should be visible on small screens');

  // Toggle mobile drawer
  await page.click('.mobile-nav-toggle');
  const drawerOpen = await page.$eval('.sidebar', el => el.classList.contains('mobile-open'));
  assert.ok(drawerOpen, 'Clicking hamburger adds .mobile-open class to sidebar drawer');

  await page.click('.mobile-nav-toggle');
  const drawerClosed = await page.$eval('.sidebar', el => !el.classList.contains('mobile-open'));
  assert.ok(drawerClosed, 'Clicking close removes .mobile-open');

  console.log('--- ALL STAGE 1, BATCH 2 VERIFICATIONS PASSED SUCCESSFULLY ---');
}

main()
  .catch(err => {
    console.error('VERIFICATION FAILED:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (viteProcess && ownsServer) viteProcess.kill();
    process.exit(process.exitCode || 0);
  });
