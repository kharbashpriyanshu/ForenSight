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
  savedEvidenceNotes: [],
  nextNoteId: 1,
  requestedApiPaths: [],
  requestedApiQueries: [],
  seenCsrfTokens: [],
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
  layers: [
    { modality: 'ELA', label: 'Error Level Analysis', status: 'NOT_RUN', weight: 0.35, regions: [], summary: '', limitations: '' },
    { modality: 'NOISE', label: 'Noise Residual', status: 'NOT_RUN', weight: 0.30, regions: [], summary: '', limitations: '' },
    { modality: 'COPY_MOVE', label: 'Copy-Move', status: 'NOT_RUN', weight: 0.35, regions: [], summary: '', limitations: '' },
  ],
  composite_regions_count: 0,
  what_was_found: 'No test signals were injected.',
  why_it_matters: 'This is a UI workflow check only.',
  recommended_next_steps: [],
  limitations: 'Mocked data; not a forensic evaluation.',
};

const demoCaseData = {
  id: 900,
  case_identifier: 'FS-DEMO-001',
  title: 'Digital Image Manipulation Investigation — Recruitment Campaign',
  status: 'IN_REVIEW',
  created_at: new Date().toISOString(),
};

const demoEvidenceData = {
  id: 901,
  evidence_identifier: 'FS-EVD-DEMO01',
  case_id: 900,
  original_filename: 'campaign_composite_splice.jpg',
  mime_type: 'image/jpeg',
  image_format: 'JPEG',
  file_size: 4096,
  sha256_hash: 'b'.repeat(64),
  width: 640,
  height: 480,
  created_at: new Date().toISOString(),
  intake_context: { source_platform: 'Synthetic Training Generator', acquisition_method: 'Deterministic Script' },
};

const demoHeatmapData = {
  evidence_id: demoEvidenceData.id,
  evidence_identifier: demoEvidenceData.evidence_identifier,
  filename: 'campaign_composite_splice.jpg',
  width: 640,
  height: 480,
  layers: [
    {
      modality: 'ELA',
      label: 'Error Level Analysis (Compression Variance)',
      status: 'AVAILABLE',
      weight: 0.35,
      regions: [
        {
          modality: 'ELA',
          x: 0.15,
          y: 0.25,
          width: 0.30,
          height: 0.25,
          intensity: 0.85,
          description: 'Spliced text insert',
        },
      ],
      summary: 'Mapped 1 high-frequency compression variance zone.',
      limitations: 'Natural edges can exhibit elevated ELA error.',
    },
    {
      modality: 'NOISE',
      label: 'Sensor Noise Residual Variance',
      status: 'AVAILABLE',
      weight: 0.30,
      regions: [
        {
          modality: 'NOISE',
          x: 0.50,
          y: 0.20,
          width: 0.35,
          height: 0.30,
          intensity: 0.75,
          description: 'High-pass SNR anomaly',
        },
      ],
      summary: 'Isolated 1 anomalous noise residual zone.',
      limitations: 'Lighting alters SNR under normal conditions.',
    },
    {
      modality: 'COPY_MOVE',
      label: 'Copy-Move Clustering',
      status: 'AVAILABLE',
      weight: 0.35,
      regions: [
        {
          modality: 'COPY_MOVE',
          x: 0.25,
          y: 0.60,
          width: 0.25,
          height: 0.25,
          intensity: 0.90,
          description: 'Cloned badge pattern',
        },
      ],
      summary: 'Detected 1 cloned cluster.',
      limitations: 'Periodic structures produce false matches.',
    },
  ],
  composite_regions_count: 3,
  what_was_found: 'Differential compression and sensor noise variance localized over spliced text badge.',
  why_it_matters: 'Corroborates localized modification across independent spatial domains.',
  recommended_next_steps: ['Inspect localized pixel grid', 'Verify PRNU fingerprint'],
  limitations: 'Synthetic mock for testing.',
};

const demoReportData = {
  id: 951,
  report_identifier: 'FS-RPT-DEMO01',
  case_id: demoCaseData.case_identifier,
  generated_at: new Date().toISOString(),
  rule_version: 'V3.0',
  report_type: 'JSON',
  status: 'COMPLETED',
};

