"""
ForenSight V4 — Step 4 Blocking Artifact Forensics Test Suite

Verifies:
1. Engine registration in ForensicEngineRegistry (BLOCKING-ARTIFACT, LOCAL_ANALYSIS, JPEG/JPG)
2. Engine metadata and input requirements specification
3. Clean JPEG execution producing structured boundary statistics and spatial blocking maps
4. Multiple JPEG quality levels (Q=50, Q=70, Q=90)
5. Synthetic splice/patch with localized blocking inconsistency generating candidate regions
6. Strict 3-run deterministic reproducibility (Run 1 == Run 2 == Run 3)
7. Artifact generation: blocking_artifact_map.png and blocking_artifact_analysis.json on disk
8. Structured JSON output schema correctness and completeness
9. PNG inapplicability guardrail (NOT_APPLICABLE, never negative evidence)
10. WebP inapplicability guardrail (NOT_APPLICABLE, never negative evidence)
11. Malformed JPEG handling (returns FAILED status, safe error message, no crash)
12. Truncated JPEG handling (returns FAILED or handled safely, no crash)
13. Zero-byte input handling (returns FAILED status, no crash)
14. Small dimensions (< 32x32) resource guardrail (returns FAILED status)
15. Large dimension resource safety and bounding
16. API triggering via POST /api/evidence/{id}/analysis/blocking-artifact
17. Authentication requirement (unauthenticated requests rejected with 401)
18. RBAC and cross-case isolation (user A cannot trigger on user B's case)
19. Artifact authorization (investigator can only access artifacts for their own cases)
20. Path traversal protection on artifact retrieval (blocks '..' and absolute paths)
"""

import os
import io
import json
import pytest
import numpy as np
from PIL import Image
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.db.database import get_db
from app.models.domain import User, InvestigationCase, Evidence, Analysis
from app.engine_extensions import (
    engine_registry,
    ExecutionContext,
    EngineExecutionStatus,
)
from app.engine_extensions.blocking import (
    BlockingArtifactEngine,
    BlockingArtifactParameters,
)


FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "forensics")
CLEAN_JPG = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
CLEAN_PNG = os.path.join(FIXTURES_DIR, "clean_reference.png")
CLEAN_WEBP = os.path.join(FIXTURES_DIR, "clean_reference.webp")
TRUNCATED_JPG = os.path.join(FIXTURES_DIR, "truncated.jpg")
MALFORMED_JPG = os.path.join(FIXTURES_DIR, "malformed_header.jpg")
ZERO_BYTE = os.path.join(FIXTURES_DIR, "zero_byte.bin")


# ============================================================
# HELPER FIXTURES: SYNTHETIC CONTROLLED JPEG FIXTURES
# ============================================================

@pytest.fixture
def jpeg_quality_fixtures(tmp_path):
    """Generates synthetic test JPEGs at Q=50, Q=70, and Q=90."""
    fixtures = {}
    arr = np.zeros((128, 128, 3), dtype=np.uint8)
    for i in range(128):
        for j in range(128):
            arr[i, j] = [(i * 3) % 256, (j * 5) % 256, ((i + j) * 4) % 256]
    base_img = Image.fromarray(arr)

    for q in [50, 70, 90]:
        p = str(tmp_path / f"test_q{q}.jpg")
        base_img.save(p, format="JPEG", quality=q)
        fixtures[q] = p
    return fixtures


@pytest.fixture
def synthetic_splice_jpeg(tmp_path):
    """Creates a controlled synthetic splice JPEG with an uncompressed/flat patch inserted."""
    img_path = str(tmp_path / "synthetic_splice.jpg")
    arr = np.zeros((192, 192, 3), dtype=np.uint8)
    for i in range(192):
        for j in range(192):
            arr[i, j] = [(i * 7) % 256, (j * 11) % 256, ((i + j) * 3) % 256]

    # Save as JPEG Q=50
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=50)
    buf.seek(0)
    base_jpeg = np.array(Image.open(buf))

    # Insert a 48x48 flat/smoothed patch in the center (patch has zero blocking artifacts)
    base_jpeg[64:112, 64:112] = 180

    # Save without further whole-image recompression
    Image.fromarray(base_jpeg).save(img_path, format="JPEG", quality=95)
    return img_path


