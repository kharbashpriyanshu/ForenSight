"""
ForenSight V4 — Advanced Spatial Noise Residual Forensics Engine

Engine ID: ADVANCED-NOISE
Version: 1.0.0
Category: LOCAL_ANALYSIS

Extracts deterministic high-frequency noise residuals, computes global moments,
robust scales (MAD), Shannon entropy, frequency decomposition, and partitions
spatial blocks to identify candidate noise-inconsistency regions.
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


class AdvancedNoiseParameters(BaseModel):
    """Parameters for Advanced Noise Residual Analysis."""
    filter_kernel_size: int = Field(5, ge=3, le=11, description="Gaussian low-pass kernel dimension (must be odd).")
    filter_sigma: float = Field(1.0, ge=0.5, le=5.0, description="Standard deviation for Gaussian denoising filter.")
    block_size: int = Field(32, ge=8, le=128, description="Spatial block dimension for local noise consistency evaluation.")
    z_score_threshold: float = Field(2.5, ge=1.0, le=5.0, description="Robust z-score threshold for candidate noise-inconsistency detection.")
    min_cluster_blocks: int = Field(2, ge=1, le=50, description="Minimum contiguous blocks to cluster into a candidate region.")
    max_dimension: int = Field(4096, ge=256, le=8192, description="Maximum image dimension before safety downsampling.")


class AdvancedNoiseEngine(BaseForensicEngine):
    """
    Forensic engine analyzing spatial noise residual consistency.
    Measures global noise statistics, robust MAD scale, residual entropy,
    radial frequency decomposition, and flags candidate noise-inconsistency regions.
    """
    engine_id: str = "ADVANCED-NOISE"
    engine_name: str = "Advanced Noise Residual Analysis"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.LOCAL_ANALYSIS
    description: str = (
        "Extracts high-frequency noise residuals, measures global moments and robust MAD scale, "
        "and evaluates spatial block-level noise consistency."
    )
    parameter_schema = AdvancedNoiseParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG", "PNG", "WEBP", "TIFF"],
        min_dimensions=(16, 16),
        max_dimensions=(8192, 8192),
        color_spaces=["RGB", "GRAYSCALE", "RGBA"],
        requires_file_path=True,
    )

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Exposing Digital Forgeries with Inconsistent Local Noise Levels",
            authors="Pan, X., Zhang, X., Lyu, S.",
            publication_venue="IEEE Transactions on Information Forensics and Security",
            year=2012,
            reference_type=ReferenceType.PAPER,
            notes="Formulates image splicing detection via local noise level estimation and robust consistency comparison across spatial blocks."
        ),
        ScientificReference(
            title="Using Noise Inconsistencies for Blind Image Forensics",
            authors="Mahdian, B., Saic, S.",
            publication_venue="Image and Vision Computing",
            year=2009,
            reference_type=ReferenceType.PAPER,
            notes="Analyzes local noise variance variations and spatial filtering residuals for localized tampering localization."
        ),
        ScientificReference(
            title="Statistical Modeling of Noise Residuals for Digital Image Forensics",
            authors="Lyu, S., Rockmore, D., Farid, H.",
            publication_venue="IEEE Transactions on Signal Processing",
            year=2014,
            reference_type=ReferenceType.PAPER,
            notes="Establishes statistical models for high-frequency noise residuals and higher-order moments in digital imagery."
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
                summary=f"Advanced Noise analysis inapplicable: {applicability.reason}",
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
                    rgb_arr = None
                else:
                    rgb_img = pil_img.convert("RGB")
                    rgb_arr = np.array(rgb_img, dtype=np.float32)
                    # Standard luminance conversion Y = 0.299 R + 0.587 G + 0.114 B
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
            if rgb_arr is not None:
                rgb_arr = cv2.resize(rgb_arr, (new_w, new_h), interpolation=cv2.INTER_AREA)
            height, width = new_h, new_w
        else:
            height, width = raw_h, raw_w

        # 3. Parameters
        k_size = int(params.get("filter_kernel_size", 5))
        if k_size % 2 == 0:
            k_size += 1
        sigma = float(params.get("filter_sigma", 1.0))
        block_size = int(params.get("block_size", 32))
        if min(height, width) < 256 and block_size > 16:
            block_size = 16
        z_threshold = float(params.get("z_score_threshold", 2.5))
        min_cluster = int(params.get("min_cluster_blocks", 2))

        # 4. Deterministic Noise Residual Extraction
        # Low-pass denoised estimate via Gaussian filter with reflect padding
        low_pass = cv2.GaussianBlur(
            img_arr,
            (k_size, k_size),
            sigmaX=sigma,
            sigmaY=sigma,
            borderType=cv2.BORDER_REFLECT_101
        )
        residual = img_arr - low_pass

        # Helper to compute comprehensive distribution stats on 1D residual array
        def compute_residual_metrics(res_1d: np.ndarray, orig_1d: np.ndarray) -> Dict[str, Any]:
            mean_val = float(np.mean(res_1d))
            var_val = float(np.var(res_1d))
            std_val = float(np.std(res_1d))
            median_val = float(np.median(res_1d))
            abs_dev = np.abs(res_1d - median_val)
            mad_val = float(np.median(abs_dev))
            robust_scale = 1.4826 * mad_val

            # Shannon Entropy of residual (quantized across empirical spread)
            p_5, p_25, p_50, p_75, p_95 = [float(x) for x in np.percentile(res_1d, [5, 25, 50, 75, 95])]
            hist, _ = np.histogram(res_1d, bins=128, range=(p_5 - 1.0, p_95 + 1.0))
            hist_sum = np.sum(hist)
            if hist_sum > 0:
                p = hist.astype(np.float64) / hist_sum
                p_nz = p[p > 0]
                entropy_val = float(-np.sum(p_nz * np.log2(p_nz)))
            else:
                entropy_val = 0.0

            orig_energy = float(np.sum(orig_1d ** 2))
            res_energy = float(np.sum(res_1d ** 2))
            hf_energy_ratio = float(res_energy / (orig_energy + 1e-7))

            return {
                "mean": round(mean_val, 5),
                "variance": round(var_val, 5),
                "std_dev": round(std_val, 5),
                "median": round(median_val, 5),
                "mad": round(mad_val, 5),
                "robust_noise_scale": round(robust_scale, 5),
                "residual_entropy": round(entropy_val, 4),
                "high_frequency_energy_ratio": round(hf_energy_ratio, 6),
                "percentiles": {
                    "p5": round(p_5, 4),
                    "p25": round(p_25, 4),
                    "p50": round(p_50, 4),
                    "p75": round(p_75, 4),
                    "p95": round(p_95, 4),
                }
            }

        lum_metrics = compute_residual_metrics(residual.flatten(), img_arr.flatten())

        # Channel breakdown for color imagery
        channel_metrics: Dict[str, Any] = {"luminance": lum_metrics}
        if rgb_arr is not None:
            for c_idx, c_name in enumerate(["red", "green", "blue"]):
                c_data = rgb_arr[:, :, c_idx]
                c_lp = cv2.GaussianBlur(
                    c_data, (k_size, k_size), sigmaX=sigma, sigmaY=sigma, borderType=cv2.BORDER_REFLECT_101
                )
                c_res = c_data - c_lp
                channel_metrics[c_name] = compute_residual_metrics(c_res.flatten(), c_data.flatten())

        # 5. Residual Frequency Band Decomposition
        # Evaluates residual energy concentration in spatial frequency bands
        fft_res = np.fft.fft2(residual)
        fft_shift = np.fft.fftshift(fft_res)
        mag_res_sq = np.abs(fft_shift) ** 2
        total_res_energy = float(np.sum(mag_res_sq)) + 1e-7

        cy, cx = height // 2, width // 2
        y_grid, x_grid = np.ogrid[:height, :width]
        dist_from_center = np.sqrt((x_grid - cx) ** 2 + (y_grid - cy) ** 2)
        max_radius = np.sqrt(cx ** 2 + cy ** 2) + 1e-7
        norm_radius = dist_from_center / max_radius

        low_mask = norm_radius <= 0.15
        mid_mask = (norm_radius > 0.15) & (norm_radius <= 0.50)
        high_mask = norm_radius > 0.50

        low_energy = float(np.sum(mag_res_sq[low_mask])) / total_res_energy
        mid_energy = float(np.sum(mag_res_sq[mid_mask])) / total_res_energy
        high_energy = float(np.sum(mag_res_sq[high_mask])) / total_res_energy

        frequency_decomposition = {
            "low_band_ratio": round(low_energy, 4),
            "mid_band_ratio": round(mid_energy, 4),
            "high_band_ratio": round(high_energy, 4),
        }

        # 6. Local Spatial Block Consistency Analysis
        blocks_y = max(1, height // block_size)
        blocks_x = max(1, width // block_size)

        block_variances = np.zeros((blocks_y, blocks_x), dtype=np.float32)
        block_mads = np.zeros((blocks_y, blocks_x), dtype=np.float32)
        block_mars = np.zeros((blocks_y, blocks_x), dtype=np.float32)

        for by in range(blocks_y):
            for bx in range(blocks_x):
                y1, y2 = by * block_size, (by + 1) * block_size
                x1, x2 = bx * block_size, (bx + 1) * block_size
                blk = residual[y1:y2, x1:x2]
                var_b = float(np.var(blk))
                med_b = float(np.median(blk))
                mad_b = float(np.median(np.abs(blk - med_b)))
                mar_b = float(np.mean(np.abs(blk)))

                block_variances[by, bx] = var_b
                block_mads[by, bx] = mad_b
                block_mars[by, bx] = mar_b

        # Robust baseline using median and MAD across all blocks
        baseline_var_median = float(np.median(block_variances))
        baseline_var_mad = float(np.median(np.abs(block_variances - baseline_var_median)))
        robust_denom = (baseline_var_mad * 1.4826) if baseline_var_mad > 1e-5 else 1.0

        z_scores = (block_variances - baseline_var_median) / robust_denom

        # 7. Candidate Anomaly Region Clustering
        # Regions where local noise variance deviates substantially from the robust baseline
        anomaly_mask = (np.abs(z_scores) >= z_threshold).astype(np.uint8)
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
                comp_vars = block_variances[labels == i]
                mean_dev = float(np.mean(comp_z))
                max_dev = float(np.max(np.abs(comp_z)))
                mean_local_var = float(np.mean(comp_vars))

                candidate_regions.append({
                    "region_id": f"noise-inconsistency-{len(candidate_regions) + 1}",
                    "bounding_box": [px_x, px_y, px_w, px_h],
                    "block_count": int(area),
                    "mean_deviation_z": round(mean_dev, 3),
                    "max_deviation_z": round(max_dev, 3),
                    "baseline_variance": round(baseline_var_median, 4),
                    "local_variance": round(mean_local_var, 4),
                    "classification": "candidate noise-inconsistency region"
                })

        # Sort candidate regions by max deviation descending
        candidate_regions.sort(key=lambda r: abs(r["max_deviation_z"]), reverse=True)

        # 8. Forensic Artifact Generation
        with open(ev_path, "rb") as f:
            src_sha256 = hashlib.sha256(f.read()).hexdigest()

        analysis_id = f"an_{src_sha256[:8]}_{int(time.time())}"
        artifacts: List[EngineArtifactMetadata] = []

        # Artifact A: advanced_noise_map.png (Heatmap of local z-scores with bounding boxes)
        map_filename = "advanced_noise_map.png"
        map_disk_path = os.path.join(out_dir, map_filename)

        # Normalize z_scores to [0, 255] for colormap visualization (range [-4.0, 4.0])
        norm_z = np.clip((z_scores + 4.0) / 8.0 * 255.0, 0, 255).astype(np.uint8)
        color_map = cv2.applyColorMap(norm_z, cv2.COLORMAP_JET)
        # Resize to full image dimensions for crystal-clear spatial alignment
        resized_map = cv2.resize(color_map, (width, height), interpolation=cv2.INTER_NEAREST)

        # Draw candidate region bounding boxes on map
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
            artifact_id="advanced_noise_map",
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

        # Artifact B: advanced_noise_analysis.png (Diagnostic multi-panel plots)
        diag_filename = "advanced_noise_analysis.png"
        diag_disk_path = os.path.join(out_dir, diag_filename)
        self._generate_diagnostic_plot(
            diag_disk_path,
            residual=residual,
            lum_metrics=lum_metrics,
            channel_metrics=channel_metrics,
            block_variances=block_variances,
            baseline_var=baseline_var_median,
            is_grayscale=is_grayscale,
        )

        with open(diag_disk_path, "rb") as f:
            diag_bytes = f.read()
        artifacts.append(EngineArtifactMetadata(
            artifact_id="advanced_noise_analysis",
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

        # Artifact C: advanced_noise_analysis.json (Comprehensive dataset)
        json_filename = "advanced_noise_analysis.json"
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
                "filter_kernel_size": k_size,
                "filter_sigma": sigma,
                "block_size": block_size,
                "z_score_threshold": z_threshold,
                "min_cluster_blocks": min_cluster,
            },
            "is_grayscale": is_grayscale,
            "global_metrics": channel_metrics,
            "residual_frequency_decomposition": frequency_decomposition,
            "local_consistency": {
                "blocks_x": blocks_x,
                "blocks_y": blocks_y,
                "total_blocks": blocks_x * blocks_y,
                "baseline_variance_median": round(baseline_var_median, 5),
                "baseline_variance_mad": round(baseline_var_mad, 5),
                "robust_scale": round(robust_denom, 5),
                "candidate_region_count": len(candidate_regions),
                "candidate_regions": candidate_regions,
            },
            "scientific_limitations": (
                "Noise inconsistency measurements are empirical indicators. Differences in local noise "
                "variance may arise naturally from scene texture, depth of field, optical vignetting, "
                "or localized illumination, and do not constitute definitive proof of manipulation."
            )
        }

        with open(json_disk_path, "w", encoding="utf-8") as f:
            json.dump(analysis_data, f, indent=2)

        with open(json_disk_path, "rb") as f:
            json_bytes = f.read()
        artifacts.append(EngineArtifactMetadata(
            artifact_id="advanced_noise_json",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            analysis_id=context.analysis_id,
            evidence_id=context.evidence_id,
            artifact_type=ArtifactType.JSON,
            storage_path=self._resolve_relative_path(json_disk_path, context),
            sha256_hash=hashlib.sha256(json_bytes).hexdigest(),
            mime_type="application/json",
        ))

        # 9. Normalized Observations
        max_dev = max([abs(r["max_deviation_z"]) for r in candidate_regions], default=0.0)
        direction = "elevated" if len(candidate_regions) > 0 else "informational"
        observations = [
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="ADVANCED_NOISE",
                metric_name="GLOBAL_NOISE_VARIANCE",
                raw_value=str(lum_metrics["variance"]),
                normalized_value=float(min(1.0, lum_metrics["variance"] / 100.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"variance": lum_metrics["variance"]},
                parameters_used=context.parameters,
                interpretation=f"Global luminance noise residual variance is {lum_metrics['variance']:.3f}.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="ADVANCED_NOISE",
                metric_name="GLOBAL_NOISE_MAD",
                raw_value=str(lum_metrics["mad"]),
                normalized_value=float(min(1.0, lum_metrics["mad"] / 20.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"mad": lum_metrics["mad"], "robust_scale": lum_metrics["robust_noise_scale"]},
                parameters_used=context.parameters,
                interpretation=f"Median Absolute Deviation (MAD) of noise residual is {lum_metrics['mad']:.3f}.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="ADVANCED_NOISE",
                metric_name="GLOBAL_NOISE_ENTROPY",
                raw_value=str(lum_metrics["residual_entropy"]),
                normalized_value=float(min(1.0, lum_metrics["residual_entropy"] / 8.0)),
                direction="informational",
                technical_reliability="HIGH",
                result_data={"entropy": lum_metrics["residual_entropy"]},
                parameters_used=context.parameters,
                interpretation=f"Shannon entropy of quantized noise residual is {lum_metrics['residual_entropy']:.2f} bits.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="ADVANCED_NOISE",
                metric_name="HIGH_FREQUENCY_NOISE_ENERGY",
                raw_value=str(lum_metrics["high_frequency_energy_ratio"]),
                normalized_value=float(min(1.0, lum_metrics["high_frequency_energy_ratio"])),
                direction="informational",
                technical_reliability="HIGH",
                result_data={"high_freq_energy_ratio": lum_metrics["high_frequency_energy_ratio"]},
                parameters_used=context.parameters,
                interpretation=f"High frequency noise residual energy ratio is {lum_metrics['high_frequency_energy_ratio']:.6f}.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="ADVANCED_NOISE",
                metric_name="NOISE_INCONSISTENCY_REGION_COUNT",
                raw_value=str(len(candidate_regions)),
                normalized_value=float(min(1.0, len(candidate_regions) / 10.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"candidate_region_count": len(candidate_regions)},
                parameters_used=context.parameters,
                interpretation=f"Identified {len(candidate_regions)} candidate noise-inconsistency regions with |z| >= {z_threshold}.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="ADVANCED_NOISE",
                metric_name="MAX_LOCAL_NOISE_DEVIATION",
                raw_value=str(round(max_dev, 3)),
                normalized_value=float(min(1.0, max_dev / 10.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"max_deviation_z": round(max_dev, 3)},
                parameters_used=context.parameters,
                interpretation=f"Maximum robust z-score deviation across spatial blocks is {max_dev:.3f}.",
                limitations=self.limitations,
            ),
        ]

        summary = (
            f"Evaluated noise residual: variance={lum_metrics['variance']:.3f}, "
            f"robust MAD={lum_metrics['mad']:.3f}, entropy={lum_metrics['residual_entropy']:.2f}b. "
            f"Identified {len(candidate_regions)} candidate noise-inconsistency region(s) (max |z|={max_dev:.2f})."
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
        residual: np.ndarray,
        lum_metrics: Dict[str, Any],
        channel_metrics: Dict[str, Any],
        block_variances: np.ndarray,
        baseline_var: float,
        is_grayscale: bool,
    ) -> None:
        """Draws a clean, deterministic 3-panel diagnostic visualization."""
        W, H = 840, 360
        img = Image.new("RGB", (W, H), color=(248, 250, 252))
        draw = ImageDraw.Draw(img)

        # Panel 1: Residual Histogram [-15, 15]
        # Frame
        draw.rectangle([20, 20, 270, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((32, 28), "Residual Distribution", fill=(30, 41, 59))
        draw.text((32, 46), f"Var: {lum_metrics['variance']:.3f} | MAD: {lum_metrics['mad']:.3f}", fill=(100, 116, 139))

        res_flat = residual.flatten()
        hist, _ = np.histogram(res_flat, bins=50, range=(-15, 15))
        max_h = max(int(np.max(hist)), 1)
        chart_w, chart_h = 230, 220
        ox, oy = 30, 300

        for i, val in enumerate(hist):
            bar_h = int((val / max_h) * chart_h)
            x1 = ox + int(i * (chart_w / 50))
            x2 = ox + int((i + 1) * (chart_w / 50)) - 1
            y1 = oy - bar_h
            draw.rectangle([x1, y1, x2, oy], fill=(59, 130, 246))

        # Panel 2: Channel Robust Noise Scales
        draw.rectangle([290, 20, 550, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((302, 28), "Channel Robust Scales", fill=(30, 41, 59))
        draw.text((302, 46), "MAD & Robust Scale (1.4826 x MAD)", fill=(100, 116, 139))

        channels_to_plot = ["luminance"] if is_grayscale else ["luminance", "red", "green", "blue"]
        colors = {
            "luminance": (100, 116, 139),
            "red": (239, 68, 68),
            "green": (16, 185, 129),
            "blue": (59, 130, 246),
        }
        max_scale = max([channel_metrics[c]["robust_noise_scale"] for c in channels_to_plot], default=1.0)
        max_scale = max(max_scale, 2.0)

        for idx, c in enumerate(channels_to_plot):
            scale_val = channel_metrics[c]["robust_noise_scale"]
            mad_val = channel_metrics[c]["mad"]
            y_base = 100 + idx * 52
            draw.text((310, y_base), f"{c.capitalize()}:", fill=(51, 65, 85))
            draw.text((430, y_base), f"MAD={mad_val:.2f} (Scale={scale_val:.2f})", fill=(100, 116, 139))

            # Horizontal bar
            bar_len = int((scale_val / max_scale) * 210)
            draw.rectangle([310, y_base + 18, 520, y_base + 30], fill=(241, 245, 249))
            draw.rectangle([310, y_base + 18, 310 + bar_len, y_base + 30], fill=colors.get(c, (100, 116, 139)))

        # Panel 3: Spatial Block Variance Distribution
        draw.rectangle([570, 20, 820, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((582, 28), "Block Variance Spread", fill=(30, 41, 59))
        draw.text((582, 46), f"Baseline (Median): {baseline_var:.3f}", fill=(100, 116, 139))

        flat_vars = block_variances.flatten()
        p98 = float(np.percentile(flat_vars, 98)) if len(flat_vars) > 0 else 10.0
        v_hist, _ = np.histogram(flat_vars, bins=40, range=(0, max(p98, 1.0)))
        max_vh = max(int(np.max(v_hist)), 1)
        vox, voy = 582, 300
        v_chart_w = 226

        for i, val in enumerate(v_hist):
            bar_h = int((val / max_vh) * chart_h)
            x1 = vox + int(i * (v_chart_w / 40))
            x2 = vox + int((i + 1) * (v_chart_w / 40)) - 1
            y1 = voy - bar_h
            draw.rectangle([x1, y1, x2, voy], fill=(168, 85, 247))

        img.save(output_path, "PNG")
