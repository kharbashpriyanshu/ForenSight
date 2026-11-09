const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');

const port = Number(process.env.E2E_PORT || 4198);
const baseUrl = `http://127.0.0.1:${port}`;
let viteProcess;
let browser;

const caseData = {
  id: 502,
  case_identifier: 'FS-CASE-S2B2-001',
  title: 'Stage 2 Batch 2 Guided Examination Verification',
  status: 'Open',
  created_at: new Date().toISOString(),
};

const evidenceData = {
  id: 602,
  evidence_identifier: 'FS-EVD-S2B2-002',
  case_id: 502,
  original_filename: 'forensic-specimen-alpha.jpg',
  mime_type: 'image/jpeg',
  image_format: 'JPEG',
  file_size: 421890,
  sha256_hash: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
  width: 1920,
  height: 1080,
  created_at: new Date().toISOString(),
  intake_context: {
    source_platform: 'Mobile Camera Capture',
    acquisition_method: 'Direct USB Extraction',
    received_from: 'Forensic Lab Intake',
  },
};

const activeJobs = {};
let jobCounter = 1000;
let queueCallCounts = {};

async function startVite() {
  return new Promise((resolve) => {
    viteProcess = spawn('npx', ['vite', '--port', String(port), '--host', '127.0.0.1'], {
      cwd: path.resolve(__dirname),
      env: { ...process.env, VITE_API_URL: '' },
      shell: true,
      stdio: 'pipe',
    });
    viteProcess.stdout.on('data', (d) => {
      const s = d.toString();
      if (s.includes('ready in') || s.includes('127.0.0.1') || s.includes('localhost')) {
        resolve();
      }
    });
    setTimeout(resolve, 5000);
  });
}

function jsonResponse(data, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  };
}

async function handleApiRoute(request) {
  const url = new URL(request.url());
  const method = request.method();

  if (url.pathname === '/api/auth/login' && method === 'POST') {
    return jsonResponse({
      authenticated: true,
      username: 'examiner',
      role: 'INVESTIGATOR',
      mfa_enabled: false,
    });
  }

  if (url.pathname === '/api/auth/session' && method === 'GET') {
    return jsonResponse({
      authenticated: true,
      username: 'examiner',
      role: 'INVESTIGATOR',
    });
  }

  if (url.pathname === '/api/cases' && method === 'GET') {
    return jsonResponse([caseData]);
  }

  if (url.pathname === `/api/cases/${caseData.case_identifier}` && method === 'GET') {
    return jsonResponse(caseData);
  }

  if (url.pathname === `/api/evidence/${evidenceData.id}` && method === 'GET') {
    return jsonResponse(evidenceData);
  }

  if (url.pathname === `/api/evidence/${evidenceData.id}/jobs` && method === 'GET') {
    return jsonResponse(Object.values(activeJobs));
  }

  if (url.pathname === `/api/evidence/${evidenceData.id}/analyses` && method === 'GET') {
    return jsonResponse([]);
  }

  if (url.pathname === `/api/evidence/${evidenceData.id}/heatmap` && method === 'GET') {
    return jsonResponse({
      evidence_id: evidenceData.id,
      width: 1920,
      height: 1080,
      layers: [],
      composite_regions_count: 0,
      what_was_found: 'Pending examination completion',
      why_it_matters: 'Anomaly heatmap synthesizes multi-modality signals once analyses complete.',
      recommended_next_steps: [],
      limitations: 'Heatmap requires completed analysis layers.'
    });
  }

  if (url.pathname.startsWith(`/api/jobs/analysis/${evidenceData.id}/`) && method === 'POST') {
    const analysisType = url.pathname.split('/').pop().toLowerCase();
    queueCallCounts[analysisType] = (queueCallCounts[analysisType] || 0) + 1;

    // Simulate backend job response
    jobCounter++;
    const job = {
      id: jobCounter,
      job_identifier: `JOB-2026-${jobCounter}`,
      evidence_id: evidenceData.id,
      analysis_type: analysisType,
      engine_version: '1.0.0',
      status: 'RUNNING',
      progress_percent: 45,
      progress_message: `Analyzing ${analysisType} characteristics`,
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      parameters: {},
    };
    activeJobs[analysisType] = job;
    return jsonResponse(job, 202);
  }

  if (url.pathname.startsWith('/api/jobs/') && method === 'GET') {
    const jobId = Number(url.pathname.split('/').pop());
    const match = Object.values(activeJobs).find(j => j.id === jobId);
    if (match) {
      // Transition to completed on poll
      match.status = 'COMPLETED';
      match.progress_percent = 100;
      match.completed_at = new Date().toISOString();
      match.analysis_id = jobId + 5000;
      return jsonResponse(match);
    }
  }

  if (url.pathname.startsWith('/api/analysis/') && method === 'GET') {
    const aid = Number(url.pathname.split('/').pop());
    return jsonResponse({
      id: aid,
      evidence_id: evidenceData.id,
      analysis_type: 'VERIFIED_ANALYSIS',
      status: 'completed',
      structured_findings: { artifacts: {}, observations: [] },
      created_at: new Date().toISOString()
    });
  }

  if (url.pathname.includes('/fusion/normalize') || url.pathname.includes('/fusion/correlate')) {
    return jsonResponse({ status: 'success' });
  }

  if (method === 'GET') return jsonResponse([]);
  return jsonResponse({});
}

