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

  if (url.pathname === '/api/auth/login' && request.method() === 'POST') {
    return jsonResponse({ access_token: 'e2e-token', token_type: 'bearer' });
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
  if (url.pathname === `/api/cases/${caseData.case_identifier}/evidence/${evidenceData.id}` && request.method() === 'GET') {
    return jsonResponse(evidenceData);
  }
  if (url.pathname === `/api/cases/${caseData.case_identifier}/evidence` && request.method() === 'GET') {
    return jsonResponse(state.evidenceUploaded ? [evidenceData] : []);
  }
  if (url.pathname === `/api/cases/${caseData.case_identifier}/evidence` && request.method() === 'POST') {
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
  await page.waitForFunction(() => document.body.innerText.includes('Chain of Custody & Storage Verification'));
  assert.equal(state.evidenceUploaded, true, 'evidence upload endpoint was called');

  await clickButton(page, 'Core DIP Engines');
  await clickButton(page, 'Queue Analysis', true);
  await page.waitForFunction(() => document.body.innerText.includes('Mock analysis completed.'));
  assert.equal(state.jobQueued, true, 'analysis job endpoint was called');
  assert.ok(state.jobPolls >= 2, 'job progress endpoint was polled');

  await page.goto(`${baseUrl}/cases/${caseData.case_identifier}/reports`, { waitUntil: 'networkidle0' });
  await page.click("button.primary-button");
  await page.waitForFunction(() => document.body.innerText.includes('FS-RPT-E2E001'));
  assert.equal(state.reportGenerated, true, 'report generation endpoint was called');

  console.log('PASS: login → case intake → evidence upload → analysis job → report generation');
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
  });
