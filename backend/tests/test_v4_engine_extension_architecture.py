"""
ForenSight V4 — Forensic Engine Extension Architecture Verification Suite

Validates the standardized engine contract, category taxonomy, status lifecycle,
normalized observations, artifact metadata, discovery registry, and API endpoints.
Verifies the non-negotiable scientific rule:
    NOT_APPLICABLE != NEGATIVE_EVIDENCE
"""

import os
import io
import pytest
from datetime import timedelta
from typing import Dict, Any
from pydantic import BaseModel, Field

from app.engine_extensions import (
    EngineCategory,
    EngineExecutionStatus,
    ScientificInapplicabilityExplanation,
    ScientificReference,
    ReferenceType,
    ArtifactType,
    EngineArtifactMetadata,
    NormalizedObservation,
    BaseForensicEngine,
    InputRequirements,
    ApplicabilityResult,
    ExecutionContext,
    EngineExecutionResult,
    ForensicEngineRegistry,
    engine_registry,
    PLANNED_FUTURE_ENGINES,
    get_planned_engine_manifest,
    LegacyMetadataAdapter,
    LegacyELAAdapter,
    LegacyNoiseAdapter,
    LegacyJPEGDCTAdapter,
    LegacyCopyMoveAdapter,
)
from app.models.domain import User, InvestigationCase, Evidence
from app.core.security import create_access_token, get_password_hash


# --- Test Engine Fixtures ---

class DummyParameters(BaseModel):
    threshold: float = Field(0.75, description="Sensitivity threshold.")
    sample_stride: int = Field(4, description="Sampling stride in pixels.")


class DummyJPEGOnlyEngine(BaseForensicEngine):
    engine_id = "DUMMY_JPEG_ENGINE"
    engine_name = "Dummy JPEG Block Engine"
    engine_version = "1.2.0"
    category = EngineCategory.GLOBAL_ANALYSIS
    description = "Mock engine for testing JPEG applicability and parameter serialization."
    input_requirements = InputRequirements(
        supported_formats=["JPEG", "JPG"],
        min_dimensions=(32, 32),
        requires_lossy_compression=True,
    )
    parameter_schema = DummyParameters
    limitations = [
        "Inapplicable on lossless containers (PNG, WebP).",
        "Sensitive to low-resolution downsampling.",
    ]
    scientific_references = [
        ScientificReference(
            title="Statistical Detection of Double Compression in Digital Imagery",
            authors="Test Author et al.",
            publication_venue="Journal of Digital Forensics",
            year=2024,
            doi_or_url="https://doi.org/10.1000/182",
            reference_type=ReferenceType.PAPER,
        )
    ]

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        app_check = self.check_applicability(context)
        if not app_check.is_applicable:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=app_check.reason or "Not applicable",
                limitations=self.limitations,
                inapplicability_data={
                    "reason": app_check.reason,
                    "notice": app_check.guardrail_notice,
                },
            )

        if context.parameters.get("simulate_failure"):
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary="Simulated algorithmic execution failure.",
                limitations=self.limitations,
            )

        obs = NormalizedObservation(
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED.value,
            observation_type="BLOCK_PERIODICITY",
            metric_name="HIST_ENERGY",
            raw_value="14.28",
            normalized_value=0.65,
            direction="elevated",
            interpretation="Periodic peak detected in second-stage quantization bins.",
            limitations=self.limitations,
            result_data={"peak_count": 3, "energy_ratio": 1.42},
            parameters_used=context.parameters,
        )

        art = EngineArtifactMetadata(
            artifact_id="dummy_spectrum",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.SPECTRUM,
            storage_path="analyses/dummy/spectrum.png",
            sha256_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            mime_type="image/png",
            width=256,
            height=256,
        )

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary="Dummy JPEG block analysis completed successfully.",
            observations=[obs],
            artifacts=[art],
            structured_findings={"raw_peaks": [1.2, 3.4, 5.6]},
            execution_time_ms=12.5,
            limitations=self.limitations,
        )


