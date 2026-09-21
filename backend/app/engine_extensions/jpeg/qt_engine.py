"""
ForenSight V4 — JPEG Quantization Table (DQT) Forensic Engine

Engine ID: JPEG-QT
Extracts raw 8x8 quantization tables from DQT segments, calculates deterministic
matrix statistics, maps component associations, computes table fingerprints,
and provides calibrated IJG quality factor estimates with strict scientific disclaimers.
"""

import os
import json
import time
import math
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
from .parser import parse_jpeg_stream, ZIGZAG_INDEX

# Standard Independent JPEG Group (IJG) 50-quality Luminance baseline table
IJG_STD_LUMINANCE = [
    16, 11, 10, 16, 24, 40, 51, 61,
    12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56,
    14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77,
    24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101,
    72, 92, 95, 98, 112, 100, 103, 99
]


def calculate_table_statistics(values_64: List[int]) -> Dict[str, Any]:
    """
    Computes deterministic summary statistics for a 64-element quantization table.
    Separates the DC coefficient (index 0) from the 63 AC coefficients.
    """
    dc_val = values_64[0]
    ac_vals = values_64[1:]

    all_sorted = sorted(values_64)
    all_mean = sum(values_64) / 64.0
    all_var = sum((x - all_mean) ** 2 for x in values_64) / 64.0
    all_std = math.sqrt(all_var)
    all_median = (all_sorted[31] + all_sorted[32]) / 2.0

    ac_sorted = sorted(ac_vals)
    ac_mean = sum(ac_vals) / 63.0
    ac_var = sum((x - ac_mean) ** 2 for x in ac_vals) / 63.0
    ac_std = math.sqrt(ac_var)
    ac_median = ac_sorted[31]

    return {
        "dc_coefficient": dc_val,
        "overall": {
            "min": int(all_sorted[0]),
            "max": int(all_sorted[-1]),
            "mean": round(all_mean, 4),
            "median": round(all_median, 2),
            "variance": round(all_var, 4),
            "std_dev": round(all_std, 4),
        },
        "ac": {
            "min": int(ac_sorted[0]),
            "max": int(ac_sorted[-1]),
            "mean": round(ac_mean, 4),
            "median": round(float(ac_median), 2),
            "variance": round(ac_var, 4),
            "std_dev": round(ac_std, 4),
        }
    }


def estimate_ijg_quality(lum_table_natural: List[int]) -> Dict[str, Any]:
    """
    Estimates IJG quality factor Q in [1..100] by comparing table to scaled IJG standard luminance.
    Returns 'NOT_ESTIMATED' if the table does not match standard IJG scaling curves.
    """
    best_q = None
    best_mad = float("inf")

    for q in range(1, 101):
        if q < 50:
            scale = 5000 / q
        else:
            scale = 200 - 2 * q

        # Compute synthetic table for quality q
        diff_sum = 0
        for i in range(64):
            scaled_val = math.floor((IJG_STD_LUMINANCE[i] * scale + 50) / 100)
            clamped = max(1, min(255, int(scaled_val)))
            diff_sum += abs(clamped - lum_table_natural[i])

        mad = diff_sum / 64.0
        if mad < best_mad:
            best_mad = mad
            best_q = q

    # If the closest IJG table has an average deviation > 2.5 per coefficient, it is non-standard
    if best_mad <= 2.5 and best_q is not None:
        confidence = "HIGH" if best_mad == 0.0 else ("MODERATE" if best_mad < 1.0 else "LOW")
        return {
            "status": "ESTIMATED",
            "estimated_quality_factor": best_q,
            "mean_absolute_deviation": round(best_mad, 4),
            "method": "Independent JPEG Group (IJG) standard luminance scaling curve inversion.",
            "match_confidence": confidence,
            "scientific_disclaimer": (
                "This value is a mathematical estimate derived by matching the luminance quantization table "
                "to the standard Independent JPEG Group (IJG) scaling algorithm. It represents an encoder compression "
                "setting estimate, NOT an absolute determination of original acquisition quality or firmware identity."
            )
        }
    else:
        return {
            "status": "NOT_ESTIMATED",
            "estimated_quality_factor": None,
            "reason": (
                f"Quantization table does not conform to standard IJG scaling curves (minimum MAD {best_mad:.2f} > 2.5). "
                "Table appears to be custom, proprietary camera firmware-specific, or modified by non-IJG post-processing software."
            )
        }


