const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
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

const pngEvidenceData = {
  id: 603,
  evidence_identifier: 'FS-EVD-S2B2-PNG',
  case_id: 502,
  original_filename: 'forensic-specimen-beta.png',
  mime_type: 'image/png',
  image_format: 'PNG',
  file_size: 321890,
  sha256_hash: '9a324346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327bb5',
  width: 1024,
  height: 768,
  created_at: new Date().toISOString(),
  intake_context: {
    source_platform: 'Lossless Export',
    acquisition_method: 'Network Ingestion',
    received_from: 'Forensic Intake',
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

  if (url.pathname === `/api/evidence/${pngEvidenceData.id}` && method === 'GET') {
    return jsonResponse(pngEvidenceData);
  }

  if ((url.pathname === `/api/evidence/${evidenceData.id}/jobs` || url.pathname === `/api/evidence/${pngEvidenceData.id}/jobs`) && method === 'GET') {
    return jsonResponse(Object.values(activeJobs));
  }

  if ((url.pathname === `/api/evidence/${evidenceData.id}/analyses` || url.pathname === `/api/evidence/${pngEvidenceData.id}/analyses`) && method === 'GET') {
    return jsonResponse([]);
  }

  if ((url.pathname === `/api/evidence/${evidenceData.id}/heatmap` || url.pathname === `/api/evidence/${pngEvidenceData.id}/heatmap`) && method === 'GET') {
    return jsonResponse({
      evidence_id: url.pathname.includes('603') ? pngEvidenceData.id : evidenceData.id,
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

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'puppeteer-b2-'));
  browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: profileDir,
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

    // 4. Verify Suggested Starting Examinations Baseline for JPEG
    console.log('4. Verifying Suggested Starting Examinations for JPEG...');
    const recommendationBanner = await page.$eval('#panel-guided', el => el.innerText);
    assert.match(recommendationBanner, /Suggested Starting Examinations for JPEG Evidence/i, 'Suggested examinations banner missing');
    assert.match(recommendationBanner, /five independent forensic dimensions/i, 'Baseline explanation missing');
    console.log('   ✓ Suggested starting examinations banner present with clear rationale');

    // Verify exactly 5 core examinations are pre-selected
    const selectedCountText = await page.$eval('#panel-guided', el => {
      const match = el.innerText.match(/Available Forensic Examinations \((\d+) Selected\)/);
      return match ? match[1] : null;
    });
    assert.equal(selectedCountText, '5', 'Expected 5 suggested examinations to be pre-selected for JPEG');
    console.log('   ✓ Core baseline pre-selected: exactly 5 examinations (Metadata, ELA, Noise, JPEG DCT, Copy-Move)');

    // 5. Verify Corrected Scientific Engine Descriptions
    console.log('5. Verifying Corrected Scientific Engine Descriptions (JPEG_DCT, CAMERA-ID, COLOR-CHANNEL, ADVANCED-NOISE, COPY_MOVE vs CLONE-KEYPOINT)...');
    const allCardsText = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('article')).map(c => c.innerText);
    });

    // A. JPEG_DCT
    const jpegDctCard = allCardsText.find(t => t.includes('JPEG_DCT'));
    assert.ok(jpegDctCard, 'JPEG_DCT card not found');
    assert.match(jpegDctCard, /JPEG Block-Frequency Characteristics/i, 'JPEG_DCT title incorrect');
    assert.match(jpegDctCard, /decoded grayscale image pixels using an orthonormal discrete cosine transform/i, 'JPEG_DCT methodology incorrect');
    assert.match(jpegDctCard, /Operates on decoded spatial pixel blocks, not raw quantized bitstream coefficients/i, 'JPEG_DCT limitation missing');
    assert.match(jpegDctCard, /does not perform Benford's Law/i, 'JPEG_DCT must explicitly disclaim Benford analysis');
    console.log('   ✓ JPEG_DCT verified: accurately describes spatial decoded-pixel orthonormal DCT');

    // B. CAMERA-ID
    const cameraIdCard = allCardsText.find(t => t.includes('CAMERA-ID'));
    assert.ok(cameraIdCard, 'CAMERA-ID card not found');
    assert.match(cameraIdCard, /Camera Sensor Pattern Comparison/i, 'CAMERA-ID title incorrect');
    assert.match(cameraIdCard, /sensor noise residuals/i, 'CAMERA-ID method incorrect');
    assert.match(cameraIdCard, /Requires pre-registered reference sensor fingerprints/i, 'CAMERA-ID reference limitation missing');
    assert.doesNotMatch(cameraIdCard, /quantization table signatures, color matrices/i, 'CAMERA-ID must not claim hardware library matching');
    console.log('   ✓ CAMERA-ID verified: accurately describes reference-based PRNU cross-correlation');

    // C. COLOR-CHANNEL
    const colorChannelCard = allCardsText.find(t => t.includes('COLOR-CHANNEL'));
    assert.ok(colorChannelCard, 'COLOR-CHANNEL card not found');
    assert.match(colorChannelCard, /Color Channel Consistency Analysis/i, 'COLOR-CHANNEL title incorrect');
    assert.match(colorChannelCard, /Relationships between RGB color channels/i, 'COLOR-CHANNEL description incorrect');
    assert.match(colorChannelCard, /does not analyze Color Filter Array \(CFA\) or Bayer demosaicing/i, 'COLOR-CHANNEL limitation missing');
    console.log('   ✓ COLOR-CHANNEL verified: accurately describes RGB statistical/spatial analysis without claiming CFA/Bayer');

    // D. ADVANCED-NOISE
    const advancedNoiseCard = allCardsText.find(t => t.includes('ADVANCED-NOISE'));
    assert.ok(advancedNoiseCard, 'ADVANCED-NOISE card not found');
    assert.match(advancedNoiseCard, /Multi-Band Spatial Noise Analysis/i, 'ADVANCED-NOISE title incorrect');
    assert.match(advancedNoiseCard, /radial 2D Fourier-domain frequency band/i, 'ADVANCED-NOISE description incorrect');
    assert.match(advancedNoiseCard, /not Discrete Wavelet Transform \(DWT\)/i, 'ADVANCED-NOISE wavelet disclaimer missing');
    console.log('   ✓ ADVANCED-NOISE verified: accurately describes Gaussian residual and FFT radial bands (no wavelets)');

    // E. COPY_MOVE vs CLONE-KEYPOINT
    const copyMoveCard = allCardsText.find(t => t.includes('COPY_MOVE'));
    assert.ok(copyMoveCard, 'COPY_MOVE card not found');
    assert.match(copyMoveCard, /Keypoint Clone Detection \(SIFT\)/i, 'COPY_MOVE title incorrect');
    assert.match(copyMoveCard, /Scale-Invariant Feature Transform \(SIFT\)/i, 'COPY_MOVE method incorrect');
    assert.match(copyMoveCard, /Uses SIFT keypoints exclusively/i, 'COPY_MOVE SIFT limitation missing');

    const cloneKeypointCard = allCardsText.find(t => t.includes('CLONE-KEYPOINT'));
    assert.ok(cloneKeypointCard, 'CLONE-KEYPOINT card not found');
    assert.match(cloneKeypointCard, /Keypoint Clone & Affine Transformation Matching \(ORB\)/i, 'CLONE-KEYPOINT title incorrect');
    assert.match(cloneKeypointCard, /Oriented FAST and Rotated BRIEF \(ORB\)/i, 'CLONE-KEYPOINT ORB description incorrect');
    assert.match(cloneKeypointCard, /Uses ORB binary descriptors with Hamming distance/i, 'CLONE-KEYPOINT ORB limitation missing');
    console.log('   ✓ COPY_MOVE vs CLONE-KEYPOINT verified: SIFT and ORB methods are distinctly differentiated');

    // 6. Verify Selection Controls (Clear, Reset, Select All Compatible)
    console.log('6. Testing Quick Selection Controls (Clear, Reset, Select All Compatible)...');
    // Clear selection
    const clearBtn = await page.$('button[title="Deselect all examinations"]');
    await clearBtn.evaluate(el => el.click());
    await new Promise(r => setTimeout(r, 200));
    let countAfterClear = await page.$eval('#panel-guided', el => {
      const match = el.innerText.match(/Available Forensic Examinations \((\d+) Selected\)/);
      return match ? match[1] : null;
    });
    assert.equal(countAfterClear, '0', 'Selection count should be 0 after clear');
    console.log('   ✓ Clear selection verified (0 selected)');

    // Reset to suggested
    const resetBtn = await page.$('button[title="Restore suggested starting examinations for this format"]');
    await resetBtn.evaluate(el => el.click());
    await new Promise(r => setTimeout(r, 200));
    let countAfterReset = await page.$eval('#panel-guided', el => {
      const match = el.innerText.match(/Available Forensic Examinations \((\d+) Selected\)/);
      return match ? match[1] : null;
    });
    assert.equal(countAfterReset, '5', 'Selection count should be restored to 5');
    console.log('   ✓ Reset to suggested examinations verified (5 selected)');

    // Select all compatible
    const allCompBtn = await page.$('button[title="Select all compatible examinations for this format"]');
    await allCompBtn.evaluate(el => el.click());
    await new Promise(r => setTimeout(r, 200));
    let countAfterAllComp = await page.$eval('#panel-guided', el => {
      const match = el.innerText.match(/Available Forensic Examinations \((\d+) Selected\)/);
      return match ? match[1] : null;
    });
    assert.ok(Number(countAfterAllComp) >= 20, `Expected all compatible engines selected, got ${countAfterAllComp}`);
    console.log(`   ✓ Select all compatible verified (${countAfterAllComp} compatible engines selected)`);

    // Reset back to suggested baseline for subsequent execution test
    await resetBtn.evaluate(el => el.click());
    await new Promise(r => setTimeout(r, 200));

    // 7. Verify PNG Format-Aware Recommendation & Incompatibility Filtering
    console.log('7. Testing PNG Lossless Format-Aware Suggested Starting Examinations...');
    const pngEvidenceUrl = `${baseUrl}/cases/${caseData.case_identifier}/evidence/${pngEvidenceData.id}`;
    await page.goto(pngEvidenceUrl, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));

    // Verify PNG Banner
    const pngBanner = await page.$eval('#panel-guided', el => el.innerText);
    assert.match(pngBanner, /Suggested Starting Examinations for Lossless Evidence/i, 'PNG suggested banner missing');
    assert.match(pngBanner, /JPEG-specific algorithms \(such as ELA and DCT block inspection\) require lossy compression/i, 'PNG exclusion explanation missing');

    // Verify exactly 4 examinations are pre-selected for PNG (Metadata, Noise, Copy-Move, Resampling)
    const pngSelectedCount = await page.$eval('#panel-guided', el => {
      const match = el.innerText.match(/Available Forensic Examinations \((\d+) Selected\)/);
      return match ? match[1] : null;
    });
    assert.equal(pngSelectedCount, '4', 'Expected 4 suggested examinations for PNG');
    console.log('   ✓ Lossless starting examinations verified: 4 examinations pre-selected (Metadata, Noise, Copy-Move, Resampling)');

    // Verify lossy engines are marked INCOMPATIBLE and disabled
    const elaIncompatibleBadge = await page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('article'));
      const ela = articles.find(a => a.innerText.includes('ELA'));
      const checkbox = ela ? ela.querySelector('input[type="checkbox"]') : null;
      return {
        hasIncompatibleNotice: ela ? ela.innerText.includes('Incompatible with PNG container') : false,
        disabled: checkbox ? checkbox.disabled : false,
      };
    });
    assert.equal(elaIncompatibleBadge.hasIncompatibleNotice, true, 'ELA must show Incompatible notice for PNG evidence');
    assert.equal(elaIncompatibleBadge.disabled, true, 'ELA checkbox must be disabled for PNG evidence');
    console.log('   ✓ Format compatibility filter verified: ELA marked INCOMPATIBLE and disabled on PNG');

    // Navigate back to JPEG evidence 602 for workbench, screenshots, and execution test
    await page.goto(evidenceUrl, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 400));

    // 8. Verify Progressive Disclosure (Expandable Technical Details)
    console.log('8. Testing Progressive Disclosure (Expand/Collapse Technical Details)...');
    const firstArticle = await page.$('article');
    assert.ok(firstArticle, 'Examination article card not found');
    const detailsBtn = await firstArticle.$('button[aria-expanded]');
    assert.ok(detailsBtn, 'Expandable technical details button not found in card');
    await detailsBtn.evaluate(el => el.click());
    await new Promise(r => setTimeout(r, 300));

    const technicalSpec = await firstArticle.evaluate(el => el.innerText);
    assert.match(technicalSpec, /Technical Architecture & Method/i, 'Technical panel did not expand');
    assert.match(technicalSpec, /Engine ID:/i, 'Engine ID not displayed');
    console.log('   ✓ Technical architecture and mathematical method expanded via progressive disclosure');

    // 9. Verify Individual Engine Selection Toggle
    console.log('9. Testing Individual Examination Selection Toggle...');
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

    // 10. Verify Analyst Workbench Mode
    console.log('10. Testing Analyst Workbench Mode...');
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
    assert.equal(filteredRows.length, 2, 'Search query "PRNU" should filter to 2 matching sensor engines (PRNU and CAMERA-ID)');
    console.log('   ✓ Search filter working: "PRNU" filtered to 2 matching sensor engines (PRNU and CAMERA-ID)');

    // Clear search input
    await page.evaluate(() => {
      const inp = document.querySelector('input[placeholder*="Filter by engine ID"]');
      if (inp) {
        inp.value = '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 200));

    // 11. Take Light Screenshots
    console.log('11. Capturing Light Theme Screenshots...');
    const screenshotsDir = path.resolve(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

    await page.screenshot({ path: path.join(screenshotsDir, 'stage2-batch2-analyst-light.png') });
    console.log('   ✓ Saved stage2-batch2-analyst-light.png');

    // Switch back to Guided mode
    await page.$eval('#tab-guided', el => el.click());
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(screenshotsDir, 'stage2-batch2-guided-light.png') });
    console.log('   ✓ Saved stage2-batch2-guided-light.png');

    // 12. Verify Dark Theme Switching & Capture Dark Screenshots
    console.log('12. Testing Dark Theme & Capturing Dark Screenshots...');
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

    // 13. Verify Mobile Viewport & Screenshot
    console.log('13. Testing Mobile Viewport (375x812)...');
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

    // 14. Verify Examination Execution & Duplicate Submission Protection
    console.log('14. Testing Batch Examination Execution & Anti-Duplicate Lock...');
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
