import { useEffect, useState, useCallback, useRef, lazy } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../api';
import EvidenceIntegrityCard from '../components/evidence/EvidenceIntegrityCard';
import AnalysisJobCard from '../components/evidence/AnalysisJobCard';
import AuthenticatedImage from '../components/evidence/AuthenticatedImage';
const AdvancedJpegViewer = lazy(() => import('../components/evidence/AdvancedJpegViewer'));
const CompressionHistoryViewer = lazy(() => import('../components/evidence/CompressionHistoryViewer'));
const BlockingArtifactViewer = lazy(() => import('../components/evidence/BlockingArtifactViewer'));
const HistogramViewer = lazy(() => import('../components/evidence/HistogramViewer'));
const ColorChannelViewer = lazy(() => import('../components/evidence/ColorChannelViewer'));
const FourierViewer = lazy(() => import('../components/evidence/FourierViewer'));
const AdvancedNoiseViewer = lazy(() => import('../components/evidence/AdvancedNoiseViewer').then((m) => ({ default: m.AdvancedNoiseViewer })));
const ResamplingViewer = lazy(() => import('../components/evidence/ResamplingViewer').then((m) => ({ default: m.ResamplingViewer })));
const CloneBlockViewer = lazy(() => import('../components/evidence/CloneBlockViewer').then((m) => ({ default: m.CloneBlockViewer })));
const CloneKeypointViewer = lazy(() => import('../components/evidence/CloneKeypointViewer').then((m) => ({ default: m.CloneKeypointViewer })));
const PRNUViewer = lazy(() => import('../components/evidence/PRNUViewer').then((m) => ({ default: m.PRNUViewer })));
const CameraIdViewer = lazy(() => import('../components/evidence/CameraIdViewer').then((m) => ({ default: m.CameraIdViewer })));
const InteractiveVisualInspection = lazy(() => import('../components/evidence/InteractiveVisualInspection'));
const PerspectiveForensicsViewer = lazy(() => import('../components/evidence/PerspectiveForensicsViewer').then((m) => ({ default: m.PerspectiveForensicsViewer })));
const LightingSolarForensicsViewer = lazy(() => import('../components/evidence/LightingSolarForensicsViewer').then((m) => ({ default: m.LightingSolarForensicsViewer })));
import { X, Table, RefreshCw, ShieldCheck, ShieldAlert, AlertTriangle, Cpu, ArrowRight, Info, GitMerge, History } from 'lucide-react';

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
  const navigate = useNavigate();
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

  // Normalization & Correlation Modals & Auto-Fusion State
  const [showNormalizationModal, setShowNormalizationModal] = useState<boolean>(false);
  const [showCorrelationModal, setShowCorrelationModal] = useState<boolean>(false);
  const isSyncingFusionRef = useRef(false);
  const prevCompletedCountRef = useRef<number>(0);
  const savedScrollTopRef = useRef<number>(0);

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

  const handleOpenNormalizeModal = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const container = document.querySelector('.page-container') as HTMLElement | null;
    if (container) {
      savedScrollTopRef.current = container.scrollTop;
    }
    // Open modal immediately without waiting for any network request
    setShowNormalizationModal(true);

    const targetId = uploadResult?.id;
    // If not normalized yet and not normalizing, trigger normalization in background
    if (!results.normalize && !normalizing && targetId) {
      setNormalizing(true);
      fetchApi(`/evidence/${targetId}/fusion/normalize`, { method: 'POST' })
        .then(res => res.ok ? res.json() : null)
        .then(normData => {
          if (normData) {
            setResults((prev: any) => ({ ...prev, normalize: normData }));
          }
        })
        .catch(err => console.error("Auto normalize error", err))
        .finally(() => setNormalizing(false));
    }
  }, [uploadResult?.id, results.normalize, normalizing]);

  const handleCloseNormalizeModal = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowNormalizationModal(false);
    const container = document.querySelector('.page-container') as HTMLElement | null;
    if (container && savedScrollTopRef.current > 0) {
      container.scrollTop = savedScrollTopRef.current;
    }
  }, []);

  const handleOpenCorrelateModal = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const container = document.querySelector('.page-container') as HTMLElement | null;
    if (container) {
      savedScrollTopRef.current = container.scrollTop;
    }
    setShowCorrelationModal(true);

    const targetId = uploadResult?.id;
    if (!results.correlate && !correlating && targetId) {
      setCorrelating(true);
      fetchApi(`/evidence/${targetId}/fusion/correlate`, { method: 'POST' })
        .then(res => res.ok ? res.json() : null)
        .then(corrData => {
          if (corrData) {
            setResults((prev: any) => ({ ...prev, correlate: corrData }));
          }
        })
        .catch(err => console.error("Auto correlate error", err))
        .finally(() => setCorrelating(false));
    }
  }, [uploadResult?.id, results.correlate, correlating]);

  const handleCloseCorrelateModal = useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowCorrelationModal(false);
    const container = document.querySelector('.page-container') as HTMLElement | null;
    if (container && savedScrollTopRef.current > 0) {
      container.scrollTop = savedScrollTopRef.current;
    }
  }, []);

  const handleReCorrelate = useCallback(() => {
    if (!uploadResult?.id || correlating) return;
    setCorrelating(true);
    fetchApi(`/evidence/${uploadResult.id}/fusion/correlate`, { method: 'POST' })
      .then(res => res.ok ? res.json() : null)
      .then(corrData => {
        if (corrData) {
          setResults((prev: any) => ({ ...prev, correlate: corrData }));
        }
      })
      .catch(err => console.error("Re-correlate error", err))
      .finally(() => setCorrelating(false));
  }, [uploadResult?.id, correlating]);

  useEffect(() => {
    if (showNormalizationModal || showCorrelationModal) {
      const container = document.querySelector('.page-container') as HTMLElement | null;
      if (container && savedScrollTopRef.current > 0) {
        container.scrollTop = savedScrollTopRef.current;
      }
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCloseNormalizeModal();
          handleCloseCorrelateModal();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [showNormalizationModal, showCorrelationModal, handleCloseNormalizeModal, handleCloseCorrelateModal]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="secondary-button"
              onClick={() => navigate(`/cases/${caseId}/evidence/${uploadResult.id}/history`)}
              aria-label="Open processing history hypotheses"
            >
              <History size={16} style={{ verticalAlign: 'middle', marginRight: '0.4rem' }} />
              Processing-history hypotheses
            </button>
          </div>
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
            top: 0,
            zIndex: 90,
            background: 'var(--surface-color-solid, #faf7f1)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '0.45rem 0.65rem',
            margin: '0 0 0.5rem 0',
            display: 'flex',
            gap: '0.45rem',
            overflowX: 'auto',
            boxShadow: '0 4px 16px -2px rgba(26, 22, 16, 0.12), 0 2px 6px -1px rgba(26, 22, 16, 0.08)',
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }} title="Adjust transparency of the spatial anomaly overlays on the evidence image">
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

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }} title="Toggle Error Level Analysis compression variance overlay">
                      <input type="checkbox" checked={showElaLayer} onChange={e => setShowElaLayer(e.target.checked)} />
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>
                        ELA Layer ({heatmap.layers?.find(l => l.modality === 'ELA')?.regions?.length || 0})
                      </span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }} title="Toggle Sensor Noise residual inconsistency overlay">
                      <input type="checkbox" checked={showNoiseLayer} onChange={e => setShowNoiseLayer(e.target.checked)} />
                      <span style={{ color: '#06b6d4', fontWeight: 600 }}>
                        Noise Layer ({heatmap.layers?.find(l => l.modality === 'NOISE')?.regions?.length || 0})
                      </span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }} title="Toggle Copy-Move duplicate keypoint cluster overlay">
                      <input type="checkbox" checked={showCloneLayer} onChange={e => setShowCloneLayer(e.target.checked)} />
                      <span style={{ color: '#10b981', fontWeight: 600 }}>
                        Clone Layer ({heatmap.layers?.find(l => l.modality === 'COPY_MOVE')?.regions?.length || 0})
                      </span>
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
                    {heatmap.layers?.map(layer => {
                      if (layer.modality === 'ELA' && !showElaLayer) return null;
                      if (layer.modality === 'NOISE' && !showNoiseLayer) return null;
                      if (layer.modality === 'COPY_MOVE' && !showCloneLayer) return null;

                      const color = layer.modality === 'ELA' ? '#ef4444' : layer.modality === 'NOISE' ? '#06b6d4' : '#10b981';

                      return layer.regions?.map((r, rIdx) => {
                        const rx = r.x * 1000;
                        const ry = r.y * 1000;
                        const rw = r.width * 1000;
                        const rh = r.height * 1000;
                        return (
                          <g key={`${layer.modality}-${rIdx}`}>
                            <rect
                              x={rx}
                              y={ry}
                              width={rw}
                              height={rh}
                              fill={color}
                              fillOpacity={r.intensity * heatmapOpacity * 0.45}
                              stroke={color}
                              strokeWidth="3"
                              strokeDasharray="6 3"
                            />
                            <rect
                              x={rx}
                              y={Math.max(0, ry - 22)}
                              width={Math.min(220, rw)}
                              height={20}
                              fill={color}
                              fillOpacity={Math.max(0.7, heatmapOpacity)}
                              rx={3}
                            />
                            <text
                              x={rx + 6}
                              y={Math.max(0, ry - 22) + 14}
                              fill="#ffffff"
                              fontSize="12"
                              fontWeight="bold"
                              fontFamily="sans-serif"
                            >
                              {layer.modality}: {r.description?.slice(0, 22) || 'Anomaly Zone'}
                            </text>
                          </g>
                        );
                      });
                    })}
                  </svg>

                  {heatmap.composite_regions_count === 0 && (
                    <div style={{
                      position: 'absolute',
                      bottom: '12px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(15, 23, 42, 0.85)',
                      color: '#94a3b8',
                      padding: '0.4rem 0.9rem',
                      borderRadius: '20px',
                      fontSize: '0.75rem',
                      pointerEvents: 'none',
                      backdropFilter: 'blur(4px)',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                      🛡️ Clean Baseline: No spatial anomalies detected across active modalities
                    </div>
                  )}
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
                onResult={handleAnalysisResult}
              />

              <ResamplingViewer
                evidenceId={uploadResult.id}
                containerFormat={effectiveFormat}
                resamplingResult={results['resampling']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
                onResult={handleAnalysisResult}
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
                onResult={handleAnalysisResult}
              />

              <CloneKeypointViewer
                evidenceId={uploadResult.id}
                containerFormat={effectiveFormat}
                cloneKeypointResult={results['clone-keypoint'] || results['clone_keypoint']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
                onResult={handleAnalysisResult}
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
              </div>
            </div>
            )}
                     {/* FUSION & OBSERVATION ASSESSMENT (Always accessible on Overview, Core, or All) */}
          {/* FUSION & OBSERVATION ASSESSMENT (Always accessible on Overview, Core, or All) */}
          {(workbenchTab === 'overview' || workbenchTab === 'core' || workbenchTab === 'all') && (
            <div className="card" style={{ 
              marginTop: '1.25rem', 
              borderRadius: '14px', 
              border: '1px solid var(--border-color)', 
              boxShadow: '0 4px 24px -2px rgba(26, 22, 16, 0.08)',
              background: 'var(--surface-color)',
              padding: '1.5rem',
              fontFamily: "'Plus Jakarta Sans', var(--font-sans)"
            }}>
              {/* Header with Engine Tags and Re-sync */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
                    <span style={{ 
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.68rem', 
                      fontWeight: 800, 
                      color: '#1e3a8a', 
                      background: 'rgba(30, 58, 138, 0.08)', 
                      border: '1px solid rgba(30, 58, 138, 0.2)',
                      padding: '0.2rem 0.6rem', 
                      borderRadius: '9999px', 
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase' 
                    }}>
                      <Cpu size={12} style={{ color: '#2563eb' }} />
                      Deterministic Fusion Engine (Rule 7B-v1)
                    </span>

                    {(normalizing || correlating) ? (
                      <span style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.35rem', 
                        fontSize: '0.72rem', 
                        color: '#0284c7', 
                        background: 'rgba(2, 132, 199, 0.1)', 
                        border: '1px solid rgba(2, 132, 199, 0.25)',
                        padding: '0.2rem 0.65rem', 
                        borderRadius: '9999px', 
                        fontWeight: 700 
                      }}>
                        <RefreshCw size={11} className="spin-animate" /> Auto-syncing fusion...
                      </span>
                    ) : results.correlate ? (
                      <span style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.4rem', 
                        fontSize: '0.72rem', 
                        color: '#047857', 
                        background: 'rgba(16, 185, 129, 0.1)', 
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '0.2rem 0.65rem', 
                        borderRadius: '9999px', 
                        fontWeight: 700,
                        letterSpacing: '0.01em'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                        Auto-synchronized
                      </span>
                    ) : null}
                  </div>

                  <h2 style={{ 
                    margin: '0 0 0.25rem 0', 
                    fontSize: '1.35rem', 
                    fontWeight: 800, 
                    letterSpacing: '-0.025em',
                    color: 'var(--text-main)',
                    fontFamily: "'Plus Jakarta Sans', var(--font-sans)"
                  }}>
                    Fusion & Multi-Modality Assessment
                  </h2>
                  <p style={{ 
                    fontSize: '0.85rem', 
                    color: 'var(--text-muted)', 
                    margin: 0, 
                    lineHeight: 1.5,
                    letterSpacing: '-0.01em' 
                  }}>
                    Automatically synthesizes empirical observations across all active forensic modalities into a defensible qualitative assessment.
                  </p>
                </div>

                <button 
                  className="btn btn-secondary"
                  onClick={() => runFusionSync()}
                  disabled={normalizing || correlating || totalCompleted === 0}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.5rem 0.9rem',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--surface-color)',
                    color: 'var(--text-main)',
                    cursor: (normalizing || correlating || totalCompleted === 0) ? 'not-allowed' : 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Force re-run normalization and cross-correlation"
                >
                  <RefreshCw size={13} className={(normalizing || correlating) ? 'spin-animate' : ''} />
                  <span>Re-sync</span>
                </button>
              </div>

              {/* Two Large Action Buttons (Command Center Layout) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.35rem' }}>
                <button 
                  type="button"
                  className="btn" 
                  onClick={handleOpenNormalizeModal}
                  style={{ 
                    background: 'linear-gradient(135deg, #091428 0%, #172554 50%, #1e3a8a 100%)', 
                    color: '#ffffff', 
                    padding: '0.9rem 1.35rem', 
                    borderRadius: '10px', 
                    fontWeight: 700, 
                    border: '1px solid rgba(255, 255, 255, 0.15)', 
                    cursor: 'pointer', 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.65rem',
                    boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease',
                    letterSpacing: '-0.01em',
                    position: 'relative'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px -2px rgba(15, 23, 42, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 16px -2px rgba(15, 23, 42, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.2)';
                  }}
                  title="Open modal dialog to view normalized empirical observations"
                >
                  <span style={{
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    color: '#93c5fd',
                    background: 'rgba(37, 99, 235, 0.35)',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    textTransform: 'uppercase'
                  }}>
                    Step 01
                  </span>
                  <Table size={16} style={{ color: '#93c5fd' }} />
                  <span style={{ fontSize: '0.95rem' }}>1. Normalize Observations</span>
                  {normalizing ? (
                    <span style={{ 
                      background: 'rgba(255, 255, 255, 0.2)', 
                      color: '#ffffff', 
                      padding: '0.15rem 0.55rem', 
                      borderRadius: '9999px', 
                      fontSize: '0.72rem', 
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      <RefreshCw size={11} className="spin-animate" /> Syncing
                    </span>
                  ) : results.normalize?.observations?.length !== undefined && (
                    <span style={{ 
                      background: 'rgba(255, 255, 255, 0.2)', 
                      color: '#ffffff', 
                      padding: '0.15rem 0.55rem', 
                      borderRadius: '9999px', 
                      fontSize: '0.74rem', 
                      fontWeight: 700,
                      minWidth: '22px',
                      textAlign: 'center'
                    }}>
                      {results.normalize.observations.length}
                    </span>
                  )}
                </button>

                <button 
                  type="button"
                  className="btn" 
                  onClick={handleOpenCorrelateModal}
                  style={{ 
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 60%, #075985 100%)', 
                    color: '#ffffff', 
                    padding: '0.9rem 1.35rem', 
                    borderRadius: '10px', 
                    fontWeight: 700, 
                    border: '1px solid rgba(255, 255, 255, 0.25)', 
                    cursor: 'pointer', 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.65rem',
                    boxShadow: '0 4px 16px -2px rgba(2, 132, 199, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease',
                    letterSpacing: '-0.01em',
                    position: 'relative'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px -2px rgba(2, 132, 199, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 16px -2px rgba(2, 132, 199, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25)';
                  }}
                  title="Open dialog to view correlated forensic assessment and multi-modality matrix"
                >
                  <span style={{
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    color: '#bae6fd',
                    background: 'rgba(255, 255, 255, 0.22)',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    textTransform: 'uppercase'
                  }}>
                    Step 02
                  </span>
                  <ShieldCheck size={16} style={{ color: '#bae6fd' }} />
                  <span style={{ fontSize: '0.95rem' }}>2. Correlate & Assess</span>
                  {correlating ? (
                    <span style={{ 
                      background: 'rgba(255, 255, 255, 0.2)', 
                      color: '#ffffff', 
                      padding: '0.15rem 0.55rem', 
                      borderRadius: '9999px', 
                      fontSize: '0.72rem', 
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      <RefreshCw size={11} className="spin-animate" /> Correlating
                    </span>
                  ) : results.correlate?.assessment?.level && (
                    <span style={{ 
                      background: 'rgba(255, 255, 255, 0.22)', 
                      color: '#ffffff', 
                      padding: '0.15rem 0.55rem', 
                      borderRadius: '9999px', 
                      fontSize: '0.72rem', 
                      fontWeight: 800,
                      letterSpacing: '0.03em'
                    }}>
                      {String(results.correlate.assessment.level || '').replace(/_FORENSIC_CONCERN/g, '')}
                    </span>
                  )}
                </button>
              </div>

              {/* Informational Prerequisite if no jobs run yet */}
              {totalCompleted === 0 && (
                <div style={{ marginBottom: '1rem', padding: '0.85rem 1.15rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '8px', fontSize: '0.825rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <Info size={17} style={{ color: '#d97706', flexShrink: 0 }} />
                  <div>
                    <strong>Prerequisite:</strong> No analytical engines have run on this image yet ({totalCompleted} completed). As soon as you queue or run any forensic engine above (e.g. <strong>Core DIP Engines</strong>, <strong>Physics & Geometry</strong>, <strong>Container & Compression</strong>), normalization and correlation will execute automatically.
                  </div>
                </div>
              )}

              {/* In-Progress Sync Indicator */}
              {(normalizing || correlating) && !results.correlate && (
                <div style={{ padding: '1.75rem', textAlign: 'center', background: 'var(--surface-color-light)', borderRadius: '10px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <RefreshCw size={20} className="spin-animate" style={{ marginBottom: '0.5rem', display: 'inline-block', color: '#2563eb' }} />
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.2rem' }}>Synthesizing Forensic Correlation Matrix...</div>
                  <div style={{ fontSize: '0.76rem' }}>Normalizing active observations and computing cross-modality confluence</div>
                </div>
              )}

              {/* Main Correlated Assessment Display (Professional Executive Card) */}
              {results.correlate && (() => {
                const concernLevel = results.correlate.assessment?.level || 'INSUFFICIENT_EVIDENCE';
                const isElevated = concernLevel === 'ELEVATED_FORENSIC_CONCERN';
                const isModerate = concernLevel === 'MODERATE_FORENSIC_CONCERN';
                const isLow = concernLevel === 'LOW_FORENSIC_CONCERN';
                
                const levelColor = isElevated ? '#dc2626' : isModerate ? '#d97706' : isLow ? '#059669' : '#64748b';
                const levelBg = isElevated 
                  ? 'rgba(239, 68, 68, 0.12)' 
                  : isModerate 
                    ? 'rgba(245, 158, 11, 0.12)' 
                    : isLow 
                      ? 'rgba(16, 185, 129, 0.12)' 
                      : 'rgba(100, 116, 139, 0.12)';
                const levelBorder = isElevated 
                  ? 'rgba(239, 68, 68, 0.35)' 
                  : isModerate 
                    ? 'rgba(245, 158, 11, 0.35)' 
                    : isLow 
                      ? 'rgba(16, 185, 129, 0.35)' 
                      : 'rgba(100, 116, 139, 0.35)';

                const humanizedLevel = isElevated 
                  ? 'ELEVATED FORENSIC CONCERN' 
                  : isModerate 
                    ? 'MODERATE FORENSIC CONCERN' 
                    : isLow 
                      ? 'LOW / NOMINAL CONCERN' 
                      : 'INSUFFICIENT EVIDENCE';

                return (
                  <div style={{ 
                    background: 'var(--surface-color-light)', 
                    padding: '1.4rem 1.6rem', 
                    borderRadius: '12px', 
                    border: '1px solid var(--border-color)', 
                    borderLeft: `5px solid ${levelColor}`,
                    boxShadow: '0 4px 18px -2px rgba(0, 0, 0, 0.04)',
                    position: 'relative'
                  }}>
                    {/* Header Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{ 
                          width: '32px', 
                          height: '32px', 
                          borderRadius: '8px', 
                          background: levelBg, 
                          border: `1px solid ${levelBorder}`, 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          color: levelColor 
                        }}>
                          {isElevated ? <ShieldAlert size={18} /> : isModerate ? <AlertTriangle size={17} /> : <ShieldCheck size={18} />}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.12rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: "'Plus Jakarta Sans', var(--font-sans)" }}>
                            Correlated Forensic Assessment
                          </h3>
                          <span style={{ 
                            fontSize: '0.7rem', 
                            fontFamily: "'JetBrains Mono', monospace", 
                            color: 'var(--text-muted)', 
                            background: 'rgba(0,0,0,0.04)', 
                            padding: '0.12rem 0.45rem', 
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)' 
                          }}>
                            Rule 7B-v1 Evaluation
                          </span>
                        </div>
                      </div>

                      {/* Polished Executive Status Badge & Dialog Trigger */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div style={{ 
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '0.35rem 0.85rem', 
                          borderRadius: '9999px', 
                          fontSize: '0.75rem', 
                          fontWeight: 800,
                          letterSpacing: '0.04em',
                          background: levelBg,
                          border: `1px solid ${levelBorder}`,
                          color: levelColor,
                          boxShadow: `0 2px 8px ${levelBg}`
                        }}>
                          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: levelColor, boxShadow: `0 0 6px ${levelColor}` }} />
                          <span>{humanizedLevel}</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleOpenCorrelateModal}
                          style={{
                            background: 'var(--surface-color)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: 'var(--text-main)',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--primary-color)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                          title="Open detailed correlation dialog"
                        >
                          <span>Open Dialog</span>
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Summary Statement */}
                    <div style={{ 
                      color: 'var(--text-main)', 
                      lineHeight: 1.6, 
                      fontSize: '0.92rem', 
                      fontWeight: 500,
                      padding: '0.25rem 0 0.85rem 0',
                      letterSpacing: '-0.01em',
                      borderBottom: '1px solid var(--border-color-translucent, rgba(0,0,0,0.06))',
                      marginBottom: '0.95rem'
                    }}>
                      {results.correlate.assessment?.summary}
                    </div>

                    {/* Evidence Families & Modalities Summary */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                      {results.correlate.families?.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Contributing Evidence Families:</span>
                          {results.correlate.families.map((f: string) => (
                            <span key={f} style={{ 
                              fontSize: '0.72rem', 
                              fontWeight: 700, 
                              padding: '0.2rem 0.6rem', 
                              borderRadius: '6px', 
                              background: 'rgba(2, 132, 199, 0.08)', 
                              border: '1px solid rgba(2, 132, 199, 0.22)',
                              color: '#0284c7',
                              letterSpacing: '-0.01em'
                            }}>
                              {f}
                            </span>
                          ))}
                        </div>
                      )}

                      {results.normalize?.modalities_present?.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Evaluated Modalities:</span>
                          {results.normalize.modalities_present.map((m: string) => (
                            <span key={m} style={{ 
                              fontSize: '0.68rem', 
                              fontWeight: 800, 
                              padding: '0.16rem 0.45rem', 
                              borderRadius: '4px', 
                              background: 'rgba(30, 58, 138, 0.08)', 
                              border: '1px solid rgba(30, 58, 138, 0.18)',
                              color: '#1e3a8a',
                              letterSpacing: '0.03em',
                              textTransform: 'uppercase'
                            }}>
                              {m}
                            </span>
                          ))}
                          <button 
                            type="button"
                            onClick={handleOpenNormalizeModal}
                            style={{ 
                              background: 'transparent', 
                              border: 'none', 
                              color: '#2563eb', 
                              cursor: 'pointer', 
                              fontSize: '0.78rem', 
                              fontWeight: 700, 
                              padding: '0.15rem 0.4rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              textDecoration: 'none',
                              transition: 'color 0.15s ease'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#1d4ed8')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#2563eb')}
                          >
                            <span>Inspect normalized table ({results.normalize.observations?.length || 0} metrics)</span>
                            <ArrowRight size={13} />
                          </button>
                          <span style={{ color: 'var(--border-color)' }}>•</span>
                          <button 
                            type="button"
                            onClick={handleOpenCorrelateModal}
                            style={{ 
                              background: 'transparent', 
                              border: 'none', 
                              color: '#0284c7', 
                              cursor: 'pointer', 
                              fontSize: '0.78rem', 
                              fontWeight: 700, 
                              padding: '0.15rem 0.4rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              textDecoration: 'none',
                              transition: 'color 0.15s ease'
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#0369a1')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#0284c7')}
                          >
                            <span>Open correlation dialog ({results.correlate.relations?.length || 0} relations)</span>
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Evidentiary Limitations & Admissibility Scope Box */}
                    {Boolean(results.correlate.assessment?.limitations) && (() => {
                      const raw = results.correlate.assessment?.limitations;
                      const limitationsText = Array.isArray(raw) ? raw.join(' ') : String(raw || '');
                      if (!limitationsText.trim()) return null;
                      return (
                        <div style={{ 
                          marginTop: '1.1rem', 
                          padding: '0.8rem 1.1rem', 
                          background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.45) 0%, rgba(253, 230, 138, 0.2) 100%)', 
                          borderRadius: '8px', 
                          border: '1px solid rgba(245, 158, 11, 0.3)', 
                          borderLeft: '4px solid #d97706',
                          fontSize: '0.8rem', 
                          color: '#78350f',
                          display: 'flex',
                          gap: '0.65rem',
                          alignItems: 'flex-start'
                        }}>
                          <Info size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: '0.15rem' }} />
                          <div style={{ lineHeight: 1.55 }}>
                            <strong style={{ color: '#92400e', fontWeight: 750, letterSpacing: '0.02em' }}>
                              LIMITATIONS & ADMISSIBILITY SCOPE (ISO/IEC 27037):
                            </strong>{' '}
                            {limitationsText.replace(/observations\.They/g, 'observations. They')}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Normalization Observations Dialog Modal (Portaled to document.body) */}
          {showNormalizationModal && typeof document !== 'undefined' && createPortal(
            <div 
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0, 0, 0, 0.72)',
                backdropFilter: 'blur(3px)',
                WebkitBackdropFilter: 'blur(3px)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 999999,
                padding: '1.25rem',
                boxSizing: 'border-box'
              }}
              onClick={handleCloseNormalizeModal}
            >
              <div 
                style={{
                  background: 'var(--surface-color-solid, #faf7f1)',
                  borderRadius: '12px',
                  width: '860px',
                  maxWidth: '96vw',
                  maxHeight: '88vh',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                  border: '1px solid var(--border-color)',
                  overflow: 'hidden',
                  fontFamily: "'Plus Jakarta Sans', var(--font-sans)"
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (uploadResult?.id) {
                          setNormalizing(true);
                          fetchApi(`/evidence/${uploadResult.id}/fusion/normalize`, { method: 'POST' })
                            .then(res => res.ok ? res.json() : null)
                            .then(normData => {
                              if (normData) setResults((prev: any) => ({ ...prev, normalize: normData }));
                            })
                            .catch(err => console.error("Re-normalize error", err))
                            .finally(() => setNormalizing(false));
                        }
                      }}
                      disabled={normalizing}
                      style={{
                        background: 'var(--surface-color)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '0.3rem 0.65rem',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        cursor: normalizing ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                      title="Re-run normalization"
                    >
                      <RefreshCw size={11} className={normalizing ? 'spin-animate' : ''} />
                      <span>{normalizing ? 'Normalizing...' : 'Re-normalize'}</span>
                    </button>
                    <button 
                      type="button"
                      onClick={handleCloseNormalizeModal}
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
                      <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                        {normalizing ? 'Evaluating modalities...' : 'None evaluated yet'}
                      </span>
                    )}
                  </div>

                  {/* Table or Loading State */}
                  {normalizing ? (
                    <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                      <RefreshCw size={26} className="spin-animate" style={{ color: '#1e3a8a' }} />
                      <div style={{ fontWeight: 600, fontSize: '0.925rem', color: 'var(--text-main)' }}>
                        Normalizing empirical observations...
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Mapping metrics against authentic calibration baselines
                      </div>
                    </div>
                  ) : results.normalize?.observations?.length > 0 ? (
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
                    <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      <p style={{ margin: '0 0 0.75rem 0' }}>No normalized observations available yet.</p>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleOpenNormalizeModal}
                        style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}
                      >
                        Run Normalization Pipeline
                      </button>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {normalizing ? 'Evaluating observations...' : `${results.normalize?.observations?.length || 0} observations evaluated`}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        handleCloseNormalizeModal();
                        handleOpenCorrelateModal();
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#0284c7',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <span>Jump to Step 02: Correlation</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                  <button 
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCloseNormalizeModal}
                    style={{ padding: '0.45rem 1.25rem', fontSize: '0.82rem' }}
                  >
                    Close Dialog
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

          {/* Correlated Assessment & Multi-Modality Synthesis Modal (Portaled to document.body) */}
          {showCorrelationModal && typeof document !== 'undefined' && createPortal(
            <div 
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100vh',
                background: 'rgba(0, 0, 0, 0.72)',
                backdropFilter: 'blur(3px)',
                WebkitBackdropFilter: 'blur(3px)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 999999,
                padding: '1.25rem',
                boxSizing: 'border-box'
              }}
              onClick={handleCloseCorrelateModal}
            >
              <div 
                style={{
                  background: 'var(--surface-color-solid, #faf7f1)',
                  borderRadius: '12px',
                  width: '900px',
                  maxWidth: '96vw',
                  maxHeight: '88vh',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                  border: '1px solid var(--border-color)',
                  overflow: 'hidden',
                  fontFamily: "'Plus Jakarta Sans', var(--font-sans)"
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
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0284c7', background: 'rgba(2, 132, 199, 0.12)', padding: '0.15rem 0.45rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                        Rule 7B-v1 Qualitative Fusion
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        ISO/IEC 27037 Evidence Matrix
                      </span>
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      Correlated Forensic Assessment & Relations
                    </h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={handleReCorrelate}
                      disabled={correlating}
                      style={{
                        background: 'var(--surface-color)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '0.3rem 0.65rem',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: 'var(--text-secondary)',
                        cursor: correlating ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                      title="Re-run correlation evaluation"
                    >
                      <RefreshCw size={11} className={correlating ? 'spin-animate' : ''} />
                      <span>{correlating ? 'Correlating...' : 'Re-correlate'}</span>
                    </button>
                    <button 
                      type="button"
                      onClick={handleCloseCorrelateModal}
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
                </div>

                {/* Modal Body */}
                <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                  {correlating ? (
                    <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                      <RefreshCw size={28} className="spin-animate" style={{ color: '#0284c7' }} />
                      <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                        Synthesizing Multi-Modality Correlation Matrix...
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Evaluating cross-engine concordance, physics consistency, and container integrity
                      </div>
                    </div>
                  ) : results.correlate ? (() => {
                    const concernLevel = results.correlate.assessment?.level || 'INSUFFICIENT_EVIDENCE';
                    const isElevated = concernLevel === 'ELEVATED_FORENSIC_CONCERN';
                    const isModerate = concernLevel === 'MODERATE_FORENSIC_CONCERN';
                    const isLow = concernLevel === 'LOW_FORENSIC_CONCERN';
                    
                    const levelColor = isElevated ? '#dc2626' : isModerate ? '#d97706' : isLow ? '#059669' : '#64748b';
                    const levelBg = isElevated 
                      ? 'rgba(239, 68, 68, 0.08)' 
                      : isModerate 
                        ? 'rgba(245, 158, 11, 0.08)' 
                        : isLow 
                          ? 'rgba(16, 185, 129, 0.08)' 
                          : 'rgba(100, 116, 139, 0.08)';
                    const levelBorder = isElevated 
                      ? 'rgba(239, 68, 68, 0.28)' 
                      : isModerate 
                        ? 'rgba(245, 158, 11, 0.28)' 
                        : isLow 
                          ? 'rgba(16, 185, 129, 0.28)' 
                          : 'rgba(100, 116, 139, 0.28)';

                    const humanizedLevel = isElevated 
                      ? 'ELEVATED FORENSIC CONCERN' 
                      : isModerate 
                        ? 'MODERATE FORENSIC CONCERN' 
                        : isLow 
                          ? 'LOW / NOMINAL CONCERN' 
                          : 'INSUFFICIENT EVIDENCE';

                    return (
                      <>
                        {/* Executive Assessment Hero Banner */}
                        <div style={{
                          background: levelBg,
                          border: `1px solid ${levelBorder}`,
                          borderLeft: `5px solid ${levelColor}`,
                          borderRadius: '10px',
                          padding: '1.15rem 1.35rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.65rem'
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                background: '#ffffff',
                                border: `1px solid ${levelBorder}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: levelColor
                              }}>
                                {isElevated ? <ShieldAlert size={18} /> : isModerate ? <AlertTriangle size={17} /> : <ShieldCheck size={18} />}
                              </div>
                              <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Synthesized Assessment
                                </div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: levelColor }}>
                                  {humanizedLevel}
                                </div>
                              </div>
                            </div>
                            <span style={{ 
                              fontSize: '0.7rem', 
                              fontFamily: "'JetBrains Mono', monospace", 
                              color: 'var(--text-muted)', 
                              background: 'var(--surface-color)', 
                              padding: '0.2rem 0.5rem', 
                              borderRadius: '4px',
                              border: '1px solid var(--border-color)' 
                            }}>
                              Rule {results.correlate.assessment?.rule_version || '7B-v1'}
                            </span>
                          </div>

                          <div style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: 1.6, fontWeight: 500 }}>
                            {results.correlate.assessment?.summary}
                          </div>
                        </div>

                        {/* Contributing Families & Evaluated Modalities Chips */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                          <div style={{ padding: '0.75rem 0.95rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                              Contributing Evidence Families ({results.correlate.families?.length || 0})
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {results.correlate.families?.length > 0 ? results.correlate.families.map((f: string) => (
                                <span key={f} style={{ 
                                  fontSize: '0.72rem', 
                                  fontWeight: 700, 
                                  padding: '0.2rem 0.55rem', 
                                  borderRadius: '5px', 
                                  background: 'rgba(2, 132, 199, 0.1)', 
                                  border: '1px solid rgba(2, 132, 199, 0.22)',
                                  color: '#0284c7'
                                }}>
                                  {f}
                                </span>
                              )) : (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No families active</span>
                              )}
                            </div>
                          </div>

                          <div style={{ padding: '0.75rem 0.95rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                              Evaluated Modalities ({results.normalize?.modalities_present?.length || 0})
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {results.normalize?.modalities_present?.length > 0 ? results.normalize.modalities_present.map((m: string) => (
                                <span key={m} style={{ 
                                  fontSize: '0.7rem', 
                                  fontWeight: 800, 
                                  padding: '0.18rem 0.45rem', 
                                  borderRadius: '4px', 
                                  background: 'rgba(30, 58, 138, 0.08)', 
                                  border: '1px solid rgba(30, 58, 138, 0.18)',
                                  color: '#1e3a8a',
                                  textTransform: 'uppercase'
                                }}>
                                  {m}
                                </span>
                              )) : (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>None evaluated</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Inter-Modality Relations & Corroborations */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                              <GitMerge size={15} style={{ color: '#0284c7' }} />
                              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                Cross-Modality Corroboration & Conflict Matrix
                              </h4>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                              {results.correlate.relations?.length || 0} relations identified
                            </span>
                          </div>

                          {results.correlate.relations?.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                              {results.correlate.relations.map((rel: any, idx: number) => {
                                const isCorroborating = rel.relation_type === 'CORROBORATING';
                                const isContradicting = rel.relation_type === 'CONTRADICTING';
                                const relBadgeColor = isCorroborating ? '#059669' : isContradicting ? '#dc2626' : '#0284c7';
                                const relBadgeBg = isCorroborating ? 'rgba(16, 185, 129, 0.1)' : isContradicting ? 'rgba(239, 68, 68, 0.1)' : 'rgba(2, 132, 199, 0.1)';

                                return (
                                  <div key={idx} style={{
                                    padding: '0.85rem 1rem',
                                    borderRadius: '8px',
                                    background: 'var(--surface-color-light)',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.4rem'
                                  }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{
                                          fontSize: '0.7rem',
                                          fontWeight: 800,
                                          padding: '0.15rem 0.5rem',
                                          borderRadius: '4px',
                                          background: relBadgeBg,
                                          color: relBadgeColor,
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.04em'
                                        }}>
                                          {rel.relation_type || 'INDEPENDENT'}
                                        </span>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                          Strength: <strong style={{ color: 'var(--text-main)' }}>{rel.strength || 'MEDIUM'}</strong>
                                        </span>
                                      </div>
                                      <span style={{ fontSize: '0.68rem', color: 'var(--text-subtle)', fontFamily: 'monospace' }}>
                                        obs #{rel.observation_a_id} ↔ #{rel.observation_b_id}
                                      </span>
                                    </div>

                                    <div style={{ fontSize: '0.825rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                                      {rel.explanation}
                                    </div>

                                    {rel.limitations && (
                                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', borderTop: '1px dashed var(--border-color)', paddingTop: '0.35rem', marginTop: '0.2rem' }}>
                                        <strong>Scope:</strong> {rel.limitations}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              🛡️ Clean Baseline: Evaluated modalities do not exhibit contradictory signals or mutual anomaly reinforcement.
                            </div>
                          )}
                        </div>

                        {/* Contributing Observations (if any) */}
                        {Array.isArray(results.correlate.assessment?.contributing_observations) && results.correlate.assessment.contributing_observations.length > 0 && (
                          <div style={{ padding: '0.75rem 0.95rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.04em' }}>
                              Primary Contributing Observations ({results.correlate.assessment.contributing_observations.length})
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                              {results.correlate.assessment.contributing_observations.map((obs: any, i: number) => (
                                <span key={i} style={{ 
                                  fontSize: '0.7rem', 
                                  fontWeight: 600, 
                                  padding: '0.2rem 0.5rem', 
                                  borderRadius: '4px', 
                                  background: 'var(--surface-color)', 
                                  border: '1px solid var(--border-color)',
                                  color: 'var(--text-main)'
                                }}>
                                  {typeof obs === 'object' ? `${obs.modality || ''} ${obs.metric_name || ''}`.trim() : String(obs)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Legal & ISO Limitations Banner */}
                        <div style={{ 
                          padding: '0.8rem 1rem', 
                          background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.45) 0%, rgba(253, 230, 138, 0.2) 100%)', 
                          borderRadius: '8px', 
                          border: '1px solid rgba(245, 158, 11, 0.3)', 
                          borderLeft: '4px solid #d97706',
                          fontSize: '0.78rem', 
                          color: '#78350f',
                          display: 'flex',
                          gap: '0.65rem',
                          alignItems: 'flex-start'
                        }}>
                          <Info size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: '0.15rem' }} />
                          <div style={{ lineHeight: 1.5 }}>
                            <strong style={{ color: '#92400e', fontWeight: 750 }}>
                              ISO/IEC 27037 ADMISSIBILITY NOTICE:
                            </strong>{' '}
                            {Array.isArray(results.correlate.assessment?.limitations) 
                              ? results.correlate.assessment.limitations.join(' ') 
                              : String(results.correlate.assessment?.limitations || 'Observations are qualitative assessments synthesized from empirical digital forensic algorithms, not absolute binary proof. Examiner corroboration required.')}
                          </div>
                        </div>
                      </>
                    );
                  })() : (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      <p style={{ margin: '0 0 0.75rem 0' }}>No correlation assessment generated yet.</p>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleReCorrelate}
                        style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}
                      >
                        Run Correlation Engine
                      </button>
                    </div>
                  )}
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
                  <button
                    type="button"
                    onClick={() => {
                      handleCloseCorrelateModal();
                      handleOpenNormalizeModal();
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#2563eb',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <span>View Step 01: Normalized Metrics Table</span>
                    <ArrowRight size={13} />
                  </button>

                  <button 
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCloseCorrelateModal}
                    style={{ padding: '0.45rem 1.25rem', fontSize: '0.82rem' }}
                  >
                    Close Dialog
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}
