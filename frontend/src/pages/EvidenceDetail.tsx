import { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { fetchApi } from '../api';
import EvidenceIntegrityCard from '../components/evidence/EvidenceIntegrityCard';
import AnalysisJobCard from '../components/evidence/AnalysisJobCard';
import AuthenticatedImage from '../components/evidence/AuthenticatedImage';
import GuidedExaminationWorkflow, { FORENSIC_EXAMINATION_CATALOGUE } from '../components/evidence/GuidedExaminationWorkflow';
import UnifiedForensicResults from '../components/evidence/UnifiedForensicResults';
import { EvidenceDetailSkeleton } from '../components/common/LoadingStates';
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
import { X, Table, RefreshCw, ShieldCheck, ShieldAlert, AlertTriangle, Cpu, ArrowRight, Info, GitMerge, History, Sparkles } from 'lucide-react';
import ForensicLabTour from '../components/evidence/ForensicLabTour';

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

interface HeatmapDensityCell {
  id: number;
  row: number;
  column: number;
  proposalCount: number;
  countsByModality: Record<string, number>;
  sampleRegions: HeatmapRegion[];
}

type WorkbenchTabId = 'overview' | 'visual_inspection' | 'physics_geometry' | 'core' | 'compression' | 'color_spectrum' | 'noise_resampling' | 'cloning' | 'camera_sensor' | 'all';

const HEATMAP_DENSITY_GRID_SIZE = 40;
const HEATMAP_DENSITY_THRESHOLD = 250;

const getVisibleHeatmapRegions = (regions: HeatmapRegion[], limit: number | 'all') => {
  const sortedRegions = [...regions].sort((a, b) => b.intensity - a.intensity);
  return limit === 'all' ? sortedRegions : sortedRegions.slice(0, limit);
};

const buildHeatmapDensityCells = (
  layers: ModalityLayer[],
  isLayerVisible: (modality: string) => boolean,
): HeatmapDensityCell[] => {
  const cells = new Map<number, HeatmapDensityCell>();

  for (const layer of layers) {
    if (!isLayerVisible(layer.modality)) continue;

    for (const region of layer.regions) {
      if (![region.x, region.y, region.width, region.height].every(Number.isFinite)) continue;

      const centerX = Math.min(0.999999, Math.max(0, region.x + region.width / 2));
      const centerY = Math.min(0.999999, Math.max(0, region.y + region.height / 2));
      const column = Math.floor(centerX * HEATMAP_DENSITY_GRID_SIZE);
      const row = Math.floor(centerY * HEATMAP_DENSITY_GRID_SIZE);
      const id = row * HEATMAP_DENSITY_GRID_SIZE + column;
      let cell = cells.get(id);

      if (!cell) {
        cell = { id, row, column, proposalCount: 0, countsByModality: {}, sampleRegions: [] };
        cells.set(id, cell);
      }

      cell.proposalCount += 1;
      cell.countsByModality[layer.modality] = (cell.countsByModality[layer.modality] ?? 0) + 1;
      if (!cell.sampleRegions.some(sample => sample.modality === layer.modality)) {
        cell.sampleRegions.push(region);
      }
    }
  }

  return [...cells.values()].sort((a, b) => a.id - b.id);
};

export default function EvidenceDetail() {
  const { caseId, evidenceId } = useParams<{ caseId: string, evidenceId: string }>();
  const navigate = useNavigate();
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [forensicLabTourOpen, setForensicLabTourOpen] = useState(() => {
    try {
      return localStorage.getItem('forensight_forensic_lab_tour_seen') !== 'true';
    } catch (error) {
      console.warn('Could not read Forensic Lab tour preference from browser storage.', error);
      return true;
    }
  });
  
  const [jobs, setJobs] = useState<any>({});
  const [results, setResults] = useState<any>({});
  const [jobErrors, setJobErrors] = useState<Record<string, string>>({});

  const [normalizing, setNormalizing] = useState(false);
  const [correlating, setCorrelating] = useState(false);

  // Heatmap state
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(0.3);
  const [overlayRegionLimit, setOverlayRegionLimit] = useState<number | 'all'>(100);
  const [heatmapDisplayMode, setHeatmapDisplayMode] = useState<'auto' | 'density' | 'regions'>('auto');
  const [selectedDensityCellId, setSelectedDensityCellId] = useState<number | null>(null);
  const [selectedHeatmapRegion, setSelectedHeatmapRegion] = useState<HeatmapRegion | null>(null);
  const [showElaLayer, setShowElaLayer] = useState<boolean>(true);
  const [showNoiseLayer, setShowNoiseLayer] = useState<boolean>(true);
  const [showCloneLayer, setShowCloneLayer] = useState<boolean>(true);

  const updateHeatmap = useCallback((data: HeatmapData | null) => {
    setHeatmap(data);
    setSelectedDensityCellId(null);
    setSelectedHeatmapRegion(null);
  }, []);

  // Custody quick verify state
  const [verifyingCustody, setVerifyingCustody] = useState(false);
  const [custodyResult, setCustodyResult] = useState<any | null>(null);
  const [custodyError, setCustodyError] = useState<string | null>(null);
  const [c2paResult, setC2paResult] = useState<any | null>(null);
  const [checkingC2pa, setCheckingC2pa] = useState(false);

  // Categorized Forensic Workbench active tab
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTabId>('overview');

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
    updateHeatmap(null);
    setCustodyResult(null);
    setCustodyError(null);
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
      .then(hData => updateHeatmap(hData))
      .catch(() => {});
  };

  const closeForensicLabTour = () => {
    setForensicLabTourOpen(false);
    try {
      localStorage.setItem('forensight_forensic_lab_tour_seen', 'true');
    } catch (error) {
      console.warn('Could not save Forensic Lab tour preference to browser storage.', error);
    }
  };

  const handleAnalysisResult = (slug: string, data: any) => {
    const key = slug.toLowerCase();
    const hypKey = key.replace(/_/g, '-');
    setResults((prev: any) => ({ ...prev, [key]: data, [hypKey]: data }));
    if (uploadResult?.id) {
      fetchApi(`/evidence/${uploadResult.id}/heatmap`)
        .then(r => r.json())
        .then(h => updateHeatmap(h))
        .catch(() => {});
      runFusionSync(uploadResult.id);
    }
  };

  useEffect(() => {
    if (evidenceId && evidenceId !== 'new' && evidenceId !== 'upload') {
      fetchEvidenceAndJobs(evidenceId);
    }
  }, [evidenceId]);

  // Automatically poll any jobs that are in RUNNING or QUEUED state
  useEffect(() => {
    const activeJobs: [string, any][] = (Object.entries(jobs) as [string, any][]).filter(
      ([_, j]) => j && (j.status === 'RUNNING' || j.status === 'QUEUED')
    );
    if (activeJobs.length === 0) return;

    const timer = setInterval(async () => {
      for (const [analysisType, jobObj] of activeJobs) {
        const j = jobObj as any;
        try {
          const pollRes = await fetchApi(`/jobs/${j.id}`);
          if (pollRes.ok) {
            const updated = await pollRes.json();
            if (updated.status !== j.status) {
              setJobs((prev: any) => ({ ...prev, [analysisType]: updated }));
              if (updated.status === 'COMPLETED' && updated.analysis_id) {
                const resultRes = await fetchApi(`/analysis/${updated.analysis_id}`);
                if (resultRes.ok) {
                  const resData = await resultRes.json();
                  const key = analysisType.toLowerCase();
                  const hypKey = key.replace(/_/g, '-');
                  setResults((prev: any) => ({ ...prev, [key]: resData, [hypKey]: resData }));
                }
                if (uploadResult?.id) {
                  fetchApi(`/evidence/${uploadResult.id}/heatmap`)
                    .then(r => r.json())
                    .then(h => updateHeatmap(h))
                    .catch(() => {});
                  runFusionSync(uploadResult.id);
                }
              }
            }
          }
        } catch {}
      }
    }, 2000);

    return () => clearInterval(timer);
  }, [jobs, uploadResult?.id, updateHeatmap]);

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
          .then(h => updateHeatmap(h))
          .catch(() => {});
        // Auto-run normalization and correlation
        runFusionSync(uploadResult.id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Analysis request failed.';
      setJobErrors(prev => ({ ...prev, [analysisType]: message }));
    }
  };

  const handleBatchQueueJobs = async (analysisTypes: string[]) => {
    if (!uploadResult?.id || analysisTypes.length === 0) return;
    await Promise.allSettled(analysisTypes.map(t => runAsyncJob(t)));
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

  const handleVerifyCustody = async () => {
    if (!uploadResult) return;
    setVerifyingCustody(true);
    setCustodyResult(null);
    setCustodyError(null);
    try {
      const response = await fetchApi(`/evidence/${uploadResult.id}/verify-custody`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Custody verification failed.');
      if (typeof data.status !== 'string' || typeof data.integrity_intact !== 'boolean' || typeof data.verified_at !== 'string') {
        throw new Error('Custody verification returned an incomplete result.');
      }
      setCustodyResult(data);
    } catch (error) {
      setCustodyError(error instanceof Error ? error.message : 'Custody verification failed.');
    } finally {
      setVerifyingCustody(false);
    }
  };

  const hasResult = (key: string) => Boolean(results[key] || results[key.replace('-', '_')] || jobs[key]?.status === 'COMPLETED');
  const effectiveFormat = (uploadResult?.image_format || uploadResult?.mime_type?.split('/')?.[1] || '').toUpperCase();
  const isJpeg = effectiveFormat.includes('JPEG') || effectiveFormat.includes('JPG');

  const coreEngineIds = ['metadata', 'ela', 'noise', 'jpeg-dct', 'copy-move'];
  const compressionEngineIds = ['jpeg-structure', 'jpeg-ghost', 'adjpeg', 'nadjpeg', 'blocking-artifact'];
  const colorEngineIds = ['histogram', 'color-channel', 'fourier'];
  const noiseResamplingEngineIds = ['advanced-noise', 'resampling'];
  const cloningEngineIds = ['clone-block', 'clone-keypoint'];
  const cameraEngineIds = ['prnu', 'camera-id'];
  const physicsGeometryEngineIds = ['geometry-perspective', 'physics-lighting'];
  const isEngineCompatible = (engineId: string) => {
    const exam = FORENSIC_EXAMINATION_CATALOGUE.find(item => item.id === engineId);
    if (!exam || (exam.requiresLossy && !isJpeg)) return false;
    return exam.supportedFormats.includes('ALL') || exam.supportedFormats.some(format => effectiveFormat.includes(format));
  };
  const countGroupResults = (engineIds: string[]) => {
    const compatibleIds = engineIds.filter(isEngineCompatible);
    return {
      completed: compatibleIds.filter(hasResult).length,
      compatible: compatibleIds.length
    };
  };
  const physicsGeometryCounts = countGroupResults(physicsGeometryEngineIds);
  const coreCounts = countGroupResults(coreEngineIds);
  const compressionCounts = countGroupResults(compressionEngineIds);
  const colorCounts = countGroupResults(colorEngineIds);
  const noiseResamplingCounts = countGroupResults(noiseResamplingEngineIds);
  const cloningCounts = countGroupResults(cloningEngineIds);
  const cameraCounts = countGroupResults(cameraEngineIds);
  const groupBadge = (counts: { completed: number; compatible: number }) => counts.compatible > 0 ? `${counts.completed}/${counts.compatible}` : 'N/A';
  const groupStatus = (counts: { completed: number; compatible: number }) => counts.compatible > 0
    ? `${counts.completed} of ${counts.compatible} format-compatible examinations completed`
    : 'No compatible examinations for this file format';
  const totalRegistered = FORENSIC_EXAMINATION_CATALOGUE.length;
  const totalCompleted = FORENSIC_EXAMINATION_CATALOGUE.filter(exam => hasResult(exam.id)).length;
  const totalCandidateRegions = heatmap?.layers.reduce((count, layer) => count + layer.regions.length, 0) ?? 0;

  useEffect(() => {
    if (uploadResult?.id && totalCompleted > 0 && totalCompleted !== prevCompletedCountRef.current) {
      prevCompletedCountRef.current = totalCompleted;
      runFusionSync(uploadResult.id);
    }
  }, [totalCompleted, uploadResult?.id, runFusionSync]);

  const workbenchTabs: Array<{ id: WorkbenchTabId; label: string; icon: string; badge: string; status: string }> = [
    { id: 'overview', label: 'Overview & Attention Heatmap', icon: '🔍', badge: totalCandidateRegions.toLocaleString(), status: `${totalCandidateRegions.toLocaleString()} candidate region envelopes` },
    { id: 'visual_inspection', label: 'Interactive Microscopy & Loupe', icon: '🔬', badge: 'Open', status: 'open the interactive viewer' },
    { id: 'physics_geometry', label: 'Physics & Geometry', icon: '📐', badge: groupBadge(physicsGeometryCounts), status: groupStatus(physicsGeometryCounts) },
    { id: 'core', label: 'Core DIP Engines', icon: '⚙️', badge: groupBadge(coreCounts), status: groupStatus(coreCounts) },
    { id: 'compression', label: 'Container & Compression', icon: '🗜️', badge: groupBadge(compressionCounts), status: groupStatus(compressionCounts) },
    { id: 'color_spectrum', label: 'Color & Spectrum', icon: '🌈', badge: groupBadge(colorCounts), status: groupStatus(colorCounts) },
    { id: 'noise_resampling', label: 'Noise & Resampling', icon: '🔬', badge: groupBadge(noiseResamplingCounts), status: groupStatus(noiseResamplingCounts) },
    { id: 'cloning', label: 'Clone Detection', icon: '👯', badge: groupBadge(cloningCounts), status: groupStatus(cloningCounts) },
    { id: 'camera_sensor', label: 'Camera & Sensor', icon: '📷', badge: groupBadge(cameraCounts), status: groupStatus(cameraCounts) },
    { id: 'all', label: 'All Modalities', icon: '📑', badge: `${totalCompleted}/${totalRegistered}`, status: `${totalCompleted} of ${totalRegistered} registered examinations completed` },
  ];

  const unavailableHeatmapLayers = heatmap?.layers.filter(layer => layer.status !== 'AVAILABLE') ?? [];
  const isHeatmapLayerVisible = (modality: string) =>
    !(modality === 'ELA' && !showElaLayer) &&
    !(modality === 'NOISE' && !showNoiseLayer) &&
    !(modality === 'COPY_MOVE' && !showCloneLayer);
  const visibleHeatmapRegions = useMemo(
    () => new Map<string, HeatmapRegion[]>((heatmap?.layers ?? []).map(layer => [
      layer.modality,
      getVisibleHeatmapRegions(layer.regions, overlayRegionLimit)
    ])),
    [heatmap, overlayRegionLimit]
  );
  const visibleHeatmapRegionEntries = useMemo(
    () => (heatmap?.layers ?? []).flatMap(layer => (
      !((layer.modality === 'ELA' && !showElaLayer) ||
        (layer.modality === 'NOISE' && !showNoiseLayer) ||
        (layer.modality === 'COPY_MOVE' && !showCloneLayer))
        ? (visibleHeatmapRegions.get(layer.modality) ?? []).map(region => ({ modality: layer.modality, region }))
        : []
    )),
    [heatmap, visibleHeatmapRegions, showElaLayer, showNoiseLayer, showCloneLayer]
  );
  const heatmapRegionSequence = useMemo(
    () => new Map(visibleHeatmapRegionEntries.map((entry, index) => [entry.region, index])),
    [visibleHeatmapRegionEntries]
  );
  const densityCells = useMemo(
    () => buildHeatmapDensityCells(heatmap?.layers ?? [], modality =>
      !(modality === 'ELA' && !showElaLayer) &&
      !(modality === 'NOISE' && !showNoiseLayer) &&
      !(modality === 'COPY_MOVE' && !showCloneLayer)
    ),
    [heatmap, showElaLayer, showNoiseLayer, showCloneLayer]
  );
  const isDensityView = heatmapDisplayMode === 'density' ||
    (heatmapDisplayMode === 'auto' && totalCandidateRegions > HEATMAP_DENSITY_THRESHOLD);
  const selectedLayerCandidateRegions = heatmap?.layers.reduce((count, layer) => (
    count + (isHeatmapLayerVisible(layer.modality) ? layer.regions.length : 0)
  ), 0) ?? 0;
  const aggregatedCandidateRegions = densityCells.reduce((count, cell) => count + cell.proposalCount, 0);
  const omittedDensityRegions = selectedLayerCandidateRegions - aggregatedCandidateRegions;
  const displayedCandidateRegions = isDensityView
    ? aggregatedCandidateRegions
    : heatmap?.layers.reduce((count, layer) => (
    count + (isHeatmapLayerVisible(layer.modality) ? (visibleHeatmapRegions.get(layer.modality)?.length ?? 0) : 0)
    ), 0) ?? 0;
  const maxDensityCellCount = Math.max(1, ...densityCells.map(cell => cell.proposalCount));
  const selectedDensityCell = densityCells.find(cell => cell.id === selectedDensityCellId) ?? null;
  const isHeatmapFocused = Boolean(selectedDensityCell || selectedHeatmapRegion);
  const heatmapFocusOrigin = selectedDensityCell
    ? `${((selectedDensityCell.column + 0.5) / HEATMAP_DENSITY_GRID_SIZE) * 100}% ${((selectedDensityCell.row + 0.5) / HEATMAP_DENSITY_GRID_SIZE) * 100}%`
    : selectedHeatmapRegion
      ? `${Math.min(1, Math.max(0, selectedHeatmapRegion.x + selectedHeatmapRegion.width / 2)) * 100}% ${Math.min(1, Math.max(0, selectedHeatmapRegion.y + selectedHeatmapRegion.height / 2)) * 100}%`
      : '50% 50%';

  if (evidenceId === 'upload' || evidenceId === 'new') {
    return <Navigate to={`/cases/${caseId}/evidence/upload`} replace />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {!uploadResult && (
        <EvidenceDetailSkeleton />
      )}

      {uploadResult && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setForensicLabTourOpen(true)}
            >
              <Sparkles size={15} style={{ verticalAlign: 'middle', marginRight: '0.35rem' }} />
              Forensic Lab Tour
            </button>
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
            <EvidenceIntegrityCard evidence={uploadResult} verification={custodyResult} />

            {/* Custody Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Chain of Custody & Storage Verification</h3>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-color-light)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                    SHA-256 RECORDED
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  On-demand current disk check against the SHA-256 captured at intake.
                </div>

                {custodyResult && (
                  <div style={{ padding: '0.6rem', background: custodyResult.integrity_intact ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${custodyResult.integrity_intact ? '#10b981' : '#ef4444'}`, borderRadius: '4px', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                    <strong>{custodyResult.status}:</strong> {custodyResult.message}
                  </div>
                )}
                {custodyError && <div className="error-banner" role="alert">{custodyError}</div>}
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

          {/* Guided Forensic Analysis & Transparent Engine Selection Workflow */}
          <GuidedExaminationWorkflow
            key={`${uploadResult.id}-${uploadResult.image_format || uploadResult.mime_type || ''}`}
            evidence={uploadResult}
            jobs={jobs}
            results={results}
            jobErrors={jobErrors}
            onQueueJob={runAsyncJob}
            onBatchQueue={handleBatchQueueJobs}
            onViewResults={() => {
              const el = document.getElementById('unified-forensic-results') || document.getElementById('workbench-nav');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
          />

          {/* Unified Forensic Results & Evidentiary Synthesis */}
          <UnifiedForensicResults
            key={`${caseId || 'standalone'}-${uploadResult.id}`}
            evidence={uploadResult}
            caseId={caseId}
            jobs={jobs}
            results={results}
            jobErrors={jobErrors}
            onNavigateToViewer={(viewerId) => {
              if (workbenchTabs.some(tab => tab.id === viewerId)) {
                setWorkbenchTab(viewerId as WorkbenchTabId);
              } else {
                console.error(`Unknown forensic viewer requested: ${viewerId}`);
              }
              const el = document.getElementById('workbench-nav');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            onRefresh={() => { if (evidenceId) fetchEvidenceAndJobs(evidenceId); }}
          />

          <div className="forensic-workbench-panel" data-testid="forensic-workbench-panel">
          {/* Categorized Forensic Workbench Navigation */}
          <div id="workbench-nav" data-tour-target="lab-workbench-navigation" className="workbench-nav-container" role="group" aria-label="Forensic modality views">
            {workbenchTabs.map(t => {
              const isActive = workbenchTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`${t.label}: ${t.status}`}
                  onClick={() => setWorkbenchTab(t.id)}
                  className={`workbench-nav-tab ${isActive ? 'active' : ''}`}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  <span className="workbench-nav-badge" aria-hidden="true">{t.badge}</span>
                </button>
              );
            })}
          </div>
          <p data-testid="workbench-counts-help" className="workbench-counts-help">
            Group badges show completed examinations out of compatible methods; the overview shows candidate-region count. These are workflow counts, not integrity conclusions.
          </p>

          <Suspense
            fallback={
              <div
                className="card"
                role="status"
                style={{
                  minHeight: '420px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                Loading forensic analysis module...
              </div>
            }
          >
          {workbenchTab === 'all' && (
            <div className="card" data-testid="all-modalities-summary">
              <h3 style={{ marginTop: 0 }}>All Modalities</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Select a view to load it on demand. Only the selected forensic module is mounted, keeping this workspace responsive.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {workbenchTabs.filter(tab => tab.id !== 'all').map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    className="secondary-button"
                    aria-label={`Open ${tab.label}; ${tab.status}`}
                    onClick={() => setWorkbenchTab(tab.id)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', textAlign: 'left' }}
                  >
                    <span>{tab.icon} {tab.label}</span>
                    <span aria-hidden="true">{tab.badge}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* TAB 1: OVERVIEW & MULTI-MODALITY HEATMAP */}
          {workbenchTab === 'overview' && heatmap && (
            <div className="workbench-overview-content">
              <div data-tour-target="lab-heatmap-panel" className="heatmap-section-header">
                <div>
                  <div className="heatmap-section-meta">
                    <span className="heatmap-section-kicker">
                      Spatial Attention Synthesis
                    </span>
                    <span className="heatmap-section-count">
                      {totalCandidateRegions.toLocaleString()} candidate envelopes across all layers
                    </span>
                  </div>
                  <h3 className="heatmap-section-title">Multi-Modality Spatial Screening Map</h3>
                  <div className="heatmap-section-description">
                    Candidate measurement regions from completed spatial analyses; overlays are not confirmed tampering.
                  </div>
                </div>

                  {/* Heatmap controls or unclassified empty state */}
                  {totalCandidateRegions > 0 ? (
                    <div data-testid="heatmap-controls-bar" className="heatmap-controls-bar">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }} title="Adjust transparency of the spatial anomaly overlays on the evidence image">
                        <label data-testid="heatmap-opacity-label" style={{ fontWeight: 600 }}>Opacity: {Math.round(heatmapOpacity * 100)}%</label>
                        <input 
                          data-testid="heatmap-opacity-slider"
                          aria-label="Heatmap overlay opacity"
                          type="range" 
                          min="0" 
                          max="1.0" 
                          step="0.05"
                          value={heatmapOpacity}
                          onChange={e => setHeatmapOpacity(parseFloat(e.target.value))}
                          style={{ width: '80px', cursor: 'pointer' }}
                        />
                      </div>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                        <span style={{ fontWeight: 600 }}>View</span>
                        <select
                          data-testid="heatmap-display-mode"
                          aria-label="Heatmap display mode"
                          value={heatmapDisplayMode}
                          onChange={event => {
                            const nextMode = event.target.value;
                            setHeatmapDisplayMode(nextMode === 'density' || nextMode === 'regions' ? nextMode : 'auto');
                            setSelectedDensityCellId(null);
                            setSelectedHeatmapRegion(null);
                          }}
                          style={{ background: 'var(--surface-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.25rem 0.4rem' }}
                        >
                          <option value="auto">Auto (recommended)</option>
                          <option value="density">Aggregated density</option>
                          <option value="regions">Individual regions</option>
                        </select>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                        <span style={{ fontWeight: 600 }}>Regions / layer</span>
                        <select
                          data-testid="heatmap-region-limit"
                          aria-label="Maximum displayed individual candidate regions per layer"
                          value={overlayRegionLimit}
                          onChange={event => {
                            setOverlayRegionLimit(event.target.value === 'all' ? 'all' : Number(event.target.value));
                            setSelectedDensityCellId(null);
                            setSelectedHeatmapRegion(null);
                          }}
                          disabled={isDensityView}
                          style={{ background: 'var(--surface-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '0.25rem 0.4rem' }}
                        >
                          <option value="100">Focused (100 / layer)</option>
                          <option value="250">Balanced (250 / layer)</option>
                          <option value="500">Detailed (500 / layer)</option>
                          <option value="all">All available</option>
                        </select>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }} title="Toggle Error Level Analysis compression variance overlay">
                        <input 
                          data-testid="heatmap-layer-ela-toggle"
                          type="checkbox" 
                          checked={showElaLayer} 
                          onChange={e => {
                            setShowElaLayer(e.target.checked);
                            setSelectedDensityCellId(null);
                            setSelectedHeatmapRegion(null);
                          }}
                          style={{ accentColor: '#ef4444' }}
                        />
                        <span style={{ color: '#ef4444', fontWeight: 600 }}>
                          ELA · {heatmap.layers?.find(l => l.modality === 'ELA')?.regions?.length || 0} proposals
                        </span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }} title="Toggle Sensor Noise residual inconsistency overlay">
                        <input 
                          data-testid="heatmap-layer-noise-toggle"
                          type="checkbox" 
                          checked={showNoiseLayer} 
                          onChange={e => {
                            setShowNoiseLayer(e.target.checked);
                            setSelectedDensityCellId(null);
                            setSelectedHeatmapRegion(null);
                          }}
                          style={{ accentColor: '#06b6d4' }}
                        />
                        <span style={{ color: '#06b6d4', fontWeight: 600 }}>
                          Noise · {heatmap.layers?.find(l => l.modality === 'NOISE')?.regions?.length || 0} proposals
                        </span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }} title="Toggle Copy-Move duplicate keypoint cluster overlay">
                        <input 
                          data-testid="heatmap-layer-clone-toggle"
                          type="checkbox" 
                          checked={showCloneLayer} 
                          onChange={e => {
                            setShowCloneLayer(e.target.checked);
                            setSelectedDensityCellId(null);
                            setSelectedHeatmapRegion(null);
                          }}
                          style={{ accentColor: '#10b981' }}
                        />
                        <span style={{ color: '#10b981', fontWeight: 600 }}>
                          Clone · {heatmap.layers?.find(l => l.modality === 'COPY_MOVE')?.regions?.length || 0} proposals
                        </span>
                      </label>

                      <button
                        type="button"
                        data-testid="heatmap-reset-view"
                        className="secondary-button"
                        onClick={() => {
                          setHeatmapOpacity(0.3);
                          setHeatmapDisplayMode('auto');
                          setOverlayRegionLimit(100);
                          setShowElaLayer(true);
                          setShowNoiseLayer(true);
                          setShowCloneLayer(true);
                          setSelectedDensityCellId(null);
                          setSelectedHeatmapRegion(null);
                        }}
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem' }}
                      >
                        Reset view
                      </button>
                    </div>
                  ) : (
                    <div data-testid="heatmap-empty-state" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--surface-color-light)', padding: '0.65rem 0.95rem', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      <span style={{ fontSize: '1.1rem' }}>🛡️</span>
                      <div>
                        <strong style={{ color: 'var(--text-main)' }}>No candidate regions returned.</strong>{' '}
                        {unavailableHeatmapLayers.length > 0
                          ? `${unavailableHeatmapLayers.length} spatial layer(s) have no available output; review their status.`
                          : 'Completed applicable layers returned no mapped regions.'}{' '}
                        This does not establish image integrity or authenticity.
                      </div>
                    </div>
                  )}
                  {totalCandidateRegions > 0 && (
                    <>
                      <div data-testid="heatmap-region-count" className="heatmap-region-count">
                        {isDensityView
                          ? `Aggregating ${displayedCandidateRegions.toLocaleString()} candidate region centers from enabled layers into ${densityCells.length.toLocaleString()} spatial cells. Cell counts are proposals, not unique pixels or a probability of manipulation.${omittedDensityRegions > 0 ? ` ${omittedDensityRegions.toLocaleString()} proposals with invalid coordinates were omitted.` : ''}`
                          : `Showing ${displayedCandidateRegions.toLocaleString()} of ${selectedLayerCandidateRegions.toLocaleString()} candidate envelopes from enabled layers. Individual regions are ordered by display intensity; labels are limited to 8 per layer.`}
                      </div>
                      {isDensityView && (
                        <div data-testid="heatmap-density-legend" className="heatmap-density-legend" role="img" aria-label="Density color scale: fewer to more candidate region centers per spatial cell">
                          <span>Fewer proposals</span>
                          <span className="heatmap-density-legend-gradient" aria-hidden="true" />
                          <span>More proposals</span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Canvas/Overlay Container */}
                <div className="heatmap-analysis-layout">
                <div className="heatmap-visual-column">
                <div className="heatmap-map-viewport" style={{ position: 'relative', width: 'fit-content', maxWidth: '100%', margin: '0 auto', background: 'var(--surface-color-light)', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                  <div
                    data-testid="heatmap-map-content"
                    className="heatmap-map-content"
                    style={{
                      transform: isHeatmapFocused ? 'scale(2)' : 'scale(1)',
                      transformOrigin: heatmapFocusOrigin,
                    }}
                  >
                  <AuthenticatedImage
                    src={`/api/evidence/${uploadResult.id}/raw`}
                    alt={uploadResult.original_filename}
                    className="heatmap-map-image"
                    style={{ display: 'block' }}
                  />

                  {/* Overlay SVG */}
                  <svg 
                    data-testid="heatmap-overlay-svg"
                    role="group"
                    aria-label={isDensityView
                      ? `Aggregated density map of ${displayedCandidateRegions} candidate region centers in ${densityCells.length} spatial cells. Cell counts are proposals, not unique pixels or a probability of manipulation.`
                      : `Spatial screening overlay displaying ${displayedCandidateRegions} candidate regions across selected layers. These are screening outputs, not confirmed manipulation.`}
                    style={{ 
                      position: 'absolute', 
                      top: 0, 
                      left: 0, 
                      width: '100%', 
                      height: '100%', 
                      pointerEvents: 'auto',
                      opacity: heatmapOpacity,
                      transition: 'opacity 0.1s ease'
                    }}
                    viewBox="0 0 1000 1000"
                    preserveAspectRatio="none"
                  >
                    {isDensityView ? (
                      <g data-testid="heatmap-density-layer" aria-label="Aggregated candidate proposal density">
                        {densityCells.map(cell => {
                          const cellSize = 1000 / HEATMAP_DENSITY_GRID_SIZE;
                          const relativeDensity = Math.log1p(cell.proposalCount) / Math.log1p(maxDensityCellCount);
                          const isSelected = selectedDensityCellId === cell.id;
                          return (
                            <rect
                              key={cell.id}
                              data-testid="heatmap-density-cell"
                              data-heatmap-density-cell={cell.id}
                              data-count={cell.proposalCount}
                              x={cell.column * cellSize}
                              y={cell.row * cellSize}
                              width={cellSize}
                              height={cellSize}
                              rx="2"
                              fill="var(--accent-color)"
                              fillOpacity={0.12 + relativeDensity * 0.58}
                              stroke={isSelected ? 'var(--text-main)' : 'var(--accent-color)'}
                              strokeWidth={isSelected ? 5 : 1}
                              role="button"
                              tabIndex={isSelected || (!selectedDensityCellId && cell.id === densityCells[0]?.id) ? 0 : -1}
                              aria-label={`${cell.proposalCount} candidate region centers in this cell; methods: ${Object.entries(cell.countsByModality).map(([modality, count]) => `${modality} ${count}`).join(', ')}. Select to inspect sample locations.`}
                              onClick={() => {
                                setSelectedDensityCellId(cell.id);
                                setSelectedHeatmapRegion(null);
                              }}
                              onKeyDown={event => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setSelectedDensityCellId(cell.id);
                                  setSelectedHeatmapRegion(null);
                                } else if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
                                  event.preventDefault();
                                  const isHorizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
                                  const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
                                  const candidates = densityCells.filter(candidate => {
                                    const primaryDelta = isHorizontal ? candidate.column - cell.column : candidate.row - cell.row;
                                    return primaryDelta * direction > 0;
                                  });
                                  candidates.sort((a, b) => {
                                    const aPrimary = Math.abs((isHorizontal ? a.column - cell.column : a.row - cell.row));
                                    const bPrimary = Math.abs((isHorizontal ? b.column - cell.column : b.row - cell.row));
                                    if (aPrimary !== bPrimary) return aPrimary - bPrimary;
                                    const aSecondary = Math.abs(isHorizontal ? a.row - cell.row : a.column - cell.column);
                                    const bSecondary = Math.abs(isHorizontal ? b.row - cell.row : b.column - cell.column);
                                    return aSecondary - bSecondary;
                                  });
                                  const nextCell = candidates[0];
                                  if (nextCell) {
                                    setSelectedDensityCellId(nextCell.id);
                                    setSelectedHeatmapRegion(null);
                                    requestAnimationFrame(() => {
                                      document.querySelector<SVGRectElement>(`[data-heatmap-density-cell="${nextCell.id}"]`)?.focus();
                                    });
                                  }
                                }
                              }}
                            />
                          );
                        })}
                      </g>
                    ) : (
                      heatmap.layers?.map(layer => {
                        if (!isHeatmapLayerVisible(layer.modality)) return null;

                        const color = layer.modality === 'ELA' ? '#ef4444' : layer.modality === 'NOISE' ? '#06b6d4' : '#10b981';

                        return (
                          <g key={layer.modality} data-testid={`heatmap-layer-${layer.modality.toLowerCase()}`}>
                            {(visibleHeatmapRegions.get(layer.modality) ?? []).map((region, regionIndex) => {
                              const rx = region.x * 1000;
                              const ry = region.y * 1000;
                              const rw = region.width * 1000;
                              const rh = region.height * 1000;
                              const isSelected = selectedHeatmapRegion === region;
                              const regionSequenceIndex = heatmapRegionSequence.get(region) ?? -1;
                              return (
                                <g key={`${layer.modality}-${regionIndex}`}>
                                  <rect
                                    x={rx}
                                    y={ry}
                                    width={rw}
                                    height={rh}
                                    data-testid="heatmap-candidate-region"
                                    data-heatmap-region-sequence={regionSequenceIndex}
                                    data-selected={isSelected}
                                    fill={color}
                                    fillOpacity={region.intensity * 0.45}
                                    stroke={isSelected ? 'var(--text-main)' : color}
                                    strokeWidth={isSelected ? 5 : 3}
                                    strokeDasharray={isSelected ? undefined : '6 3'}
                                    role="button"
                                    tabIndex={isSelected || (!selectedHeatmapRegion && regionSequenceIndex === 0) ? 0 : -1}
                                    aria-label={`${layer.label} candidate region: ${region.description || 'candidate region'}, x ${Math.round(region.x * 100)}%, y ${Math.round(region.y * 100)}%, width ${Math.round(region.width * 100)}%, height ${Math.round(region.height * 100)}%`}
                                    onClick={() => {
                                      setSelectedHeatmapRegion(region);
                                      setSelectedDensityCellId(null);
                                    }}
                                    onKeyDown={event => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        setSelectedHeatmapRegion(region);
                                        setSelectedDensityCellId(null);
                                      } else if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)) {
                                        event.preventDefault();
                                        const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
                                        const nextIndex = regionSequenceIndex + direction;
                                        const nextEntry = visibleHeatmapRegionEntries[nextIndex];
                                        if (nextEntry) {
                                          setSelectedHeatmapRegion(nextEntry.region);
                                          setSelectedDensityCellId(null);
                                          requestAnimationFrame(() => {
                                            document.querySelector<SVGRectElement>(`[data-heatmap-region-sequence="${nextIndex}"]`)?.focus();
                                          });
                                        }
                                      }
                                    }}
                                  />
                                  {regionIndex < 8 && (
                                    <g aria-hidden="true" pointerEvents="none">
                                      <rect
                                        x={rx}
                                        y={Math.max(0, ry - 22)}
                                        width={Math.min(220, rw)}
                                        height={20}
                                        fill={color}
                                        fillOpacity={0.85}
                                        rx={3}
                                      />
                                      <text
                                        data-testid="heatmap-candidate-label"
                                        x={rx + 6}
                                        y={Math.max(0, ry - 22) + 14}
                                        fill="#ffffff"
                                        fontSize="12"
                                        fontWeight="bold"
                                        fontFamily="sans-serif"
                                      >
                                        {layer.modality}: {region.description?.slice(0, 22) || 'Candidate Region'}
                                      </text>
                                    </g>
                                  )}
                                </g>
                              );
                            })}
                          </g>
                        );
                      })
                    )}
                  </svg>
                  </div>

                  {totalCandidateRegions === 0 && (
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
                      No candidate regions returned by completed layers; this is not an authenticity or integrity finding.
                    </div>
                  )}
                </div>
                {(selectedDensityCell || selectedHeatmapRegion) && (
                  <div data-testid="heatmap-selection-detail" role="status" aria-live="polite" style={{ marginTop: '0.75rem', padding: '0.75rem', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)', background: 'var(--surface-raised)', fontSize: '0.8rem' }}>
                    {selectedDensityCell ? (
                      <>
                        <strong>{selectedDensityCell.proposalCount} region centers in this density cell</strong>
                        <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>
                          Methods: {Object.entries(selectedDensityCell.countsByModality).map(([modality, count]) => `${modality} ${count}`).join(' · ')}
                        </span>
                        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem' }}>
                          {selectedDensityCell.sampleRegions.map((region, index) => (
                            <li key={`${region.modality}-${index}`}>
                              {region.modality}: {region.description || 'Candidate region'} — x {Math.round(region.x * 100)}%, y {Math.round(region.y * 100)}%, {Math.round(region.width * 100)}% × {Math.round(region.height * 100)}%; {Number.isFinite(region.intensity) ? `display intensity ${Math.round(region.intensity * 100)}% (method-specific, not probability)` : 'display intensity not reported'}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : selectedHeatmapRegion && (
                      <>
                        <strong>{selectedHeatmapRegion.modality}: {selectedHeatmapRegion.description || 'Candidate region'}</strong>
                        <div style={{ marginTop: '0.25rem', color: 'var(--text-muted)' }}>
                          Bounding box: x {Math.round(selectedHeatmapRegion.x * 100)}%, y {Math.round(selectedHeatmapRegion.y * 100)}%, width {Math.round(selectedHeatmapRegion.width * 100)}%, height {Math.round(selectedHeatmapRegion.height * 100)}%. {Number.isFinite(selectedHeatmapRegion.intensity) ? `Display intensity ${Math.round(selectedHeatmapRegion.intensity * 100)}% is method-specific, not a probability.` : 'Display intensity was not reported.'}
                        </div>
                      </>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.45rem' }}>
                      <button
                        type="button"
                        data-testid="heatmap-clear-focus"
                        className="secondary-button"
                        onClick={() => {
                          setSelectedDensityCellId(null);
                          setSelectedHeatmapRegion(null);
                        }}
                      >
                        Clear focus
                      </button>
                    </div>
                  </div>
                )}
                </div>
                <div
                  className="heatmap-interpretation-column"
                  role="region"
                  aria-label="Spatial analysis interpretation"
                  tabIndex={0}
                >
                  <details className="heatmap-text-description">
                    <summary>
                      Text description of spatial overlay ({totalCandidateRegions.toLocaleString()} candidate envelopes)
                    </summary>
                    <p>
                      {unavailableHeatmapLayers.length > 0
                        ? `${unavailableHeatmapLayers.length} layer(s) have no available output and provide no negative evidence. `
                        : 'All applicable spatial layers have results. '}
                      Candidate regions are detector outputs for examiner review, not confirmed edits.
                    </p>
                    <ul>
                      {heatmap.layers.map(layer => (
                        <li key={layer.modality}>
                          {layer.label}: {layer.status.replaceAll('_', ' ')}, {layer.regions.length.toLocaleString()} candidate proposal(s).
                          {layer.regions.length > 0 && (
                            <ul>
                              {layer.regions.slice(0, 25).map((region, index) => (
                                <li key={`${layer.modality}-${index}`}>
                                  {region.description} (x {Math.round(region.x * 100)}%, y {Math.round(region.y * 100)}%, width {Math.round(region.width * 100)}%, height {Math.round(region.height * 100)}%)
                                </li>
                              ))}
                              {layer.regions.length > 25 && <li>Showing the first 25 of {layer.regions.length} regions.</li>}
                            </ul>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>

                  <div className="heatmap-insight-list">
                    <article className="heatmap-insight-card heatmap-insight-card--finding">
                      <h4>What was found?</h4>
                      <p>{heatmap.what_was_found}</p>
                    </article>

                    <article className="heatmap-insight-card heatmap-insight-card--meaning">
                      <h4>Why does it matter?</h4>
                      <p>{heatmap.why_it_matters}</p>
                    </article>

                    <article className="heatmap-insight-card heatmap-insight-card--next">
                      <h4>What should you do next?</h4>
                      <ul>
                        {heatmap.recommended_next_steps?.slice(0, 3).map((step, index) => (
                          <li key={index}>{step}</li>
                        ))}
                      </ul>
                    </article>
                  </div>

                  <div className="heatmap-limitation" role="note">
                    <strong>Limitation</strong>
                    <p>{heatmap.limitations}</p>
                  </div>
                </div>
                </div>
            </div>
          )}

          {/* TAB: INTERACTIVE VISUAL INSPECTION & MICROSCOPY */}
          {workbenchTab === 'visual_inspection' && (
            <InteractiveVisualInspection 
              evidenceId={uploadResult.id} 
              filename={uploadResult.original_filename} 
            />
          )}

          {/* TAB 2: CORE FORENSIC / DIP WORKLOADS */}
          {workbenchTab === 'core' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 className="card-title" style={{ margin: 0, color: 'var(--primary-color)' }}>
                  FORENSIC / DIP ENGINE WORKLOADS (FROZEN CORE)
                </h2>
              </div>
              
              <div data-testid="core-dip-engines-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', alignItems: 'start' }}>
                <AnalysisJobCard job={jobs['metadata']} analysisType="Metadata" result={results['metadata']} onRun={() => runAsyncJob('metadata')} disabled={false} />
                <AnalysisJobCard job={jobs['ela']} analysisType="Error Level Analysis" result={results['ela']} onRun={() => runAsyncJob('ela')} disabled={false} />
                <AnalysisJobCard job={jobs['noise']} analysisType="Noise Residual" result={results['noise']} onRun={() => runAsyncJob('noise')} disabled={false} />
                <AnalysisJobCard job={jobs['jpeg-dct']} analysisType="JPEG / DCT" result={results['jpeg-dct']} onRun={() => runAsyncJob('jpeg-dct')} disabled={false} />
                <AnalysisJobCard job={jobs['copy-move']} analysisType="Copy-Move" result={results['copy-move']} onRun={() => runAsyncJob('copy-move')} disabled={false} />
              </div>
            </div>
          )}

          {/* TAB 3: CONTAINER & COMPRESSION FORENSICS */}
          {workbenchTab === 'compression' && (
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
          {workbenchTab === 'color_spectrum' && (
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
          {workbenchTab === 'noise_resampling' && (
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
          {workbenchTab === 'cloning' && (
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
          {workbenchTab === 'camera_sensor' && (
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
          {workbenchTab === 'physics_geometry' && (
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
          </Suspense>
          </div>
          {/* FUSION & OBSERVATION ASSESSMENT (Always accessible on Overview or Core) */}
          {(workbenchTab === 'overview' || workbenchTab === 'core') && (
            <div className="card fusion-assessment-panel">
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
                      color: 'var(--primary-color)',
                      background: 'var(--primary-light)',
                      border: '1px solid var(--primary-border)',
                      padding: '0.2rem 0.6rem', 
                      borderRadius: '9999px', 
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase' 
                    }}>
                      <Cpu size={12} style={{ color: 'var(--primary-color)' }} />
                      Deterministic Correlation Engine
                    </span>

                    {(normalizing || correlating) ? (
                      <span style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.35rem', 
                        fontSize: '0.72rem', 
                        color: 'var(--primary-color)',
                        background: 'var(--primary-light)',
                        border: '1px solid var(--primary-border)',
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
                        color: 'var(--primary-color)',
                        background: 'var(--primary-light)',
                        border: '1px solid var(--primary-border)',
                        padding: '0.2rem 0.65rem', 
                        borderRadius: '9999px', 
                        fontWeight: 700,
                        letterSpacing: '0.01em'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary-color)' }} />
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
                    boxShadow: 'var(--shadow-sm)',
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
                    background: 'var(--surface-raised)',
                    color: 'var(--text-main)', 
                    padding: '0.8rem 1.25rem', 
                    borderRadius: '8px', 
                    fontWeight: 600, 
                    border: '1px solid var(--border-color)', 
                    cursor: 'pointer', 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.65rem',
                    transition: 'border-color 0.15s ease, background-color 0.15s ease',
                    letterSpacing: '-0.01em'
                  }}
                  title="Open dialog to view complete normalized observations table across all completed examinations"
                >
                  <Table size={16} style={{ color: 'var(--accent-color)' }} />
                  <span style={{ fontSize: '0.92rem' }}>Normalize Observations</span>
                  {normalizing ? (
                    <span style={{ 
                      background: 'var(--primary-light)',
                      color: 'var(--primary-color)',
                      border: '1px solid var(--primary-border)',
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
                      background: 'var(--surface-sunken)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-default)',
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
                  className="btn btn-primary" 
                  onClick={handleOpenCorrelateModal}
                  style={{ 
                    padding: '0.8rem 1.25rem', 
                    borderRadius: '8px', 
                    fontWeight: 600, 
                    cursor: 'pointer', 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.65rem',
                    letterSpacing: '-0.01em'
                  }}
                  title="Open dialog to view correlated forensic assessment and multi-modality matrix"
                >
                  <ShieldCheck size={16} />
                  <span style={{ fontSize: '0.92rem' }}>Correlate & Assess</span>
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
                <div style={{ marginBottom: '1rem', padding: '0.85rem 1.15rem', background: 'var(--accent-light)',border: '1px solid var(--accent-border)',borderRadius: '8px', fontSize: '0.825rem', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <Info size={17} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
                  <div>
                    <strong>Prerequisite:</strong> No analytical engines have run on this image yet ({totalCompleted} completed). As soon as you queue or run any forensic engine above (e.g. <strong>Core DIP Engines</strong>, <strong>Physics & Geometry</strong>, <strong>Container & Compression</strong>), normalization and correlation will execute automatically.
                  </div>
                </div>
              )}

              {/* In-Progress Sync Indicator */}
              {(normalizing || correlating) && !results.correlate && (
                <div style={{ padding: '1.75rem', textAlign: 'center', background: 'var(--surface-raised)', borderRadius: '10px', border: '1px dashed var(--border-color)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <RefreshCw size={20} className="spin-animate" style={{ marginBottom: '0.5rem', display: 'inline-block', color: 'var(--primary-color)' }} />
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
                
                const levelColor = 'var(--primary-color)';
                const levelBg = 'var(--primary-light)';
                const levelBorder = 'var(--primary-border)';

                const humanizedLevel = isElevated 
                  ? 'ELEVATED FORENSIC CONCERN' 
                  : isModerate 
                    ? 'MODERATE FORENSIC CONCERN' 
                    : isLow 
                      ? 'LOW / NOMINAL CONCERN' 
                      : 'INSUFFICIENT EVIDENCE';

                return (
                  <div style={{ 
                    background: 'var(--surface-raised)',
                    padding: '1.4rem 1.6rem', 
                    borderRadius: '12px', 
                    border: '1px solid var(--border-color)', 
                    borderLeft: `5px solid ${levelColor}`,
                    boxShadow: 'var(--shadow-sm)',
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
                            background: 'var(--surface-sunken)',
                            padding: '0.12rem 0.45rem', 
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)' 
                          }}>
                            Correlation Rule Evaluation
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
                            boxShadow: 'var(--shadow-sm)',
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
                      borderBottom: '1px solid var(--border-subtle)',
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
                              background: 'var(--primary-light)',
                              border: '1px solid var(--primary-border)',
                              color: 'var(--primary-color)',
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
                              background: 'var(--primary-light)',
                              border: '1px solid var(--primary-border)',
                              color: 'var(--primary-color)',
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
                              color: 'var(--primary-color)',
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
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary-hover)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--primary-color)')}
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
                              color: 'var(--primary-color)',
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
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary-color)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--primary-color)')}
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
                          background: 'var(--accent-light)',
                          borderRadius: '8px', 
                          border: '1px solid var(--accent-border)',
                          borderLeft: '4px solid var(--accent-color)',
                          fontSize: '0.8rem', 
                          color: 'var(--text-body)',
                          display: 'flex',
                          gap: '0.65rem',
                          alignItems: 'flex-start'
                        }}>
                          <Info size={16} style={{ color: 'var(--accent-text)', flexShrink: 0, marginTop: '0.15rem' }} />
                          <div style={{ lineHeight: 1.55 }}>
                            <strong style={{ color: 'var(--accent-text)', fontWeight: 750, letterSpacing: '0.02em' }}>
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
                      <span>View Correlated Assessment</span>
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
                        Correlated Evidence Assessment
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
                      <RefreshCw size={28} className="spin-animate" style={{ color: 'var(--primary-color)' }} />
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
                    
                    const levelColor = 'var(--primary-color)';
                    const levelBg = 'var(--primary-light)';
                    const levelBorder = 'var(--primary-border)';

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
                                background: 'var(--surface-base)',
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
                              Correlation Rule Engine
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
                                  background: 'var(--primary-light)',
                                  border: '1px solid var(--primary-border)',
                                  color: 'var(--primary-color)'
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
                                  background: 'var(--surface-sunken)',
                                  border: '1px solid var(--border-default)',
                                  color: 'var(--primary-color)',
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
                              <GitMerge size={15} style={{ color: 'var(--primary-color)' }} />
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
                                const isContradicting = rel.relation_type === 'CONTRADICTING';
                                const relBadgeColor = isContradicting ? 'var(--accent-text)' : 'var(--primary-color)';
                                const relBadgeBg = isContradicting ? 'var(--accent-light)' : 'var(--primary-light)';

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
                              No contradictory signals are recorded in the current correlation output. This is not an authenticity finding; review which examinations have run and their limitations.
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
                          background: 'var(--accent-light)',
                          borderRadius: '8px', 
                          border: '1px solid var(--accent-border)',
                          borderLeft: '4px solid var(--accent-color)',
                          fontSize: '0.78rem', 
                          color: 'var(--text-body)',
                          display: 'flex',
                          gap: '0.65rem',
                          alignItems: 'flex-start'
                        }}>
                          <Info size={16} style={{ color: 'var(--accent-text)', flexShrink: 0, marginTop: '0.15rem' }} />
                          <div style={{ lineHeight: 1.5 }}>
                            <strong style={{ color: 'var(--accent-text)', fontWeight: 750 }}>
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
                      color: 'var(--primary-color)',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <span>View Normalized Observations Table</span>
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
          <ForensicLabTour isOpen={forensicLabTourOpen} onClose={closeForensicLabTour} />
        </>
      )}
    </div>
  );
}