@pytest.fixture
def auth_headers(db_session):
    user = db_session.query(User).filter(User.username == "v4_arch_tester").first()
    if not user:
        user = User(
            username="v4_arch_tester",
            hashed_password=get_password_hash("password123"),
            role="INVESTIGATOR"
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

    token = create_access_token(user.username, expires_delta=timedelta(hours=1))
    return {"Authorization": f"Bearer {token}"}


# --- Unit Tests for Engine Extension Architecture ---

def test_engine_categories_enumeration():
    """Verify standard EngineCategory values and descriptions."""
    expected_categories = [
        "FILE_ANALYSIS",
        "GLOBAL_ANALYSIS",
        "LOCAL_ANALYSIS",
        "CAMERA_IDENTIFICATION",
        "GEOMETRIC_ANALYSIS",
        "AI_SCREENING",
        "VIDEO_FORENSICS",
    ]
    for cat in expected_categories:
        assert EngineCategory.has_category(cat)
        desc = EngineCategory.describe(EngineCategory(cat))
        assert len(desc) > 10


def test_engine_registration_and_retrieval():
    """Verify registering, retrieving, and listing engines in the registry."""
    registry = ForensicEngineRegistry()
    engine = DummyJPEGOnlyEngine()

    registry.register(engine)
    retrieved = registry.get_engine("DUMMY_JPEG_ENGINE")
    assert retrieved is not None
    assert retrieved.engine_id == "DUMMY_JPEG_ENGINE"
    assert retrieved.engine_version == "1.2.0"
    assert retrieved.category == EngineCategory.GLOBAL_ANALYSIS

    # Case-insensitive lookup
    assert registry.get_engine("dummy_jpeg_engine") is not None

    # Idempotent re-registration
    registry.register(engine)
    assert len(registry.list_engines()) == 1


def test_category_and_format_filtering():
    """Verify registry filtering by category and format capability."""
    registry = ForensicEngineRegistry()
    engine = DummyJPEGOnlyEngine()
    registry.register(engine)

    # Filter by matching category
    global_engines = registry.list_engines(category=EngineCategory.GLOBAL_ANALYSIS)
    assert len(global_engines) == 1
    assert global_engines[0].engine_id == "DUMMY_JPEG_ENGINE"

    # Filter by non-matching category
    local_engines = registry.list_engines(category=EngineCategory.LOCAL_ANALYSIS)
    assert len(local_engines) == 0

    # Filter by format
    jpeg_engines = registry.filter_by_format("JPEG")
    assert len(jpeg_engines) == 1

    png_engines = registry.filter_by_format("PNG")
    assert len(png_engines) == 0


def test_scientific_applicability_and_not_applicable_guardrail():
    """
    CRITICAL TEST:
    Verify that an engine rejects incompatible formats with status NOT_APPLICABLE,
    and enforces the rule that NOT_APPLICABLE != NEGATIVE_EVIDENCE.
    """
    engine = DummyJPEGOnlyEngine()

    # 1. Incompatible container format: PNG
    png_context = ExecutionContext(
        evidence_id=101,
        stored_path="test.png",
        sha256_hash="fakehash",
        mime_type="image/png",
        image_format="PNG",
        width=100,
        height=100,
        storage_output_dir="tmp",
    )
    result = engine.execute(png_context)
    assert result.status == EngineExecutionStatus.NOT_APPLICABLE
    assert "not supported" in result.summary.lower()
    assert result.inapplicability_data is not None
    assert "CRITICAL FORENSIC NOTICE" in result.inapplicability_data["notice"]
    assert result.inapplicability_data["notice"].find("authenticity") != -1
    assert len(result.observations) == 0

    # 2. Incompatible dimensions: 10x10 is smaller than required 32x32
    tiny_jpeg_context = ExecutionContext(
        evidence_id=102,
        stored_path="test_tiny.jpg",
        sha256_hash="fakehash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=10,
        height=10,
        storage_output_dir="tmp",
    )
    tiny_result = engine.execute(tiny_jpeg_context)
    assert tiny_result.status == EngineExecutionStatus.NOT_APPLICABLE
    assert "smaller than required" in tiny_result.summary


def test_failed_state_execution_handling():
    """Verify clean reporting when an engine fails during execution."""
    engine = DummyJPEGOnlyEngine()
    context = ExecutionContext(
        evidence_id=103,
        stored_path="test.jpg",
        sha256_hash="fakehash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        parameters={"simulate_failure": True},
        storage_output_dir="tmp",
    )
    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.FAILED
    assert "Simulated algorithmic execution failure" in result.summary


def test_observation_and_artifact_contracts():
    """Verify observation and artifact contracts, serialization, and domain model mapping."""
    engine = DummyJPEGOnlyEngine()
    context = ExecutionContext(
        evidence_id=104,
        analysis_id=55,
        stored_path="test.jpg",
        sha256_hash="fakehash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        parameters={"threshold": 0.8},
        storage_output_dir="tmp",
    )
    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED
    assert len(result.observations) == 1
    assert len(result.artifacts) == 1

    # Validate Observation
    obs = result.observations[0]
    assert obs.engine_id == "DUMMY_JPEG_ENGINE"
    assert obs.metric_name == "HIST_ENERGY"
    assert obs.raw_value == "14.28"
    assert obs.direction == "elevated"

    # Map to SQLAlchemy domain model
    domain_obs = obs.to_domain_observation()
    assert domain_obs.evidence_id == 104
    assert domain_obs.analysis_id == 55
    assert domain_obs.modality == "DUMMY_JPEG_ENGINE"
    assert domain_obs.raw_value == "14.28"

    # Validate Artifact
    art = result.artifacts[0]
    assert art.artifact_type == ArtifactType.SPECTRUM
    assert art.storage_path == "analyses/dummy/spectrum.png"
    legacy_dict = art.to_legacy_artifact_dict()
    assert legacy_dict == {"dummy_spectrum": "analyses/dummy/spectrum.png"}


def test_parameter_schema_and_scientific_references():
    """Verify engine metadata exposes parameter schemas and valid scientific references."""
    engine = DummyJPEGOnlyEngine()
    metadata = engine.get_metadata()

    assert metadata["engine_id"] == "DUMMY_JPEG_ENGINE"
    assert metadata["engine_version"] == "1.2.0"
    assert metadata["category"] == "GLOBAL_ANALYSIS"
    assert len(metadata["limitations"]) == 2

    # Scientific References
    assert len(metadata["scientific_references"]) == 1
    ref = metadata["scientific_references"][0]
    assert "Double Compression" in ref["title"]
    assert ref["reference_type"] == "PAPER"
    assert ref["year"] == 2024

    # Parameter Schema
    schema = metadata["parameter_schema"]
    assert "properties" in schema
    assert "threshold" in schema["properties"]
    assert "sample_stride" in schema["properties"]


def test_planned_future_engine_manifest():
    """Verify the formal manifest of 18 planned V4 engines all have STATUS='PLANNED'."""
    manifest = get_planned_engine_manifest()
    assert len(manifest) == 18

    # All engines must be strictly in PLANNED state
    for eng in manifest:
        assert eng["status"] == "PLANNED"
        assert eng["target_version"] == "1.0.0"
        assert len(eng["planned_capabilities"]) > 0
        assert len(eng["scientific_rationale"]) > 10

    engine_ids = {e["engine_id"] for e in manifest}
    expected_ids = {
        "JPEG-QT",
        "JPEG-HUFFMAN",
        "JPEG-STRUCTURE",
        "JPEG-GHOST",
        "BLOCKING-ARTIFACT",
        "ADJPEG",
        "NADJPEG",
        "HISTOGRAM",
        "COLOR-CHANNEL",
        "FOURIER",
        "ADVANCED-NOISE",
        "RESAMPLING",
        "CLONE-BLOCK",
        "CLONE-KEYPOINT",
        "PRNU",
        "CAMERA-ID",
        "AI-SCREENING",
        "VIDEO-FORENSICS",
    }
    assert expected_ids == engine_ids


def test_legacy_v3_core_adapters():
    """Verify that all 5 legacy frozen V3 engines adapt into the V4 engine contract."""
    adapters = [
        LegacyMetadataAdapter(),
        LegacyELAAdapter(),
        LegacyNoiseAdapter(),
        LegacyJPEGDCTAdapter(),
        LegacyCopyMoveAdapter(),
    ]

    expected_specs = {
        "METADATA": (EngineCategory.FILE_ANALYSIS, ["JPEG", "JPG", "PNG", "WEBP", "TIFF"]),
        "ELA": (EngineCategory.LOCAL_ANALYSIS, ["JPEG", "JPG"]),
        "NOISE": (EngineCategory.LOCAL_ANALYSIS, ["JPEG", "JPG", "PNG", "WEBP"]),
        "JPEG_DCT": (EngineCategory.GLOBAL_ANALYSIS, ["JPEG", "JPG"]),
        "COPY_MOVE": (EngineCategory.GEOMETRIC_ANALYSIS, ["JPEG", "JPG", "PNG", "WEBP"]),
    }

    for adapter in adapters:
        assert adapter.engine_id in expected_specs
        exp_cat, exp_fmts = expected_specs[adapter.engine_id]
        assert adapter.category == exp_cat
        assert adapter.input_requirements.supported_formats == exp_fmts
        assert len(adapter.limitations) > 0


# --- API Endpoint Integration Tests ---

def test_api_engines_registry_endpoints(client, auth_headers):
    """Verify GET /api/engines, /categories, /planned, and /{id}."""
    from app.main import app
    from app.api.deps import get_current_user

    old_override = app.dependency_overrides.pop(get_current_user, None)
    try:
        # 1. Unauthenticated requests must fail with 401
        assert client.get("/api/engines").status_code == 401
        assert client.get("/api/engines/categories").status_code == 401
        assert client.get("/api/engines/planned").status_code == 401

        # 2. Authenticated list of registered engines
        res = client.get("/api/engines", headers=auth_headers)
        assert res.status_code == 200
        engines = res.json()
        assert len(engines) >= 5  # 5 pre-registered legacy adapters
        registered_ids = [e["engine_id"] for e in engines]
        assert "METADATA" in registered_ids
        assert "ELA" in registered_ids
        assert "NOISE" in registered_ids
        assert "JPEG_DCT" in registered_ids
        assert "COPY_MOVE" in registered_ids

        # 3. Category filter query parameter
        res_local = client.get("/api/engines?category=LOCAL_ANALYSIS", headers=auth_headers)
        assert res_local.status_code == 200
        local_engines = res_local.json()
        for e in local_engines:
            assert e["category"] == "LOCAL_ANALYSIS"

        # 4. Format filter query parameter
        res_png = client.get("/api/engines?container_format=PNG", headers=auth_headers)
        assert res_png.status_code == 200
        png_engine_ids = [e["engine_id"] for e in res_png.json()]
        assert "ELA" not in png_engine_ids  # ELA does not support PNG
        assert "JPEG_DCT" not in png_engine_ids  # JPEG_DCT does not support PNG
        assert "METADATA" in png_engine_ids
        assert "NOISE" in png_engine_ids

        # 5. List Engine Categories
        res_cat = client.get("/api/engines/categories", headers=auth_headers)
        assert res_cat.status_code == 200
        categories = res_cat.json()
        assert len(categories) == 7

        # 6. List Planned Future Engines
        res_plan = client.get("/api/engines/planned", headers=auth_headers)
        assert res_plan.status_code == 200
        planned = res_plan.json()
        assert len(planned) == 18
        for p in planned:
            assert p["status"] == "PLANNED"

        # 7. Get specific engine detail
        res_det = client.get("/api/engines/ELA", headers=auth_headers)
        assert res_det.status_code == 200
        detail = res_det.json()
        assert detail["engine_id"] == "ELA"
        assert detail["category"] == "LOCAL_ANALYSIS"
        assert "JPEG" in detail["input_requirements"]["supported_formats"]

        # 8. Non-existent engine returns 404
        assert client.get("/api/engines/NON_EXISTENT", headers=auth_headers).status_code == 404
    finally:
        if old_override:
            app.dependency_overrides[get_current_user] = old_override