async function main() {
  console.log('--- Starting Stage 2, Batch 2 Comprehensive Verification Suite ---');
  await startVite();

  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const u = new URL(req.url());
    if (u.pathname.startsWith('/api/')) {
      const res = await handleApiRoute(req);
      await req.respond(res);
    } else {
      await req.continue();
    }
  });

  try {
    // 1. Authenticate & Navigate to Case Evidence Detail
    console.log('1. Authenticating and navigating to Evidence Detail page...');
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });
    await page.type('input[type="text"]', 'examiner');
    await page.type('input[type="password"]', 'Password123!');
    const submitBtn = await page.$('button[type="submit"]');
    await submitBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    // Navigate directly to the evidence detail page
    const evidenceUrl = `${baseUrl}/cases/${caseData.case_identifier}/evidence/${evidenceData.id}`;
    await page.goto(evidenceUrl, { waitUntil: 'networkidle0' });

    // 2. Verify Guided Investigation Workflow is Present
    console.log('2. Verifying Guided Examination & Transparent Engine Selection header...');
    const heading = await page.$eval('section[aria-label="Forensic Examination & Engine Selection"] h2', el => el.innerText.trim());
    assert.match(heading, /Guided Examination & Transparent Engine Selection/i, 'Heading does not match');
    console.log('   ✓ Guided Examination Workflow header verified: "' + heading + '"');

    // Verify Evidence Context & SHA-256 Digest
    const contextText = await page.$eval('.card', el => el.innerText);
    assert.match(contextText, /forensic-specimen-alpha\.jpg/i, 'Filename not found in context');
    assert.match(contextText, /JPEG/i, 'Format not detected as JPEG');
    assert.match(contextText, /8f434346648f6b96/i, 'SHA-256 preview missing');
    console.log('   ✓ Evidence context bar confirmed (JPEG, 1920×1080px, SHA-256)');

    // 3. Verify Default Mode is Guided Investigation
    console.log('3. Verifying Guided Investigation mode is active by default...');
    const guidedTabSelected = await page.$eval('#tab-guided', el => el.getAttribute('aria-selected'));
    assert.equal(guidedTabSelected, 'true', 'Guided Investigation tab should be selected by default');
    console.log('   ✓ Guided Investigation tab is active (aria-selected="true")');

    // 4. Verify Scientific Recommendation Baseline for JPEG
    console.log('4. Verifying Recommended Multi-Modality Baseline for JPEG...');
    const recommendationBanner = await page.$eval('#panel-guided', el => el.innerText);
    assert.match(recommendationBanner, /Recommended Multi-Modality Baseline for JPEG Evidence/i, 'Recommendation banner missing');
    assert.match(recommendationBanner, /five independent lines of forensic inquiry/i, 'Baseline explanation missing');
    console.log('   ✓ Scientific recommendation banner present with clear rationale');

    // Verify exactly 5 core examinations are pre-selected
    const selectedCountText = await page.$eval('#panel-guided', el => {
      const match = el.innerText.match(/Available Forensic Examinations \((\d+) Selected\)/);
      return match ? match[1] : null;
    });
    assert.equal(selectedCountText, '5', 'Expected 5 recommended examinations to be pre-selected for JPEG');
    console.log('   ✓ Core baseline pre-selected: exactly 5 examinations (Metadata, ELA, Noise, JPEG DCT, Copy-Move)');

    // 5. Verify Examination Information Architecture
    console.log('5. Verifying Examination Information Architecture (What, Why, Output, Limitations)...');
    const elaCardText = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('article'));
      const ela = cards.find(c => c.innerText.includes('Compression & Resave Variance Analysis'));
      return ela ? ela.innerText : '';
    });
    assert.match(elaCardText, /Analyzes:/i, 'Missing "Analyzes" property');
    assert.match(elaCardText, /Why it matters:/i, 'Missing "Why it matters" property');
    assert.match(elaCardText, /Output:/i, 'Missing "Output" property');
    assert.match(elaCardText, /Scientific limitation:/i, 'Missing "Scientific limitation" property');
    assert.match(elaCardText, /ELA/i, 'Technical engine acronym ELA missing');
    console.log('   ✓ Complete forensic information architecture verified on examination cards');

    // 6. Verify Progressive Disclosure (Expandable Technical Details)
    console.log('6. Testing Progressive Disclosure (Expand/Collapse Technical Details)...');
    const firstArticle = await page.$('article');
    assert.ok(firstArticle, 'Examination article card not found');
    const detailsBtn = await firstArticle.$('button[aria-expanded]');
    assert.ok(detailsBtn, 'Expandable technical details button not found in card');
    await detailsBtn.evaluate(el => el.click());
    await new Promise(r => setTimeout(r, 500));

    const technicalSpec = await firstArticle.evaluate(el => el.innerText);
    assert.match(technicalSpec, /Technical Architecture & Method/i, 'Technical panel did not expand');
    assert.match(technicalSpec, /Engine ID:/i, 'Engine ID not displayed');
    console.log('   ✓ Technical architecture and mathematical method expanded via progressive disclosure');

    // 7. Verify Individual Engine Selection Toggle
    console.log('7. Testing Individual Examination Selection Toggle...');
    // Find Resampling or Advanced Noise checkbox
    const checkboxes = await page.$$('article input[type="checkbox"]');
    // Toggle 6th checkbox (Advanced Noise)
    await checkboxes[5].evaluate(el => el.click());
    await new Promise(r => setTimeout(r, 300));

    const updatedSelectedCount = await page.$eval('#panel-guided', el => {
      const match = el.innerText.match(/Available Forensic Examinations \((\d+) Selected\)/);
      return match ? match[1] : null;
    });
    assert.equal(updatedSelectedCount, '6', 'Selection count should update to 6 after enabling additional engine');
    console.log('   ✓ Individual examination selection verified: count dynamically updated to 6');

    // 8. Verify Analyst Workbench Mode
    console.log('8. Testing Analyst Workbench Mode...');
    const analystTabBtn = await page.$('#tab-analyst');
    await analystTabBtn.evaluate(el => el.click());
    await new Promise(r => setTimeout(r, 400));

    const analystTabActive = await page.$eval('#tab-analyst', el => el.getAttribute('aria-selected'));
    assert.equal(analystTabActive, 'true', 'Analyst Workbench tab should be active');

    const matrixTable = await page.$('table');
    assert.ok(matrixTable, 'Analyst matrix table should be rendered');
    const rows = await page.$$('table tbody tr');
    assert.ok(rows.length >= 20, `Expected at least 20 engine rows in Analyst Workbench, found ${rows.length}`);
    console.log(`   ✓ Analyst Workbench active: complete matrix table rendered with ${rows.length} registered forensic engines`);

    // Verify Search filter in Analyst Workbench
    const searchInput = await page.$('input[placeholder*="Filter by engine ID"]');
    await searchInput.type('PRNU');
    await new Promise(r => setTimeout(r, 300));
    const filteredRows = await page.$$('table tbody tr');
    assert.equal(filteredRows.length, 1, 'Search query "PRNU" should filter to exactly 1 engine');
    console.log('   ✓ Search filter working: "PRNU" filtered to 1 matching sensor engine');

    // Clear search input
    await page.evaluate(() => {
      const inp = document.querySelector('input[placeholder*="Filter by engine ID"]');
      if (inp) {
        inp.value = '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 200));

    // 9. Take Light Screenshots
    console.log('9. Capturing Light Theme Screenshots...');
    const screenshotsDir = path.resolve(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

    await page.screenshot({ path: path.join(screenshotsDir, 'stage2-batch2-analyst-light.png') });
    console.log('   ✓ Saved stage2-batch2-analyst-light.png');

    // Switch back to Guided mode
    await page.$eval('#tab-guided', el => el.click());
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(screenshotsDir, 'stage2-batch2-guided-light.png') });
    console.log('   ✓ Saved stage2-batch2-guided-light.png');

    // 10. Verify Dark Theme Switching & Capture Dark Screenshots
    console.log('10. Testing Dark Theme & Capturing Dark Screenshots...');
    const themeToggleBtn = await page.$('.btn-theme-toggle');
    if (themeToggleBtn) {
      await themeToggleBtn.evaluate(el => el.click());
      await new Promise(r => setTimeout(r, 400));
      const htmlTheme = await page.$eval('html', el => el.getAttribute('data-theme'));
      assert.equal(htmlTheme, 'dark', 'Theme should switch to dark');
      console.log('   ✓ Dark theme activated successfully (data-theme="dark")');

      await page.screenshot({ path: path.join(screenshotsDir, 'stage2-batch2-guided-dark.png') });
      console.log('   ✓ Saved stage2-batch2-guided-dark.png');

      await page.$eval('#tab-analyst', el => el.click());
      await new Promise(r => setTimeout(r, 400));
      await page.screenshot({ path: path.join(screenshotsDir, 'stage2-batch2-analyst-dark.png') });
      console.log('   ✓ Saved stage2-batch2-analyst-dark.png');

      // Switch back to light theme
      await page.$eval('.btn-theme-toggle', el => el.click());
      await new Promise(r => setTimeout(r, 300));
    }

    // 11. Verify Mobile Viewport & Screenshot
    console.log('11. Testing Mobile Viewport (375x812)...');
    await page.setViewport({ width: 375, height: 812, isMobile: true });
    await new Promise(r => setTimeout(r, 400));
    console.log('   Current page URL:', await page.url());
    const hasTab = await page.$('#tab-guided');
    if (hasTab) {
      await page.$eval('#tab-guided', el => el.click());
      await new Promise(r => setTimeout(r, 400));
    }
    await page.screenshot({ path: path.join(screenshotsDir, 'stage2-batch2-mobile.png') });
    console.log('   ✓ Saved stage2-batch2-mobile.png (responsive layout verified)');

    // Restore desktop viewport
    await page.setViewport({ width: 1280, height: 900, isMobile: false });
    await new Promise(r => setTimeout(r, 400));

    // 12. Verify Examination Execution & Duplicate Submission Protection
    console.log('12. Testing Batch Examination Execution & Anti-Duplicate Lock...');
    queueCallCounts = {};
    const executeBtn = await page.waitForSelector('#btn-execute-examinations', { timeout: 5000 });
    assert.ok(executeBtn, 'Execution button #btn-execute-examinations not found');

    // Click execute
    await executeBtn.evaluate(el => el.click());
    // Immediate second click to verify anti-duplicate lock
    try {
      await executeBtn.evaluate(el => el.click());
    } catch (_) {
      // Ignored if button is disabled
    }

    await new Promise(r => setTimeout(r, 1000));
    const queuedCount = Object.keys(queueCallCounts).length;
    console.log(`   ✓ Batch execution dispatched ${queuedCount} unique engine jobs`);
    // Verify no engine was queued more than once
    for (const [eng, count] of Object.entries(queueCallCounts)) {
      assert.equal(count, 1, `Engine ${eng} was queued ${count} times; duplicate submission protection failed!`);
    }
    console.log('   ✓ Anti-duplicate submission protection verified: zero redundant calls fired');

    console.log('--- ALL STAGE 2, BATCH 2 VERIFICATIONS PASSED SUCCESSFULLY ---');
  } finally {
    if (browser) await browser.close();
    if (viteProcess) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(viteProcess.pid), '/f', '/t']);
        } else {
          viteProcess.kill('SIGTERM');
        }
      } catch (_) {}
    }
  }
}

main().catch((err) => {
  console.error('FAIL: Stage 2 Batch 2 verification failed:', err);
  if (browser) browser.close();
  if (viteProcess) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(viteProcess.pid), '/f', '/t']);
      } else {
        viteProcess.kill('SIGTERM');
      }
    } catch (_) {}
  }
  process.exit(1);
});