const demoGraphData = {
  case_id: 'FS-DEMO-001',
  nodes: [
    { id: 'case:FS-DEMO-001', type: 'CASE', label: demoCaseData.title, metadata: { identifier: 'FS-DEMO-001', status: 'IN_REVIEW' } },
    { id: 'ev:901', type: 'EVIDENCE', label: 'campaign_composite_splice.jpg', metadata: { identifier: 'FS-EVD-DEMO01', format: 'JPEG' } },
    { id: 'ev:902', type: 'EVIDENCE', label: 'campaign_original_master.png', metadata: { identifier: 'FS-EVD-DEMO02', format: 'PNG' } },
    { id: 'obs:910', type: 'OBSERVATION', label: 'ELA & DCT Quantization Anomaly', metadata: { modality: 'ELA' } },
    { id: 'finding:920', type: 'FINDING', label: 'Spliced Composite Region Detected', metadata: { status: 'VERIFIED' } },
    { id: 'report:951', type: 'REPORT', label: 'FS-RPT-DEMO01', metadata: { type: 'JSON' } },
  ],
  edges: [
    { source: 'case:FS-DEMO-001', target: 'ev:901', type: 'CONTAINS' },
    { source: 'case:FS-DEMO-001', target: 'ev:902', type: 'CONTAINS' },
    { source: 'ev:901', target: 'ev:902', type: 'DERIVED_FROM' },
    { source: 'ev:901', target: 'obs:910', type: 'HAS_OBSERVATION' },
    { source: 'obs:910', target: 'finding:920', type: 'SUPPORTS' },
    { source: 'case:FS-DEMO-001', target: 'report:951', type: 'GENERATED' },
  ],
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
  state.requestedApiQueries.push(`${request.method()} ${url.pathname}${url.search}`);
  const csrfHeader = request.headers()['x-csrf-token'];
  if (csrfHeader) state.seenCsrfTokens.push(`${route}:${csrfHeader}`);

  if (url.pathname.endsWith('/timeline') || url.pathname.endsWith('/custody')) {
    return jsonResponse({ detail: 'Not Found' }, 404);
  }

  if (url.pathname === '/api/auth/login' && request.method() === 'POST') {
    return jsonResponse({
      authenticated: true,
      username: state.demoMode ? 'demo_instructor' : 'workflow-user',
      role: 'INVESTIGATOR',
      mfa_enabled: false,
    });
  }
  if (url.pathname === '/api/auth/logout' && request.method() === 'POST') {
    return { status: 204, contentType: 'text/plain', body: '' };
  }
  if (url.pathname === '/api/auth/session' && request.method() === 'GET') {
    return jsonResponse({ authenticated: true, username: 'workflow-user', role: 'INVESTIGATOR' });
  }
  if (url.pathname.endsWith('/verify-custody') && request.method() === 'POST') {
    return jsonResponse({
      status: 'VERIFIED_INTACT',
      integrity_intact: true,
      verified_at: new Date().toISOString(),
      message: 'Mock SHA-256 verification succeeded.',
    });
  }
  if (url.pathname === '/api/health' && request.method() === 'GET') {
    return jsonResponse(state.healthPayload);
  }
  if (url.pathname === '/api/cases' && request.method() === 'GET') {
    const list = state.caseCreated ? [caseData] : [];
    if (state.demoMode) list.unshift(demoCaseData);
    return jsonResponse(list);
  }
  if (url.pathname === `/api/cases/${demoCaseData.case_identifier}` && request.method() === 'GET') {
    return jsonResponse(demoCaseData);
  }
  if (url.pathname === `/api/cases/${demoCaseData.case_identifier}/overview` && request.method() === 'GET') {
    return jsonResponse({
      case_identifier: demoCaseData.case_identifier,
      title: demoCaseData.title,
      status: demoCaseData.status,
      created_at: demoCaseData.created_at,
      evidence_count: 7,
      analysis_count: 25,
      completed_analysis_count: 25,
      failed_analysis_count: 0,
      running_job_count: 0,
      pending_job_count: 0,
      findings_count: 4,
      audit_event_count: 20,
      assessment_status: 'MULTIPLE_ANOMALIES_CORROBORATED',
      latest_assessment: 'MULTIPLE_ANOMALIES_CORROBORATED',
    });
  }
  if (url.pathname === `/api/cases/${demoCaseData.case_identifier}/evidence` && request.method() === 'GET') {
    return jsonResponse([demoEvidenceData]);
  }
  if (url.pathname === `/api/cases/${demoCaseData.case_identifier}/evidence/${demoEvidenceData.id}` && request.method() === 'GET') {
    return jsonResponse(demoEvidenceData);
  }
  if (url.pathname === `/api/evidence/${demoEvidenceData.id}` && request.method() === 'GET') {
    return jsonResponse(demoEvidenceData);
  }
  if (url.pathname === `/api/evidence/${demoEvidenceData.id}/raw`) {
    return { status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ZkAAAAASUVORK5CYII=', 'base64') };
  }
  if (url.pathname === `/api/evidence/${demoEvidenceData.id}/jobs` && request.method() === 'GET') {
    return jsonResponse([{ id: 9401, job_identifier: 'FS-JOB-DEMO01', evidence_id: demoEvidenceData.id, analysis_id: 9501, analysis_type: 'ela', engine_version: 'V3.0.0', status: 'COMPLETED', progress_percent: 100, progress_message: 'Completed', attempt_count: 1, queued_at: new Date().toISOString(), completed_at: new Date().toISOString() }]);
  }
  if (url.pathname === `/api/evidence/${demoEvidenceData.id}/analyses` && request.method() === 'GET') {
    return jsonResponse([{ id: 9501, analysis_type: 'ELA', status: 'completed', summary: 'Error level differential detected on spliced region.', structured_findings: {} }]);
  }
  if (url.pathname === `/api/evidence/${demoEvidenceData.id}/heatmap`) {
    return jsonResponse(demoHeatmapData);
  }
  if (url.pathname === `/api/cases/${demoCaseData.case_identifier}/lineage` && request.method() === 'GET') {
    return jsonResponse({
      relations: [{
        id: 1,
        relation_kind: 'DERIVED_FROM',
        review_status: 'VERIFIED',
        parent_evidence_id: 902,
        reviewer: 'demo_instructor',
        review_note: 'Verified derivative relationship',
        matching_details: { orb_inliers: 42 },
        evidence_a: { id: 901, evidence_identifier: 'FS-EVD-DEMO01', filename: 'campaign_composite_splice.jpg', sha256: 'b'.repeat(64), width: 640, height: 480, created_at: new Date().toISOString() },
        evidence_b: { id: 902, evidence_identifier: 'FS-EVD-DEMO02', filename: 'campaign_original_master.png', sha256: 'c'.repeat(64), width: 640, height: 480, created_at: new Date().toISOString() },
      }],
    });
  }
  if (url.pathname === `/api/cases/${demoCaseData.case_identifier}/cross-correlation` && request.method() === 'GET') {
    return jsonResponse({
      case_identifier: demoCaseData.case_identifier,
      total_evidence_evaluated: 7,
      camera_clusters: [],
      temporal_sequence: [],
      cross_image_matches: [{
        evidence_a_id: 901,
        evidence_a_filename: 'campaign_composite_splice.jpg',
        evidence_b_id: 902,
        evidence_b_filename: 'campaign_original_master.png',
        shared_keypoint_count: 42,
        confidence_label: 'HIGH',
        forensic_explanation: 'Keypoint overlap between spliced composite and original master.',
        limitations: 'Synthetic demo dataset.',
      }],
      findings_generated: 4,
      evaluation_timestamp: new Date().toISOString(),
      disclaimer: 'Synthetic demo dataset.',
    });
  }
  if (url.pathname === `/api/cases/${demoCaseData.case_identifier}/graph` && request.method() === 'GET') {
    return jsonResponse(demoGraphData);
  }
  if (url.pathname === `/api/cases/${demoCaseData.case_identifier}/audit` && request.method() === 'GET') {
    return jsonResponse([{ id: 1, sequence_number: 1, event_type: 'CASE_CREATED', actor: 'demo_instructor', timestamp: new Date().toISOString(), details: 'Created FS-DEMO-001' }]);
  }
  if (url.pathname === `/api/cases/${demoCaseData.case_identifier}/chain-of-custody` && request.method() === 'GET') {
    return jsonResponse({
      case_identifier: demoCaseData.case_identifier,
      case_created_at: new Date().toISOString(),
      all_hashes_intact: true,
      total_evidence_items: 1,
      evidence_summaries: [{
        evidence_id: 901,
        evidence_identifier: 'FS-EVD-DEMO01',
        filename: 'campaign_composite_splice.jpg',
        stored_path: 'storage/evidence/demo.jpg',
        ingest_sha256_hash: 'b'.repeat(64),
        current_disk_sha256_hash: 'b'.repeat(64),
        integrity_intact: true,
        verified_at: new Date().toISOString(),
        verifier: 'demo_instructor',
        status: 'VERIFIED',
        message: 'SHA-256 integrity verified.',
      }],
      custody_timeline: [],
    });
  }
  if (url.pathname === `/api/cases/${demoCaseData.case_identifier}/findings` && request.method() === 'GET') {
    return jsonResponse([{ id: 920, title: 'Spliced Composite Region Detected', status: 'VERIFIED', severity: 'HIGH', summary: 'ELA and DCT anomalies corroborate splice.' }]);
  }
  if (url.pathname === `/api/cases/${demoCaseData.case_identifier}/notes` && request.method() === 'GET') {
    const targetId = url.searchParams.get('target_id');
    if (targetId) {
      return jsonResponse(state.savedEvidenceNotes.filter(note => note.target_id === targetId));
    }
    return jsonResponse([{ id: 1, author: 'demo_instructor', target_type: 'EVIDENCE', target_id: String(demoEvidenceData.id), content: 'Verified composite splice against master frame.', created_at: new Date().toISOString() }]);
  }
  if (url.pathname.endsWith('/notes') && request.method() === 'GET') {
    const targetId = url.searchParams.get('target_id');
    return jsonResponse(state.savedEvidenceNotes.filter(note => !targetId || note.target_id === targetId));
  }
  if (url.pathname.endsWith('/notes') && request.method() === 'POST') {
    const requestBody = JSON.parse(request.postData() || '{}');
    const note = {
      id: state.nextNoteId++,
      author: 'workflow-user',
      target_type: requestBody.target_type,
      target_id: requestBody.target_id,
      content: requestBody.content,
      created_at: new Date().toISOString(),
    };
    state.savedEvidenceNotes.unshift(note);
    return jsonResponse(note, 201);
  }
  if (url.pathname === `/api/cases/${demoCaseData.case_identifier}/reports` && request.method() === 'GET') {
    return jsonResponse([demoReportData]);
  }
  if (url.pathname === `/api/reports/${demoReportData.id}/download` && request.method() === 'GET') {
    return jsonResponse({ report_identifier: demoReportData.report_identifier, case_information: { case_identifier: demoCaseData.case_identifier } });
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
  if (url.pathname === '/api/benchmark/datasets' && request.method() === 'GET') {
    return jsonResponse([]);
  }
  if (
    (url.pathname === '/api/benchmark/reports/latest'
      || url.pathname === '/api/benchmark/reports/external/latest'
      || url.pathname === '/api/benchmark/transformation-stress/latest')
    && request.method() === 'GET'
  ) {
    return jsonResponse({ available: false, status: 'NOT_GENERATED', detail: 'No report generated yet.' });
  }
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

  await page.waitForSelector('button[aria-label="Close Forensic Lab tour"]', { timeout: 5000 });
  assert.ok(
    (await page.$eval('[role="dialog"] h2', (element) => element.textContent)).includes('Choose a working style'),
    'first visit should open the Forensic Lab tour at its first step',
  );
  await page.click('button[aria-label="Close Forensic Lab tour"]');

  await page.click('#tab-guided');
  await page.waitForSelector('#panel-guided');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('#panel-guided button')).some(button => button.innerText.replace(/\s+/g, ' ').trim() === 'Run Single'));
  await clickButton(page, 'Run Single', true);
  await clickButton(page, 'Core DIP Engines');
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

  // 11: Instructor Demonstration Investigation (FS-DEMO-001) 15-step journey
  state.demoMode = true;
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="fill-demo-credentials"]');
  await page.click('[data-testid="fill-demo-credentials"]');
  const filledUser = await page.$eval('#username', (el) => el.value);
  const filledPass = await page.$eval('#password', (el) => el.value);
  assert.equal(filledUser, 'demo_instructor');
  assert.equal(filledPass, 'forensight_demo_instructor');
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname === '/cases');
  await page.waitForSelector('[data-testid="demo-case-badge"]');
  await page.waitForFunction(() => document.body.innerText.includes('FS-DEMO-001'));

  await page.goto(`${baseUrl}/cases/FS-DEMO-001`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="workspace-demo-badge"]');

  await page.goto(`${baseUrl}/cases/FS-DEMO-001/evidence`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('campaign_composite_splice.jpg'));

  await page.goto(`${baseUrl}/cases/FS-DEMO-001/evidence/901`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('campaign_composite_splice.jpg'));

  await page.goto(`${baseUrl}/cases/FS-DEMO-001/lineage`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('DERIVED FROM'));

  await page.goto(`${baseUrl}/cases/FS-DEMO-001/cross-correlation`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('Cross-Image') || document.body.innerText.includes('Correlation'));

  await page.goto(`${baseUrl}/cases/FS-DEMO-001/graph`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__forensightGraphMetrics && window.__forensightGraphMetrics.nodes.length >= 5);
  await clickButton(page, 'Evidence Clusters');
  await new Promise((resolve) => setTimeout(resolve, 100));
  await clickButton(page, 'Hierarchical DAG');
  await new Promise((resolve) => setTimeout(resolve, 100));
  const demoNodePos = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const rect = canvas.getBoundingClientRect();
    const ev = window.__forensightGraphMetrics.nodes.find((n) => n.id === 'ev:901');
    return { x: rect.left + ev.screenX, y: rect.top + ev.screenY };
  });
  await page.mouse.click(demoNodePos.x, demoNodePos.y);
  await page.waitForFunction(() => document.body.innerText.toUpperCase().includes('CONNECTED LINKS'));

  await page.goto(`${baseUrl}/cases/FS-DEMO-001/audit`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('CASE CREATED'));

  await page.goto(`${baseUrl}/cases/FS-DEMO-001/custody`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('FS-EVD-DEMO01'));

  await page.goto(`${baseUrl}/cases/FS-DEMO-001/analyst`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('Spliced Composite Region Detected') || document.body.innerText.includes('Verified composite splice'));

  await page.goto(`${baseUrl}/cases/FS-DEMO-001/reports`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('FS-RPT-DEMO01'));

  // 12: Vercel same-origin proxy config, localhost-free prod bundle, CSRF, session persistence & logout
  const vercelConfigPath = path.join(__dirname, 'vercel.json');
  assert.ok(fs.existsSync(vercelConfigPath), 'frontend/vercel.json must exist');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));
  assert.ok(!vercelConfig.redirects, 'vercel.json must not use redirects for API proxying');
  const apiRewrite = (vercelConfig.rewrites || []).find((r) => r.source === '/api/:path*');
  assert.ok(apiRewrite, 'vercel.json must define /api/:path* rewrite');
  assert.ok(apiRewrite.destination.startsWith('https://') && apiRewrite.destination.endsWith('/api/:path*'), 'API rewrite must target HTTPS origin and preserve /api/:path*');
  const spaRewrite = (vercelConfig.rewrites || []).find((r) => r.destination === '/index.html');
  assert.ok(spaRewrite && spaRewrite.source.includes('(?!api/'), 'SPA fallback rewrite must exclude /api/ and static assets');

  const distAssetsDir = path.join(__dirname, 'dist', 'assets');
  if (fs.existsSync(distAssetsDir)) {
    for (const file of fs.readdirSync(distAssetsDir).filter((f) => f.endsWith('.js'))) {
      const content = fs.readFileSync(path.join(distAssetsDir, file), 'utf8');
      assert.ok(!content.includes('localhost:8001') && !content.includes('localhost:8000'), `Production bundle ${file} must not contain localhost backend URLs`);
    }
  }

  assert.ok(state.requestedApiQueries.some((q) => q.includes('/api/cases?skip=0&limit=100')), 'API query parameters must be preserved');

  await page.goto(`${baseUrl}/cases`, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.location.pathname === '/cases');

  await page.evaluate(() => { document.cookie = 'fs_csrf=e2e-csrf-token-123; path=/'; });
  await clickButton(page, 'Sign Out');
  await page.waitForFunction(() => window.location.pathname === '/login');
  assert.ok(state.seenCsrfTokens.includes('POST /api/auth/logout:e2e-csrf-token-123'), 'Logout must transmit X-CSRF-Token from fs_csrf cookie');

  // 13: Stability & navigation regressions (health dedup, benchmark latest 200, intake scroll, workbench tab scroll stability)
  // Re-login to test authenticated stability paths
  await page.waitForSelector('[data-testid="fill-demo-credentials"]');
  await clickButton(page, 'Use Instructor Demo Credentials');
  await clickButton(page, 'Sign In');
  await page.waitForFunction(() => window.location.pathname === '/cases');

  // 13a: Benchmark /latest endpoints return 200 empty-state without 404 errors
  const benchmarkLatestStatuses = [];
  const onBenchRes = (res) => {
    if (res.url().includes('/api/benchmark/') && res.url().includes('/latest')) {
      benchmarkLatestStatuses.push({ url: res.url(), status: res.status() });
    }
  };
  page.on('response', onBenchRes);
  await page.goto(`${baseUrl}/benchmark`, { waitUntil: 'networkidle0' });
  page.off('response', onBenchRes);
  assert.equal(benchmarkLatestStatuses.length, 3, 'Benchmark page should query all 3 /latest endpoints');
  assert.ok(benchmarkLatestStatuses.every((r) => r.status === 200), 'All /latest benchmark endpoints must return 200 without 404s');

  // 13b: SystemHealth fires single non-overlapping /health request and shows genuine failures
  let healthRequests = 0;
  let healthFailed = 0;
  const onHealthReq = (req) => {
    if (req.url().includes('/api/health')) healthRequests += 1;
  };
  const onHealthFail = (req) => {
    if (req.url().includes('/api/health')) healthFailed += 1;
  };
  page.on('request', onHealthReq);
  page.on('requestfailed', onHealthFail);
  await page.goto(`${baseUrl}/system`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="health-card-gateway"]');
  page.off('request', onHealthReq);
  page.off('requestfailed', onHealthFail);
  assert.equal(healthRequests, 1, 'SystemHealth must issue exactly 1 /api/health request on mount without overlapping duplicates');
  assert.equal(healthFailed, 0, 'SystemHealth must not cancel its own /api/health request on StrictMode mount');

  // 13c: Evidence Intake (/cases/intake) wraps content in scrollable .page-container
  await page.goto(`${baseUrl}/cases/intake`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('form');
  const intakeScrollMetrics = await page.evaluate(() => {
    const pc = document.querySelector('.page-container');
    if (!pc) return null;
    pc.scrollTop = 250;
    return {
      overflowY: getComputedStyle(pc).overflowY,
      scrollHeight: pc.scrollHeight,
      clientHeight: pc.clientHeight,
      scrollTop: pc.scrollTop,
    };
  });
  assert.ok(intakeScrollMetrics, 'Evidence Intake must render inside .page-container');
  assert.equal(intakeScrollMetrics.overflowY, 'auto', '.page-container must have overflow-y: auto');
  assert.ok(intakeScrollMetrics.scrollHeight > intakeScrollMetrics.clientHeight, 'Evidence Intake must be taller than viewport to scroll');
  assert.ok(intakeScrollMetrics.scrollTop > 0, 'Evidence Intake .page-container must scroll vertically');

  // 13d: EvidenceDetail tab switching preserves scroll position and avoids remounting
  await page.goto(`${baseUrl}/cases/FS-DEMO-001/evidence/${demoEvidenceData.id}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#workbench-nav');
  await page.waitForSelector('#tab-analyst[aria-selected="true"]');
  const defaultExaminationMode = await page.evaluate(() => ({
    analystPanelVisible: Boolean(document.querySelector('#panel-analyst')),
    guidedPanelVisible: Boolean(document.querySelector('#panel-guided')),
    analystFiltersVisible: Boolean(document.querySelector('#panel-analyst [data-tour-target="lab-analyst-filters"]')),
  }));
  assert.ok(defaultExaminationMode.analystPanelVisible && defaultExaminationMode.analystFiltersVisible, 'Analyst Workbench and its filters must be open by default');
  assert.ok(!defaultExaminationMode.guidedPanelVisible, 'Guided Investigation must remain available as an alternate mode');

  await page.click('#tab-guided');
  await page.waitForSelector('[data-testid="examination-selection-summary"]');
  const guidedModeDetails = await page.evaluate(() => ({
    metadataDetailsCollapsed: document.querySelector('[data-testid="examination-guidance-metadata"]')?.open === false,
    selection: document.querySelector('[data-testid="examination-selection-summary"]')?.textContent,
  }));
  assert.ok(guidedModeDetails.metadataDetailsCollapsed, 'Per-examination purpose and limitation details must be collapsed initially');
  assert.ok(guidedModeDetails.selection?.includes('Compatible') && guidedModeDetails.selection.includes('Selected'), 'The guided selector must distinguish compatibility from selection');
  await page.click('#tab-analyst');
  await page.waitForSelector('#panel-analyst');

  const workbenchCountLabels = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('#workbench-nav button'));
    return {
      compression: buttons.find((button) => button.textContent.includes('Container & Compression'))?.getAttribute('aria-label'),
      all: buttons.find((button) => button.textContent.includes('All Modalities'))?.getAttribute('aria-label'),
      help: document.querySelector('[data-testid="workbench-counts-help"]')?.textContent,
      navBackground: getComputedStyle(document.querySelector('#workbench-nav')).backgroundColor,
      panelBackground: getComputedStyle(document.querySelector('[data-testid="forensic-workbench-panel"]')).backgroundColor,
      navPosition: getComputedStyle(document.querySelector('#workbench-nav')).position,
      navBottom: document.querySelector('#workbench-nav').getBoundingClientRect().bottom,
      helpTop: document.querySelector('[data-testid="workbench-counts-help"]').getBoundingClientRect().top,
      fusionPanelPresent: Boolean(document.querySelector('.fusion-assessment-panel')),
      fusionPanelRadius: getComputedStyle(document.querySelector('.fusion-assessment-panel')).borderRadius,
    };
  });
  assert.match(workbenchCountLabels.compression || '', /\d+ of 5 (?:format-compatible )?examinations completed/, 'Container & Compression must report its actual five compatible engines');
  assert.match(workbenchCountLabels.all || '', /\d+ of 23 registered examinations completed/, 'All Modalities must report completed versus registered engines');
  assert.ok(workbenchCountLabels.help?.includes('workflow counts'), 'Workbench counters must explain what the counts represent');
  assert.notEqual(workbenchCountLabels.navBackground, 'rgba(0, 0, 0, 0)', 'Workbench navigation must have an opaque theme background');
  assert.notEqual(workbenchCountLabels.navBackground, workbenchCountLabels.panelBackground, 'Workbench navigation must have a visible theme-tinted surface');
  assert.notEqual(workbenchCountLabels.navPosition, 'sticky', 'Workbench navigation must not overlay scrolling page content');
  assert.ok(workbenchCountLabels.helpTop >= workbenchCountLabels.navBottom, 'Workbench helper text must not overlap the navigation');
  assert.ok(workbenchCountLabels.fusionPanelPresent, 'Fusion assessment must render with the workbench');
  assert.equal(workbenchCountLabels.fusionPanelRadius, '12px', 'Fusion assessment card must use the shared design-system radius');
  await page.waitForSelector('[data-testid="forensic-next-step-button"]');
  const nextStepTarget = await page.$eval('[data-testid="forensic-next-step-button"]', (button) => button.getAttribute('data-target-tab'));
  await page.click('[data-testid="forensic-next-step-button"]');
  assert.equal(await page.$eval(`#tab-${nextStepTarget}`, (tab) => tab.getAttribute('aria-selected')), 'true', 'Suggested next step must open its corresponding results view');
  await page.click('#tab-overview');

  const tabScrollResult = await page.evaluate(async () => {
    const pc = document.querySelector('.page-container');
    pc.scrollTop = 450;
    const beforeScroll = pc.scrollTop;
    const btns = Array.from(document.querySelectorAll('#workbench-nav button'));
    const compBtn = btns.find((b) => (b.textContent || '').includes('Container & Compression'));
    compBtn.click();
    await new Promise((r) => setTimeout(r, 150));
    const duringOrAfterScroll = pc.scrollTop;
    const coreBtn = Array.from(document.querySelectorAll('#workbench-nav button')).find((b) => (b.textContent || '').includes('Core DIP Engines'));
    coreBtn.click();
    await new Promise((r) => setTimeout(r, 100));
    const coreGrid = document.querySelector('[data-testid="core-dip-engines-grid"]');
    return {
      beforeScroll,
      duringOrAfterScroll,
      afterCoreScroll: pc.scrollTop,
      hasWorkbenchNav: Boolean(document.querySelector('#workbench-nav')),
      coreGridAlignItems: coreGrid ? getComputedStyle(coreGrid).alignItems : null,
    };
  });
  assert.ok(tabScrollResult.hasWorkbenchNav, '#workbench-nav must remain mounted across tab switches');
  assert.ok(tabScrollResult.duringOrAfterScroll >= 300, `Lazy tab switch must not jump scrollTop to 0 (got ${tabScrollResult.duringOrAfterScroll})`);
  assert.ok(tabScrollResult.afterCoreScroll >= 300, `Core DIP tab switch must not jump scrollTop to 0 (got ${tabScrollResult.afterCoreScroll})`);
  assert.equal(tabScrollResult.coreGridAlignItems, 'start', 'Core DIP Engines grid must use align-items: start to avoid blank card stretching');

  // 14: Investigation Workbench Dark-Mode Visibility & Top-Level Navigation Continuity
  await page.evaluate(() => {
    localStorage.setItem('forensight-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  // 14a: Top-level navigation strip sequence & horizontal scroll preservation
  const navStability = await page.evaluate(async () => {
    const pc = document.querySelector('.page-container');
    const nav = document.getElementById('workbench-nav');
    pc.scrollTop = 550;
    nav.scrollLeft = 40;
    const initialNavScrollLeft = nav.scrollLeft;

    const findTab = (name) => Array.from(nav.querySelectorAll('button')).find((b) => (b.textContent || '').includes(name));

    // Sequence: Microscopy -> Physics -> Core DIP -> Microscopy -> Overview
    findTab('Microscopy').click();
    await new Promise((r) => setTimeout(r, 100));
    const s1 = pc.scrollTop;

    findTab('Physics & Geometry').click();
    await new Promise((r) => setTimeout(r, 100));
    const s2 = pc.scrollTop;

    findTab('Core DIP Engines').click();
    await new Promise((r) => setTimeout(r, 100));
    const s3 = pc.scrollTop;

    findTab('Microscopy').click();
    await new Promise((r) => setTimeout(r, 100));
    const s4 = pc.scrollTop;

    findTab('Overview').click();
    await new Promise((r) => setTimeout(r, 100));
    const s5 = pc.scrollTop;

    // Check active tab styling in dark mode
    const activeTab = nav.querySelector('.workbench-nav-tab.active');
    const activeStyles = activeTab ? getComputedStyle(activeTab) : null;
    const activeBadge = activeTab ? activeTab.querySelector('.workbench-nav-badge') : null;
    const badgeStyles = activeBadge ? getComputedStyle(activeBadge) : null;

    return {
      initialNavScrollLeft,
      finalNavScrollLeft: nav.scrollLeft,
      scrollPositions: [s1, s2, s3, s4, s5],
      activeTabHasClass: Boolean(activeTab),
      activeTabColor: activeStyles?.color,
      badgeColor: badgeStyles?.color,
    };
  });

  assert.ok(navStability.activeTabHasClass, 'Active investigation tab must carry .workbench-nav-tab.active');
  assert.ok(
    navStability.scrollPositions.every((s) => s >= 400),
    `Investigation tab navigation sequence must preserve scroll position without reset to top: ${JSON.stringify(navStability.scrollPositions)}`,
  );

  const allModalitiesBehavior = await page.evaluate(async () => {
    const nav = document.getElementById('workbench-nav');
    const allButton = Array.from(nav.querySelectorAll('button')).find((button) => (button.textContent || '').includes('All Modalities'));
    allButton.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const summary = document.querySelector('[data-testid="all-modalities-summary"]');
    const loadedAllViewers = Boolean(document.querySelector('[data-testid="core-dip-engines-grid"]'));
    const activeButton = nav.querySelector('button[aria-pressed="true"]');
    const summaryCoreButton = document.querySelector('[aria-label^="Open Core DIP Engines"]');
    if (summaryCoreButton) summaryCoreButton.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      hasSummary: Boolean(summary),
      loadedAllViewers,
      selectedAllButton: activeButton?.textContent.includes('All Modalities') || false,
      coreLoadedOnDemand: Boolean(document.querySelector('[data-testid="core-dip-engines-grid"]')),
    };
  });
  assert.ok(allModalitiesBehavior.hasSummary, 'All Modalities must show a lightweight navigation summary');
  assert.equal(allModalitiesBehavior.loadedAllViewers, false, 'All Modalities must not mount every viewer eagerly');
  assert.ok(allModalitiesBehavior.selectedAllButton, 'Workbench navigation must expose the selected view');
  assert.ok(allModalitiesBehavior.coreLoadedOnDemand, 'A selected modality must load when opened from the summary');

  await page.focus('#tab-overview');
  await page.keyboard.press('ArrowRight');
  const resultsTabKeyboard = await page.$eval('#tab-spatial', (tab) => ({
    selected: tab.getAttribute('aria-selected'),
    tabIndex: tab.tabIndex,
    focused: document.activeElement === tab,
  }));
  assert.equal(resultsTabKeyboard.selected, 'true', 'Arrow navigation must select the next results tab');
  assert.equal(resultsTabKeyboard.tabIndex, 0, 'Only the selected results tab should be in the tab sequence');
  assert.ok(resultsTabKeyboard.focused, 'Arrow navigation must move keyboard focus with selection');
  await page.click('#tab-overview');

  // 14b: Interactive Microscopy dark-mode controls visibility & contrast
  await page.evaluate(() => {
    const nav = document.getElementById('workbench-nav');
    Array.from(nav.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Microscopy')).click();
  });
  await page.waitForSelector('.microscopy-control-console');
  await page.focus('[role="region"][aria-label^="Image inspection viewport"]');
  await page.keyboard.press('ArrowRight');
  const keyboardPan = await page.$eval('[role="region"][aria-label^="Image inspection viewport"] canvas', (canvas) => canvas.style.left);
  assert.equal(keyboardPan, '-20px', 'The microscopy viewport must pan with keyboard arrow keys');
  await page.keyboard.press('Home');
  const keyboardReset = await page.$eval('[role="region"][aria-label^="Image inspection viewport"] canvas', (canvas) => canvas.style.left);
  assert.equal(keyboardReset, '0px', 'Home must reset microscopy viewport pan');

  const microscopyDarkMetrics = await page.evaluate(async () => {
    const sweepBtn = Array.from(document.querySelectorAll('.microscopy-btn')).find((b) => (b.textContent || '').includes('Level Sweep'));
    if (sweepBtn) sweepBtn.click();

    const checkboxes = Array.from(document.querySelectorAll('.microscopy-checkbox-label input[type="checkbox"]'));
    checkboxes.forEach((cb) => { if (!cb.checked) cb.click(); });
    await new Promise((r) => setTimeout(r, 100));

    const activeFilterBtn = document.querySelector('.microscopy-btn.active');
    const inactiveFilterBtn = Array.from(document.querySelectorAll('.microscopy-btn')).find((b) => !b.classList.contains('active'));
    const activeChip = document.querySelector('.microscopy-chip-btn.active');
    const inactiveChip = Array.from(document.querySelectorAll('.microscopy-chip-btn')).find((b) => !b.classList.contains('active'));
    const checkboxLabel = document.querySelector('.microscopy-checkbox-label');
    const codeBadge = document.querySelector('.microscopy-code-badge');
    const selectControl = document.querySelector('.microscopy-select');

    return {
      activeFilterColor: activeFilterBtn ? getComputedStyle(activeFilterBtn).color : null,
      inactiveFilterColor: inactiveFilterBtn ? getComputedStyle(inactiveFilterBtn).color : null,
      activeChipColor: activeChip ? getComputedStyle(activeChip).color : null,
      inactiveChipColor: inactiveChip ? getComputedStyle(inactiveChip).color : null,
      checkboxLabelColor: checkboxLabel ? getComputedStyle(checkboxLabel).color : null,
      codeBadgeBg: codeBadge ? getComputedStyle(codeBadge).backgroundColor : null,
      codeBadgeColor: codeBadge ? getComputedStyle(codeBadge).color : null,
      selectBg: selectControl ? getComputedStyle(selectControl).backgroundColor : null,
      selectColor: selectControl ? getComputedStyle(selectControl).color : null,
    };
  });

  assert.ok(microscopyDarkMetrics.activeFilterColor, 'Active filter button must have computed color');
  assert.ok(microscopyDarkMetrics.inactiveFilterColor, 'Inactive filter button must have computed color');
  assert.notEqual(microscopyDarkMetrics.inactiveFilterColor, 'rgb(0, 0, 0)', 'Inactive filter button must not be pure black in dark mode');
  assert.notEqual(microscopyDarkMetrics.checkboxLabelColor, 'rgb(0, 0, 0)', 'Checkbox label must not be pure black in dark mode');
  assert.ok(microscopyDarkMetrics.codeBadgeColor, 'Code badge must have visible color in dark mode');
  assert.ok(microscopyDarkMetrics.selectBg, 'Select control must have styled dark background');

  // 15: Investigation Workbench Overview & Attention Heatmap Opacity Functional Verification
  const demoCloneLayer = demoHeatmapData.layers.find((layer) => layer.modality === 'COPY_MOVE');
  const originalCloneRegions = demoCloneLayer.regions;
  const originalCompositeRegionCount = demoHeatmapData.composite_regions_count;
  demoCloneLayer.regions = Array.from({ length: 320 }, (_, index) => ({
    modality: 'COPY_MOVE',
    x: (index % 10) * 0.08,
    y: (Math.floor(index / 10) % 10) * 0.08,
    width: 0.06,
    height: 0.06,
    intensity: 1 - index / 1200,
    description: `Synthetic candidate region ${index + 1}`,
  }));
  demoHeatmapData.composite_regions_count = 322;
  await page.setViewport({ width: 1366, height: 768 });
  await page.goto(`${baseUrl}/cases/FS-DEMO-001/evidence/${demoEvidenceData.id}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="heatmap-region-limit"]');
  await page.waitForFunction(() => {
    const image = document.querySelector('.heatmap-map-image');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
  await page.$eval('.page-container', container => { container.scrollTop = 0; });
  const heatmapFrameMetrics = await page.evaluate(() => {
    const image = document.querySelector('.heatmap-map-image');
    if (!(image instanceof HTMLImageElement)) return null;
    return {
      height: image.getBoundingClientRect().height,
      horizontalGutter: (document.querySelector('.heatmap-map-viewport').getBoundingClientRect().width - image.getBoundingClientRect().width) / 2,
      maxHeight: parseFloat(getComputedStyle(image).maxHeight),
    };
  });
  assert.ok(heatmapFrameMetrics && heatmapFrameMetrics.height <= heatmapFrameMetrics.maxHeight + 1, 'Heatmap image must stay within its responsive height limit');
  assert.ok(heatmapFrameMetrics && heatmapFrameMetrics.horizontalGutter <= 4, 'Heatmap frame must not show wide empty side bars');
  await page.$eval('.heatmap-text-description', details => { details.open = true; });
  const interpretationScrollMetrics = await page.$eval('.heatmap-interpretation-column', element => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight,
    height: parseFloat(getComputedStyle(element).height),
  }));
  assert.equal(interpretationScrollMetrics.overflowY, 'auto', 'Interpretation panel must scroll internally');
  assert.ok(interpretationScrollMetrics.scrollHeight > interpretationScrollMetrics.clientHeight, 'Long interpretation details must not expand the page panel');
  assert.ok(Math.abs(interpretationScrollMetrics.clientHeight - interpretationScrollMetrics.height) <= 1, 'Scrollable interpretation panel must use the same height as the image viewport');
  const desktopHeatmapColumns = await page.$eval('.heatmap-analysis-layout', element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  assert.equal(desktopHeatmapColumns, 2, 'Heatmap interpretation must sit beside the image on desktop');
  await page.setViewport({ width: 760, height: 768 });
  const mobileHeatmapColumns = await page.$eval('.heatmap-analysis-layout', element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  assert.equal(mobileHeatmapColumns, 1, 'Heatmap interpretation must stack below the image on narrow screens');
  await page.setViewport({ width: 1440, height: 1000 });

  const combinedWorkbenchPanel = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="forensic-workbench-panel"]');
    return {
      containsNavigation: Boolean(panel?.contains(document.querySelector('#workbench-nav'))),
      containsHeatmap: Boolean(panel?.contains(document.querySelector('.workbench-overview-content'))),
      borderRadius: panel ? getComputedStyle(panel).borderRadius : null,
    };
  });
  assert.ok(combinedWorkbenchPanel.containsNavigation && combinedWorkbenchPanel.containsHeatmap, 'Workbench navigation and multi-modality heatmap must share one panel');
  assert.equal(combinedWorkbenchPanel.borderRadius, '8px', 'Combined workbench panel must use subtly rounded corners');

  const initialOverlayDensity = await page.evaluate(() => ({
    displayMode: document.querySelector('[data-testid="heatmap-display-mode"]')?.value,
    limit: document.querySelector('[data-testid="heatmap-region-limit"]')?.value,
    densityCells: document.querySelectorAll('[data-testid="heatmap-density-cell"]').length,
    visibleRegions: document.querySelectorAll('[data-testid="heatmap-candidate-region"]').length,
    visibleLabels: document.querySelectorAll('[data-testid="heatmap-candidate-label"]').length,
    countText: document.querySelector('[data-testid="heatmap-region-count"]')?.textContent,
  }));
  assert.equal(initialOverlayDensity.displayMode, 'auto', 'Heatmap must use automatic density selection by default');
  assert.ok(initialOverlayDensity.densityCells > 0 && initialOverlayDensity.densityCells <= 1600, 'Crowded results should default to a bounded density grid');
  assert.equal(initialOverlayDensity.visibleRegions, 0, 'Automatic density view must avoid drawing the crowded set as individual boxes');
  assert.match(initialOverlayDensity.countText || '', /Aggregating 322 candidate region centers/, 'Automatic density view must disclose how proposals are aggregated');
  assert.equal(initialOverlayDensity.limit, '100', 'Dense heatmaps must default to a focused 100-region-per-layer view');
  assert.equal(initialOverlayDensity.visibleLabels, 0, 'Density view must omit overlapping individual region labels');

  await page.select('[data-testid="heatmap-display-mode"]', 'density');
  await page.waitForSelector('[data-testid="heatmap-density-cell"]');
  const densityViewState = await page.evaluate(() => ({
    cellCount: document.querySelectorAll('[data-testid="heatmap-density-cell"]').length,
    rawRegionCount: document.querySelectorAll('[data-testid="heatmap-candidate-region"]').length,
    hasLegend: Boolean(document.querySelector('[data-testid="heatmap-density-legend"]')),
    countText: document.querySelector('[data-testid="heatmap-region-count"]')?.textContent,
  }));
  assert.ok(densityViewState.cellCount > 0 && densityViewState.cellCount <= 1600, 'Density view must aggregate proposals into a bounded grid');
  assert.equal(densityViewState.rawRegionCount, 0, 'Density view must not render overlapping individual region boxes');
  assert.ok(densityViewState.hasLegend, 'Density view must show a fewer-to-more proposals legend');
  assert.match(densityViewState.countText || '', /Aggregating 322 candidate region centers/, 'Density view must explain that cells aggregate region centers');
  await page.$eval('[data-testid="heatmap-density-cell"]', element => element.focus());
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="heatmap-selection-detail"]');
  assert.match(
    await page.$eval('[data-testid="heatmap-selection-detail"]', (element) => element.textContent),
    /region centers.*Methods:/,
    'Selecting a density cell must reveal counts and representative method details',
  );
  assert.equal(await page.$eval('[data-testid="heatmap-map-content"]', element => element.style.transform), 'scale(2)', 'Selecting a cell must zoom the map to that region');
  const firstFocusedDensityCell = await page.evaluate(() => document.activeElement?.getAttribute('data-heatmap-density-cell'));
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((previousCell) => document.activeElement?.getAttribute('data-heatmap-density-cell') !== previousCell, {}, firstFocusedDensityCell);
  await page.click('[data-testid="heatmap-clear-focus"]');
  assert.equal(await page.$eval('[data-testid="heatmap-map-content"]', element => element.style.transform), 'scale(1)', 'Clearing focus must restore the full-image view');
  await page.select('[data-testid="heatmap-display-mode"]', 'regions');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="heatmap-candidate-region"]').length === 102);
  assert.equal(
    await page.$$eval('[data-testid="heatmap-candidate-label"]', (elements) => elements.length),
    10,
    'Individual mode must limit labels to eight per layer or fewer for small layers',
  );
  assert.match(
    await page.$eval('[data-testid="heatmap-region-count"]', (element) => element.textContent),
    /Showing 102 of 322/,
    'Individual mode must disclose the capped visible count and total proposals',
  );
  await page.$eval('[data-testid="heatmap-candidate-region"]', element => element.focus());
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="heatmap-selection-detail"]');
  assert.match(
    await page.$eval('[data-testid="heatmap-selection-detail"]', (element) => element.textContent),
    /Bounding box:.*Display intensity.*not a probability/,
    'Selecting an individual proposal must disclose its bounds without presenting display intensity as probability',
  );
  await page.click('[data-testid="heatmap-clear-focus"]');

  await page.select('[data-testid="heatmap-region-limit"]', '250');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="heatmap-candidate-region"]').length === 252);
  assert.match(
    await page.$eval('[data-testid="heatmap-region-count"]', (element) => element.textContent),
    /Showing 252 of 322/,
    'Increasing overlay detail must reveal the full available region set when it is below the selected limit',
  );
  await page.select('[data-testid="heatmap-region-limit"]', '100');

  // Return to Overview tab
  await page.evaluate(() => {
    const nav = document.getElementById('workbench-nav');
    const overviewBtn = Array.from(nav.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Overview'));
    if (overviewBtn) overviewBtn.click();
  });
  await page.waitForSelector('[data-testid="heatmap-opacity-slider"]');
  await page.waitForSelector('[data-testid="heatmap-overlay-svg"]');

  // 15a: Verify initial default opacity (30%)
  const initialOpacityData = await page.evaluate(() => {
    const label = document.querySelector('[data-testid="heatmap-opacity-label"]');
    const slider = document.querySelector('[data-testid="heatmap-opacity-slider"]');
    const svg = document.querySelector('[data-testid="heatmap-overlay-svg"]');
    const elaLayer = document.querySelector('[data-testid="heatmap-layer-ela"]');
    const noiseLayer = document.querySelector('[data-testid="heatmap-layer-noise"]');
    const cloneLayer = document.querySelector('[data-testid="heatmap-layer-copy_move"]');

    return {
      labelText: label ? label.textContent.trim() : null,
      sliderValue: slider ? slider.value : null,
      sliderMin: slider ? slider.min : null,
      sliderMax: slider ? slider.max : null,
      sliderStep: slider ? slider.step : null,
      svgOpacity: svg ? getComputedStyle(svg).opacity : null,
      hasEla: Boolean(elaLayer),
      hasNoise: Boolean(noiseLayer),
      hasClone: Boolean(cloneLayer),
    };
  });

  assert.equal(initialOpacityData.labelText, 'Opacity: 30%', 'Initial opacity label must display Opacity: 30%');
  assert.equal(initialOpacityData.sliderValue, '0.3', 'Initial slider value must be 0.3');
  assert.equal(initialOpacityData.svgOpacity, '0.3', 'Rendered heatmap SVG overlay must have initial computed opacity of 0.3');
  assert.ok(initialOpacityData.hasEla, 'Heatmap must render ELA layer');
  assert.ok(initialOpacityData.hasNoise, 'Heatmap must render Noise layer');
  assert.ok(initialOpacityData.hasClone, 'Heatmap must render Copy-Move layer');

  // Helper to set slider value and dispatch input/change events with React value tracker support
  const setSlider = async (val) => {
    await page.evaluate((targetVal) => {
      const slider = document.querySelector('[data-testid="heatmap-opacity-slider"]');
      if (!slider) return;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeSetter.call(slider, String(targetVal));
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    }, val);

    await page.waitForFunction((targetVal) => {
      const svg = document.querySelector('[data-testid="heatmap-overlay-svg"]');
      return svg && Math.abs(Number(getComputedStyle(svg).opacity) - targetVal) < 0.001;
    }, { timeout: 2000 }, val);

    return page.evaluate(() => {
      const slider = document.querySelector('[data-testid="heatmap-opacity-slider"]');
      const label = document.querySelector('[data-testid="heatmap-opacity-label"]');
      const svg = document.querySelector('[data-testid="heatmap-overlay-svg"]');

      return {
        labelText: label ? label.textContent.trim() : null,
        sliderValue: slider ? slider.value : null,
        svgOpacity: svg ? getComputedStyle(svg).opacity : null,
      };
    });
  };

  // 15b: Moving slider to 25% updates displayed value and rendered overlay opacity
  const state25 = await setSlider(0.25);
  assert.equal(state25.labelText, 'Opacity: 25%', 'Displayed opacity label must update immediately to Opacity: 25%');
  assert.ok(Math.abs(Number(state25.svgOpacity) - 0.25) < 0.001, 'Rendered heatmap SVG overlay must reach 25% (0.25) opacity');

  // 15c: Moving slider to 90% updates displayed value and rendered overlay opacity
  const state90 = await setSlider(0.9);
  assert.equal(state90.labelText, 'Opacity: 90%', 'Displayed opacity label must update immediately to Opacity: 90%');
  assert.ok(Math.abs(Number(state90.svgOpacity) - 0.9) < 0.001, 'Rendered heatmap SVG overlay must reach 90% (0.9) opacity');

  // 15d: Disabling an individual layer hides that layer without breaking opacity control
  await page.evaluate(() => {
    const elaToggle = document.querySelector('[data-testid="heatmap-layer-ela-toggle"]');
    if (elaToggle && elaToggle.checked) elaToggle.click();
  });
  await new Promise((r) => setTimeout(r, 100));

  const afterDisableEla = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="heatmap-overlay-svg"]');
    const elaLayer = document.querySelector('[data-testid="heatmap-layer-ela"]');
    const noiseLayer = document.querySelector('[data-testid="heatmap-layer-noise"]');
    const cloneLayer = document.querySelector('[data-testid="heatmap-layer-copy_move"]');

    return {
      svgOpacity: svg ? getComputedStyle(svg).opacity : null,
      hasEla: Boolean(elaLayer),
      hasNoise: Boolean(noiseLayer),
      hasClone: Boolean(cloneLayer),
    };
  });

  assert.equal(afterDisableEla.hasEla, false, 'Disabling ELA layer must hide ELA layer in SVG');
  assert.equal(afterDisableEla.hasNoise, true, 'Noise layer must remain visible when ELA is disabled');
  assert.equal(afterDisableEla.hasClone, true, 'Clone layer must remain visible when ELA is disabled');
  assert.equal(afterDisableEla.svgOpacity, '0.9', 'Overlay opacity must remain at selected 0.9 when a layer is hidden');
  assert.match(
    await page.$eval('[data-testid="heatmap-region-count"]', (element) => element.textContent),
    /Showing 101 of 321/,
    'Displayed heatmap count must update when a modality layer is hidden',
  );

  // 15e: Re-enabling the layer restores its visibility using selected opacity
  await page.evaluate(() => {
    const elaToggle = document.querySelector('[data-testid="heatmap-layer-ela-toggle"]');
    if (elaToggle && !elaToggle.checked) elaToggle.click();
  });
  await new Promise((r) => setTimeout(r, 100));

  const afterReenableEla = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="heatmap-overlay-svg"]');
    const elaLayer = document.querySelector('[data-testid="heatmap-layer-ela"]');
    return {
      hasEla: Boolean(elaLayer),
      svgOpacity: svg ? getComputedStyle(svg).opacity : null,
    };
  });

  assert.equal(afterReenableEla.hasEla, true, 'Re-enabling ELA layer must restore ELA layer in SVG');
  assert.equal(afterReenableEla.svgOpacity, '0.9', 'Restored layer must retain selected 0.9 opacity');

  // 15f: Switching tabs and returning preserves the selected opacity value
  await page.evaluate(() => {
    const nav = document.getElementById('workbench-nav');
    const microscopyBtn = Array.from(nav.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Microscopy'));
    if (microscopyBtn) microscopyBtn.click();
  });
  await new Promise((r) => setTimeout(r, 100));

  await page.evaluate(() => {
    const nav = document.getElementById('workbench-nav');
    const overviewBtn = Array.from(nav.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Overview'));
    if (overviewBtn) overviewBtn.click();
  });
  await page.waitForSelector('[data-testid="heatmap-overlay-svg"]');

  const afterTabSwitch = await page.evaluate(() => {
    const label = document.querySelector('[data-testid="heatmap-opacity-label"]');
    const slider = document.querySelector('[data-testid="heatmap-opacity-slider"]');
    const svg = document.querySelector('[data-testid="heatmap-overlay-svg"]');
    return {
      labelText: label ? label.textContent.trim() : null,
      sliderValue: slider ? slider.value : null,
      svgOpacity: svg ? getComputedStyle(svg).opacity : null,
    };
  });

  assert.equal(afterTabSwitch.labelText, 'Opacity: 90%', 'Tab navigation must preserve selected Opacity: 90%');
  assert.equal(afterTabSwitch.sliderValue, '0.9', 'Tab navigation must preserve slider value 0.9');
  assert.equal(afterTabSwitch.svgOpacity, '0.9', 'Tab navigation must preserve overlay opacity 0.9');

  // 15g: Switching themes preserves the selected opacity value
  await page.evaluate(() => {
    localStorage.setItem('forensight-theme', 'light');
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await new Promise((r) => setTimeout(r, 100));

  const afterThemeSwitch = await page.evaluate(() => {
    const label = document.querySelector('[data-testid="heatmap-opacity-label"]');
    const svg = document.querySelector('[data-testid="heatmap-overlay-svg"]');
    return {
      labelText: label ? label.textContent.trim() : null,
      svgOpacity: svg ? getComputedStyle(svg).opacity : null,
    };
  });

  assert.equal(afterThemeSwitch.labelText, 'Opacity: 90%', 'Theme change must preserve selected Opacity: 90%');
  assert.equal(afterThemeSwitch.svgOpacity, '0.9', 'Theme change must preserve overlay opacity 0.9');

  // Restore dark theme for screenshot captures
  await page.evaluate(() => {
    localStorage.setItem('forensight-theme', 'dark');
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await new Promise((r) => setTimeout(r, 100));

  // 15h: Browser verification screenshots at 0%, 25%, 65%, 100%
  const screenshotDir = path.join(__dirname, '..', 'visual-qa-screenshots', 'heatmap-opacity-repair');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const testOpacities = [
    { value: 0, label: '0%', file: '01-heatmap-opacity-0pct.png' },
    { value: 0.25, label: '25%', file: '02-heatmap-opacity-25pct.png' },
    { value: 0.65, label: '65%', file: '03-heatmap-opacity-65pct.png' },
    { value: 1.0, label: '100%', file: '04-heatmap-opacity-100pct.png' },
  ];

  for (const { value, label, file } of testOpacities) {
    await setSlider(value);
    await new Promise((r) => setTimeout(r, 150));

    const check = await page.evaluate((expectedVal) => {
      const svg = document.querySelector('[data-testid="heatmap-overlay-svg"]');
      const img = svg ? svg.parentElement.querySelector('img') : null;
      return {
        svgOpacity: svg ? getComputedStyle(svg).opacity : null,
        imgSrcPresent: Boolean(img && img.src),
        imgOpacity: img ? getComputedStyle(img).opacity : null,
      };
    }, value);

    assert.equal(Number(check.svgOpacity), value, `Overlay opacity for ${label} must be exactly ${value}`);
    assert.equal(check.imgOpacity, '1', 'Original evidence image opacity must remain 100% (1) across all heatmap opacity levels');
    assert.ok(check.imgSrcPresent, 'Evidence image must remain mounted and unchanged');

    // Capture screenshot of the heatmap overlay container card
    const cardEl = await page.evaluateHandle(() => {
      const svg = document.querySelector('[data-testid="heatmap-overlay-svg"]');
      return svg ? svg.closest('.card') : document.body;
    });
    if (cardEl && cardEl.asElement()) {
      await cardEl.asElement().screenshot({ path: path.join(screenshotDir, file) });
    }
  }

  // Reset opacity to the readable default for layer toggle screenshots
  await setSlider(0.65);

  // 15i: Layer toggle screenshots
  // 1. Toggle off ELA
  await page.evaluate(() => {
    const elaToggle = document.querySelector('[data-testid="heatmap-layer-ela-toggle"]');
    if (elaToggle && elaToggle.checked) elaToggle.click();
  });
  await new Promise((r) => setTimeout(r, 150));
  const cardEla = await page.evaluateHandle(() => {
    const svg = document.querySelector('[data-testid="heatmap-overlay-svg"]');
    return svg ? svg.closest('.card') : document.body;
  });
  if (cardEla && cardEla.asElement()) {
    await cardEla.asElement().screenshot({ path: path.join(screenshotDir, '05-ela-layer-toggled-off.png') });
  }
  // Restore ELA
  await page.evaluate(() => {
    const elaToggle = document.querySelector('[data-testid="heatmap-layer-ela-toggle"]');
    if (elaToggle && !elaToggle.checked) elaToggle.click();
  });
  await new Promise((r) => setTimeout(r, 100));

  // 2. Toggle off Noise
  await page.evaluate(() => {
    const noiseToggle = document.querySelector('[data-testid="heatmap-layer-noise-toggle"]');
    if (noiseToggle && noiseToggle.checked) noiseToggle.click();
  });
  await new Promise((r) => setTimeout(r, 150));
  const cardNoise = await page.evaluateHandle(() => {
    const svg = document.querySelector('[data-testid="heatmap-overlay-svg"]');
    return svg ? svg.closest('.card') : document.body;
  });
  if (cardNoise && cardNoise.asElement()) {
    await cardNoise.asElement().screenshot({ path: path.join(screenshotDir, '06-noise-layer-toggled-off.png') });
  }
  // Restore Noise
  await page.evaluate(() => {
    const noiseToggle = document.querySelector('[data-testid="heatmap-layer-noise-toggle"]');
    if (noiseToggle && !noiseToggle.checked) noiseToggle.click();
  });
  await new Promise((r) => setTimeout(r, 100));

  // 3. Toggle off Clone
  await page.evaluate(() => {
    const cloneToggle = document.querySelector('[data-testid="heatmap-layer-copy_move-toggle"]');
    if (cloneToggle && cloneToggle.checked) cloneToggle.click();
  });
  await new Promise((r) => setTimeout(r, 150));
  const cardClone = await page.evaluateHandle(() => {
    const svg = document.querySelector('[data-testid="heatmap-overlay-svg"]');
    return svg ? svg.closest('.card') : document.body;
  });
  if (cardClone && cardClone.asElement()) {
    await cardClone.asElement().screenshot({ path: path.join(screenshotDir, '07-clone-layer-toggled-off.png') });
  }
  // Restore Clone
  await page.evaluate(() => {
    const cloneToggle = document.querySelector('[data-testid="heatmap-layer-copy_move-toggle"]');
    if (cloneToggle && !cloneToggle.checked) cloneToggle.click();
  });
  await new Promise((r) => setTimeout(r, 100));

  // 15j: Clean baseline empty state verification and screenshot
  demoCloneLayer.regions = originalCloneRegions;
  demoHeatmapData.composite_regions_count = originalCompositeRegionCount;
  await page.goto(`${baseUrl}/cases/${caseData.case_identifier}/evidence/${evidenceData.id}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="heatmap-empty-state"]');

  const cleanBaselineCheck = await page.evaluate(() => {
    const emptyState = document.querySelector('[data-testid="heatmap-empty-state"]');
    const slider = document.querySelector('[data-testid="heatmap-opacity-slider"]');
    const controlsBar = document.querySelector('[data-testid="heatmap-controls-bar"]');
    return {
      hasEmptyState: Boolean(emptyState),
      emptyText: emptyState ? emptyState.textContent.trim() : null,
      hasSlider: Boolean(slider),
      hasControlsBar: Boolean(controlsBar),
    };
  });

  assert.ok(cleanBaselineCheck.hasEmptyState, 'Clean baseline evidence must display empty state element');
  assert.ok(cleanBaselineCheck.emptyText.includes('No candidate regions returned'), 'Empty state must describe the absence of candidate regions');
  assert.ok(cleanBaselineCheck.emptyText.includes('have no available output'), 'Empty state must disclose spatial layers without available output');
  assert.ok(cleanBaselineCheck.emptyText.includes('does not establish image integrity or authenticity'), 'Empty state must not imply a clean authenticity verdict');
  assert.equal(cleanBaselineCheck.hasSlider, false, 'Clean baseline evidence must NOT display non-functional opacity slider');
  assert.equal(cleanBaselineCheck.hasControlsBar, false, 'Clean baseline evidence must NOT display controls bar');

  const cleanCardEl = await page.evaluateHandle(() => {
    const emptyState = document.querySelector('[data-testid="heatmap-empty-state"]');
    return emptyState ? emptyState.closest('.card') : document.body;
  });
  if (cleanCardEl && cleanCardEl.asElement()) {
    await cleanCardEl.asElement().screenshot({ path: path.join(screenshotDir, '00-clean-baseline-empty-state.png') });
  }

  const unverifiedHashStatus = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.card')).find((candidate) => candidate.querySelector('h2')?.textContent.includes('TECHNICAL CHAIN OF CUSTODY'));
    return card?.querySelector('.badge')?.textContent.trim();
  });
  assert.equal(unverifiedHashStatus, 'NOT RE-CHECKED', 'The recorded ingest hash must not imply a current verification');
  await clickButton(page, 'On-Demand Hash Re-Verification');
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.card')).some((candidate) =>
    candidate.querySelector('h2')?.textContent.includes('TECHNICAL CHAIN OF CUSTODY')
      && candidate.querySelector('.badge')?.textContent.includes('VERIFIED INTACT')
  ));

  await page.evaluate(() => localStorage.setItem('forensight_forensic_lab_tour_seen', 'true'));
  await page.click('#tab-report');
  await page.waitForSelector('#examiner-notes');
  const noteText = 'E2E evidence-linked examiner note.';
  await page.click('#examiner-notes');
  await page.type('#examiner-notes', noteText);
  await clickButton(page, 'Save examiner note');
  await page.waitForFunction(() => document.body.innerText.includes('Saved as an evidence-linked case note.'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.click('#tab-report');
  await page.waitForSelector('#examiner-notes');
  const reloadedNote = await page.$eval('#examiner-notes', (textarea) => textarea.value);
  assert.equal(reloadedNote, noteText, 'Saved evidence-linked examiner notes must survive navigation and reload');

  console.log('PASS: login → case intake → evidence upload → analysis job → report generation → prefetch routes → system health → investigation graph → instructor demo journey → proxy & auth → stability & navigation → workbench dark mode → heatmap opacity functional repair');
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
