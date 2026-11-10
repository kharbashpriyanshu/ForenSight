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
  engineName: string;
  modalityLabel: string;
  role?: 'source' | 'destination' | 'anomaly';
  color: string;
  // Bounding box in original evidence image pixels
  pixelX: number;
  pixelY: number;
  pixelWidth: number;
  pixelHeight: number;
  // Normalized 0..1 coordinates for responsive alignment
  normX: number;
  normY: number;
  normWidth: number;
  normHeight: number;
  // Backward compatibility aliases
  x: number;
  y: number;
  width: number;
  height: number;
  intensity: number;
  description: string;
  metadata?: Record<string, any>;
}

/**
 * Validates and normalizes candidate bounding boxes into original pixel dimensions.
 * Rejects non-finite, negative, zero-size, or entirely out-of-bounds regions.
 */
export function validateAndNormalizeRegion({
  id,
  engineId,
  engineName,
  modalityLabel,
  role = 'anomaly',
  color,
  x,
  y,
  width,
  height,
  imageWidth,
  imageHeight,
  intensity = 0.75,
  description,
  metadata
}: {
  id: string;
  engineId: string;
  engineName: string;
  modalityLabel: string;
  role?: 'source' | 'destination' | 'anomaly';
  color: string;
  x: any;
  y: any;
  width: any;
  height: any;
  imageWidth: number;
  imageHeight: number;
  intensity?: number;
  description: string;
  metadata?: Record<string, any>;
}): SpatialRegion | null {
  const px = Number(x);
  const py = Number(y);
  const pw = Number(width);
  const ph = Number(height);

  if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pw) || !Number.isFinite(ph)) {
    return null;
  }
  if (pw <= 0 || ph <= 0) {
    return null;
  }
  if (imageWidth <= 0 || imageHeight <= 0) {
    return null;
  }

  // Reject regions strictly outside image dimensions
  if (px >= imageWidth || py >= imageHeight || (px + pw) <= 0 || (py + ph) <= 0) {
    return null;
  }

  // Clamp bounding box to image boundaries
  const clampedX = Math.max(0, px);
  const clampedY = Math.max(0, py);
  const clampedW = Math.min(imageWidth - clampedX, pw - (clampedX - px));
  const clampedH = Math.min(imageHeight - clampedY, ph - (clampedY - py));

  if (clampedW <= 0 || clampedH <= 0) {
    return null;
  }

  const normX = clampedX / imageWidth;
  const normY = clampedY / imageHeight;
  const normWidth = clampedW / imageWidth;
  const normHeight = clampedH / imageHeight;

  return {
    id,
    engineId,
    engineName,
    modalityLabel,
    role,
    color,
    pixelX: clampedX,
    pixelY: clampedY,
    pixelWidth: clampedW,
    pixelHeight: clampedH,
    normX,
    normY,
    normWidth,
    normHeight,
    x: normX,
    y: normY,
    width: normWidth,
    height: normHeight,
    intensity: Math.max(0.1, Math.min(1.0, intensity)),
    description,
    metadata
  };
}

/**
 * Checks whether an engine possesses genuine vector localization capability (returns bounding envelopes).
 */
export const isVectorSpatialEngine = (id: string): boolean => {
  const clean = id.toLowerCase().replace(/_/g, '-');
  return [
    'advanced-noise',
    'copy-move',
    'clone-keypoint',
    'clone-block',
    'color-channel',
    'resampling',
    'blocking-artifact',
    'jpeg-ghost'
  ].includes(clean);
};

/**
 * Checks whether an engine generates full-frame raster residual artifacts rather than discrete vector bounding envelopes.
 */
export const isRasterArtifactEngine = (id: string): boolean => {
  const clean = id.toLowerCase().replace(/_/g, '-');
  return ['ela', 'noise'].includes(clean);
};

/**
 * Reconciled spatial extraction logic grounded in actual backend engine output contracts.
 */
