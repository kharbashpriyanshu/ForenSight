"""
ForenSight V4 — Step 2 Advanced JPEG & File Forensics Test Suite

Verifies:
1. JPEG-STRUCTURE engine (marker parsing, segments, dimensions, components, anomalies)
2. JPEG-QT engine (8x8 matrices, statistics, fingerprints, component mappings, IJG quality estimation)
3. JPEG-HUFFMAN engine (DHT extraction, DC/AC classes, code-length distributions, fingerprints, Annex K baseline)
4. Scientific inapplicability guardrails (PNG, WebP -> NOT_APPLICABLE, never negative evidence)
5. Robustness against malformed, truncated, and zero-byte inputs (never crashes)
6. Strict 3-run deterministic reproducibility
7. API triggering, JSON artifact creation, RBAC authorization, and path traversal protection
"""

import os
import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.db.database import get_db
from app.models.domain import User, InvestigationCase, Evidence, Analysis
from app.api.deps import get_current_user
from app.engine_extensions import (
    engine_registry,
    ExecutionContext,
    EngineExecutionStatus,
)
from app.engine_extensions.jpeg.parser import parse_jpeg_stream, ZIGZAG_INDEX
from app.engine_extensions.jpeg import (
    JPEGStructureEngine,
    JPEGQuantizationTableEngine,
    JPEGHuffmanEngine,
)
from app.engine_extensions.jpeg.qt_engine import calculate_table_statistics, estimate_ijg_quality, IJG_STD_LUMINANCE
from app.engine_extensions.runner import V4EngineRunner


FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "forensics")
CLEAN_JPG = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
CLEAN_PNG = os.path.join(FIXTURES_DIR, "clean_reference.png")
CLEAN_WEBP = os.path.join(FIXTURES_DIR, "clean_reference.webp")
TRUNCATED_JPG = os.path.join(FIXTURES_DIR, "truncated.jpg")
MALFORMED_JPG = os.path.join(FIXTURES_DIR, "malformed_header.jpg")
ZERO_BYTE = os.path.join(FIXTURES_DIR, "zero_byte.bin")


# ============================================================
# 1. PARSER & UNIT TESTS
# ============================================================

def test_jpeg_parser_clean_stream():
    """Verify raw JPEG byte parser extracts standard markers without errors."""
    with open(CLEAN_JPG, "rb") as f:
        data = f.read()

    res = parse_jpeg_stream(data)
    assert res.is_jpeg is True
    assert "SOI" in res.marker_sequence
    assert "EOI" in res.marker_sequence
    assert "DQT" in res.marker_sequence
    assert "SOF0" in res.marker_sequence or "SOF" in str(res.marker_sequence)
    assert len(res.dqt_tables) >= 1
    assert len(res.dht_tables) >= 1
    assert res.dimensions is not None
    assert res.dimensions["width"] > 0
    assert res.dimensions["height"] > 0
    assert len(res.components) >= 1
    assert len(res.structural_anomalies) == 0


def test_jpeg_parser_anomalies():
    """Verify parser safely logs anomalies on corrupted, truncated, and zero-byte streams."""
    # Truncated JPEG
    with open(TRUNCATED_JPG, "rb") as f:
        trunc_data = f.read()
    res_trunc = parse_jpeg_stream(trunc_data)
    assert res_trunc.is_jpeg is True
    assert any("Missing EOI" in a for a in res_trunc.structural_anomalies)

    # Malformed header JPEG
    with open(MALFORMED_JPG, "rb") as f:
        malf_data = f.read()
    res_malf = parse_jpeg_stream(malf_data)
    assert len(res_malf.structural_anomalies) > 0

    # Zero-byte
    res_zero = parse_jpeg_stream(b"")
    assert res_zero.is_jpeg is False
    assert len(res_zero.structural_anomalies) > 0

    # Non-JPEG (PNG bytes)
    with open(CLEAN_PNG, "rb") as f:
        png_data = f.read()
    res_png = parse_jpeg_stream(png_data)
    assert res_png.is_jpeg is False
    assert any("Missing SOI" in a for a in res_png.structural_anomalies)


