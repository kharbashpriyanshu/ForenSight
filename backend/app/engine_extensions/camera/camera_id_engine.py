"""
ForenSight V4 — Camera Identification (CAMERA-ID) Forensic Engine

Compares extracted PRNU sensor noise residual from evidence images against
case-scoped camera sensor reference fingerprints using 2D circular cross-correlation
surfaces and Peak-to-Correlation Energy (PCE).
"""

import os
import time
import json
import hashlib
from typing import Dict, Any, List, Optional, Tuple
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
from app.engine_extensions.artifact import ArtifactType, EngineArtifactMetadata
from app.engine_extensions.observation import NormalizedObservation
from app.engine_extensions.prnu.prnu_extractor import (
    extract_noise_residual,
    zero_mean_normalize,
    calculate_suitability,
    compute_2d_cross_correlation,
    compute_pce,
)
from app.engine_extensions.camera.camera_id_models import (
    CameraIDParameters,
    CameraComparisonScore,
)
from app.engine_extensions.camera.camera_reference_library import CameraReferenceLibrary


class CameraIDEngine(BaseForensicEngine):
    """
    CAMERA-ID v1.0.0 — Forensic Source Camera Identification Engine.
    Executes empirical 2D cross-correlation and PCE verification against
    stored sensor reference fingerprints.
    """
    engine_id: str = "CAMERA-ID"
    engine_name: str = "Camera Hardware Identification"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.CAMERA_IDENTIFICATION
    description: str = (
        "Compares extracted PRNU sensor noise residual against case-scoped camera reference "
        "fingerprints using 2D FFT cross-correlation surfaces and Peak-to-Correlation Energy (PCE)."
    )
    parameter_schema = CameraIDParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG", "PNG", "WEBP", "TIFF"],
        min_dimensions=(32, 32),
        max_dimensions=(4096, 4096),
        color_spaces=["RGB", "GRAYSCALE", "RGBA"],
        requires_file_path=True,
    )

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Determining image origin and integrity using sensor noise",
            authors="Chen, M., Fridrich, J., Goljan, M., & Lukáš, J.",
            publication_venue="IEEE Transactions on Information Forensics and Security, 3(1), 74-90",
            year=2008,
            reference_type=ReferenceType.PAPER,
            notes="Foundational treatise on PRNU extraction, MLE fingerprint aggregation, and PCE statistical thresholding."
        ),
        ScientificReference(
            title="Sensor noise camera identification: Countering device attacks",
            authors="Goljan, M., Fridrich, J., & Chen, M.",
            publication_venue="Media Forensics and Security, SPIE Vol. 7254, 72540I",
            year=2009,
            reference_type=ReferenceType.PAPER,
            notes="Analysis of 2D circular cross-correlation surfaces, geometric synchronization, and Peak-to-Correlation Energy discriminability."
        ),
        ScientificReference(
            title="Enhancing source camera identification performance with a new color decoupling method",
            authors="Kang, X., Li, Y., Qu, Z., & Huang, J.",
            publication_venue="IEEE Transactions on Information Forensics and Security, 7(4), 1093-1102",
            year=2012,
            reference_type=ReferenceType.PAPER,
            notes="Mitigation of CFA demosaicing interpolation contamination and periodic readout banding in sensor attribution."
        ),
    ]

    limitations: List[str] = [
        "Geometric Spatial Misalignment: PRNU matching assumes native sensor pixel grid alignment; scaling, rotation, or digital zoom misaligns coordinates unless exhaustively searched.",
        "Scene Content and Dynamic Range Sensitivity: Severely underexposed, overexposed, or heavily saturated image regions do not capture photo-response variation.",
        "Heavy Lossy Compression Suppression: Aggressive JPEG or WebP compression quantization zeros out weak high-frequency sensor noise residuals.",
        "Reference Fingerprint Quality Requirement: Reliable attribution requires high-fidelity reference fingerprints generated from multiple calibration images from the suspect sensor.",
    ]

    def check_applicability(self, context: ExecutionContext) -> ApplicabilityResult:
        """Evaluates container format and resolution requirements."""
        fmt = (context.image_format or "").upper()
        if fmt not in ["JPEG", "JPG", "PNG", "WEBP", "TIFF"]:
            return ApplicabilityResult.inapplicable(
                engine_id=self.engine_id,
                reason=f"Format '{fmt}' is not supported for camera identification.",
                target_format=fmt,
                required_format="JPEG, PNG, WebP, or TIFF",
            )
        if context.width < 32 or context.height < 32:
            return ApplicabilityResult.inapplicable(
                engine_id=self.engine_id,
                reason=f"Image dimensions {context.width}x{context.height} are below minimum 32x32 requirement.",
                target_format=fmt,
                required_format="Minimum 32x32 pixels",
            )
        return ApplicabilityResult.applicable()

    def _resolve_relative_path(self, full_path: str, context: ExecutionContext) -> str:
        try:
            rel = os.path.relpath(full_path, context.storage_output_dir)
            return rel.replace("\\", "/")
        except Exception:
            return os.path.basename(full_path)

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        start_time = time.perf_counter()
        os.makedirs(context.storage_output_dir, exist_ok=True)

        params_dict = context.parameters or {}
        corr_thresh = float(params_dict.get("correlation_threshold", 0.015))
        pce_thresh = float(params_dict.get("pce_threshold", 50.0))
        min_suitability = float(params_dict.get("min_suitability", 0.20))
        target_ref_id = params_dict.get("target_reference_id")
        case_id = params_dict.get("case_id", "default")

        # 1. Read input image in grayscale
        img_bgr = cv2.imread(context.stored_path, cv2.IMREAD_COLOR)
        if img_bgr is None:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Failed to read image for Camera-ID analysis: {context.stored_path}",
                observations=[],
                artifacts=[],
                structured_findings={"error": "Invalid or unreadable image file"},
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
                limitations=self.limitations,
            )

        img_gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
        h_q, w_q = img_gray.shape

        # 2. Extract noise residual and suitability
        raw_res = extract_noise_residual(img_gray, filter_window=5, filter_sigma=1.5)
        query_residual = zero_mean_normalize(raw_res)
        suitability = calculate_suitability(img_gray, query_residual)
        suitability_index = suitability["suitability_index"]

        # 3. Retrieve camera references
        all_refs_meta = CameraReferenceLibrary.list_references(case_id)
        if target_ref_id:
            all_refs_meta = [m for m in all_refs_meta if m.reference_id == target_ref_id]

        compared_scores: List[CameraComparisonScore] = []
        top_corr_surface: Optional[np.ndarray] = None
        top_ref_meta: Optional[Any] = None
        top_ref_fp: Optional[np.ndarray] = None
        top_score: Optional[CameraComparisonScore] = None

        if not all_refs_meta:
            match_status = "NOT_ESTIMATED"
            match_confidence = "NONE"
            primary_finding = (
                f"No camera reference fingerprints found for case '{case_id}'. "
                f"PRNU residual extracted with suitability index {suitability_index} ({suitability['status']}). "
                "Register reference fingerprints from candidate camera devices to perform attribution comparison."
            )
            max_corr = 0.0
            max_pce = 0.0
            second_corr = 0.0
            pce_gap = 0.0
            is_consistent_candidate = 0.0
        else:
            for ref_meta in all_refs_meta:
                ret = CameraReferenceLibrary.get_reference(case_id, ref_meta.reference_id)
                if not ret:
                    continue
                _, ref_fp = ret

                # Spatial dimension check: align common central crop if dimensions differ
                h_r, w_r = ref_fp.shape
                if (h_q, w_q) == (h_r, w_r):
                    q_eval = query_residual
                    r_eval = ref_fp
                else:
                    # Common central crop
                    h_common = min(h_q, h_r)
                    w_common = min(w_q, w_r)
                    y_q_start = (h_q - h_common) // 2
                    x_q_start = (w_q - w_common) // 2
                    y_r_start = (h_r - h_common) // 2
                    x_r_start = (w_r - w_common) // 2
                    q_eval = query_residual[y_q_start:y_q_start+h_common, x_q_start:x_q_start+w_common]
                    r_eval = ref_fp[y_r_start:y_r_start+h_common, x_r_start:x_r_start+w_common]

                corr_surf, max_c, peak_loc = compute_2d_cross_correlation(q_eval, r_eval)
                pce_val = compute_pce(corr_surf, peak_loc, exclusion_radius=5)

                # Center offset
                cy, cx = corr_surf.shape[0] // 2, corr_surf.shape[1] // 2
                dy = peak_loc[0] - cy
                dx = peak_loc[1] - cx

                # Status evaluation
                if suitability_index < min_suitability:
                    status = "INCONCLUSIVE"
                    conf = "LOW"
                elif pce_val >= pce_thresh and max_c >= corr_thresh:
                    status = "CONSISTENT"
                    conf = "HIGH" if pce_val >= 100.0 else "MEDIUM"
                elif pce_val >= (pce_thresh * 0.7) and max_c >= (corr_thresh * 0.7):
                    status = "INCONCLUSIVE"
                    conf = "LOW"
                else:
                    status = "INCONSISTENT"
                    conf = "NONE"

                score = CameraComparisonScore(
                    reference_id=ref_meta.reference_id,
                    camera_label=ref_meta.camera_label,
                    make_model=ref_meta.make_model,
                    correlation=round(float(max_c), 5),
                    pce=round(float(pce_val), 2),
                    peak_offset=(int(dy), int(dx)),
                    status=status,
                    confidence=conf,
                    is_top_candidate=False,
                    details={
                        "evaluated_shape": list(q_eval.shape),
                        "num_images_aggregated": ref_meta.num_images_aggregated,
                    }
                )
                compared_scores.append(score)

                if top_score is None or pce_val > top_score.pce:
                    top_score = score
                    top_corr_surface = corr_surf
                    top_ref_meta = ref_meta
                    top_ref_fp = r_eval

            # Sort by PCE descending
            compared_scores.sort(key=lambda s: s.pce, reverse=True)
            if compared_scores:
                compared_scores[0].is_top_candidate = True
                top_score = compared_scores[0]
                max_corr = top_score.correlation
                max_pce = top_score.pce
                match_status = top_score.status
                match_confidence = top_score.confidence
                second_corr = compared_scores[1].correlation if len(compared_scores) > 1 else 0.0
                second_pce = compared_scores[1].pce if len(compared_scores) > 1 else 0.0
                pce_gap = round(float(max_pce - second_pce), 2)
                is_consistent_candidate = 1.0 if match_status == "CONSISTENT" else (0.5 if match_status == "INCONCLUSIVE" else 0.0)

                primary_finding = (
                    f"Compared evidence against {len(compared_scores)} case camera reference(s). "
                    f"Highest measured correlation observed with '{top_score.camera_label}' "
                    f"(PCE: {top_score.pce}, peak correlation: {top_score.correlation}, status: {top_score.status}). "
                    f"Second candidate PCE: {second_pce} (PCE gap: {pce_gap})."
                )
            else:
                match_status = "NOT_ESTIMATED"
                match_confidence = "NONE"
                primary_finding = "No valid camera reference files could be loaded."
                max_corr = 0.0
                max_pce = 0.0
                second_corr = 0.0
                pce_gap = 0.0
                is_consistent_candidate = 0.0

        # 4. Generate Diagnostic Plot Artifacts
        artifacts: List[EngineArtifactMetadata] = []

        # Artifact 1: camera_id_analysis.png (Correlation surface & ranking chart)
        analysis_filename = "camera_id_analysis.png"
        analysis_path = os.path.join(context.storage_output_dir, analysis_filename)
        self._generate_analysis_plot(
            analysis_path,
            top_corr_surface,
            top_score,
            compared_scores,
            pce_thresh,
            corr_thresh,
            suitability,
        )
        with open(analysis_path, "rb") as f:
            analysis_bytes = f.read()
        artifacts.append(
            EngineArtifactMetadata(
                artifact_id="camera_id_analysis",
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                artifact_type=ArtifactType.PLOT,
                storage_path=self._resolve_relative_path(analysis_path, context),
                sha256_hash=hashlib.sha256(analysis_bytes).hexdigest(),
                mime_type="image/png",
            )
        )

        # Artifact 2: camera_id_comparison.png (Visual comparison)
        comparison_filename = "camera_id_comparison.png"
        comparison_path = os.path.join(context.storage_output_dir, comparison_filename)
        self._generate_comparison_plot(
            comparison_path,
            query_residual,
            top_ref_fp,
            top_score,
        )
        with open(comparison_path, "rb") as f:
            comp_bytes = f.read()
        artifacts.append(
            EngineArtifactMetadata(
                artifact_id="camera_id_comparison",
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                artifact_type=ArtifactType.VISUALIZATION,
                storage_path=self._resolve_relative_path(comparison_path, context),
                sha256_hash=hashlib.sha256(comp_bytes).hexdigest(),
                mime_type="image/png",
            )
        )

        # Artifact 3: camera_id_analysis.json (Full findings and candidate scores)
        json_filename = "camera_id_analysis.json"
        json_path = os.path.join(context.storage_output_dir, json_filename)
        comparison_json_data = {
            "evidence_id": context.evidence_id,
            "analysis_id": context.analysis_id,
            "case_id": case_id,
            "suitability": suitability,
            "parameters": {
                "correlation_threshold": corr_thresh,
                "pce_threshold": pce_thresh,
                "min_suitability": min_suitability,
            },
            "top_candidate": top_score.model_dump() if top_score else None,
            "candidates": [s.model_dump() for s in compared_scores],
            "pce_gap": pce_gap,
            "status": match_status,
            "confidence": match_confidence,
            "primary_finding": primary_finding,
        }
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(comparison_json_data, f, indent=2)

        with open(json_path, "rb") as f:
            json_bytes = f.read()
        artifacts.append(
            EngineArtifactMetadata(
                artifact_id="camera_id_json",
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                artifact_type=ArtifactType.JSON,
                storage_path=self._resolve_relative_path(json_path, context),
                sha256_hash=hashlib.sha256(json_bytes).hexdigest(),
                mime_type="application/json",
            )
        )

        # Normalized observations
        obs_list = [
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CAMERA_IDENTIFICATION",
                metric_name="REFERENCE_COUNT",
                raw_value=str(len(compared_scores)),
                normalized_value=float(min(1.0, len(compared_scores) / 10.0)),
                direction="informational",
                technical_reliability="HIGH",
                result_data={"count": len(compared_scores)},
                parameters_used=context.parameters,
                interpretation=f"Evaluated against {len(compared_scores)} registered case camera references.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CAMERA_IDENTIFICATION",
                metric_name="MAX_CORRELATION",
                raw_value=str(max_corr),
                normalized_value=float(max(0.0, min(1.0, max_corr * 10.0))),
                direction="elevated" if max_corr >= corr_thresh else "informational",
                technical_reliability="HIGH",
                result_data={"max_correlation": max_corr, "threshold": corr_thresh},
                parameters_used=context.parameters,
                interpretation=f"Peak cross-correlation: {max_corr:.5f} (threshold: {corr_thresh}).",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CAMERA_IDENTIFICATION",
                metric_name="PCE",
                raw_value=str(max_pce),
                normalized_value=float(min(1.0, max_pce / 200.0)),
                direction="elevated" if max_pce >= pce_thresh else "informational",
                technical_reliability="HIGH",
                result_data={"pce": max_pce, "threshold": pce_thresh},
                parameters_used=context.parameters,
                interpretation=f"Peak-to-Correlation Energy: {max_pce:.2f} (decision threshold: {pce_thresh}).",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CAMERA_IDENTIFICATION",
                metric_name="SECOND_BEST_CORRELATION",
                raw_value=str(second_corr),
                normalized_value=float(max(0.0, min(1.0, second_corr * 10.0))),
                direction="informational",
                technical_reliability="HIGH",
                result_data={"second_correlation": second_corr},
                parameters_used=context.parameters,
                interpretation=f"Second best candidate correlation: {second_corr:.5f}.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CAMERA_IDENTIFICATION",
                metric_name="CORRELATION_GAP",
                raw_value=str(pce_gap),
                normalized_value=float(min(1.0, max(0.0, pce_gap / 100.0))),
                direction="elevated" if pce_gap >= 30.0 else "informational",
                technical_reliability="HIGH",
                result_data={"pce_gap": pce_gap},
                parameters_used=context.parameters,
                interpretation=f"PCE margin between top and runner-up candidate: {pce_gap:.2f}.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CAMERA_IDENTIFICATION",
                metric_name="CANDIDATE_CAMERA_CONSISTENCY",
                raw_value=match_status,
                normalized_value=float(is_consistent_candidate),
                direction="elevated" if match_status == "CONSISTENT" else "informational",
                technical_reliability="HIGH",
                result_data={"status": match_status, "confidence": match_confidence},
                parameters_used=context.parameters,
                interpretation=f"Overall camera consistency assessment: {match_status} (confidence: {match_confidence}).",
                limitations=self.limitations,
            ),
        ]

        exec_time_ms = (time.perf_counter() - start_time) * 1000.0

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary=primary_finding,
            observations=obs_list,
            artifacts=artifacts,
            structured_findings=comparison_json_data,
            execution_time_ms=round(exec_time_ms, 2),
            limitations=self.limitations,
        )

    def _generate_analysis_plot(
        self,
        output_path: str,
        corr_surf: Optional[np.ndarray],
        top_score: Optional[CameraComparisonScore],
        compared_scores: List[CameraComparisonScore],
        pce_thresh: float,
        corr_thresh: float,
        suitability: Dict[str, Any],
    ) -> None:
        """Draws a clean, deterministic 2-panel diagnostic visualization."""
        W, H = 840, 360
        img = Image.new("RGB", (W, H), color=(248, 250, 252))
        draw = ImageDraw.Draw(img)

        # Panel 1: Cross-Correlation Surface
        draw.rectangle([20, 20, 380, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((32, 28), "Cross-Correlation Surface Peak", fill=(30, 41, 59))
        label_text = f"Top: {top_score.camera_label[:20]}" if top_score else "No Reference"
        draw.text((32, 46), label_text, fill=(100, 116, 139))

        if corr_surf is not None:
            H_s, W_s = corr_surf.shape
            cy, cx = H_s // 2, W_s // 2
            r = min(30, cy, cx)
            sub_surf = corr_surf[cy - r : cy + r + 1, cx - r : cx + r + 1]
            s_min, s_max = float(np.min(sub_surf)), float(np.max(sub_surf))
            rng = max(1e-7, s_max - s_min)
            norm_surf = np.clip((sub_surf - s_min) / rng * 255.0, 0, 255).astype(np.uint8)
            colored = cv2.applyColorMap(norm_surf, cv2.COLORMAP_VIRIDIS)
            colored = cv2.cvtColor(colored, cv2.COLOR_BGR2RGB)
            pil_surf = Image.fromarray(colored).resize((220, 200), Image.NEAREST)
            img.paste(pil_surf, (35, 75))

            pce_val = top_score.pce if top_score else 0.0
            max_c = top_score.correlation if top_score else 0.0
            draw.text((35, 285), f"PCE: {pce_val:.1f} (Thresh: {pce_thresh})", fill=(30, 41, 59))
            draw.text((35, 305), f"Peak Corr: {max_c:.4f} (Thresh: {corr_thresh})", fill=(71, 85, 105))
        else:
            draw.rectangle([35, 75, 255, 275], fill=(241, 245, 249), outline=(203, 213, 225))
            draw.text((50, 160), "No Reference Fingerprint", fill=(148, 163, 184))
            draw.text((50, 180), "(Comparison Unavailable)", fill=(148, 163, 184))

        # Panel 2: Candidate Sensor Attribution Ranking
        draw.rectangle([400, 20, 820, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((415, 28), "Candidate Sensor Attribution Ranking", fill=(30, 41, 59))
        draw.text((415, 46), f"References Evaluated: {len(compared_scores)}", fill=(100, 116, 139))

        if compared_scores:
            max_pce = max([s.pce for s in compared_scores], default=pce_thresh * 2)
            max_pce = max(max_pce, pce_thresh * 1.5, 1.0)

            for idx, cand in enumerate(compared_scores[:5]):
                y_base = 75 + idx * 48
                c_label = cand.camera_label[:22]
                status_color = (34, 197, 94) if cand.status == "CONSISTENT" else ((234, 179, 8) if cand.status == "INCONCLUSIVE" else (239, 68, 68))
                draw.text((415, y_base), f"{idx+1}. {c_label}", fill=(30, 41, 59))
                draw.text((680, y_base), f"PCE: {cand.pce:.1f} [{cand.status}]", fill=status_color)

                bar_w = int(min(1.0, cand.pce / max_pce) * 360)
                draw.rectangle([415, y_base + 18, 775, y_base + 28], fill=(241, 245, 249))
                draw.rectangle([415, y_base + 18, 415 + bar_w, y_base + 28], fill=status_color)

            # Draw PCE threshold indicator line
            thresh_x = 415 + int((pce_thresh / max_pce) * 360)
            if 415 <= thresh_x <= 775:
                draw.line([(thresh_x, 70), (thresh_x, 315)], fill=(220, 38, 38), width=2)
                draw.text((thresh_x - 40, 318), f"Thresh ({pce_thresh})", fill=(220, 38, 38))
        else:
            draw.text((430, 160), "No camera references loaded for this case.", fill=(148, 163, 184))
            draw.text((430, 180), "Upload candidate sensor images to compare.", fill=(148, 163, 184))

        img.save(output_path, "PNG")

    def _generate_comparison_plot(
        self,
        output_path: str,
        query_residual: np.ndarray,
        ref_fingerprint: Optional[np.ndarray],
        top_score: Optional[CameraComparisonScore],
    ) -> None:
        """Draws a clean, deterministic visual alignment comparison between query residual and reference."""
        W, H = 840, 360
        img = Image.new("RGB", (W, H), color=(248, 250, 252))
        draw = ImageDraw.Draw(img)

        # Panel 1: Query PRNU Noise Residual (W)
        draw.rectangle([20, 20, 410, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((32, 28), "Query PRNU Noise Residual (W)", fill=(30, 41, 59))
        draw.text((32, 46), "Zero-mean high-frequency sensor residual", fill=(100, 116, 139))

        q_disp = np.clip((query_residual + 3.0) / 6.0 * 255.0, 0, 255).astype(np.uint8)
        h_q, w_q = q_disp.shape
        cy_q, cx_q = h_q // 2, w_q // 2
        rq = min(100, cy_q, cx_q)
        q_crop = q_disp[cy_q - rq : cy_q + rq, cx_q - rq : cx_q + rq]
        pil_q = Image.fromarray(q_crop, mode="L").convert("RGB").resize((220, 200), Image.NEAREST)
        img.paste(pil_q, (35, 75))
        draw.text((35, 290), f"Dimensions: {w_q}x{h_q}", fill=(71, 85, 105))

        # Panel 2: Reference Fingerprint (K)
        draw.rectangle([430, 20, 820, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        ref_label = top_score.camera_label[:22] if top_score else "No Reference"
        draw.text((442, 28), f"Reference Fingerprint (K): {ref_label}", fill=(30, 41, 59))
        status_text = f"Status: {top_score.status} (PCE: {top_score.pce})" if top_score else "Status: N/A"
        draw.text((442, 46), status_text, fill=(100, 116, 139))

        if ref_fingerprint is not None:
            r_disp = np.clip((ref_fingerprint + 3.0) / 6.0 * 255.0, 0, 255).astype(np.uint8)
            h_r, w_r = r_disp.shape
            cy_r, cx_r = h_r // 2, w_r // 2
            rr = min(100, cy_r, cx_r)
            r_crop = r_disp[cy_r - rr : cy_r + rr, cx_r - rr : cx_r + rr]
            pil_r = Image.fromarray(r_crop, mode="L").convert("RGB").resize((220, 200), Image.NEAREST)
            img.paste(pil_r, (445, 75))
            draw.text((445, 290), f"Dimensions: {w_r}x{h_r}", fill=(71, 85, 105))
        else:
            draw.rectangle([445, 75, 665, 275], fill=(241, 245, 249), outline=(203, 213, 225))
            draw.text((470, 160), "No Reference Available", fill=(148, 163, 184))

        img.save(output_path, "PNG")
