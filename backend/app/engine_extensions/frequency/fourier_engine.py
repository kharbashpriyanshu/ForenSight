"""
ForenSight V4 — Fourier 2D Frequency Spectrum Forensics Engine

Engine ID: FOURIER
Version: 1.0.0
Category: GLOBAL_ANALYSIS

Performs 2D Fast Fourier Transform (FFT) frequency domain spectral analysis.
Computes zero-centered 2D magnitude and power spectra, partitions radial frequency
energy (low, mid, high bands), measures spectral concentration/entropy, and isolates
symmetric periodic harmonic peaks characteristic of resampling, periodic patterns, or textures.
"""

import os
import json
import time
import math
import hashlib
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import cv2
from PIL import Image, ImageDraw
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


class FourierParameters(BaseModel):
    """Parameters for Fourier 2D Frequency Analysis."""
    max_transform_dimension: int = Field(2048, ge=256, le=4096, description="Upper dimension bound for FFT computation.")
    peak_prominence_sigma: float = Field(3.0, ge=1.5, le=8.0, description="Prominence threshold in std-devs above spectral background.")
    max_reported_peaks: int = Field(20, ge=1, le=100, description="Maximum number of dominant periodic peaks to isolate.")


class FourierEngine(BaseForensicEngine):
    """
    Forensic engine implementing genuine 2D Fast Fourier Transform analysis.
    Evaluates global frequency distribution, low/mid/high radial spectral energy ratios,
    and detects discrete periodic harmonic spikes in the magnitude spectrum.
    """
    engine_id: str = "FOURIER"
    engine_name: str = "Fourier 2D Frequency Spectrum Analysis"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.GLOBAL_ANALYSIS
    description: str = "Computes 2D FFT magnitude spectrum, radial frequency band energies, and detects periodic harmonic peaks."
    parameter_schema = FourierParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG", "PNG", "WEBP", "TIFF"],
        min_dimensions=(32, 32),
        max_dimensions=(8192, 8192),
        requires_lossy_compression=False,
    )

    limitations: List[str] = [
        "Periodic frequency components arise routinely from natural textures, textiles, halftone printing screens, repetitive architectural facades, and regular geometric patterns.",
        "JPEG lossy compression generates characteristic 8x8 block grid harmonics along Cartesian horizontal and vertical frequency axes.",
        "Spectral peaks indicate spatial periodicity in the luminance signal; they do NOT by themselves constitute proof of forgery or tampering.",
        "Image resizing before FFT analysis can introduce or attenuate high-frequency harmonics depending on the interpolation kernel.",
    ]

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Exposing Digital Forgeries by Detecting Traces of Resampling",
            authors="Popescu, A. C., Farid, H.",
            publication_venue="IEEE Transactions on Signal Processing",
            year=2005,
            reference_type=ReferenceType.PAPER,
            notes="Formalizes the relationship between periodic spatial interpolation kernels and periodic spectral peaks in the derivative frequency domain."
        ),
        ScientificReference(
            title="Digital Image Processing (4th Edition)",
            authors="Gonzalez, R. C., Woods, R. E.",
            publication_venue="Pearson",
            year=2018,
            reference_type=ReferenceType.BOOK,
            notes="Details 2D Discrete Fourier Transform, zero-frequency centering, magnitude/power spectra, and radial frequency distribution."
        ),
        ScientificReference(
            title="Detection of Copy-Move Forgery Using Discrete Fourier Transform",
            authors="Bashar, M. K., Noda, K., Ohnishi, N., Mori, K.",
            publication_venue="IEEE International Conference on Image Processing (ICIP)",
            year=2010,
            reference_type=ReferenceType.PAPER,
            notes="Applies Fourier magnitude representations and spectral phase features to model spatial duplication."
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
                summary=f"Fourier analysis inapplicable: {applicability.reason}",
                applicability=applicability,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 2. Decode image safely and extract luminance
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

                max_fft_dim = context.parameters.get("max_transform_dimension", 2048)
                if max(width, height) > max_fft_dim:
                    scale = max_fft_dim / float(max(width, height))
                    new_w = max(32, int(width * scale))
                    new_h = max(32, int(height * scale))
                    pil_img = pil_img.resize((new_w, new_h), Image.Resampling.BILINEAR)
                    width, height = new_w, new_h

                gray_img = pil_img.convert("L")
                arr = np.array(gray_img, dtype=np.float32)
        except Exception as e:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Image decode failed: {str(e)}",
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 3. 2D Fast Fourier Transform & Centering
        M, N = arr.shape
        fft2 = np.fft.fft2(arr)
        fft_shifted = np.fft.fftshift(fft2)

        mag_spectrum = np.abs(fft_shifted)
        power_spectrum = mag_spectrum ** 2
        total_energy = float(np.sum(power_spectrum))

        log_mag = np.log1p(mag_spectrum)

        # 4. Radial Frequency Energy Partitioning
        cy, cx = M / 2.0, N / 2.0
        y_coords, x_coords = np.ogrid[:M, :N]
        radial_dist = np.sqrt((x_coords - cx) ** 2 + (y_coords - cy) ** 2)
        max_radial = math.sqrt(cx ** 2 + cy ** 2)
        norm_radial = radial_dist / (max_radial + 1e-12)

        low_mask = norm_radial <= 0.15
        mid_mask = (norm_radial > 0.15) & (norm_radial <= 0.50)
        high_mask = (norm_radial > 0.50) & (norm_radial <= 1.0)

        low_energy = float(np.sum(power_spectrum[low_mask]))
        mid_energy = float(np.sum(power_spectrum[mid_mask]))
        high_energy = float(np.sum(power_spectrum[high_mask]))

        low_ratio = low_energy / (total_energy + 1e-12)
        mid_ratio = mid_energy / (total_energy + 1e-12)
        high_ratio = high_energy / (total_energy + 1e-12)

        norm_power = power_spectrum / (total_energy + 1e-12)
        valid_p = norm_power[norm_power > 0]
        spectral_entropy = float(-np.sum(valid_p * np.log2(valid_p)))

        # 5. Dominant Periodic Peak Detection
        prominence_sigma = context.parameters.get("peak_prominence_sigma", 3.0)
        max_peaks = context.parameters.get("max_reported_peaks", 20)

        dc_mask = norm_radial < 0.03
        bg_log_mag = cv2.GaussianBlur(log_mag, (21, 21), sigmaX=5.0)
        diff_spectrum = log_mag - bg_log_mag
        diff_spectrum[dc_mask] = 0.0

        diff_mean = float(np.mean(diff_spectrum[~dc_mask]))
        diff_std = float(np.std(diff_spectrum[~dc_mask]))
        peak_threshold = diff_mean + prominence_sigma * diff_std

        local_max = cv2.dilate(diff_spectrum, np.ones((5, 5), dtype=np.uint8)) == diff_spectrum
        candidate_peak_mask = (diff_spectrum >= peak_threshold) & local_max & (~dc_mask)

        peak_y, peak_x = np.where(candidate_peak_mask)
        detected_peaks: List[Dict[str, Any]] = []

        if len(peak_x) > 0:
            prominences = diff_spectrum[peak_y, peak_x]
            sort_idx = np.argsort(prominences)[::-1]

            used_coords = set()
            for idx in sort_idx:
                if len(detected_peaks) >= max_peaks:
                    break
                py, px = int(peak_y[idx]), int(peak_x[idx])
                
                if any(abs(py - oy) <= 2 and abs(px - ox) <= 2 for oy, ox in used_coords):
                    continue

                used_coords.add((py, px))

                dx = px - cx
                dy = py - cy
                r_norm = float(math.sqrt(dx ** 2 + dy ** 2) / (max_radial + 1e-12))
                angle_deg = float(math.degrees(math.atan2(dy, dx)))
                peak_mag = float(mag_spectrum[py, px])
                prom = float(diff_spectrum[py, px] / (diff_std + 1e-6))

                detected_peaks.append({
                    "u": px,
                    "v": py,
                    "normalized_radius": round(r_norm, 4),
                    "orientation_deg": round(angle_deg, 2),
                    "magnitude": round(peak_mag, 2),
                    "prominence_sigma": round(prom, 2),
                })

        # 6. Generate Artifacts
        # JSON Artifact
        findings_json = {
            "engine": self.engine_id,
            "version": self.engine_version,
            "image_dimensions": [width, height],
            "transform_dimensions": [N, M],
            "total_energy": total_energy,
            "radial_energy_ratios": {
                "low_frequency": round(low_ratio, 6),
                "mid_frequency": round(mid_ratio, 6),
                "high_frequency": round(high_ratio, 6),
            },
            "spectral_entropy": round(spectral_entropy, 4),
            "dominant_peaks": detected_peaks,
            "dominant_peak_count": len(detected_peaks),
            "algorithm_parameters": {
                "max_transform_dimension": max_fft_dim,
                "peak_prominence_sigma": prominence_sigma,
                "max_reported_peaks": max_peaks,
            },
            "reproducibility": {
                "deterministic": True,
                "transform": "2D-FFT centered (fftshift)",
            },
            "limitations": self.limitations,
        }

        json_bytes = json.dumps(findings_json, indent=2).encode("utf-8")
        json_hash = hashlib.sha256(json_bytes).hexdigest()
        json_filename = "fourier_analysis.json"
        json_disk_path = os.path.join(out_dir, json_filename)
        with open(json_disk_path, "wb") as f:
            f.write(json_bytes)

        rel_json_path = self._resolve_relative_path(json_disk_path, context)
        json_metadata = EngineArtifactMetadata(
            artifact_id="fourier_analysis_data",
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
            description="2D FFT radial frequency energies, spectral entropy, and periodic peak coordinates.",
        )

        # Plot Artifact: 2D Spectrum & Radial Bar (fourier_spectrum.png)
        spec_w, spec_h = min(400, N), min(400, M)
        min_l = float(np.min(log_mag))
        max_l = float(np.max(log_mag))
        l_span = (max_l - min_l) if (max_l - min_l) > 1e-6 else 1.0
        log_norm = ((log_mag - min_l) / l_span * 255.0).astype(np.uint8)
        spec_vis = cv2.resize(log_norm, (spec_w, spec_h))
        spec_color = cv2.applyColorMap(spec_vis, cv2.COLORMAP_INFERNO)

        # Draw radial band rings and peak markers on spec_color
        sc_x = spec_w / float(N)
        sc_y = spec_h / float(M)
        cen_x = int(cx * sc_x)
        cen_y = int(cy * sc_y)
        r_low_px = int(0.15 * max_radial * min(sc_x, sc_y))
        r_mid_px = int(0.50 * max_radial * min(sc_x, sc_y))

        cv2.circle(spec_color, (cen_x, cen_y), r_low_px, (248, 189, 56), 1, cv2.LINE_AA)
        cv2.circle(spec_color, (cen_x, cen_y), r_mid_px, (247, 85, 168), 1, cv2.LINE_AA)

        for pk in detected_peaks:
            px = int(pk["u"] * sc_x)
            py = int(pk["v"] * sc_y)
            cv2.circle(spec_color, (px, py), 5, (0, 0, 255), 2, cv2.LINE_AA)

        # Create combined 800x400 image with spectrum on left and radial energy bar chart on right
        out_canvas = Image.new("RGB", (800, max(400, spec_h)), (248, 250, 252))
        spec_pil = Image.fromarray(cv2.cvtColor(spec_color, cv2.COLOR_BGR2RGB))
        out_canvas.paste(spec_pil, (20, (out_canvas.height - spec_h) // 2))

        # Draw Right side bar chart using ImageDraw
        draw = ImageDraw.Draw(out_canvas)
        draw.text((450, 40), "Radial Frequency Energy Distribution", fill=(30, 41, 59))
        
        bands_data = [
            ("Low (0-15%)", low_ratio, (56, 189, 248)),
            ("Mid (15-50%)", mid_ratio, (168, 85, 247)),
            ("High (50-100%)", high_ratio, (236, 72, 153)),
        ]

        chart_y = 90
        for b_name, b_ratio, b_col in bands_data:
            draw.text((450, chart_y), b_name, fill=(71, 85, 105))
            draw.text((710, chart_y), f"{b_ratio*100:.1f}%", fill=(30, 41, 59))
            # Bar background
            draw.rectangle([450, chart_y + 18, 750, chart_y + 36], fill=(226, 232, 240))
            # Bar fill
            fill_w = int(300 * max(0.0, min(1.0, b_ratio)))
            draw.rectangle([450, chart_y + 18, 450 + fill_w, chart_y + 36], fill=b_col)
            chart_y += 65

        draw.text((450, 300), f"Spectral Entropy: {spectral_entropy:.2f} bits", fill=(71, 85, 105))
        draw.text((450, 325), f"Periodic Peaks Isolated: {len(detected_peaks)} (≥ {prominence_sigma}σ)", fill=(71, 85, 105))

        png_filename = "fourier_spectrum.png"
        png_disk_path = os.path.join(out_dir, png_filename)
        out_canvas.save(png_disk_path, format="PNG")

        with open(png_disk_path, "rb") as f:
            png_bytes = f.read()
        png_hash = hashlib.sha256(png_bytes).hexdigest()

        rel_png_path = self._resolve_relative_path(png_disk_path, context)
        png_metadata = EngineArtifactMetadata(
            artifact_id="fourier_spectrum_plot",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            artifact_type=ArtifactType.SPECTRUM,
            filename=png_filename,
            storage_path=rel_png_path,
            sha256_hash=png_hash,
            mime_type="image/png",
            size_bytes=len(png_bytes),
            description="2D Fourier log magnitude spectrum with radial bands and detected harmonic peaks.",
        )

        # 7. Construct Normalized Observation
        direction = "elevated" if len(detected_peaks) > 0 else "informational"
        obs_status = "ANOMALY_DETECTED" if len(detected_peaks) > 0 else "APPLIED"

        observation = NormalizedObservation(
            evidence_id=context.evidence_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=obs_status,
            observation_type="FOURIER",
            metric_name="HIGH_FREQUENCY_ENERGY_RATIO",
            raw_value=str(round(high_ratio, 6)),
            normalized_value=round(high_ratio, 4),
            direction=direction,
            technical_reliability="HIGH",
            result_data={
                "low_freq_energy_ratio": round(low_ratio, 6),
                "mid_freq_energy_ratio": round(mid_ratio, 6),
                "high_freq_energy_ratio": round(high_ratio, 6),
                "spectral_entropy": round(spectral_entropy, 4),
                "dominant_peak_count": len(detected_peaks),
                "dominant_peaks": detected_peaks,
            },
            parameters_used=context.parameters,
            interpretation=(
                f"2D FFT frequency spectrum decomposes energy into: low: {round(low_ratio*100, 1)}%, "
                f"mid: {round(mid_ratio*100, 1)}%, high: {round(high_ratio*100, 1)}%. "
                f"Detected {len(detected_peaks)} periodic harmonic peaks outside central DC region."
            ),
            limitations=self.limitations,
        )

        exec_time = (time.perf_counter() - start_time) * 1000.0
        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary=(
                f"Fourier 2D spectrum completed ({N}x{M}). "
                f"Energy: Low={round(low_ratio, 3)}, Mid={round(mid_ratio, 3)}, High={round(high_ratio, 3)}. "
                f"Periodic peaks detected: {len(detected_peaks)}."
            ),
            structured_findings=findings_json,
            artifacts=[png_metadata, json_metadata],
            observations=[observation],
            execution_time_ms=exec_time,
        )
