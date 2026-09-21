"""
ForenSight V4 — V3 Forensic Core Adapters

Non-invasive adapters that expose the existing frozen V3 forensic analyzers
(Metadata, ELA, Noise, JPEG-DCT, Copy-Move) under the new V4 BaseForensicEngine contract.
DOES NOT MODIFY backend/app/forensics/.
"""

import time
from typing import Dict, Any, List
from pydantic import BaseModel, Field

from .contract import BaseForensicEngine, InputRequirements, ExecutionContext, EngineExecutionResult
from .categories import EngineCategory
from .status import EngineExecutionStatus
from .reference import ScientificReference, ReferenceType
from .observation import NormalizedObservation
from .artifact import EngineArtifactMetadata, ArtifactType

from app.forensics.metadata.extractor import MetadataExtractor
from app.forensics.ela.engine import ELAEngine
from app.forensics.noise.engine import NoiseEngine
from app.forensics.jpeg_dct.engine import JPEGDCTEngine
from app.forensics.copy_move.engine import CopyMoveEngine


class LegacyMetadataAdapter(BaseForensicEngine):
    engine_id = "METADATA"
    engine_name = "Container EXIF Metadata & Hardware Extractor"
    engine_version = "1.0.0"
    category = EngineCategory.FILE_ANALYSIS
    description = "Extracts container metadata, EXIF tags, GPS coordinates, and camera firmware signatures."
    input_requirements = InputRequirements(
        supported_formats=["JPEG", "JPG", "PNG", "WEBP", "TIFF"],
        min_dimensions=(1, 1),
    )
    limitations = [
        "Metadata can be easily stripped or modified using external tools.",
        "Absence of EXIF tags does not establish malicious alteration.",
    ]
    scientific_references = [
        ScientificReference(
            title="Exchangeable Image File Format for Digital Still Cameras: Exif Version 2.32",
            authors="Camera & Imaging Products Association (CIPA)",
            publication_venue="CIPA Standard CP-3451D",
            year=2019,
            reference_type=ReferenceType.STANDARD,
        )
    ]

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        t0 = time.perf_counter()
        app_check = self.check_applicability(context)
        if not app_check.is_applicable:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=app_check.reason or "Not applicable",
                inapplicability_data={"reason": app_check.reason, "notice": app_check.guardrail_notice},
            )

        res = MetadataExtractor.extract(context.stored_path)
        t_ms = (time.perf_counter() - t0) * 1000

        make = res.exif.get("Make") if res.exif else None
        model = res.exif.get("Model") if res.exif else None

        obs = NormalizedObservation(
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            observation_type="METADATA_HEADER",
            metric_name="EXIF_INTEGRITY",
            raw_value=str(make or "Unknown"),
            direction="informational",
            interpretation="Extracted container hardware signatures and EXIF tags.",
            limitations=self.limitations,
            result_data={"make": make, "model": model, "has_exif": bool(res.exif)},
        )

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary="Metadata extraction executed successfully.",
            observations=[obs],
            execution_time_ms=t_ms,
            limitations=self.limitations,
        )


class LegacyELAAdapter(BaseForensicEngine):
    engine_id = "ELA"
    engine_name = "Error Level Analysis (ELA)"
    engine_version = "1.0.0"
    category = EngineCategory.LOCAL_ANALYSIS
    description = "Measures pixel-wise error level variance upon intentional JPEG recompression."
    input_requirements = InputRequirements(
        supported_formats=["JPEG", "JPG"],
        min_dimensions=(16, 16),
        requires_lossy_compression=True,
    )
    limitations = [
        "JPEG only: lossless formats (PNG, WebP) are mathematically inapplicable.",
        "High ELA variance naturally occurs along high-contrast object contours.",
    ]
    scientific_references = [
        ScientificReference(
            title="A Picture's Worth... Digital Image Analysis and Forensics",
            authors="Neal Krawetz",
            publication_venue="Black Hat USA",
            year=2007,
            reference_type=ReferenceType.PAPER,
        )
    ]

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        t0 = time.perf_counter()
        app_check = self.check_applicability(context)
        if not app_check.is_applicable:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=app_check.reason or "Not applicable",
                inapplicability_data={"reason": app_check.reason, "notice": app_check.guardrail_notice},
            )

        quality = context.parameters.get("quality", 95)
        res = ELAEngine.run(context.stored_path, context.storage_output_dir, quality=quality)
        t_ms = (time.perf_counter() - t0) * 1000

        obs = NormalizedObservation(
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            observation_type="COMPRESSION_ERROR",
            metric_name="MEAN_ERROR",
            raw_value=str(round(res.mean_error, 4)),
            normalized_value=min(1.0, res.mean_error / 50.0),
            direction="elevated" if res.mean_error > 5.0 else "informational",
            interpretation=f"Mean recompression error: {res.mean_error:.2f}",
            limitations=self.limitations,
            result_data={"mean_error": res.mean_error, "max_error": res.max_error},
        )

        art = EngineArtifactMetadata(
            artifact_id="ela_error_map",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.HEATMAP,
            storage_path=res.error_map_path,
            sha256_hash="",
            mime_type="image/png",
        )

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary="ELA recompression error computed successfully.",
            observations=[obs],
            artifacts=[art],
            execution_time_ms=t_ms,
            limitations=self.limitations,
        )


