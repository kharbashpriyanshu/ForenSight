"""
ForenSight V4 — JPEG Huffman Table (DHT) Forensic Engine

Engine ID: JPEG-HUFFMAN
Extracts and analyzes Huffman coding tables (DHT), code-length distributions,
symbol cardinalities, component scan mappings, and deterministic table fingerprints.
Identifies standard ITU-T T.81 Annex K vs custom/optimized entropy structures.
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

# Standard ITU-T T.81 Annex K baseline code length distributions
STANDARD_ANNEX_K_CODE_LENGTHS = {
    ("DC", 0): [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], # Table K.3 Luminance DC
    ("DC", 1): [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], # Table K.5 Chrominance DC
    ("AC", 0): [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125], # Table K.4 Luminance AC
    ("AC", 1): [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 119], # Table K.6 Chrominance AC
}


class JPEGHuffmanParameters(BaseModel):
    """Execution parameters for JPEG Huffman Engine."""
    include_symbol_details: bool = Field(True, description="Whether to include full symbol sequences in findings.")


class JPEGHuffmanEngine(BaseForensicEngine):
    """
    Forensic engine analyzing JPEG Huffman entropy coding tables (DHT).
    Distinguishes DC/AC classes, inspects code length distributions, and fingerprints tables.
    """
    engine_id: str = "JPEG-HUFFMAN"
    engine_name: str = "JPEG Huffman Coding Analysis"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.FILE_ANALYSIS
    description: str = "Analyzes JPEG DHT segments, code-length distributions, DC/AC separation, scan mappings, and table fingerprints."
    parameter_schema = JPEGHuffmanParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG"],
        min_dimensions=(1, 1),
        requires_lossy_compression=True,
    )

    limitations: List[str] = [
        "Huffman table analysis reveals entropy coding structure; it does not decode or verify the variable-length bitstream payload.",
        "Custom or optimized Huffman tables are standard practice in encoders seeking optimal compression ratio (e.g. mozjpeg, Photoshop) and do not alone indicate illicit modification.",
        "Arithmetic-coded JPEGs (which use DAC instead of DHT) are not supported by Huffman inspection.",
    ]

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="Information technology – Digital compression and coding of continuous-tone still images: Requirements and guidelines (Annex K - Huffman tables)",
            authors="ITU-T / ISO/IEC",
            year=1992,
            reference_type=ReferenceType.STANDARD,
            notes="Defines canonical Huffman table structures, standard Annex K baseline distributions, and DHT syntax."
        ),
        ScientificReference(
            title="Digital Image Forensics: A Hardware and Software Perspective",
            authors="Stamm, M. C., Wu, M., Liu, K. J. R.",
            year=2013,
            reference_type=ReferenceType.PAPER,
            notes="Discusses entropy coding variations across software packages and compression libraries."
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
                summary=app_check.reason or "Evidence format is not applicable for JPEG Huffman analysis.",
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

        if len(parse_res.dht_tables) == 0:
            # Check if this image uses arithmetic coding
            if "DAC" in parse_res.marker_sequence:
                return EngineExecutionResult(
                    engine_id=self.engine_id,
                    engine_version=self.engine_version,
                    status=EngineExecutionStatus.NOT_APPLICABLE,
                    summary="JPEG uses arithmetic coding (DAC) instead of Huffman coding (DHT).",
                    limitations=self.limitations,
                    execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
                )
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary="No DHT (Define Huffman Table) segments found in JPEG stream.",
                limitations=self.limitations,
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 5. Build component scan mapping from SOS
        # Map component_id -> {"dc_table": ..., "ac_table": ...}
        sos_mapping: List[Dict[str, Any]] = []
        if parse_res.sos_info and "components" in parse_res.sos_info:
            sos_mapping = parse_res.sos_info["components"]

        # 6. Analyze Huffman Tables
        dc_count = 0
        ac_count = 0
        analyzed_tables: List[Dict[str, Any]] = []

        for t in parse_res.dht_tables:
            t_class = t["table_class"]
            t_id = t["table_id"]
            code_lengths = t["code_lengths"]
            total_symbols = t["symbols_count"]

            if t_class == "DC":
                dc_count += 1
            else:
                ac_count += 1

            # Check if matching ITU-T Annex K standard
            annex_k_match = False
            ref_lens = STANDARD_ANNEX_K_CODE_LENGTHS.get((t_class, t_id))
            if ref_lens and code_lengths == ref_lens:
                annex_k_match = True

            # Calculate code length histogram statistics
            active_lengths = [idx + 1 for idx, count in enumerate(code_lengths) if count > 0]
            min_len = min(active_lengths) if active_lengths else 0
            max_len = max(active_lengths) if active_lengths else 0

            # Scan component associations
            associated_components = []
            for scan_c in sos_mapping:
                cid = scan_c.get("component_id")
                if t_class == "DC" and scan_c.get("dc_huffman_table_id") == t_id:
                    associated_components.append(cid)
                elif t_class == "AC" and scan_c.get("ac_huffman_table_id") == t_id:
                    associated_components.append(cid)

            table_entry = {
                "table_class": t_class,
                "table_id": t_id,
                "segment_offset": t["segment_offset"],
                "total_symbols": total_symbols,
                "code_lengths_distribution": code_lengths,
                "min_code_length": min_len,
                "max_code_length": max_len,
                "is_standard_annex_k": annex_k_match,
                "table_type": "Standard Annex K" if annex_k_match else "Custom / Optimized",
                "associated_components": associated_components,
                "fingerprint_sha256": t["fingerprint"],
            }

            if context.parameters.get("include_symbol_details", True):
                table_entry["symbols"] = t["symbols"]

            analyzed_tables.append(table_entry)

        # 7. Construct Normalized Observations
        has_custom = any(not t["is_standard_annex_k"] for t in analyzed_tables)
        custom_count = sum(1 for t in analyzed_tables if not t["is_standard_annex_k"])

        interpretation = (
            f"Observed {len(analyzed_tables)} Huffman table(s): {dc_count} DC, {ac_count} AC. "
            + (
                f"{custom_count} table(s) exhibit custom/optimized frequency distributions characteristic of targeted entropy encoders. "
                if has_custom
                else "All tables strictly match standard ITU-T T.81 Annex K baseline distributions. "
            )
            + "Table fingerprints are registered for encoder identification."
        )

        obs_summary = (
            f"Analyzed {len(analyzed_tables)} Huffman tables ({dc_count} DC, {ac_count} AC). "
            f"Annex K standard tables: {len(analyzed_tables) - custom_count}, Custom/Optimized: {custom_count}."
        )

        observation = NormalizedObservation(
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED.value,
            observation_type="JPEG_HUFFMAN",
            metric_name="TABLE_COUNT",
            raw_value=str(len(analyzed_tables)),
            normalized_value=min(float(len(analyzed_tables)) / 4.0, 1.0),
            direction="custom_entropy" if has_custom else "standard_baseline",
            interpretation=interpretation,
            limitations=self.limitations,
            result_data={
                "total_tables": len(analyzed_tables),
                "dc_tables_count": dc_count,
                "ac_tables_count": ac_count,
                "custom_tables_count": custom_count,
                "tables_summary": [
                    {
                        "table_class": t["table_class"],
                        "table_id": t["table_id"],
                        "total_symbols": t["total_symbols"],
                        "table_type": t["table_type"],
                        "fingerprint": t["fingerprint_sha256"],
                        "associated_components": t["associated_components"],
                    }
                    for t in analyzed_tables
                ]
            },
            parameters_used=context.parameters,
        )

        # 8. Save JSON Artifact
        os.makedirs(context.storage_output_dir, exist_ok=True)
        artifact_filename = f"jpeg_huffman_analysis_{context.evidence_id}.json"
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
                "specification": "ITU-T T.81 / ISO/IEC 10918-1 Annex K",
            },
            "summary": {
                "total_tables": len(analyzed_tables),
                "dc_tables_count": dc_count,
                "ac_tables_count": ac_count,
                "custom_tables_count": custom_count,
            },
            "huffman_tables": analyzed_tables,
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
            artifact_id=f"jpeg_huffman_{context.evidence_id}",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.JSON,
            mime_type="application/json",
            storage_path=rel_storage_path,
            sha256_hash=art_sha256,
            provenance_metadata={
                "total_tables": len(analyzed_tables),
                "dc_tables_count": dc_count,
                "ac_tables_count": ac_count,
            }
        )

        structured_findings = {
            "total_tables": len(analyzed_tables),
            "dc_count": dc_count,
            "ac_count": ac_count,
            "custom_count": custom_count,
            "tables": analyzed_tables,
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
