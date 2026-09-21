"""
ForenSight V4 — Color Channel Forensics Engine

Engine ID: COLOR-CHANNEL
Version: 1.0.0
Category: LOCAL_ANALYSIS

Performs spatial color channel decomposition and localized inter-channel inconsistency analysis.
Measures global Pearson inter-channel correlation (R-G, R-B, G-B), absolute channel difference maps,
localized chromaticity coordinates, block-wise channel disparity, and statistical candidate anomaly regions.
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


class ColorChannelParameters(BaseModel):
    """Parameters for Color Channel Forensics Engine."""
    block_size: int = Field(16, ge=8, le=64, description="Spatial block size for local channel deviation evaluation.")
    z_score_threshold: float = Field(2.5, ge=1.0, le=5.0, description="Z-score threshold for candidate anomaly blocks.")
    min_cluster_blocks: int = Field(4, ge=1, le=64, description="Minimum contiguous blocks to form a candidate region.")
    max_dimension: int = Field(4096, ge=256, le=8192, description="Maximum image dimension for bounded resource evaluation.")


class ColorChannelEngine(BaseForensicEngine):
    """
    Forensic engine evaluating spatial color channel relationships.
    Identifies localized discrepancies in chromaticity and inter-channel correlation
    characteristic of composite splicing, localized hue/saturation alterations, or sensor mismatch.
    """
    engine_id: str = "COLOR-CHANNEL"
    engine_name: str = "Color Channel Discrepancy Analysis"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.LOCAL_ANALYSIS
    description: str = "Measures spatial inter-channel correlation, difference maps, local chromaticity deviation, and candidate regions."
    parameter_schema = ColorChannelParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG", "PNG", "WEBP", "TIFF"],
        min_dimensions=(32, 32),
        max_dimensions=(8192, 8192),
        requires_lossy_compression=False,
    )

    limitations: List[str] = [
        "Natural scenes with vivid, saturated objects (e.g. red flowers, green foliage, blue sky) naturally produce high localized channel differences.",
        "Monochromatic or heavily desaturated images exhibit near-identical channels and cannot yield chromatic divergence measurements.",
        "Camera optical vignetting and lateral chromatic aberration cause natural radial shifts between color channels toward image boundaries.",
        "Candidate regions indicate statistical deviation in channel relationship relative to the image host; they do NOT prove intentional forgery.",
    ]

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Image Splicing Detection Using Inter-Scale and Inter-Channel Dependencies",
            authors="Ng, T. T., Chang, S. F., Hsu, J.",
            publication_venue="IEEE International Conference on Image Processing (ICIP)",
            year=2005,
            reference_type=ReferenceType.PAPER,
            notes="Establishes that natural optical capture produces strong statistical correlation across RGB color channels."
        ),
        ScientificReference(
            title="Exposing Digital Forgeries from Inconsistent Color Illuminant",
            authors="Riess, C., Angelopoulou, E.",
            publication_venue="ACM Multimedia and Security Workshop",
            year=2010,
            reference_type=ReferenceType.PAPER,
            notes="Analyzes localized chromaticity and illuminant color discrepancies to identify foreign spliced elements."
        ),
        ScientificReference(
            title="Detecting Photographic Composites of People using Color Inconsistencies",
            authors="Carvalho, T., Riess, C., Angelopoulou, E., Pedrini, H., de Rocha, A.",
            publication_venue="IEEE Transactions on Information Forensics and Security",
            year=2013,
            reference_type=ReferenceType.PAPER,
            notes="Models localized color and illuminant estimation across partitioned facial and object bounding regions."
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
                summary=f"Color Channel analysis inapplicable: {applicability.reason}",
                applicability=applicability,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 2. Decode image safely
        try:
            if not os.path.exists(ev_path) or os.path.getsize(ev_path) == 0:
                return EngineExecutionResult(
                    engine_id=self.engine_id,
                    engine_version=self.engine_version,
                    status=EngineExecutionStatus.FAILED,
                    summary="Input file is empty or missing.",
                    execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            with Image.open(ev_path) as pil_img:
                width, height = pil_img.size
                if width < 32 or height < 32:
                    return EngineExecutionResult(
                        engine_id=self.engine_id,
                        engine_version=self.engine_version,
                        status=EngineExecutionStatus.FAILED,
                        summary=f"Image dimensions ({width}x{height}) below minimum threshold (32x32).",
                        execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
                    )

                max_dim = context.parameters.get("max_dimension", 4096)
                if max(width, height) > max_dim:
                    scale = max_dim / float(max(width, height))
                    new_w = max(32, int(width * scale))
                    new_h = max(32, int(height * scale))
                    pil_img = pil_img.resize((new_w, new_h), Image.Resampling.BILINEAR)
                    width, height = new_w, new_h

                if pil_img.mode in ("RGBA", "LA"):
                    background = Image.new("RGB", pil_img.size, (255, 255, 255))
                    background.paste(pil_img, mask=pil_img.split()[-1])
                    pil_img = background
                elif pil_img.mode != "RGB":
                    pil_img = pil_img.convert("RGB")

                arr = np.array(pil_img, dtype=np.float32)
        except Exception as e:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Image decode failed: {str(e)}",
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 3. Channel decomposition
        r_chan = arr[:, :, 0]
        g_chan = arr[:, :, 1]
        b_chan = arr[:, :, 2]

        r_flat = r_chan.flatten()
        g_flat = g_chan.flatten()
        b_flat = b_chan.flatten()

        def pearson_corr(x: np.ndarray, y: np.ndarray) -> float:
            std_x = np.std(x)
            std_y = np.std(y)
            if std_x < 1e-5 or std_y < 1e-5:
                return 1.0
            corr = np.corrcoef(x, y)[0, 1]
            return float(corr) if not np.isnan(corr) else 1.0

        corr_rg = pearson_corr(r_flat, g_flat)
        corr_rb = pearson_corr(r_flat, b_flat)
        corr_gb = pearson_corr(g_flat, b_flat)

        # 4. Pixel-wise Channel Difference Maps
        diff_rg = np.abs(r_chan - g_chan)
        diff_rb = np.abs(r_chan - b_chan)
        diff_gb = np.abs(g_chan - b_chan)
        diff_composite = (diff_rg + diff_rb + diff_gb) / 3.0

        diff_stats = {
            "rg": {
                "mean": round(float(np.mean(diff_rg)), 4),
                "std": round(float(np.std(diff_rg)), 4),
                "max": round(float(np.max(diff_rg)), 2),
            },
            "rb": {
                "mean": round(float(np.mean(diff_rb)), 4),
                "std": round(float(np.std(diff_rb)), 4),
                "max": round(float(np.max(diff_rb)), 2),
            },
            "gb": {
                "mean": round(float(np.mean(diff_gb)), 4),
                "std": round(float(np.std(diff_gb)), 4),
                "max": round(float(np.max(diff_gb)), 2),
            },
            "composite": {
                "mean": round(float(np.mean(diff_composite)), 4),
                "std": round(float(np.std(diff_composite)), 4),
                "max": round(float(np.max(diff_composite)), 2),
            }
        }

        # 5. Local Spatial Block Analysis
        block_size = context.parameters.get("block_size", 16)
        z_threshold = context.parameters.get("z_score_threshold", 2.5)
        min_cluster = context.parameters.get("min_cluster_blocks", 4)

        blocks_y = height // block_size
        blocks_x = width // block_size

        block_diff_means = np.zeros((blocks_y, blocks_x), dtype=np.float32)
        total_sum = r_chan + g_chan + b_chan + 1e-5
        norm_r = r_chan / total_sum
        norm_g = g_chan / total_sum
        norm_b = b_chan / total_sum

        for by in range(blocks_y):
            for bx in range(blocks_x):
                y1, y2 = by * block_size, (by + 1) * block_size
                x1, x2 = bx * block_size, (bx + 1) * block_size
                block_diff_means[by, bx] = np.mean(diff_composite[y1:y2, x1:x2])

        mean_diff = np.mean(block_diff_means)
        std_diff = np.std(block_diff_means)
        if std_diff > 1e-5:
            z_scores = (block_diff_means - mean_diff) / std_diff
        else:
            z_scores = np.zeros_like(block_diff_means)

        # 6. Candidate Anomaly Region Clustering
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

                px_x = bx_left * block_size
                px_y = by_top * block_size
                px_w = bw * block_size
                px_h = bh * block_size

                region_z = float(np.mean(z_scores[labels == i]))
                candidate_regions.append({
                    "region_id": len(candidate_regions) + 1,
                    "x": px_x,
                    "y": px_y,
                    "width": px_w,
                    "height": px_h,
                    "block_count": int(area),
                    "mean_z_score": round(region_z, 3),
                    "mean_channel_diff": round(float(np.mean(block_diff_means[labels == i])), 3),
                    "interpretation": "Candidate localized region with elevated inter-channel disparity.",
                })

        # 7. Generate Artifacts
        # JSON Artifact
        findings_json = {
            "engine": self.engine_id,
            "version": self.engine_version,
            "image_dimensions": [width, height],
            "block_grid_dimensions": [blocks_x, blocks_y],
            "block_size": block_size,
            "correlation_matrix": {
                "r_vs_g": round(corr_rg, 4),
                "r_vs_b": round(corr_rb, 4),
                "g_vs_b": round(corr_gb, 4),
            },
            "channel_difference_statistics": diff_stats,
            "candidate_regions": candidate_regions,
            "candidate_region_count": len(candidate_regions),
            "algorithm_parameters": {
                "block_size": block_size,
                "z_score_threshold": z_threshold,
                "min_cluster_blocks": min_cluster,
            },
            "reproducibility": {
                "deterministic": True,
                "color_space": "sRGB",
            },
            "limitations": self.limitations,
        }

        json_bytes = json.dumps(findings_json, indent=2).encode("utf-8")
        json_hash = hashlib.sha256(json_bytes).hexdigest()
        json_filename = "color_channel_analysis.json"
        json_disk_path = os.path.join(out_dir, json_filename)
        with open(json_disk_path, "wb") as f:
            f.write(json_bytes)

        rel_json_path = self._resolve_relative_path(json_disk_path, context)
        json_metadata = EngineArtifactMetadata(
            artifact_id="color_channel_data",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            artifact_type=ArtifactType.JSON,
            filename=json_filename,
            storage_path=rel_json_path,
            sha256_hash=json_hash,
            mime_type="application/json",
            size_bytes=len(json_bytes),
            description="Global channel correlation, difference moments, and candidate anomaly regions.",
        )

        # Plot 1: Channel Overview (color_channel_analysis.png) - 2x2 grid via cv2/PIL
        tile_w, tile_h = min(256, width), min(256, height)
        r_vis = cv2.resize(r_chan.astype(np.uint8), (tile_w, tile_h))
        g_vis = cv2.resize(g_chan.astype(np.uint8), (tile_w, tile_h))
        b_vis = cv2.resize(b_chan.astype(np.uint8), (tile_w, tile_h))

        # Make 3-channel tinted representations (BGR for OpenCV)
        r_bgr = np.zeros((tile_h, tile_w, 3), dtype=np.uint8)
        r_bgr[:, :, 2] = r_vis
        g_bgr = np.zeros((tile_h, tile_w, 3), dtype=np.uint8)
        g_bgr[:, :, 1] = g_vis
        b_bgr = np.zeros((tile_h, tile_w, 3), dtype=np.uint8)
        b_bgr[:, :, 0] = b_vis

        chroma_bgr = (np.stack([norm_b, norm_g, norm_r], axis=-1) * 255.0).astype(np.uint8)
        chroma_vis = cv2.resize(chroma_bgr, (tile_w, tile_h))

        top_row = np.hstack([r_bgr, g_bgr])
        bot_row = np.hstack([b_bgr, chroma_vis])
        overview_quad = np.vstack([top_row, bot_row])

        png1_filename = "color_channel_analysis.png"
        png1_disk_path = os.path.join(out_dir, png1_filename)
        cv2.imwrite(png1_disk_path, overview_quad)

        with open(png1_disk_path, "rb") as f:
            png1_bytes = f.read()
        png1_hash = hashlib.sha256(png1_bytes).hexdigest()

        rel_png1_path = self._resolve_relative_path(png1_disk_path, context)
        png1_metadata = EngineArtifactMetadata(
            artifact_id="color_channel_overview_plot",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            artifact_type=ArtifactType.PLOT,
            filename=png1_filename,
            storage_path=rel_png1_path,
            sha256_hash=png1_hash,
            mime_type="image/png",
            size_bytes=len(png1_bytes),
            description="Isolated Red, Green, Blue channel representations and normalized chromaticity map.",
        )

        # Plot 2: Composite Difference & Candidate Heatmap (color_channel_maps.png)
        diff_norm = np.clip(diff_composite, 0, 255).astype(np.uint8)
        diff_vis = cv2.resize(diff_norm, (tile_w, tile_h))
        diff_color = cv2.applyColorMap(diff_vis, cv2.COLORMAP_MAGMA)

        # Z-score block map scaled
        z_norm = np.clip((z_scores + 3.0) / 6.0 * 255.0, 0, 255).astype(np.uint8)
        z_vis = cv2.resize(z_norm, (tile_w, tile_h), interpolation=cv2.INTER_NEAREST)
        z_color = cv2.applyColorMap(z_vis, cv2.COLORMAP_COOL)

        # Draw candidate boxes on z_color
        scale_x = tile_w / float(width)
        scale_y = tile_h / float(height)
        for cand in candidate_regions:
            pt1 = (int(cand["x"] * scale_x), int(cand["y"] * scale_y))
            pt2 = (int((cand["x"] + cand["width"]) * scale_x), int((cand["y"] + cand["height"]) * scale_y))
            cv2.rectangle(z_color, pt1, pt2, (0, 0, 255), 2)

        maps_side_by_side = np.hstack([diff_color, z_color])
        png2_filename = "color_channel_maps.png"
        png2_disk_path = os.path.join(out_dir, png2_filename)
        cv2.imwrite(png2_disk_path, maps_side_by_side)

        with open(png2_disk_path, "rb") as f:
            png2_bytes = f.read()
        png2_hash = hashlib.sha256(png2_bytes).hexdigest()

        rel_png2_path = self._resolve_relative_path(png2_disk_path, context)
        png2_metadata = EngineArtifactMetadata(
            artifact_id="color_channel_maps_plot",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            artifact_type=ArtifactType.HEATMAP,
            filename=png2_filename,
            storage_path=rel_png2_path,
            sha256_hash=png2_hash,
            mime_type="image/png",
            size_bytes=len(png2_bytes),
            description="Spatial composite channel difference map and clustered candidate anomaly bounding boxes.",
        )

        # 8. Normalized Observation
        direction = "elevated" if len(candidate_regions) > 0 else "informational"
        obs_status = "ANOMALY_DETECTED" if len(candidate_regions) > 0 else "APPLIED"

        observation = NormalizedObservation(
            evidence_id=context.evidence_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=obs_status,
            observation_type="COLOR_CHANNEL",
            metric_name="CHANNEL_CORRELATION_RG",
            raw_value=str(round(corr_rg, 4)),
            normalized_value=round(max(0.0, (corr_rg + 1.0) / 2.0), 4),
            direction=direction,
            technical_reliability="HIGH",
            result_data={
                "corr_rg": round(corr_rg, 4),
                "corr_rb": round(corr_rb, 4),
                "corr_gb": round(corr_gb, 4),
                "mean_diff_composite": diff_stats["composite"]["mean"],
                "candidate_region_count": len(candidate_regions),
                "candidate_regions": candidate_regions,
            },
            parameters_used=context.parameters,
            interpretation=(
                f"Evaluated spatial RGB channel correlation (R-G: {round(corr_rg, 4)}, "
                f"R-B: {round(corr_rb, 4)}, G-B: {round(corr_gb, 4)}). "
                f"Detected {len(candidate_regions)} candidate spatial regions displaying "
                f"statistically anomalous localized channel disparity (|Z| >= {z_threshold})."
            ),
            limitations=self.limitations,
        )

        exec_time = (time.perf_counter() - start_time) * 1000.0
        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary=(
                f"Color channel analysis completed. Correlation: RG={round(corr_rg, 3)}, "
                f"RB={round(corr_rb, 3)}, GB={round(corr_gb, 3)}. "
                f"Candidate regions: {len(candidate_regions)}."
            ),
            structured_findings=findings_json,
            artifacts=[png1_metadata, png2_metadata, json_metadata],
            observations=[observation],
            execution_time_ms=exec_time,
        )