class LegacyNoiseAdapter(BaseForensicEngine):
    engine_id = "NOISE"
    engine_name = "Spatial Noise Residual Analysis"
    engine_version = "1.0.0"
    category = EngineCategory.LOCAL_ANALYSIS
    description = "Isolates high-frequency noise residual using median filtering and computes local SNR distributions."
    input_requirements = InputRequirements(
        supported_formats=["JPEG", "JPG", "PNG", "WEBP"],
        min_dimensions=(32, 32),
    )
    limitations = [
        "Measures high-frequency residual energy; does not compute physical sensor PRNU.",
        "Heavy denoising or aggressive social media compression alters high-frequency residual distribution.",
    ]

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        t0 = time.perf_counter()
        app_check = self.check_applicability(context)
        if not app_check.is_applicable:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=app_check.reason or "Not applicable",
                inapplicability_data={"reason": app_check.reason, "notice": app_check.guardrail_notice},
            )

        res = NoiseEngine.run(context.stored_path, context.storage_output_dir)
        t_ms = (time.perf_counter() - t0) * 1000

        obs = NormalizedObservation(
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            observation_type="NOISE_RESIDUAL",
            metric_name="GLOBAL_VARIANCE",
            raw_value=str(round(res.global_statistics.variance, 4)),
            direction="informational",
            interpretation=f"Global noise residual variance: {res.global_statistics.variance:.4f}",
            limitations=self.limitations,
            result_data={"variance": res.global_statistics.variance, "snr_db": res.global_statistics.snr_db},
        )

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary="Noise residual extraction completed successfully.",
            observations=[obs],
            execution_time_ms=t_ms,
            limitations=self.limitations,
        )


class LegacyJPEGDCTAdapter(BaseForensicEngine):
    engine_id = "JPEG_DCT"
    engine_name = "JPEG Discrete Cosine Transform (DCT) Block Analysis"
    engine_version = "1.0.0"
    category = EngineCategory.GLOBAL_ANALYSIS
    description = "Examines 8x8 DCT block frequency distributions and quantization matrix consistency."
    input_requirements = InputRequirements(
        supported_formats=["JPEG", "JPG"],
        min_dimensions=(16, 16),
        requires_lossy_compression=True,
    )
    limitations = [
        "JPEG only: lossless formats (PNG, WebP) are mathematically inapplicable.",
        "Multiple saves in authentic graphic software will trigger double-compression traces.",
    ]

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        t0 = time.perf_counter()
        app_check = self.check_applicability(context)
        if not app_check.is_applicable:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=app_check.reason or "Not applicable",
                inapplicability_data={"reason": app_check.reason, "notice": app_check.guardrail_notice},
            )

        res = JPEGDCTEngine.run(context.stored_path, context.storage_output_dir)
        t_ms = (time.perf_counter() - t0) * 1000

        obs = NormalizedObservation(
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            observation_type="DCT_FREQUENCY",
            metric_name="TOTAL_BLOCKS",
            raw_value=str(res.total_blocks),
            direction="informational",
            interpretation=f"Evaluated {res.total_blocks} 8x8 frequency blocks.",
            limitations=self.limitations,
            result_data={"total_blocks": res.total_blocks},
        )

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary="JPEG/DCT frequency block analysis completed successfully.",
            observations=[obs],
            execution_time_ms=t_ms,
            limitations=self.limitations,
        )


class LegacyCopyMoveAdapter(BaseForensicEngine):
    engine_id = "COPY_MOVE"
    engine_name = "Keypoint-Based Copy-Move Cloning Detection"
    engine_version = "1.0.0"
    category = EngineCategory.GEOMETRIC_ANALYSIS
    description = "Detects cloned spatial regions using SIFT/ORB keypoints and spatial clustering."
    input_requirements = InputRequirements(
        supported_formats=["JPEG", "JPG", "PNG", "WEBP"],
        min_dimensions=(32, 32),
    )
    limitations = [
        "Can flag natural periodic textures (e.g. brick patterns, ripples, leaf clusters).",
        "Ineffective against clones with severe affine warping, heavy blur, or non-keypoint solid patches.",
    ]

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        t0 = time.perf_counter()
        app_check = self.check_applicability(context)
        if not app_check.is_applicable:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=app_check.reason or "Not applicable",
                inapplicability_data={"reason": app_check.reason, "notice": app_check.guardrail_notice},
            )

        res = CopyMoveEngine.run(context.stored_path, context.storage_output_dir)
        t_ms = (time.perf_counter() - t0) * 1000

        obs = NormalizedObservation(
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            observation_type="GEOMETRIC_CLONING",
            metric_name="MATCH_COUNT",
            raw_value=str(res.total_matches),
            direction="elevated" if res.total_matches > 20 else "informational",
            interpretation=f"Detected {res.total_matches} keypoint correspondence pairs across {len(res.clusters)} clusters.",
            limitations=self.limitations,
            result_data={"total_matches": res.total_matches, "cluster_count": len(res.clusters)},
        )

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary="Copy-Move keypoint analysis completed successfully.",
            observations=[obs],
            execution_time_ms=t_ms,
            limitations=self.limitations,
        )