class JPEGQTParameters(BaseModel):
    """Execution parameters for JPEG Quantization Table Engine."""
    estimate_quality: bool = Field(True, description="Whether to attempt IJG quality factor curve fitting.")


class JPEGQuantizationTableEngine(BaseForensicEngine):
    """
    Forensic engine extracting and analyzing JPEG quantization tables (DQT).
    Produces deterministic descriptors, 8x8 matrices, and table SHA-256 fingerprints.
    """
    engine_id: str = "JPEG-QT"
    engine_name: str = "JPEG Quantization Table Analysis"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.FILE_ANALYSIS
    description: str = "Extracts and analyzes raw 8x8 quantization tables (DQT), component mappings, statistical profiles, and table fingerprints."
    parameter_schema = JPEGQTParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG"],
        min_dimensions=(1, 1),
        requires_lossy_compression=True,
    )

    limitations: List[str] = [
        "Quantization tables reflect the most recent lossy compression cycle; earlier compression history cannot be directly observed from tables alone.",
        "Identical quantization tables may be used across diverse camera models and software packages that share common compression libraries (e.g. libjpeg).",
        "Quality factor estimation is valid only for encoders following the standard IJG scaling model; proprietary tables return NOT_ESTIMATED.",
    ]

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Estimation of Primary Quantization Matrix for Double Compressed JPEG Images",
            authors="Lukas, J., Fridrich, J.",
            year=2003,
            reference_type=ReferenceType.PAPER,
            notes="Foundational study analyzing how quantization table properties characterize JPEG compression pipelines."
        ),
        ScientificReference(
            title="Exposing Digital Forgeries in JPEG Images",
            authors="Farid, H.",
            year=2009,
            reference_type=ReferenceType.PAPER,
            notes="Reviews quantization table consistency as evidence in digital image forensics."
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
                summary=app_check.reason or "Evidence format is not applicable for JPEG quantization analysis.",
                limitations=self.limitations,
                inapplicability_data={
                    "reason": app_check.reason,
                    "notice": app_check.guardrail_notice,
                },
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 2. Read raw bytes directly
        if not os.path.isfile(context.stored_path):
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Evidence file not found on disk at {context.stored_path}.",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        try:
            with open(context.stored_path, "rb") as f:
                raw_data = f.read()
        except Exception as ex:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Error reading file bytes: {str(ex)}",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 3. Handle zero bytes
        if len(raw_data) == 0:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary="Evidence file contains zero bytes.",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 4. Parse stream
        parse_res = parse_jpeg_stream(raw_data)
        if not parse_res.is_jpeg:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary="File does not contain valid JPEG SOI header.",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        if len(parse_res.dqt_tables) == 0:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary="No DQT (Define Quantization Table) segments found in JPEG stream.",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 5. Build component mapping lookup
        # Map table_id -> list of component names referencing it
        table_component_map: Dict[int, List[str]] = {}
        for comp in parse_res.components:
            q_id = comp.get("quantization_table_id")
            if q_id is not None:
                table_component_map.setdefault(q_id, []).append(comp.get("name", f"ID_{comp.get('component_id')}"))

        # 6. Analyze each DQT table
        analyzed_tables: List[Dict[str, Any]] = []
        luminance_natural_table: Optional[List[int]] = None

        for t in parse_res.dqt_tables:
            t_id = t["table_id"]
            matrix = t["matrix_8x8"]
            # Flatten matrix in natural row-major order (64 elements)
            natural_64 = [matrix[r][c] for r in range(8) for c in range(8)]
            stats = calculate_table_statistics(natural_64)

            # Check if this table is referenced by Y (Luminance)
            comp_refs = table_component_map.get(t_id, [])
            is_lum = (t_id == 0) or any("Y" in c for c in comp_refs)
            if is_lum and luminance_natural_table is None:
                luminance_natural_table = natural_64

            analyzed_tables.append({
                "table_id": t_id,
                "precision_bits": t["precision_bits"],
                "description": t["description"],
                "segment_offset": t["segment_offset"],
                "referenced_by_components": comp_refs,
                "fingerprint_sha256": t["fingerprint"],
                "raw_matrix_8x8": matrix,
                "values_zigzag": t["values_zigzag"],
                "statistics": stats,
            })

        # 7. Quality factor estimation
        quality_est = {"status": "NOT_ESTIMATED", "reason": "No luminance table available."}
        if context.parameters.get("estimate_quality", True) and luminance_natural_table is not None:
            quality_est = estimate_ijg_quality(luminance_natural_table)

        # 8. Construct Normalized Observations
        observations: List[NormalizedObservation] = []

        # Observation 1: Quantization Table Profile
        obs_summary = f"Extracted {len(analyzed_tables)} quantization table(s). Quality estimation: {quality_est.get('status')}."
        table_fps = [t["fingerprint_sha256"] for t in analyzed_tables]

        interpretation = (
            f"Image contains {len(analyzed_tables)} quantization table(s). "
            + (f"Estimated IJG compression quality: Q~{quality_est.get('estimated_quality_factor')} ({quality_est.get('match_confidence')} confidence). " if quality_est.get("status") == "ESTIMATED" else "Table profile does not match standard IJG curves (NOT_ESTIMATED). ")
            + "Table fingerprints are available for reference comparison."
        )

        obs = NormalizedObservation(
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED.value,
            observation_type="JPEG_QUANTIZATION",
            metric_name="TABLE_COUNT",
            raw_value=str(len(analyzed_tables)),
            normalized_value=min(float(len(analyzed_tables)) / 4.0, 1.0),
            direction="nominal",
            interpretation=interpretation,
            limitations=self.limitations,
            result_data={
                "table_count": len(analyzed_tables),
                "table_fingerprints": table_fps,
                "quality_estimation": quality_est,
                "tables_summary": [
                    {
                        "table_id": t["table_id"],
                        "description": t["description"],
                        "dc_coefficient": t["statistics"]["dc_coefficient"],
                        "ac_mean": t["statistics"]["ac"]["mean"],
                        "referenced_components": t["referenced_by_components"],
                    }
                    for t in analyzed_tables
                ]
            },
            parameters_used=context.parameters,
        )
        observations.append(obs)

        # 9. Save JSON Artifact
        os.makedirs(context.storage_output_dir, exist_ok=True)
        artifact_filename = f"jpeg_qt_analysis_{context.evidence_id}.json"
        artifact_disk_path = os.path.join(context.storage_output_dir, artifact_filename)

        artifact_payload = {
            "engine_id": self.engine_id,
            "engine_version": self.engine_version,
            "evidence_id": context.evidence_id,
            "analysis_id": context.analysis_id,
            "evidence_sha256": context.sha256_hash,
            "parameters": context.parameters,
            "provenance": {
                "engine": self.engine_id,
                "version": self.engine_version,
                "algorithm": "Direct DQT Marker Extraction & Matrix Characterization",
            },
            "quality_estimation": quality_est,
            "quantization_tables": analyzed_tables,
        }

        art_json_bytes = json.dumps(artifact_payload, indent=2).encode("utf-8")
        with open(artifact_disk_path, "wb") as f:
            f.write(art_json_bytes)

        import hashlib
        art_sha256 = hashlib.sha256(art_json_bytes).hexdigest()

        try:
            from app.core.config import settings
            base_dir = os.path.abspath(settings.STORAGE_DIR)
            abs_disk = os.path.abspath(artifact_disk_path)
            if os.path.splitdrive(abs_disk)[0].lower() == os.path.splitdrive(base_dir)[0].lower() and abs_disk.startswith(base_dir):
                rel_storage_path = os.path.relpath(abs_disk, start=base_dir).replace("\\", "/")
            else:
                rel_storage_path = os.path.relpath(artifact_disk_path, start=os.path.dirname(context.storage_output_dir)).replace("\\", "/")
        except Exception:
            rel_storage_path = os.path.relpath(artifact_disk_path, start=context.storage_output_dir).replace("\\", "/")

        artifact_meta = EngineArtifactMetadata(
            artifact_id=f"jpeg_qt_{context.evidence_id}",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.JSON,
            mime_type="application/json",
            storage_path=rel_storage_path,
            sha256_hash=art_sha256,
            provenance_metadata={
                "table_count": len(analyzed_tables),
                "quality_factor_estimate": quality_est.get("estimated_quality_factor"),
            }
        )

        structured_findings = {
            "table_count": len(analyzed_tables),
            "tables": analyzed_tables,
            "quality_estimation": quality_est,
        }

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary=obs_summary,
            observations=observations,
            artifacts=[artifact_meta],
            structured_findings=structured_findings,
            limitations=self.limitations,
            execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
        )
