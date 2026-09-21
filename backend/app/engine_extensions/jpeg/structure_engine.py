"""
ForenSight V4 — JPEG Structure Forensic Engine

Engine ID: JPEG-STRUCTURE
Analyzes container structure, marker sequences, byte offsets, segment lengths,
frame dimensions, component sampling factors, table mappings, and structural anomalies.
"""

import os
import json
import time
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
from .parser import parse_jpeg_stream


class JPEGStructureParameters(BaseModel):
    """Execution parameters for JPEG Structure Engine."""
    include_raw_segments: bool = Field(True, description="Whether to include detailed segment offsets and lengths in findings.")


class JPEGStructureEngine(BaseForensicEngine):
    """
    Forensic engine for comprehensive JPEG structural parsing and marker analysis.
    Complies with ITU-T T.81 / ISO/IEC 10918-1 specification.
    """
    engine_id: str = "JPEG-STRUCTURE"
    engine_name: str = "JPEG Structure Analysis"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.FILE_ANALYSIS
    description: str = "Analyzes JPEG container marker sequence, byte offsets, segment lengths, sampling factors, and structural anomalies."
    parameter_schema = JPEGStructureParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG"],
        min_dimensions=(1, 1),
        requires_lossy_compression=True,
    )

    limitations: List[str] = [
        "Operates strictly on JPEG container structure; does not decompress or analyze DCT coefficient distributions.",
        "Structural anomalies indicate specification non-compliance, unusual encoder behavior, or file damage, and must not be used alone to conclude malicious image manipulation.",
        "Non-standard APP marker placements may occur legitimately in various camera firmware and software encoders.",
    ]

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Information technology – Digital compression and coding of continuous-tone still images: Requirements and guidelines",
            authors="ITU-T / ISO/IEC",
            year=1992,
            reference_type=ReferenceType.STANDARD,
            notes="Official international specification for the JPEG container format, marker sequences, and segment syntax."
        ),
        ScientificReference(
            title="Forensic Analysis of JPEG Image Structure and Compression History",
            authors="Kee, E., Johnson, M. K., Farid, H.",
            year=2011,
            reference_type=ReferenceType.PAPER,
            notes="Examines marker ordering and header variations across imaging devices and post-processing tools."
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
                summary=app_check.reason or "Evidence format is not applicable for JPEG structure analysis.",
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

        # 3. Handle zero-byte or unparseable stream
        if len(raw_data) == 0:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary="Evidence file contains zero bytes; unable to parse JPEG structure.",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 4. Parse JPEG marker stream
        parse_res = parse_jpeg_stream(raw_data)

        if not parse_res.is_jpeg:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary="Byte stream does not start with valid JPEG SOI marker (0xFFD8).",
                limitations=self.limitations,
                structured_findings={"structural_anomalies": parse_res.structural_anomalies},
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 5. Build Observations
        anomalies_count = len(parse_res.structural_anomalies)
        has_anomalies = anomalies_count > 0

        interpretation = (
            f"Structural analysis identified {anomalies_count} structural inconsistency/anomaly observation(s) requiring review."
            if has_anomalies
            else "JPEG marker stream and structural organization conform to standard ITU-T T.81 specifications."
        )

        obs_summary = (
            f"Observed {len(parse_res.marker_sequence)} markers ({len(parse_res.segments)} segments), "
            f"{len(parse_res.components)} components, and {anomalies_count} structural anomaly items."
        )

        observation = NormalizedObservation(
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED.value,
            observation_type="JPEG_STRUCTURE",
            metric_name="ANOMALY_COUNT",
            raw_value=str(anomalies_count),
            normalized_value=min(float(anomalies_count) / 5.0, 1.0),
            direction="anomalous" if has_anomalies else "nominal",
            interpretation=interpretation,
            limitations=self.limitations,
            result_data={
                "format": "JPEG",
                "marker_sequence": parse_res.marker_sequence,
                "dimensions": parse_res.dimensions,
                "precision": parse_res.precision,
                "sof_marker": parse_res.sof_marker,
                "components": parse_res.components,
                "restart_interval": parse_res.restart_interval,
                "structural_anomalies": parse_res.structural_anomalies,
                "trailing_bytes_count": parse_res.trailing_bytes_count,
                "segment_count": len(parse_res.segments),
            },
            parameters_used=context.parameters,
        )

        # 6. Build Artifact JSON
        os.makedirs(context.storage_output_dir, exist_ok=True)
        artifact_filename = f"jpeg_structure_analysis_{context.evidence_id}.json"
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
                "specification": "ITU-T T.81 / ISO/IEC 10918-1",
            },
            "structure": {
                "total_bytes": parse_res.total_bytes,
                "marker_sequence": parse_res.marker_sequence,
                "dimensions": parse_res.dimensions,
                "precision": parse_res.precision,
                "sof_marker": parse_res.sof_marker,
                "components": parse_res.components,
                "restart_interval": parse_res.restart_interval,
                "segments": parse_res.segments,
                "structural_anomalies": parse_res.structural_anomalies,
                "trailing_bytes_count": parse_res.trailing_bytes_count,
            }
        }

        art_json_bytes = json.dumps(artifact_payload, indent=2).encode("utf-8")
        with open(artifact_disk_path, "wb") as f:
            f.write(art_json_bytes)

        import hashlib
        art_sha256 = hashlib.sha256(art_json_bytes).hexdigest()

        # Relative storage path for database artifact tracking
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
            artifact_id=f"jpeg_structure_{context.evidence_id}",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.JSON,
            mime_type="application/json",
            storage_path=rel_storage_path,
            sha256_hash=art_sha256,
            provenance_metadata={
                "segment_count": len(parse_res.segments),
                "anomaly_count": anomalies_count,
            }
        )

        structured_findings = {
            "format": "JPEG",
            "marker_sequence": parse_res.marker_sequence,
            "dimensions": parse_res.dimensions,
            "precision": parse_res.precision,
            "sof_marker": parse_res.sof_marker,
            "components": parse_res.components,
            "restart_interval": parse_res.restart_interval,
            "structural_anomalies": parse_res.structural_anomalies,
            "trailing_bytes_count": parse_res.trailing_bytes_count,
            "segments": parse_res.segments if context.parameters.get("include_raw_segments", True) else [],
        }

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary=obs_summary,
            observations=[observation],
            artifacts=[artifact_meta],
            structured_findings=structured_findings,
            limitations=self.limitations,
            execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
        )
