import { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Database,
  Cpu,
  Sparkles,
  RefreshCw,
  Play,
  RotateCcw,
  FileCheck2,
  Gauge,
  Sliders,
} from 'lucide-react';
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
  const [reproducing, setReproducing] = useState(false);

  // Controlled harness state
  const [selectedDataset, setSelectedDataset] = useState<string>('datasets/controlled/v1');
  const [selectedEngines, setSelectedEngines] = useState<string>('all');
  const [verifyDeterminism, setVerifyDeterminism] = useState<boolean>(true);
  const [summary, setSummary] = useState<BenchmarkReportSummary | null>(null);
  const [prnuResults, setPrnuResults] = useState<any | null>(null);
  const [stressRunning, setStressRunning] = useState(false);
  const [stressReport, setStressReport] = useState<any | null>(null);
  const [stressEngines, setStressEngines] = useState('METADATA,ELA,NOISE,JPEG_DCT,COPY_MOVE,RESAMPLING');
  const [stressImageLimit, setStressImageLimit] = useState(6);

  // External harness state
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
        if (data && data.available !== false) {
          setSummary(data);
        }
      }
    } catch (err) {
      // ignore
    }

    try {
      const resExternal = await fetchApi('/benchmark/reports/external/latest');
      if (resExternal.ok) {
        const data = await resExternal.json();
        if (data && data.available !== false) {
          setExternalSummary(data);
        }
      }
    } catch (err) {
      // ignore
    }

    try {
      const resStress = await fetchApi('/benchmark/transformation-stress/latest');
      if (resStress.ok) {
        const data = await resStress.json();
        if (data && data.available !== false) {
          setStressReport(data);
        }
      }
    } catch (err) {
      // No stress report exists until first execution
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
      const res = await fetchApi(
        '/benchmark/run',
        {
          method: 'POST',
          body: JSON.stringify({
            dataset_dir: selectedDataset,
            engines: selectedEngines === 'all' ? ['all'] : selectedEngines.split(',').map((s) => s.trim()),
            verify_determinism: verifyDeterminism,
          }),
        },
        300000
      );
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
    setStatusMessage('Validating and cryptographically registering external dataset...');
    setErrorMessage('');
    try {
      const res = await fetchApi(
        '/benchmark/register-dataset',
        {
          method: 'POST',
          body: JSON.stringify({ dataset_dir: externalDatasetDir, manifest_filename: 'manifest.json' }),
        },
        60000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Registration failed.');
      setRegistrationReport(data);
      if (data.is_valid === false) {
        setStatusMessage(`Registration check completed: Dataset directory not found or invalid.`);
      } else {
        setStatusMessage(`Dataset registered successfully. Status: ${data.status}`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration error');
      setStatusMessage('');
    }
  };

  const handleVerifyDataset = async () => {
    setStatusMessage('Verifying dataset cryptographic integrity against snapshot...');
    setErrorMessage('');
    try {
      const res = await fetchApi(
        '/benchmark/verify-dataset',
        {
          method: 'POST',
          body: JSON.stringify({ dataset_dir: externalDatasetDir, snapshot_filename: 'dataset_snapshot.json' }),
        },
        60000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Verification failed.');
      setVerificationReport(data);
      setStatusMessage(`Dataset integrity check: ${data.status} (Valid: ${data.is_valid})`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification error');
      setStatusMessage('');
    }
  };

  const handleRunExternalBenchmark = async () => {
    setRunning(true);
    setStatusMessage('Executing external dataset benchmark with mathematical cohort separation...');
    setErrorMessage('');
    try {
      const res = await fetchApi(
        '/benchmark/run-external',
        {
          method: 'POST',
          body: JSON.stringify({
            dataset_dir: externalDatasetDir,
            engines: externalEngines === 'all' ? ['all'] : externalEngines.split(',').map((s) => s.trim()),
            verify_determinism: true,
            verify_hashes: true,
          }),
        },
        300000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'External benchmark failed.');
      setExternalSummary(data);
      setStatusMessage(`External evaluation completed. Status: ${data.status}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'External benchmark execution error');
      setStatusMessage('');
    } finally {
      setRunning(false);
    }
  };

  const handleReproduce = async () => {
    setReproducing(true);
    setStatusMessage('Checking bit-for-bit reproducibility against latest run...');
    setErrorMessage('');
    try {
      const res = await fetchApi(
        '/benchmark/reproduce',
        {
          method: 'POST',
          body: JSON.stringify({ run_dir: 'datasets/benchmark/external' }),
        },
        120000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Reproduction check failed.');
      setReproduceReport(data);
      if (data.status === 'FAILED' || !data.reproducible) {
        setStatusMessage(
          data.reason ? `Reproduction Notice: ${data.reason}` : `Reproduction status: ${data.status}`
        );
      } else {
        const rate = typeof data.match_rate === 'number' ? (data.match_rate * 100).toFixed(1) : '100.0';
        setStatusMessage(`Reproduction: ${data.status} (Match Rate: ${rate}%)`);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Reproduction verification error');
      setStatusMessage('');
    } finally {
      setReproducing(false);
    }
  };

  const handleRunPRNU = async () => {
    setPrnuRunning(true);
    setErrorMessage('');
    setStatusMessage('Running PRNU empirical evaluation protocol...');
    try {
      const res = await fetchApi(
        '/benchmark/prnu',
        {
          method: 'POST',
          body: JSON.stringify({ seed: 42 }),
        },
        300000
      );
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

  const handleRunTransformationStress = async () => {
    setStressRunning(true);
    setErrorMessage('');
    setStatusMessage('Running benign delivery-transformation profiles against selected dataset…');
    try {
      const res = await fetchApi(
        '/benchmark/transformation-stress',
        {
          method: 'POST',
          body: JSON.stringify({
            dataset_dir: selectedDataset,
            engines: stressEngines.split(',').map((engine) => engine.trim()).filter(Boolean),
            limit: stressImageLimit,
          }),
        },
        300000
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Transformation stress run failed.');
      setStressReport(data);
      setStatusMessage('Transformation robustness report generated successfully.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Transformation stress run failed.');
      setStatusMessage('');
    } finally {
      setStressRunning(false);
    }
  };

  return (
    <div
      className="benchmark-page"
      style={{
        padding: 'var(--space-4)',
        maxWidth: '1360px',
        margin: '0 auto',
        fontFamily: 'var(--font-sans)',
        color: 'var(--text-main)',
      }}
    >
      {/* Header Banner */}
      <div
        className="benchmark-header"
        style={{
          background: 'var(--surface-base)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem 1.75rem',
          marginBottom: '1.5rem',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  background: 'var(--primary-light)',
                  color: 'var(--accent-text)',
                  fontWeight: 700,
                  fontSize: 'var(--text-2xs)',
                  padding: '0.2rem 0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--accent-border)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                STANDARDIZED BENCHMARK HARNESS
              </span>
              <span
                style={{
                  background: 'var(--surface-sunken)',
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: 'var(--text-2xs)',
                  padding: '0.2rem 0.65rem',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  letterSpacing: '0.04em',
                }}
              >
                16 EVALUATION ENGINES
              </span>
            </div>
            <h1
              style={{
                fontSize: 'var(--text-2xl)',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                margin: '0 0 0.4rem 0',
                color: 'var(--text-main)',
                letterSpacing: '-0.02em',
              }}
            >
              Forensic Evaluation &amp; Benchmark Infrastructure
            </h1>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--text-sm)', maxWidth: '820px', lineHeight: 1.55 }}>
              Reproducible, non-ranking evaluation for image-forensics engines. External dataset workflows are supported, but external image collections must be obtained and registered separately.
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div
            className="benchmark-mode-switcher"
            style={{
              display: 'flex',
              background: 'var(--surface-sunken)',
              padding: '4px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              gap: '4px',
            }}
          >
            <button
              type="button"
              aria-pressed={activeTab === 'external'}
              onClick={() => setActiveTab('external')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: activeTab === 'external' ? 'var(--surface-base)' : 'transparent',
                color: activeTab === 'external' ? 'var(--accent-text)' : 'var(--text-muted)',
                fontWeight: activeTab === 'external' ? 700 : 500,
                fontSize: 'var(--text-sm)',
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-sm)',
                border: activeTab === 'external' ? '1px solid var(--border-default)' : '1px solid transparent',
                cursor: 'pointer',
                boxShadow: activeTab === 'external' ? 'var(--shadow-xs)' : 'none',
                transition: 'all var(--duration-fast) var(--ease-snappy)',
              }}
            >
              <Database size={15} />
              <span>Real External Datasets</span>
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'controlled'}
              onClick={() => setActiveTab('controlled')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: activeTab === 'controlled' ? 'var(--surface-base)' : 'transparent',
                color: activeTab === 'controlled' ? 'var(--accent-text)' : 'var(--text-muted)',
                fontWeight: activeTab === 'controlled' ? 700 : 500,
                fontSize: 'var(--text-sm)',
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-sm)',
                border: activeTab === 'controlled' ? '1px solid var(--border-default)' : '1px solid transparent',
                cursor: 'pointer',
                boxShadow: activeTab === 'controlled' ? 'var(--shadow-xs)' : 'none',
                transition: 'all var(--duration-fast) var(--ease-snappy)',
              }}
            >
              <Cpu size={15} />
              <span>Controlled Laboratory Suite</span>
            </button>
          </div>
        </div>

        {/* Scientific Safeguards Callout */}
        <div
          className="benchmark-policy"
          style={{
            marginTop: '1.25rem',
            padding: '1rem 1.25rem',
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-default)',
            borderLeft: '4px solid var(--accent-color)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-body)',
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 700,
              color: 'var(--accent-text)',
              marginBottom: '0.45rem',
              fontSize: 'var(--text-sm)',
              letterSpacing: '0.02em',
            }}
          >
            <ShieldAlert size={16} />
            <span>SCIENTIFIC EVALUATION SAFEGUARDS &amp; INTEGRITY POLICY</span>
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            <li>
              Missing image files are reported as{' '}
              <code
                style={{
                  background: 'var(--surface-sunken)',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  color: 'var(--status-warning)',
                  border: '1px solid var(--border-subtle)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                }}
              >
                DATASET NOT AVAILABLE
              </code>
              ; zero synthetic scores or fabricated metrics are generated.
            </li>
            <li>Authentic and manipulated cohorts are evaluated and reported in separate, mathematically isolated metrics streams.</li>
            <li>
              <code
                style={{
                  background: 'var(--surface-sunken)',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-subtle)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                }}
              >
                NOT_APPLICABLE
              </code>{' '}
              designates out-of-scope physical domain conditions, not benign attribution; engine results are never collapsed into a subjective composite authenticity verdict.
            </li>
          </ul>
        </div>
      </div>

      {/* Dynamic Status / Notification Feedback */}
      {statusMessage && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            background: 'var(--status-nominal-bg)',
            border: '1px solid var(--status-nominal-border)',
            color: 'var(--status-nominal)',
            padding: '0.75rem 1.15rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.25rem',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={18} />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.65rem',
            background: 'var(--status-anomalous-bg)',
            border: '1px solid var(--status-anomalous-border)',
            color: 'var(--status-anomalous)',
            padding: '0.75rem 1.15rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.25rem',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={18} />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage('')}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--status-anomalous)',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: 'var(--text-xs)',
              textDecoration: 'underline',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* EXTERNAL DATASET BENCHMARK MODE */}
      {activeTab === 'external' && (
        <div>
          {/* Controls Panel */}
          <div
            className="benchmark-panel"
            style={{
              background: 'var(--surface-base)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
              marginBottom: '1.5rem',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Sliders size={18} style={{ color: 'var(--accent-text)' }} />
              <h3 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-display)' }}>
                External Dataset Benchmark Controls
              </h3>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: '0.4rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                  }}
                >
                  External Dataset Directory
                </label>
                <input
                  type="text"
                  value={externalDatasetDir}
                  onChange={(e) => setExternalDatasetDir(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    fontSize: 'var(--text-sm)',
                    background: 'var(--surface-raised)',
                    color: 'var(--text-main)',
                    fontFamily: 'var(--font-mono)',
                    boxSizing: 'border-box',
                  }}
                  placeholder="e.g. datasets/external/casia2"
                />
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.4 }}>
                  Supported adapters: CASIA v2.0, Columbia Uncompressed, NIST OpenMFC, or generic directory. Dataset files are not included; supply a licensed local copy.
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    marginBottom: '0.4rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                  }}
                >
                  Engine Selection
                </label>
                <select
                  value={externalEngines}
                  onChange={(e) => setExternalEngines(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-default)',
                    background: 'var(--surface-raised)',
                    color: 'var(--text-main)',
                    fontSize: 'var(--text-sm)',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="all">All 16 Engines (Full Forensic Suite)</option>
                  <option value="CLONE-BLOCK,CLONE-KEYPOINT">Copy-Move (Block + Keypoint)</option>
                  <option value="RESAMPLING,ADVANCED-NOISE">Resampling + Advanced Noise</option>
                  <option value="PRNU,CAMERA-ID">PRNU + Camera Identification</option>
                </select>
              </div>
            </div>

            {/* Action Buttons Row */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn"
                onClick={handleRegisterDataset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: 'var(--surface-raised)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-default)',
                  padding: '0.6rem 1.15rem',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <Database size={15} />
                <span>1. Register &amp; Snapshot</span>
              </button>

              <button
                type="button"
                className="btn"
                onClick={handleVerifyDataset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: 'var(--surface-raised)',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-default)',
                  padding: '0.6rem 1.15rem',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <FileCheck2 size={15} />
                <span>2. Verify Snapshot</span>
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleRunExternalBenchmark}
                disabled={running}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: 'var(--primary-gradient)',
                  color: '#ffffff',
                  border: '1px solid var(--primary-border)',
                  padding: '0.6rem 1.35rem',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 700,
                  fontSize: 'var(--text-sm)',
                  cursor: running ? 'wait' : 'pointer',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <Play size={15} />
                <span>{running ? 'Executing Suite...' : '3. Run External Benchmark'}</span>
              </button>

              <button
                type="button"
                className="btn"
                onClick={handleReproduce}
                disabled={reproducing}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: 'var(--surface-raised)',
                  color: 'var(--accent-text)',
                  border: '1px solid var(--accent-border)',
                  padding: '0.6rem 1.15rem',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  cursor: reproducing ? 'wait' : 'pointer',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <RotateCcw size={15} />
                <span>{reproducing ? 'Testing Repeatability...' : '4. Test Reproduction'}</span>
              </button>
            </div>
          </div>

          {/* Registration Status Banner */}
          {registrationReport && (
            <div
              style={{
                background: registrationReport.is_valid !== false ? 'var(--surface-raised)' : 'var(--status-anomalous-bg)',
                border: registrationReport.is_valid !== false ? '1px solid var(--border-default)' : '1px solid var(--status-anomalous-border)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem 1.25rem',
                marginBottom: '1rem',
                fontSize: 'var(--text-sm)',
                color: registrationReport.is_valid !== false ? 'var(--text-main)' : 'var(--status-anomalous)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--accent-text)' }}>
                <Database size={16} />
                <span>Registration Report &bull; Status: {registrationReport.status}</span>
              </div>
              <div>
                Discovered: <strong>{registrationReport.total_images_discovered ?? 0} images</strong> &bull; Masks Validated:{' '}
                <strong>{registrationReport.total_masks_validated ?? 0}</strong> &bull; Duplicate Hashes:{' '}
                <strong>{registrationReport.duplicate_hash_count ?? 0}</strong>
              </div>
              {registrationReport.snapshot_path && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  Snapshot: <code style={{ background: 'var(--surface-sunken)', padding: '2px 6px', borderRadius: '4px' }}>{registrationReport.snapshot_path}</code>
                </div>
              )}
              {registrationReport.validation_errors?.length > 0 && (
                <div style={{ marginTop: '0.4rem', color: 'var(--status-anomalous)', fontSize: 'var(--text-xs)' }}>
                  {registrationReport.validation_errors.join(' • ')}
                </div>
              )}
            </div>
          )}

          {/* Snapshot Verification Banner */}
          {verificationReport && (
            <div
              style={{
                background: verificationReport.is_valid ? 'var(--status-nominal-bg)' : 'var(--status-anomalous-bg)',
                border: verificationReport.is_valid ? '1px solid var(--status-nominal-border)' : '1px solid var(--status-anomalous-border)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem 1.25rem',
                marginBottom: '1rem',
                fontSize: 'var(--text-sm)',
                color: verificationReport.is_valid ? 'var(--status-nominal)' : 'var(--status-anomalous)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                {verificationReport.is_valid ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>Snapshot Verification: {verificationReport.is_valid ? 'All files match cryptographic hashes exactly.' : 'Integrity discrepancies detected.'}</span>
              </div>
            </div>
          )}

          {/* Reproduction Status Banner */}
          {reproduceReport && (
            <div
              style={{
                background: reproduceReport.reproducible ? 'var(--status-nominal-bg)' : 'var(--status-warning-bg)',
                border: reproduceReport.reproducible ? '1px solid var(--status-nominal-border)' : '1px solid var(--status-warning-border)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem 1.25rem',
                marginBottom: '1rem',
                fontSize: 'var(--text-sm)',
                color: reproduceReport.reproducible ? 'var(--status-nominal)' : 'var(--status-warning)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                {reproduceReport.reproducible ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>Reproduction Status: {reproduceReport.status}</span>
              </div>
              <div>
                Exact Deterministic Match: <strong>{reproduceReport.reproducible ? 'YES (100%)' : 'NO'}</strong>
                {typeof reproduceReport.match_rate === 'number' && (
                  <span>
                    {' '}
                    &bull; Match Rate: <strong>{(reproduceReport.match_rate * 100).toFixed(1)}%</strong>
                  </span>
                )}
              </div>
              {reproduceReport.reason && (
                <div style={{ marginTop: '0.35rem', fontSize: 'var(--text-xs)', opacity: 0.95 }}>
                  {reproduceReport.reason}
                </div>
              )}
            </div>
          )}

          {/* External Summary Display */}
          {externalSummary && (
            <div
              className="benchmark-panel"
              style={{
                background: 'var(--surface-base)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.5rem',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.25rem',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: '0 0 0.25rem 0',
                      fontSize: 'var(--text-lg)',
                      fontWeight: 800,
                      color: 'var(--text-main)',
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    Scientific External Evaluation Results
                  </h2>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    Dataset: <strong>{externalSummary.dataset_id}</strong> &bull; Status:{' '}
                    <strong style={{ color: externalSummary.status === 'COMPLETED' ? 'var(--status-nominal)' : 'var(--status-warning)' }}>
                      {externalSummary.status}
                    </strong>{' '}
                    &bull; Hash: <code style={{ fontFamily: 'var(--font-mono)' }}>{externalSummary.reproducibility_hash?.slice(0, 16)}...</code>
                  </div>
                </div>

                <span
                  style={{
                    background: externalSummary.determinism_verified ? 'var(--status-nominal-bg)' : 'var(--status-anomalous-bg)',
                    color: externalSummary.determinism_verified ? 'var(--status-nominal)' : 'var(--status-anomalous)',
                    border: `1px solid ${externalSummary.determinism_verified ? 'var(--status-nominal-border)' : 'var(--status-anomalous-border)'}`,
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                  }}
                >
                  {externalSummary.determinism_verified ? 'Determinism: 100% Match' : 'Discrepancy'}
                </span>
              </div>

              {/* Top KPI Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }}
              >
                <div style={{ padding: '1rem', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>Total Images</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                    {externalSummary.total_images ?? 0}
                  </div>
                </div>

                <div style={{ padding: '1rem', background: 'var(--status-nominal-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--status-nominal-border)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--status-nominal)', fontWeight: 600 }}>Authentic Images</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--status-nominal)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                    {externalSummary.authentic_evaluations?.total_images ?? 0}
                  </div>
                </div>

                <div style={{ padding: '1rem', background: 'var(--status-warning-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--status-warning-border)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--status-warning)', fontWeight: 600 }}>Manipulated Images</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--status-warning)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                    {externalSummary.manipulated_evaluations?.total_images ?? 0}
                  </div>
                </div>

                <div style={{ padding: '1rem', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>Total Evaluations</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                    {externalSummary.total_evaluations}
                  </div>
                </div>
              </div>

              {/* False Positive Characterization Box */}
              {externalSummary.false_positive_characterization && (
                <div
                  style={{
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                  }}
                >
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: 'var(--text-sm)', color: 'var(--text-main)', fontWeight: 700 }}>
                    Authentic-Image False Positive Sensitivity Characterization
                  </h4>
                  <div style={{ display: 'flex', gap: '1.5rem', fontSize: 'var(--text-xs)', flexWrap: 'wrap', color: 'var(--text-body)' }}>
                    <div>
                      Natural Textures: <strong>{externalSummary.false_positive_characterization.natural_textures}</strong> triggers
                    </div>
                    <div>
                      High-Contrast Edges: <strong>{externalSummary.false_positive_characterization.sharp_edges}</strong> triggers
                    </div>
                    <div>
                      Smooth Gradients: <strong>{externalSummary.false_positive_characterization.smooth_gradients}</strong> triggers
                    </div>
                  </div>
                </div>
              )}

              {/* Environment Snapshot Box */}
              {externalSummary.environment_snapshot && (
                <div
                  style={{
                    background: 'var(--surface-sunken)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                    padding: '0.85rem 1rem',
                    marginBottom: '1.5rem',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <strong style={{ color: 'var(--text-main)' }}>Runtime Environment: </strong>
                  OS: <code>{externalSummary.environment_snapshot.os_info}</code> &bull; Python:{' '}
                  <code>{externalSummary.environment_snapshot.python_version}</code> &bull; NumPy:{' '}
                  <code>{externalSummary.environment_snapshot.numpy_version}</code> &bull; Commit:{' '}
                  <code>{externalSummary.environment_snapshot.git_commit.slice(0, 8)}</code>
                </div>
              )}

              {/* Engine Table */}
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-sunken)', borderBottom: '2px solid var(--border-default)' }}>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>ENGINE ID</th>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>EVALUATIONS</th>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>APPLIED</th>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>INAPPLICABLE</th>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>FAILED</th>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>MEAN RUNTIME</th>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>SPATIAL IOU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(externalSummary.engine_metrics || {}).map(([engId, m]) => (
                      <tr key={engId} style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-base)' }}>
                        <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                          {engId}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-body)' }}>
                          {m.total_images_evaluated ?? m.total_evaluations ?? 0}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', color: 'var(--status-nominal)', fontWeight: 600 }}>
                          {m.applied_count ?? m.applicable_count ?? 0}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-muted)' }}>{m.not_applicable_count}</td>
                        <td style={{ padding: '0.65rem 0.85rem', color: m.failed_count > 0 ? 'var(--status-anomalous)' : 'var(--text-muted)' }}>
                          {m.failed_count}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-body)', fontFamily: 'var(--font-mono)' }}>
                          {m.mean_runtime_ms.toFixed(1)} ms
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem' }}>
                          {m.localization_metrics?.mean_iou !== undefined ? (
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
                              {m.localization_metrics.mean_iou.toFixed(3)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>NOT_EVALUATED</span>
                          )}
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

      {/* CONTROLLED BENCHMARK MODE */}
      {activeTab === 'controlled' && (
        <div>
          {/* Configuration Grid */}
          <div
            className="benchmark-panel"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '1.25rem',
              marginBottom: '1.5rem',
            }}
          >
            {/* Dataset Selection */}
            <div
              className="benchmark-panel"
              style={{
                background: 'var(--surface-base)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <Database size={16} style={{ color: 'var(--accent-text)' }} />
                <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-display)' }}>
                  Controlled Dataset Selection
                </h3>
              </div>
              {loadingDatasets ? (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Discovering manifests...</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {datasets.map((d) => {
                    const isSelected = selectedDataset === d.path;
                    return (
                      <label
                        key={d.dataset_id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.65rem',
                          padding: '0.65rem 0.85rem',
                          borderRadius: 'var(--radius-md)',
                          border: isSelected ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
                          background: isSelected ? 'var(--accent-light)' : 'var(--surface-raised)',
                          cursor: 'pointer',
                          fontSize: 'var(--text-sm)',
                          transition: 'all var(--duration-fast) var(--ease-snappy)',
                        }}
                      >
                        <input
                          type="radio"
                          name="dataset"
                          value={d.path}
                          checked={isSelected}
                          onChange={(e) => setSelectedDataset(e.target.value)}
                          style={{ marginTop: '0.2rem', accentColor: 'var(--accent-color)' }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: 'var(--text-xs)' }}>{d.name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            Path: <code style={{ fontFamily: 'var(--font-mono)' }}>{d.path}</code> &bull; Type: {d.type}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Execution Settings */}
            <div
              className="benchmark-panel"
              style={{
                background: 'var(--surface-base)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <Gauge size={16} style={{ color: 'var(--accent-text)' }} />
                <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-display)' }}>
                  Harness Configuration
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      marginBottom: '0.4rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}
                  >
                    Target Forensic Engines
                  </label>
                  <select
                    value={selectedEngines}
                    onChange={(e) => setSelectedEngines(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-default)',
                      background: 'var(--surface-raised)',
                      color: 'var(--text-main)',
                      fontSize: 'var(--text-sm)',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="all">All 16 Engines (Full Evaluation Suite)</option>
                    <option value="RESAMPLING,ADVANCED-NOISE">Resampling + Noise Modalities</option>
                    <option value="CLONE-BLOCK,CLONE-KEYPOINT">Copy-Move Engines (Block + Keypoint)</option>
                    <option value="PRNU,CAMERA-ID">PRNU + Camera ID Modalities</option>
                  </select>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-xs)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={verifyDeterminism}
                    onChange={(e) => setVerifyDeterminism(e.target.checked)}
                    style={{ accentColor: 'var(--accent-color)' }}
                  />
                  <span style={{ fontWeight: 600, color: 'var(--text-body)' }}>
                    Verify 3-Run Determinism (SHA-256 Parity)
                  </span>
                </label>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleRunControlledBenchmark}
                    disabled={running}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      background: 'var(--primary-gradient)',
                      color: '#ffffff',
                      border: '1px solid var(--primary-border)',
                      padding: '0.6rem 1.25rem',
                      borderRadius: 'var(--radius-md)',
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      cursor: running ? 'wait' : 'pointer',
                      boxShadow: 'var(--shadow-sm)',
                    }}
                  >
                    <Play size={15} />
                    <span>{running ? 'Running Suite...' : 'Execute Controlled Benchmark'}</span>
                  </button>

                  <button
                    type="button"
                    className="btn"
                    onClick={handleRunPRNU}
                    disabled={prnuRunning}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      background: 'var(--surface-raised)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-default)',
                      padding: '0.6rem 1.15rem',
                      borderRadius: 'var(--radius-md)',
                      fontWeight: 600,
                      fontSize: 'var(--text-sm)',
                      cursor: prnuRunning ? 'wait' : 'pointer',
                      boxShadow: 'var(--shadow-xs)',
                    }}
                  >
                    <Sparkles size={15} />
                    <span>{prnuRunning ? 'Analyzing...' : 'Run PRNU Protocol'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* PRNU Results Card */}
          {prnuResults && (
            <div
              className="benchmark-panel"
              style={{
                background: 'var(--surface-base)',
                border: '1px solid var(--accent-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                marginBottom: '1.5rem',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--accent-text)', fontFamily: 'var(--font-display)' }}>
                  Camera PRNU Multi-Sensor Attribution Results
                </h3>
                <span
                  style={{
                    background: 'var(--primary-light)',
                    color: 'var(--accent-text)',
                    fontWeight: 700,
                    fontSize: 'var(--text-2xs)',
                    padding: '0.2rem 0.65rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--accent-border)',
                  }}
                >
                  4-Reference MLE Protocol
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div style={{ padding: '0.85rem', background: 'var(--surface-raised)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>Same-Camera Mean PCE</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--status-nominal)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                    {prnuResults.same_camera_distribution?.mean_pce ?? 'N/A'}
                  </div>
                </div>
                <div style={{ padding: '0.85rem', background: 'var(--surface-raised)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>Different-Camera Mean PCE</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--status-anomalous)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                    {prnuResults.different_camera_distribution?.mean_pce ?? 'N/A'}
                  </div>
                </div>
                <div style={{ padding: '0.85rem', background: 'var(--surface-raised)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-default)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600 }}>Separation Gap</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                    {prnuResults.separation_metrics?.pce_separation_gap ?? 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Controlled Benchmark Summary */}
          {summary && (
            <div
              className="benchmark-panel"
              style={{
                background: 'var(--surface-base)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <h2
                    style={{
                      margin: '0 0 0.25rem 0',
                      fontSize: 'var(--text-md)',
                      fontWeight: 800,
                      color: 'var(--text-main)',
                      fontFamily: 'var(--font-display)',
                    }}
                  >
                    Controlled Evaluation Summary
                  </h2>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    Dataset: <strong>{summary.dataset_id}</strong> &bull; Run ID:{' '}
                    <code style={{ fontFamily: 'var(--font-mono)' }}>{summary.run_id || summary.summary_id}</code>
                  </div>
                </div>
                <span
                  style={{
                    background: summary.determinism_verified ? 'var(--status-nominal-bg)' : 'var(--status-anomalous-bg)',
                    color: summary.determinism_verified ? 'var(--status-nominal)' : 'var(--status-anomalous)',
                    border: `1px solid ${summary.determinism_verified ? 'var(--status-nominal-border)' : 'var(--status-anomalous-border)'}`,
                    padding: '0.35rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                  }}
                >
                  {summary.determinism_verified ? 'Determinism: PASS (3/3)' : 'Discrepancy'}
                </span>
              </div>

              {/* Engine Breakdown Table */}
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-sunken)', borderBottom: '2px solid var(--border-default)' }}>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>ENGINE ID</th>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>EVALUATIONS</th>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>APPLICABLE</th>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>NOT APPLICABLE</th>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>FAILED</th>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>MEAN RUNTIME</th>
                      <th style={{ padding: '0.75rem 0.85rem', fontWeight: 700, color: 'var(--text-muted)' }}>SPATIAL IOU</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(summary.engine_metrics || {}).map(([engId, m]) => (
                      <tr key={engId} style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-base)' }}>
                        <td style={{ padding: '0.65rem 0.85rem', fontWeight: 600, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
                          {engId}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-body)' }}>
                          {m.total_evaluations ?? m.total_images_evaluated ?? 0}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', color: 'var(--status-nominal)', fontWeight: 600 }}>
                          {m.applicable_count ?? m.applied_count ?? 0}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-muted)' }}>{m.not_applicable_count}</td>
                        <td style={{ padding: '0.65rem 0.85rem', color: m.failed_count > 0 ? 'var(--status-anomalous)' : 'var(--text-muted)' }}>
                          {m.failed_count}
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-body)', fontFamily: 'var(--font-mono)' }}>
                          {m.mean_runtime_ms.toFixed(1)} ms
                        </td>
                        <td style={{ padding: '0.65rem 0.85rem' }}>
                          {m.mean_spatial_iou !== undefined && m.mean_spatial_iou !== null ? (
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
                              {m.mean_spatial_iou.toFixed(3)}
                            </span>
                          ) : m.localization_metrics?.mean_iou !== undefined ? (
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
                              {m.localization_metrics.mean_iou.toFixed(3)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Forwarded-Image Transformation Stress Section */}
          <section
            className="benchmark-panel"
            style={{
              background: 'var(--surface-base)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.25rem',
              marginTop: '1.5rem',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <h2
                  style={{
                    margin: '0 0 0.3rem',
                    fontSize: 'var(--text-md)',
                    fontWeight: 800,
                    color: 'var(--text-main)',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  Forwarded-Image Transformation Stress
                </h2>
                <p style={{ margin: 0, maxWidth: '780px', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', lineHeight: 1.55 }}>
                  Compare unchanged images with five deterministic delivery simulations: JPEG forwarding, double recompression, small crop, screen recapture, and pixel rewrite. Results reflect mathematical drift bounds rather than subjective authenticity.
                </p>
              </div>
              <button
                type="button"
                className="btn"
                onClick={handleRunTransformationStress}
                disabled={stressRunning}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  background: 'var(--surface-raised)',
                  color: 'var(--accent-text)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.6rem 1.15rem',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  cursor: stressRunning ? 'wait' : 'pointer',
                  boxShadow: 'var(--shadow-xs)',
                }}
              >
                <RefreshCw size={14} className={stressRunning ? 'spin' : ''} />
                <span>{stressRunning ? 'Running Profiles…' : 'Run Transformation Stress'}</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 2fr) minmax(130px, 1fr)', gap: '0.85rem', marginTop: '1.15rem' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                Target Engines (comma-separated)
                <input
                  value={stressEngines}
                  onChange={(event) => setStressEngines(event.target.value)}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: '0.35rem',
                    padding: '0.55rem 0.85rem',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-raised)',
                    color: 'var(--text-main)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    boxSizing: 'border-box',
                  }}
                />
              </label>

              <label style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                Source Images (1–20)
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={stressImageLimit}
                  onChange={(event) => setStressImageLimit(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: '0.35rem',
                    padding: '0.55rem 0.85rem',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-raised)',
                    color: 'var(--text-main)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    boxSizing: 'border-box',
                  }}
                />
              </label>
            </div>

            {stressReport && (
              <div style={{ marginTop: '1.25rem' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginBottom: '0.75rem' }}>
                  Dataset: <strong>{stressReport.dataset_id}</strong> &bull; {stressReport.source_images?.length || 0} source images &bull; {stressReport.engines?.length || 0} engines
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.85rem' }}>
                  {(stressReport.profiles || []).map((profileReport: any) => (
                    <div
                      key={profileReport.profile.id}
                      style={{
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.85rem',
                        background: 'var(--surface-raised)',
                      }}
                    >
                      <strong style={{ color: 'var(--text-main)', fontSize: 'var(--text-sm)' }}>
                        {profileReport.profile.label}
                      </strong>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.2rem' }}>
                        {profileReport.profile.description}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginTop: '0.65rem', fontSize: '0.72rem' }}>
                        {Object.entries(profileReport.summary.engine_metrics || {}).map(([engineId, metric]: [string, any]) => (
                          <div
                            key={engineId}
                            style={{
                              background: 'var(--surface-sunken)',
                              padding: '0.45rem',
                              borderRadius: 'var(--radius-xs)',
                              border: '1px solid var(--border-subtle)',
                            }}
                          >
                            <strong style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>{engineId}</strong>
                            <br />
                            <span style={{ color: 'var(--status-nominal)' }}>{metric.applied_count ?? 0} applicable</span> &bull;{' '}
                            <span style={{ color: metric.failed_count > 0 ? 'var(--status-anomalous)' : 'var(--text-muted)' }}>
                              {metric.failed_count ?? 0} failed
                            </span>
                            {metric.localization_metrics?.mean_iou !== undefined && (
                              <div style={{ marginTop: '0.2rem', fontFamily: 'var(--font-mono)' }}>
                                Mean IoU {Number(metric.localization_metrics.mean_iou).toFixed(3)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {stressReport.report_path && (
                  <code style={{ display: 'block', marginTop: '0.65rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Saved report: {stressReport.report_path}
                  </code>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
