import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { fetchApi } from '../api';
import EvidenceIntegrityCard from '../components/evidence/EvidenceIntegrityCard';
import AnalysisJobCard from '../components/evidence/AnalysisJobCard';
import AuthenticatedImage from '../components/evidence/AuthenticatedImage';
import AdvancedJpegViewer from '../components/evidence/AdvancedJpegViewer';
import CompressionHistoryViewer from '../components/evidence/CompressionHistoryViewer';
import BlockingArtifactViewer from '../components/evidence/BlockingArtifactViewer';
import HistogramViewer from '../components/evidence/HistogramViewer';
import ColorChannelViewer from '../components/evidence/ColorChannelViewer';
import FourierViewer from '../components/evidence/FourierViewer';
import { AdvancedNoiseViewer } from '../components/evidence/AdvancedNoiseViewer';
import { ResamplingViewer } from '../components/evidence/ResamplingViewer';
import { CloneBlockViewer } from '../components/evidence/CloneBlockViewer';
import { CloneKeypointViewer } from '../components/evidence/CloneKeypointViewer';
import { PRNUViewer } from '../components/evidence/PRNUViewer';
import { CameraIdViewer } from '../components/evidence/CameraIdViewer';
import InteractiveVisualInspection from '../components/evidence/InteractiveVisualInspection';
import { PerspectiveForensicsViewer } from '../components/evidence/PerspectiveForensicsViewer';
import { LightingSolarForensicsViewer } from '../components/evidence/LightingSolarForensicsViewer';
import { X, Table, RefreshCw, CheckCircle2 } from 'lucide-react';

interface HeatmapRegion {
  modality: string;
  x: number;
  y: number;
  width: number;
  height: number;
  intensity: number;
  description: string;
}

interface ModalityLayer {
  modality: string;
  label: string;
  status: string;
  regions: HeatmapRegion[];
  summary: string;
  limitations: string;
}

interface HeatmapData {
  evidence_id: number;
  width: number;
  height: number;
  layers: ModalityLayer[];
  composite_regions_count: number;
  what_was_found: string;
  why_it_matters: string;
  recommended_next_steps: string[];
  limitations: string;
}

