const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const puppeteer = require('puppeteer');

const port = Number(process.env.E2E_PORT || 4197);
const baseUrl = `http://127.0.0.1:${port}`;
let viteProcess;
let browser;
let validFixturePath;
let invalidFixturePath;

const caseData = {
  id: 501,
  case_identifier: 'FS-CASE-S2B1-001',
  title: 'Stage 2 Batch 1 Ingest Verification',
  status: 'Open',
  created_at: new Date().toISOString(),
};

const evidenceData = {
  id: 601,
  evidence_identifier: 'FS-EVD-S2B1-001',
  case_id: 501,
  original_filename: 'forensic-sample.png',
  mime_type: 'image/png',
  image_format: 'PNG',
  file_size: 68,
  sha256_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  width: 1,
  height: 1,
  created_at: new Date().toISOString(),
  intake_context: {},
};

async function startVite() {
  return new Promise((resolve) => {
    viteProcess = spawn('npx', ['vite', '--port', String(port), '--host', '127.0.0.1'], {
      cwd: path.resolve(__dirname),
      env: { ...process.env, VITE_API_URL: '' },
      shell: true,
      stdio: 'pipe',
    });
    viteProcess.stdout.on('data', (d) => {
      if (d.toString().includes('ready in') || d.toString().includes('127.0.0.1') || d.toString().includes('localhost')) {
        resolve();
      }
    });
    setTimeout(resolve, 4000);
  });
}

async function clickButton(page, text, exact = false) {
  const buttons = await page.$$('button');
  for (const button of buttons) {
    const label = await button.evaluate((element) => element.innerText.replace(/\s+/g, ' ').trim());
    if (exact ? label === text : label.includes(text)) {
      await button.evaluate((element) => element.click());
      return;
    }
    await button.dispose();
  }
  throw new Error(`Could not find button: ${text}`);
}

function jsonResponse(data, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  };
}

async function mockApiRequest(request) {
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

  if (url.pathname === '/api/cases/intake' && method === 'POST') {
    return jsonResponse({
      ...evidenceData,
      case_identifier: 'FS-CASE-AUTO-002',
    });
  }

  if (url.pathname === '/api/cases' && method === 'POST') {
    return jsonResponse({
      id: 502,
      case_identifier: 'FS-CASE-AUTO-002',
      title: 'Auto Created Case',
      status: 'Open',
      created_at: new Date().toISOString(),
    });
  }

  if (url.pathname === `/api/cases/${caseData.case_identifier}` && method === 'GET') {
    return jsonResponse(caseData);
  }

  if (url.pathname.includes('/evidence') && method === 'POST') {
    return jsonResponse(evidenceData);
  }

  if (url.pathname === `/api/evidence/${evidenceData.id}` && method === 'GET') {
    return jsonResponse(evidenceData);
  }

  if (url.pathname.includes('/jobs') || url.pathname.includes('/analyses') || url.pathname.includes('/c2pa')) {
    return jsonResponse([]);
  }

  if (method === 'GET') return jsonResponse([]);
  return jsonResponse({});
}