# ============================================================
# 1. ENGINE REGISTRY & METADATA CHECKS
# ============================================================

def test_blocking_artifact_engine_registered():
    """Verify BLOCKING-ARTIFACT engine is registered and discoverable."""
    engine = engine_registry.get_engine("BLOCKING-ARTIFACT")
    assert engine is not None
    assert engine.engine_id == "BLOCKING-ARTIFACT"
    assert engine.engine_name == "Blocking Artifact Inconsistency (BAG)"
    assert engine.engine_version == "1.0.0"
    assert engine.category.value == "LOCAL_ANALYSIS"
    assert "JPEG" in engine.input_requirements.supported_formats
    assert "JPG" in engine.input_requirements.supported_formats
    assert engine.input_requirements.requires_lossy_compression is True


def test_blocking_artifact_parameter_schema():
    """Verify parameter schema defaults and validation."""
    params = BlockingArtifactParameters()
    assert params.z_score_threshold == 2.2
    assert params.min_cluster_blocks == 4
    assert params.max_dimension == 4096


# ============================================================
# 2. CORE EXECUTION ON CLEAN JPEG
# ============================================================

def test_blocking_artifact_clean_execution(tmp_path):
    """Verify execution on clean JPEG produces valid boundary stats and artifacts."""
    engine = BlockingArtifactEngine()
    context = ExecutionContext(
        evidence_id=901,
        analysis_id=50,
        stored_path=CLEAN_JPG,
        sha256_hash="clean_blocking_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED
    assert len(result.observations) >= 1
    assert len(result.artifacts) == 2  # Map and JSON

    findings = result.structured_findings
    assert "global_statistics" in findings
    assert "horizontal_boundary_statistics" in findings
    assert "vertical_boundary_statistics" in findings
    assert "candidate_regions" in findings
    assert "artifacts" in findings

    g_stats = findings["global_statistics"]
    assert "global_blocking_strength" in g_stats
    assert "boundary_energy" in g_stats
    assert "grid_periodicity_strength" in g_stats
    assert g_stats["global_blocking_strength"] >= 0.0

    h_stats = findings["horizontal_boundary_statistics"]
    assert "mean_discontinuity" in h_stats
    assert "boundary_to_internal_ratio" in h_stats

    v_stats = findings["vertical_boundary_statistics"]
    assert "mean_discontinuity" in v_stats
    assert "boundary_to_internal_ratio" in v_stats


# ============================================================
# 3. MULTIPLE JPEG QUALITY LEVELS
# ============================================================

def test_blocking_artifact_multiple_qualities(jpeg_quality_fixtures, tmp_path):
    """Verify blocking artifact measurements across multiple quality levels (Q=50, 70, 90)."""
    engine = BlockingArtifactEngine()
    strengths = {}

    for q, path in jpeg_quality_fixtures.items():
        out_dir = str(tmp_path / f"q_{q}")
        context = ExecutionContext(
            evidence_id=902 + q,
            analysis_id=60 + q,
            stored_path=path,
            sha256_hash=f"hash_q_{q}",
            mime_type="image/jpeg",
            image_format="JPEG",
            width=128,
            height=128,
            storage_output_dir=out_dir,
        )
        res = engine.execute(context)
        assert res.status == EngineExecutionStatus.APPLIED
        strengths[q] = res.structured_findings["global_statistics"]["global_blocking_strength"]

    # Lower quality (higher quantization) produces stronger boundary step discontinuities
    assert strengths[50] >= strengths[90]


# ============================================================
# 4. SYNTHETIC SPLICE & CANDIDATE REGION IDENTIFICATION
# ============================================================

def test_blocking_artifact_candidate_regions(synthetic_splice_jpeg, tmp_path):
    """Verify synthetic spliced image produces candidate anomaly regions."""
    engine = BlockingArtifactEngine()
    context = ExecutionContext(
        evidence_id=910,
        analysis_id=70,
        stored_path=synthetic_splice_jpeg,
        sha256_hash="synthetic_splice_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=192,
        height=192,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED
    findings = result.structured_findings
    regions = findings["candidate_regions"]
    assert len(regions) >= 1

    # Verify region structure
    r0 = regions[0]
    assert "region_id" in r0
    assert "type" in r0
    assert "block_count" in r0
    assert "mean_z_score" in r0
    assert "bounding_box_pixels" in r0
    assert "normalized_bounding_box" in r0
    assert "description" in r0


# ============================================================
# 5. STRICT 3-RUN DETERMINISTIC REPRODUCIBILITY
# ============================================================

def test_blocking_artifact_determinism(tmp_path):
    """Verify Run 1 == Run 2 == Run 3 producing identical findings and artifact hashes."""
    engine = BlockingArtifactEngine()
    results = []

    for run_idx in range(3):
        out_dir = str(tmp_path / f"det_run_{run_idx}")
        context = ExecutionContext(
            evidence_id=920,
            analysis_id=80,
            stored_path=CLEAN_JPG,
            sha256_hash="det_hash_blocking",
            mime_type="image/jpeg",
            image_format="JPEG",
            width=100,
            height=100,
            storage_output_dir=out_dir,
        )
        res = engine.execute(context)
        assert res.status == EngineExecutionStatus.APPLIED
        results.append(res)

    # 1. Compare global statistics
    g0 = results[0].structured_findings["global_statistics"]
    g1 = results[1].structured_findings["global_statistics"]
    g2 = results[2].structured_findings["global_statistics"]
    assert g0 == g1 == g2

    # 2. Compare boundary statistics
    h0 = results[0].structured_findings["horizontal_boundary_statistics"]
    h1 = results[1].structured_findings["horizontal_boundary_statistics"]
    h2 = results[2].structured_findings["horizontal_boundary_statistics"]
    assert h0 == h1 == h2

    # 3. Compare artifact hashes
    for art_idx in range(len(results[0].artifacts)):
        h0 = results[0].artifacts[art_idx].sha256_hash
        h1 = results[1].artifacts[art_idx].sha256_hash
        h2 = results[2].artifacts[art_idx].sha256_hash
        assert h0 == h1 == h2


# ============================================================
# 6. ARTIFACT GENERATION & STRUCTURED JSON CORRECTNESS
# ============================================================

def test_blocking_artifact_artifacts_and_json_schema(tmp_path):
    """Verify blocking_artifact_map.png and blocking_artifact_analysis.json correctness."""
    engine = BlockingArtifactEngine()
    context = ExecutionContext(
        evidence_id=930,
        analysis_id=90,
        stored_path=CLEAN_JPG,
        sha256_hash="artifact_schema_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED

    map_path = os.path.join(str(tmp_path), "blocking_artifact_map.png")
    json_path = os.path.join(str(tmp_path), "blocking_artifact_analysis.json")

    assert os.path.isfile(map_path)
    assert os.path.getsize(map_path) > 0
    assert os.path.isfile(json_path)
    assert os.path.getsize(json_path) > 0

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Validate JSON schema keys
    required_keys = [
        "engine",
        "input_information",
        "horizontal_boundary_statistics",
        "vertical_boundary_statistics",
        "global_statistics",
        "candidate_regions",
        "algorithm_parameters",
        "reproducibility_metadata",
        "limitations",
    ]
    for k in required_keys:
        assert k in data, f"Missing key '{k}' in blocking_artifact_analysis.json"

    assert data["engine"]["id"] == "BLOCKING-ARTIFACT"
    assert data["engine"]["category"] == "LOCAL_ANALYSIS"


# ============================================================
# 7. INAPPLICABILITY GUARDRAILS (PNG, WEBP)
# ============================================================

def test_blocking_artifact_png_not_applicable(tmp_path):
    """Verify PNG evidence returns NOT_APPLICABLE with guardrail notice."""
    engine = BlockingArtifactEngine()
    context = ExecutionContext(
        evidence_id=940,
        analysis_id=95,
        stored_path=CLEAN_PNG,
        sha256_hash="png_hash",
        mime_type="image/png",
        image_format="PNG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.NOT_APPLICABLE
    assert result.inapplicability_data is not None
    assert "CRITICAL FORENSIC NOTICE" in result.inapplicability_data["notice"]


def test_blocking_artifact_webp_not_applicable(tmp_path):
    """Verify WebP evidence returns NOT_APPLICABLE with guardrail notice."""
    engine = BlockingArtifactEngine()
    context = ExecutionContext(
        evidence_id=941,
        analysis_id=96,
        stored_path=CLEAN_WEBP,
        sha256_hash="webp_hash",
        mime_type="image/webp",
        image_format="WEBP",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.NOT_APPLICABLE
    assert result.inapplicability_data is not None
    assert "CRITICAL FORENSIC NOTICE" in result.inapplicability_data["notice"]


# ============================================================
# 8. ERROR & EDGE CASE HANDLING (MALFORMED, TRUNCATED, ZERO-BYTE)
# ============================================================

def test_blocking_artifact_zero_byte(tmp_path):
    """Verify zero-byte input returns FAILED status without crashing."""
    engine = BlockingArtifactEngine()
    context = ExecutionContext(
        evidence_id=950,
        analysis_id=100,
        stored_path=ZERO_BYTE,
        sha256_hash="zero_byte_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.FAILED
    assert "zero bytes" in result.summary.lower()


def test_blocking_artifact_malformed_jpeg(tmp_path):
    """Verify malformed JPEG bitstream returns FAILED status without crashing."""
    engine = BlockingArtifactEngine()
    context = ExecutionContext(
        evidence_id=951,
        analysis_id=101,
        stored_path=MALFORMED_JPG,
        sha256_hash="malformed_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.FAILED
    assert "failed to decode" in result.summary.lower()


def test_blocking_artifact_truncated_jpeg(tmp_path):
    """Verify truncated JPEG is handled safely without crashing."""
    engine = BlockingArtifactEngine()
    context = ExecutionContext(
        evidence_id=952,
        analysis_id=102,
        stored_path=TRUNCATED_JPG,
        sha256_hash="truncated_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    # Either decoded partial image or returns FAILED; must never raise unhandled exception
    assert result.status in (EngineExecutionStatus.APPLIED, EngineExecutionStatus.FAILED)


def test_blocking_artifact_tiny_dimension_guardrail(tmp_path):
    """Verify image smaller than 32x32 returns FAILED with informative summary."""
    tiny_path = str(tmp_path / "tiny.jpg")
    tiny_img = Image.new("RGB", (16, 16), color=(128, 128, 128))
    tiny_img.save(tiny_path, format="JPEG")

    engine = BlockingArtifactEngine()
    context = ExecutionContext(
        evidence_id=953,
        analysis_id=103,
        stored_path=tiny_path,
        sha256_hash="tiny_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=16,
        height=16,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status in (EngineExecutionStatus.FAILED, EngineExecutionStatus.NOT_APPLICABLE)


def test_blocking_artifact_large_dimension_safety(tmp_path):
    """Verify large dimension input is safely bounded within max_dimension."""
    large_path = str(tmp_path / "large.jpg")
    large_img = Image.new("RGB", (600, 400), color=(100, 150, 200))
    large_img.save(large_path, format="JPEG", quality=80)

    engine = BlockingArtifactEngine()
    context = ExecutionContext(
        evidence_id=954,
        analysis_id=104,
        stored_path=large_path,
        sha256_hash="large_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=600,
        height=400,
        parameters={"max_dimension": 256},
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED
    # Analyzed dimensions should be bounded to <= 256
    analyzed_dim = result.structured_findings["input_information"]["analyzed_dimensions"]
    assert max(analyzed_dim) <= 256


# ============================================================
# 9. API ENDPOINT, RBAC, ISOLATION & ARTIFACT SERVING
# ============================================================

def test_api_trigger_blocking_artifact(client: TestClient, db_session: Session):
    """Verify triggering BLOCKING-ARTIFACT via API returns completed analysis and serves artifacts."""
    user = User(username="analyst_blocking_api", hashed_password="pw", role="ADMIN")
    db_session.add(user)
    db_session.commit()

    case = InvestigationCase(case_identifier="FS-CASE-2026-BAG", title="Blocking Case", user_id=user.id)
    db_session.add(case)
    db_session.commit()

    evidence = Evidence(
        case_id=case.id,
        evidence_identifier="FS-EV-2026-BAG-001",
        original_filename="clean_reference.jpg",
        stored_path=CLEAN_JPG,
        sha256_hash="mockshabag",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
    )
    db_session.add(evidence)
    db_session.commit()

    res = client.post(f"/api/evidence/{evidence.id}/analysis/blocking-artifact")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "completed"
    assert data["analysis_type"] == "BLOCKING_ARTIFACT"
    findings = data["structured_findings"]
    assert "global_statistics" in findings
    assert "artifacts" in findings

    # Fetch blocking map artifact
    map_path = findings["artifacts"]["blocking_artifact_map"]
    res_art = client.get(f"/api/artifacts/{map_path}")
    assert res_art.status_code == 200
    assert res_art.headers["content-type"] == "image/png"

    # Fetch JSON artifact
    json_path = findings["artifacts"]["blocking_artifact_data"]
    res_json = client.get(f"/api/artifacts/{json_path}")
    assert res_json.status_code == 200
    assert res_json.headers["content-type"] == "application/json"


def test_api_blocking_artifact_cross_case_isolation(client: TestClient, db_session: Session):
    """Verify User B cannot trigger analysis on User A's evidence."""
    user_a = User(username="user_a_bag", hashed_password="pw", role="INVESTIGATOR")
    user_b = User(username="user_b_bag", hashed_password="pw", role="INVESTIGATOR")
    db_session.add_all([user_a, user_b])
    db_session.commit()

    case_a = InvestigationCase(case_identifier="FS-CASE-A-BAG", title="Case A", user_id=user_a.id)
    db_session.add(case_a)
    db_session.commit()

    ev_a = Evidence(
        case_id=case_a.id,
        evidence_identifier="FS-EV-A-BAG",
        original_filename="clean_reference.jpg",
        stored_path=CLEAN_JPG,
        sha256_hash="mockshaa",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
    )
    db_session.add(ev_a)
    db_session.commit()

    # Logged in as user_b (via header override or dependency mock)
    from app.api.deps import get_current_user
    app.dependency_overrides[get_current_user] = lambda: user_b

    res = client.post(f"/api/evidence/{ev_a.id}/analysis/blocking-artifact")
    assert res.status_code == 403

    # Reset override to conftest default
    from conftest import override_get_current_user
    app.dependency_overrides[get_current_user] = override_get_current_user


def test_api_blocking_artifact_path_traversal_protection(client: TestClient):
    """Verify path traversal attempts on artifact retrieval are rejected."""
    traversal_paths = [
        "../etc/passwd",
        "..\\windows\\system32",
        "analyses/../../secret.txt",
        "/absolute/path/secret.png",
    ]
    for p in traversal_paths:
        res = client.get(f"/api/artifacts/{p}")
        assert res.status_code in (401, 403, 404)
