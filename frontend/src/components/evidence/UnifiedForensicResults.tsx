import { useState, useMemo } from 'react';
import AuthenticatedImage from './AuthenticatedImage';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Info, 
  Layers, 
  Eye, 
  EyeOff, 
  FileText, 
  Sliders, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Download, 
  Crosshair, 
  FileCheck2, 
  Sparkles,
  RefreshCw,
  Maximize2
} from 'lucide-react';
import { FORENSIC_EXAMINATION_CATALOGUE, type ForensicExaminationDefinition } from './GuidedExaminationWorkflow';

export interface UnifiedForensicResultsProps {
  evidence: {
    id: number;
    evidence_identifier?: string;
    original_filename: string;
    mime_type?: string;
    image_format?: string;
    file_size?: number;
    width?: number;
    height?: number;
    sha256_hash?: string;
    created_at?: string;
  };
  caseId?: string;
  jobs: Record<string, any>;
  results: Record<string, any>;
  jobErrors?: Record<string, string>;
  onNavigateToViewer?: (viewerId: string) => void;
  onRefresh?: () => void;
}

export type ResultsTab = 'overview' | 'spatial' | 'disclosures' | 'findings' | 'report';

export interface SpatialRegion {
  id: string;
  engineId: string;
  modalityLabel: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  intensity: number;
  description: string;
}