# ============================================================
# 2. ENGINE 1 — JPEG-STRUCTURE
# ============================================================

def test_engine_jpeg_structure_clean(tmp_path):
    """Verify JPEG-STRUCTURE engine on a clean JPEG image."""
    engine = JPEGStructureEngine()
    context = ExecutionContext(
        evidence_id=101,
        analysis_id=1,
        stored_path=CLEAN_JPG,
        sha256_hash="clean_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED
    assert len(result.observations) == 1
    assert len(result.artifacts) == 1

    obs = result.observations[0]
    assert obs.engine_id == "JPEG-STRUCTURE"
    assert obs.observation_type == "JPEG_STRUCTURE"
    assert obs.metric_name == "ANOMALY_COUNT"
    assert obs.raw_value == "0"
    assert obs.direction == "nominal"

    findings = result.structured_findings
    assert findings["format"] == "JPEG"
    assert "SOI" in findings["marker_sequence"]
    assert "EOI" in findings["marker_sequence"]
    assert len(findings["components"]) >= 1
    assert findings["dimensions"]["width"] > 0

    # Verify JSON artifact written to disk
    art = result.artifacts[0]
    disk_file = os.path.join(str(tmp_path), os.path.basename(art.storage_path))
    assert os.path.isfile(disk_file)
    with open(disk_file, "r") as f:
        art_json = json.load(f)
    assert art_json["engine_id"] == "JPEG-STRUCTURE"
    assert art_json["evidence_sha256"] == "clean_hash"


def test_engine_jpeg_structure_anomalous(tmp_path):
    """Verify JPEG-STRUCTURE reports anomalies with objective observation language."""
    engine = JPEGStructureEngine()
    context = ExecutionContext(
        evidence_id=102,
        analysis_id=2,
        stored_path=TRUNCATED_JPG,
        sha256_hash="trunc_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED
    obs = result.observations[0]
    assert obs.direction == "anomalous"
    assert int(obs.raw_value) > 0
    assert "structural inconsistency" in obs.interpretation.lower()
    # Confirm no accusatory forgery language
    assert "fake" not in obs.interpretation.lower()
    assert "forgery" not in obs.interpretation.lower()


# ============================================================
# 3. ENGINE 2 — JPEG-QT (QUANTIZATION TABLES)
# ============================================================

def test_engine_jpeg_qt_clean(tmp_path):
    """Verify JPEG-QT extracts 8x8 tables, statistics, fingerprints, and quality factor."""
    engine = JPEGQuantizationTableEngine()
    context = ExecutionContext(
        evidence_id=201,
        analysis_id=3,
        stored_path=CLEAN_JPG,
        sha256_hash="clean_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED
    assert len(result.observations) == 1
    assert len(result.artifacts) == 1

    findings = result.structured_findings
    assert findings["table_count"] >= 1
    for t in findings["tables"]:
        assert len(t["raw_matrix_8x8"]) == 8
        assert len(t["raw_matrix_8x8"][0]) == 8
        assert len(t["fingerprint_sha256"]) == 64
        assert "statistics" in t
        assert t["statistics"]["dc_coefficient"] > 0
        assert "ac" in t["statistics"]
        assert t["statistics"]["ac"]["mean"] > 0

    # Verify quality factor estimation object
    q_est = findings["quality_estimation"]
    assert q_est["status"] in ("ESTIMATED", "NOT_ESTIMATED")
    if q_est["status"] == "ESTIMATED":
        assert 1 <= q_est["estimated_quality_factor"] <= 100
        assert "disclaimer" in q_est["scientific_disclaimer"].lower() or "estimate" in q_est["scientific_disclaimer"].lower()


def test_qt_statistics_and_custom_table_estimation():
    """Verify QT statistics calculation and handling of non-standard custom tables."""
    # Test statistics
    table_vals = list(range(1, 65))
    stats = calculate_table_statistics(table_vals)
    assert stats["dc_coefficient"] == 1
    assert stats["overall"]["min"] == 1
    assert stats["overall"]["max"] == 64
    assert stats["ac"]["min"] == 2
    assert stats["ac"]["max"] == 64

    # Test exact IJG standard table -> Q=50
    q_50 = estimate_ijg_quality(IJG_STD_LUMINANCE)
    assert q_50["status"] == "ESTIMATED"
    assert q_50["estimated_quality_factor"] == 50
    assert q_50["mean_absolute_deviation"] == 0.0

    # Test custom flat table (all 15s) -> should yield NOT_ESTIMATED
    flat_table = [15] * 64
    q_flat = estimate_ijg_quality(flat_table)
    assert q_flat["status"] == "NOT_ESTIMATED"
    assert q_flat["estimated_quality_factor"] is None
    assert "does not conform" in q_flat["reason"].lower()


# ============================================================
# 4. ENGINE 3 — JPEG-HUFFMAN
# ============================================================

def test_engine_jpeg_huffman_clean(tmp_path):
    """Verify JPEG-HUFFMAN extracts DC/AC tables, code-length distributions, and fingerprints."""
    engine = JPEGHuffmanEngine()
    context = ExecutionContext(
        evidence_id=301,
        analysis_id=4,
        stored_path=CLEAN_JPG,
        sha256_hash="clean_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED
    assert len(result.observations) == 1
    assert len(result.artifacts) == 1

    findings = result.structured_findings
    assert findings["total_tables"] >= 1
    assert findings["dc_count"] >= 1 or findings["ac_count"] >= 1

    for t in findings["tables"]:
        assert t["table_class"] in ("DC", "AC")
        assert len(t["code_lengths_distribution"]) == 16
        assert t["total_symbols"] == sum(t["code_lengths_distribution"])
        assert len(t["fingerprint_sha256"]) == 64
        assert t["table_type"] in ("Standard Annex K", "Custom / Optimized")


# ============================================================
# 5. SCIENTIFIC INAPPLICABILITY & GUARDRAIL TESTING
# ============================================================

@pytest.mark.parametrize("engine_cls", [JPEGStructureEngine, JPEGQuantizationTableEngine, JPEGHuffmanEngine])
def test_scientific_inapplicability_png_webp(tmp_path, engine_cls):
    """
    CRITICAL TEST:
    Verify all 3 engines reject PNG and WebP with status NOT_APPLICABLE,
    and include the scientific guardrail notice explaining inapplicability != negative evidence.
    """
    engine = engine_cls()

    # 1. PNG
    ctx_png = ExecutionContext(
        evidence_id=401,
        stored_path=CLEAN_PNG,
        sha256_hash="png_hash",
        mime_type="image/png",
        image_format="PNG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )
    res_png = engine.execute(ctx_png)
    assert res_png.status == EngineExecutionStatus.NOT_APPLICABLE
    assert "not supported" in res_png.summary.lower()
    assert res_png.inapplicability_data is not None
    assert "CRITICAL FORENSIC NOTICE" in res_png.inapplicability_data["notice"]
    assert "authenticity" in res_png.inapplicability_data["notice"].lower()
    assert len(res_png.observations) == 0

    # 2. WebP
    ctx_webp = ExecutionContext(
        evidence_id=402,
        stored_path=CLEAN_WEBP,
        sha256_hash="webp_hash",
        mime_type="image/webp",
        image_format="WEBP",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )
    res_webp = engine.execute(ctx_webp)
    assert res_webp.status == EngineExecutionStatus.NOT_APPLICABLE
    assert "not supported" in res_webp.summary.lower()
    assert res_webp.inapplicability_data is not None


@pytest.mark.parametrize("engine_cls", [JPEGStructureEngine, JPEGQuantizationTableEngine, JPEGHuffmanEngine])
def test_zero_byte_handling(tmp_path, engine_cls):
    """Verify zero-byte inputs fail gracefully without unhandled exceptions."""
    engine = engine_cls()
    ctx = ExecutionContext(
        evidence_id=403,
        stored_path=ZERO_BYTE,
        sha256_hash="zero_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )
    res = engine.execute(ctx)
    assert res.status == EngineExecutionStatus.FAILED
    assert "zero" in res.summary.lower() or "soi" in res.summary.lower()


# ============================================================
# 6. DETERMINISM VERIFICATION (RUN 1 == RUN 2 == RUN 3)
# ============================================================

def test_three_run_determinism(tmp_path):
    """Verify all 3 engines produce strictly deterministic outputs across 3 consecutive runs."""
    engines = [
        JPEGStructureEngine(),
        JPEGQuantizationTableEngine(),
        JPEGHuffmanEngine(),
    ]

    for eng in engines:
        ctx = ExecutionContext(
            evidence_id=500,
            stored_path=CLEAN_JPG,
            sha256_hash="det_hash",
            mime_type="image/jpeg",
            image_format="JPEG",
            width=100,
            height=100,
            storage_output_dir=str(tmp_path / eng.engine_id),
        )

        res1 = eng.execute(ctx)
        res2 = eng.execute(ctx)
        res3 = eng.execute(ctx)

        # Observations must be strictly identical
        assert res1.observations[0].metric_name == res2.observations[0].metric_name == res3.observations[0].metric_name
        assert res1.observations[0].raw_value == res2.observations[0].raw_value == res3.observations[0].raw_value
        assert res1.observations[0].direction == res2.observations[0].direction == res3.observations[0].direction
        assert res1.observations[0].result_data == res2.observations[0].result_data == res3.observations[0].result_data

        # Structured findings must be strictly identical
        assert res1.structured_findings == res2.structured_findings == res3.structured_findings

        # Artifact SHA-256 digests must be strictly identical
        assert res1.artifacts[0].sha256_hash == res2.artifacts[0].sha256_hash == res3.artifacts[0].sha256_hash


# ============================================================
# 7. REGISTRY, RUNNER & API INTEGRATION
# ============================================================

def test_engine_registry_contains_new_engines():
    """Verify engine_registry registers all 3 new engines alongside legacy adapters."""
    all_engines = engine_registry.list_engines()
    ids = {e.engine_id for e in all_engines}
    assert "JPEG-STRUCTURE" in ids
    assert "JPEG-QT" in ids
    assert "JPEG-HUFFMAN" in ids
    assert "METADATA" in ids
    assert "ELA" in ids


def test_v4_runner_db_lifecycle_and_observation_persistence(db_session: Session):
    """Verify V4EngineRunner creates Analysis, persists EvidenceObservation records, and saves artifacts."""
    # Create test user, case, and evidence
    user = User(username="test_v4_step2_analyst", hashed_password="pw", role="INVESTIGATOR")
    db_session.add(user)
    db_session.commit()

    case = InvestigationCase(case_identifier="FS-CASE-2026-STEP2", title="Step 2 Case", user_id=user.id)
    db_session.add(case)
    db_session.commit()

    evidence = Evidence(
        case_id=case.id,
        evidence_identifier="FS-EV-2026-STEP2-001",
        original_filename="clean_reference.jpg",
        stored_path=CLEAN_JPG,
        sha256_hash="mocksha256clean",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
    )
    db_session.add(evidence)
    db_session.commit()

    # Run JPEG-STRUCTURE via V4EngineRunner
    analysis_struct = V4EngineRunner.run_engine(db_session, evidence.id, "JPEG-STRUCTURE")
    assert analysis_struct.status == "completed"
    assert analysis_struct.analysis_type == "JPEG_STRUCTURE"
    assert "artifacts" in analysis_struct.structured_findings
    assert any("jpeg_structure" in k for k in analysis_struct.structured_findings["artifacts"])

    # Run JPEG-QT via V4EngineRunner
    analysis_qt = V4EngineRunner.run_engine(db_session, evidence.id, "JPEG-QT")
    assert analysis_qt.status == "completed"
    assert analysis_qt.analysis_type == "JPEG_QT"
    assert "table_count" in analysis_qt.structured_findings

    # Run JPEG-HUFFMAN via V4EngineRunner
    analysis_huff = V4EngineRunner.run_engine(db_session, evidence.id, "JPEG-HUFFMAN")
    assert analysis_huff.status == "completed"
    assert analysis_huff.analysis_type == "JPEG_HUFFMAN"
    assert "total_tables" in analysis_huff.structured_findings


def test_api_endpoints_triggering_and_artifact_serving(client: TestClient, db_session: Session):
    """Verify HTTP POST endpoints for the 3 engines and subsequent authenticated GET /artifacts serving."""
    # Create test user, case, evidence
    user = User(username="api_analyst_step2", hashed_password="pw", role="ADMIN")
    db_session.add(user)
    db_session.commit()

    case = InvestigationCase(case_identifier="FS-CASE-2026-API", title="API Case", user_id=user.id)
    db_session.add(case)
    db_session.commit()

    evidence = Evidence(
        case_id=case.id,
        evidence_identifier="FS-EV-2026-API-001",
        original_filename="clean_reference.jpg",
        stored_path=CLEAN_JPG,
        sha256_hash="mocksha256api",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
    )
    db_session.add(evidence)
    db_session.commit()

    # 1. Trigger JPEG-STRUCTURE
    res_struct = client.post(f"/api/evidence/{evidence.id}/analysis/jpeg-structure")
    assert res_struct.status_code == 200
    data_struct = res_struct.json()
    assert data_struct["status"] == "completed"
    art_path = list(data_struct["structured_findings"]["artifacts"].values())[0]

    # 2. Fetch created JSON artifact via GET /api/artifacts/{path}
    res_art = client.get(f"/api/artifacts/{art_path}")
    assert res_art.status_code == 200
    assert res_art.headers["content-type"] == "application/json"
    art_body = res_art.json()
    assert art_body["engine_id"] == "JPEG-STRUCTURE"

    # 3. Path traversal attack rejection on /api/artifacts/
    res_traversal = client.get(f"/api/artifacts/..%2f..%2fetc/passwd")
    assert res_traversal.status_code in (400, 403, 404)

    # 4. Trigger JPEG-QT
    res_qt = client.post(f"/api/evidence/{evidence.id}/analysis/jpeg-qt")
    assert res_qt.status_code == 200
    assert res_qt.json()["status"] == "completed"

    # 5. Trigger JPEG-HUFFMAN
    res_huff = client.post(f"/api/evidence/{evidence.id}/analysis/jpeg-huffman")
    assert res_huff.status_code == 200
    assert res_huff.json()["status"] == "completed"


def test_api_png_inapplicability_returns_not_applicable(client: TestClient, db_session: Session):
    """Verify calling API on PNG evidence returns not_applicable status with guardrail."""
    user = User(username="api_png_tester", hashed_password="pw", role="ADMIN")
    db_session.add(user)
    db_session.commit()

    case = InvestigationCase(case_identifier="FS-CASE-2026-PNG", title="PNG Case", user_id=user.id)
    db_session.add(case)
    db_session.commit()

    evidence_png = Evidence(
        case_id=case.id,
        evidence_identifier="FS-EV-2026-PNG-001",
        original_filename="clean_reference.png",
        stored_path=CLEAN_PNG,
        sha256_hash="mocksha256png",
        mime_type="image/png",
        image_format="PNG",
        width=100,
        height=100,
    )
    db_session.add(evidence_png)
    db_session.commit()

    res = client.post(f"/api/evidence/{evidence_png.id}/analysis/jpeg-structure")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "not_applicable"
    assert "not supported" in data["summary"].lower()
    assert data["structured_findings"]["not_applicable"] is True
    assert "CRITICAL FORENSIC NOTICE" in data["structured_findings"]["guardrail"]["notice"]