export function extractSpatialRegions(
  results: Record<string, any>,
  imageWidth?: number,
  imageHeight?: number
): SpatialRegion[] {
  // Authoritative image dimensions required for spatial mapping without distortion
  if (!imageWidth || !imageHeight || imageWidth <= 0 || imageHeight <= 0) {
    return [];
  }
  const imgW = imageWidth;
  const imgH = imageHeight;
  const list: SpatialRegion[] = [];

  const getFindings = (engineId: string) => {
    const hyp = engineId.toLowerCase().replace(/_/g, '-');
    const und = engineId.toLowerCase().replace(/-/g, '_');
    const uppHyp = hyp.toUpperCase();
    const uppUnd = und.toUpperCase();
    return (
      results[hyp]?.structured_findings || 
      results[und]?.structured_findings || 
      results[uppHyp]?.structured_findings || 
      results[uppUnd]?.structured_findings || 
      results[engineId]?.structured_findings || 
      null
    );
  };

  // 1. Advanced Noise (local_consistency.candidate_regions with bounding_box: [x, y, w, h])
  const advNoiseFindings = getFindings('advanced-noise') || getFindings('noise');
  const advNoiseCandidates = advNoiseFindings?.local_consistency?.candidate_regions;
  if (Array.isArray(advNoiseCandidates)) {
    advNoiseCandidates.forEach((cr: any, idx: number) => {
      const bb = cr.bounding_box;
      if (Array.isArray(bb) && bb.length >= 4) {
        const reg = validateAndNormalizeRegion({
          id: `adv-noise-${cr.region_id || idx}`,
          engineId: 'advanced-noise',
          engineName: 'Advanced Noise Inconsistency',
          modalityLabel: 'Noise Variance Anomaly',
          color: '#06b6d4',
          x: bb[0],
          y: bb[1],
          width: bb[2],
          height: bb[3],
          imageWidth: imgW,
          imageHeight: imgH,
          intensity: Math.min(1.0, Math.max(0.4, (Math.abs(Number(cr.max_deviation_z || 2.5)) / 4.0))),
          description: `Local noise variance deviation (|z|=${Number(cr.max_deviation_z || 0).toFixed(2)})`,
          metadata: cr
        });
        if (reg) list.push(reg);
      }
    });
  }

  // 2. Classical Copy-Move SIFT (candidate_regions: { source_bounding_box: [x, y, w, h], destination_bounding_box: [x, y, w, h] })
  const copyMoveFindings = getFindings('copy-move');
  const cmCandidates = copyMoveFindings?.candidate_regions;
  if (cmCandidates && typeof cmCandidates === 'object') {
    const sBox = cmCandidates.source_bounding_box;
    if (Array.isArray(sBox) && sBox.length >= 4) {
      const sReg = validateAndNormalizeRegion({
        id: `copy-move-src`,
        engineId: 'copy-move',
        engineName: 'Classical Copy-Move (SIFT)',
        modalityLabel: 'Clone Source (SIFT)',
        role: 'source',
        color: '#10b981',
        x: sBox[0],
        y: sBox[1],
        width: sBox[2],
        height: sBox[3],
        imageWidth: imgW,
        imageHeight: imgH,
        intensity: 0.85,
        description: `Duplicated source region (${cmCandidates.supporting_matches || 'RANSAC inlier'} matches)`,
        metadata: { role: 'source', ...cmCandidates }
      });
      if (sReg) list.push(sReg);
    }

    const dBox = cmCandidates.destination_bounding_box;
    if (Array.isArray(dBox) && dBox.length >= 4) {
      const dReg = validateAndNormalizeRegion({
        id: `copy-move-dst`,
        engineId: 'copy-move',
        engineName: 'Classical Copy-Move (SIFT)',
        modalityLabel: 'Clone Destination (SIFT)',
        role: 'destination',
        color: '#34d399',
        x: dBox[0],
        y: dBox[1],
        width: dBox[2],
        height: dBox[3],
        imageWidth: imgW,
        imageHeight: imgH,
        intensity: 0.85,
        description: `Duplicated destination region (${cmCandidates.supporting_matches || 'RANSAC inlier'} matches)`,
        metadata: { role: 'destination', ...cmCandidates }
      });
      if (dReg) list.push(dReg);
    }
  }

  // 3. Clone-Keypoint ORB (candidate_regions: [{ source_bounding_box: [x1, y1, x2, y2], target_bounding_box: [x1, y1, x2, y2] }])
  const cloneKpFindings = getFindings('clone-keypoint');
  const cloneKpCandidates = cloneKpFindings?.candidate_regions;
  if (Array.isArray(cloneKpCandidates)) {
    cloneKpCandidates.forEach((cr: any, idx: number) => {
      const sBox = cr.source_bounding_box;
      if (Array.isArray(sBox) && sBox.length >= 4) {
        const sReg = validateAndNormalizeRegion({
          id: `clone-kp-src-${idx}`,
          engineId: 'clone-keypoint',
          engineName: 'Clone Keypoint Pairs (ORB)',
          modalityLabel: 'Clone Source (ORB)',
          role: 'source',
          color: '#8b5cf6',
          x: sBox[0],
          y: sBox[1],
          width: sBox[2] - sBox[0],
          height: sBox[3] - sBox[1],
          imageWidth: imgW,
          imageHeight: imgH,
          intensity: 0.8,
          description: `Keypoint source cluster (${cr.inlier_keypoint_count || 0} inliers)`,
          metadata: { role: 'source', ...cr }
        });
        if (sReg) list.push(sReg);
      }

      const tBox = cr.target_bounding_box;
      if (Array.isArray(tBox) && tBox.length >= 4) {
        const tReg = validateAndNormalizeRegion({
          id: `clone-kp-dst-${idx}`,
          engineId: 'clone-keypoint',
          engineName: 'Clone Keypoint Pairs (ORB)',
          modalityLabel: 'Clone Target (ORB)',
          role: 'destination',
          color: '#a78bfa',
          x: tBox[0],
          y: tBox[1],
          width: tBox[2] - tBox[0],
          height: tBox[3] - tBox[1],
          imageWidth: imgW,
          imageHeight: imgH,
          intensity: 0.8,
          description: `Keypoint target cluster (${cr.inlier_keypoint_count || 0} inliers)`,
          metadata: { role: 'destination', ...cr }
        });
        if (tReg) list.push(tReg);
      }
    });
  }

  // 4. Clone-Block (candidate_regions: [{ source_bounding_box: [x, y, w, h], target_bounding_box: [x, y, w, h] }])
  const cloneBlkFindings = getFindings('clone-block');
  const cloneBlkCandidates = cloneBlkFindings?.candidate_regions;
  if (Array.isArray(cloneBlkCandidates)) {
    cloneBlkCandidates.forEach((cr: any, idx: number) => {
      const sBox = cr.source_bounding_box;
      if (Array.isArray(sBox) && sBox.length >= 4) {
        const sReg = validateAndNormalizeRegion({
          id: `clone-blk-src-${idx}`,
          engineId: 'clone-block',
          engineName: 'Clone Block Correlation',
          modalityLabel: 'Clone Source (Block)',
          role: 'source',
          color: '#ec4899',
          x: sBox[0],
          y: sBox[1],
          width: sBox[2],
          height: sBox[3],
          imageWidth: imgW,
          imageHeight: imgH,
          intensity: 0.8,
          description: `Duplicate block source (${cr.supporting_pairs_count || 0} pairs)`,
          metadata: { role: 'source', ...cr }
        });
        if (sReg) list.push(sReg);
      }

      const tBox = cr.target_bounding_box;
      if (Array.isArray(tBox) && tBox.length >= 4) {
        const tReg = validateAndNormalizeRegion({
          id: `clone-blk-dst-${idx}`,
          engineId: 'clone-block',
          engineName: 'Clone Block Correlation',
          modalityLabel: 'Clone Target (Block)',
          role: 'destination',
          color: '#f472b6',
          x: tBox[0],
          y: tBox[1],
          width: tBox[2],
          height: tBox[3],
          imageWidth: imgW,
          imageHeight: imgH,
          intensity: 0.8,
          description: `Duplicate block target (${cr.supporting_pairs_count || 0} pairs)`,
          metadata: { role: 'destination', ...cr }
        });
        if (tReg) list.push(tReg);
      }
    });
  }

  // 5. Color Channel Disparity (candidate_regions: [{ x, y, width, height, ... }])
  const colorFindings = getFindings('color-channel');
  const colorCandidates = colorFindings?.candidate_regions;
  if (Array.isArray(colorCandidates)) {
    colorCandidates.forEach((cr: any, idx: number) => {
      const reg = validateAndNormalizeRegion({
        id: `color-channel-${cr.region_id || idx}`,
        engineId: 'color-channel',
        engineName: 'Color Channel Disparity',
        modalityLabel: 'Color Channel Disparity',
        color: '#f59e0b',
        x: cr.x,
        y: cr.y,
        width: cr.width || cr.w,
        height: cr.height || cr.h,
        imageWidth: imgW,
        imageHeight: imgH,
        intensity: 0.75,
        description: `RGB correlation disparity outlier (${cr.block_count || 0} blocks, z=${Number(cr.mean_z_score || 0).toFixed(2)})`,
        metadata: cr
      });
      if (reg) list.push(reg);
    });
  }

  // 6. Resampling Inconsistency (local_consistency.candidate_regions: [{ bounding_box: [x, y, w, h] }])
  const resampFindings = getFindings('resampling');
  const resampCandidates = resampFindings?.local_consistency?.candidate_regions || resampFindings?.candidate_regions;
  if (Array.isArray(resampCandidates)) {
    resampCandidates.forEach((cr: any, idx: number) => {
      const bb = cr.bounding_box;
      if (Array.isArray(bb) && bb.length >= 4) {
        const reg = validateAndNormalizeRegion({
          id: `resamp-${cr.region_id || idx}`,
          engineId: 'resampling',
          engineName: 'Periodic Resampling',
          modalityLabel: 'Resampling Inconsistency',
          color: '#eab308',
          x: bb[0],
          y: bb[1],
          width: bb[2],
          height: bb[3],
          imageWidth: imgW,
          imageHeight: imgH,
          intensity: 0.7,
          description: `Interpolation periodicity candidate (${cr.block_count || 0} blocks)`,
          metadata: cr
        });
        if (reg) list.push(reg);
      }
    });
  }

  // 7. Blocking Artifact Discontinuity (candidate_regions: [{ bounding_box_pixels: { x, y, width, height } }])
  const blockFindings = getFindings('blocking-artifact');
  const blockCandidates = blockFindings?.candidate_regions;
  if (Array.isArray(blockCandidates)) {
    blockCandidates.forEach((cr: any, idx: number) => {
      const bb = cr.bounding_box_pixels;
      if (bb && typeof bb === 'object') {
        const reg = validateAndNormalizeRegion({
          id: `blocking-${cr.region_id || idx}`,
          engineId: 'blocking-artifact',
          engineName: 'Blocking Artifact Discontinuity',
          modalityLabel: 'Blocking Grid Discontinuity',
          color: '#6366f1',
          x: bb.x,
          y: bb.y,
          width: bb.width,
          height: bb.height,
          imageWidth: imgW,
          imageHeight: imgH,
          intensity: 0.7,
          description: `Grid boundary discontinuity (${cr.type || 'outlier'}, z=${Number(cr.mean_z_score || 0).toFixed(2)})`,
          metadata: cr
        });
        if (reg) list.push(reg);
      }
    });
  }

  // 8. JPEG Ghost (candidate_regions: [{ x, y, width, height }])
  const ghostFindings = getFindings('jpeg-ghost');
  const ghostCandidates = ghostFindings?.candidate_regions;
  if (Array.isArray(ghostCandidates)) {
    ghostCandidates.forEach((cr: any, idx: number) => {
      const reg = validateAndNormalizeRegion({
        id: `ghost-${cr.region_id || idx}`,
        engineId: 'jpeg-ghost',
        engineName: 'JPEG Ghost Residual',
        modalityLabel: 'JPEG Ghost Minimum',
        color: '#f97316',
        x: cr.x,
        y: cr.y,
        width: cr.width,
        height: cr.height,
        imageWidth: imgW,
        imageHeight: imgH,
        intensity: 0.75,
        description: `Secondary recompression ghost cluster (diff=${Number(cr.max_mean_difference || 0).toFixed(4)})`,
        metadata: cr
      });
      if (reg) list.push(reg);
    });
  }

  // ELA and Classical Noise produce whole-frame raster artifacts (maps), NOT discrete vector regions.
  // Neither synthesizes artificial bounding boxes here.

  return list;
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
    ADVANCED_NOISE: true,
    COPY_MOVE: true,
    COLOR_CHANNEL: true,
    OTHER_SPATIAL: true
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

  // Authoritative image dimensions required for spatial mapping
  const hasAuthoritativeDimensions = typeof evidence.width === 'number' && 
    typeof evidence.height === 'number' && 
    evidence.width > 0 && 
    evidence.height > 0;
  const imgW = hasAuthoritativeDimensions ? evidence.width : undefined;
  const imgH = hasAuthoritativeDimensions ? evidence.height : undefined;

  // Reconciled spatial regions - extracted only when authoritative image dimensions exist
  const spatialRegions = useMemo<SpatialRegion[]>(() => {
    if (!hasAuthoritativeDimensions || !imgW || !imgH) {
      return [];
    }
    return extractSpatialRegions(results, imgW, imgH);
  }, [results, hasAuthoritativeDimensions, imgW, imgH]);

  // Check availability of continuous raster artifacts (ELA, Classical Noise)
  const hasElaRaster = Boolean(
    results['ela']?.structured_findings?.artifacts?.ela_map ||
    results['ELA']?.structured_findings?.artifacts?.ela_map
  );
  const hasNoiseRaster = Boolean(
    results['noise']?.structured_findings?.artifacts?.noise_residual_map ||
    results['NOISE']?.structured_findings?.artifacts?.noise_residual_map
  );

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
        const findings = exec.result?.structured_findings || {};
        const hasAnomalies = 
          (findings.candidate_regions && findings.candidate_regions.length > 0) ||
          (findings.local_consistency?.candidate_regions && findings.local_consistency.candidate_regions.length > 0) ||
          (findings.candidate_regions?.source_bounding_box !== undefined) ||
          (findings.matching_statistics?.geometric_inliers > 0) ||
          (findings.ghost_minima && findings.ghost_minima.length > 0) ||
          (findings.correlations && findings.candidate_regions?.length > 0);
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
          whatObserved: findings.mean_error !== undefined ? `Mean error difference: ${Number(findings.mean_error).toFixed(2)}, variance: ${Number(findings.variance || 0).toFixed(2)}, std: ${Number(findings.std_error || 0).toFixed(2)}.` : 'Recompression delta computation complete.',
          mayIndicate: findings.mean_error && findings.mean_error > 10.0 ? 'Elevated whole-frame recompression delta, indicating non-uniform compression history or secondary resaving.' : 'Uniform error dissipation across the image plane, consistent with single-generation compression history.',
          doesNotEstablish: 'Natural high-contrast luminance edges and textured surfaces inherently dissipate high compression error without human alteration. ELA generates a continuous raster artifact, not discrete bounding boxes.',
          technicalDetails: findings
        };
      case 'noise':
        return {
          whatExamined: 'High-frequency noise patterns isolated through spatial adaptive median filtering and global/local residual statistics.',
          whatObserved: findings.global_statistics?.mean_residual !== undefined ? `Mean residual: ${Number(findings.global_statistics.mean_residual).toFixed(2)}, std: ${Number(findings.global_statistics.std_residual || 0).toFixed(2)}.` : 'Noise residual map computed.',
          mayIndicate: 'Characterizes sensor-wide noise floor consistency across color planes.',
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
          whatExamined: 'Scale-Invariant Feature Transform (SIFT) interest points with L2 Euclidean nearest-neighbor matching and RANSAC affine geometric verification.',
          whatObserved: findings.candidate_regions?.source_bounding_box ? `Identified paired duplicate regions supported by ${findings.matching_statistics?.geometric_inliers || findings.candidate_regions?.supporting_matches || 0} inlier match vectors.` : 'SIFT descriptor extraction and spatial correspondence search complete.',
          mayIndicate: findings.candidate_regions?.source_bounding_box ? 'Identified duplicate image patches replicated at different spatial positions within the frame.' : 'No geometrically consistent duplicate feature clusters detected.',
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
          whatObserved: findings.correlation_matrix ? `Pearson r(R-G)=${Number(findings.correlation_matrix.r_vs_g || 0).toFixed(3)}, r(R-B)=${Number(findings.correlation_matrix.r_vs_b || 0).toFixed(3)}, r(G-B)=${Number(findings.correlation_matrix.g_vs_b || 0).toFixed(3)}. Outlier regions: ${findings.candidate_region_count || findings.candidate_regions?.length || 0}.` : 'Inter-channel color correlation evaluation complete.',
          mayIndicate: (findings.candidate_regions?.length || 0) > 0 ? 'Identifies localized spatial regions where color channel correlation diverges significantly from the global image baseline.' : 'Uniform RGB channel correlation across the image plane.',
          doesNotEstablish: 'Evaluates RGB correlation disparity, not Color Filter Array (CFA) Bayer demosaicing matrix inversion. Vivid monochromatic subjects and lens chromatic aberrations cause natural disparities.',
          technicalDetails: findings
        };
      case 'advanced-noise':
        return {
          whatExamined: 'Spatial Gaussian residual subtraction with 2D Fast Fourier Transform (FFT) radial frequency band energy distribution analysis.',
          whatObserved: findings.local_consistency?.candidate_regions ? `Identified ${findings.local_consistency.candidate_region_count || findings.local_consistency.candidate_regions.length} candidate noise inconsistency region(s).` : 'Spatial Gaussian residual extraction and radial FFT analysis complete.',
          mayIndicate: 'Identifies localized spatial patches where high-frequency noise variance diverges from the robust image median.',
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
      <div 
        role="tablist" 
        aria-label="Forensic Result Views"
        style={{ 
          display: 'flex', 
          gap: '0.4rem', 
          borderBottom: '1px solid var(--border-color)', 
          marginBottom: '1.25rem',
          overflowX: 'auto'
        }}
      >
        <button
          type="button"
          role="tab"
          id="tab-overview"
          aria-selected={activeTab === 'overview'}
          aria-controls="panel-overview"
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
          role="tab"
          id="tab-spatial"
          aria-selected={activeTab === 'spatial'}
          aria-controls="panel-spatial"
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
          role="tab"
          id="tab-disclosures"
          aria-selected={activeTab === 'disclosures'}
          aria-controls="panel-disclosures"
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
          role="tab"
          id="tab-findings"
          aria-selected={activeTab === 'findings'}
          aria-controls="panel-findings"
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
          <CheckCircle2 size={14} />
          Consolidated Observations & Facts
        </button>

        <button
          type="button"
          role="tab"
          id="tab-report"
          aria-selected={activeTab === 'report'}
          aria-controls="panel-report"
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
        <div role="tabpanel" id="panel-overview" aria-labelledby="tab-overview" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Evidence Integrity Metadata Summary */}
          <div style={{ 
            background: 'var(--surface-color-light)', 
            border: '1px solid var(--border-color)', 
            borderRadius: '6px', 
            padding: '0.85rem 1rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.75rem',
            fontSize: '0.78rem'
          }}>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>FILE IDENTIFIER</span>
              <strong>{evidence.original_filename}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>CONTAINER FORMAT</span>
              <strong>{evidence.image_format || evidence.mime_type || 'Unknown'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>DIMENSIONS</span>
              <strong>{evidence.width && evidence.height ? `${evidence.width} × ${evidence.height} px` : 'N/A'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>SHA-256 HASH VERIFICATION</span>
              <code style={{ fontSize: '0.7rem', color: '#10b981' }}>{evidence.sha256_hash ? `${evidence.sha256_hash.slice(0, 16)}…` : 'Verified'}</code>
            </div>
          </div>

          {/* 23 Engine Catalogue Grid */}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} role="tabpanel" id="panel-spatial" aria-labelledby="tab-spatial">
          {!hasAuthoritativeDimensions ? (
            <div 
              data-testid="spatial-dimensions-unavailable"
              style={{
                padding: '1.5rem',
                borderRadius: '8px',
                background: 'var(--surface-color-light)',
                border: '1px solid var(--border-color)',
                textAlign: 'center',
                margin: '1rem auto',
                maxWidth: '720px'
              }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.5rem' }}>
                <Info size={18} style={{ color: 'var(--primary-color)' }} />
                <span style={{ fontSize: '0.95rem' }}>Spatial Overlays Unavailable</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.825rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                Spatial anomaly overlays are unavailable because authoritative original image dimensions could not be established for this evidence record. In accordance with forensic integrity safeguards, coordinate envelopes are never mapped against estimated dimensions. All mathematical measurements, detection outputs, and scalar metrics remain fully accessible in the detailed disclosures and structured findings below.
              </p>
            </div>
          ) : (
            <>
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
                      aria-label="Spatial overlay opacity"
                      style={{ width: '90px', cursor: 'pointer' }}
                    />
                  </div>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowOverlays(!showOverlays)}
                    aria-pressed={showOverlays}
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
                      checked={visibleLayers['ADVANCED_NOISE']} 
                      onChange={e => setVisibleLayers({ ...visibleLayers, ADVANCED_NOISE: e.target.checked })} 
                    />
                    <span style={{ color: '#06b6d4', fontWeight: 600 }}>Noise Anomaly</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={visibleLayers['COPY_MOVE']} 
                      onChange={e => setVisibleLayers({ ...visibleLayers, COPY_MOVE: e.target.checked })} 
                    />
                    <span style={{ color: '#10b981', fontWeight: 600 }}>Clone Pairs (SIFT/ORB)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={visibleLayers['COLOR_CHANNEL']} 
                      onChange={e => setVisibleLayers({ ...visibleLayers, COLOR_CHANNEL: e.target.checked })} 
                    />
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>Color Disparity</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={visibleLayers['OTHER_SPATIAL']} 
                      onChange={e => setVisibleLayers({ ...visibleLayers, OTHER_SPATIAL: e.target.checked })} 
                    />
                    <span style={{ color: '#8b5cf6', fontWeight: 600 }}>Resampling/Blocking</span>
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

                {/* SVG Anomaly Coordinates Overlay in 1:1 Evidence Pixel Geometry */}
                {showOverlays && imgW && imgH && (
                  <svg 
                    data-testid="spatial-overlay-svg"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                    viewBox={`0 0 ${imgW} ${imgH}`}
                    preserveAspectRatio="none"
                  >
                    {spatialRegions.map((region) => {
                      const isLayerVisible = 
                        ((region.engineId === 'advanced-noise' || region.engineId === 'noise') && visibleLayers['ADVANCED_NOISE']) ||
                        ((region.engineId === 'copy-move' || region.engineId === 'clone-block' || region.engineId === 'clone-keypoint') && visibleLayers['COPY_MOVE']) ||
                        (region.engineId === 'color-channel' && visibleLayers['COLOR_CHANNEL']) ||
                        ((region.engineId === 'resampling' || region.engineId === 'blocking-artifact' || region.engineId === 'jpeg-ghost') && visibleLayers['OTHER_SPATIAL']);

                      if (!isLayerVisible) return null;

                      const isSelected = selectedRegionId === region.id;
                      const rx = region.pixelX;
                      const ry = region.pixelY;
                      const rw = region.pixelWidth;
                      const rh = region.pixelHeight;
                      const strokeWidth = isSelected ? Math.max(3, Math.round(imgW * 0.003)) : Math.max(2, Math.round(imgW * 0.002));
                      const tagHeight = Math.max(18, Math.round(imgW * 0.016));
                      const fontSize = Math.max(10, Math.min(16, Math.round(imgW * 0.011)));

                      let strokeDash = '6 3';
                      if (region.role === 'source') {
                        strokeDash = '8 4';
                      } else if (region.role === 'destination') {
                        strokeDash = 'none';
                      }

                      return (
                        <g 
                          key={region.id} 
                          style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                          onClick={() => setSelectedRegionId(isSelected ? null : region.id)}
                          tabIndex={0}
                          role="button"
                          aria-label={`${region.modalityLabel}: ${region.description}`}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedRegionId(isSelected ? null : region.id);
                            }
                          }}
                        >
                          <rect
                            x={rx}
                            y={ry}
                            width={rw}
                            height={rh}
                            fill={region.color}
                            fillOpacity={isSelected ? 0.6 : region.intensity * heatmapOpacity * 0.4}
                            stroke={isSelected ? '#ffffff' : region.color}
                            strokeWidth={strokeWidth}
                            strokeDasharray={isSelected ? 'none' : strokeDash}
                          />
                          <rect
                            x={rx}
                            y={Math.max(0, ry - tagHeight - 2)}
                            width={Math.min(imgW * 0.4, Math.max(imgW * 0.14, rw))}
                            height={tagHeight}
                            fill={region.color}
                            fillOpacity={Math.max(0.75, heatmapOpacity)}
                            rx={3}
                          />
                          <text
                            x={rx + 6}
                            y={Math.max(0, ry - tagHeight - 2) + tagHeight - 4}
                            fill="#ffffff"
                            fontSize={fontSize}
                            fontWeight="bold"
                            fontFamily="sans-serif"
                          >
                            {region.role === 'source' ? '[SOURCE] ' : region.role === 'destination' ? '[DEST] ' : ''}
                            {region.modalityLabel}: {region.description.slice(0, 26)}
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
                    🛡️ Clean Baseline: No localized anomaly envelopes detected across active examinations
                  </div>
                )}
              </div>
            </>
          )}

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
                      Selected Anomaly Region: {reg.modalityLabel} {reg.role ? `(${reg.role.toUpperCase()})` : ''}
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.2rem' }}>
                      {reg.description}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      Coordinates: ({reg.pixelX}px, {reg.pixelY}px) — Size: {reg.pixelWidth}px × {reg.pixelHeight}px ({Math.round(reg.normWidth * 100)}% × {Math.round(reg.normHeight * 100)}%)
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

          {/* Raster Artifact Modalities Status Banner */}
          {(hasElaRaster || hasNoiseRaster) && (
            <div style={{
              background: 'rgba(59, 130, 246, 0.06)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              borderRadius: '6px',
              padding: '0.75rem 0.9rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Layers size={16} style={{ color: '#3b82f6', flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-color)' }}>
                  <strong>Raster Heatmaps Available:</strong> Continuous full-frame residual maps ({[hasElaRaster && 'ELA Compression', hasNoiseRaster && 'Noise Residual'].filter(Boolean).join(', ')}) are generated as raster artifacts rather than discrete bounding boxes.
                </span>
              </div>
              {onNavigateToViewer && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onNavigateToViewer('all')}
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.55rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Maximize2 size={12} />
                  Inspect in Analyst Workbench
                </button>
              )}
            </div>
          )}

          {/* Spatial Output Eligibility Matrix Legend */}
          <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.85rem' }}>
            <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.82rem' }}>Spatial Output Capability Matrix Notice</h5>
            <p style={{ margin: 0, fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
              Forensic examinations fall into three distinct analytical categories:
              <br />
              <strong>1. Vector-Localization Engines:</strong> Segment localized pixel matrices and extract bounded coordinate envelopes with discrete source/destination relationships (e.g. <em>Advanced Noise</em>, <em>Classical Copy-Move SIFT</em>, <em>Clone Keypoint ORB</em>, <em>Color Channel Disparity</em>, <em>Resampling</em>, <em>Blocking Discontinuity</em>, <em>JPEG Ghost</em>).
              <br />
              <strong>2. Raster-Artifact Modalities:</strong> Generate continuous full-frame difference images without discrete bounding vectors (e.g. <em>Error Level Analysis (ELA)</em>, <em>Classical Noise Residual</em>). They are inspected via full-frame raster overlays in the Analyst Workbench or Microscopy tool.
              <br />
              <strong>3. Global & Transform Engines:</strong> Measure whole-frame, sensor-wide, or bitstream-level properties that have no localized spatial coordinates (e.g. <em>EXIF Metadata</em>, <em>JPEG DCT 8×8 Block Orthonormal Transform</em>, <em>2D Fourier Power Spectrum</em>, <em>PRNU Device Attribution</em>, <em>Histogram Distribution</em>).
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: PLAIN-LANGUAGE INTERPRETATIONS */}
      {activeTab === 'disclosures' && (
        <div role="tabpanel" id="panel-disclosures" aria-labelledby="tab-disclosures" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Plain-language disclosures explain what each forensic engine examined, what was observed, what those observations may indicate, and the crucial limitations that prevent automated conclusions.
          </p>

          {FORENSIC_EXAMINATION_CATALOGUE.map(exam => {
            const exec = getEngineExecution(exam);
            if (exec.status === 'NOT_RUN') return null;

            const isExpanded = !!expandedEngines[exam.id];
            const interp = getPlainLanguageInterpretation(exam, exec);
            const isVector = isVectorSpatialEngine(exam.id);
            const isRaster = isRasterArtifactEngine(exam.id);

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
                    {isVector ? (
                      <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '3px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontWeight: 600 }}>
                        Vector Overlay
                      </span>
                    ) : isRaster ? (
                      <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem', borderRadius: '3px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontWeight: 600 }}>
                        Raster Heatmap
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
        <div role="tabpanel" id="panel-findings" aria-labelledby="tab-findings" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          {/* Quadrant 1: Verified Facts */}
          <div style={{ 
            background: 'var(--surface-color-light)', 
            border: '1px solid var(--border-color)', 
            borderLeft: '4px solid #10b981', 
            borderRadius: '6px', 
            padding: '1rem' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.88rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
                <ShieldCheck size={16} />
                1. Verified Provenance & Container Facts
              </h4>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                VERIFIED FACT
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.78rem', lineHeight: 1.55 }}>
              <li><strong>SHA-256 Digest:</strong> {evidence.sha256_hash ? `${evidence.sha256_hash.slice(0, 16)}…` : 'Recorded on upload'}</li>
              <li><strong>Container Type:</strong> {evidence.image_format || evidence.mime_type}</li>
              <li><strong>Dimensions:</strong> {evidence.width && evidence.height ? `${evidence.width} × ${evidence.height} pixels` : 'Dimension metadata absent'}</li>
              <li><strong>Storage Size:</strong> {evidence.file_size ? `${(evidence.file_size / 1024).toFixed(1)} KB` : 'N/A'}</li>
              <li><strong>Registered Hash-Chain Audit Event:</strong> Recorded in SQLite append-only chain</li>
            </ul>
          </div>

          {/* Quadrant 2: Algorithmic Observations */}
          <div style={{ 
            background: 'var(--surface-color-light)', 
            border: '1px solid var(--border-color)', 
            borderLeft: '4px solid #3b82f6', 
            borderRadius: '6px', 
            padding: '1rem' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.88rem', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
                <Crosshair size={16} />
                2. Algorithmic Numerical Observations
              </h4>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#3b82f6', background: 'rgba(59, 130, 246, 0.12)', padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                NUMERICAL OBSERVATION
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.78rem', lineHeight: 1.55 }}>
              <li><strong>Spatial Anomaly Envelopes:</strong> {spatialRegions.length} localized coordinate zones detected</li>
              <li><strong>Examinations Executed:</strong> {metrics.completed} successful, {metrics.failed} failed</li>
              <li><strong>Coincident Anomaly Modalities:</strong> {Array.from(new Set(spatialRegions.map(r => r.modalityLabel))).join(', ') || 'None detected'}</li>
            </ul>
          </div>

          {/* Quadrant 3: Forensic Interpretations */}
          <div style={{ 
            background: 'var(--surface-color-light)', 
            border: '1px solid var(--border-color)', 
            borderLeft: '4px solid #f59e0b', 
            borderRadius: '6px', 
            padding: '1rem' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.88rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
                <Sparkles size={16} />
                3. Plausible Forensic Interpretations
              </h4>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                PLAUSIBLE HYPOTHESIS
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.5 }}>
              {spatialRegions.length > 0 
                ? 'Coincident spatial error variance across independent models (e.g. noise discrepancy + clone keypoints) increases investigative interest. An examiner should inspect these areas in the Microscopy & Loupe tool to evaluate whether texture boundaries explain the variance.'
                : 'Current parameters isolate no significant localized anomaly envelopes above standard statistical boundaries across completed models.'}
            </p>
          </div>

          {/* Quadrant 4: Evidentiary Limitations */}
          <div style={{ 
            background: 'var(--surface-color-light)', 
            border: '1px solid var(--border-color)', 
            borderLeft: '4px solid #ef4444', 
            borderRadius: '6px', 
            padding: '1rem' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.88rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700 }}>
                <AlertTriangle size={16} />
                4. Important Evidentiary Limitations
              </h4>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#ef4444', background: 'rgba(239, 68, 68, 0.12)', padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                CRITICAL BOUNDARY
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.78rem', lineHeight: 1.55, color: 'var(--text-muted)' }}>
              <li>Correlated observations between multiple compression engines must not be double-counted as independent evidence.</li>
              <li>Camera sensor attribution requires reference profile models from the suspect device.</li>
              <li>High native edge contrast naturally generates ELA variance without editing.</li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 5: EVIDENTIARY REPORT PREVIEW */}
      {activeTab === 'report' && (
        <div role="tabpanel" id="panel-report" aria-labelledby="tab-report" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
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

            {/* Examiner Notes Section - Visually & Semantically Distinct from Automated Findings */}
            <div style={{ 
              marginBottom: '1rem',
              padding: '0.85rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid #d97706',
              background: 'var(--surface-base)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                <label htmlFor="examiner-notes" style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                  Examiner Qualitative Findings & Context Notes:
                </label>
                <span style={{ 
                  background: 'rgba(217, 119, 6, 0.12)', 
                  color: '#d97706', 
                  border: '1px solid rgba(217, 119, 6, 0.3)', 
                  padding: '0.12rem 0.45rem', 
                  borderRadius: '4px', 
                  fontSize: '0.65rem', 
                  fontWeight: 800, 
                  textTransform: 'uppercase' 
                }}>
                  HUMAN EXAMINER ENTRY
                </span>
              </div>
              <textarea
                id="examiner-notes"
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
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                Human examiner entries are appended directly to the final evidentiary report and preserved distinct from algorithmic outputs.
              </div>
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