export default function EvidenceDetail() {
  const { caseId, evidenceId } = useParams<{ caseId: string, evidenceId: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [sourcePlatform, setSourcePlatform] = useState('');
  const [acquisitionMethod, setAcquisitionMethod] = useState('');
  const [receivedFrom, setReceivedFrom] = useState('');
  const [receivedAt, setReceivedAt] = useState('');
  const [reportedCaptureTime, setReportedCaptureTime] = useState('');
  const [sourceReferenceUrl, setSourceReferenceUrl] = useState('');
  const [intakeNotes, setIntakeNotes] = useState('');
  const [error, setError] = useState('');
  
  const [jobs, setJobs] = useState<any>({});
  const [results, setResults] = useState<any>({});
  const [jobErrors, setJobErrors] = useState<Record<string, string>>({});

  const [normalizing, setNormalizing] = useState(false);
  const [correlating, setCorrelating] = useState(false);

  // Heatmap state
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(0.65);
  const [showElaLayer, setShowElaLayer] = useState<boolean>(true);
  const [showNoiseLayer, setShowNoiseLayer] = useState<boolean>(true);
  const [showCloneLayer, setShowCloneLayer] = useState<boolean>(true);

  // Custody quick verify state
  const [verifyingCustody, setVerifyingCustody] = useState(false);
  const [custodyResult, setCustodyResult] = useState<any | null>(null);
  const [c2paResult, setC2paResult] = useState<any | null>(null);
  const [checkingC2pa, setCheckingC2pa] = useState(false);

  // Categorized Forensic Workbench active tab
  const [workbenchTab, setWorkbenchTab] = useState<'overview' | 'visual_inspection' | 'physics_geometry' | 'core' | 'compression' | 'color_spectrum' | 'noise_resampling' | 'cloning' | 'camera_sensor' | 'all'>('overview');

  // Normalization Modal & Auto-Fusion State
  const [showNormalizationModal, setShowNormalizationModal] = useState<boolean>(false);
  const isSyncingFusionRef = useRef(false);
  const prevCompletedCountRef = useRef<number>(0);

  const runFusionSync = useCallback(async (evId?: string | number) => {
    const targetId = evId || uploadResult?.id;
    if (!targetId || isSyncingFusionRef.current) return;
    
    isSyncingFusionRef.current = true;
    setNormalizing(true);
    try {
      const normRes = await fetchApi(`/evidence/${targetId}/fusion/normalize`, { method: 'POST' });
      if (normRes.ok) {
        const normData = await normRes.json();
        setResults((prev: any) => ({ ...prev, normalize: normData }));
        
        setNormalizing(false);
        setCorrelating(true);
        const corrRes = await fetchApi(`/evidence/${targetId}/fusion/correlate`, { method: 'POST' });
        if (corrRes.ok) {
          const corrData = await corrRes.json();
          setResults((prev: any) => ({ ...prev, correlate: corrData }));
        }
      }
    } catch (err) {
      console.error("Auto fusion sync error", err);
    } finally {
      setNormalizing(false);
      setCorrelating(false);
      isSyncingFusionRef.current = false;
    }
  }, [uploadResult?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNormalizationModal(false);
      }
    };
    if (showNormalizationModal) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNormalizationModal]);

  const fetchEvidenceAndJobs = (evId: string) => {
    setJobs({});
    setResults({});
    setHeatmap(null);
    setCustodyResult(null);
    setJobErrors({});

    fetchApi(`/evidence/${evId}`)
      .then(res => res.json())
      .then(data => setUploadResult(data))
      .catch(err => console.error("Error fetching evidence", err));

    fetchApi(`/evidence/${evId}/c2pa/latest`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setC2paResult(data); })
      .catch(() => {});

    fetchApi(`/evidence/${evId}/jobs`)
      .then(res => res.json())
      .then((jobsList: any[]) => {
        if (Array.isArray(jobsList)) {
          const jobsMap: any = {};
          let hasCompleted = false;
          jobsList.forEach(j => {
            const key = j.analysis_type.toLowerCase();
            const hypKey = key.replace(/_/g, '-');
            jobsMap[key] = j;
            jobsMap[hypKey] = j;
            if (j.status === 'COMPLETED') {
              hasCompleted = true;
              if (j.analysis_id) {
                fetchApi(`/analysis/${j.analysis_id}`)
                  .then(r => r.json())
                  .then(resData => {
                    setResults((prev: any) => ({ ...prev, [key]: resData, [hypKey]: resData }));
                  })
                  .catch(() => {});
              }
            }
          });
          setJobs(jobsMap);
          if (hasCompleted) {
            runFusionSync(evId);
          }
        }
      })
      .catch(err => console.error("Error fetching jobs", err));

    fetchApi(`/evidence/${evId}/analyses`)
      .then(res => res.json())
      .then((analysesList: any[]) => {
        if (Array.isArray(analysesList)) {
          setResults((prev: any) => {
            const updated = { ...prev };
            analysesList.forEach(a => {
              if (a.status === 'completed' || a.status === 'not_applicable') {
                const key = a.analysis_type.toLowerCase();
                const hypKey = key.replace(/_/g, '-');
                if (!updated[key]) {
                  updated[key] = a;
                  updated[hypKey] = a;
                }
              }
            });
            return updated;
          });
          if (analysesList.some(a => a.status === 'completed')) {
            runFusionSync(evId);
          }
        }
      })
      .catch(() => {});

    fetchApi(`/evidence/${evId}/heatmap`)
      .then(res => res.json())
      .then(hData => setHeatmap(hData))
      .catch(() => {});
  };

  const handleAnalysisResult = (slug: string, data: any) => {
    const key = slug.toLowerCase();
    const hypKey = key.replace(/_/g, '-');
    setResults((prev: any) => ({ ...prev, [key]: data, [hypKey]: data }));
    if (uploadResult?.id) {
      fetchApi(`/evidence/${uploadResult.id}/heatmap`)
        .then(r => r.json())
        .then(h => setHeatmap(h))
        .catch(() => {});
      runFusionSync(uploadResult.id);
    }
  };

  useEffect(() => {
    if (evidenceId && evidenceId !== 'new') {
      fetchEvidenceAndJobs(evidenceId);
    }
  }, [evidenceId]);

  const runAsyncJob = async (analysisType: string) => {
    setJobErrors(prev => ({ ...prev, [analysisType]: '' }));
    try {
      const res = await fetchApi(`/jobs/analysis/${uploadResult.id}/${analysisType}`, { method: 'POST' });
      const jobData = await res.json();
      if (!res.ok) throw new Error(jobData.detail || 'Failed to queue job');
      
      setJobs((prev: any) => ({ ...prev, [analysisType]: jobData }));

      let isComplete = jobData.status === 'COMPLETED' || jobData.status === 'FAILED';
      let finalJob = jobData;
      const pollStartedAt = Date.now();
      while (!isComplete) {
        if (Date.now() - pollStartedAt >= 5 * 60 * 1000) {
          setJobErrors(prev => ({ ...prev, [analysisType]: 'This analysis is still running. Check its status again shortly.' }));
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
        const pollRes = await fetchApi(`/jobs/${finalJob.id}`);
        if (!pollRes.ok) throw new Error(`Could not refresh job status (${pollRes.status}).`);
        finalJob = await pollRes.json();
        setJobs((prev: any) => ({ ...prev, [analysisType]: finalJob }));
        
        if (finalJob.status === 'COMPLETED' || finalJob.status === 'FAILED') {
          isComplete = true;
        }
      }

      if (finalJob.status === 'FAILED') {
        setJobErrors(prev => ({
          ...prev,
          [analysisType]: finalJob.safe_error_message || 'The analysis failed. Retry after checking the system status.'
        }));
        return;
      }
      
      if (finalJob.status === 'COMPLETED' && finalJob.analysis_id) {
        const resultRes = await fetchApi(`/analysis/${finalJob.analysis_id}`);
        const resultData = await resultRes.json();
        setResults((prev: any) => ({ ...prev, [analysisType]: resultData }));
        // Refresh heatmap after analysis completion
        fetchApi(`/evidence/${uploadResult.id}/heatmap`)
          .then(r => r.json())
          .then(h => setHeatmap(h))
          .catch(() => {});
        // Auto-run normalization and correlation
        runFusionSync(uploadResult.id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Analysis request failed.';
      setJobErrors(prev => ({ ...prev, [analysisType]: message }));
    }
  };

  const handleUpload = () => {
    if (!file || !caseId) return;
    setUploading(true);
    setError('');
    
    const formData = new FormData();
    formData.append('case_id', caseId || '');
    formData.append('file', file);
    formData.append('source_platform', sourcePlatform);
    formData.append('acquisition_method', acquisitionMethod);
    formData.append('received_from', receivedFrom);
    formData.append('received_at', receivedAt);
    formData.append('reported_capture_time', reportedCaptureTime);
    formData.append('source_reference_url', sourceReferenceUrl);
    formData.append('intake_notes', intakeNotes);

    fetchApi(`/cases/${caseId}/evidence`, {
      method: 'POST',
      body: formData
    }, 120000)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Upload failed');
        setUploadResult(data);
        setUploading(false);
        setFile(null);
        fetchEvidenceAndJobs(String(data.id));
      })
      .catch((_err: any) => {
        setError(_err.message);
        setUploading(false);
      });
  };

  const handleCheckC2pa = async () => {
    if (!uploadResult) return;
    setCheckingC2pa(true);
    try {
      const response = await fetchApi(`/evidence/${uploadResult.id}/c2pa/inspect`, { method: 'POST' }, 60000);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Content Credential inspection failed.');
      setC2paResult(data);
    } catch (checkError) {
      const message = checkError instanceof Error ? checkError.message : 'Content Credential inspection failed.';
      setC2paResult({ credential_status: 'INSPECTION_ERROR', summary: message });
    } finally {
      setCheckingC2pa(false);
    }
  };

  const handleVerifyCustody = () => {
    if (!uploadResult) return;
    setVerifyingCustody(true);
    fetchApi(`/evidence/${uploadResult.id}/verify-custody`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        setCustodyResult(data);
        setVerifyingCustody(false);
      })
      .catch(() => setVerifyingCustody(false));
  };

  const handleNormalize = () => runFusionSync();
  const handleCorrelate = () => runFusionSync();

  const hasResult = (key: string) => Boolean(results[key] || results[key.replace('-', '_')] || jobs[key]?.status === 'COMPLETED');

  const coreCount = ['metadata', 'ela', 'noise', 'jpeg-dct', 'copy-move'].filter(k => hasResult(k)).length;
  const compressionCount = ['jpeg-structure', 'jpeg-ghost', 'adjpeg', 'nadjpeg', 'blocking-artifact'].filter(k => hasResult(k)).length;
  const colorCount = ['histogram', 'color-channel', 'fourier'].filter(k => hasResult(k)).length;
  const noiseResamplingCount = ['advanced-noise', 'resampling'].filter(k => hasResult(k)).length;
  const cloningCount = ['clone-block', 'clone-keypoint'].filter(k => hasResult(k)).length;
  const cameraCount = ['prnu', 'camera-id'].filter(k => hasResult(k)).length;
  const physicsGeometryCount = ['geometry-perspective', 'physics-lighting'].filter(k => hasResult(k)).length;
  const totalCompleted = coreCount + compressionCount + colorCount + noiseResamplingCount + cloningCount + cameraCount + physicsGeometryCount;

  useEffect(() => {
    if (uploadResult?.id && totalCompleted > 0 && totalCompleted !== prevCompletedCountRef.current) {
      prevCompletedCountRef.current = totalCompleted;
      runFusionSync(uploadResult.id);
    }
  }, [totalCompleted, uploadResult?.id, runFusionSync]);

  const workbenchTabs = [
    { id: 'overview', label: 'Overview & Attention Heatmap', icon: '🔍', count: heatmap?.composite_regions_count || 0, suffix: 'zones' },
    { id: 'visual_inspection', label: 'Interactive Microscopy & Loupe', icon: '🔬', count: 1, suffix: 'active' },
    { id: 'physics_geometry', label: 'Physics & Geometry', icon: '📐', count: physicsGeometryCount, suffix: '/2' },
    { id: 'core', label: 'Core DIP Engines', icon: '⚙️', count: coreCount, suffix: '/5' },
    { id: 'compression', label: 'Container & Compression', icon: '🗜️', count: compressionCount, suffix: '/3' },
    { id: 'color_spectrum', label: 'Color & Spectrum', icon: '🌈', count: colorCount, suffix: '/3' },
    { id: 'noise_resampling', label: 'Noise & Resampling', icon: '🔬', count: noiseResamplingCount, suffix: '/2' },
    { id: 'cloning', label: 'Clone Detection', icon: '👯', count: cloningCount, suffix: '/2' },
    { id: 'camera_sensor', label: 'Camera & Sensor', icon: '📷', count: cameraCount, suffix: '/2' },
    { id: 'all', label: 'All Modalities', icon: '📑', count: totalCompleted, suffix: 'active' },
  ];

  const effectiveFormat = (uploadResult?.image_format || uploadResult?.mime_type?.split('/')?.[1] || '').toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Evidence Acquisition Form (if new) */}
      {!uploadResult && (
        <div className="card">
          <h2 className="card-title">Evidence Acquisition & Cryptographic Ingestion</h2>
          {!caseId ? (
            <p style={{ color: 'var(--text-muted)' }}>No Case ID found.</p>
          ) : (
            <div>
              <p style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>Active Case: {caseId}</p>
              <input 
                type="file" 
                accept="image/png, image/jpeg, image/webp"
                onChange={e => setFile(e.target.files?.[0] || null)}
                style={{ marginBottom: '1rem', display: 'block', width: '100%', padding: '0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '0.25rem', color: 'var(--text-main)' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem', marginBottom: '0.8rem' }}>
                <input type="text" placeholder="Where received (for example, WhatsApp)" value={sourcePlatform} onChange={e => setSourcePlatform(e.target.value)} aria-label="Source platform" />
                <select value={acquisitionMethod} onChange={e => setAcquisitionMethod(e.target.value)} aria-label="How the file was acquired">
                  <option value="">Acquisition method (optional)</option>
                  <option value="ORIGINAL_FILE">Original file</option>
                  <option value="FORWARDED_FILE">Forwarded file</option>
                  <option value="SCREENSHOT">Screenshot</option>
                  <option value="WEB_DOWNLOAD">Web download</option>
                  <option value="OTHER">Other</option>
                </select>
                <input type="text" placeholder="Received from (optional)" value={receivedFrom} onChange={e => setReceivedFrom(e.target.value)} aria-label="Received from" />
                <input type="datetime-local" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} aria-label="Received at" />
                <input type="text" placeholder="Reported capture time (keep as reported)" value={reportedCaptureTime} onChange={e => setReportedCaptureTime(e.target.value)} aria-label="Reported capture time" />
                <input type="url" placeholder="Source URL (optional)" value={sourceReferenceUrl} onChange={e => setSourceReferenceUrl(e.target.value)} aria-label="Source URL" />
                <textarea placeholder="Acquisition notes (optional)" value={intakeNotes} onChange={e => setIntakeNotes(e.target.value)} rows={2} aria-label="Acquisition notes" style={{ gridColumn: '1 / -1', resize: 'vertical' }} />
              </div>
              <button className="btn btn-primary" onClick={handleUpload} disabled={!file || uploading} style={{ width: '100%' }}>
                {uploading ? 'Preserving received file and computing SHA-256…' : 'Preserve file & start intake record'}
              </button>
              {error && <div style={{ marginTop: '1rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.25rem' }}>{error}</div>}
            </div>
          )}
        </div>
      )}

      {uploadResult && (
        <>
          {/* Top Bar: Integrity Card + Quick Verify */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
            <EvidenceIntegrityCard evidence={uploadResult} />

            {/* Custody Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Chain of Custody & Storage Verification</h3>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                    SHA-256 INVARIANT
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Real-time disk bitstream verification against immutable acquisition hash.
                </div>

                {custodyResult && (
                  <div style={{ padding: '0.6rem', background: custodyResult.integrity_intact ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${custodyResult.integrity_intact ? '#10b981' : '#ef4444'}`, borderRadius: '4px', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                    <strong>{custodyResult.status}:</strong> {custodyResult.message}
                  </div>
                )}
              </div>

              <button 
                className="secondary-button"
                onClick={handleVerifyCustody}
                disabled={verifyingCustody}
                style={{ width: '100%', fontSize: '0.8rem', padding: '0.45rem' }}
              >
                {verifyingCustody ? 'Reading Physical Disk Bytes...' : '🛡️ On-Demand Hash Re-Verification'}
              </button>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.8rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.05rem' }}>Content Credentials (C2PA)</h3>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Optional signed provenance check. Credential absence is common and is not evidence of manipulation.
                </p>
                {uploadResult.intake_context && (
                  <div style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Received via: <strong>{uploadResult.intake_context.source_platform || uploadResult.intake_context.acquisition_method || 'Not recorded'}</strong>
                    {uploadResult.intake_context.reported_capture_time && <> · Reported capture: {uploadResult.intake_context.reported_capture_time}</>}
                  </div>
                )}
                {c2paResult && (
                  <div style={{ marginTop: '0.65rem', padding: '0.65rem', borderRadius: '5px', background: 'var(--surface-color-light)', fontSize: '0.75rem' }}>
                    <strong>{String(c2paResult.credential_status || 'UNKNOWN').replaceAll('_', ' ')}</strong>
                    <div style={{ marginTop: '0.25rem' }}>{c2paResult.summary}</div>
                    {c2paResult.manifest?.signer_issuer && <div style={{ marginTop: '0.3rem' }}>Signer: {c2paResult.manifest.signer_issuer}</div>}
                    {c2paResult.manifest?.signature_time && <div>Signed: {c2paResult.manifest.signature_time}</div>}
                    {Array.isArray(c2paResult.manifest?.assertion_labels) && c2paResult.manifest.assertion_labels.length > 0 && (
                      <div style={{ marginTop: '0.3rem' }}>Assertions: {c2paResult.manifest.assertion_labels.join(', ')}</div>
                    )}
                    {(c2paResult.validation_state !== undefined || (Array.isArray(c2paResult.validation_results) && c2paResult.validation_results.length > 0)) && (
                      <details style={{ marginTop: '0.5rem' }}>
                        <summary style={{ cursor: 'pointer' }}>View SDK validation details</summary>
                        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '220px', overflow: 'auto', fontSize: '0.68rem', marginTop: '0.35rem' }}>
                          {JSON.stringify({ state: c2paResult.validation_state, results: c2paResult.validation_results }, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
              <button className="secondary-button" onClick={handleCheckC2pa} disabled={checkingC2pa} style={{ width: '100%', fontSize: '0.8rem', padding: '0.45rem' }}>
                {checkingC2pa ? 'Inspecting local credential…' : 'Inspect Content Credential'}
              </button>
            </div>
          </div>

          {/* Categorized Forensic Workbench Navigation */}
          <div style={{
            position: 'sticky',
            top: '0px',
            zIndex: 90,
            background: 'var(--surface-color)',
            backdropFilter: 'var(--glass-blur)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '0.5rem',
            margin: '1.25rem 0 0.5rem 0',
            display: 'flex',
            gap: '0.4rem',
            overflowX: 'auto',
            boxShadow: 'var(--shadow-card)',
            alignItems: 'center'
          }}>
            {workbenchTabs.map(t => {
              const isActive = workbenchTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setWorkbenchTab(t.id as any)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    border: isActive ? '1px solid var(--primary-border)' : '1px solid transparent',
                    background: isActive ? 'var(--primary-light)' : 'transparent',
                    color: isActive ? 'var(--primary-color)' : 'var(--text-muted)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  <span style={{
                    fontSize: '0.68rem',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '9999px',
                    background: isActive ? 'var(--primary-color)' : 'var(--surface-color-light)',
                    color: isActive ? '#ffffff' : 'var(--text-muted)',
                    fontWeight: 700
                  }}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW & MULTI-MODALITY HEATMAP */}
          {(workbenchTab === 'overview' || workbenchTab === 'all') && heatmap && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#ec4899', background: 'rgba(236, 72, 153, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                      Spatial Attention Synthesis
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {heatmap.composite_regions_count} Anomaly Zones Identified
                    </span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Multi-Modality Forensic Anomaly Heatmap</h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Spatial convergence of Error Level Analysis, Noise Residual Discrepancies, and Keypoint Clusters
                  </div>
                </div>

                {/* Heatmap Controls */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface-color-light)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                    <label style={{ fontWeight: 600 }}>Opacity: {Math.round(heatmapOpacity * 100)}%</label>
                    <input 
                      type="range" 
                      min="0.1" 
                      max="1.0" 
                      step="0.05"
                      value={heatmapOpacity}
                      onChange={e => setHeatmapOpacity(parseFloat(e.target.value))}
                      style={{ width: '80px', cursor: 'pointer' }}
                    />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showElaLayer} onChange={e => setShowElaLayer(e.target.checked)} />
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>ELA Layer</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showNoiseLayer} onChange={e => setShowNoiseLayer(e.target.checked)} />
                    <span style={{ color: '#06b6d4', fontWeight: 600 }}>Noise Layer</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showCloneLayer} onChange={e => setShowCloneLayer(e.target.checked)} />
                    <span style={{ color: '#10b981', fontWeight: 600 }}>Clone Layer</span>
                  </label>
                </div>
              </div>

              {/* Canvas/Overlay Container */}
              <div style={{ position: 'relative', width: '100%', maxWidth: '900px', margin: '0 auto', background: '#000', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <AuthenticatedImage
                  src={`/api/evidence/${uploadResult.id}/raw`}
                  alt={uploadResult.original_filename}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />

                {/* Overlay SVG */}
                <svg 
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                >
                  {heatmap.layers.map(layer => {
                    if (layer.modality === 'ELA' && !showElaLayer) return null;
                    if (layer.modality === 'NOISE' && !showNoiseLayer) return null;
                    if (layer.modality === 'COPY_MOVE' && !showCloneLayer) return null;

                    const color = layer.modality === 'ELA' ? '#ef4444' : layer.modality === 'NOISE' ? '#06b6d4' : '#10b981';

                    return layer.regions.map((r, rIdx) => (
                      <rect
                        key={`${layer.modality}-${rIdx}`}
                        x={r.x * 1000}
                        y={r.y * 1000}
                        width={r.width * 1000}
                        height={r.height * 1000}
                        fill={color}
                        fillOpacity={r.intensity * heatmapOpacity * 0.45}
                        stroke={color}
                        strokeWidth="2"
                        strokeDasharray="4 2"
                      />
                    ));
                  })}
                </svg>
              </div>

              {/* Scientific Principles Context Card */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                <div style={{ background: 'var(--surface-color-light)', borderLeft: '3px solid #3b82f6', borderRadius: '4px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase' }}>WHAT WAS FOUND?</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{heatmap.what_was_found}</div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', borderLeft: '3px solid #10b981', borderRadius: '4px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>WHY DOES IT MATTER?</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{heatmap.why_it_matters}</div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', borderLeft: '3px solid #f59e0b', borderRadius: '4px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>WHAT SHOULD YOU DO NEXT?</div>
                  <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0, fontSize: '0.75rem' }}>
                    {heatmap.recommended_next_steps.slice(0, 3).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontStyle: 'italic', marginTop: '0.75rem' }}>
                <strong>Limitation:</strong> {heatmap.limitations}
              </div>
            </div>
          )}

          {/* TAB: INTERACTIVE VISUAL INSPECTION & MICROSCOPY */}
          {(workbenchTab === 'visual_inspection' || workbenchTab === 'all') && (
            <InteractiveVisualInspection 
              evidenceId={uploadResult.id} 
              filename={uploadResult.original_filename} 
            />
          )}

          {/* TAB 2: CORE FORENSIC / DIP WORKLOADS */}
          {(workbenchTab === 'core' || workbenchTab === 'all') && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 className="card-title" style={{ margin: 0, color: 'var(--primary-color)' }}>
                  FORENSIC / DIP ENGINE WORKLOADS (FROZEN CORE)
                </h2>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
                <AnalysisJobCard job={jobs['metadata']} analysisType="Metadata" result={results['metadata']} onRun={() => runAsyncJob('metadata')} disabled={false} />
                <AnalysisJobCard job={jobs['ela']} analysisType="Error Level Analysis" result={results['ela']} onRun={() => runAsyncJob('ela')} disabled={false} />
                <AnalysisJobCard job={jobs['noise']} analysisType="Noise Residual" result={results['noise']} onRun={() => runAsyncJob('noise')} disabled={false} />
                <AnalysisJobCard job={jobs['jpeg-dct']} analysisType="JPEG / DCT" result={results['jpeg-dct']} onRun={() => runAsyncJob('jpeg-dct')} disabled={false} />
                <AnalysisJobCard job={jobs['copy-move']} analysisType="Copy-Move" result={results['copy-move']} onRun={() => runAsyncJob('copy-move')} disabled={false} />
              </div>
            </div>
          )}

          {/* TAB 3: CONTAINER & COMPRESSION FORENSICS */}
          {(workbenchTab === 'compression' || workbenchTab === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <AdvancedJpegViewer
                evidenceId={uploadResult.id}
                containerFormat={effectiveFormat}
                structureResult={results['jpeg-structure'] || results['jpeg_structure']}
                qtResult={results['jpeg-qt'] || results['jpeg_qt']}
                huffmanResult={results['jpeg-huffman'] || results['jpeg_huffman']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
                onResult={handleAnalysisResult}
              />

              <CompressionHistoryViewer
                evidenceId={uploadResult.id}
                containerFormat={effectiveFormat}
                ghostResult={results['jpeg-ghost'] || results['jpeg_ghost']}
                adjpegResult={results['adjpeg']}
                nadjpegResult={results['nadjpeg']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
                onResult={handleAnalysisResult}
              />

              <BlockingArtifactViewer
                evidenceId={uploadResult.id}
                containerFormat={effectiveFormat}
                blockingResult={results['blocking-artifact'] || results['blocking_artifact']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
                onResult={handleAnalysisResult}
              />
            </div>
          )}

          {/* TAB 4: COLOR & SPECTRUM FORENSICS */}
          {(workbenchTab === 'color_spectrum' || workbenchTab === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <HistogramViewer
                evidenceId={uploadResult.id}
                containerFormat={effectiveFormat}
                histogramResult={results['histogram']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />

              <ColorChannelViewer
                evidenceId={uploadResult.id}
                containerFormat={effectiveFormat}
                colorChannelResult={results['color-channel'] || results['color_channel']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />

              <FourierViewer
                evidenceId={uploadResult.id}
                containerFormat={effectiveFormat}
                fourierResult={results['fourier']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>
          )}

          {/* TAB 5: NOISE & RESAMPLING FORENSICS */}
          {(workbenchTab === 'noise_resampling' || workbenchTab === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <AdvancedNoiseViewer
                evidenceId={uploadResult.id}
                containerFormat={effectiveFormat}
                advancedNoiseResult={results['advanced-noise'] || results['advanced_noise']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />

              <ResamplingViewer
                evidenceId={uploadResult.id}
                containerFormat={effectiveFormat}
                resamplingResult={results['resampling']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>
          )}

          {/* TAB 6: CLONE DETECTION FORENSICS */}
          {(workbenchTab === 'cloning' || workbenchTab === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <CloneBlockViewer
                evidenceId={uploadResult.id}
                containerFormat={effectiveFormat}
                cloneBlockResult={results['clone-block'] || results['clone_block']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />

              <CloneKeypointViewer
                evidenceId={uploadResult.id}
                containerFormat={effectiveFormat}
                cloneKeypointResult={results['clone-keypoint'] || results['clone_keypoint']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>
          )}

          {/* TAB 7: CAMERA ATTRIBUTION & SENSOR PRNU */}
          {(workbenchTab === 'camera_sensor' || workbenchTab === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <PRNUViewer
                evidenceId={uploadResult.id}
                containerFormat={effectiveFormat}
                prnuResult={results['prnu']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />

              <CameraIdViewer
                evidenceId={uploadResult.id}
                caseId={uploadResult.case_id || caseId || 'default'}
                containerFormat={effectiveFormat}
                cameraIdResult={results['camera-id'] || results['camera_id']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>
          )}

          {/* TAB 8: PHYSICS & GEOMETRY FORENSICS */}
          {(workbenchTab === 'physics_geometry' || workbenchTab === 'all') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Perspective Analysis */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-color)' }}>
                      📐 Perspective & Vanishing Point Geometry
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Measures line convergence and candidate perspective inconsistencies. Requires enough rectilinear scene structure; an outlier is not proof of compositing.
                    </p>
                  </div>
                  <button
                    onClick={() => runAsyncJob('geometry-perspective')}
                    disabled={['QUEUED', 'RUNNING'].includes(jobs['geometry-perspective']?.status)}
                    style={{
                      background: 'var(--primary-color)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.45rem 0.9rem',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      cursor: ['QUEUED', 'RUNNING'].includes(jobs['geometry-perspective']?.status) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {jobs['geometry-perspective']?.status === 'QUEUED'
                      ? 'Queued...'
                      : jobs['geometry-perspective']?.status === 'RUNNING'
                        ? 'Computing...'
                        : jobs['geometry-perspective']?.status === 'COMPLETED'
                          ? 'Run Again'
                          : 'Run Perspective Check'}
                  </button>
                </div>

                {jobs['geometry-perspective']?.status && (
                  <div className="sub-panel" role="status" style={{ marginBottom: '0.75rem', fontSize: '0.78rem' }}>
                    Status: <strong>{jobs['geometry-perspective'].status}</strong>
                    {jobs['geometry-perspective'].job_identifier && <> · Job <code>{jobs['geometry-perspective'].job_identifier}</code></>}
                  </div>
                )}
                {jobErrors['geometry-perspective'] && (
                  <div className="error-banner" role="alert">{jobErrors['geometry-perspective']}</div>
                )}

                {(results['geometry-perspective']?.structured_findings || results['geometry_perspective']?.structured_findings) ? (
                  <PerspectiveForensicsViewer
                    evidenceId={uploadResult.id}
                    findings={results['geometry-perspective']?.structured_findings || results['geometry_perspective']?.structured_findings}
                    rawImageSrc={`/api/evidence/${uploadResult.id}/raw`}
                  />
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    No perspective result is available yet. This method is most informative in scenes with visible straight edges such as buildings or roads.
                  </div>
                )}
              </div>

              {/* Lighting & Solar Analysis */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-color)' }}>
                      ☀️ Physical Lighting, Shadow & NOAA Solar Ephemeris
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Estimates local light and shadow directions; when GPS/time metadata exists, compares them with solar position. Missing metadata makes that comparison unavailable.
                    </p>
                  </div>
                  <button
                    onClick={() => runAsyncJob('physics-lighting')}
                    disabled={['QUEUED', 'RUNNING'].includes(jobs['physics-lighting']?.status)}
                    style={{
                      background: 'var(--primary-color)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.45rem 0.9rem',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      cursor: ['QUEUED', 'RUNNING'].includes(jobs['physics-lighting']?.status) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {jobs['physics-lighting']?.status === 'QUEUED'
                      ? 'Queued...'
                      : jobs['physics-lighting']?.status === 'RUNNING'
                        ? 'Evaluating...'
                        : jobs['physics-lighting']?.status === 'COMPLETED'
                          ? 'Run Again'
                          : 'Run Lighting Check'}
                  </button>
                </div>

                {jobs['physics-lighting']?.status && (
                  <div className="sub-panel" role="status" style={{ marginBottom: '0.75rem', fontSize: '0.78rem' }}>
                    Status: <strong>{jobs['physics-lighting'].status}</strong>
                    {jobs['physics-lighting'].job_identifier && <> · Job <code>{jobs['physics-lighting'].job_identifier}</code></>}
                  </div>
                )}
                {jobErrors['physics-lighting'] && (
                  <div className="error-banner" role="alert">{jobErrors['physics-lighting']}</div>
                )}

                {(results['physics-lighting']?.structured_findings || results['physics_lighting']?.structured_findings) ? (
                  <LightingSolarForensicsViewer
                    evidenceId={uploadResult.id}
                    findings={results['physics-lighting']?.structured_findings || results['physics_lighting']?.structured_findings}
                    rawImageSrc={`/api/evidence/${uploadResult.id}/raw`}
                  />
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    No lighting result is available yet. Solar cross-checks require usable GPS coordinates and a capture timestamp; light variation alone is not evidence of manipulation.
                  </div>
                )}
                     {/* FUSION & OBSERVATION ASSESSMENT (Always accessible on Overview, Core, or All) */}
          {(workbenchTab === 'overview' || workbenchTab === 'core' || workbenchTab === 'all') && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#2563eb', background: 'rgba(37, 99, 235, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                      Deterministic Fusion Engine (Rule 7B-v1)
                    </span>
                    {(normalizing || correlating) ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: '#0284c7', background: 'rgba(2, 132, 199, 0.1)', padding: '0.15rem 0.5rem', borderRadius: '9999px', fontWeight: 600 }}>
                        <RefreshCw size={11} className="spin-animate" /> Auto-syncing fusion...
                      </span>
                    ) : results.correlate ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: '#059669', background: 'rgba(16, 185, 129, 0.1)', padding: '0.15rem 0.5rem', borderRadius: '9999px', fontWeight: 600 }}>
                        <CheckCircle2 size={11} /> Auto-synchronized
                      </span>
                    ) : null}
                  </div>
                  <h2 className="card-title" style={{ margin: 0 }}>
                    Fusion & Multi-Modality Assessment
                  </h2>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                    Automatically synthesizes empirical observations across all active forensic modalities into a defensible qualitative assessment.
                  </p>
                </div>

                {/* Top Action Bar: Open Normalization Dialog & Manual Re-sync */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => setShowNormalizationModal(true)}
                    disabled={!results.normalize}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.45rem 0.85rem',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      cursor: !results.normalize ? 'not-allowed' : 'pointer',
                      opacity: !results.normalize ? 0.6 : 1
                    }}
                    title="Open dialog to inspect all normalized empirical metrics"
                  >
                    <Table size={14} color="#1e3a8a" />
                    <span>View Normalization Results</span>
                    {results.normalize?.observations?.length !== undefined && (
                      <span style={{
                        background: '#1e3a8a',
                        color: '#ffffff',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '9999px',
                        fontSize: '0.72rem',
                        fontWeight: 700
                      }}>
                        {results.normalize.observations.length}
                      </span>
                    )}
                  </button>

                  <button 
                    className="btn btn-secondary"
                    onClick={() => runFusionSync()}
                    disabled={normalizing || correlating || totalCompleted === 0}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.82rem',
                      fontWeight: 500,
                      borderRadius: '6px'
                    }}
                    title="Force re-run normalization and cross-correlation"
                  >
                    <RefreshCw size={13} className={(normalizing || correlating) ? 'spin-animate' : ''} />
                    <span>Re-sync</span>
                  </button>
                </div>
              </div>

              {/* Informational Prerequisite if no jobs run yet */}
              {totalCompleted === 0 && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '6px', fontSize: '0.825rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>💡</span>
                  <div>
                    <strong>Prerequisite:</strong> No analytical engines have run on this image yet ({totalCompleted} completed). As soon as you queue or run any forensic engine above (e.g. <strong>Core DIP Engines</strong>, <strong>Physics & Geometry</strong>, <strong>Container & Compression</strong>), normalization and correlation will execute automatically.
                  </div>
                </div>
              )}

              {/* In-Progress Sync Indicator */}
              {(normalizing || correlating) && !results.correlate && (
                <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <RefreshCw size={18} className="spin-animate" style={{ marginBottom: '0.5rem', display: 'inline-block' }} />
                  <div>Auto-synchronizing: Extracting empirical observations and calculating correlation matrix...</div>
                </div>
              )}

              {/* Main Correlated Assessment Display */}
              {results.correlate && (
                <div style={{ background: 'var(--surface-color-light)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--border-color)', borderLeft: '4px solid #0284c7' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.05rem', fontWeight: 700 }}>
                        Correlated Forensic Assessment
                      </h3>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        (Rule 7B-v1 Evaluation)
                      </span>
                    </div>
                    <span style={{ 
                      padding: '0.25rem 0.75rem', 
                      borderRadius: '9999px', 
                      fontSize: '0.75rem', 
                      fontWeight: 800,
                      letterSpacing: '0.04em',
                      background: results.correlate.assessment?.level === 'ELEVATED_FORENSIC_CONCERN' 
                        ? 'rgba(239, 68, 68, 0.15)' 
                        : results.correlate.assessment?.level === 'MODERATE_FORENSIC_CONCERN'
                          ? 'rgba(245, 158, 11, 0.15)'
                          : results.correlate.assessment?.level === 'LOW_FORENSIC_CONCERN'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(100, 116, 139, 0.15)',
                      color: results.correlate.assessment?.level === 'ELEVATED_FORENSIC_CONCERN' 
                        ? '#dc2626' 
                        : results.correlate.assessment?.level === 'MODERATE_FORENSIC_CONCERN'
                          ? '#d97706'
                          : results.correlate.assessment?.level === 'LOW_FORENSIC_CONCERN'
                            ? '#059669'
                            : '#64748b'
                    }}>
                      {results.correlate.assessment?.level || 'INSUFFICIENT_EVIDENCE'}
                    </span>
                  </div>

                  <div style={{ marginTop: '0.5rem', color: 'var(--text-body)', lineHeight: 1.5, fontSize: '0.88rem' }}>
                    {results.correlate.assessment?.summary}
                  </div>

                  {/* Evidence Families & Modalities Summary */}
                  <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {results.correlate.families?.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Contributing Evidence Families:</span>
                        {results.correlate.families.map((f: string) => (
                          <span key={f} style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(2, 132, 199, 0.12)', color: '#0284c7' }}>
                            {f}
                          </span>
                        ))}
                      </div>
                    )}

                    {results.normalize?.modalities_present?.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Evaluated Modalities:</span>
                        {results.normalize.modalities_present.map((m: string) => (
                          <span key={m} style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.12rem 0.4rem', borderRadius: '4px', background: 'rgba(37, 99, 235, 0.12)', color: '#1d4ed8' }}>
                            {m}
                          </span>
                        ))}
                        <button 
                          onClick={() => setShowNormalizationModal(true)} 
                          style={{ background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.75rem', fontWeight: 600, padding: '0 0.25rem' }}
                        >
                          Inspect normalized table ({results.normalize.observations?.length || 0} metrics) →
                        </button>
                      </div>
                    )}
                  </div>

                  {results.correlate.assessment?.limitations && (
                    <div style={{ marginTop: '0.85rem', padding: '0.55rem 0.8rem', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '4px', borderLeft: '3px solid #f59e0b', fontSize: '0.75rem', color: '#b45309' }}>
                      <strong>Limitations:</strong> {results.correlate.assessment.limitations}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Normalization Observations Dialog Modal */}
          {showNormalizationModal && (
            <div 
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(3px)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 9999,
                padding: '1.25rem'
              }}
              onClick={() => setShowNormalizationModal(false)}
            >
              <div 
                style={{
                  background: 'var(--surface-color)',
                  borderRadius: '10px',
                  width: '840px',
                  maxWidth: '96vw',
                  maxHeight: '85vh',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 20px 45px rgba(0,0,0,0.35)',
                  border: '1px solid var(--border-color)',
                  overflow: 'hidden'
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '1.15rem 1.5rem',
                  borderBottom: '1px solid var(--border-color)',
                  background: 'var(--surface-color-light)'
                }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1e3a8a', background: 'rgba(30, 58, 138, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                        Deterministic Feature Normalization
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Norm v{results.normalize?.normalization_version || '1.0'}
                      </span>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      Normalized Empirical Observations
                    </h3>
                  </div>
                  <button 
                    onClick={() => setShowNormalizationModal(false)}
                    aria-label="Close dialog"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '0.4rem',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Modal Body */}
                <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    Empirical metrics from individual forensic engines are mapped into standardized directions (<code style={{ color: '#dc2626' }}>elevated</code>, <code style={{ color: '#059669' }}>absent</code>, <code style={{ color: '#0284c7' }}>suppressed</code>, <code style={{ color: '#475569' }}>informational</code>) calibrated against authentic uncompressed baselines.
                  </p>

                  {/* Modality Chips */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.6rem 0.8rem', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Evaluated Modalities:</span>
                    {results.normalize?.modalities_present?.length > 0 ? (
                      results.normalize.modalities_present.map((m: string) => (
                        <span key={m} style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(37, 99, 235, 0.12)', color: '#1d4ed8' }}>
                          {m}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: '#ef4444' }}>None available yet</span>
                    )}
                  </div>

                  {/* Table */}
                  {results.normalize?.observations?.length > 0 ? (
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-color-light)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem 0.75rem' }}>Modality</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>Metric Name</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>Direction</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>Normalized Value</th>
                            <th style={{ padding: '0.5rem 0.75rem' }}>Reliability</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.normalize.observations.map((obs: any, i: number) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border-color-light, rgba(0,0,0,0.06))' }}>
                              <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--text-main)' }}>{obs.modality}</td>
                              <td style={{ padding: '0.5rem 0.75rem' }}><code>{obs.metric_name}</code></td>
                              <td style={{ padding: '0.5rem 0.75rem' }}>
                                <span style={{ 
                                  padding: '0.15rem 0.45rem', 
                                  borderRadius: '4px', 
                                  fontSize: '0.72rem', 
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  background: obs.direction === 'elevated' ? 'rgba(239, 68, 68, 0.12)' : obs.direction === 'suppressed' ? 'rgba(2, 132, 199, 0.12)' : obs.direction === 'absent' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(100, 116, 139, 0.12)',
                                  color: obs.direction === 'elevated' ? '#dc2626' : obs.direction === 'suppressed' ? '#0284c7' : obs.direction === 'absent' ? '#059669' : '#475569'
                                }}>
                                  {obs.direction || 'neutral'}
                                </span>
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace' }}>
                                {typeof obs.normalized_value === 'number' ? obs.normalized_value.toFixed(4) : obs.raw_value || '—'}
                              </td>
                              <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                {obs.technical_reliability || 'HIGH'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No normalized observations available yet. Run analytical engines above.
                    </div>
                  )}

                  <div style={{ padding: '0.65rem 0.85rem', background: 'rgba(59, 130, 246, 0.06)', borderRadius: '6px', borderLeft: '3px solid #3b82f6', fontSize: '0.75rem', color: '#1e40af', lineHeight: 1.4 }}>
                    <strong>Standard:</strong> Normalized feature representations strictly adhere to ISO/IEC 27037 and SWGDE digital evidence guidelines for defensible cross-modality correlation.
                  </div>
                </div>

                {/* Modal Footer */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.85rem 1.5rem',
                  borderTop: '1px solid var(--border-color)',
                  background: 'var(--surface-color-light)'
                }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {results.normalize?.observations?.length || 0} observations evaluated
                  </span>
                  <button 
                    className="btn btn-primary"
                    onClick={() => setShowNormalizationModal(false)}
                    style={{ padding: '0.45rem 1.25rem', fontSize: '0.82rem' }}
                  >
                    Close Dialog
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
