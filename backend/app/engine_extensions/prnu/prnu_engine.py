"""
ForenSight V4 — Photo-Response Non-Uniformity (PRNU) Forensic Engine

Engine ID: PRNU
Version: 1.0.0
Category: CAMERA_IDENTIFICATION

Extracts sensor pattern noise residuals, computes empirical suitability metrics,
supports reference fingerprint comparison, and evaluates camera sensor consistency.
"""

import os
import json
import time
import hashlib
from typing import Dict, Any, List, Optional
import numpy as np
import cv2
from PIL import Image, ImageDraw

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
from app.engine_extensions.prnu.prnu_models import PRNUParameters
from app.engine_extensions.prnu.prnu_extractor import (
    extract_noise_residual,
    zero_mean_normalize,
    calculate_suitability,
)


class PRNUEngine(BaseForensicEngine):
    """
    Forensic engine analyzing Photo-Response Non-Uniformity (PRNU) sensor pattern noise.
    Extracts sensor noise residuals, evaluates image suitability, and performs
    reference fingerprint correlation when a case-scoped camera reference is provided.
    """
    engine_id: str = "PRNU"
    engine_name: str = "Photo-Response Non-Uniformity Analysis"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.CAMERA_IDENTIFICATION
    description: str = (
        "Extracts camera sensor pattern noise residuals, evaluates suitability metrics, "
        "and measures correlation against investigator-provided reference fingerprints."
    )
    parameter_schema = PRNUParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG", "PNG", "WEBP", "TIFF"],
        min_dimensions=(32, 32),
        max_dimensions=(4096, 4096),
        color_spaces=["RGB", "GRAYSCALE", "RGBA"],
        requires_file_path=True,
    )

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Digital camera identification from sensor pattern noise",
            authors="Lukas, J., Goljan, M., Fridrich, J.",
            publication_venue="IEEE Transactions on Information Forensics and Security",
            year=2006,
            reference_type=ReferenceType.PAPER,
            notes="Foundational formulation establishing Photo-Response Non-Uniformity (PRNU) as an intrinsic physical sensor fingerprint for camera source identification."
        ),
        ScientificReference(
            title="Determining image origin and integrity using sensor noise",
            authors="Chen, M., Fridrich, J., Goljan, M., Lukáš, J.",
            publication_venue="IEEE Transactions on Information Forensics and Security",
            year=2008,
            reference_type=ReferenceType.PAPER,
            notes="Formulates Maximum Likelihood Estimation (MLE) of sensor fingerprints and normalized cross-correlation for device provenance and tampering detection."
        ),
        ScientificReference(
            title="Sensor fingerprint approach to digital camera identification and forgery detection",
            authors="Goljan, M., Fridrich, J., Chen, M.",
            publication_venue="Proceedings of SPIE, Electronic Imaging",
            year=2009,
            reference_type=ReferenceType.PAPER,
            notes="Validates large-scale PRNU identification, Peak-to-Correlation Energy (PCE), and robustness under JPEG recompression and geometric transformations."
        )
    ]

    limitations: List[str] = [
        "PRNU extraction is empirical and does not constitute absolute proof of camera source without validated reference fingerprints.",
        "Sensor pattern noise is degraded or eliminated by severe lossy recompression (JPEG Q < 60), resizing, social media re-encoding, and spatial denoising.",
        "Saturated pixels (pure black shadows or clipped specular highlights) destroy multiplicative sensor pattern noise in affected regions.",
        "Cropped, rotated, or geometrically warped images alter sensor spatial grid correspondence, requiring alignment before comparison.",
    ]

    def check_applicability(self, context: ExecutionContext) -> ApplicabilityResult:
        """Evaluates container format and resolution requirements."""
        if context.width is not None and context.height is not None:
            if context.width < 32 or context.height < 32:
                return ApplicabilityResult(
                    is_applicable=False,
                    reason=f"Image dimensions ({context.width}x{context.height}) below minimum required (32x32) for PRNU analysis.",
                )
        if context.image_format:
            fmt = context.image_format.upper()
            if fmt not in ["JPEG", "JPG", "PNG", "WEBP", "TIFF"]:
                return ApplicabilityResult(
                    is_applicable=False,
                    reason=f"Unsupported format '{fmt}'. PRNU analysis requires raster formats.",
                )
        return ApplicabilityResult(is_applicable=True)

    def _resolve_relative_path(self, full_path: str, context: ExecutionContext) -> str:
        try:
            rel = os.path.relpath(full_path, context.storage_output_dir)
            return rel.replace("\\", "/")
        except Exception:
            return os.path.basename(full_path)

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        start_time = time.perf_counter()

        applicability = self.check_applicability(context)
        if not applicability.is_applicable:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=f"Analysis skipped: {applicability.reason}",
                observations=[],
                artifacts=[],
                structured_findings={"reason": applicability.reason},
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 1. Parse parameters
        params = context.parameters or {}
        filter_sigma = float(params.get("filter_sigma", 1.5))
        filter_window = int(params.get("filter_window", 5))
        zero_mean_norm = bool(params.get("zero_mean_normalization", True))
        max_dim = int(params.get("max_dimension", 2048))
        target_ref_id = params.get("target_reference_id") or params.get("reference_id")
        case_id = params.get("case_id")

        # 2. Load input image
        img_path = getattr(context, "stored_path", None)
        if not img_path or not os.path.exists(img_path):
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Evidence file missing at: {img_path}",
                observations=[],
                artifacts=[],
                structured_findings={"error": "File not found"},
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        try:
            pil_img = Image.open(img_path)
            pil_img.load()
            orig_w, orig_h = pil_img.size
            if pil_img.mode != "RGB":
                pil_rgb = pil_img.convert("RGB")
            else:
                pil_rgb = pil_img
            np_rgb = np.array(pil_rgb)
        except Exception as e:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Failed to read image for PRNU analysis: {str(e)}",
                observations=[],
                artifacts=[],
                structured_findings={"error": str(e)},
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 3. Grayscale conversion & dynamic range validation
        gray = cv2.cvtColor(np_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
        H, W = gray.shape

        # Proportional downsample if oversized
        scale_factor = 1.0
        if max(H, W) > max_dim:
            scale_factor = float(max_dim) / float(max(H, W))
            new_w = max(32, int(W * scale_factor))
            new_h = max(32, int(H * scale_factor))
            gray = cv2.resize(gray, (new_w, new_h), interpolation=cv2.INTER_AREA)
            H, W = gray.shape

        if W < 32 or H < 32:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=f"Image dimensions ({W}x{H}) below minimum required (32x32).",
                observations=[],
                artifacts=[],
                structured_findings={"reason": "Dimensions below 32x32"},
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 4. Extract sensor noise residual
        raw_residual = extract_noise_residual(gray, filter_window=filter_window, filter_sigma=filter_sigma)
        if zero_mean_norm:
            residual = zero_mean_normalize(raw_residual)
        else:
            residual = raw_residual

        # 5. Calculate empirical suitability
        suitability = calculate_suitability(gray, residual)

        # 6. Reference Fingerprint Correlation (if target_ref_id provided)
        reference_data: Optional[Dict[str, Any]] = None
        correlation_val: Optional[float] = None
        match_status: str = "NOT_ESTIMATED"
        ref_fingerprint_arr: Optional[np.ndarray] = None

        if target_ref_id and case_id is not None:
            from app.engine_extensions.camera.camera_reference_library import CameraReferenceLibrary
            ref_entry = CameraReferenceLibrary.get_reference(case_id, str(target_ref_id))
            if ref_entry:
                ref_meta, ref_fp = ref_entry
                ref_fingerprint_arr = ref_fp
                # Compare if dimensions match or can be aligned
                if ref_fp.shape == residual.shape:
                    # Normalized Pearson correlation
                    r_flat = residual.ravel()
                    f_flat = ref_fp.ravel()
                    r_norm = r_flat - np.mean(r_flat)
                    f_norm = f_flat - np.mean(f_flat)
                    denom = (np.linalg.norm(r_norm) * np.linalg.norm(f_norm)) + 1e-7
                    corr = float(np.dot(r_norm, f_norm) / denom)
                    correlation_val = round(corr, 4)
                    if corr >= 0.03:
                        match_status = "CONSISTENT"
                    elif corr >= 0.01:
                        match_status = "INCONCLUSIVE"
                    else:
                        match_status = "INCONSISTENT"
                else:
                    match_status = "INCOMPATIBLE_DIMENSIONS"

                reference_data = {
                    "reference_id": ref_meta.reference_id,
                    "camera_label": ref_meta.camera_label,
                    "image_count": ref_meta.num_images_aggregated,
                    "dimensions": [ref_meta.width, ref_meta.height],
                    "correlation": correlation_val,
                    "status": match_status,
                }

        # 7. Generate Artifacts
        out_dir = context.storage_output_dir or os.path.dirname(img_path)
        os.makedirs(out_dir, exist_ok=True)
        res_filename = "prnu_residual.png"
        fp_filename = "prnu_fingerprint.png"
        diag_filename = "prnu_analysis.png"
        json_filename = "prnu_analysis.json"

        res_path = os.path.join(out_dir, res_filename)
        fp_path = os.path.join(out_dir, fp_filename)
        diag_path = os.path.join(out_dir, diag_filename)
        json_path = os.path.join(out_dir, json_filename)

        # Visual residual map (contrast enhanced)
        self._generate_residual_map(res_path, residual)

        # Optional reference fingerprint map
        has_fp_artifact = False
        if ref_fingerprint_arr is not None:
            self._generate_residual_map(fp_path, ref_fingerprint_arr)
            has_fp_artifact = True

        # Diagnostic plot
        self._generate_diagnostic_plot(
            diag_path,
            suitability=suitability,
            residual=residual,
            match_status=match_status,
            correlation_val=correlation_val,
            target_ref_id=target_ref_id,
        )

        # Structured Findings
        analysis_data = {
            "engine_id": self.engine_id,
            "engine_version": self.engine_version,
            "evidence_id": context.evidence_id,
            "analysis_id": context.analysis_id,
            "original_dimensions": [orig_w, orig_h],
            "analysis_dimensions": [W, H],
            "scale_factor": round(scale_factor, 4),
            "residual_statistics": {
                "variance": suitability["residual_variance"],
                "energy": suitability["residual_energy"],
                "mean": round(float(np.mean(residual)), 6),
                "std": round(float(np.std(residual)), 6),
                "min": round(float(np.min(residual)), 4),
                "max": round(float(np.max(residual)), 4),
            },
            "suitability": suitability,
            "reference_comparison": reference_data,
            "match_status": match_status,
            "correlation": correlation_val,
            "parameters": {
                "filter_sigma": filter_sigma,
                "filter_window": filter_window,
                "zero_mean_normalization": zero_mean_norm,
                "max_dimension": max_dim,
                "reference_id": target_ref_id,
            },
            "scientific_guardrail": (
                "Photo-Response Non-Uniformity (PRNU) evaluates high-frequency sensor pattern noise. "
                "Without a case-scoped reference camera fingerprint, camera source cannot be estimated. "
                "Method inapplicability or NOT_ESTIMATED status does NOT constitute negative evidence."
            ),
        }

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(analysis_data, f, indent=2)

        # 8. Artifact Metadata
        artifacts: List[EngineArtifactMetadata] = []

        with open(res_path, "rb") as f:
            res_bytes = f.read()
        artifacts.append(EngineArtifactMetadata(
            artifact_id="prnu_residual",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            analysis_id=context.analysis_id,
            evidence_id=context.evidence_id,
            artifact_type=ArtifactType.VISUALIZATION,
            storage_path=self._resolve_relative_path(res_path, context),
            sha256_hash=hashlib.sha256(res_bytes).hexdigest(),
            mime_type="image/png",
        ))

        if has_fp_artifact and os.path.exists(fp_path):
            with open(fp_path, "rb") as f:
                fp_bytes = f.read()
            artifacts.append(EngineArtifactMetadata(
                artifact_id="prnu_fingerprint",
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                analysis_id=context.analysis_id,
                evidence_id=context.evidence_id,
                artifact_type=ArtifactType.VISUALIZATION,
                storage_path=self._resolve_relative_path(fp_path, context),
                sha256_hash=hashlib.sha256(fp_bytes).hexdigest(),
                mime_type="image/png",
            ))

        with open(diag_path, "rb") as f:
            diag_bytes = f.read()
        artifacts.append(EngineArtifactMetadata(
            artifact_id="prnu_analysis",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            analysis_id=context.analysis_id,
            evidence_id=context.evidence_id,
            artifact_type=ArtifactType.PLOT,
            storage_path=self._resolve_relative_path(diag_path, context),
            sha256_hash=hashlib.sha256(diag_bytes).hexdigest(),
            mime_type="image/png",
        ))

        with open(json_path, "rb") as f:
            json_bytes = f.read()
        artifacts.append(EngineArtifactMetadata(
            artifact_id="prnu_json",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            analysis_id=context.analysis_id,
            evidence_id=context.evidence_id,
            artifact_type=ArtifactType.JSON,
            storage_path=self._resolve_relative_path(json_path, context),
            sha256_hash=hashlib.sha256(json_bytes).hexdigest(),
            mime_type="application/json",
        ))

        # 9. Normalized Observations
        observations = [
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="PRNU",
                metric_name="PRNU_RESIDUAL_VARIANCE",
                raw_value=str(suitability["residual_variance"]),
                normalized_value=float(min(1.0, suitability["residual_variance"] / 5.0)),
                direction="informational",
                technical_reliability="HIGH",
                result_data={"variance": suitability["residual_variance"]},
                parameters_used=context.parameters,
                interpretation=f"Sensor noise residual variance: {suitability['residual_variance']:.6f}.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="PRNU",
                metric_name="PRNU_RESIDUAL_ENERGY",
                raw_value=str(suitability["residual_energy"]),
                normalized_value=float(min(1.0, suitability["residual_energy"] / 5.0)),
                direction="informational",
                technical_reliability="HIGH",
                result_data={"energy": suitability["residual_energy"]},
                parameters_used=context.parameters,
                interpretation=f"Mean square sensor noise residual energy: {suitability['residual_energy']:.6f}.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="PRNU",
                metric_name="PRNU_SUITABILITY_INDEX",
                raw_value=str(suitability["suitability_index"]),
                normalized_value=float(suitability["suitability_index"]),
                direction="informational",
                technical_reliability="HIGH",
                result_data=suitability,
                parameters_used=context.parameters,
                interpretation=f"PRNU content suitability: {suitability['suitability_index']:.2f} ({suitability['status']}).",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="PRNU",
                metric_name="PRNU_MATCH_STATUS",
                raw_value=match_status,
                normalized_value=1.0 if match_status == "CONSISTENT" else 0.0,
                direction="elevated" if match_status == "CONSISTENT" else "informational",
                technical_reliability="HIGH",
                result_data={"status": match_status, "correlation": correlation_val},
                parameters_used=context.parameters,
                interpretation=(
                    f"Camera reference comparison: {match_status} (corr: {correlation_val})."
                    if correlation_val is not None
                    else "Camera identification NOT_ESTIMATED: No reference fingerprint supplied."
                ),
                limitations=self.limitations,
            ),
        ]

        if correlation_val is not None:
            observations.append(
                NormalizedObservation(
                    evidence_id=context.evidence_id,
                    analysis_id=context.analysis_id,
                    engine_id=self.engine_id,
                    engine_version=self.engine_version,
                    status="APPLIED",
                    observation_type="PRNU",
                    metric_name="PRNU_CORRELATION",
                    raw_value=str(correlation_val),
                    normalized_value=float(max(0.0, min(1.0, correlation_val))),
                    direction="elevated" if correlation_val >= 0.05 else "informational",
                    technical_reliability="HIGH",
                    result_data={"correlation": correlation_val},
                    parameters_used=context.parameters,
                    interpretation=f"Normalized correlation against reference {target_ref_id}: {correlation_val:.4f}.",
                    limitations=self.limitations,
                )
            )

        summary = (
            f"PRNU analysis complete: residual variance={suitability['residual_variance']:.5f}, "
            f"suitability={suitability['status']} ({suitability['suitability_index']:.2f}). "
            f"Camera identification: {match_status}."
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

    def _generate_residual_map(self, output_path: str, residual: np.ndarray) -> None:
        """Saves a contrast-stretched normalized visualization of noise residual."""
        res_std = float(np.std(residual))
        if res_std > 1e-7:
            norm_res = (residual / (res_std * 3.0)) * 127.5 + 127.5
        else:
            norm_res = np.full_like(residual, 127.5)
        clipped = np.clip(norm_res, 0, 255).astype(np.uint8)
        pil_res = Image.fromarray(clipped, mode="L")
        pil_res.save(output_path, "PNG")

    def _generate_diagnostic_plot(
        self,
        output_path: str,
        suitability: Dict[str, Any],
        residual: np.ndarray,
        match_status: str,
        correlation_val: Optional[float],
        target_ref_id: Optional[str],
    ) -> None:
        """Draws a clean, deterministic 3-panel PRNU diagnostic visualization."""
        W, H = 840, 360
        img = Image.new("RGB", (W, H), color=(248, 250, 252))
        draw = ImageDraw.Draw(img)

        # Panel 1: Residual Statistics & Quality Suitability
        draw.rectangle([20, 20, 270, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((32, 28), "Sensor Residual Quality", fill=(30, 41, 59))
        draw.text((32, 46), f"Status: {suitability['status']}", fill=(16, 185, 129) if suitability['status'] == "SUITABLE" else (234, 88, 12))

        # Suitability meter bar
        score = suitability["suitability_index"]
        draw.text((32, 85), f"Suitability Index: {score:.2f}", fill=(51, 65, 85))
        draw.rectangle([32, 105, 242, 118], fill=(241, 245, 249))
        bar_len = int(score * 210)
        draw.rectangle([32, 105, 32 + bar_len, 118], fill=(16, 185, 129) if score >= 0.5 else (245, 158, 11))

        draw.text((32, 140), f"Residual Var: {suitability['residual_variance']:.5f}", fill=(71, 85, 105))
        draw.text((32, 165), f"Residual Energy: {suitability['residual_energy']:.5f}", fill=(71, 85, 105))
        draw.text((32, 190), f"Dynamic Range: {suitability['dynamic_range']:.1f} / 255", fill=(71, 85, 105))
        draw.text((32, 215), f"Saturated Pixels: {suitability['saturated_ratio']:.1%}", fill=(71, 85, 105))

        # Panel 2: Residual Amplitude Distribution
        draw.rectangle([290, 20, 550, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((302, 28), "Residual Amplitude Distribution", fill=(30, 41, 59))
        draw.text((302, 46), "Sample Histogram [-10.0, +10.0]", fill=(100, 116, 139))

        r_sample = residual.ravel()
        hist, _ = np.histogram(r_sample, bins=25, range=(-10.0, 10.0))
        max_h = max(int(np.max(hist)), 1)
        chart_w, chart_h = 220, 190
        ox, oy = 305, 300
        for i, val in enumerate(hist):
            bar_h = int((val / max_h) * chart_h)
            x1 = ox + int(i * (chart_w / 25))
            x2 = ox + int((i + 1) * (chart_w / 25)) - 1
            y1 = oy - bar_h
            draw.rectangle([x1, y1, x2, oy], fill=(59, 130, 246))

        # Panel 3: Camera Reference Identification Status
        draw.rectangle([570, 20, 820, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((582, 28), "Camera Identification", fill=(30, 41, 59))
        draw.text((582, 46), "Case Reference Status", fill=(100, 116, 139))

        if match_status == "NOT_ESTIMATED":
            draw.rectangle([582, 90, 808, 160], fill=(248, 250, 252), outline=(226, 232, 240))
            draw.text((615, 108), "NOT_ESTIMATED", fill=(100, 116, 139))
            draw.text((590, 130), "No reference camera fingerprint", fill=(148, 163, 184))
            draw.text((582, 180), "Method inapplicability is NOT", fill=(100, 116, 139))
            draw.text((582, 198), "negative evidence of camera source.", fill=(100, 116, 139))
            draw.text((582, 226), "Requires case reference fingerprint", fill=(71, 85, 105))
            draw.text((582, 244), "to perform source matching.", fill=(71, 85, 105))
        else:
            status_col = (16, 185, 129) if match_status == "CONSISTENT" else (234, 88, 12)
            draw.rectangle([582, 90, 808, 160], fill=(248, 250, 252), outline=(226, 232, 240))
            draw.text((615, 108), match_status, fill=status_col)
            draw.text((590, 130), f"Ref: {target_ref_id or 'Unknown'}", fill=(100, 116, 139))
            if correlation_val is not None:
                draw.text((582, 185), f"Correlation (rho): {correlation_val:.4f}", fill=(30, 41, 59))
                draw.text((582, 210), f"Threshold: >= 0.05", fill=(100, 116, 139))

        img.save(output_path, "PNG")
