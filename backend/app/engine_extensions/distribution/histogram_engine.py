"""
ForenSight V4 — Image Histogram & Distribution Forensics Engine

Engine ID: HISTOGRAM
Version: 1.0.0
Category: GLOBAL_ANALYSIS

Performs empirical luminance and color-channel intensity distribution analysis.
Measures discrete histogram bin counts, cumulative distributions, moments,
percentile spreads, Shannon entropy, dynamic range occupancy, comb-like gaps,
and clipping ratios across Luminance, Red, Green, and Blue channels.
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


class HistogramParameters(BaseModel):
    """Parameters for Histogram Distribution Analysis."""
    bins: int = Field(256, ge=16, le=256, description="Number of histogram intensity quantization bins.")
    compute_comb_gaps: bool = Field(True, description="Detect interior empty bins characteristic of contrast stretching.")
    max_dimension: int = Field(4096, ge=256, le=8192, description="Maximum image dimension for bounded resource evaluation.")


class HistogramEngine(BaseForensicEngine):
    """
    Forensic engine analyzing whole-image tonal and chromatic distributions.
    Measures empirical channel histograms, dynamic range occupancy, Shannon entropy,
    clipping behavior, and non-linear contrast adjustments (comb gaps).
    """
    engine_id: str = "HISTOGRAM"
    engine_name: str = "Color Histogram & Dynamic Range Analysis"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.GLOBAL_ANALYSIS
    description: str = "Measures multi-channel intensity distributions, Shannon entropy, dynamic range spread, clipping, and comb-like gaps."
    parameter_schema = HistogramParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG", "PNG", "WEBP", "TIFF"],
        min_dimensions=(16, 16),
        max_dimensions=(8192, 8192),
        requires_lossy_compression=False,
    )

    limitations: List[str] = [
        "Histogram distributions are governed primarily by scene illumination, lighting geometry, camera exposure, and surface reflectances.",
        "Comb-like histogram gaps and clipping occur routinely through in-camera auto-exposure, gamma correction, tone mapping, and legitimate creative grading.",
        "A histogram distribution anomaly does NOT by itself establish deceptive manipulation or localized tampering.",
        "Uncompressed or raw imagery can exhibit distinct discretization profiles compared to lossy compressed files without implying forgery.",
    ]

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Detecting Contrast Adjustments in Digital Images",
            authors="Stamm, M. C., Liu, K. J. R.",
            publication_venue="IEEE Transactions on Information Forensics and Security",
            year=2010,
            reference_type=ReferenceType.PAPER,
            notes="Formalizes the statistical detection of non-linear contrast stretching through comb-like periodicity in discrete histogram bins."
        ),
        ScientificReference(
            title="Digital Image Processing (4th Edition)",
            authors="Gonzalez, R. C., Woods, R. E.",
            publication_venue="Pearson",
            year=2018,
            reference_type=ReferenceType.BOOK,
            notes="Establishes fundamental intensity histograms, cumulative distribution functions, and information entropy in discrete image signals."
        ),
        ScientificReference(
            title="Forensic Detection of Image Equalization and Gamma Correction",
            authors="Farid, H.",
            publication_venue="IEEE Signal Processing Letters",
            year=2008,
            reference_type=ReferenceType.PAPER,
            notes="Models artifact signatures resulting from global and local contrast transformations in digital imagery."
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
                summary=f"Histogram analysis inapplicable: {applicability.reason}",
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
                if width < 16 or height < 16:
                    return EngineExecutionResult(
                        engine_id=self.engine_id,
                        engine_version=self.engine_version,
                        status=EngineExecutionStatus.FAILED,
                        summary=f"Image dimensions ({width}x{height}) below minimum threshold (16x16).",
                        execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
                    )
                
                # Bounded dimension guardrail
                max_dim = context.parameters.get("max_dimension", 4096)
                if max(width, height) > max_dim:
                    scale = max_dim / float(max(width, height))
                    new_w = max(16, int(width * scale))
                    new_h = max(16, int(height * scale))
                    pil_img = pil_img.resize((new_w, new_h), Image.Resampling.BILINEAR)
                    width, height = new_w, new_h

                if pil_img.mode in ("RGBA", "LA"):
                    background = Image.new("RGB", pil_img.size, (255, 255, 255))
                    background.paste(pil_img, mask=pil_img.split()[-1])
                    pil_img = background
                elif pil_img.mode not in ("RGB", "L"):
                    pil_img = pil_img.convert("RGB")

                is_color = pil_img.mode == "RGB"
                arr = np.array(pil_img, dtype=np.uint8)
        except Exception as e:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Image decode failed: {str(e)}",
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 3. Compute channel distributions
        total_pixels = width * height
        channels_to_process = {}
        
        if is_color:
            r_chan = arr[:, :, 0]
            g_chan = arr[:, :, 1]
            b_chan = arr[:, :, 2]
            y_chan = np.round(0.299 * r_chan + 0.587 * g_chan + 0.114 * b_chan).astype(np.uint8)
            channels_to_process["luminance"] = y_chan
            channels_to_process["red"] = r_chan
            channels_to_process["green"] = g_chan
            channels_to_process["blue"] = b_chan
        else:
            channels_to_process["luminance"] = arr

        channel_stats: Dict[str, Any] = {}
        hist_data: Dict[str, List[int]] = {}
        pdf_data: Dict[str, List[float]] = {}
        cdf_data: Dict[str, List[float]] = {}

        for ch_name, ch_arr in channels_to_process.items():
            counts, _ = np.histogram(ch_arr, bins=256, range=(0, 256))
            counts_list = counts.tolist()
            pdf = counts / float(total_pixels)
            cdf = np.cumsum(pdf)

            non_zero_p = pdf[pdf > 0]
            entropy = float(-np.sum(non_zero_p * np.log2(non_zero_p)))

            mean_val = float(np.mean(ch_arr))
            std_val = float(np.std(ch_arr))
            min_val = int(np.min(ch_arr))
            max_val = int(np.max(ch_arr))
            p10, p25, p50, p75, p90 = [float(x) for x in np.percentile(ch_arr, [10, 25, 50, 75, 90])]

            dynamic_range = max_val - min_val
            shadow_clipping_pct = float((counts[0] / total_pixels) * 100.0)
            highlight_clipping_pct = float((counts[255] / total_pixels) * 100.0)

            interior_bins = counts[min_val:max_val + 1] if max_val > min_val else np.array([])
            comb_gaps = int(np.sum(interior_bins == 0)) if len(interior_bins) > 0 else 0

            channel_stats[ch_name] = {
                "mean": round(mean_val, 4),
                "std_dev": round(std_val, 4),
                "median": round(p50, 4),
                "min": min_val,
                "max": max_val,
                "dynamic_range": dynamic_range,
                "percentiles": {
                    "p10": round(p10, 2),
                    "p25": round(p25, 2),
                    "p50": round(p50, 2),
                    "p75": round(p75, 2),
                    "p90": round(p90, 2),
                },
                "shannon_entropy": round(entropy, 4),
                "shadow_clipping_pct": round(shadow_clipping_pct, 4),
                "highlight_clipping_pct": round(highlight_clipping_pct, 4),
                "comb_gaps_count": comb_gaps,
                "dynamic_range_spread": round(std_val / 255.0, 4),
            }
            hist_data[ch_name] = counts_list
            pdf_data[ch_name] = [round(float(x), 6) for x in pdf]
            cdf_data[ch_name] = [round(float(x), 6) for x in cdf]

        # 4. Generate structured findings dictionary
        lum_stats = channel_stats["luminance"]
        findings_json = {
            "engine": self.engine_id,
            "version": self.engine_version,
            "image_dimensions": [width, height],
            "total_pixels": total_pixels,
            "is_color": is_color,
            "channel_statistics": channel_stats,
            "histogram_counts": hist_data,
            "normalized_pdf": pdf_data,
            "cumulative_cdf": cdf_data,
            "algorithm_parameters": {
                "bins": 256,
                "max_dimension": context.parameters.get("max_dimension", 4096),
            },
            "reproducibility": {
                "deterministic": True,
                "color_space": "sRGB / BT.601 Luminance",
            },
            "limitations": self.limitations,
        }

        # 5. Persist JSON artifact
        json_bytes = json.dumps(findings_json, indent=2).encode("utf-8")
        json_hash = hashlib.sha256(json_bytes).hexdigest()
        json_filename = "histogram_analysis.json"
        json_disk_path = os.path.join(out_dir, json_filename)
        with open(json_disk_path, "wb") as f:
            f.write(json_bytes)

        rel_json_path = self._resolve_relative_path(json_disk_path, context)
        json_metadata = EngineArtifactMetadata(
            artifact_id="histogram_analysis_data",
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
            description="Complete multi-channel histogram counts, CDFs, moments, entropy, and comb gap measurements.",
        )

        # 6. Generate and persist PNG plot artifact (Deterministic PIL Drawing)
        png_filename = "histogram_analysis.png"
        png_disk_path = os.path.join(out_dir, png_filename)
        
        # Create 800x600 canvas with 4 quadrants
        canvas = Image.new("RGB", (800, 600), (248, 250, 252))
        draw = ImageDraw.Draw(canvas)

        panels = [
            ("luminance", 20, 20, 380, 280, (51, 65, 85), "Luminance (Y)"),
            ("red", 420, 20, 380, 280, (220, 38, 38), "Red Channel"),
            ("green", 20, 320, 380, 280, (22, 163, 74), "Green Channel"),
            ("blue", 420, 320, 380, 280, (37, 99, 235), "Blue Channel"),
        ]

        for ch_key, px, py, pw, ph, bar_color, label in panels:
            # Border & inner box
            draw.rectangle([px, py, px + pw, py + ph], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
            
            if ch_key in hist_data:
                counts = hist_data[ch_key]
                max_cnt = max(counts) if max(counts) > 0 else 1
                st = channel_stats[ch_key]
                header_text = f"{label} - Entropy: {st['shannon_entropy']} b/px"
                draw.text((px + 12, py + 10), header_text, fill=(30, 41, 59))

                # Plot area inside panel
                plot_x0 = px + 15
                plot_y0 = py + 35
                plot_w = pw - 30
                plot_h = ph - 50

                # Grid baseline
                draw.line([(plot_x0, plot_y0 + plot_h), (plot_x0 + plot_w, plot_y0 + plot_h)], fill=(226, 232, 240), width=1)

                # Draw 256 bars
                bar_step = plot_w / 256.0
                for bin_idx, cnt in enumerate(counts):
                    bx = plot_x0 + int(bin_idx * bar_step)
                    bh = int((cnt / float(max_cnt)) * (plot_h - 10))
                    by = plot_y0 + plot_h - bh
                    draw.rectangle([bx, by, bx + max(1, int(bar_step)), plot_y0 + plot_h], fill=bar_color)

                # Overlay CDF line
                cdf_vals = cdf_data[ch_key]
                cdf_pts = []
                for bin_idx, cdf_v in enumerate(cdf_vals):
                    cx = plot_x0 + int(bin_idx * bar_step)
                    cy = plot_y0 + plot_h - int(cdf_v * (plot_h - 10))
                    cdf_pts.append((cx, cy))
                if len(cdf_pts) > 1:
                    draw.line(cdf_pts, fill=(15, 23, 42), width=2)
            else:
                draw.text((px + pw // 3, py + ph // 2), "Channel Not Present", fill=(148, 163, 184))

        canvas.save(png_disk_path, format="PNG")
        with open(png_disk_path, "rb") as f:
            png_bytes = f.read()
        png_hash = hashlib.sha256(png_bytes).hexdigest()

        rel_png_path = self._resolve_relative_path(png_disk_path, context)
        png_metadata = EngineArtifactMetadata(
            artifact_id="histogram_analysis_plot",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            artifact_type=ArtifactType.PLOT,
            filename=png_filename,
            storage_path=rel_png_path,
            sha256_hash=png_hash,
            mime_type="image/png",
            size_bytes=len(png_bytes),
            description="Multi-channel histogram frequency distributions and cumulative distribution curves.",
        )

        # 7. Construct Normalized Observation
        has_elevated_comb = lum_stats["comb_gaps_count"] > 15
        has_heavy_clipping = (lum_stats["shadow_clipping_pct"] > 5.0) or (lum_stats["highlight_clipping_pct"] > 5.0)
        direction = "elevated" if (has_elevated_comb or has_heavy_clipping) else "informational"

        observation = NormalizedObservation(
            evidence_id=context.evidence_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status="APPLIED",
            observation_type="HISTOGRAM",
            metric_name="LUMINANCE_ENTROPY",
            raw_value=str(lum_stats["shannon_entropy"]),
            normalized_value=round(min(1.0, lum_stats["shannon_entropy"] / 8.0), 4),
            direction=direction,
            technical_reliability="HIGH",
            result_data={
                "luminance_entropy": lum_stats["shannon_entropy"],
                "luminance_mean": lum_stats["mean"],
                "luminance_std": lum_stats["std_dev"],
                "comb_gaps_count": lum_stats["comb_gaps_count"],
                "shadow_clipping_pct": lum_stats["shadow_clipping_pct"],
                "highlight_clipping_pct": lum_stats["highlight_clipping_pct"],
                "dynamic_range": lum_stats["dynamic_range"],
                "is_color": is_color,
            },
            parameters_used=context.parameters,
            interpretation=(
                f"Luminance intensity distribution shows Shannon entropy of {lum_stats['shannon_entropy']} bits/pixel "
                f"across a dynamic range of [{lum_stats['min']}, {lum_stats['max']}]. "
                f"Identified {lum_stats['comb_gaps_count']} interior comb-like bin gaps and "
                f"{lum_stats['shadow_clipping_pct']}% shadow / {lum_stats['highlight_clipping_pct']}% highlight clipping."
            ),
            limitations=self.limitations,
        )

        exec_time = (time.perf_counter() - start_time) * 1000.0
        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary=(
                f"Histogram analysis completed across {width}x{height} pixels. "
                f"Luminance entropy: {lum_stats['shannon_entropy']} b/px, "
                f"comb gaps: {lum_stats['comb_gaps_count']}."
            ),
            structured_findings=findings_json,
            artifacts=[png_metadata, json_metadata],
            observations=[observation],
            execution_time_ms=exec_time,
        )