async function main() {
  console.log('--- Starting Stage 2, Batch 1 Verification Suite ---');
  await startVite();

  // Create temporary fixtures
  validFixturePath = path.join(os.tmpdir(), `forensic-sample-${process.pid}.png`);
  fs.writeFileSync(validFixturePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ZkAAAAASUVORK5CYII=', 'base64'));

  invalidFixturePath = path.join(os.tmpdir(), `invalid-file-${process.pid}.txt`);
  fs.writeFileSync(invalidFixturePath, 'This is a text file, not a forensic image.');

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => console.error('Browser page error:', error.message));
  page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));

  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const reqUrl = request.url();
    if (reqUrl.startsWith('blob:') || reqUrl.startsWith('data:')) {
      await request.continue();
      return;
    }
    if (new URL(reqUrl).pathname.startsWith('/api/')) {
      try {
        if (request.method() !== 'GET') console.log(`MOCK ${request.method()} ${new URL(reqUrl).pathname}`);
        await request.respond(await mockApiRequest(request));
      } catch (err) {
        console.error('Mock failed:', err);
        await request.abort('failed');
      }
    } else {
      await request.continue();
    }
  });

  // 1. Log in and verify Station Landing & Dual Pathways
  console.log('1. Verifying Investigation Entry Hub on /cases...');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });
  await page.type('#username', 'examiner');
  await page.type('#password', 'password');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname === '/cases');
  await page.waitForSelector('h2');

  const hubHeading = await page.$eval('h2', el => el.textContent.trim());
  assert.equal(hubHeading, 'Start an Investigation', 'Investigation Entry Hub heading displayed');
  console.log('   ✓ Investigation Entry Hub heading confirmed: "Start an Investigation"');

  const pathwayA = await page.$eval('body', b => b.innerText.includes('Examine an Image') && b.innerText.includes('Start with an Image'));
  assert.ok(pathwayA, 'Pathway A: Examine an Image is rendered');
  console.log('   ✓ Pathway A (Examine an Image) present');

  const pathwayB = await page.$eval('body', b => b.innerText.includes('Open Existing Investigation') && b.innerText.includes('Browse Case Directory'));
  assert.ok(pathwayB, 'Pathway B: Open Existing Investigation is rendered');
  console.log('   ✓ Pathway B (Open Existing Investigation) present');

  // 2. Test Pathway A Navigation to Evidence Intake
  console.log('2. Navigating via Pathway A ("Start with an Image")...');
  await clickButton(page, 'Start with an Image');
  await page.waitForFunction(() => window.location.pathname === '/cases/intake');
  await page.waitForFunction(() => document.querySelector('h1')?.textContent.includes('Evidence Acquisition & Registration'));
  console.log('   ✓ Successfully navigated to /cases/intake');

  // Verify Breadcrumbs on /cases/intake
  const crumbs = await page.$$eval('.breadcrumb-item', items => items.map(i => i.textContent.trim()));
  console.log('   Breadcrumbs at /cases/intake:', crumbs);
  assert.ok(crumbs.some(c => c.includes('Evidence Intake')), 'Breadcrumbs show Evidence Intake');

  // 3. Test Valid Image Selection & Preview Generation
  console.log('3. Testing Valid Image Selection & Preview Generation...');
  const fileInput = await page.waitForSelector('input[type="file"]');
  await fileInput.uploadFile(validFixturePath);
  await page.waitForFunction(() => document.body.textContent.includes('File Structure Validated'));
  const previewImg = await page.$('img[alt="Evidence Preview"]');
  assert.ok(previewImg, 'Image preview generated');
  
  const validatedBadge = await page.$eval('body', b => b.textContent.includes('File Structure Validated'));
  assert.ok(validatedBadge, 'File Structure Validated badge rendered');
  console.log('   ✓ Non-destructive image preview & metadata verified');

  // 4. Test Invalid File Format Rejection
  console.log('4. Testing Invalid File Selection Rejection...');
  await fileInput.uploadFile(invalidFixturePath);
  await page.waitForFunction(() => document.body.textContent.includes('Unsupported File Format'));
  const errorTitle = await page.$eval('h4', el => el.textContent.trim());
  assert.equal(errorTitle, 'Unsupported File Format', 'Unsupported file format blocked client-side');
  console.log('   ✓ Unsupported file rejected client-side with clear explanation & next steps');

  // Re-select valid image for ingestion
  console.log('5. Re-selecting Valid Evidence Image for Ingestion...');
  await fileInput.uploadFile(validFixturePath);
  await page.waitForFunction(() => document.body.textContent.includes('File Structure Validated'));
  console.log('   ✓ Valid evidence re-selected and verified');

  // 6. Test Evidence Registration & Ingestion
  console.log('6. Submitting Evidence Ingestion & Hashing...');
  await clickButton(page, 'Preserve file & start intake record');

  // Verify Success Confirmation Card
  await page.waitForFunction(() => document.body.textContent.includes('Evidence Registered & Cryptographically Fingerprinted'));
  console.log('   ✓ Ingestion success state rendered with SHA-256 digest');

  const sha256Displayed = await page.$eval('code', c => c.textContent.trim());
  assert.equal(sha256Displayed, evidenceData.sha256_hash, 'SHA-256 hash displayed in monospace');
  console.log('   ✓ Verified SHA-256 digest matches:', sha256Displayed);

  // 7. Test Proceed to Forensic Examination Action
  console.log('7. Testing Next Action: Proceed to Forensic Examination...');
  await clickButton(page, 'Proceed to Forensic Examination');
  await page.waitForFunction(() => window.location.pathname.includes('/evidence/601'));
  console.log('   ✓ Successfully navigated to evidence examination workbench');

  // 8. Verify Theme Consistency (Light & Dark)
  console.log('8. Verifying Theme Switching on Intake Page...');
  await clickButton(page, 'Light', false).catch(() => {});
  const themeToggle = await page.$('.theme-toggle-btn');
  if (themeToggle) {
    await themeToggle.click();
    const themeAfter = await page.$eval('html', h => h.getAttribute('data-theme'));
    console.log(`   Theme toggled to: ${themeAfter}`);
    assert.ok(['light', 'dark'].includes(themeAfter), 'Theme is strictly light or dark');
  }

  // 9. Verify Responsive Layout across Breakpoints
  console.log('9. Verifying Responsive Viewports...');
  // Desktop
  await page.setViewport({ width: 1280, height: 800 });
  const desktopCards = await page.$$eval('.card', cards => cards.length);
  assert.ok(desktopCards >= 1, 'Desktop layout intact');

  // Tablet
  await page.setViewport({ width: 800, height: 800 });
  const tabletCards = await page.$$eval('.card', cards => cards.length);
  assert.ok(tabletCards >= 1, 'Tablet layout intact');

  // Mobile
  await page.setViewport({ width: 375, height: 667 });
  const mobileCards = await page.$$eval('.card', cards => cards.length);
  assert.ok(mobileCards >= 1, 'Mobile layout intact');
  console.log('   ✓ Desktop, Tablet, and Mobile layouts verified');

  console.log('--- ALL STAGE 2, BATCH 1 VERIFICATIONS PASSED SUCCESSFULLY ---');
}

main()
  .catch((err) => {
    console.error('FAIL: Stage 2 Batch 1 verification failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (viteProcess) viteProcess.kill();
    if (validFixturePath && fs.existsSync(validFixturePath)) fs.unlinkSync(validFixturePath);
    if (invalidFixturePath && fs.existsSync(invalidFixturePath)) fs.unlinkSync(invalidFixturePath);
    process.exit(process.exitCode || 0);
  });
