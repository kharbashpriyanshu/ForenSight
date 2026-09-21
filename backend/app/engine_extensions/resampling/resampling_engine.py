"""
ForenSight V4 — Resampling & Periodic Interpolation Forensics Engine

Engine ID: RESAMPLING
Version: 1.0.0
Category: LOCAL_ANALYSIS

Detects periodic interpolation and resampling traces resulting from scaling,
rotation, or affine geometric transformations using directional second-derivative
filtering, 1D spectral projection analysis, and local spatial consistency mapping.
"""

import os
import json
import time
import hashlib
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

from app.engine_extensions.contract import (
    BaseForensicEngine,
    InputRequirements,
    ApplicabilityResult,
    ExecutionContext,
    EngineExecutionResult,
)
from app.engine_extensions.categories import EngineCategory
from app.engine_extensions.status import EngineExecutionStatus
from app.engine_extensions.reference import ScientificReference, ReferenceType
from app.engine_extensions.artifact import EngineArtifactMetadata, ArtifactType
from app.engine_extensions.observation import NormalizedObservation


class ResamplingParameters(BaseModel):
    """Parameters for Periodic Resampling Analysis."""
    min_period: float = Field(1.5, ge=1.1, le=10.0, description="Minimum spatial period to evaluate.")
    max_period: float = Field(8.0, ge=2.0, le=20.0, description="Maximum spatial period to evaluate.")
    block_size: int = Field(32, ge=8, le=128, description="Spatial block dimension for local resampling localization.")
    z_score_threshold: float = Field(2.5, ge=1.0, le=5.0, description="Robust z-score threshold for candidate region detection.")
    min_cluster_blocks: int = Field(2, ge=1, le=50, description="Minimum contiguous blocks to cluster into a candidate region.")
    max_dimension: int = Field(4096, ge=256, le=8192, description="Maximum image dimension before safety downsampling.")


