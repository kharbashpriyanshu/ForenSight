"""
ForenSight V4 — JPEG Ghost Forensic Engine

Engine ID: JPEG-GHOST
Analyzes local compression responses across an iterative JPEG recompression sweep.
Identifies quality factor minima, localized residual anomalies, and candidate regions.
Complies with the V4 Forensic Engine Extension Architecture and scientific safeguards.
"""

import os
import io
import json
import time
import hashlib
import numpy as np
import cv2
from PIL import Image
from typing import Dict, Any, List, Optional
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


class JPEGGhostParameters(BaseModel):
    """Execution parameters for JPEG Ghost Analysis."""
    quality_min: int = Field(40, ge=10, le=95, description="Starting test quality factor.")
    quality_max: int = Field(95, ge=15, le=100, description="Ending test quality factor.")
    quality_step: int = Field(5, ge=1, le=20, description="Step size between quality factors.")
    block_size: int = Field(8, ge=4, le=32, description="Spatial averaging block dimension (pixels).")
    max_dimension: int = Field(1024, ge=128, le=4096, description="Maximum image dimension for bounded resource evaluation.")


class JPEGGhostEngine(BaseForensicEngine):
    """
    Forensic engine implementing the JPEG Ghost recompression sweep method.
    Investigates whether localized image regions exhibit differential error minima
    consistent with foreign compression histories.
    """
    engine_id: str = "JPEG-GHOST"
    engine_name: str = "JPEG Ghost Detection"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.LOCAL_ANALYSIS
    description: str = "Performs controlled JPEG recompression across a quality sweep to identify differential local error minima."
    parameter_schema = JPEGGhostParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG"],
        min_dimensions=(32, 32),
        max_dimensions=(8192, 8192),
        requires_lossy_compression=True,
    )

    limitations: List[str] = [
        "A localized JPEG Ghost response does NOT provide definitive proof of manipulation or intentional forgery.",
        "Response curves are influenced by intrinsic scene content, high-contrast edges, fine textures, and smooth flat areas.",
        "Images undergoing repeated whole-frame recompressions or non-standard color subsampling may yield ambiguous or multiple minima.",
        "Method assumes spliced fragments were originally compressed at a different quality factor than the host image.",
    ]

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Exposing Digital Forgeries from JPEG Ghosts",
            authors="Farid, H.",
            publication_venue="IEEE Transactions on Information Forensics and Security",
            year=2009,
            reference_type=ReferenceType.PAPER,
            notes="Foundational paper demonstrating that pasted fragments from a different JPEG source exhibit minimum error at their original compression quality."
        ),
        ScientificReference(
            title="Image Forgery Detection Using JPEG Ghost Analysis",
            authors="Barni, M., Costanzo, A., Sabatini, L.",
            publication_venue="Proc. IEEE International Workshop on Information Forensics and Security",
            year=2010,
            reference_type=ReferenceType.PAPER,
            notes="Analyzes statistical behavior of localized difference maps under varied recompression parameters."
        )
    ]

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        start_time = time.perf_counter()

        # 1. Applicability Check
        app_check = self.check_applicability(context)
        if not app_check.is_applicable:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=app_check.reason or "Evidence format is not applicable for JPEG Ghost analysis.",
                limitations=self.limitations,
                inapplicability_data={
                    "reason": app_check.reason,
                    "notice": app_check.guardrail_notice,
                },
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 2. File Verification & Decoding
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
            pil_img = Image.open(context.stored_path).convert("RGB")
        except Exception as ex:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Failed to decode JPEG image: {str(ex)}",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        orig_w, orig_h = pil_img.size
        if orig_w < 32 or orig_h < 32:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Image dimensions ({orig_w}x{orig_h}) are too small for spatial block analysis.",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 3. Parameters Extraction & Bounding
        params = context.parameters or {}
        q_min = max(10, min(params.get("quality_min", 40), 95))
        q_max = max(q_min + 5, min(params.get("quality_max", 95), 100))
        q_step = max(1, min(params.get("quality_step", 5), 20))
        block_sz = max(4, min(params.get("block_size", 8), 32))
        max_dim = max(128, min(params.get("max_dimension", 1024), 4096))

        # Downscale for performance if image exceeds max_dimension
        scale_factor = 1.0
        if max(orig_w, orig_h) > max_dim:
            scale_factor = max_dim / float(max(orig_w, orig_h))
            new_w = max(32, int(round(orig_w * scale_factor)))
            new_h = max(32, int(round(orig_h * scale_factor)))
            pil_img = pil_img.resize((new_w, new_h), Image.Resampling.BILINEAR)

        img_np = np.array(pil_img, dtype=np.float32)
        h, w, _ = img_np.shape

        # 4. Quality Sweep Evaluation
        quality_curve = []
        maps_by_quality = {}
        qualities = list(range(q_min, q_max + 1, q_step))

        for q in qualities:
            buf = io.BytesIO()
            pil_img.save(buf, format="JPEG", quality=q)
            buf.seek(0)
            recomp_img = Image.open(buf).convert("RGB")
            recomp_np = np.array(recomp_img, dtype=np.float32)

            # Difference calculation across color channels
            diff_sq = np.mean((img_np - recomp_np) ** 2, axis=2)

            # Spatial block averaging (box filter)
            smoothed_diff = cv2.boxFilter(diff_sq, -1, (block_sz, block_sz), borderType=cv2.BORDER_REFLECT)

            mean_err = float(np.mean(smoothed_diff))
            std_err = float(np.std(smoothed_diff))
            min_err = float(np.min(smoothed_diff))
            max_err = float(np.max(smoothed_diff))

            quality_curve.append({
                "quality": q,
                "mean_difference": round(mean_err, 4),
                "std_deviation": round(std_err, 4),
                "min_difference": round(min_err, 4),
                "max_difference": round(max_err, 4),
            })
            maps_by_quality[q] = smoothed_diff

        # 5. Curve Minima & Candidate Quality Identification
        mean_diffs = [pt["mean_difference"] for pt in quality_curve]
        candidate_qualities = []

        # Find interior local minima in the response curve
        for i in range(1, len(mean_diffs) - 1):
            if mean_diffs[i] < mean_diffs[i - 1] and mean_diffs[i] < mean_diffs[i + 1]:
                candidate_qualities.append(qualities[i])

        # If no strict interior minimum, identify inflection / global minimum
        best_candidate_q = qualities[int(np.argmin(mean_diffs))]
        if not candidate_qualities:
            candidate_qualities = [best_candidate_q]

        # Select map at best candidate quality for spatial anomaly extraction
        target_map = maps_by_quality[best_candidate_q]

        # 6. Candidate Region Extraction via Robust IQR Thresholding
        q25 = float(np.percentile(target_map, 25))
        q50 = float(np.percentile(target_map, 50))
        q75 = float(np.percentile(target_map, 75))
        iqr = max(q75 - q25, 0.001)

        # Region of local discrepancy: values differing markedly from median
        anomaly_mask = (target_map < (q50 - 1.75 * iqr)) | (target_map > (q50 + 2.5 * iqr))
        mask_uint8 = (anomaly_mask.astype(np.uint8)) * 255

        # Morphological clean-up
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (block_sz, block_sz))
        mask_clean = cv2.morphologyEx(mask_uint8, cv2.MORPH_OPEN, kernel)

        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask_clean, connectivity=8)

        candidate_regions = []
        min_region_area = block_sz * block_sz * 4

        for lbl in range(1, num_labels):
            area = int(stats[lbl, cv2.CC_STAT_AREA])
            if area >= min_region_area:
                rx = int(stats[lbl, cv2.CC_STAT_LEFT])
                ry = int(stats[lbl, cv2.CC_STAT_TOP])
                rw = int(stats[lbl, cv2.CC_STAT_WIDTH])
                rh = int(stats[lbl, cv2.CC_STAT_HEIGHT])

                # Map coordinates back to original scale if downsampled
                if scale_factor < 1.0:
                    rx = int(round(rx / scale_factor))
                    ry = int(round(ry / scale_factor))
                    rw = int(round(rw / scale_factor))
                    rh = int(round(rh / scale_factor))

                reg_mean = float(np.mean(target_map[labels == lbl]))
                candidate_regions.append({
                    "region_id": len(candidate_regions) + 1,
                    "x": rx,
                    "y": ry,
                    "width": rw,
                    "height": rh,
                    "area_pixels": area,
                    "mean_residual": round(reg_mean, 4),
                    "contrast_to_median": round(reg_mean - q50, 4),
                })

        # 7. Generate Artifacts
        os.makedirs(context.storage_output_dir, exist_ok=True)

        # Visualization Artifact: Normalized 2D Difference Heatmap
        norm_map = cv2.normalize(target_map, None, 0, 255, cv2.NORM_MINMAX, dtype=cv2.CV_8U)
        color_map = cv2.applyColorMap(norm_map, cv2.COLORMAP_VIRIDIS)

        map_filename = f"jpeg_ghost_map_{context.evidence_id}.png"
        map_disk_path = os.path.join(context.storage_output_dir, map_filename)
        cv2.imwrite(map_disk_path, color_map)

        with open(map_disk_path, "rb") as f:
            map_bytes = f.read()
        map_sha256 = hashlib.sha256(map_bytes).hexdigest()

        # Compute relative storage path
        try:
            from app.core.config import settings
            base_dir = os.path.abspath(settings.STORAGE_DIR)
            abs_disk = os.path.abspath(map_disk_path)
            if os.path.splitdrive(abs_disk)[0].lower() == os.path.splitdrive(base_dir)[0].lower() and abs_disk.startswith(base_dir):
                rel_map_path = os.path.relpath(abs_disk, start=base_dir).replace("\\", "/")
            else:
                rel_map_path = os.path.relpath(map_disk_path, start=os.path.dirname(context.storage_output_dir)).replace("\\", "/")
        except Exception:
            rel_map_path = os.path.relpath(map_disk_path, start=context.storage_output_dir).replace("\\", "/")

        map_artifact = EngineArtifactMetadata(
            artifact_id=f"jpeg_ghost_map_{context.evidence_id}",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.HEATMAP,
            mime_type="image/png",
            storage_path=rel_map_path,
            sha256_hash=map_sha256,
            width=w,
            height=h,
            parameters_used={
                "candidate_quality": best_candidate_q,
                "block_size": block_sz,
            },
            provenance_metadata={"method": "Farid (2009) JPEG Ghost Difference Map"}
        )

        # JSON Artifact: Complete Analysis Record
        json_filename = f"jpeg_ghost_analysis_{context.evidence_id}.json"
        json_disk_path = os.path.join(context.storage_output_dir, json_filename)

        json_payload = {
            "engine_id": self.engine_id,
            "engine_version": self.engine_version,
            "evidence_id": context.evidence_id,
            "analysis_id": context.analysis_id,
            "evidence_sha256": context.sha256_hash,
            "parameters": {
                "quality_min": q_min,
                "quality_max": q_max,
                "quality_step": q_step,
                "block_size": block_sz,
                "max_dimension": max_dim,
                "scale_factor_applied": scale_factor,
            },
            "provenance": {
                "engine": self.engine_id,
                "version": self.engine_version,
                "algorithm": "Iterative JPEG Recompression Residual Sweep (Farid 2009)",
            },
            "results": {
                "best_candidate_quality": best_candidate_q,
                "candidate_qualities": candidate_qualities,
                "quality_curve": quality_curve,
                "global_statistics": {
                    "median_difference": round(q50, 4),
                    "iqr": round(iqr, 4),
                    "min_mean_difference": round(float(np.min(mean_diffs)), 4),
                    "max_mean_difference": round(float(np.max(mean_diffs)), 4),
                },
                "candidate_regions_count": len(candidate_regions),
                "candidate_regions": candidate_regions,
            },
            "limitations": self.limitations,
        }

        json_bytes = json.dumps(json_payload, indent=2).encode("utf-8")
        with open(json_disk_path, "wb") as f:
            f.write(json_bytes)
        json_sha256 = hashlib.sha256(json_bytes).hexdigest()

        try:
            from app.core.config import settings
            base_dir = os.path.abspath(settings.STORAGE_DIR)
            abs_disk = os.path.abspath(json_disk_path)
            if os.path.splitdrive(abs_disk)[0].lower() == os.path.splitdrive(base_dir)[0].lower() and abs_disk.startswith(base_dir):
                rel_json_path = os.path.relpath(abs_disk, start=base_dir).replace("\\", "/")
            else:
                rel_json_path = os.path.relpath(json_disk_path, start=os.path.dirname(context.storage_output_dir)).replace("\\", "/")
        except Exception:
            rel_json_path = os.path.relpath(json_disk_path, start=context.storage_output_dir).replace("\\", "/")

        json_artifact = EngineArtifactMetadata(
            artifact_id=f"jpeg_ghost_data_{context.evidence_id}",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.JSON,
            mime_type="application/json",
            storage_path=rel_json_path,
            sha256_hash=json_sha256,
            provenance_metadata={"candidate_quality": best_candidate_q}
        )

        # 8. Normalized Observation
        direction = "anomalous" if len(candidate_regions) > 0 else "nominal"
        interpretation = (
            f"Recompression sweep across Q={q_min}..{q_max} identified a candidate residual response minimum at Q~{best_candidate_q}. "
            + (
                f"Observed {len(candidate_regions)} candidate region(s) displaying local residual divergence requiring analyst review."
                if candidate_regions
                else "No significant localized compression divergence detected across the quality sweep."
            )
        )

        obs_summary = (
            f"Evaluated {len(qualities)} recompression qualities. Candidate minimum: Q={best_candidate_q}. "
            f"Identified {len(candidate_regions)} candidate region(s)."
        )

        observation = NormalizedObservation(
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED.value,
            observation_type="JPEG_GHOST",
            metric_name="MINIMUM_RESPONSE_QUALITY",
            raw_value=str(best_candidate_q),
            normalized_value=min(float(len(candidate_regions)) / 5.0, 1.0),
            direction=direction,
            interpretation=interpretation,
            limitations=self.limitations,
            result_data={
                "candidate_quality": best_candidate_q,
                "candidate_qualities": candidate_qualities,
                "candidate_regions_count": len(candidate_regions),
                "candidate_regions": candidate_regions[:10],
                "quality_curve": quality_curve,
            },
            parameters_used={
                "quality_min": q_min,
                "quality_max": q_max,
                "quality_step": q_step,
                "block_size": block_sz,
            },
        )

        structured_findings = {
            "candidate_quality": best_candidate_q,
            "candidate_qualities": candidate_qualities,
            "candidate_regions_count": len(candidate_regions),
            "candidate_regions": candidate_regions,
            "quality_curve": quality_curve,
            "global_statistics": json_payload["results"]["global_statistics"],
            "artifacts": {
                "jpeg_ghost_map": rel_map_path,
                "jpeg_ghost_data": rel_json_path,
            }
        }

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary=obs_summary,
            observations=[observation],
            artifacts=[map_artifact, json_artifact],
            structured_findings=structured_findings,
            limitations=self.limitations,
            execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
        )