export default function UnifiedForensicResults({
  evidence,
  caseId,
  jobs,
  results,
  jobErrors = {},
  onNavigateToViewer,
  onRefresh
}: UnifiedForensicResultsProps) {
  const [activeTab, setActiveTab] = useState<ResultsTab>('overview');
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(0.7);
  const [showOverlays, setShowOverlays] = useState<boolean>(true);
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({
    ELA: true,
    NOISE: true,
    COPY_MOVE: true,
    COLOR_CHANNEL: true
  });
  const [expandedEngines, setExpandedEngines] = useState<Record<string, boolean>>({
    metadata: true,
    'camera-id': true,
    ela: true
  });
  const [examinerNotes, setExaminerNotes] = useState<string>('');

  const rawFormat = (evidence.image_format || evidence.mime_type || '').toUpperCase();
  const isJpeg = rawFormat.includes('JPEG') || rawFormat.includes('JPG');

  // Helper to extract engine execution status
  const getEngineExecution = (exam: ForensicExaminationDefinition) => {
    const id = exam.id;
    const hypId = id.replace(/_/g, '-');
    const underId = id.replace(/-/g, '_');

    const job = jobs[id] || jobs[hypId] || jobs[underId];
    const result = results[id] || results[hypId] || results[underId];
    const err = jobErrors[id] || jobErrors[hypId] || jobErrors[underId] || job?.error_message;

    let status: 'COMPLETED' | 'FAILED' | 'RUNNING' | 'QUEUED' | 'INCOMPATIBLE' | 'NOT_RUN' = 'NOT_RUN';

    if (exam.requiresLossy && !isJpeg) {
      status = 'INCOMPATIBLE';
    } else if (err || job?.status === 'FAILED' || result?.status === 'failed') {
      status = 'FAILED';
    } else if (result?.status === 'completed' || job?.status === 'COMPLETED') {
      status = 'COMPLETED';
    } else if (job?.status === 'RUNNING') {
      status = 'RUNNING';
    } else if (job?.status === 'QUEUED') {
      status = 'QUEUED';
    }

    return { job, result, error: err, status };
  };

  // Compute status metrics across all 23 engines
  const metrics = useMemo(() => {
    let completed = 0;
    let failed = 0;
    let running = 0;
    let queued = 0;
    let incompatible = 0;
    let notRun = 0;
    let withObservations = 0;

    FORENSIC_EXAMINATION_CATALOGUE.forEach(exam => {
      const exec = getEngineExecution(exam);
      if (exec.status === 'COMPLETED') {
        completed++;
        // Check if there are notable observations
        const findings = exec.result?.structured_findings || {};
        const hasAnomalies = 
          (findings.elevated_regions && findings.elevated_regions.length > 0) ||
          (findings.clusters && findings.clusters.length > 0) ||
          (findings.matches && findings.matches.length > 0) ||
          (findings.anomalous_blocks && findings.anomalous_blocks.length > 0) ||
          (findings.anomaly_blocks && findings.anomaly_blocks.length > 0) ||
          (findings.ghost_minima && findings.ghost_minima.length > 0) ||
          (findings.candidate_regions && findings.candidate_regions.length > 0);
        if (hasAnomalies) withObservations++;
      } else if (exec.status === 'FAILED') {
        failed++;
      } else if (exec.status === 'RUNNING') {
        running++;
      } else if (exec.status === 'QUEUED') {
        queued++;
      } else if (exec.status === 'INCOMPATIBLE') {
        incompatible++;
      } else {
        notRun++;
      }
    });

    return { completed, failed, running, queued, incompatible, notRun, withObservations, total: FORENSIC_EXAMINATION_CATALOGUE.length };
  }, [jobs, results, jobErrors, isJpeg]);

  // Extract spatial regions across genuine spatial engines
  const spatialRegions = useMemo<SpatialRegion[]>(() => {
    const list: SpatialRegion[] = [];
    const width = evidence.width || 1000;
    const height = evidence.height || 1000;

    // 1. ELA
    const elaRes = results['ela']?.structured_findings || results['ELA']?.structured_findings;
    if (elaRes?.elevated_regions && Array.isArray(elaRes.elevated_regions)) {
      elaRes.elevated_regions.forEach((r: any, idx: number) => {
        list.push({
          id: `ela-${idx}`,
          engineId: 'ela',
          modalityLabel: 'Compression Variance (ELA)',
          color: '#ef4444',
          x: Math.max(0, Math.min(1, (r.x || 0) / width)),
          y: Math.max(0, Math.min(1, (r.y || 0) / height)),
          width: Math.max(0.02, Math.min(1, (r.w || r.width || 40) / width)),
          height: Math.max(0.02, Math.min(1, (r.h || r.height || 40) / height)),
          intensity: r.intensity || 0.75,
          description: `Elevated recompression delta (${r.intensity ? Math.round(r.intensity * 100) : 75}% variance)`
        });
      });
    }

    // 2. NOISE / ADVANCED-NOISE
    const noiseRes = results['noise']?.structured_findings || results['NOISE']?.structured_findings;
    if (noiseRes?.local_statistics?.anomalous_blocks && Array.isArray(noiseRes.local_statistics.anomalous_blocks)) {
      noiseRes.local_statistics.anomalous_blocks.slice(0, 15).forEach((b: any, idx: number) => {
        list.push({
          id: `noise-${idx}`,
          engineId: 'noise',
          modalityLabel: 'Noise Residual (SNR)',
          color: '#06b6d4',
          x: Math.max(0, Math.min(1, (b.x || 0) / width)),
          y: Math.max(0, Math.min(1, (b.y || 0) / height)),
          width: Math.max(0.02, Math.min(1, (b.w || 32) / width)),
          height: Math.max(0.02, Math.min(1, (b.h || 32) / height)),
          intensity: 0.65,
          description: `High-pass noise residual variance exceeds 2σ boundary`
        });
      });
    }

    // 3. COPY_MOVE / CLONE
    const copyRes = results['copy-move']?.structured_findings || results['COPY_MOVE']?.structured_findings;
    if (copyRes?.clusters && Array.isArray(copyRes.clusters)) {
      copyRes.clusters.forEach((c: any, idx: number) => {
        list.push({
          id: `copy-${idx}`,
          engineId: 'copy-move',
          modalityLabel: 'Clone Keypoints (SIFT)',
          color: '#10b981',
          x: Math.max(0, Math.min(1, (c.x || 0) / width)),
          y: Math.max(0, Math.min(1, (c.y || 0) / height)),
          width: Math.max(0.03, Math.min(1, (c.w || 50) / width)),
          height: Math.max(0.03, Math.min(1, (c.h || 50) / height)),
          intensity: 0.85,
          description: `Duplicated keypoint cluster (${c.point_count || 'paired'} correspondence vectors)`
        });
      });
    }

    // 4. COLOR-CHANNEL Disparity
    const colorRes = results['color-channel']?.structured_findings || results['COLOR-CHANNEL']?.structured_findings;
    if (colorRes?.candidate_disparity_regions && Array.isArray(colorRes.candidate_disparity_regions)) {
      colorRes.candidate_disparity_regions.forEach((cr: any, idx: number) => {
        list.push({
          id: `color-${idx}`,
          engineId: 'color-channel',
          modalityLabel: 'Color Channel Disparity',
          color: '#f59e0b',
          x: Math.max(0, Math.min(1, (cr.x || 0) / width)),
          y: Math.max(0, Math.min(1, (cr.y || 0) / height)),
          width: Math.max(0.03, Math.min(1, (cr.w || 40) / width)),
          height: Math.max(0.03, Math.min(1, (cr.h || 40) / height)),
          intensity: 0.7,
          description: `Inter-channel correlation disparity outlier (>2.5σ)`
        });
      });
    }

    return list;
  }, [results, evidence.width, evidence.height]);

  // Spatial Capability Matrix definition
  const isSpatialEngine = (id: string) => {
    return ['ela', 'noise', 'copy-move', 'resampling', 'advanced-noise', 'clone-block', 'clone-keypoint', 'color-channel', 'jpeg-ghost', 'nadjpeg', 'blocking-artifact'].includes(id);
  };

  // Plain language interpretation builder
  const getPlainLanguageInterpretation = (exam: ForensicExaminationDefinition, exec: any) => {
    const findings = exec.result?.structured_findings || {};

    switch (exam.id) {
      case 'metadata':
        return {
          whatExamined: 'Standardized EXIF 2.32 / CIPA container headers, device make/model, software history, timestamps, and GPS records.',
          whatObserved: findings.camera_make || findings.make ? `Device: ${findings.camera_make || findings.make} ${findings.camera_model || findings.model || ''}. Software: ${findings.software || 'None reported'}.` : 'No embedded camera firmware make/model tags found in container header.',
          mayIndicate: findings.software ? 'File contains signatures or tag sequences characteristic of post-capture processing or editing utilities.' : 'Container exhibits camera-direct header layout consistent with original capture hardware profiles.',
          doesNotEstablish: 'Missing EXIF data does not prove tampering; many privacy-conscious utilities and social media pipelines strip metadata unconditionally. EXIF tags can also be forged without altering image pixels.',
          technicalDetails: findings
        };
      case 'ela':
        return {
          whatExamined: 'Pixel-wise compression difference between original image and an intentional uniform 90% quality recompression.',
          whatObserved: findings.mean_error !== undefined ? `Mean error difference: ${Number(findings.mean_error).toFixed(2)}, variance: ${Number(findings.variance || 0).toFixed(2)}, elevated regions: ${findings.elevated_regions?.length || 0}.` : 'Recompression delta computation complete.',
          mayIndicate: (findings.elevated_regions?.length || 0) > 0 ? 'Localized regions exhibit compression histories differing from the surrounding baseline, suggesting secondary resaving or compositing.' : 'Uniform error dissipation across the image plane, consistent with single-generation compression history.',
          doesNotEstablish: 'Natural high-contrast luminance edges and textured surfaces inherently dissipate high compression error without human alteration. ELA cannot establish intent.',
          technicalDetails: findings
        };
      case 'noise':
        return {
          whatExamined: 'High-frequency noise patterns isolated through spatial adaptive median filtering and local Signal-to-Noise Ratio (SNR) variance analysis.',
          whatObserved: findings.average_noise_level !== undefined ? `Average noise level: ${Number(findings.average_noise_level).toFixed(2)}, anomalous blocks: ${findings.local_statistics?.anomalous_blocks?.length || 0}.` : 'Noise residual map computed.',
          mayIndicate: (findings.local_statistics?.anomalous_blocks?.length || 0) > 0 ? 'Discrepancies in local noise variance may indicate foreign image patches, local smoothing, or inpainting.' : 'Consistent spatial noise variance across image tiles, consistent with single-sensor capture.',
          doesNotEstablish: 'In-camera denoising, optical vignetting, and uneven scene illumination naturally modulate noise floor variance across the frame.',
          technicalDetails: findings
        };
      case 'jpeg-dct':
        return {
          whatExamined: 'Spatial 8×8 block orthonormal 2D Discrete Cosine Transform (DCT) matrix transformation on decoded grayscale pixel arrays.',
          whatObserved: findings.ac_variance !== undefined ? `Global AC coefficient variance: ${Number(findings.ac_variance).toFixed(2)}, zero coefficient ratio: ${Number(findings.zero_ratio || 0).toFixed(2)}.` : 'Decoded spatial 8x8 block DCT matrix evaluation complete.',
          mayIndicate: 'Highlights localized frequency energy distribution variations across decoded 8×8 spatial block boundaries.',
          doesNotEstablish: 'Operates on decoded spatial pixels, not raw bitstream entropy stream. Does not evaluate Benford\'s Law or periodicity fitting. Texture differences modulate block energy naturally.',
          technicalDetails: findings
        };
      case 'copy-move':
        return {
          whatExamined: 'Scale-Invariant Feature Transform (SIFT) interest points with L2 Euclidean nearest-neighbor matching and spatial agglomerative clustering.',
          whatObserved: findings.matches !== undefined ? `Extracted ${findings.matches?.length || 0} keypoint match pairs forming ${findings.clusters?.length || 0} spatial clusters.` : 'SIFT descriptor extraction and spatial correspondence search complete.',
          mayIndicate: (findings.clusters?.length || 0) > 0 ? 'Identified duplicate or near-identical image elements replicated at different spatial positions within the frame.' : 'No geometrically consistent duplicate feature clusters detected.',
          doesNotEstablish: 'Naturally repetitive scene textures (window facades, ocean waves, brickwork, foliage) routinely generate false-positive keypoint correspondence pairs.',
          technicalDetails: findings
        };
      case 'camera-id':
        return {
          whatExamined: 'Wavelet-extracted Photo-Response Non-Uniformity (PRNU) sensor noise residuals compared against case reference camera models using circular cross-correlation and Peak-to-Correlation Energy (PCE).',
          whatObserved: findings.match_status ? `Attribution status: ${findings.match_status}. Peak PCE score: ${Number(findings.pce || 0).toFixed(2)}.` : 'Camera sensor comparison evaluated against available reference library.',
          mayIndicate: findings.pce && findings.pce > 50 ? 'Strong circular correlation surface indicating high noise residual similarity with the enrolled reference camera model.' : 'Noise residual does not correlate with available reference profiles or no reference cameras enrolled in case.',
          doesNotEstablish: 'Attribution requires pre-registered reference camera profiles in the case library. Without reference sensor models, the engine cannot establish camera provenance.',
          technicalDetails: findings
        };
      case 'color-channel':
        return {
          whatExamined: 'Global Pearson linear correlation coefficients between RGB channel pairs and local 8×8 block disparity Z-scores.',
          whatObserved: findings.correlations ? `Pearson r(R-G)=${Number(findings.correlations.rg || 0).toFixed(3)}, r(R-B)=${Number(findings.correlations.rb || 0).toFixed(3)}, r(G-B)=${Number(findings.correlations.gb || 0).toFixed(3)}. Outlier blocks: ${findings.candidate_disparity_regions?.length || 0}.` : 'Inter-channel color correlation evaluation complete.',
          mayIndicate: (findings.candidate_disparity_regions?.length || 0) > 0 ? 'Identifies localized spatial regions where color channel correlation diverges significantly from the global image baseline.' : 'Uniform RGB channel correlation across the image plane.',
          doesNotEstablish: 'Evaluates RGB correlation disparity, not Color Filter Array (CFA) Bayer demosaicing matrix inversion. Vivid monochromatic subjects and lens chromatic aberrations cause natural disparities.',
          technicalDetails: findings
        };
      case 'advanced-noise':
        return {
          whatExamined: 'Spatial Gaussian residual subtraction with 2D Fast Fourier Transform (FFT) radial frequency band energy distribution analysis.',
          whatObserved: findings.radial_energy ? `Radial energy ratios — Low: ${Number(findings.radial_energy.low || 0).toFixed(2)}, Mid: ${Number(findings.radial_energy.mid || 0).toFixed(2)}, High: ${Number(findings.radial_energy.high || 0).toFixed(2)}.` : 'Spatial Gaussian residual extraction and radial FFT analysis complete.',
          mayIndicate: 'Characterizes high-frequency noise scale and spectral distribution across spatial blocks.',
          doesNotEstablish: 'Uses spatial Gaussian residual and 2D FFT spectral decomposition, not Discrete Wavelet Transform (DWT). Subject texture variations modulate high-frequency energy naturally.',
          technicalDetails: findings
        };
      default:
        return {
          whatExamined: exam.whatItExamines,
          whatObserved: findings.summary || exec.result?.summary || 'Analysis completed and structured metrics extracted.',
          mayIndicate: exam.whyItMatters,
          doesNotEstablish: exam.limitations,
          technicalDetails: findings
        };
    }
  };

  const handleDownloadReportJson = () => {
    const reportData = {
      report_type: 'ForenSight Evidentiary Examination Summary',
      generated_at: new Date().toISOString(),
      case_identifier: caseId || 'N/A',
      evidence: {
        id: evidence.id,
        identifier: evidence.evidence_identifier,
        filename: evidence.original_filename,
        format: evidence.image_format || evidence.mime_type,
        sha256_hash: evidence.sha256_hash,
        dimensions: `${evidence.width}x${evidence.height}px`,
        file_size_bytes: evidence.file_size
      },
      examination_metrics: metrics,
      examiner_notes: examinerNotes || 'No additional human examiner notes entered.',
      disclaimer: 'AUTOMATED FORENSIC SCREENING SUMMARY: Algorithmic observations represent mathematical variance and structural patterns. They do not constitute a definitive or binary declaration of image authenticity. Observations must be corroborated by a qualified digital evidence examiner.',
      examinations_performed: FORENSIC_EXAMINATION_CATALOGUE.map(exam => {
        const exec = getEngineExecution(exam);
        const interp = getPlainLanguageInterpretation(exam, exec);
        return {
          frontend_id: exam.id,
          backend_id: exam.technicalId,
          display_name: exam.name,
          category: exam.category,
          status: exec.status,
          error: exec.error || null,
          what_examined: interp.whatExamined,
          what_observed: interp.whatObserved,
          plausible_indication: interp.mayIndicate,
          evidentiary_limitations: interp.doesNotEstablish,
          raw_data: exec.result?.structured_findings || null
        };
      })
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forensight-report-${evidence.evidence_identifier || evidence.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div id="unified-forensic-results" className="card" style={{ marginTop: '1.25rem', padding: '1.25rem' }}>
      {/* Header & Investigation Overview */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <span style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '0.3rem', 
              background: 'var(--primary-light)', 
              color: 'var(--primary-color)', 
              fontSize: '0.72rem', 
              fontWeight: 700, 
              padding: '0.15rem 0.5rem', 
              borderRadius: '4px',
              textTransform: 'uppercase'
            }}>
              <ShieldCheck size={13} />
              Unified Forensic Results
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Evidence #{evidence.id} ({evidence.original_filename})
            </span>
          </div>
          <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700 }}>
            Forensic Findings & Evidentiary Synthesis
          </h2>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.825rem', color: 'var(--text-muted)', maxWidth: '780px' }}>
            Multi-modal synthesis of completed forensic examinations. Provides structured, plain-language interpretation of physical, compression, and sensor artifacts without automated authenticity scoring.
          </p>
        </div>

        {/* Global Action Controls */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {onRefresh && (
            <button
              type="button"
              className="secondary-button"
              onClick={onRefresh}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
              title="Refresh examination status and results"
            >
              <RefreshCw size={13} />
              Refresh
            </button>
          )}
          <button
            type="button"
            className="secondary-button"
            onClick={handleDownloadReportJson}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
            title="Download complete structured forensic evidence report (JSON)"
          >
            <Download size={14} />
            Export Evidentiary Summary
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', 
        gap: '0.65rem', 
        marginBottom: '1.25rem' 
      }}>
        <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', padding: '0.65rem', borderRadius: '6px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>COMPLETED</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary-color)' }}>{metrics.completed} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>/ {metrics.total}</span></div>
        </div>

        <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', padding: '0.65rem', borderRadius: '6px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>WITH OBSERVATIONS</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: metrics.withObservations > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{metrics.withObservations}</div>
        </div>

        <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', padding: '0.65rem', borderRadius: '6px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>FAILED EXECUTIONS</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: metrics.failed > 0 ? '#ef4444' : 'var(--text-muted)' }}>{metrics.failed}</div>
        </div>

        <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', padding: '0.65rem', borderRadius: '6px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>INCOMPATIBLE / SKIPPED</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-muted)' }}>{metrics.incompatible}</div>
        </div>

        <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', padding: '0.65rem', borderRadius: '6px' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>SPATIAL REGIONS</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: spatialRegions.length > 0 ? '#10b981' : 'var(--text-muted)' }}>{spatialRegions.length}</div>
        </div>
      </div>

      {/* Non-Authoritative Scientific Disclaimer Banner */}
      <div style={{ 
        background: 'rgba(59, 130, 246, 0.06)', 
        border: '1px solid rgba(59, 130, 246, 0.25)', 
        borderRadius: '6px', 
        padding: '0.75rem 0.9rem', 
        marginBottom: '1.25rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.65rem'
      }}>
        <Info size={18} style={{ color: '#3b82f6', flexShrink: 0, marginTop: '0.1rem' }} />
        <div style={{ fontSize: '0.78rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text-color)' }}>Evidentiary Neutrality Notice:</strong> Forensic algorithms measure physical, mathematical, and statistical deviations. Anomaly flags indicate localized statistical variance (e.g. sharp natural edges, lighting gradients, or re-encoding) and <em>do not constitute binary proof of human tampering</em>. ForenSight deliberately avoids automated "authenticity percentages" or binary verdicts.
        </div>
      </div>

      {/* Internal Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '0.4rem', 
        borderBottom: '1px solid var(--border-color)', 
        marginBottom: '1.25rem',
        overflowX: 'auto'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 0.85rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'overview' ? '2px solid var(--primary-color)' : '2px solid transparent',
            background: 'transparent',
            color: activeTab === 'overview' ? 'var(--primary-color)' : 'var(--text-muted)'
          }}
        >
          <Layers size={14} />
          Investigation Overview
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('spatial')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 0.85rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'spatial' ? '2px solid var(--primary-color)' : '2px solid transparent',
            background: 'transparent',
            color: activeTab === 'spatial' ? 'var(--primary-color)' : 'var(--text-muted)'
          }}
        >
          <Crosshair size={14} />
          Spatial Attention Map ({spatialRegions.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('disclosures')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 0.85rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'disclosures' ? '2px solid var(--primary-color)' : '2px solid transparent',
            background: 'transparent',
            color: activeTab === 'disclosures' ? 'var(--primary-color)' : 'var(--text-muted)'
          }}
        >
          <Sparkles size={14} />
          Plain-Language Interpretations ({metrics.completed})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('findings')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 0.85rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'findings' ? '2px solid var(--primary-color)' : '2px solid transparent',
            background: 'transparent',
            color: activeTab === 'findings' ? 'var(--primary-color)' : 'var(--text-muted)'
          }}
        >
          <FileCheck2 size={14} />
          Consolidated Observations & Facts
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('report')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 0.85rem',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            borderBottom: activeTab === 'report' ? '2px solid var(--primary-color)' : '2px solid transparent',
            background: 'transparent',
            color: activeTab === 'report' ? 'var(--primary-color)' : 'var(--text-muted)'
          }}
        >
          <FileText size={14} />
          Evidentiary Report Preview
        </button>
      </div>

      {/* TAB 1: INVESTIGATION OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Evidence Provenance Card */}
          <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={16} style={{ color: 'var(--primary-color)' }} />
              Evidence Authenticity Baseline & Verification
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', fontSize: '0.78rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>SHA-256 Digest:</span>
                <div style={{ fontFamily: 'monospace', fontWeight: 600, wordBreak: 'break-all', marginTop: '0.15rem' }}>
                  {evidence.sha256_hash || 'Computed on ingestion'}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Container Format:</span>
                <div style={{ fontWeight: 600, marginTop: '0.15rem' }}>
                  {evidence.image_format || evidence.mime_type || 'Unknown'} ({isJpeg ? 'Lossy DCT Compression' : 'Lossless Raster Container'})
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Dimensions & File Size:</span>
                <div style={{ fontWeight: 600, marginTop: '0.15rem' }}>
                  {evidence.width} × {evidence.height} px ({evidence.file_size ? `${(evidence.file_size / 1024).toFixed(1)} KB` : 'N/A'})
                </div>
              </div>
            </div>
          </div>

          {/* Quick Engine Execution Status Matrix */}
          <div>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.92rem' }}>
              Execution Summary across 23 Registered Forensic Engines
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.55rem' }}>
              {FORENSIC_EXAMINATION_CATALOGUE.map(exam => {
                const exec = getEngineExecution(exam);
                const isSelected = !!expandedEngines[exam.id];

                let badgeColor = 'var(--text-muted)';
                let badgeBg = 'var(--surface-color-light)';
                let statusLabel = 'Not Executed';

                if (exec.status === 'COMPLETED') {
                  badgeColor = '#10b981';
                  badgeBg = 'rgba(16, 185, 129, 0.1)';
                  statusLabel = 'Completed';
                } else if (exec.status === 'FAILED') {
                  badgeColor = '#ef4444';
                  badgeBg = 'rgba(239, 68, 68, 0.1)';
                  statusLabel = 'Execution Failed';
                } else if (exec.status === 'RUNNING') {
                  badgeColor = '#3b82f6';
                  badgeBg = 'rgba(59, 130, 246, 0.1)';
                  statusLabel = 'Analyzing...';
                } else if (exec.status === 'QUEUED') {
                  badgeColor = '#f59e0b';
                  badgeBg = 'rgba(245, 158, 11, 0.1)';
                  statusLabel = 'Queued';
                } else if (exec.status === 'INCOMPATIBLE') {
                  badgeColor = 'var(--text-muted)';
                  badgeBg = 'rgba(156, 163, 175, 0.1)';
                  statusLabel = 'Incompatible Format';
                }

                return (
                  <div 
                    key={exam.id} 
                    onClick={() => {
                      if (exec.status === 'COMPLETED' || exec.status === 'FAILED') {
                        setExpandedEngines(prev => ({ ...prev, [exam.id]: true }));
                        setActiveTab('disclosures');
                      }
                    }}
                    style={{
                      background: 'var(--surface-color-light)',
                      border: isSelected ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '0.55rem 0.75rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: exec.status === 'COMPLETED' ? 'pointer' : 'default',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{exam.shortName || exam.name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{exam.technicalId}</div>
                    </div>
                    <span style={{ 
                      fontSize: '0.68rem', 
                      fontWeight: 700, 
                      padding: '0.15rem 0.45rem', 
                      borderRadius: '4px', 
                      color: badgeColor, 
                      background: badgeBg 
                    }}>
                      {statusLabel}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SPATIAL ATTENTION MAP */}
      {activeTab === 'spatial' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Spatial Controls */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            flexWrap: 'wrap', 
            gap: '0.75rem',
            background: 'var(--surface-color-light)',
            border: '1px solid var(--border-color)',
            padding: '0.65rem 0.85rem',
            borderRadius: '6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                <Sliders size={14} style={{ color: 'var(--text-muted)' }} />
                <span>Opacity: {Math.round(heatmapOpacity * 100)}%</span>
                <input 
                  type="range" 
                  min="0.1" 
                  max="1.0" 
                  step="0.05" 
                  value={heatmapOpacity} 
                  onChange={e => setHeatmapOpacity(parseFloat(e.target.value))}
                  style={{ width: '90px', cursor: 'pointer' }}
                />
              </div>

              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowOverlays(!showOverlays)}
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                {showOverlays ? <EyeOff size={13} /> : <Eye size={13} />}
                {showOverlays ? 'Hide All Overlays' : 'Show Overlays'}
              </button>
            </div>

            {/* Layer Toggles */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={visibleLayers['ELA']} 
                  onChange={e => setVisibleLayers({ ...visibleLayers, ELA: e.target.checked })} 
                />
                <span style={{ color: '#ef4444', fontWeight: 600 }}>ELA Compression</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={visibleLayers['NOISE']} 
                  onChange={e => setVisibleLayers({ ...visibleLayers, NOISE: e.target.checked })} 
                />
                <span style={{ color: '#06b6d4', fontWeight: 600 }}>Noise Residual</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={visibleLayers['COPY_MOVE']} 
                  onChange={e => setVisibleLayers({ ...visibleLayers, COPY_MOVE: e.target.checked })} 
                />
                <span style={{ color: '#10b981', fontWeight: 600 }}>Keypoint Clones</span>
              </label>
            </div>
          </div>

          {/* Canvas & Overlay Viewport */}
          <div style={{ 
            position: 'relative', 
            width: '100%', 
            maxWidth: '920px', 
            margin: '0 auto', 
            background: '#09090b', 
            borderRadius: '8px', 
            overflow: 'hidden', 
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 20px -2px rgba(0,0,0,0.25)'
          }}>
            <AuthenticatedImage
              src={`/api/evidence/${evidence.id}/raw`}
              alt={evidence.original_filename}
              style={{ width: '100%', height: 'auto', display: 'block' }}
            />

            {/* SVG Anomaly Coordinates Overlay */}
            {showOverlays && (
              <svg 
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
              >
                {spatialRegions.map((region) => {
                  const isLayerVisible = 
                    (region.engineId === 'ela' && visibleLayers['ELA']) ||
                    ((region.engineId === 'noise' || region.engineId === 'advanced-noise') && visibleLayers['NOISE']) ||
                    ((region.engineId === 'copy-move' || region.engineId === 'clone-block' || region.engineId === 'clone-keypoint') && visibleLayers['COPY_MOVE']) ||
                    (region.engineId === 'color-channel' && visibleLayers['COLOR_CHANNEL']);

                  if (!isLayerVisible) return null;

                  const isSelected = selectedRegionId === region.id;
                  const rx = region.x * 1000;
                  const ry = region.y * 1000;
                  const rw = region.width * 1000;
                  const rh = region.height * 1000;

                  return (
                    <g 
                      key={region.id} 
                      style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                      onClick={() => setSelectedRegionId(isSelected ? null : region.id)}
                    >
                      <rect
                        x={rx}
                        y={ry}
                        width={rw}
                        height={rh}
                        fill={region.color}
                        fillOpacity={isSelected ? 0.6 : region.intensity * heatmapOpacity * 0.4}
                        stroke={isSelected ? '#ffffff' : region.color}
                        strokeWidth={isSelected ? '4' : '2.5'}
                        strokeDasharray={isSelected ? 'none' : '6 3'}
                      />
                      <rect
                        x={rx}
                        y={Math.max(0, ry - 22)}
                        width={Math.min(240, Math.max(120, rw))}
                        height={20}
                        fill={region.color}
                        fillOpacity={Math.max(0.75, heatmapOpacity)}
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
                        {region.modalityLabel.split(' ')[0]}: {region.description.slice(0, 24)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Clean baseline notice if 0 spatial regions */}
            {spatialRegions.length === 0 && (
              <div style={{
                position: 'absolute',
                bottom: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(15, 23, 42, 0.88)',
                color: '#94a3b8',
                padding: '0.45rem 1rem',
                borderRadius: '20px',
                fontSize: '0.78rem',
                pointerEvents: 'none',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255,255,255,0.1)'
              }}>
                🛡️ Clean Baseline: No spatial anomaly regions detected across active examinations
              </div>
            )}
          </div>

          {/* Interactive Region Inspector Card */}
          {selectedRegionId && (
            <div style={{
              background: 'var(--surface-color-light)',
              border: '1px solid var(--primary-border)',
              borderRadius: '6px',
              padding: '0.75rem 1rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              {(() => {
                const reg = spatialRegions.find(r => r.id === selectedRegionId);
                if (!reg) return null;
                return (
                  <div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: reg.color, textTransform: 'uppercase' }}>
                      Selected Anomaly Region: {reg.modalityLabel}
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.2rem' }}>
                      {reg.description}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      Coordinates: ({Math.round(reg.x * 100)}%, {Math.round(reg.y * 100)}%) — Size: {Math.round(reg.width * 100)}% × {Math.round(reg.height * 100)}%
                    </div>
                  </div>
                );
              })()}
              <button 
                type="button" 
                className="secondary-button" 
                onClick={() => setSelectedRegionId(null)}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                Clear Focus
              </button>
            </div>
          )}

          {/* Spatial Output Eligibility Matrix Legend */}
          <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.85rem' }}>
            <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.82rem' }}>Spatial Output Capability Matrix Notice</h5>
            <p style={{ margin: 0, fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
              Only examinations with localized pixel matrices produce spatial bounding overlays (e.g. ELA, Noise, Clone SIFT, Color Disparity, Resampling). Global transform examinations (such as JPEG DCT 8×8 block histograms, 2D Fourier spectra, EXIF container headers, and PRNU device matching) analyze whole-frame or frequency-domain properties and do not produce localized pixel overlays.
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: PLAIN-LANGUAGE INTERPRETATIONS */}
      {activeTab === 'disclosures' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Plain-language disclosures explain what each forensic engine examined, what was observed, what those observations may indicate, and the crucial limitations that prevent automated conclusions.
          </p>

          {FORENSIC_EXAMINATION_CATALOGUE.map(exam => {
            const exec = getEngineExecution(exam);
            if (exec.status === 'NOT_RUN') return null;

            const isExpanded = !!expandedEngines[exam.id];
            const interp = getPlainLanguageInterpretation(exam, exec);

            return (
              <div 
                key={exam.id}
                style={{
                  background: 'var(--surface-color-light)',
                  border: isExpanded ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                  borderRadius: '6px',
                  overflow: 'hidden'
                }}
              >
                {/* Accordion Header */}
                <div 
                  data-testid={`disclosure-header-${exam.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedEngines(prev => ({ ...prev, [exam.id]: !prev[exam.id] }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpandedEngines(prev => ({ ...prev, [exam.id]: !prev[exam.id] }));
                    }
                  }}
                  style={{
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: isExpanded ? 'rgba(59, 130, 246, 0.04)' : 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    {exec.status === 'COMPLETED' ? (
                      <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                    ) : exec.status === 'FAILED' ? (
                      <XCircle size={16} style={{ color: '#ef4444' }} />
                    ) : (
                      <Clock size={16} style={{ color: '#f59e0b' }} />
                    )}
                    <div>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{exam.name}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '0.5rem', fontFamily: 'monospace' }}>
                        [{exam.technicalId}]
                      </span>
                      {exec.status === 'FAILED' && (
                        <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: '3px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 700, marginLeft: '0.5rem' }}>
                          Execution Failed
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isSpatialEngine(exam.id) ? (
                      <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '3px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontWeight: 600 }}>
                        Spatial Overlay
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '3px', background: 'rgba(107, 114, 128, 0.1)', color: 'var(--text-muted)' }}>
                        Global Metric
                      </span>
                    )}
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Structured 5-Part Disclosure Content */}
                {isExpanded && (
                  <div style={{ padding: '0.75rem 1rem 1rem 1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {exec.status === 'FAILED' ? (
                      <div style={{ background: 'rgba(239, 68, 68, 0.08)', borderLeft: '3px solid #ef4444', padding: '0.65rem', borderRadius: '4px' }}>
                        <strong style={{ color: '#ef4444' }}>Execution Failed:</strong> {exec.error || 'The analysis engine failed to complete its execution.'}
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          Notice: A failed examination indicates a system or parsing fault, NOT an absence of tampering. Do not infer authenticity from a failed execution.
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ borderLeft: '3px solid #3b82f6', paddingLeft: '0.65rem' }}>
                          <strong style={{ color: '#3b82f6', fontSize: '0.72rem', textTransform: 'uppercase' }}>1. What was examined</strong>
                          <p style={{ margin: '0.2rem 0 0 0', lineHeight: 1.45 }}>{interp.whatExamined}</p>
                        </div>

                        <div style={{ borderLeft: '3px solid #10b981', paddingLeft: '0.65rem' }}>
                          <strong style={{ color: '#10b981', fontSize: '0.72rem', textTransform: 'uppercase' }}>2. What was observed</strong>
                          <p style={{ margin: '0.2rem 0 0 0', lineHeight: 1.45, fontWeight: 600 }}>{interp.whatObserved}</p>
                        </div>

                        <div style={{ borderLeft: '3px solid #f59e0b', paddingLeft: '0.65rem' }}>
                          <strong style={{ color: '#f59e0b', fontSize: '0.72rem', textTransform: 'uppercase' }}>3. What this may indicate</strong>
                          <p style={{ margin: '0.2rem 0 0 0', lineHeight: 1.45 }}>{interp.mayIndicate}</p>
                        </div>

                        <div style={{ borderLeft: '3px solid #ef4444', paddingLeft: '0.65rem' }}>
                          <strong style={{ color: '#ef4444', fontSize: '0.72rem', textTransform: 'uppercase' }}>4. What this does not establish</strong>
                          <p style={{ margin: '0.2rem 0 0 0', lineHeight: 1.45, fontStyle: 'italic', color: 'var(--text-muted)' }}>{interp.doesNotEstablish}</p>
                        </div>

                        <div style={{ marginTop: '0.25rem' }}>
                          <details style={{ background: 'var(--surface-color)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                            <summary style={{ cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                              5. Technical Details & Raw Measurements
                            </summary>
                            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                              {onNavigateToViewer && (
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => onNavigateToViewer('all')}
                                  style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                                >
                                  <Maximize2 size={12} />
                                  Inspect in Analyst Workbench
                                </button>
                              )}
                            </div>
                            <pre style={{ margin: '0.5rem 0 0 0', fontSize: '0.68rem', overflowX: 'auto', maxHeight: '180px', padding: '0.4rem', background: '#09090b', color: '#e4e4e7', borderRadius: '4px' }}>
                              {JSON.stringify(interp.technicalDetails, null, 2)}
                            </pre>
                          </details>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 4: CONSOLIDATED FINDINGS & FACTS */}
      {activeTab === 'findings' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          {/* Quadrant 1: Verified Facts */}
          <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.9rem' }}>
            <h4 style={{ margin: '0 0 0.65rem 0', fontSize: '0.88rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheck size={16} />
              1. Verified Provenance & Container Facts
            </h4>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.78rem', lineHeight: 1.5 }}>
              <li><strong>SHA-256 Digest:</strong> {evidence.sha256_hash ? `${evidence.sha256_hash.slice(0, 16)}…` : 'Recorded on upload'}</li>
              <li><strong>Container Type:</strong> {evidence.image_format || evidence.mime_type}</li>
              <li><strong>Dimensions:</strong> {evidence.width} × {evidence.height} pixels</li>
              <li><strong>Storage Size:</strong> {evidence.file_size ? `${(evidence.file_size / 1024).toFixed(1)} KB` : 'N/A'}</li>
              <li><strong>Registered Hash-Chain Audit Event:</strong> Recorded in SQLite append-only chain</li>
            </ul>
          </div>

          {/* Quadrant 2: Algorithmic Observations */}
          <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.9rem' }}>
            <h4 style={{ margin: '0 0 0.65rem 0', fontSize: '0.88rem', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Crosshair size={16} />
              2. Algorithmic Numerical Observations
            </h4>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.78rem', lineHeight: 1.5 }}>
              <li><strong>Spatial Anomaly Envelopes:</strong> {spatialRegions.length} localized coordinate zones detected</li>
              <li><strong>Examinations Executed:</strong> {metrics.completed} successful, {metrics.failed} failed</li>
              <li><strong>Coincident Anomaly Modalities:</strong> {Array.from(new Set(spatialRegions.map(r => r.modalityLabel))).join(', ') || 'None detected'}</li>
            </ul>
          </div>

          {/* Quadrant 3: Forensic Interpretations */}
          <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.9rem' }}>
            <h4 style={{ margin: '0 0 0.65rem 0', fontSize: '0.88rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sparkles size={16} />
              3. Plausible Forensic Interpretations
            </h4>
            <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.45 }}>
              {spatialRegions.length > 0 
                ? 'Coincident spatial error variance across independent models (compression variance + sensor noise discrepancy) increases investigative interest. An examiner should inspect these areas in the Microscopy & Loupe tool to evaluate whether texture boundaries explain the variance.'
                : 'Current parameters isolate no significant localized anomalies above standard statistical boundaries across completed models.'}
            </p>
          </div>

          {/* Quadrant 4: Evidentiary Limitations */}
          <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.9rem' }}>
            <h4 style={{ margin: '0 0 0.65rem 0', fontSize: '0.88rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertTriangle size={16} />
              4. Important Evidentiary Limitations
            </h4>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.78rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
              <li>Correlated observations between multiple compression engines must not be double-counted as independent evidence.</li>
              <li>Camera sensor attribution requires reference profile models from the suspect device.</li>
              <li>High native edge contrast naturally generates ELA variance without editing.</li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 5: EVIDENTIARY REPORT PREVIEW */}
      {activeTab === 'report' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem' }}>Investigation Evidentiary Report Preview</h4>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Case: {caseId || 'Standalone Examination'} | Evidence ID: {evidence.id}</span>
              </div>
              <button 
                type="button" 
                className="secondary-button" 
                onClick={handleDownloadReportJson}
                style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <Download size={13} />
                Download JSON Report
              </button>
            </div>

            {/* Examiner Notes Section */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                Examiner Qualitative Findings & Context Notes (Human Analyst Entry):
              </label>
              <textarea
                value={examinerNotes}
                onChange={e => setExaminerNotes(e.target.value)}
                placeholder="Enter human examiner notes, investigative hypotheses, contextual observations, or justification for further forensic inquiry..."
                rows={4}
                style={{
                  width: '100%',
                  background: 'var(--surface-color)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  padding: '0.5rem',
                  fontSize: '0.78rem',
                  color: 'var(--text-color)',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Structured Report Breakdown */}
            <div style={{ fontSize: '0.78rem', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <strong>Section 1 — Evidence Provenance:</strong> Verified SHA-256 hash <code>{evidence.sha256_hash}</code>. Original filename: {evidence.original_filename}. Container format: {evidence.image_format || evidence.mime_type}.
              </div>

              <div>
                <strong>Section 2 — Examination Inventory:</strong> Total of {metrics.completed} examinations completed successfully. {metrics.failed} failed executions. {metrics.incompatible} incompatible format exclusions.
              </div>

              <div>
                <strong>Section 3 — Automated Algorithmic Observations:</strong> {spatialRegions.length} spatial anomaly envelopes identified across active modalities. No overall authenticity score generated.
              </div>

              <div>
                <strong>Section 4 — Evidentiary Limitations & Legal Notice:</strong> Algorithmic measurements are probabilistic indicators and do not constitute legal certification or definitive proof of tampering. Correlated findings share underlying physical assumptions.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
