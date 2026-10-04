import { useState, useEffect } from 'react';
import { fetchApi } from '../../api';

interface DatasetItem {
  dataset_id: string;
  name: string;
  type: string;
  path: string;
  manifest_exists: boolean;
  image_count?: number;
}

interface EngineMetric {
  engine_id: string;
  engine_version?: string;
  total_images_evaluated?: number;
  total_evaluations?: number;
  applied_count?: number;
  applicable_count?: number;
  not_applicable_count: number;
  failed_count: number;
  mean_runtime_ms: number;
  p95_runtime_ms: number;
  mean_spatial_iou?: number;
  localization_metrics?: { mean_iou?: number };
}

interface BenchmarkReportSummary {
  run_id?: string;
  summary_id?: string;
  status?: string;
  dataset_id: string;
  dataset_version: string;
  timestamp_utc?: string;
  created_at?: string;
  total_evaluations: number;
  total_images?: number;
  completed_count?: number;
  not_applicable_count?: number;
  failed_count?: number;
  determinism_verified: boolean;
  engine_metrics: Record<string, EngineMetric>;
  environment_snapshot?: {
    python_version: string;
    numpy_version: string;
    scipy_version: string;
    os_info: string;
    git_commit: string;
    captured_at: string;
  };
  authentic_evaluations?: {
    total_images: number;
    by_engine: Record<string, any>;
  };
  manipulated_evaluations?: {
    total_images: number;
    by_engine: Record<string, any>;
  };
  manipulation_type_breakdown?: Record<string, { count: number; applied: number }>;
  false_positive_characterization?: {
    natural_textures: number;
    sharp_edges: number;
    smooth_gradients: number;
    engine_anomalies_on_authentic: Record<string, number>;
  };
  reproducibility_hash?: string;
}

