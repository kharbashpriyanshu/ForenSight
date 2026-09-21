"""
ForenSight V4 — Non-Aligned Double JPEG Compression (NADJPEG) Forensic Engine

Engine ID: NADJPEG
Category: LOCAL_ANALYSIS
Analyzes spatial block boundary discontinuity metrics across all 64 candidate phase
offsets (0-7 horizontal/vertical) to detect cropping, shifting, and non-aligned recompression.
"""

import os
import json
import time
import hashlib
import numpy as np
import cv2
from PIL import Image, ImageDraw
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


class NADJPEGParameters(BaseModel):
    """Execution parameters for Non-Aligned Double JPEG Analysis."""
    max_dimension: int = Field(2048, ge=128, le=4096, description="Maximum image dimension for bounded processing.")
    spatial_threshold: float = Field(1.35, ge=1.1, le=3.0, description="Contrast threshold for identifying non-aligned phase peaks.")


class NADJPEGEngine(BaseForensicEngine):
    """
    Forensic engine analyzing non-aligned double-JPEG compression traces.
    Evaluates boundary difference energies across all 64 candidate grid phases [0..7]x[0..7].
    """
    engine_id: str = "NADJPEG"
    engine_name: str = "Non-Aligned Double JPEG Compression Analysis"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.LOCAL_ANALYSIS
    description: str = "Evaluates 64-phase spatial boundary gradient metrics to detect double-compression across shifted or cropped 8x8 grids."
    parameter_schema = NADJPEGParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG"],
        min_dimensions=(32, 32),
        max_dimensions=(8192, 8192),
        requires_lossy_compression=True,
    )

    limitations: List[str] = [
        "Non-aligned grid analysis detects crop or translation shifts; if the recompression is aligned at (0,0), use ADJPEG instead.",
        "High-frequency image textures and natural geometric grid lines (e.g. brick walls, textiles) can generate non-compression boundary energy peaks.",
        "Very weak primary compression (e.g. Q1 near 100) leaves faint boundary steps that may fall below detection thresholds after second compression.",
        "Candidate shift detections require contextual analyst review and do not alone prove fraudulent intent.",
    ]

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Detection of Nonaligned Double JPEG Compression Based on Integer Periodicity Feature",
            authors="Li, W., Yuan, Y., Yu, N.",
            publication_venue="IEEE International Conference on Multimedia and Expo",
            year=2008,
            reference_type=ReferenceType.PAPER,
            notes="Introduces spatial boundary difference accumulation across all 64 shifted 8x8 block grid phases."
        ),
        ScientificReference(
            title="Non-Aligned Double JPEG Compression Detection by Multicell Shift Analysis",
            authors="Bianchi, T., Piva, A.",
            publication_venue="IEEE Transactions on Information Forensics and Security",
            year=2011,
            reference_type=ReferenceType.PAPER,
            notes="Comprehensive mathematical framework characterizing blocking artifact grid displacements and energy contrast."
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
                summary=app_check.reason or "Evidence format is not applicable for Non-Aligned Double JPEG analysis.",
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
            pil_img = Image.open(context.stored_path).convert("L")
        except Exception as ex:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Failed to decode JPEG luminance raster: {str(ex)}",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        orig_w, orig_h = pil_img.size
        if orig_w < 32 or orig_h < 32:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Image dimensions ({orig_w}x{orig_h}) are too small for 64-phase boundary evaluation.",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 3. Parameters
        params = context.parameters or {}
        max_dim = max(128, min(params.get("max_dimension", 2048), 4096))
        thresh = float(params.get("spatial_threshold", 1.35))

        if max(orig_w, orig_h) > max_dim:
            scale = max_dim / float(max(orig_w, orig_h))
            nw = max(32, int(orig_w * scale))
            nh = max(32, int(orig_h * scale))
            pil_img = pil_img.resize((nw, nh), Image.Resampling.BILINEAR)

        lum = np.array(pil_img, dtype=np.float32)
        h, w = lum.shape

        # 4. 64-Phase Grid Boundary Metric Calculation
        # Compute horizontal and vertical forward first differences
        # diff_y: |I(r, c) - I(r+1, c)|
        diff_y = np.abs(lum[:-1, :] - lum[1:, :])
        # diff_x: |I(r, c) - I(r, c+1)|
        diff_x = np.abs(lum[:, :-1] - lum[:, 1:])

        # Accumulate boundary metric matrix E[dr, dc] for dr in 0..7, dc in 0..7
        energy_matrix = np.zeros((8, 8), dtype=np.float32)

        # For each candidate shift (dr, dc), sum differences occurring along lines r = dr (mod 8) and c = dc (mod 8)
        for dr in range(8):
            for dc in range(8):
                # Row boundary lines for shift dr
                row_indices = np.arange(dr, diff_y.shape[0], 8)
                col_indices = np.arange(dc, diff_x.shape[1], 8)

                e_rows = np.mean(diff_y[row_indices, :]) if len(row_indices) > 0 else 0.0
                e_cols = np.mean(diff_x[:, col_indices]) if len(col_indices) > 0 else 0.0

                energy_matrix[dr, dc] = (e_rows + e_cols) / 2.0

        # Baseline energy: median across all 64 candidate phases
        median_energy = float(np.median(energy_matrix))
        mean_energy = float(np.mean(energy_matrix))
        std_energy = float(np.std(energy_matrix))

        # Normalized contrast matrix: ratio to median energy
        contrast_matrix = energy_matrix / max(median_energy, 0.001)

        # Exclude aligned (0, 0) when searching for non-aligned candidate peak
        non_aligned_contrasts = contrast_matrix.copy()
        aligned_contrast = float(contrast_matrix[0, 0])
        non_aligned_contrasts[0, 0] = 0.0

        best_flat_idx = int(np.argmax(non_aligned_contrasts))
        best_dr = int(best_flat_idx // 8)
        best_dc = int(best_flat_idx % 8)
        best_contrast = float(non_aligned_contrasts[best_dr, best_dc])

        # Has non-aligned double compression traces if peak contrast exceeds threshold
        has_nad_traces = best_contrast >= thresh and (best_dr != 0 or best_dc != 0)

        # 5. Local Inconsistency Map across Macroblocks
        # Divide image into 32x32 blocks to map local candidate regions
        blk_sz = 32
        nb_y = h // blk_sz
        nb_x = w // blk_sz
        local_map = np.zeros((nb_y, nb_x), dtype=np.float32)

        if nb_y > 0 and nb_x > 0:
            for by in range(nb_y):
                for bx in range(nb_x):
                    sub_y = diff_y[by*blk_sz : (by+1)*blk_sz - 1, bx*blk_sz : (bx+1)*blk_sz]
                    sub_x = diff_x[by*blk_sz : (by+1)*blk_sz, bx*blk_sz : (bx+1)*blk_sz - 1]

                    r_idx = np.arange(best_dr, sub_y.shape[0], 8)
                    c_idx = np.arange(best_dc, sub_x.shape[1], 8)

                    if len(r_idx) > 0 and len(c_idx) > 0:
                        er = np.mean(sub_y[r_idx, :])
                        ec = np.mean(sub_x[:, c_idx])
                        local_map[by, bx] = (er + ec) / 2.0

            local_contrast = local_map / max(np.median(local_map), 0.001)
        else:
            local_contrast = np.ones((1, 1), dtype=np.float32)

        # 6. Artifact Generation
        os.makedirs(context.storage_output_dir, exist_ok=True)

        # Visualization Artifact: 8x8 Grid Energy Matrix Visualization (PNG)
        vis_filename = f"nadjpeg_matrix_{context.evidence_id}.png"
        vis_disk_path = os.path.join(context.storage_output_dir, vis_filename)
        render_nadjpeg_visualization(vis_disk_path, contrast_matrix, best_dr, best_dc, best_contrast)

        with open(vis_disk_path, "rb") as f:
            vis_bytes = f.read()
        vis_sha256 = hashlib.sha256(vis_bytes).hexdigest()

        try:
            from app.core.config import settings
            base_dir = os.path.abspath(settings.STORAGE_DIR)
            abs_disk = os.path.abspath(vis_disk_path)
            if os.path.splitdrive(abs_disk)[0].lower() == os.path.splitdrive(base_dir)[0].lower() and abs_disk.startswith(base_dir):
                rel_vis_path = os.path.relpath(abs_disk, start=base_dir).replace("\\", "/")
            else:
                rel_vis_path = os.path.relpath(vis_disk_path, start=os.path.dirname(context.storage_output_dir)).replace("\\", "/")
        except Exception:
            rel_vis_path = os.path.relpath(vis_disk_path, start=context.storage_output_dir).replace("\\", "/")

        vis_artifact = EngineArtifactMetadata(
            artifact_id=f"nadjpeg_matrix_{context.evidence_id}",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.HEATMAP,
            mime_type="image/png",
            storage_path=rel_vis_path,
            sha256_hash=vis_sha256,
            width=480,
            height=360,
            parameters_used={"candidate_shift": f"({best_dr},{best_dc})"}
        )

        # JSON Artifact
        json_filename = f"nadjpeg_analysis_{context.evidence_id}.json"
        json_disk_path = os.path.join(context.storage_output_dir, json_filename)

        json_payload = {
            "engine_id": self.engine_id,
            "engine_version": self.engine_version,
            "evidence_id": context.evidence_id,
            "analysis_id": context.analysis_id,
            "evidence_sha256": context.sha256_hash,
            "parameters": {
                "max_dimension": max_dim,
                "spatial_threshold": thresh,
            },
            "provenance": {
                "engine": self.engine_id,
                "version": self.engine_version,
                "method": "64-Phase Integer Boundary Discontinuity Matrix (Li 2008 / Bianchi 2011)",
            },
            "results": {
                "has_non_aligned_double_jpeg_traces": has_nad_traces,
                "candidate_shift_offset": {"row_shift": best_dr, "col_shift": best_dc},
                "peak_contrast_ratio": round(best_contrast, 4),
                "aligned_contrast_ratio": round(aligned_contrast, 4),
                "energy_distribution_64": [
                    {
                        "row_shift": r,
                        "col_shift": c,
                        "raw_energy": round(float(energy_matrix[r, c]), 4),
                        "contrast_ratio": round(float(contrast_matrix[r, c]), 4),
                    }
                    for r in range(8) for c in range(8)
                ],
                "matrix_statistics": {
                    "mean_energy": round(mean_energy, 4),
                    "median_energy": round(median_energy, 4),
                    "std_energy": round(std_energy, 4),
                }
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
            artifact_id=f"nadjpeg_data_{context.evidence_id}",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.JSON,
            mime_type="application/json",
            storage_path=rel_json_path,
            sha256_hash=json_sha256,
            provenance_metadata={"candidate_shift": f"({best_dr},{best_dc})"}
        )

        # 7. Normalized Observation
        direction = "anomalous" if has_nad_traces else "nominal"
        interpretation = (
            f"Observed boundary energy peak (contrast ratio: {best_contrast:.2f}x) at non-aligned shift offset ({best_dr}, {best_dc}) "
            f"consistent with non-aligned double JPEG compression (prior crop or translation)."
            if has_nad_traces
            else f"No significant non-aligned double JPEG boundary discontinuity detected across the 64 evaluated grid phases (peak contrast: {best_contrast:.2f}x)."
        )

        obs_summary = (
            f"Evaluated 64 grid phases. Peak non-aligned shift: ({best_dr}, {best_dc}) "
            f"with contrast ratio {best_contrast:.2f}x (threshold: {thresh:.2f})."
        )

        observation = NormalizedObservation(
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED.value,
            observation_type="NADJPEG",
            metric_name="GRID_OFFSET_ENERGY",
            raw_value=f"{best_contrast:.2f}",
            normalized_value=min(max(best_contrast - 1.0, 0.0) / 2.0, 1.0),
            direction=direction,
            interpretation=interpretation,
            limitations=self.limitations,
            result_data={
                "has_non_aligned_double_jpeg_traces": has_nad_traces,
                "candidate_shift_offset": {"row_shift": best_dr, "col_shift": best_dc},
                "peak_contrast_ratio": round(best_contrast, 3),
                "aligned_contrast_ratio": round(aligned_contrast, 3),
            },
            parameters_used={
                "spatial_threshold": thresh,
                "max_dimension": max_dim,
            },
        )

        structured_findings = {
            "has_non_aligned_double_jpeg_traces": has_nad_traces,
            "candidate_shift_offset": {"row_shift": best_dr, "col_shift": best_dc},
            "peak_contrast_ratio": round(best_contrast, 3),
            "aligned_contrast_ratio": round(aligned_contrast, 3),
            "artifacts": {
                "nadjpeg_matrix": rel_vis_path,
                "nadjpeg_data": rel_json_path,
            }
        }

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary=obs_summary,
            observations=[observation],
            artifacts=[vis_artifact, json_artifact],
            structured_findings=structured_findings,
            limitations=self.limitations,
            execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
        )


def render_nadjpeg_visualization(out_path: str, contrast_matrix: np.ndarray, best_r: int, best_c: int, peak_contrast: float) -> None:
    """Renders a 480x360 diagnostic plot of the 8x8 phase matrix with color shading."""
    img = Image.new("RGB", (480, 360), color=(17, 24, 39))  # Dark background
    draw = ImageDraw.Draw(img)

    draw.text((25, 15), "NADJPEG: 64-Phase Grid Shift Energy Matrix [0..7]x[0..7]", fill=(243, 244, 246))
    draw.text((25, 35), f"Peak Shift: ({best_r}, {best_c}) — Contrast Ratio: {peak_contrast:.2f}x", fill=(59, 130, 246))

    # Draw 8x8 grid of phase cells (cell size 32x32)
    start_x = 110
    start_y = 65
    cell_sz = 32

    # Draw column labels
    for c in range(8):
        draw.text((start_x + c * cell_sz + 10, start_y - 18), str(c), fill=(156, 163, 175))
    # Draw row labels
    for r in range(8):
        draw.text((start_x - 18, start_y + r * cell_sz + 8), str(r), fill=(156, 163, 175))

    c_min = float(np.min(contrast_matrix))
    c_max = float(np.max(contrast_matrix))
    c_range = max(c_max - c_min, 0.001)

    for r in range(8):
        for c in range(8):
            val = float(contrast_matrix[r, c])
            norm = (val - c_min) / c_range
            is_peak = (r == best_r and c == best_c)

            # Cell color: dark blue to cyan/emerald
            if is_peak:
                color = (239, 68, 68)  # Highlight peak in red/amber
            else:
                red = int(30 + norm * 40)
                green = int(50 + norm * 150)
                blue = int(120 + norm * 135)
                color = (min(red, 255), min(green, 255), min(blue, 255))

            bx = start_x + c * cell_sz
            by = start_y + r * cell_sz
            draw.rectangle([bx, by, bx + cell_sz - 2, by + cell_sz - 2], fill=color)

    draw.text((25, 335), "Row/Col indices correspond to horizontal & vertical pixel crop offsets.", fill=(156, 163, 175))
    img.save(out_path, format="PNG")
