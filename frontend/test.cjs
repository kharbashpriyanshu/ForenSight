const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');

const port = Number(process.env.E2E_PORT || 4179);
const baseUrl = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;
const ownsServer = !process.env.E2E_BASE_URL;
let viteProcess;
let browser;
let fixturePath;

const state = {
  caseCreated: false,
  evidenceUploaded: false,
  jobQueued: false,
  jobPolls: 0,
  reportGenerated: false,
  requestedApiPaths: [],
  healthPayload: {
    status: 'healthy',
    service: 'forensight',
    api_gateway: 'healthy',
    platform_mode: 'dev_eager_mode',
    background_execution: 'eager_fallback',
    database: 'healthy',
    redis: 'unavailable',
    celery_worker: 'eager_fallback',
    storage: 'healthy',
    environment: 'development',
  },
  graphPayload: {
    case_id: 'FS-CASE-E2E001',
    nodes: [
      { id: 'case:FS-CASE-E2E001', type: 'CASE', label: 'Browser workflow check', metadata: { identifier: 'FS-CASE-E2E001', status: 'Open' } },
    ],
    edges: [],
  },
};

const caseData = {
  id: 101,
  case_identifier: 'FS-CASE-E2E001',
  title: 'Browser workflow check',
  status: 'Open',
  created_at: new Date().toISOString(),
};

const evidenceData = {
  id: 201,
  evidence_identifier: 'FS-EVD-E2E001',
  case_id: 101,
  original_filename: 'browser-fixture.png',
  mime_type: 'image/png',
  image_format: 'PNG',
  file_size: 68,
  sha256_hash: 'a'.repeat(64),
  width: 1,
  height: 1,
  created_at: new Date().toISOString(),
  intake_context: {},
};

const reportData = {
  id: 301,
  report_identifier: 'FS-RPT-E2E001',
  case_id: caseData.case_identifier,
  generated_at: new Date().toISOString(),
  rule_version: 'E2E',
  report_type: 'PDF',
  status: 'COMPLETED',
};

const heatmapData = {
  evidence_id: evidenceData.id,
  width: 1,
  height: 1,
  layers: [],
  composite_regions_count: 0,
  what_was_found: 'No test signals were injected.',
  why_it_matters: 'This is a UI workflow check only.',
  recommended_next_steps: [],
  limitations: 'Mocked data; not a forensic evaluation.',
};

function jsonResponse(body, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) };
}

async function clickButton(page, text, exact = false) {
  const buttons = await page.$$('button');
  for (const button of buttons) {
    const label = await button.evaluate((element) => element.innerText.replace(/\s+/g, ' ').trim());
    if (exact ? label === text : label.includes(text)) {
      await button.click();
      return;
    }
    await button.dispose();
  }
  throw new Error(`Could not find button: ${text}`);
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
    } catch (_) {
      // The development server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Vite did not become ready within 45 seconds');
}

