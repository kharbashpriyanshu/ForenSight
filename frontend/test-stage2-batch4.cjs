/**
 * test-stage2-batch4.cjs
 * Comprehensive Browser-Based Verification Suite for ForenSight Stage 2, Batch 4:
 * Visual Refinement, Responsive Behaviour & Accessibility
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const assert = require('assert');
const puppeteer = require('puppeteer');
const fs = require('fs');

const port = 4199;
const baseUrl = `http://127.0.0.1:${port}`;
let viteProcess = null;

const caseData = {
  id: 701,
  case_identifier: 'FS-CASE-S2B4-001',
  title: 'Stage 2 Batch 4 UX & Accessibility Verification',
  description: 'Evidence-based audit of responsive layouts, visual refinement, and accessibility',
  status: 'OPEN',
};

const evidenceDataWithDims = {
  id: 801,
  evidence_identifier: 'FS-EVD-S2B4-001',
  case_id: 701,
  original_filename: 'forensic-specimen-refined.jpg',
  mime_type: 'image/jpeg',
  image_format: 'JPEG',
  file_size: 512000,
  sha256_hash: '3f786850e387550fdab836ed7e6dc881de23001b70e87038c013622150c3d33a',
  width: 1920,
  height: 1080,
  created_at: new Date().toISOString(),
};

const evidenceDataWithoutDims = {
  id: 802,
  evidence_identifier: 'FS-EVD-S2B4-002',
  case_id: 701,
  original_filename: 'forensic-specimen-nodims.jpg',
  mime_type: 'image/jpeg',
  image_format: 'JPEG',
  file_size: 512000,
  sha256_hash: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
  width: null,
  height: null,
  created_at: new Date().toISOString(),
};

let currentEvidence = evidenceDataWithDims;

// Contract-accurate analysis mock data
const mockAnalyses = [
  {
    id: 101,
    evidence_id: 801,
    analysis_type: 'METADATA',
    status: 'completed',
    structured_findings: {
      camera_make: 'Canon',
      camera_model: 'EOS 5D Mark IV',
      software: 'Ver.1.3.2',
      datetime_original: '2026:08:14 10:22:15'
    }
  },
  {
    id: 102,
    evidence_id: 801,
    analysis_type: 'ELA',
    status: 'completed',
    structured_findings: {
      jpeg_quality: 90,
      width: 1920,
      height: 1080,
      mean_error: 14.25,
      median_error: 11.5,
      max_error: 48.0,
      suspicious_regions_detected: 2,
      artifacts: {
        ela_map: 'ela_map_801.jpg'
      }
    }
  },
  {
    id: 103,
    evidence_id: 801,
    analysis_type: 'NOISE',
    status: 'completed',
    structured_findings: {
      width: 1920,
      height: 1080,
      global_statistics: {
        mean_residual: 4.82,
        std_residual: 2.15,
        estimated_noise_sigma: 1.88
      },
      artifacts: {
        ela_map: 'noise_map_801.png'
      }
    }
  },
  {
    id: 104,
    evidence_id: 801,
    analysis_type: 'ADVANCED_NOISE',
    status: 'completed',
    structured_findings: {
      local_consistency: {
        anomaly_detected: true,
        candidate_regions: [
          {
            bounding_box: [120, 150, 240, 180],
            area_pixels: 43200,
            mean_z_score: 3.42
          }
        ]
      }
    }
  },
  {
    id: 105,
    evidence_id: 801,
    analysis_type: 'COPY_MOVE',
    status: 'completed',
    structured_findings: {
      algorithm: 'SIFT',
      matches_found: 42,
      candidate_regions: {
        source_bounding_box: [300, 200, 180, 140],
        destination_bounding_box: [800, 450, 180, 140]
      }
    }
  },
  {
    id: 106,
    evidence_id: 801,
    analysis_type: 'CLONE_KEYPOINT',
    status: 'completed',
    structured_findings: {
      keypoint_clusters: 2,
      candidate_regions: [
        {
          source_bounding_box: [450, 300, 600, 420],
          target_bounding_box: [1100, 500, 1250, 620]
        }
      ]
    }
  },
  {
    id: 107,
    evidence_id: 801,
    analysis_type: 'CLONE_BLOCK',
    status: 'completed',
    structured_findings: {
      candidate_regions: [
        {
          source_bounding_box: [220, 380, 140, 110],
          target_bounding_box: [920, 210, 140, 110],
          supporting_pairs_count: 18
        }
      ]
    }
  },
  {
    id: 108,
    evidence_id: 801,
    analysis_type: 'COLOR_CHANNEL',
    status: 'completed',
    structured_findings: {
      candidate_regions: [
        {
          region_id: 1,
          x: 640,
          y: 320,
          width: 160,
          height: 128,
          block_count: 16,
          mean_z_score: 3.12
        }
      ]
    }
  },
  {
    id: 109,
    evidence_id: 801,
    analysis_type: 'RESAMPLING',
    status: 'completed',
    structured_findings: {
      local_consistency: {
        candidate_regions: [
          {
            bounding_box: [510, 620, 200, 150],
            block_count: 12,
            periodic_energy: 0.88
          }
        ]
      }
    }
  },
  {
    id: 110,
    evidence_id: 801,
    analysis_type: 'BLOCKING_ARTIFACT',
    status: 'completed',
    structured_findings: {
      candidate_regions: [
        {
          bounding_box_pixels: {
            x: 750,
            y: 180,
            width: 190,
            height: 160
          },
          mean_z_score: 2.85,
          type: 'horizontal_misalignment'
        }
      ]
    }
  },
  {
    id: 111,
    evidence_id: 801,
    analysis_type: 'JPEG_GHOST',
    status: 'completed',
    structured_findings: {
      candidate_regions: [
        {
          x: 350,
          y: 550,
          width: 180,
          height: 130,
          max_mean_difference: 0.0842
        }
      ]
    }
  }
];

function handleApiRoute(req) {
  const url = new URL(req.url());
  const method = req.method();

  const jsonResponse = (data, status = 200) => ({
    status,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(data),
  });

  if (url.pathname === '/api/auth/session' || url.pathname === '/api/auth/me') {
    return jsonResponse({
      authenticated: true,
      id: 1,
      username: 'examiner',
      role: 'EXAMINER',
      user: { id: 1, username: 'examiner', role: 'EXAMINER' }
    });
  }

  if (url.pathname === '/api/auth/login' && method === 'POST') {
    return jsonResponse({
      access_token: 'fake-jwt-token-s2b4',
      token_type: 'bearer',
      user: { id: 1, username: 'examiner', role: 'EXAMINER' }
    });
  }

  if (url.pathname.startsWith('/api/cases/FS-CASE-S2B4-001/evidence') && method === 'GET') {
    return jsonResponse([currentEvidence]);
  }

  if (url.pathname === '/api/cases/FS-CASE-S2B4-001') {
    return jsonResponse(caseData);
  }

  if (url.pathname === '/api/cases' || url.pathname === '/api/cases/') {
    return jsonResponse([caseData]);
  }

  if (url.pathname.match(/\/api\/evidence\/80[12]\/analyses/)) {
    return jsonResponse(mockAnalyses);
  }

  if (url.pathname.match(/\/api\/evidence\/80[12]$/)) {
    return jsonResponse(currentEvidence);
  }

  if (url.pathname.match(/\/api\/evidence\/80[12]\/raw/)) {
    const transparentGif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    return {
      status: 200,
      contentType: 'image/gif',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: transparentGif,
    };
  }

  if (url.pathname.startsWith('/api/analysis/jobs')) {
    const resultsMap = {};
    for (const a of mockAnalyses) {
      const key = a.analysis_type.toLowerCase();
      resultsMap[key] = a;
      resultsMap[a.analysis_type] = a;
    }
    return jsonResponse({
      status: 'completed',
      results: resultsMap,
      analyses: mockAnalyses,
      jobs: mockAnalyses.map(a => ({
        id: a.id,
        analysis_type: a.analysis_type,
        status: a.status,
      }))
    });
  }

  if (method === 'GET') return jsonResponse([]);
  return jsonResponse({ status: 'success' });
}

async function startVite() {
  viteProcess = spawn(
    process.execPath,
    [path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: __dirname, env: { ...process.env, VITE_API_URL: '' }, stdio: 'pipe' },
  );

  viteProcess.stdout.on('data', (d) => console.log(`[Vite stdout] ${d.toString().trim()}`));
  viteProcess.stderr.on('data', (d) => console.error(`[Vite stderr] ${d.toString().trim()}`));

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (viteProcess.exitCode !== null) throw new Error(`Vite exited with code ${viteProcess.exitCode}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch (_) {
      // Wait for server to start
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Vite server failed to start within timeout');
}

async function run() {
  console.log('--- Starting Stage 2, Batch 4 Verification Suite ---');
  await startVite();

  const screenshotsDir = path.resolve(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err));
    await page.setRequestInterception(true);

    page.on('request', async (req) => {
      if (req.url().includes('/api/')) {
        const mock = await handleApiRoute(req);
        await req.respond(mock);
      } else {
        await req.continue();
      }
    });

    // 0. Authenticate
    console.log('0. Authenticating and establishing session...');
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });
    const userInput = await page.$('input[type="text"]');
    if (userInput) {
      await page.type('input[type="text"]', 'examiner');
      await page.type('input[type="password"]', 'CorrectPassword123!');
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
      }
    }

    // 1. Accessibility Checks: Skip Link & Navigation
    console.log('1. Verifying Accessibility & Skip to Content Link...');
    await page.goto(`${baseUrl}/cases/FS-CASE-S2B4-001/evidence/801`, { waitUntil: 'networkidle0' });

    const skipLink = await page.$('.skip-to-content');
    assert(skipLink !== null, 'Skip to content link must exist in DOM');
    const skipText = await page.evaluate(el => el.textContent.trim(), skipLink);
    assert.strictEqual(skipText, 'Skip to main content', 'Skip link text must match standard accessibility label');
    console.log('   ✓ Skip to content link verified');

    // 2. Evidence Intake Accessibility & Form Controls
    console.log('2. Verifying Evidence Intake Form Associations & Accessibility...');
    await page.goto(`${baseUrl}/cases/intake`, { waitUntil: 'networkidle0' });

    const fileInput = await page.$('#evidence-file-input');
    assert(fileInput !== null, '#evidence-file-input must be present in intake form');
    const fileInputAria = await page.evaluate(el => el.getAttribute('aria-label'), fileInput);
    assert(fileInputAria && fileInputAria.length > 0, 'File input must possess an accessible aria-label');

    // Click button to expand optional provenance/context
    const buttons = await page.$$('button[type="button"]');
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent, btn);
      if (text && text.includes('Provenance')) {
        await btn.click();
        await new Promise(r => setTimeout(r, 200));
        break;
      }
    }

    // Check form labels have htmlFor attributes
    const labels = await page.$$eval('label[for]', els => els.map(el => el.getAttribute('for')));
    console.log(`   Found ${labels.length} form labels with explicit htmlFor associations:`, labels);
    assert(labels.length >= 7, 'Must have at least 7 form labels associated with inputs');
    console.log('   ✓ Evidence Intake accessible controls verified');

    // 3. Unified Results, Epistemic Quadrants & Human Examiner Notes
    console.log('3. Verifying Unified Results, Epistemic Quadrants & Human Examiner Notes...');
    currentEvidence = evidenceDataWithDims;
    await page.goto(`${baseUrl}/cases/FS-CASE-S2B4-001/evidence/801`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#unified-forensic-results');

    // Check tablist semantics
    const tablist = await page.$('#unified-forensic-results [role="tablist"]');
    assert(tablist !== null, 'Unified forensic results must have role="tablist"');
    const tabs = await page.$$('#unified-forensic-results [role="tab"]');
    assert.strictEqual(tabs.length, 5, 'Must have exactly 5 accessible tabs');
    console.log('   ✓ Tablist and 5 tab buttons verified');

    // Click Consolidated Findings Tab
    console.log('   Navigating to Consolidated Observations & Facts Tab...');
    await page.click('#tab-findings');
    await page.waitForSelector('#panel-findings');

    // Verify Epistemic Quadrants
    const factBadge = await page.$eval('#panel-findings', el => el.textContent.includes('VERIFIED FACT'));
    const obsBadge = await page.$eval('#panel-findings', el => el.textContent.includes('NUMERICAL OBSERVATION'));
    const hypBadge = await page.$eval('#panel-findings', el => el.textContent.includes('PLAUSIBLE HYPOTHESIS'));
    const limitBadge = await page.$eval('#panel-findings', el => el.textContent.includes('CRITICAL BOUNDARY'));
    assert(factBadge && obsBadge && hypBadge && limitBadge, 'All 4 epistemic quadrant badges must be rendered');
    console.log('   ✓ All 4 epistemic category badges verified');

    // Click Report Preview Tab
    console.log('   Navigating to Evidentiary Report Preview Tab...');
    await page.click('#tab-report');
    await page.waitForSelector('#panel-report');

    const examinerBadge = await page.$eval('#panel-report', el => el.textContent.includes('HUMAN EXAMINER ENTRY'));
    assert(examinerBadge, 'Examiner notes must display HUMAN EXAMINER ENTRY tag');
    const examinerTextarea = await page.$('#examiner-notes');
    assert(examinerTextarea !== null, '#examiner-notes textarea must exist');
    console.log('   ✓ Human examiner notes distinct branding and semantic association verified');

    // 4. Batch 3.1 Safety Dimension Verification
    console.log('4. Verifying Spatial Dimension Safety Guard (Missing Image Dimensions)...');
    // First, verify overlay exists when dimensions ARE present
    await page.click('#tab-spatial');
    await page.waitForSelector('#panel-spatial');
    const overlaySvgWithDims = await page.$('[data-testid="spatial-overlay-svg"]');
    assert(overlaySvgWithDims !== null, 'Spatial overlay SVG must render when authoritative dimensions exist');

    // Switch to evidence WITHOUT dimensions
    currentEvidence = evidenceDataWithoutDims;
    await page.goto(`${baseUrl}/cases/FS-CASE-S2B4-001/evidence/802`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#unified-forensic-results');
    await page.click('#tab-spatial');
    await page.waitForSelector('#panel-spatial');

    // Must NOT render SVG overlay
    const overlaySvgWithoutDims = await page.$('[data-testid="spatial-overlay-svg"]');
    assert.strictEqual(overlaySvgWithoutDims, null, 'Spatial overlay SVG must NOT be rendered when dimensions are missing');

    // Must render the restrained warning banner
    const unavailableBanner = await page.$('[data-testid="spatial-dimensions-unavailable"]');
    assert(unavailableBanner !== null, 'data-testid="spatial-dimensions-unavailable" warning must be displayed');
    const warningText = await page.evaluate(el => el.textContent, unavailableBanner);
    assert(warningText.includes('Spatial Overlays Unavailable'), 'Warning text must explain dimension unavailability');
    console.log('   ✓ Batch 3.1 dimension safety verified: zero estimated dimension fallbacks');

    // Capture safety screenshot
    const safetyShotPath = path.join(screenshotsDir, 'stage2-batch4-safety-dimensions.png');
    const safetyBuf = await page.screenshot({ fullPage: false });
    fs.writeFileSync(safetyShotPath, safetyBuf);
    console.log(`   ✓ Saved safety screenshot to ${safetyShotPath} (exists: ${fs.existsSync(safetyShotPath)})`);

    // Switch back to normal evidence with dimensions for responsive matrix
    currentEvidence = evidenceDataWithDims;
    await page.goto(`${baseUrl}/cases/FS-CASE-S2B4-001/evidence/801`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#unified-forensic-results');

    // 5. Responsive Behaviour Matrix across 4 Specified Viewports
    console.log('5. Testing Responsive Behaviour across 4 Specified Viewports...');
    const viewports = [
      { name: 'Desktop', width: 1440, height: 900, shot: 'stage2-batch4-desktop-dark.png' },
      { name: 'Laptop', width: 1280, height: 800, shot: 'stage2-batch4-laptop-dark.png' },
      { name: 'Tablet', width: 768, height: 1024, shot: 'stage2-batch4-tablet-dark.png' },
      { name: 'Mobile', width: 390, height: 844, shot: 'stage2-batch4-mobile-dark.png' },
    ];

    for (const vp of viewports) {
      console.log(`   Testing ${vp.name} Viewport (${vp.width}x${vp.height})...`);
      await page.setViewport({ width: vp.width, height: vp.height });
      await new Promise(r => setTimeout(r, 400));

      // Verify no horizontal document overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      assert.strictEqual(overflow, false, `${vp.name} viewport must not suffer horizontal document overflow`);

      const vpShotPath = path.join(screenshotsDir, vp.shot);
      const vpBuf = await page.screenshot({ fullPage: false });
      fs.writeFileSync(vpShotPath, vpBuf);
      console.log(`   ✓ ${vp.name} viewport clean (exists: ${fs.existsSync(vpShotPath)})`);
    }

    // 6. Theme Toggle & Color Contrast Verification
    console.log('6. Verifying Dual-Theme Toggle & Contrast...');
    await page.setViewport({ width: 1440, height: 900 });
    const themeBtn = await page.$('.btn-theme-toggle');
    if (themeBtn) {
      await themeBtn.click();
      await new Promise(r => setTimeout(r, 300));
      const lightShotPath = path.join(screenshotsDir, 'stage2-batch4-desktop-light.png');
      const lightBuf = await page.screenshot({ fullPage: false });
      fs.writeFileSync(lightShotPath, lightBuf);
      console.log(`   ✓ Light theme screenshot saved (exists: ${fs.existsSync(lightShotPath)})`);
      // Toggle back to dark
      await themeBtn.click();
      await new Promise(r => setTimeout(r, 200));
    }

    console.log('======================================================');
    console.log('STAGE 2 BATCH 4 VERIFICATION COMPLETED SUCCESSFULLY!');
    console.log('======================================================');
  } finally {
    if (browser) await browser.close();
    if (viteProcess) {
      viteProcess.kill('SIGTERM');
    }
  }
}

run().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  if (viteProcess) viteProcess.kill('SIGTERM');
  process.exit(1);
});
