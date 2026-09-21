"""
ForenSight V4 — Aligned Double JPEG Compression (ADJPEG) Forensic Engine

Engine ID: ADJPEG
Category: GLOBAL_ANALYSIS
Investigates DCT coefficient histogram periodicity and double quantization (DQ)
traces across 8x8 block grids under aligned spatial coordinates.
"""

import os
import json
import time
import hashlib
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
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


class ADJPEGParameters(BaseModel):
    """Execution parameters for Aligned Double JPEG Analysis."""
    max_dimension: int = Field(2048, ge=128, le=4096, description="Maximum image dimension for bounded processing.")
    hist_range: int = Field(40, ge=10, le=100, description="Coefficient histogram evaluation range [-R, R].")


class ADJPEGEngine(BaseForensicEngine):
    """
    Forensic engine analyzing global DCT coefficient distributions for aligned
    double-JPEG compression characteristics (periodicity and comb artifacts).
    """
    engine_id: str = "ADJPEG"
    engine_name: str = "Aligned Double JPEG Compression Analysis"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.GLOBAL_ANALYSIS
    description: str = "Analyzes 8x8 block DCT coefficient histograms for periodic double-quantization (DQ) comb traces."
    parameter_schema = ADJPEGParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG"],
        min_dimensions=(32, 32),
        max_dimensions=(8192, 8192),
        requires_lossy_compression=True,
    )

    limitations: List[str] = [
        "Aligned double-JPEG analysis requires the primary and secondary compression grids to be strictly aligned (zero spatial crop/translation offset).",
        "Very high initial quality factors (e.g. Q1 > 95) or subsequent heavy recompressions (Q2 << Q1) can attenuate periodic histogram peaks.",
        "Smooth image regions lacking textured high-frequency detail provide sparse AC coefficient counts.",
        "Observation of histogram periodicity is a mathematical property of successive quantizations and does not by itself prove malicious intent or forgery.",
    ]

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Statistical Tools for Digital Image Forensics",
            authors="Popescu, A. C., Farid, H.",
            publication_venue="Proc. 6th International Workshop on Information Hiding",
            year=2004,
            reference_type=ReferenceType.PAPER,
            notes="Formalizes the mathematical model of double quantization in DCT coefficient histograms."
        ),
        ScientificReference(
            title="A Reverse Engineering Approach to Detect Double JPEG Compression",
            authors="Bianchi, T., Piva, A.",
            publication_venue="IEEE Transactions on Information Forensics and Security",
            year=2012,
            reference_type=ReferenceType.PAPER,
            notes="Analyzes periodic zeros and probability distribution functions in double-compressed JPEG images."
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
                summary=app_check.reason or "Evidence format is not applicable for Aligned Double JPEG analysis.",
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
                summary=f"Dimensions {orig_w}x{orig_h} are too small for 8x8 block DCT evaluation.",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 3. Parameters
        params = context.parameters or {}
        max_dim = max(128, min(params.get("max_dimension", 2048), 4096))
        hist_r = max(10, min(params.get("hist_range", 40), 100))

        if max(orig_w, orig_h) > max_dim:
            scale = max_dim / float(max(orig_w, orig_h))
            nw = max(32, int(orig_w * scale))
            nh = max(32, int(orig_h * scale))
            pil_img = pil_img.resize((nw, nh), Image.Resampling.BILINEAR)

        lum_np = np.array(pil_img, dtype=np.float32)
        h, w = lum_np.shape

        # Crop to multiples of 8
        crop_h = (h // 8) * 8
        crop_w = (w // 8) * 8
        lum_cropped = lum_np[:crop_h, :crop_w] - 128.0

        # 4. Extract Block DCT Coefficients
        num_blocks_y = crop_h // 8
        num_blocks_x = crop_w // 8
        total_blocks = num_blocks_y * num_blocks_x

        # Define representative low-to-mid frequency AC DCT modes: (u, v)
        modes_to_test = [
            (1, 0), (0, 1), (1, 1), (2, 0), (0, 2), (2, 1), (1, 2), (2, 2)
        ]

        mode_coeffs = {m: [] for m in modes_to_test}

        for by in range(num_blocks_y):
            for bx in range(num_blocks_x):
                block = lum_cropped[by*8 : (by+1)*8, bx*8 : (bx+1)*8]
                dct_block = cv2.dct(block)
                for m in modes_to_test:
                    mode_coeffs[m].append(float(dct_block[m[0], m[1]]))

        # 5. Histogram & Periodicity Spectral Analysis
        bins = np.arange(-hist_r, hist_r + 2) - 0.5  # integer-centered bins
        bin_centers = np.arange(-hist_r, hist_r + 1)
        mode_results = []
        periodic_modes_count = 0
        max_periodicity_ratio = 1.0
        primary_mode_data = None

        for m in modes_to_test:
            vals = np.array(mode_coeffs[m], dtype=np.float32)
            hist, _ = np.histogram(vals, bins=bins)
            hist = hist.astype(np.float32)

            # Subtract local moving average to isolate high-frequency comb ripples
            window = 5
            pad = window // 2
            padded_hist = np.pad(hist, pad, mode="edge")
            smoothed_hist = np.convolve(padded_hist, np.ones(window)/window, mode="valid")
            residual_hist = hist - smoothed_hist

            # 1D FFT over the residual histogram
            fft_mag = np.abs(np.fft.rfft(residual_hist))
            freqs = np.fft.rfftfreq(len(residual_hist))

            # Look for periodicity peaks in non-DC frequencies (0.08 to 0.48)
            valid_idx = np.where((freqs >= 0.08) & (freqs <= 0.48))[0]
            if len(valid_idx) > 0:
                sub_fft = fft_mag[valid_idx]
                peak_val = float(np.max(sub_fft))
                med_val = float(np.median(sub_fft))
                if med_val > 0.001:
                    ratio = peak_val / med_val
                else:
                    ratio = 1.0
                peak_freq = float(freqs[valid_idx[np.argmax(sub_fft)]])
                estimated_period = round(1.0 / peak_freq, 2) if peak_freq > 0 else 0.0
            else:
                ratio = 1.0
                peak_freq = 0.0
                estimated_period = 0.0

            # Threshold for statistical periodicity: ratio >= 3.2
            is_periodic = ratio >= 3.2
            if is_periodic:
                periodic_modes_count += 1

            if ratio > max_periodicity_ratio:
                max_periodicity_ratio = ratio
                primary_mode_data = {
                    "mode": m,
                    "bin_centers": bin_centers.tolist(),
                    "histogram": hist.tolist(),
                    "fft_magnitudes": fft_mag.tolist(),
                    "frequencies": freqs.tolist(),
                    "peak_frequency": peak_freq,
                    "periodicity_ratio": round(ratio, 3),
                }

            mode_results.append({
                "mode": f"({m[0]},{m[1]})",
                "periodicity_ratio": round(ratio, 3),
                "peak_frequency": round(peak_freq, 4),
                "estimated_period": estimated_period,
                "is_periodic": is_periodic,
                "zero_bins_count": int(np.sum(hist == 0)),
            })

        # 6. Diagnostic Visualization Artifact
        os.makedirs(context.storage_output_dir, exist_ok=True)
        plot_filename = f"adjpeg_spectrum_{context.evidence_id}.png"
        plot_disk_path = os.path.join(context.storage_output_dir, plot_filename)

        # Render 2-panel diagnostic chart (Histogram & FFT Spectrum)
        render_diagnostic_plot(
            plot_disk_path,
            primary_mode_data or {
                "mode": (1, 0),
                "bin_centers": bin_centers.tolist(),
                "histogram": [0] * len(bin_centers),
                "fft_magnitudes": [0] * 10,
                "frequencies": [0] * 10,
                "periodicity_ratio": 1.0,
            }
        )

        with open(plot_disk_path, "rb") as f:
            plot_bytes = f.read()
        plot_sha256 = hashlib.sha256(plot_bytes).hexdigest()

        try:
            from app.core.config import settings
            base_dir = os.path.abspath(settings.STORAGE_DIR)
            abs_disk = os.path.abspath(plot_disk_path)
            if os.path.splitdrive(abs_disk)[0].lower() == os.path.splitdrive(base_dir)[0].lower() and abs_disk.startswith(base_dir):
                rel_plot_path = os.path.relpath(abs_disk, start=base_dir).replace("\\", "/")
            else:
                rel_plot_path = os.path.relpath(plot_disk_path, start=os.path.dirname(context.storage_output_dir)).replace("\\", "/")
        except Exception:
            rel_plot_path = os.path.relpath(plot_disk_path, start=context.storage_output_dir).replace("\\", "/")

        plot_artifact = EngineArtifactMetadata(
            artifact_id=f"adjpeg_spectrum_{context.evidence_id}",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.PLOT,
            mime_type="image/png",
            storage_path=rel_plot_path,
            sha256_hash=plot_sha256,
            width=640,
            height=320,
            parameters_used={"max_periodicity_ratio": round(max_periodicity_ratio, 3)}
        )

        # 7. JSON Artifact
        json_filename = f"adjpeg_analysis_{context.evidence_id}.json"
        json_disk_path = os.path.join(context.storage_output_dir, json_filename)

        has_aligned_dq_traces = periodic_modes_count >= 2

        json_payload = {
            "engine_id": self.engine_id,
            "engine_version": self.engine_version,
            "evidence_id": context.evidence_id,
            "analysis_id": context.analysis_id,
            "evidence_sha256": context.sha256_hash,
            "parameters": {
                "max_dimension": max_dim,
                "hist_range": hist_r,
                "total_blocks_evaluated": total_blocks,
            },
            "provenance": {
                "engine": self.engine_id,
                "version": self.engine_version,
                "method": "Aligned Double JPEG Discrete Cosine Histogram Periodicity (Popescu-Farid 2004)",
            },
            "results": {
                "has_aligned_double_jpeg_traces": has_aligned_dq_traces,
                "periodic_modes_count": periodic_modes_count,
                "evaluated_modes_count": len(modes_to_test),
                "max_periodicity_ratio": round(max_periodicity_ratio, 3),
                "mode_evaluations": mode_results,
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
            artifact_id=f"adjpeg_data_{context.evidence_id}",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.JSON,
            mime_type="application/json",
            storage_path=rel_json_path,
            sha256_hash=json_sha256,
            provenance_metadata={"periodic_modes": periodic_modes_count}
        )

        # 8. Normalized Observation
        direction = "anomalous" if has_aligned_dq_traces else "nominal"
        interpretation = (
            f"Observed statistical characteristics consistent with aligned double-JPEG compression across "
            f"{periodic_modes_count}/{len(modes_to_test)} evaluated DCT modes (peak energy ratio: {max_periodicity_ratio:.2f})."
            if has_aligned_dq_traces
            else f"No clear aligned double-JPEG characteristics observed across {len(modes_to_test)} evaluated DCT frequency modes."
        )

        obs_summary = (
            f"Evaluated {total_blocks} blocks across {len(modes_to_test)} DCT modes. "
            f"Periodic modes: {periodic_modes_count}. Max periodicity ratio: {max_periodicity_ratio:.2f}."
        )

        observation = NormalizedObservation(
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED.value,
            observation_type="ADJPEG",
            metric_name="PERIODICITY_STRENGTH",
            raw_value=f"{max_periodicity_ratio:.2f}",
            normalized_value=min(max_periodicity_ratio / 6.0, 1.0),
            direction=direction,
            interpretation=interpretation,
            limitations=self.limitations,
            result_data={
                "has_aligned_double_jpeg_traces": has_aligned_dq_traces,
                "periodic_modes_count": periodic_modes_count,
                "max_periodicity_ratio": round(max_periodicity_ratio, 3),
                "total_blocks": total_blocks,
                "mode_evaluations": mode_results,
            },
            parameters_used={
                "hist_range": hist_r,
                "max_dimension": max_dim,
            },
        )

        structured_findings = {
            "has_aligned_double_jpeg_traces": has_aligned_dq_traces,
            "periodic_modes_count": periodic_modes_count,
            "max_periodicity_ratio": round(max_periodicity_ratio, 3),
            "total_blocks": total_blocks,
            "mode_evaluations": mode_results,
            "artifacts": {
                "adjpeg_spectrum": rel_plot_path,
                "adjpeg_data": rel_json_path,
            }
        }

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary=obs_summary,
            observations=[observation],
            artifacts=[plot_artifact, json_artifact],
            structured_findings=structured_findings,
            limitations=self.limitations,
            execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
        )


def render_diagnostic_plot(out_path: str, primary_data: Dict[str, Any]) -> None:
    """Renders a clean 640x320 2-panel diagnostic chart for DCT histogram and Fourier spectrum."""
    img = Image.new("RGB", (640, 320), color=(17, 24, 39))  # Dark background #111827
    draw = ImageDraw.Draw(img)

    # Panel 1: DCT Coefficient Histogram (Left, width 290)
    draw.rectangle([20, 20, 300, 300], outline=(55, 65, 81), fill=(31, 41, 55))
    draw.text((30, 25), f"DCT Histogram Mode {primary_data['mode']}", fill=(243, 244, 246))

    hist = primary_data.get("histogram", [])
    if hist and max(hist) > 0:
        max_h = max(hist)
        bar_w = max(1, 260 // len(hist))
        start_x = 30
        for i, count in enumerate(hist):
            bar_h = int((count / max_h) * 230)
            bx = start_x + i * bar_w
            by = 285 - bar_h
            draw.rectangle([bx, by, bx + bar_w - 1, 285], fill=(59, 130, 246))  # Primary blue

    # Panel 2: Fourier Magnitude Spectrum (Right, width 290)
    draw.rectangle([340, 20, 620, 300], outline=(55, 65, 81), fill=(31, 41, 55))
    draw.text((350, 25), f"Fourier Spectrum (Ratio: {primary_data.get('periodicity_ratio', 1.0):.2f})", fill=(243, 244, 246))

    ffts = primary_data.get("fft_magnitudes", [])
    if ffts and max(ffts) > 0:
        max_f = max(ffts)
        pts = []
        step_x = 260.0 / max(1, len(ffts) - 1)
        for i, val in enumerate(ffts):
            px = 350 + int(i * step_x)
            py = 285 - int((val / max_f) * 230)
            pts.append((px, py))
        if len(pts) > 1:
            draw.line(pts, fill=(16, 185, 129), width=2)  # Emerald green

    img.save(out_path, format="PNG")