async function mockApiRequest(request) {
  const url = new URL(request.url());
  const route = `${request.method()} ${url.pathname}`;
  state.requestedApiPaths.push(route);

  if (url.pathname.endsWith('/timeline') || url.pathname.endsWith('/custody')) {
    return jsonResponse({ detail: 'Not Found' }, 404);
  }

  if (url.pathname === '/api/auth/login' && request.method() === 'POST') {
    return jsonResponse({ authenticated: true, username: 'workflow-user', role: 'INVESTIGATOR', mfa_enabled: false });
  }
  if (url.pathname === '/api/auth/session' && request.method() === 'GET') {
    return jsonResponse({ authenticated: true, username: 'workflow-user', role: 'INVESTIGATOR' });
  }
  if (url.pathname === '/api/health' && request.method() === 'GET') {
    return jsonResponse(state.healthPayload);
  }
  if (url.pathname === '/api/cases' && request.method() === 'GET') {
    return jsonResponse(state.caseCreated ? [caseData] : []);
  }
  if (url.pathname === '/api/cases' && request.method() === 'POST') {
    state.caseCreated = true;
    return jsonResponse(caseData);
  }
  if (url.pathname === `/api/cases/${caseData.case_identifier}` && request.method() === 'GET') {
    return jsonResponse(caseData);
  }
  if (url.pathname === `/api/cases/${caseData.case_identifier}/overview` && request.method() === 'GET') {
    return jsonResponse({
      case_identifier: caseData.case_identifier,
      title: caseData.title,
      status: caseData.status,
      created_at: caseData.created_at,
      evidence_count: state.evidenceUploaded ? 1 : 0,
      analysis_count: state.jobQueued ? 1 : 0,
      completed_analysis_count: state.jobQueued ? 1 : 0,
      failed_analysis_count: 0,
      running_job_count: 0,
      pending_job_count: 0,
      findings_count: 0,
      audit_event_count: 0,
      assessment_status: 'INSUFFICIENT_EVIDENCE',
      latest_assessment: null,
    });
  }
  if (url.pathname === `/api/cases/${caseData.case_identifier}/evidence/${evidenceData.id}` && request.method() === 'GET') {
    return jsonResponse(evidenceData);
  }
  if (url.pathname === `/api/cases/${caseData.case_identifier}/evidence` && request.method() === 'GET') {
    return jsonResponse(state.evidenceUploaded ? [evidenceData] : []);
  }
  if ((url.pathname === '/api/cases/intake' || url.pathname === `/api/cases/${caseData.case_identifier}/evidence`) && request.method() === 'POST') {
    state.evidenceUploaded = true;
    return jsonResponse(evidenceData);
  }
  if (url.pathname === `/api/evidence/${evidenceData.id}` && request.method() === 'GET') {
    return jsonResponse(evidenceData);
  }
  if (url.pathname === `/api/evidence/${evidenceData.id}/raw`) {
    return { status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ZkAAAAASUVORK5CYII=', 'base64') };
  }
  if (url.pathname === `/api/evidence/${evidenceData.id}/jobs` && request.method() === 'GET') {
    return jsonResponse(state.jobQueued ? [{
      id: 401,
      job_identifier: 'FS-JOB-E2E001',
      evidence_id: evidenceData.id,
      analysis_id: 501,
      analysis_type: 'metadata',
      engine_version: 'V3.0.0',
      status: 'COMPLETED',
      progress_percent: 100,
      progress_message: 'Analysis completed',
      attempt_count: 1,
      queued_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    }] : []);
  }
  if (url.pathname === `/api/evidence/${evidenceData.id}/analyses` && request.method() === 'GET') {
    return jsonResponse([]);
  }
  if (url.pathname === `/api/evidence/${evidenceData.id}/heatmap`) return jsonResponse(heatmapData);
  if (url.pathname === `/api/jobs/analysis/${evidenceData.id}/metadata` && request.method() === 'POST') {
    state.jobQueued = true;
    return jsonResponse({
      id: 401,
      job_identifier: 'FS-JOB-E2E001',
      evidence_id: evidenceData.id,
      analysis_id: null,
      analysis_type: 'metadata',
      engine_version: 'V3.0.0',
      status: 'QUEUED',
      progress_percent: 0,
      progress_message: 'Queued',
      attempt_count: 0,
      queued_at: new Date().toISOString(),
    }, 202);
  }
  if (url.pathname === '/api/jobs/401' && request.method() === 'GET') {
    state.jobPolls += 1;
    return jsonResponse({
      id: 401,
      job_identifier: 'FS-JOB-E2E001',
      evidence_id: evidenceData.id,
      analysis_id: state.jobPolls > 1 ? 501 : null,
      analysis_type: 'metadata',
      engine_version: 'V3.0.0',
      status: state.jobPolls > 1 ? 'COMPLETED' : 'RUNNING',
      progress_percent: state.jobPolls > 1 ? 100 : 45,
      progress_message: state.jobPolls > 1 ? 'Analysis completed' : 'Reading metadata fields',
      attempt_count: 1,
      queued_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: state.jobPolls > 1 ? new Date().toISOString() : null,
    });
  }
  if (url.pathname === '/api/analysis/501') {
    return jsonResponse({ id: 501, analysis_type: 'METADATA', status: 'completed', summary: 'Mock analysis completed.', structured_findings: {} });
  }
  if (url.pathname.includes('/fusion/normalize')) return jsonResponse({ observations: [] });
  if (url.pathname.includes('/fusion/correlate')) return jsonResponse({ assessment: { level: 'INSUFFICIENT_EVIDENCE' } });
  if (url.pathname === `/api/cases/${caseData.case_identifier}/reports` && request.method() === 'GET') {
    return jsonResponse(state.reportGenerated ? [reportData] : []);
  }
  if (url.pathname === `/api/cases/${caseData.case_identifier}/reports` && request.method() === 'POST') {
    state.reportGenerated = true;
    return jsonResponse(reportData);
  }
  if (url.pathname === `/api/cases/${caseData.case_identifier}/audit` && request.method() === 'GET') {
    return jsonResponse([]);
  }
  if (url.pathname === `/api/cases/${caseData.case_identifier}/chain-of-custody` && request.method() === 'GET') {
    return jsonResponse([]);
  }
  if (url.pathname === `/api/cases/${caseData.case_identifier}/graph` && request.method() === 'GET') {
    return jsonResponse(state.graphPayload);
  }

  // Other workspace widgets can make optional calls. Keep the test isolated from a real API.
  if (route.startsWith('GET ')) return jsonResponse([]);
  return jsonResponse({});
}

async function main() {
  if (ownsServer) await startVite();
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => console.error('Browser page error:', error.message));
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      try {
        if (request.method() !== 'GET') console.log(`MOCK ${request.method()} ${new URL(request.url()).pathname}`);
        await request.respond(await mockApiRequest(request));
      } catch (error) {
        await request.abort('failed');
        console.error(`Mock API failed for ${request.method()} ${request.url()}:`, error.message);
      }
    } else {
      await request.continue();
    }
  });

  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });
  await page.type('#username', 'workflow-user');
  await page.type('#password', 'workflow-password');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname === '/cases');
  await page.waitForFunction(() => document.querySelector('h1')?.textContent.trim() === 'Forensic Investigations');
  assert.equal(await page.$eval('h1', (element) => element.textContent.trim()), 'Forensic Investigations');

  await page.type('input[placeholder^="Investigation Reference"]', 'Browser workflow check');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname === '/cases/FS-CASE-E2E001');

  await page.goto(`${baseUrl}/cases/${caseData.case_identifier}/evidence/new`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input[type="file"]');
  fixturePath = path.join(os.tmpdir(), `forensight-e2e-${process.pid}.png`);
  fs.writeFileSync(fixturePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ZkAAAAASUVORK5CYII=', 'base64'));
  await (await page.$('input[type="file"]')).uploadFile(fixturePath);
  await page.waitForFunction(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.innerText.includes('Preserve file & start intake record'));
    return Boolean(button && !button.disabled);
  });
  await clickButton(page, 'Preserve file & start intake record');
  try {
    await page.waitForFunction(() => document.body.innerText.includes('Proceed to Forensic Examination'), { timeout: 4000 });
    await clickButton(page, 'Proceed to Forensic Examination');
  } catch (_e) {
    // Proceed directly if already transitioned
  }
  await page.waitForFunction(() => document.body.innerText.includes('Chain of Custody & Storage Verification'));
  assert.equal(state.evidenceUploaded, true, 'evidence upload endpoint was called');

  await clickButton(page, 'Core DIP Engines');
  await clickButton(page, 'Queue Analysis', true);
  await page.waitForFunction(() => document.body.innerText.includes('Mock analysis completed.'));
  assert.equal(state.jobQueued, true, 'analysis job endpoint was called');
  assert.ok(state.jobPolls >= 2, 'job progress endpoint was polled');

  await page.goto(`${baseUrl}/cases/${caseData.case_identifier}/reports`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => {
    const button = document.querySelector('button.primary-button');
    return Boolean(button && !button.disabled);
  });
  await page.click("button.primary-button");
  await page.waitForFunction(() => document.body.innerText.includes('FS-RPT-E2E001'));
  assert.equal(state.reportGenerated, true, 'report generation endpoint was called');

  // Regression check: case-card hover prefetches /audit (never /timeline)
  await page.goto(`${baseUrl}/cases`, { waitUntil: 'networkidle0' });
  const caseCardSelector = `a[href="/cases/${caseData.case_identifier}"]`;
  await page.waitForSelector(caseCardSelector);
  state.requestedApiPaths = [];
  await page.hover(caseCardSelector);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.ok(
    state.requestedApiPaths.includes(`GET /api/cases/${caseData.case_identifier}`),
    'case card hover should prefetch case detail',
  );
  assert.ok(
    state.requestedApiPaths.includes(`GET /api/cases/${caseData.case_identifier}/evidence`),
    'case card hover should prefetch case evidence',
  );
  assert.ok(
    state.requestedApiPaths.includes(`GET /api/cases/${caseData.case_identifier}/audit`),
    'case card hover should prefetch /audit',
  );
  assert.equal(
    state.requestedApiPaths.some((p) => p.endsWith('/timeline')),
    false,
    'case card hover must never prefetch stale /timeline route',
  );

  // Regression check: Chain of Custody sidebar hover prefetches /chain-of-custody (never /custody)
  await page.goto(`${baseUrl}/cases/${caseData.case_identifier}`, { waitUntil: 'networkidle0' });
  const custodyNavSelector = `a[href="/cases/${caseData.case_identifier}/custody"]`;
  await page.waitForSelector(custodyNavSelector);
  state.requestedApiPaths = [];
  await page.hover(custodyNavSelector);
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.ok(
    state.requestedApiPaths.includes(`GET /api/cases/${caseData.case_identifier}/chain-of-custody`),
    'Chain of Custody sidebar hover should prefetch /chain-of-custody',
  );
  assert.equal(
    state.requestedApiPaths.some((p) => p.endsWith('/custody')),
    false,
    'Chain of Custody sidebar hover must never prefetch stale /custody route',
  );

  // System Health checks: dev eager mode & degraded non-eager mode
  await page.goto(`${baseUrl}/system`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="health-card-gateway"]');
  const devGatewayText = await page.$eval('[data-testid="health-card-gateway"]', (el) => el.innerText);
  const devPlatformText = await page.$eval('[data-testid="platform-summary-badge"]', (el) => el.innerText);
  const devCeleryText = await page.$eval('[data-testid="health-card-celery"]', (el) => el.innerText);
  const devRedisText = await page.$eval('[data-testid="health-card-redis"]', (el) => el.innerText);
  assert.ok(devGatewayText.includes('HEALTHY') && !devGatewayText.includes('DEGRADED'), 'API Gateway must show HEALTHY in dev eager mode');
  assert.ok(devPlatformText.includes('DEV EAGER MODE'), 'Platform badge must show DEV EAGER MODE');
  assert.ok(devCeleryText.includes('EAGER FALLBACK'), 'Celery card must show EAGER FALLBACK');
  assert.ok(devRedisText.includes('UNAVAILABLE'), 'Redis card must truthfully show UNAVAILABLE');

  state.healthPayload = {
    status: 'degraded',
    service: 'forensight',
    api_gateway: 'healthy',
    platform_mode: 'degraded',
    background_execution: 'unavailable',
    database: 'healthy',
    redis: 'unavailable',
    celery_worker: 'unavailable',
    storage: 'healthy',
    environment: 'production',
  };
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="platform-summary-badge"]');
  const prodGatewayText = await page.$eval('[data-testid="health-card-gateway"]', (el) => el.innerText);
  const prodPlatform = await page.$eval('[data-testid="platform-summary-badge"]', (el) => ({
    text: el.innerText,
    color: getComputedStyle(el).color,
  }));
  assert.ok(prodGatewayText.includes('HEALTHY'), 'API Gateway remains HEALTHY when FastAPI responds');
  assert.ok(prodPlatform.text.includes('DEGRADED'), 'Platform badge must show DEGRADED when non-eager async dependencies fail');
  assert.notEqual(prodPlatform.color, 'rgb(21, 128, 61)', 'DEGRADED badge must not use green success color');
  assert.notEqual(prodPlatform.color, 'rgb(52, 211, 153)', 'DEGRADED badge must not use dark-mode green success color');

  // Investigation Graph checks: empty state, 9-node/11-link layout, zoom/reset, canvas selection, inspector overflow, resize & theme
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${baseUrl}/cases/${caseData.case_identifier}/graph`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="graph-empty-state"]');
  const emptyStats = await page.$eval('[data-testid="graph-stats-pill"]', (el) => el.innerText);
  assert.ok(emptyStats.includes('1 NODES') && emptyStats.includes('0 LINKS'), `Empty graph should show 1 NODES • 0 LINKS, got: ${emptyStats}`);

  // 2-6: 9-node, 11-link populated graph
  state.graphPayload = {
    case_id: caseData.case_identifier,
    nodes: [
      { id: `case:${caseData.case_identifier}`, type: 'CASE', label: caseData.title, metadata: { identifier: caseData.case_identifier, status: 'Open' } },
      { id: 'ev:201', type: 'EVIDENCE', label: 'original_capture.jpg', metadata: { identifier: 'FS-EVD-201', sha256: 'a'.repeat(64) } },
      { id: 'ev:202', type: 'EVIDENCE', label: 'spliced_suspect.jpg', metadata: { identifier: 'FS-EVD-202', sha256: 'b'.repeat(64) } },
      { id: 'anl:501', type: 'ANALYSIS', label: 'ELA Analysis', metadata: { identifier: 'FS-ANL-501', status: 'completed' } },
      { id: 'anl:502', type: 'ANALYSIS', label: 'Noise Residual Analysis', metadata: { identifier: 'FS-ANL-502', status: 'completed' } },
      { id: 'obs:601', type: 'OBSERVATION', label: 'Obs: ela (ERROR)', metadata: { metric: 'mean_ela', value: 18.4 } },
      { id: 'obs:602', type: 'OBSERVATION', label: 'Obs: noise (SNR)', metadata: { metric: 'snr', value: 21.7 } },
      { id: 'fnd:701', type: 'FINDING', label: 'Localized ELA Elevation', metadata: { identifier: 'FS-FND-701', severity_label: 'HIGH' } },
      { id: 'rpt:301', type: 'REPORT', label: 'Report FS-RPT-E2E001', metadata: { identifier: 'FS-RPT-E2E001', status: 'COMPLETED' } },
    ],
    edges: [
      { source: `case:${caseData.case_identifier}`, target: 'ev:201', type: 'CONTAINS' },
      { source: `case:${caseData.case_identifier}`, target: 'ev:202', type: 'CONTAINS' },
      { source: 'ev:202', target: 'ev:201', type: 'DERIVED_FROM' },
      { source: 'ev:201', target: 'anl:501', type: 'PRODUCED' },
      { source: 'ev:202', target: 'anl:502', type: 'PRODUCED' },
      { source: 'anl:501', target: 'obs:601', type: 'PRODUCED' },
      { source: 'anl:502', target: 'obs:602', type: 'PRODUCED' },
      { source: 'obs:601', target: 'obs:602', type: 'SUPPORTS' },
      { source: 'obs:601', target: 'fnd:701', type: 'SUPPORTS' },
      { source: 'ev:202', target: 'fnd:701', type: 'SUPPORTS' },
      { source: `case:${caseData.case_identifier}`, target: 'rpt:301', type: 'GENERATED' },
    ],
  };
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="graph-stats-pill"]');
  await page.waitForFunction(() => window.__forensightGraphMetrics && window.__forensightGraphMetrics.nodes.length === 9);
  const populatedStats = await page.$eval('[data-testid="graph-stats-pill"]', (el) => el.innerText);
  assert.ok(populatedStats.includes('9 NODES') && populatedStats.includes('11 LINKS'), `Populated graph should show 9 NODES • 11 LINKS, got: ${populatedStats}`);

  // Assert 2D canvas utilization, readability (zoom >= 0.65), and non-overlapping nodes in Hierarchical DAG
  const dagMetrics = await page.evaluate(() => window.__forensightGraphMetrics);
  assert.equal(dagMetrics.layoutMode, 'dag', 'Default layout mode should be dag');
  assert.ok(dagMetrics.zoom >= 0.65, `Initial zoom for 9-node graph should keep labels readable (>= 0.65), got: ${dagMetrics.zoom}`);
  const xs = dagMetrics.nodes.map((n) => n.screenX);
  const ys = dagMetrics.nodes.map((n) => n.screenY);
  const bboxW = Math.max(...xs) - Math.min(...xs);
  const bboxH = Math.max(...ys) - Math.min(...ys);
  assert.ok(bboxW / dagMetrics.width >= 0.35, `DAG graph should span >= 35% of canvas width, got ${(bboxW / dagMetrics.width).toFixed(2)}`);
  assert.ok(bboxH / dagMetrics.height >= 0.25, `DAG graph must not collapse into a horizontal strip (height ratio >= 0.25), got ${(bboxH / dagMetrics.height).toFixed(2)}`);
  for (let i = 0; i < dagMetrics.nodes.length; i++) {
    for (let j = i + 1; j < dagMetrics.nodes.length; j++) {
      const a = dagMetrics.nodes[i];
      const b = dagMetrics.nodes[j];
      const dist = Math.hypot(a.screenX - b.screenX, a.screenY - b.screenY);
      assert.ok(dist >= a.radius + b.radius, `Nodes ${a.id} and ${b.id} must not overlap (dist=${dist.toFixed(1)})`);
    }
  }

  // 6: Evidence Clusters layout
  await clickButton(page, 'Evidence Clusters');
  await page.waitForFunction(() => window.__forensightGraphMetrics?.layoutMode === 'cluster');
  await new Promise((resolve) => setTimeout(resolve, 100));
  const clusterMetrics = await page.evaluate(() => window.__forensightGraphMetrics);
  assert.equal(clusterMetrics.nodes.length, 9, 'Cluster layout must preserve all 9 nodes');
  const cXs = clusterMetrics.nodes.map((n) => n.screenX);
  const cYs = clusterMetrics.nodes.map((n) => n.screenY);
  assert.ok((Math.max(...cYs) - Math.min(...cYs)) / clusterMetrics.height >= 0.25, 'Cluster layout must use vertical space');
  assert.ok((Math.max(...cXs) - Math.min(...cXs)) / clusterMetrics.width >= 0.25, 'Cluster layout must use horizontal space');

  // Switch back to Hierarchical DAG
  await clickButton(page, 'Hierarchical DAG');
  await page.waitForFunction(() => window.__forensightGraphMetrics?.layoutMode === 'dag');
  await new Promise((resolve) => setTimeout(resolve, 100));

  // 7: Zoom in, Zoom out, and Reset View
  const baseZoom = await page.evaluate(() => window.__forensightGraphMetrics.zoom);
  await page.click('button[title="Zoom In"]');
  await new Promise((resolve) => setTimeout(resolve, 80));
  const zoomedIn = await page.evaluate(() => window.__forensightGraphMetrics.zoom);
  assert.ok(zoomedIn > baseZoom, `Zoom In must increase zoom (${zoomedIn} > ${baseZoom})`);

  await page.click('button[title="Zoom Out"]');
  await page.click('button[title="Zoom Out"]');
  await new Promise((resolve) => setTimeout(resolve, 80));
  const zoomedOut = await page.evaluate(() => window.__forensightGraphMetrics.zoom);
  assert.ok(zoomedOut < zoomedIn, `Zoom Out must decrease zoom (${zoomedOut} < ${zoomedIn})`);

  await page.click('button[title="Fit All Nodes in View"]');
  await new Promise((resolve) => setTimeout(resolve, 80));
  const resetZoom = await page.evaluate(() => window.__forensightGraphMetrics.zoom);
  assert.ok(Math.abs(resetZoom - baseZoom) < 0.02, `Reset View must restore auto-fit zoom (${resetZoom} vs ${baseZoom})`);

  // 8: Click a node directly on the canvas to select it and open Inspector
  const targetCanvasNode = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const ev = window.__forensightGraphMetrics.nodes.find((n) => n.id === 'ev:201');
    return { x: rect.left + ev.screenX, y: rect.top + ev.screenY };
  });
  await page.mouse.click(targetCanvasNode.x, targetCanvasNode.y);
  await page.waitForFunction(() => document.body.innerText.includes('DERIVED_FROM') && document.body.innerText.toUpperCase().includes('CONNECTED LINKS'));

  // 11: Viewport resize keeps all nodes inside visible canvas bounds
  await page.setViewport({ width: 1100, height: 760 });
  await new Promise((resolve) => setTimeout(resolve, 200));
  const resizedMetrics = await page.evaluate(() => window.__forensightGraphMetrics);
  for (const n of resizedMetrics.nodes) {
    assert.ok(
      n.screenX >= 0 && n.screenX <= resizedMetrics.width && n.screenY >= 0 && n.screenY <= resizedMetrics.height,
      `Node ${n.id} must stay within resized canvas (${n.screenX.toFixed(1)}, ${n.screenY.toFixed(1)} in ${resizedMetrics.width}x${resizedMetrics.height})`,
    );
  }
  await page.setViewport({ width: 1440, height: 1000 });

  // 9: Inspector Connected Links overflow accessibility (node with 12 connected links)
  const manyLinksNodes = [
    { id: `case:${caseData.case_identifier}`, type: 'CASE', label: caseData.title, metadata: { identifier: caseData.case_identifier } },
    { id: 'ev:hub', type: 'EVIDENCE', label: 'hub_evidence.jpg', metadata: { identifier: 'FS-EVD-HUB' } },
  ];
  const manyLinksEdges = [
    { source: `case:${caseData.case_identifier}`, target: 'ev:hub', type: 'CONTAINS' },
  ];
  for (let i = 1; i <= 11; i++) {
    manyLinksNodes.push({ id: `obs:m${i}`, type: 'OBSERVATION', label: `Observation Link ${i}`, metadata: { index: i } });
    manyLinksEdges.push({ source: 'ev:hub', target: `obs:m${i}`, type: 'SUPPORTS' });
  }
  state.graphPayload = { case_id: caseData.case_identifier, nodes: manyLinksNodes, edges: manyLinksEdges };
  await page.reload({ waitUntil: 'networkidle0' });
  await clickButton(page, 'Switch to Card List');
  await page.waitForFunction(() => document.body.innerText.includes('hub_evidence.jpg'));
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div')).filter((el) => el.innerText && el.innerText.includes('hub_evidence.jpg') && el.innerText.includes('Inspect connections'));
    if (cards.length > 0) cards[cards.length - 1].click();
  });
  await page.waitForSelector('[data-testid="inspector-connected-links"]');
  const overflowCheck = await page.evaluate(() => {
    const list = document.querySelector('[data-testid="inspector-connected-links"]');
    const lastItem = document.querySelector('[data-testid="inspector-link-item-11"]');
    list.scrollTop = list.scrollHeight;
    const listRect = list.getBoundingClientRect();
    const lastRect = lastItem ? lastItem.getBoundingClientRect() : null;
    return {
      scrollHeight: list.scrollHeight,
      clientHeight: list.clientHeight,
      hasLastItem: Boolean(lastItem),
      lastItemVisible: Boolean(lastRect && lastRect.bottom <= listRect.bottom + 2 && lastRect.height >= 28),
    };
  });
  assert.ok(overflowCheck.scrollHeight > overflowCheck.clientHeight, 'Connected Links container must scroll when overflowing');
  assert.ok(overflowCheck.hasLastItem && overflowCheck.lastItemVisible, 'Final Connected Link card must be scrollable into view without clipping');

  // 10: Verify dark and light theme canvas container backgrounds
  await page.evaluate(() => {
    localStorage.setItem('forensight-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.reload({ waitUntil: 'networkidle0' });
  const darkBg = await page.$eval('canvas', (el) => getComputedStyle(el.parentElement).backgroundColor);
  assert.equal(darkBg, 'rgb(15, 23, 42)', 'Dark theme graph container must use dark slate background');

  await page.evaluate(() => {
    localStorage.setItem('forensight-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await page.reload({ waitUntil: 'networkidle0' });
  const lightBg = await page.$eval('canvas', (el) => getComputedStyle(el.parentElement).backgroundColor);
  assert.equal(lightBg, 'rgb(246, 242, 235)', 'Light theme graph container must use warm paper background');

  console.log('PASS: login → case intake → evidence upload → analysis job → report generation → prefetch routes → system health → investigation graph');
}

main()
  .catch((error) => {
    console.error('FAIL: browser workflow did not complete:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (viteProcess && ownsServer) viteProcess.kill();
    if (fixturePath && fs.existsSync(fixturePath)) fs.unlinkSync(fixturePath);
    process.exit(process.exitCode || 0);
  });
