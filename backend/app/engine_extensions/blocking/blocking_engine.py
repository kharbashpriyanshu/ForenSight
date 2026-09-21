"""
ForenSight V4 — Blocking Artifact Forensics Engine

Engine ID: BLOCKING-ARTIFACT
Version: 1.0.0
Category: LOCAL_ANALYSIS

Evaluates 8x8 Discrete Cosine Transform (DCT) block boundary discontinuities
in JPEG imagery. Measures horizontal and vertical boundary gradient anomalies,
boundary-to-internal energy ratios, and localized spatial inconsistencies.
Complies with V4 Forensic Engine Extension Architecture and strict scientific safeguards.
"""

import os
import json
import time
import hashlib
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import cv2
from PIL import Image
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


class BlockingArtifactParameters(BaseModel):
    """Execution parameters for Blocking Artifact Analysis."""
    z_score_threshold: float = Field(2.2, ge=1.0, le=5.0, description="Z-score threshold for candidate anomaly blocks.")
    min_cluster_blocks: int = Field(4, ge=1, le=64, description="Minimum contiguous 8x8 blocks to constitute a candidate region.")
    max_dimension: int = Field(4096, ge=256, le=8192, description="Maximum image dimension for bounded resource evaluation.")


class BlockingArtifactEngine(BaseForensicEngine):
    """
    Forensic engine implementing genuine JPEG 8x8 blocking-artifact discontinuity analysis.
    Evaluates periodic pixel boundary gradients across horizontal and vertical 8x8 grid lines,
    generating both global boundary statistics and localized spatial inconsistency maps.
    """
    engine_id: str = "BLOCKING-ARTIFACT"
    engine_name: str = "Blocking Artifact Inconsistency (BAG)"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.LOCAL_ANALYSIS
    description: str = "Measures 8x8 DCT block boundary discontinuities and identifies localized spatial blocking discrepancies."
    parameter_schema = BlockingArtifactParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG"],
        min_dimensions=(32, 32),
        max_dimensions=(8192, 8192),
        requires_lossy_compression=True,
    )

    limitations: List[str] = [
        "JPEG 8x8 blocking artifacts are intrinsic to lossy Discrete Cosine Transform quantization and do NOT by themselves prove intentional manipulation.",
        "Candidate regions exhibiting deviated blocking behavior may arise legitimately from smooth sky, uniform background, motion blur, or localized depth of field.",
        "Images saved at high quality factors (Q >= 95) or subjected to post-processing deblocking filters may present attenuated boundary discontinuities.",
        "Methodological inapplicability to non-JPEG containers is a technical constraint and must NOT be interpreted as evidence of authenticity or manipulation.",
    ]

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="A No-Reference Perceptual JPEG Quality Metric",
            authors="Wang, Z., Sheikh, H. R., Bovik, A. C.",
            publication_venue="IEEE International Conference on Image Processing (ICIP)",
            year=2002,
            reference_type=ReferenceType.PAPER,
            notes="Formalizes horizontal and vertical boundary discontinuity measurement relative to intra-block activity."
        ),
        ScientificReference(
            title="Identification of Bitmap Images from JPEG Squeezing",
            authors="Fan, Z., de Queiroz, R. L.",
            publication_venue="IEEE Transactions on Information Forensics and Security",
            year=2003,
            reference_type=ReferenceType.PAPER,
            notes="Establishes statistical models for maximum likelihood estimation of JPEG 8x8 blocking artifact grids."
        ),
        ScientificReference(
            title="Detecting Digital Image Forgeries Using Local Blocking Artifact Grid Inconsistencies",
            authors="Li, W., Yuan, Y., Yu, N.",
            publication_venue="Journal of Systems and Software",
            year=2009,
            reference_type=ReferenceType.PAPER,
            notes="Analyzes localized boundary gradient divergence between authentic host regions and misaligned or uncompressed spliced patches."
        )
    ]

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        start_time = time.perf_counter()

        # 1. Applicability Check (JPEG/JPG only)
        app_check = self.check_applicability(context)
        if not app_check.is_applicable:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=app_check.reason or "Evidence format is not applicable for Blocking Artifact Analysis.",
                limitations=self.limitations,
                inapplicability_data={
                    "reason": app_check.reason,
                    "notice": app_check.guardrail_notice,
                },
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 2. File Verification & Physical Bounds Check
        if not os.path.isfile(context.stored_path):
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Evidence file not found on disk at {context.stored_path}.",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        if os.path.getsize(context.stored_path) == 0:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary="Evidence file contains zero bytes.",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        try:
            with Image.open(context.stored_path) as pil_img:
                raw_w, raw_h = pil_img.size
                if raw_w < 32 or raw_h < 32:
                    return EngineExecutionResult(
                        engine_id=self.engine_id,
                        engine_version=self.engine_version,
                        status=EngineExecutionStatus.FAILED,
                        summary=f"Image dimensions ({raw_w}x{raw_h}) are below minimum requirement (32x32) for 8x8 block grid analysis.",
                        limitations=self.limitations,
                        execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
                    )
                # Convert to grayscale luminance
                gray_img = pil_img.convert("L")
                gray_arr = np.array(gray_img, dtype=np.float64)
        except Exception as ex:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Failed to decode JPEG image bitstream: {str(ex)}",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 3. Parameters & Resource Safety
        params = context.parameters or {}
        z_thresh = float(params.get("z_score_threshold", 2.2))
        min_cluster = int(params.get("min_cluster_blocks", 4))
        max_dim = int(params.get("max_dimension", 4096))

        h, w = gray_arr.shape
        if max(h, w) > max_dim:
            scale = max_dim / float(max(h, w))
            new_w = int(round(w * scale / 8.0)) * 8
            new_h = int(round(h * scale / 8.0)) * 8
            new_w = max(new_w, 32)
            new_h = max(new_h, 32)
            gray_arr = cv2.resize(gray_arr, (new_w, new_h), interpolation=cv2.INTER_AREA)
            h, w = gray_arr.shape

        # Crop to exact multiple of 8
        grid_rows = h // 8
        grid_cols = w // 8
        valid_h = grid_rows * 8
        valid_w = grid_cols * 8
        gray_arr = gray_arr[:valid_h, :valid_w]

        # 4. Horizontal Boundary Discontinuity Analysis
        # Boundaries occur between row 8i - 1 and row 8i (for i = 1 .. grid_rows - 1)
        # Across row boundary: d_boundary = |Y(8i, x) - Y(8i-1, x)|
        # Neighboring internal differences: d_int1 = |Y(8i-1, x) - Y(8i-2, x)|, d_int2 = |Y(8i+1, x) - Y(8i, x)|
        h_boundary_diffs: List[float] = []
        h_internal_diffs: List[float] = []
        block_h_strength = np.zeros((grid_rows, grid_cols), dtype=np.float64)

        for i in range(1, grid_rows):
            r_b1 = 8 * i - 1
            r_b2 = 8 * i
            r_int1 = 8 * i - 2
            r_int2 = 8 * i + 1

            b_step = np.abs(gray_arr[r_b2, :] - gray_arr[r_b1, :])
            i1_step = np.abs(gray_arr[r_b1, :] - gray_arr[r_int1, :])
            i2_step = np.abs(gray_arr[r_int2, :] - gray_arr[r_b2, :])
            local_grad = 0.5 * (i1_step + i2_step)
            diff_excess = np.maximum(0.0, b_step - local_grad)

            h_boundary_diffs.extend(b_step.tolist())
            h_internal_diffs.extend(local_grad.tolist())

            # Attribute boundary discontinuity to adjacent upper block i-1 and lower block i
            for j in range(grid_cols):
                col_start = j * 8
                col_end = col_start + 8
                block_val = float(np.mean(diff_excess[col_start:col_end]))
                block_h_strength[i - 1, j] += block_val * 0.5
                block_h_strength[i, j] += block_val * 0.5

        # 5. Vertical Boundary Discontinuity Analysis
        # Boundaries occur between col 8j - 1 and col 8j (for j = 1 .. grid_cols - 1)
        v_boundary_diffs: List[float] = []
        v_internal_diffs: List[float] = []
        block_v_strength = np.zeros((grid_rows, grid_cols), dtype=np.float64)

        for j in range(1, grid_cols):
            c_b1 = 8 * j - 1
            c_b2 = 8 * j
            c_int1 = 8 * j - 2
            c_int2 = 8 * j + 1

            b_step = np.abs(gray_arr[:, c_b2] - gray_arr[:, c_b1])
            i1_step = np.abs(gray_arr[:, c_b1] - gray_arr[:, c_int1])
            i2_step = np.abs(gray_arr[:, c_int2] - gray_arr[:, c_b2])
            local_grad = 0.5 * (i1_step + i2_step)
            diff_excess = np.maximum(0.0, b_step - local_grad)

            v_boundary_diffs.extend(b_step.tolist())
            v_internal_diffs.extend(local_grad.tolist())

            for i in range(grid_rows):
                row_start = i * 8
                row_end = row_start + 8
                block_val = float(np.mean(diff_excess[row_start:row_end]))
                block_v_strength[i, j - 1] += block_val * 0.5
                block_v_strength[i, j] += block_val * 0.5

        # 6. Combined Block Discontinuity & Intra-Block Roughness Normalization
        block_activity = np.zeros((grid_rows, grid_cols), dtype=np.float64)
        for i in range(grid_rows):
            for j in range(grid_cols):
                sub = gray_arr[i * 8:(i + 1) * 8, j * 8:(j + 1) * 8]
                # Measure intra-block roughness (gradient within internal pixels)
                dx = np.abs(sub[:, 1:] - sub[:, :-1])
                dy = np.abs(sub[1:, :] - sub[:-1, :])
                block_activity[i, j] = float(np.mean(dx) + np.mean(dy))

        # Local Blocking Strength Matrix: M(i, j)
        raw_combined = 0.5 * (block_h_strength + block_v_strength)
        normalized_block_map = raw_combined / (1.0 + 0.15 * block_activity)

        # 7. Global Statistical Metrics Calculation
        h_b_arr = np.array(h_boundary_diffs) if h_boundary_diffs else np.array([0.0])
        h_i_arr = np.array(h_internal_diffs) if h_internal_diffs else np.array([1.0])
        v_b_arr = np.array(v_boundary_diffs) if v_boundary_diffs else np.array([0.0])
        v_i_arr = np.array(v_internal_diffs) if v_internal_diffs else np.array([1.0])

        h_mean_b = float(np.mean(h_b_arr))
        h_median_b = float(np.median(h_b_arr))
        h_std_b = float(np.std(h_b_arr))
        h_mean_i = float(np.mean(h_i_arr)) if np.mean(h_i_arr) > 0 else 1e-6
        h_ratio = float(h_mean_b / h_mean_i)

        v_mean_b = float(np.mean(v_b_arr))
        v_median_b = float(np.median(v_b_arr))
        v_std_b = float(np.std(v_b_arr))
        v_mean_i = float(np.mean(v_i_arr)) if np.mean(v_i_arr) > 0 else 1e-6
        v_ratio = float(v_mean_b / v_mean_i)

        global_blocking_strength = float(np.mean(normalized_block_map))
        global_std = float(np.std(normalized_block_map))
        boundary_energy = float(np.mean(raw_combined ** 2))

        # Grid Periodicity Strength (Autocorrelation peak at period 8)
        # Compute row and column projection 1D profiles
        row_proj = np.mean(np.abs(gray_arr[1:, :] - gray_arr[:-1, :]), axis=1)
        col_proj = np.mean(np.abs(gray_arr[:, 1:] - gray_arr[:, :-1]), axis=0)

        def compute_periodicity(profile: np.ndarray) -> float:
            if len(profile) < 32:
                return 1.0
            demeaned = profile - np.mean(profile)
            autocorr = np.correlate(demeaned, demeaned, mode="full")
            mid = len(autocorr) // 2
            half = autocorr[mid:mid + 32]
            if len(half) > 8 and half[0] > 1e-6:
                # Peak at lag 8 vs background neighboring lags 6, 7, 9, 10
                lag8 = half[8]
                neighbors = np.mean([half[6], half[7], half[9], half[10]]) if len(half) > 10 else half[7]
                ratio = float(max(0.0, lag8 - neighbors) / (half[0] + 1e-6))
                return round(ratio * 100.0, 4)
            return 0.0

        grid_periodicity_strength = float(0.5 * (compute_periodicity(row_proj) + compute_periodicity(col_proj)))

        # 8. Candidate Region Identification (Deterministic Clustering)
        candidate_regions: List[Dict[str, Any]] = []
        if global_std > 1e-5:
            z_scores = (normalized_block_map - global_blocking_strength) / global_std
            # High discrepancy blocks: either significantly lower blocking (attenuated) or elevated
            anomalous_mask = (np.abs(z_scores) >= z_thresh).astype(np.uint8)

            # Connected component analysis on block grid
            num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(anomalous_mask, connectivity=8)

            region_id = 1
            for lbl in range(1, num_labels):
                area = stats[lbl, cv2.CC_STAT_AREA]
                if area >= min_cluster:
                    bx = int(stats[lbl, cv2.CC_STAT_LEFT])
                    by = int(stats[lbl, cv2.CC_STAT_TOP])
                    bw = int(stats[lbl, cv2.CC_STAT_WIDTH])
                    bh = int(stats[lbl, cv2.CC_STAT_HEIGHT])

                    mask_region = (labels == lbl)
                    region_z = float(np.mean(z_scores[mask_region]))
                    region_strength = float(np.mean(normalized_block_map[mask_region]))
                    r_type = "elevated_discontinuity" if region_z > 0 else "attenuated_blocking"

                    candidate_regions.append({
                        "region_id": region_id,
                        "type": r_type,
                        "block_count": int(area),
                        "pixel_area": int(area * 64),
                        "mean_z_score": round(region_z, 3),
                        "mean_blocking_strength": round(region_strength, 4),
                        "bounding_box_pixels": {
                            "x": bx * 8,
                            "y": by * 8,
                            "width": bw * 8,
                            "height": bh * 8,
                        },
                        "normalized_bounding_box": {
                            "x": round(float(bx * 8) / float(valid_w), 4),
                            "y": round(float(by * 8) / float(valid_h), 4),
                            "width": round(float(bw * 8) / float(valid_w), 4),
                            "height": round(float(bh * 8) / float(valid_h), 4),
                        },
                        "description": (
                            f"Region {region_id}: {r_type.replace('_', ' ').title()} across {area} blocks "
                            f"(mean z-score: {region_z:+.2f}, local strength: {region_strength:.3f})."
                        )
                    })
                    region_id += 1

        # 9. Artifact Generation: blocking_artifact_map.png
        os.makedirs(context.storage_output_dir, exist_ok=True)
        map_disk_path = os.path.join(context.storage_output_dir, "blocking_artifact_map.png")
        json_disk_path = os.path.join(context.storage_output_dir, "blocking_artifact_analysis.json")

        # Normalize block map to 0..255 for visualization
        min_v = float(np.min(normalized_block_map))
        max_v = float(np.max(normalized_block_map))
        denom = (max_v - min_v) if (max_v - min_v) > 1e-6 else 1.0
        vis_blocks = ((normalized_block_map - min_v) / denom * 255.0).astype(np.uint8)

        # Upsample to pixel resolution
        vis_map_gray = cv2.resize(vis_blocks, (valid_w, valid_h), interpolation=cv2.INTER_NEAREST)
        vis_map_color = cv2.applyColorMap(vis_map_gray, cv2.COLORMAP_INFERNO)

        # Draw subtle grid boundary lines
        for gi in range(1, grid_rows):
            vis_map_color[gi * 8 - 1:gi * 8 + 1, :, :] = (vis_map_color[gi * 8 - 1:gi * 8 + 1, :, :].astype(np.float32) * 0.75).astype(np.uint8)
        for gj in range(1, grid_cols):
            vis_map_color[:, gj * 8 - 1:gj * 8 + 1, :] = (vis_map_color[:, gj * 8 - 1:gj * 8 + 1, :] * 0.75).astype(np.uint8)

        # Highlight candidate regions on map
        for cr in candidate_regions:
            bb = cr["bounding_box_pixels"]
            pt1 = (bb["x"], bb["y"])
            pt2 = (bb["x"] + bb["width"], bb["y"] + bb["height"])
            box_color = (0, 0, 255) if cr["type"] == "elevated_discontinuity" else (255, 128, 0)
            cv2.rectangle(vis_map_color, pt1, pt2, box_color, 2)

        cv2.imwrite(map_disk_path, vis_map_color)

        with open(map_disk_path, "rb") as f:
            map_bytes = f.read()
        map_sha256 = hashlib.sha256(map_bytes).hexdigest()

        # Resolve relative storage paths
        try:
            from app.core.config import settings
            base_dir = os.path.abspath(settings.STORAGE_DIR)
            abs_map = os.path.abspath(map_disk_path)
            if os.path.splitdrive(abs_map)[0].lower() == os.path.splitdrive(base_dir)[0].lower() and abs_map.startswith(base_dir):
                rel_map_path = os.path.relpath(abs_map, start=base_dir).replace("\\", "/")
            else:
                rel_map_path = os.path.relpath(map_disk_path, start=os.path.dirname(context.storage_output_dir)).replace("\\", "/")
        except Exception:
            rel_map_path = os.path.relpath(map_disk_path, start=context.storage_output_dir).replace("\\", "/")

        map_artifact = EngineArtifactMetadata(
            artifact_id="blocking_artifact_map",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.HEATMAP,
            mime_type="image/png",
            storage_path=rel_map_path,
            sha256_hash=map_sha256,
            provenance_metadata={
                "grid_rows": grid_rows,
                "grid_cols": grid_cols,
                "candidate_regions_count": len(candidate_regions),
            }
        )

        # 10. Artifact Generation: blocking_artifact_analysis.json
        json_payload = {
            "engine": {
                "id": self.engine_id,
                "name": self.engine_name,
                "version": self.engine_version,
                "category": self.category.value,
            },
            "input_information": {
                "original_dimensions": [raw_w, raw_h],
                "analyzed_dimensions": [valid_w, valid_h],
                "block_grid_dimensions": [grid_rows, grid_cols],
                "total_blocks": grid_rows * grid_cols,
            },
            "horizontal_boundary_statistics": {
                "mean_discontinuity": round(h_mean_b, 4),
                "median_discontinuity": round(h_median_b, 4),
                "std_discontinuity": round(h_std_b, 4),
                "boundary_to_internal_ratio": round(h_ratio, 4),
            },
            "vertical_boundary_statistics": {
                "mean_discontinuity": round(v_mean_b, 4),
                "median_discontinuity": round(v_median_b, 4),
                "std_discontinuity": round(v_std_b, 4),
                "boundary_to_internal_ratio": round(v_ratio, 4),
            },
            "global_statistics": {
                "global_blocking_strength": round(global_blocking_strength, 4),
                "global_std_deviation": round(global_std, 4),
                "boundary_energy": round(boundary_energy, 4),
                "grid_periodicity_strength": round(grid_periodicity_strength, 4),
                "total_candidate_regions": len(candidate_regions),
            },
            "candidate_regions": candidate_regions,
            "algorithm_parameters": {
                "z_score_threshold": z_thresh,
                "min_cluster_blocks": min_cluster,
                "max_dimension": max_dim,
            },
            "reproducibility_metadata": {
                "sha256_hash": context.sha256_hash,
                "execution_time_ms": None,  # will be populated in structured output
            },
            "limitations": self.limitations,
        }

        json_bytes = json.dumps(json_payload, indent=2).encode("utf-8")
        with open(json_disk_path, "wb") as f:
            f.write(json_bytes)
        json_sha256 = hashlib.sha256(json_bytes).hexdigest()

        try:
            abs_json = os.path.abspath(json_disk_path)
            if os.path.splitdrive(abs_json)[0].lower() == os.path.splitdrive(base_dir)[0].lower() and abs_json.startswith(base_dir):
                rel_json_path = os.path.relpath(abs_json, start=base_dir).replace("\\", "/")
            else:
                rel_json_path = os.path.relpath(json_disk_path, start=os.path.dirname(context.storage_output_dir)).replace("\\", "/")
        except Exception:
            rel_json_path = os.path.relpath(json_disk_path, start=context.storage_output_dir).replace("\\", "/")

        json_artifact = EngineArtifactMetadata(
            artifact_id="blocking_artifact_data",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.JSON,
            mime_type="application/json",
            storage_path=rel_json_path,
            sha256_hash=json_sha256,
            provenance_metadata={
                "candidate_regions_count": len(candidate_regions),
                "global_blocking_strength": round(global_blocking_strength, 4),
            }
        )

        # 11. Normalized Observation
        direction = "anomalous" if len(candidate_regions) > 0 else "nominal"
        interpretation = (
            f"Measured 8x8 block boundary discontinuity across {grid_rows * grid_cols} blocks. "
            f"Global blocking strength: {global_blocking_strength:.3f} (H ratio: {h_ratio:.2f}, V ratio: {v_ratio:.2f}). "
            + (
                f"Identified {len(candidate_regions)} candidate region(s) displaying localized blocking discrepancy requiring analyst review."
                if candidate_regions
                else "No significant localized boundary discontinuity divergence detected."
            )
        )

        summary_text = (
            f"Evaluated {grid_rows * grid_cols} blocks ({valid_w}x{valid_h}). "
            f"Blocking strength: {global_blocking_strength:.3f}. Candidate regions: {len(candidate_regions)}."
        )

        observation = NormalizedObservation(
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED.value,
            observation_type="BLOCKING_ARTIFACT",
            metric_name="GLOBAL_BLOCKING_STRENGTH",
            raw_value=str(round(global_blocking_strength, 4)),
            normalized_value=min(float(len(candidate_regions)) / 5.0, 1.0),
            direction=direction,
            interpretation=interpretation,
            limitations=self.limitations,
            result_data={
                "global_blocking_strength": round(global_blocking_strength, 4),
                "horizontal_ratio": round(h_ratio, 4),
                "vertical_ratio": round(v_ratio, 4),
                "candidate_regions_count": len(candidate_regions),
                "candidate_regions": candidate_regions[:10],
                "grid_rows": grid_rows,
                "grid_cols": grid_cols,
            },
            parameters_used={
                "z_score_threshold": z_thresh,
                "min_cluster_blocks": min_cluster,
                "max_dimension": max_dim,
            },
        )

        structured_findings = {
            "global_statistics": json_payload["global_statistics"],
            "horizontal_boundary_statistics": json_payload["horizontal_boundary_statistics"],
            "vertical_boundary_statistics": json_payload["vertical_boundary_statistics"],
            "candidate_regions": candidate_regions,
            "candidate_regions_count": len(candidate_regions),
            "input_information": json_payload["input_information"],
            "artifacts": {
                "blocking_artifact_map": rel_map_path,
                "blocking_artifact_data": rel_json_path,
            }
        }

        exec_time = (time.perf_counter() - start_time) * 1000.0
        json_payload["reproducibility_metadata"]["execution_time_ms"] = round(exec_time, 2)

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary=summary_text,
            observations=[observation],
            artifacts=[map_artifact, json_artifact],
            structured_findings=structured_findings,
            limitations=self.limitations,
            execution_time_ms=exec_time,
        )