export default function BenchmarkDashboard() {
  const [activeTab, setActiveTab] = useState<'controlled' | 'external'>('external');
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [running, setRunning] = useState(false);
  const [prnuRunning, setPrnuRunning] = useState(false);

  // Controlled harness state
  const [selectedDataset, setSelectedDataset] = useState<string>('datasets/controlled/v1');
  const [selectedEngines, setSelectedEngines] = useState<string>('all');
  const [verifyDeterminism, setVerifyDeterminism] = useState<boolean>(true);
  const [summary, setSummary] = useState<BenchmarkReportSummary | null>(null);
  const [prnuResults, setPrnuResults] = useState<any | null>(null);

  // External harness state (Step 10)
  const [externalDatasetDir, setExternalDatasetDir] = useState<string>('datasets/external/casia2');
  const [externalEngines, setExternalEngines] = useState<string>('all');
  const [externalSummary, setExternalSummary] = useState<BenchmarkReportSummary | null>(null);
  const [registrationReport, setRegistrationReport] = useState<any | null>(null);
  const [verificationReport, setVerificationReport] = useState<any | null>(null);
  const [reproduceReport, setReproduceReport] = useState<any | null>(null);

  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const loadDatasets = async () => {
    setLoadingDatasets(true);
    try {
      const res = await fetchApi('/benchmark/datasets');
      if (res.ok) {
        const data = await res.json();
        setDatasets(data);
      }
    } catch (err: any) {
      console.error('Failed to load benchmark datasets:', err);
    } finally {
      setLoadingDatasets(false);
    }
  };

  const loadLatestReports = async () => {
    try {
      const resControlled = await fetchApi('/benchmark/reports/latest');
      if (resControlled.ok) {
        const data = await resControlled.json();
        setSummary(data);
      }
    } catch (err) {
      // ignore
    }

    try {
      const resExternal = await fetchApi('/benchmark/reports/external/latest');
      if (resExternal.ok) {
        const data = await resExternal.json();
        setExternalSummary(data);
      }
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    loadDatasets();
    loadLatestReports();
  }, []);

  const handleRunControlledBenchmark = async () => {
    setRunning(true);
    setStatusMessage('Executing controlled laboratory benchmark suite...');
    setErrorMessage('');
    try {
      const res = await fetchApi('/benchmark/run', {
        method: 'POST',
        body: JSON.stringify({
          dataset_dir: selectedDataset,
          engines: selectedEngines === 'all' ? ['all'] : selectedEngines.split(',').map(s => s.trim()),
          verify_determinism: verifyDeterminism,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Benchmark execution failed.');
      }
      setSummary(data);
      setStatusMessage('Controlled benchmark evaluation completed successfully.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Execution error');
      setStatusMessage('');
    } finally {
      setRunning(false);
    }
  };

  const handleRegisterDataset = async () => {
    setStatusMessage('Validating and cryptographically registering dataset...');
    setErrorMessage('');
    try {
      const res = await fetchApi('/benchmark/register-dataset', {
        method: 'POST',
        body: JSON.stringify({ dataset_dir: externalDatasetDir, manifest_filename: 'manifest.json' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Registration failed.');
      setRegistrationReport(data);
      setStatusMessage(`Dataset registered. Status: ${data.status}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration error');
    }
  };

  const handleVerifyDataset = async () => {
    setStatusMessage('Verifying dataset cryptographic integrity against snapshot...');
    setErrorMessage('');
    try {
      const res = await fetchApi('/benchmark/verify-dataset', {
        method: 'POST',
        body: JSON.stringify({ dataset_dir: externalDatasetDir, snapshot_filename: 'dataset_snapshot.json' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Verification failed.');
      setVerificationReport(data);
      setStatusMessage(`Dataset integrity: ${data.status} (Valid: ${data.is_valid})`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification error');
    }
  };

  const handleRunExternalBenchmark = async () => {
    setRunning(true);
    setStatusMessage('Executing external dataset benchmark with scientific separation...');
    setErrorMessage('');
    try {
      const res = await fetchApi('/benchmark/run-external', {
        method: 'POST',
        body: JSON.stringify({
          dataset_dir: externalDatasetDir,
          engines: externalEngines === 'all' ? ['all'] : externalEngines.split(',').map(s => s.trim()),
          verify_determinism: true,
          verify_hashes: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'External benchmark failed.');
      setExternalSummary(data);
      setStatusMessage(`External evaluation completed. Status: ${data.status}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'External benchmark execution error');
    } finally {
      setRunning(false);
    }
  };

  const handleReproduce = async () => {
    setStatusMessage('Checking bit-for-bit reproducibility against latest run...');
    setErrorMessage('');
    try {
      const res = await fetchApi('/benchmark/reproduce', {
        method: 'POST',
        body: JSON.stringify({ run_dir: 'datasets/benchmark/external' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Reproduction failed.');
      setReproduceReport(data);
      setStatusMessage(`Reproduction: ${data.status} (Match Rate: ${(data.match_rate * 100).toFixed(1)}%)`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Reproduction error');
    }
  };

  const handleRunPRNU = async () => {
    setPrnuRunning(true);
    setErrorMessage('');
    setStatusMessage('Running PRNU empirical evaluation protocol...');
    try {
      const res = await fetchApi('/benchmark/prnu', {
        method: 'POST',
        body: JSON.stringify({ seed: 42 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'PRNU evaluation failed.');
      setPrnuResults(data);
      setStatusMessage('PRNU benchmark protocol completed.');
    } catch (err: any) {
      setErrorMessage(err.message || 'PRNU Protocol error');
      setStatusMessage('');
    } finally {
      setPrnuRunning(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1280px', margin: '0 auto', color: '#0f172a', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header Banner */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '1.75rem',
        marginBottom: '1.5rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
              <span style={{
                background: '#eff6ff',
                color: '#2563eb',
                fontWeight: 700,
                fontSize: '0.75rem',
                padding: '0.2rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid #bfdbfe'
              }}>
                STEP 10 &bull; BENCHMARK HARDENING v1.0.0
              </span>
              <span style={{
                background: '#f1f5f9',
                color: '#475569',
                fontWeight: 600,
                fontSize: '0.75rem',
                padding: '0.2rem 0.6rem',
                borderRadius: '6px',
                border: '1px solid #e2e8f0'
              }}>
                16 PRODUCTION ENGINES
              </span>
            </div>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 800, margin: '0 0 0.4rem 0', color: '#0f172a' }}>
              Forensic Evaluation & Benchmark Infrastructure
            </h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', maxWidth: '820px', lineHeight: 1.5 }}>
              Scientifically hardened validation infrastructure evaluating forensic engines against controlled fixtures and
              external real-world datasets (CASIA v2.0, Columbia, NIST OpenMFC) under strict non-ranking empirical standards.
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '0.3rem', borderRadius: '8px', gap: '0.3rem' }}>
            <button
              onClick={() => setActiveTab('external')}
              style={{
                background: activeTab === 'external' ? '#ffffff' : 'transparent',
                color: activeTab === 'external' ? '#1e3a8a' : '#64748b',
                fontWeight: 700,
                fontSize: '0.85rem',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: activeTab === 'external' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              Real External Datasets
            </button>
            <button
              onClick={() => setActiveTab('controlled')}
              style={{
                background: activeTab === 'controlled' ? '#ffffff' : 'transparent',
                color: activeTab === 'controlled' ? '#1e3a8a' : '#64748b',
                fontWeight: 700,
                fontSize: '0.85rem',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: activeTab === 'controlled' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
              }}
            >
              Controlled Laboratory Suite
            </button>
          </div>
        </div>

        {/* Scientific Policy Warning */}
        <div style={{
          marginTop: '1.25rem',
          padding: '0.85rem 1rem',
          background: '#eff6ff',
          borderLeft: '4px solid #2563eb',
          borderRadius: '4px',
          fontSize: '0.8rem',
          color: '#1e3a8a',
          lineHeight: 1.45
        }}>
          <strong>Scientific Principle: </strong>
          Absence of physical image files reports <code>DATASET NOT AVAILABLE</code> rather than fabricating synthetic metrics.
          Authentic and manipulated groups are evaluated separately.
          <code>NOT_APPLICABLE</code> is strictly decoupled from benign attribution. No composite ranking score is generated.
        </div>
      </div>

      {statusMessage && (
        <div style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          color: '#166534',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          marginBottom: '1rem',
          fontSize: '0.85rem',
          fontWeight: 600
        }}>
          {statusMessage}
        </div>
      )}

      {errorMessage && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#991b1b',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          marginBottom: '1rem',
          fontSize: '0.85rem',
          fontWeight: 600
        }}>
          {errorMessage}
        </div>
      )}

      {/* EXTERNAL DATASET BENCHMARK MODE (STEP 10) */}
      {activeTab === 'external' && (
        <div>
          {/* Controls Panel */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            <h3 style={{ margin: '0 0 0.85rem 0', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
              External Dataset Benchmark Controls
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                  External Dataset Directory
                </label>
                <input
                  type="text"
                  value={externalDatasetDir}
                  onChange={(e) => setExternalDatasetDir(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    background: '#ffffff'
                  }}
                  placeholder="e.g. datasets/external/casia2"
                />
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Supported adapters: CASIA v2.0, Columbia Uncompressed, NIST OpenMFC, or generic directory.
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                  Engine Selection
                </label>
                <select
                  value={externalEngines}
                  onChange={(e) => setExternalEngines(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="all">All 16 Engines (Full Forensic Suite)</option>
                  <option value="CLONE-BLOCK,CLONE-KEYPOINT">Copy-Move (Block + Keypoint)</option>
                  <option value="RESAMPLING,ADVANCED-NOISE">Resampling + Advanced Noise</option>
                  <option value="PRNU,CAMERA-ID">PRNU + Camera Identification</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={handleRegisterDataset}
                style={{
                  background: '#f8fafc',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  padding: '0.55rem 1rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                1. Register & Snapshot Dataset
              </button>
              <button
                onClick={handleVerifyDataset}
                style={{
                  background: '#f8fafc',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  padding: '0.55rem 1rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                2. Verify Snapshot Integrity
              </button>
              <button
                onClick={handleRunExternalBenchmark}
                disabled={running}
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.55rem 1.25rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: running ? 'wait' : 'pointer'
                }}
              >
                {running ? 'Executing External Suite...' : '3. Run External Benchmark'}
              </button>
              <button
                onClick={handleReproduce}
                style={{
                  background: '#f8fafc',
                  color: '#1e40af',
                  border: '1px solid #bfdbfe',
                  padding: '0.55rem 1rem',
                  borderRadius: '6px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                4. Test Bit-for-Bit Reproduction
              </button>
            </div>
          </div>

          {/* Registration / Verification Status Banners */}
          {registrationReport && (
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
              fontSize: '0.85rem'
            }}>
              <strong style={{ color: '#1e3a8a' }}>Registration Report: </strong>
              Status: <span style={{ fontWeight: 700 }}>{registrationReport.status}</span> &bull;
              Discovered: {registrationReport.total_images_discovered} images &bull;
              Masks Validated: {registrationReport.total_masks_validated} &bull;
              Duplicates: {registrationReport.duplicate_hash_count}
              {registrationReport.snapshot_path && (
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.3rem' }}>
                  Snapshot: <code>{registrationReport.snapshot_path}</code>
                </div>
              )}
            </div>
          )}

          {verificationReport && (
            <div style={{
              background: verificationReport.is_valid ? '#f0fdf4' : '#fef2f2',
              border: verificationReport.is_valid ? '1px solid #bbf7d0' : '1px solid #fecaca',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              color: verificationReport.is_valid ? '#166534' : '#991b1b'
            }}>
              <strong>Snapshot Verification: </strong>
              {verificationReport.is_valid ? 'All files match cryptographic snapshot hashes exactly.' : 'Integrity discrepancies detected.'}
            </div>
          )}

          {reproduceReport && (
            <div style={{
              background: reproduceReport.reproducible ? '#f0fdf4' : '#fffbeb',
              border: reproduceReport.reproducible ? '1px solid #bbf7d0' : '1px solid #fde68a',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
              fontSize: '0.85rem',
              color: reproduceReport.reproducible ? '#166534' : '#92400e'
            }}>
              <strong>Reproduction Status: {reproduceReport.status}</strong> &bull;
              Exact Deterministic Match: {reproduceReport.reproducible ? 'YES (100%)' : 'NO'} &bull;
              Match Rate: {(reproduceReport.match_rate * 100).toFixed(1)}%
            </div>
          )}

          {/* External Summary Display */}
          {externalSummary && (
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                    Scientific External Evaluation Results
                  </h2>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Dataset: <strong>{externalSummary.dataset_id}</strong> &bull;
                    Status: <strong style={{ color: externalSummary.status === 'COMPLETED' ? '#15803d' : '#b45309' }}>{externalSummary.status}</strong> &bull;
                    Hash: <code>{externalSummary.reproducibility_hash?.slice(0, 16)}...</code>
                  </div>
                </div>

                <span style={{
                  background: externalSummary.determinism_verified ? '#dcfce7' : '#fee2e2',
                  color: externalSummary.determinism_verified ? '#166534' : '#991b1b',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700
                }}>
                  {externalSummary.determinism_verified ? 'Determinism: 100% Match' : 'Discrepancy'}
                </span>
              </div>

              {/* Top KPI Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem'
              }}>
                <div style={{ padding: '0.85rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Total Images</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', marginTop: '0.2rem' }}>
                    {externalSummary.total_images ?? 0}
                  </div>
                </div>
                <div style={{ padding: '0.85rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 600 }}>Authentic Images</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803d', marginTop: '0.2rem' }}>
                    {externalSummary.authentic_evaluations?.total_images ?? 0}
                  </div>
                </div>
                <div style={{ padding: '0.85rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 600 }}>Manipulated Images</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e3a8a', marginTop: '0.2rem' }}>
                    {externalSummary.manipulated_evaluations?.total_images ?? 0}
                  </div>
                </div>
                <div style={{ padding: '0.85rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>Total Evaluations</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#334155', marginTop: '0.2rem' }}>
                    {externalSummary.total_evaluations}
                  </div>
                </div>
              </div>

              {/* False Positive Characterization Box */}
              {externalSummary.false_positive_characterization && (
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1rem',
                  marginBottom: '1.5rem'
                }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#334155' }}>
                    Authentic-Image False Positive Sensitivity Characterization
                  </h4>
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
                    <div>Natural Textures (foliage/sand): <strong>{externalSummary.false_positive_characterization.natural_textures}</strong> triggers</div>
                    <div>High-Contrast Sharp Edges: <strong>{externalSummary.false_positive_characterization.sharp_edges}</strong> triggers</div>
                    <div>Smooth Gradients: <strong>{externalSummary.false_positive_characterization.smooth_gradients}</strong> triggers</div>
                  </div>
                </div>
              )}

              {/* Environment Snapshot Box */}
              {externalSummary.environment_snapshot && (
                <div style={{
                  background: '#f1f5f9',
                  borderRadius: '8px',
                  padding: '0.85rem',
                  marginBottom: '1.5rem',
                  fontSize: '0.75rem',
                  color: '#475569'
                }}>
                  <strong>Runtime Environment Snapshot: </strong>
                  Platform: <code>{externalSummary.environment_snapshot.os_info}</code> &bull;
                  Python: <code>{externalSummary.environment_snapshot.python_version}</code> &bull;
                  NumPy: <code>{externalSummary.environment_snapshot.numpy_version}</code> &bull;
                  Commit: <code>{externalSummary.environment_snapshot.git_commit.slice(0, 8)}</code>
                </div>
              )}

              {/* Engine Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Engine ID</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Evaluations</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Applied</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Inapplicable</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Failed</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Mean Runtime</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Spatial IoU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(externalSummary.engine_metrics || {}).map(([engId, m]) => (
                      <tr key={engId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600, color: '#0f172a' }}>{engId}</td>
                        <td style={{ padding: '0.65rem 0.75rem' }}>{m.total_images_evaluated ?? m.total_evaluations ?? 0}</td>
                        <td style={{ padding: '0.65rem 0.75rem', color: '#15803d', fontWeight: 600 }}>{m.applied_count ?? m.applicable_count ?? 0}</td>
                        <td style={{ padding: '0.65rem 0.75rem', color: '#64748b' }}>{m.not_applicable_count}</td>
                        <td style={{ padding: '0.65rem 0.75rem', color: m.failed_count > 0 ? '#b91c1c' : '#64748b' }}>{m.failed_count}</td>
                        <td style={{ padding: '0.65rem 0.75rem' }}>{m.mean_runtime_ms.toFixed(1)} ms</td>
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          {m.localization_metrics?.mean_iou !== undefined
                            ? m.localization_metrics.mean_iou.toFixed(3)
                            : <span style={{ color: '#94a3b8' }}>NOT_EVALUATED</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONTROLLED BENCHMARK MODE (STEP 9 BASELINE) */}
      {activeTab === 'controlled' && (
        <div>
          {/* Configuration Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '1.25rem',
            marginBottom: '1.5rem'
          }}>
            {/* Dataset Selection */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '1.25rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                Controlled Dataset Selection
              </h3>
              {loadingDatasets ? (
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Discovering manifests...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {datasets.map((d) => (
                    <label
                      key={d.dataset_id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.6rem',
                        padding: '0.6rem 0.75rem',
                        borderRadius: '6px',
                        border: selectedDataset === d.path ? '1px solid #2563eb' : '1px solid #f1f5f9',
                        background: selectedDataset === d.path ? '#eff6ff' : '#f8fafc',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      <input
                        type="radio"
                        name="dataset"
                        value={d.path}
                        checked={selectedDataset === d.path}
                        onChange={(e) => setSelectedDataset(e.target.value)}
                        style={{ marginTop: '0.15rem' }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{d.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Path: <code>{d.path}</code> &bull; Type: {d.type}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Execution Settings */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '1.25rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                Harness Configuration
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                    Target Forensic Engines
                  </label>
                  <select
                    value={selectedEngines}
                    onChange={(e) => setSelectedEngines(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      fontSize: '0.85rem'
                    }}
                  >
                    <option value="all">All 16 Engines (Full Evaluation Suite)</option>
                    <option value="RESAMPLING,ADVANCED-NOISE">Resampling + Noise Modalities</option>
                    <option value="CLONE-BLOCK,CLONE-KEYPOINT">Copy-Move Engines (Block + Keypoint)</option>
                    <option value="PRNU,CAMERA-ID">PRNU + Camera ID Modalities</option>
                  </select>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={verifyDeterminism}
                    onChange={(e) => setVerifyDeterminism(e.target.checked)}
                  />
                  <span style={{ fontWeight: 600, color: '#334155' }}>
                    Verify 3-Run Determinism (SHA-256 Parity)
                  </span>
                </label>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={handleRunControlledBenchmark}
                    disabled={running}
                    style={{
                      background: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.55rem 1.25rem',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: running ? 'wait' : 'pointer'
                    }}
                  >
                    {running ? 'Running...' : 'Execute Controlled Benchmark'}
                  </button>
                  <button
                    onClick={handleRunPRNU}
                    disabled={prnuRunning}
                    style={{
                      background: '#f8fafc',
                      color: '#334155',
                      border: '1px solid #cbd5e1',
                      padding: '0.55rem 1rem',
                      borderRadius: '6px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: prnuRunning ? 'wait' : 'pointer'
                    }}
                  >
                    {prnuRunning ? 'Analyzing...' : 'Run PRNU Protocol'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* PRNU Results Card */}
          {prnuResults && (
            <div style={{
              background: '#ffffff',
              border: '1px solid #bfdbfe',
              borderRadius: '10px',
              padding: '1.25rem',
              marginBottom: '1.5rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#1e40af' }}>
                  Camera PRNU Multi-Sensor Attribution Results
                </h3>
                <span style={{
                  background: '#eff6ff',
                  color: '#2563eb',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '6px'
                }}>
                  4-Reference MLE Protocol
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Same-Camera Mean PCE</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#15803d', marginTop: '0.2rem' }}>
                    {prnuResults.same_camera_distribution?.mean_pce ?? 'N/A'}
                  </div>
                </div>
                <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Different-Camera Mean PCE</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#b91c1c', marginTop: '0.2rem' }}>
                    {prnuResults.different_camera_distribution?.mean_pce ?? 'N/A'}
                  </div>
                </div>
                <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Separation Gap</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1e293b', marginTop: '0.2rem' }}>
                    {prnuResults.separation_metrics?.pce_separation_gap ?? 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Controlled Benchmark Summary */}
          {summary && (
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '1.25rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                    Controlled Evaluation Summary
                  </h2>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Dataset: <strong>{summary.dataset_id}</strong> &bull; Run ID: <code>{summary.run_id || summary.summary_id}</code>
                  </div>
                </div>
                <span style={{
                  background: summary.determinism_verified ? '#dcfce7' : '#fee2e2',
                  color: summary.determinism_verified ? '#166534' : '#991b1b',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 700
                }}>
                  {summary.determinism_verified ? 'Determinism: PASS (3/3)' : 'Discrepancy'}
                </span>
              </div>

              {/* Engine Breakdown Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Engine ID</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Evaluations</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Applicable</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Not Applicable</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Failed</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Mean Runtime</th>
                      <th style={{ padding: '0.65rem 0.75rem', fontWeight: 700, color: '#334155' }}>Spatial IoU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(summary.engine_metrics || {}).map(([engId, m]) => (
                      <tr key={engId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600, color: '#0f172a' }}>{engId}</td>
                        <td style={{ padding: '0.65rem 0.75rem' }}>{m.total_evaluations ?? m.total_images_evaluated ?? 0}</td>
                        <td style={{ padding: '0.65rem 0.75rem', color: '#15803d', fontWeight: 600 }}>{m.applicable_count ?? m.applied_count ?? 0}</td>
                        <td style={{ padding: '0.65rem 0.75rem', color: '#64748b' }}>{m.not_applicable_count}</td>
                        <td style={{ padding: '0.65rem 0.75rem', color: m.failed_count > 0 ? '#b91c1c' : '#64748b' }}>
                          {m.failed_count}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem' }}>{m.mean_runtime_ms.toFixed(1)} ms</td>
                        <td style={{ padding: '0.65rem 0.75rem' }}>
                          {m.mean_spatial_iou !== undefined && m.mean_spatial_iou !== null
                            ? m.mean_spatial_iou.toFixed(3)
                            : (m.localization_metrics?.mean_iou !== undefined ? m.localization_metrics.mean_iou.toFixed(3) : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