class ResamplingEngine(BaseForensicEngine):
    """
    Forensic engine analyzing periodic interpolation and resampling artifacts.
    Evaluates horizontal and vertical second-order spatial derivative spectra,
    identifies dominant interpolation periods, and localizes candidate
    resampling-consistent regions.
    """
    engine_id: str = "RESAMPLING"
    engine_name: str = "Resampling & Interpolation Analysis"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.LOCAL_ANALYSIS
    description: str = (
        "Detects periodic interpolation signatures and directional derivative periodicity "
        "resulting from image scaling, rotation, or geometric transformation."
    )
    parameter_schema = ResamplingParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG", "PNG", "WEBP", "TIFF"],
        min_dimensions=(16, 16),
        max_dimensions=(8192, 8192),
        color_spaces=["RGB", "GRAYSCALE", "RGBA"],
        requires_file_path=True,
    )

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Exposing Digital Forgeries by Detecting Traces of Resampling",
            authors="Popescu, A. C., Farid, H.",
            publication_venue="IEEE Transactions on Signal Processing",
            year=2005,
            reference_type=ReferenceType.PAPER,
            notes="Formulates mathematical proof that linear/cubic interpolation introduces periodic sample dependencies detected via expectation maximization and derivative analysis."
        ),
        ScientificReference(
            title="Blind Authentication Using Periodic Properties of Interpolation",
            authors="Mahdian, B., Saic, S.",
            publication_venue="Information Sciences",
            year=2008,
            reference_type=ReferenceType.PAPER,
            notes="Demonstrates derivative-based periodic variance estimation for localized affine transformation and resampling detection."
        ),
        ScientificReference(
            title="Image Authentication by Detecting Traces of Demosaicing",
            authors="Gallagher, A. C., Chen, T.",
            publication_venue="IEEE Computer Vision and Pattern Recognition Workshops (CVPRW)",
            year=2008,
            reference_type=ReferenceType.PAPER,
            notes="Analyzes directional second-difference periodicity for separating natural optical capture from synthetic interpolation artifacts."
        )
    ]

    def _get_evidence_path(self, context: ExecutionContext) -> str:
        if hasattr(context, "evidence_path") and context.evidence_path:
            return context.evidence_path
        return context.stored_path

    def _get_output_dir(self, context: ExecutionContext) -> str:
        if hasattr(context, "artifact_directory") and context.artifact_directory:
            os.makedirs(context.artifact_directory, exist_ok=True)
            return context.artifact_directory
        os.makedirs(context.storage_output_dir, exist_ok=True)
        return context.storage_output_dir

    def _resolve_relative_path(self, disk_path: str, context: ExecutionContext) -> str:
        try:
            from app.core.config import settings
            base_dir = os.path.abspath(settings.STORAGE_DIR)
            abs_disk = os.path.abspath(disk_path)
            if os.path.splitdrive(abs_disk)[0].lower() == os.path.splitdrive(base_dir)[0].lower() and abs_disk.startswith(base_dir):
                return os.path.relpath(abs_disk, start=base_dir).replace("\\", "/")
            if hasattr(context, "storage_output_dir") and context.storage_output_dir:
                return os.path.relpath(disk_path, start=os.path.dirname(context.storage_output_dir)).replace("\\", "/")
        except Exception:
            pass
        return os.path.basename(disk_path)

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        start_time = time.perf_counter()
        ev_path = self._get_evidence_path(context)
        out_dir = self._get_output_dir(context)

        # 1. Applicability verification
        applicability = self.check_applicability(context)
        if not applicability.is_applicable:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=f"Resampling analysis inapplicable: {applicability.reason}",
                applicability=applicability,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        if not os.path.exists(ev_path) or os.path.getsize(ev_path) == 0:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary="Evidence file missing or zero bytes.",
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 2. Image Decoding
        try:
            with Image.open(ev_path) as pil_img:
                orig_w, orig_h = pil_img.size
                is_grayscale = pil_img.mode in ("L", "1")
                if is_grayscale:
                    img_arr = np.array(pil_img, dtype=np.float32)
                else:
                    rgb_img = pil_img.convert("RGB")
                    rgb_arr = np.array(rgb_img, dtype=np.float32)
                    img_arr = 0.299 * rgb_arr[:, :, 0] + 0.587 * rgb_arr[:, :, 1] + 0.114 * rgb_arr[:, :, 2]
        except Exception as e:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Failed to decode image data: {str(e)}",
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        raw_h, raw_w = img_arr.shape
        params = context.parameters or {}
        max_dim = int(params.get("max_dimension", 4096))
        scale_factor = 1.0

        if max(raw_h, raw_w) > max_dim:
            scale_factor = max_dim / float(max(raw_h, raw_w))
            new_w = int(raw_w * scale_factor)
            new_h = int(raw_h * scale_factor)
            img_arr = cv2.resize(img_arr, (new_w, new_h), interpolation=cv2.INTER_AREA)
            height, width = new_h, new_w
        else:
            height, width = raw_h, raw_w

        min_period = float(params.get("min_period", 1.5))
        max_period = float(params.get("max_period", 8.0))
        block_size = int(params.get("block_size", 32))
        if min(height, width) < 256 and block_size > 16:
            block_size = 16
        z_threshold = float(params.get("z_score_threshold", 2.5))
        min_cluster = int(params.get("min_cluster_blocks", 2))

        # 3. Directional Second Derivative Calculation
        # D_xx(x, y) = I(x+1, y) - 2*I(x, y) + I(x-1, y)
        # D_yy(x, y) = I(x, y+1) - 2*I(x, y) + I(x, y-1)
        kernel_xx = np.array([[1, -2, 1]], dtype=np.float32)
        kernel_yy = np.array([[1], [-2], [1]], dtype=np.float32)

        d_xx = cv2.filter2D(img_arr, cv2.CV_32F, kernel_xx, borderType=cv2.BORDER_REFLECT_101)
        d_yy = cv2.filter2D(img_arr, cv2.CV_32F, kernel_yy, borderType=cv2.BORDER_REFLECT_101)

        # 4. Global 1D Spectral Periodicity Analysis
        # Frequency search range corresponding to [min_period, max_period]
        # frequency f = 1 / T. For T in [1.5, 8.0], f in [1/8, 1/1.5] = [0.125, 0.666]
        f_min = 1.0 / max_period
        f_max = min(0.5, 1.0 / min_period)

        def analyze_directional_spectrum(d_matrix: np.ndarray, axis: int) -> Tuple[np.ndarray, np.ndarray, float, float, float]:
            """
            Computes average 1D Fourier magnitude spectrum along designated axis.
            axis=1: horizontal rows. axis=0: vertical columns.
            Returns (freqs, avg_power_spectrum, peak_freq, peak_period, peak_strength_ratio).
            """
            length = d_matrix.shape[axis]
            # Compute 1D FFT along the specified axis
            fft_1d = np.fft.rfft(d_matrix, axis=axis)
            power_1d = np.abs(fft_1d) ** 2
            # Average across orthogonal axis
            avg_power = np.mean(power_1d, axis=0 if axis == 1 else 1)
            freqs = np.fft.rfftfreq(length)

            # Mask out DC and focus on valid frequency range
            valid_idx = np.where((freqs >= f_min) & (freqs <= f_max))[0]
            if len(valid_idx) == 0:
                return freqs, avg_power, 0.0, 0.0, 1.0

            sub_freqs = freqs[valid_idx]
            sub_power = avg_power[valid_idx]

            # Baseline calculation (median power in valid band)
            baseline = float(np.median(sub_power)) + 1e-7
            max_p_idx = np.argmax(sub_power)
            peak_freq = float(sub_freqs[max_p_idx])
            peak_power = float(sub_power[max_p_idx])
            peak_strength = float(peak_power / baseline)
            peak_period = float(1.0 / peak_freq) if peak_freq > 1e-5 else 0.0

            return freqs, avg_power, peak_freq, peak_period, peak_strength

        # Horizontal analysis (rows: axis=1)
        h_freqs, h_power, h_peak_f, h_peak_t, h_strength = analyze_directional_spectrum(d_xx, axis=1)
        # Vertical analysis (columns: axis=0)
        v_freqs, v_power, v_peak_f, v_peak_t, v_strength = analyze_directional_spectrum(d_yy, axis=0)

        # Directional asymmetry: measures imbalance between horizontal and vertical peak responses
        denom_asym = (h_strength + v_strength + 1e-5)
        directional_asymmetry = float(abs(h_strength - v_strength) / denom_asym)

        dominant_axis = "horizontal" if h_strength >= v_strength else "vertical"
        dominant_period = h_peak_t if dominant_axis == "horizontal" else v_peak_t
        dominant_strength = max(h_strength, v_strength)

        # 5. Local Spatial Block Consistency Mapping
        blocks_y = max(1, height // block_size)
        blocks_x = max(1, width // block_size)

        block_resampling_scores = np.zeros((blocks_y, blocks_x), dtype=np.float32)

        # Local periodic metric: ratio of second-derivative energy to first-derivative energy
        # Resampled regions exhibit enhanced second-derivative curvature concentration
        grad_x = cv2.Sobel(img_arr, cv2.CV_32F, 1, 0, ksize=3)
        grad_y = cv2.Sobel(img_arr, cv2.CV_32F, 0, 1, ksize=3)
        grad_energy = grad_x ** 2 + grad_y ** 2 + 1e-5
        sec_energy = d_xx ** 2 + d_yy ** 2

        for by in range(blocks_y):
            for bx in range(blocks_x):
                y1, y2 = by * block_size, (by + 1) * block_size
                x1, x2 = bx * block_size, (bx + 1) * block_size
                sec_blk = np.mean(sec_energy[y1:y2, x1:x2])
                grad_blk = np.mean(grad_energy[y1:y2, x1:x2])
                # Curvature response ratio
                block_resampling_scores[by, bx] = float(sec_blk / grad_blk)

        # Robust baseline across spatial blocks
        baseline_score_median = float(np.median(block_resampling_scores))
        baseline_score_mad = float(np.median(np.abs(block_resampling_scores - baseline_score_median)))
        robust_scale = (baseline_score_mad * 1.4826) if baseline_score_mad > 1e-5 else 1.0

        z_scores = (block_resampling_scores - baseline_score_median) / robust_scale

        # 6. Candidate Anomaly Region Clustering
        # Blocks with elevated curvature/periodicity consistency
        anomaly_mask = (z_scores >= z_threshold).astype(np.uint8)
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(anomaly_mask, connectivity=8)

        candidate_regions: List[Dict[str, Any]] = []
        for i in range(1, num_labels):
            area = stats[i, cv2.CC_STAT_AREA]
            if area >= min_cluster:
                bx_left = int(stats[i, cv2.CC_STAT_LEFT])
                by_top = int(stats[i, cv2.CC_STAT_TOP])
                bw = int(stats[i, cv2.CC_STAT_WIDTH])
                bh = int(stats[i, cv2.CC_STAT_HEIGHT])

                px_x = int(bx_left * block_size / scale_factor)
                px_y = int(by_top * block_size / scale_factor)
                px_w = int(bw * block_size / scale_factor)
                px_h = int(bh * block_size / scale_factor)

                comp_z = z_scores[labels == i]
                comp_scores = block_resampling_scores[labels == i]
                mean_dev = float(np.mean(comp_z))
                max_dev = float(np.max(comp_z))
                mean_local_resp = float(np.mean(comp_scores))

                candidate_regions.append({
                    "region_id": f"resampling-consistent-{len(candidate_regions) + 1}",
                    "bounding_box": [px_x, px_y, px_w, px_h],
                    "block_count": int(area),
                    "mean_deviation_z": round(mean_dev, 3),
                    "max_deviation_z": round(max_dev, 3),
                    "baseline_response": round(baseline_score_median, 4),
                    "local_response": round(mean_local_resp, 4),
                    "dominant_period": round(dominant_period, 3),
                    "classification": "candidate resampling-consistent region"
                })

        candidate_regions.sort(key=lambda r: r["max_deviation_z"], reverse=True)

        # 7. Forensic Artifact Generation
        with open(ev_path, "rb") as f:
            src_sha256 = hashlib.sha256(f.read()).hexdigest()

        analysis_id = f"rs_{src_sha256[:8]}_{int(time.time())}"
        artifacts: List[EngineArtifactMetadata] = []

        # Artifact A: resampling_map.png (Spatial Heatmap)
        map_filename = "resampling_map.png"
        map_disk_path = os.path.join(out_dir, map_filename)

        # Normalize z-scores [0, 4.0] into [0, 255]
        norm_z = np.clip(z_scores / 4.0 * 255.0, 0, 255).astype(np.uint8)
        color_map = cv2.applyColorMap(norm_z, cv2.COLORMAP_TURBO)
        resized_map = cv2.resize(color_map, (width, height), interpolation=cv2.INTER_NEAREST)

        for r in candidate_regions:
            bb = r["bounding_box"]
            rx1 = int(bb[0] * scale_factor)
            ry1 = int(bb[1] * scale_factor)
            rx2 = rx1 + int(bb[2] * scale_factor)
            ry2 = ry1 + int(bb[3] * scale_factor)
            cv2.rectangle(resized_map, (rx1, ry1), (rx2, ry2), (255, 255, 255), 2)
            cv2.rectangle(resized_map, (rx1 - 1, ry1 - 1), (rx2 + 1, ry2 + 1), (0, 0, 0), 1)

        cv2.imwrite(map_disk_path, resized_map)

        with open(map_disk_path, "rb") as f:
            map_bytes = f.read()
        artifacts.append(EngineArtifactMetadata(
            artifact_id="resampling_map",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            analysis_id=context.analysis_id,
            evidence_id=context.evidence_id,
            artifact_type=ArtifactType.HEATMAP,
            storage_path=self._resolve_relative_path(map_disk_path, context),
            sha256_hash=hashlib.sha256(map_bytes).hexdigest(),
            mime_type="image/png",
            width=width,
            height=height,
        ))

        # Artifact B: resampling_analysis.png (Directional Spectra Diagnostic Plot)
        diag_filename = "resampling_analysis.png"
        diag_disk_path = os.path.join(out_dir, diag_filename)
        self._generate_diagnostic_plot(
            diag_disk_path,
            h_freqs=h_freqs,
            h_power=h_power,
            h_peak_t=h_peak_t,
            h_strength=h_strength,
            v_freqs=v_freqs,
            v_power=v_power,
            v_peak_t=v_peak_t,
            v_strength=v_strength,
            f_min=f_min,
            f_max=f_max,
        )

        with open(diag_disk_path, "rb") as f:
            diag_bytes = f.read()
        artifacts.append(EngineArtifactMetadata(
            artifact_id="resampling_analysis",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            analysis_id=context.analysis_id,
            evidence_id=context.evidence_id,
            artifact_type=ArtifactType.PLOT,
            storage_path=self._resolve_relative_path(diag_disk_path, context),
            sha256_hash=hashlib.sha256(diag_bytes).hexdigest(),
            mime_type="image/png",
            width=840,
            height=360,
        ))

        # Artifact C: resampling_analysis.json (Comprehensive dataset)
        json_filename = "resampling_analysis.json"
        json_disk_path = os.path.join(out_dir, json_filename)
        analysis_data = {
            "engine_id": self.engine_id,
            "engine_version": self.engine_version,
            "source_image_sha256": src_sha256,
            "dimensions": {
                "original": [orig_w, orig_h],
                "processed": [width, height],
                "downsampled": scale_factor < 1.0,
                "scale_factor": scale_factor,
            },
            "parameters": {
                "min_period": min_period,
                "max_period": max_period,
                "evaluated_frequency_range": [round(f_min, 4), round(f_max, 4)],
                "block_size": block_size,
                "z_score_threshold": z_threshold,
                "min_cluster_blocks": min_cluster,
            },
            "horizontal_metrics": {
                "peak_frequency": round(h_peak_f, 4),
                "peak_period": round(h_peak_t, 3),
                "peak_strength_ratio": round(h_strength, 3),
            },
            "vertical_metrics": {
                "peak_frequency": round(v_peak_f, 4),
                "peak_period": round(v_peak_t, 3),
                "peak_strength_ratio": round(v_strength, 3),
            },
            "directional_asymmetry": round(directional_asymmetry, 4),
            "dominant_period": round(dominant_period, 3),
            "dominant_axis": dominant_axis,
            "dominant_peak_strength": round(dominant_strength, 3),
            "local_consistency": {
                "blocks_x": blocks_x,
                "blocks_y": blocks_y,
                "total_blocks": blocks_x * blocks_y,
                "baseline_response_median": round(baseline_score_median, 5),
                "baseline_response_mad": round(baseline_score_mad, 5),
                "candidate_region_count": len(candidate_regions),
                "candidate_regions": candidate_regions,
            },
            "scientific_limitations": (
                "Periodic derivative patterns are empirical forensic indicators of possible interpolation. "
                "Periodic structures can also originate naturally from repetitive scene textures (e.g. fabrics, "
                "brickwork, screens) or optical sensor demosaicing filters, and must be contextualized."
            )
        }

        with open(json_disk_path, "w", encoding="utf-8") as f:
            json.dump(analysis_data, f, indent=2)

        with open(json_disk_path, "rb") as f:
            json_bytes = f.read()
        artifacts.append(EngineArtifactMetadata(
            artifact_id="resampling_json",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            analysis_id=context.analysis_id,
            evidence_id=context.evidence_id,
            artifact_type=ArtifactType.JSON,
            storage_path=self._resolve_relative_path(json_disk_path, context),
            sha256_hash=hashlib.sha256(json_bytes).hexdigest(),
            mime_type="application/json",
        ))

        # 8. Normalized Observations
        direction = "elevated" if dominant_strength >= 2.0 or len(candidate_regions) > 0 else "informational"
        observations = [
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="RESAMPLING",
                metric_name="HORIZONTAL_PERIODICITY",
                raw_value=str(round(h_peak_t, 3)),
                normalized_value=float(min(1.0, h_peak_t / 10.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"period": round(h_peak_t, 3), "strength": round(h_strength, 3)},
                parameters_used=context.parameters,
                interpretation=f"Horizontal derivative power spectrum exhibits peak period at {h_peak_t:.2f}px (strength: {h_strength:.2f}x baseline).",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="RESAMPLING",
                metric_name="VERTICAL_PERIODICITY",
                raw_value=str(round(v_peak_t, 3)),
                normalized_value=float(min(1.0, v_peak_t / 10.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"period": round(v_peak_t, 3), "strength": round(v_strength, 3)},
                parameters_used=context.parameters,
                interpretation=f"Vertical derivative power spectrum exhibits peak period at {v_peak_t:.2f}px (strength: {v_strength:.2f}x baseline).",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="RESAMPLING",
                metric_name="DOMINANT_PERIOD",
                raw_value=str(round(dominant_period, 3)),
                normalized_value=float(min(1.0, dominant_period / 10.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"dominant_period": round(dominant_period, 3), "dominant_axis": dominant_axis},
                parameters_used=context.parameters,
                interpretation=f"Dominant spatial resampling period is {dominant_period:.2f}px along the {dominant_axis} axis.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="RESAMPLING",
                metric_name="PERIODICITY_PEAK_STRENGTH",
                raw_value=str(round(dominant_strength, 3)),
                normalized_value=float(min(1.0, dominant_strength / 10.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"dominant_peak_strength": round(dominant_strength, 3)},
                parameters_used=context.parameters,
                interpretation=f"Dominant periodic derivative peak power is {dominant_strength:.2f}x above spectral baseline.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="RESAMPLING",
                metric_name="RESAMPLING_CANDIDATE_REGION_COUNT",
                raw_value=str(len(candidate_regions)),
                normalized_value=float(min(1.0, len(candidate_regions) / 10.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"candidate_region_count": len(candidate_regions)},
                parameters_used=context.parameters,
                interpretation=f"Identified {len(candidate_regions)} candidate resampling-consistent regions with z >= {z_threshold}.",
                limitations=self.limitations,
            ),
        ]

        summary = (
            f"Periodic resampling analysis: dominant period={dominant_period:.2f}px ({dominant_axis} axis, "
            f"strength={dominant_strength:.2f}x). Identified {len(candidate_regions)} candidate resampling-consistent region(s)."
        )

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary=summary,
            observations=observations,
            artifacts=artifacts,
            structured_findings=analysis_data,
            execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
        )

    def _generate_diagnostic_plot(
        self,
        output_path: str,
        h_freqs: np.ndarray,
        h_power: np.ndarray,
        h_peak_t: float,
        h_strength: float,
        v_freqs: np.ndarray,
        v_power: np.ndarray,
        v_peak_t: float,
        v_strength: float,
        f_min: float,
        f_max: float,
    ) -> None:
        """Draws a clean, deterministic 2-panel directional spectrum plot."""
        W, H = 840, 360
        img = Image.new("RGB", (W, H), color=(248, 250, 252))
        draw = ImageDraw.Draw(img)

        def draw_spectrum_panel(
            ox: int,
            oy: int,
            width: int,
            height: int,
            title: str,
            freqs: np.ndarray,
            power: np.ndarray,
            peak_t: float,
            strength: float,
            panel_color: Tuple[int, int, int]
        ):
            # Frame
            draw.rectangle([ox, oy, ox + width, oy + height], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
            draw.text((ox + 12, oy + 8), title, fill=(30, 41, 59))
            draw.text(
                (ox + 12, oy + 26),
                f"Peak Period: {peak_t:.2f} px | Strength: {strength:.2f}x baseline",
                fill=(100, 116, 139)
            )

            # Filter valid frequencies
            valid_mask = (freqs >= 0.02) & (freqs <= 0.50)
            f_sub = freqs[valid_mask]
            p_sub = power[valid_mask]

            if len(p_sub) == 0:
                return

            log_p = np.log10(p_sub + 1e-5)
            min_lp = float(np.min(log_p))
            max_lp = float(np.max(log_p))
            span_lp = (max_lp - min_lp) if (max_lp - min_lp) > 1e-4 else 1.0

            chart_x = ox + 16
            chart_y = oy + height - 20
            chart_w = width - 32
            chart_h = height - 64

            # Baseline line
            med_lp = float(np.median(log_p))
            med_y = chart_y - int(((med_lp - min_lp) / span_lp) * chart_h)
            draw.line([(chart_x, med_y), (chart_x + chart_w, med_y)], fill=(203, 213, 225), width=1)

            # Draw spectrum curve
            points = []
            num_pts = len(f_sub)
            for i in range(num_pts):
                px = chart_x + int((i / float(num_pts - 1)) * chart_w)
                py = chart_y - int(((log_p[i] - min_lp) / span_lp) * chart_h)
                points.append((px, py))

            if len(points) >= 2:
                draw.line(points, fill=panel_color, width=2)

            # Draw evaluated band shading markers
            bx1 = chart_x + int(((f_min - 0.02) / 0.48) * chart_w)
            bx2 = chart_x + int(((f_max - 0.02) / 0.48) * chart_w)
            draw.line([(bx1, chart_y - chart_h), (bx1, chart_y)], fill=(234, 179, 8), width=1)
            draw.line([(bx2, chart_y - chart_h), (bx2, chart_y)], fill=(234, 179, 8), width=1)
            draw.text((bx1 + 2, chart_y - chart_h + 2), "Search Band", fill=(161, 98, 7))

        # Panel 1: Horizontal Spectrum (d_xx)
        draw_spectrum_panel(
            ox=20, oy=20, width=385, height=320,
            title="Horizontal Derivative Spectrum (d_xx)",
            freqs=h_freqs, power=h_power, peak_t=h_peak_t, strength=h_strength,
            panel_color=(59, 130, 246)
        )

        # Panel 2: Vertical Spectrum (d_yy)
        draw_spectrum_panel(
            ox=435, oy=20, width=385, height=320,
            title="Vertical Derivative Spectrum (d_yy)",
            freqs=v_freqs, power=v_power, peak_t=v_peak_t, strength=v_strength,
            panel_color=(16, 185, 129)
        )

        img.save(output_path, "PNG")
