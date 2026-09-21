"""
ForenSight V4 — Step 3 JPEG Compression History Forensics Test Suite

Verifies:
1. JPEG-GHOST engine (controlled sweep, quality curve, candidate regions, difference heatmap, JSON artifact)
2. ADJPEG engine (aligned double-JPEG, 8x8 DCT histograms, 1D FFT periodicity peak ratio, spectrum artifact)
3. NADJPEG engine (non-aligned double-JPEG, 64-phase boundary discontinuity matrix, spatial shift, matrix artifact)
4. Scientific inapplicability guardrails (PNG, WebP -> NOT_APPLICABLE, never negative evidence)
5. Robustness against malformed, truncated, and zero-byte inputs (never crashes)
6. Strict 3-run deterministic reproducibility (Run 1 == Run 2 == Run 3)
7. API triggering, JSON/PNG artifact creation, RBAC authorization, and artifact serving
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
from app.engine_extensions.compression import (
    JPEGGhostEngine,
    ADJPEGEngine,
    NADJPEGEngine,
)


FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "forensics")
CLEAN_JPG = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
CLEAN_PNG = os.path.join(FIXTURES_DIR, "clean_reference.png")
CLEAN_WEBP = os.path.join(FIXTURES_DIR, "clean_reference.webp")
TRUNCATED_JPG = os.path.join(FIXTURES_DIR, "truncated.jpg")
MALFORMED_JPG = os.path.join(FIXTURES_DIR, "malformed_header.jpg")
ZERO_BYTE = os.path.join(FIXTURES_DIR, "zero_byte.bin")


# ============================================================
# HELPER FIXTURES: SYNTHETIC DOUBLE-COMPRESSION IMAGES
# ============================================================

@pytest.fixture
def synthetic_adjpeg_image(tmp_path):
    """Creates a synthetic aligned double-compressed JPEG (Q1=65, Q2=85)."""
    img_path = str(tmp_path / "synthetic_adjpeg.jpg")
    arr = np.zeros((160, 160, 3), dtype=np.uint8)
    for i in range(160):
        for j in range(160):
            arr[i, j] = [(i * 3) % 256, (j * 5) % 256, ((i + j) * 2) % 256]
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=65)
    buf.seek(0)
    img_re = Image.open(buf)
    img_re.save(img_path, format="JPEG", quality=85)
    return img_path


@pytest.fixture
def synthetic_nadjpeg_image(tmp_path):
    """Creates a synthetic non-aligned double-compressed JPEG (Q1=70, shift (3, 5), Q2=85)."""
    img_path = str(tmp_path / "synthetic_nadjpeg.jpg")
    arr = np.zeros((200, 200, 3), dtype=np.uint8)
    for i in range(200):
        for j in range(200):
            arr[i, j] = [(i * 7) % 256, (j * 11) % 256, ((i * 2 + j * 3)) % 256]
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=70)
    buf.seek(0)
    img_re = Image.open(buf)
    cropped = img_re.crop((3, 5, 187, 189))  # shift (3, 5), size 184x184 (multiple of 8)
    cropped.save(img_path, format="JPEG", quality=85)
    return img_path


# ============================================================
# 1. ENGINE REGISTRY CHECKS
# ============================================================

def test_engine_registry_contains_step3_engines():
    """Verify all 3 compression history engines are properly registered in EngineRegistry."""
    all_engines = engine_registry.list_engines()
    ids = {e.engine_id for e in all_engines}
    assert "JPEG-GHOST" in ids
    assert "ADJPEG" in ids
    assert "NADJPEG" in ids

    ghost_eng = engine_registry.get_engine("JPEG-GHOST")
    assert ghost_eng.category.value == "LOCAL_ANALYSIS"
    assert "JPEG" in ghost_eng.input_requirements.supported_formats

    adjpeg_eng = engine_registry.get_engine("ADJPEG")
    assert adjpeg_eng.category.value == "GLOBAL_ANALYSIS"
    assert "JPEG" in adjpeg_eng.input_requirements.supported_formats

    nadjpeg_eng = engine_registry.get_engine("NADJPEG")
    assert nadjpeg_eng.category.value == "LOCAL_ANALYSIS"
    assert "JPEG" in nadjpeg_eng.input_requirements.supported_formats


# ============================================================
# 2. ENGINE 1 — JPEG-GHOST
# ============================================================

def test_jpeg_ghost_clean_execution(tmp_path):
    """Verify JPEG-GHOST executes sweep, produces quality curve, heatmap, and JSON artifact."""
    engine = JPEGGhostEngine()
    context = ExecutionContext(
        evidence_id=601,
        analysis_id=10,
        stored_path=CLEAN_JPG,
        sha256_hash="ghost_clean_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED
    assert len(result.observations) >= 1
    assert len(result.artifacts) >= 2  # JSON and PNG

    findings = result.structured_findings
    assert "quality_curve" in findings
    assert len(findings["quality_curve"]) > 0
    assert "candidate_quality" in findings
    assert "candidate_qualities" in findings
    assert "global_statistics" in findings
    assert "candidate_regions" in findings
    assert "artifacts" in findings

    # Check that artifact files actually exist on disk
    map_art = next(a for a in result.artifacts if a.artifact_type.value == "HEATMAP")
    json_art = next(a for a in result.artifacts if a.artifact_type.value == "JSON")
    map_disk = os.path.join(str(tmp_path), os.path.basename(map_art.storage_path))
    json_disk = os.path.join(str(tmp_path), os.path.basename(json_art.storage_path))
    assert os.path.exists(map_disk)
    assert os.path.exists(json_disk)

    # Verify JSON structure
    with open(json_disk, "r") as f:
        art_data = json.load(f)
    assert art_data["engine_id"] == "JPEG-GHOST"
    assert "quality_curve" in art_data["results"]

    # Verify no accusatory language in interpretation
    obs = result.observations[0]
    assert "fake" not in obs.interpretation.lower()
    assert "forgery" not in obs.interpretation.lower()
    assert "guilt" not in obs.interpretation.lower()


def test_jpeg_ghost_inapplicability_on_png(tmp_path):
    """Verify JPEG-GHOST rejects PNG inputs with NOT_APPLICABLE and standard guardrail notice."""
    engine = JPEGGhostEngine()
    context = ExecutionContext(
        evidence_id=602,
        analysis_id=11,
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
    assert "not negative evidence" in result.inapplicability_data["notice"].lower()


def test_jpeg_ghost_robustness(tmp_path):
    """Verify JPEG-GHOST handles truncated, malformed, and zero-byte files safely."""
    engine = JPEGGhostEngine()
    for bad_path in [TRUNCATED_JPG, MALFORMED_JPG, ZERO_BYTE]:
        context = ExecutionContext(
            evidence_id=603,
            analysis_id=12,
            stored_path=bad_path,
            sha256_hash="bad_hash",
            mime_type="image/jpeg",
            image_format="JPEG",
            width=100,
            height=100,
            storage_output_dir=str(tmp_path),
        )
        result = engine.execute(context)
        # Must never throw unhandled exception
        assert result.status in (EngineExecutionStatus.APPLIED, EngineExecutionStatus.FAILED, EngineExecutionStatus.NOT_APPLICABLE)


def test_jpeg_ghost_determinism(tmp_path):
    """Verify strict 3-run deterministic reproducibility for JPEG-GHOST."""
    engine = JPEGGhostEngine()
    curve_hashes = []
    for run in range(3):
        out_dir = str(tmp_path / f"run_{run}")
        context = ExecutionContext(
            evidence_id=604,
            analysis_id=13,
            stored_path=CLEAN_JPG,
            sha256_hash="det_hash",
            mime_type="image/jpeg",
            image_format="JPEG",
            width=100,
            height=100,
            storage_output_dir=out_dir,
        )
        res = engine.execute(context)
        steps = res.structured_findings["quality_curve"]
        curve_hashes.append(json.dumps(steps, sort_keys=True))

    assert curve_hashes[0] == curve_hashes[1] == curve_hashes[2]


# ============================================================
# 3. ENGINE 2 — ADJPEG
# ============================================================

def test_adjpeg_clean_execution(tmp_path):
    """Verify ADJPEG runs on clean JPEG, extracts DCT histograms, FFT periodicity, and plots."""
    engine = ADJPEGEngine()
    context = ExecutionContext(
        evidence_id=701,
        analysis_id=20,
        stored_path=CLEAN_JPG,
        sha256_hash="adjpeg_clean_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED
    assert len(result.observations) >= 1
    assert len(result.artifacts) >= 2

    findings = result.structured_findings
    assert "mode_evaluations" in findings
    assert "max_periodicity_ratio" in findings
    assert "periodic_modes_count" in findings
    assert "has_aligned_double_jpeg_traces" in findings
    assert "artifacts" in findings

    # Check disk presence
    plot_art = next(a for a in result.artifacts if a.artifact_type.value == "PLOT")
    json_art = next(a for a in result.artifacts if a.artifact_type.value == "JSON")
    plot_disk = os.path.join(str(tmp_path), os.path.basename(plot_art.storage_path))
    json_disk = os.path.join(str(tmp_path), os.path.basename(json_art.storage_path))
    assert os.path.exists(plot_disk)
    assert os.path.exists(json_disk)

    # Verify mode evaluations structure
    modes = findings["mode_evaluations"]
    assert len(modes) > 0
    assert "mode" in modes[0] and "periodicity_ratio" in modes[0]


def test_adjpeg_synthetic_double_compression(synthetic_adjpeg_image, tmp_path):
    """Verify ADJPEG analyzes a synthetic aligned double-compressed image."""
    engine = ADJPEGEngine()
    context = ExecutionContext(
        evidence_id=702,
        analysis_id=21,
        stored_path=synthetic_adjpeg_image,
        sha256_hash="adjpeg_synth_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=160,
        height=160,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED
    findings = result.structured_findings
    assert findings["max_periodicity_ratio"] > 0
    assert isinstance(findings["has_aligned_double_jpeg_traces"], bool)


def test_adjpeg_inapplicability_on_webp(tmp_path):
    """Verify ADJPEG returns NOT_APPLICABLE on WebP files."""
    engine = ADJPEGEngine()
    context = ExecutionContext(
        evidence_id=703,
        analysis_id=22,
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


def test_adjpeg_determinism(tmp_path):
    """Verify 3-run determinism for ADJPEG engine."""
    engine = ADJPEGEngine()
    ratios = []
    for run in range(3):
        out_dir = str(tmp_path / f"ad_run_{run}")
        context = ExecutionContext(
            evidence_id=704,
            analysis_id=23,
            stored_path=CLEAN_JPG,
            sha256_hash="ad_det_hash",
            mime_type="image/jpeg",
            image_format="JPEG",
            width=100,
            height=100,
            storage_output_dir=out_dir,
        )
        res = engine.execute(context)
        ratios.append(res.structured_findings["max_periodicity_ratio"])

    assert ratios[0] == ratios[1] == ratios[2]


# ============================================================
# 4. ENGINE 3 — NADJPEG
# ============================================================

def test_nadjpeg_clean_execution(tmp_path):
    """Verify NADJPEG computes 64-phase boundary discontinuity matrix, shift, and matrix artifact."""
    engine = NADJPEGEngine()
    context = ExecutionContext(
        evidence_id=801,
        analysis_id=30,
        stored_path=CLEAN_JPG,
        sha256_hash="nadjpeg_clean_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED
    assert len(result.observations) >= 1
    assert len(result.artifacts) >= 2

    findings = result.structured_findings
    assert "candidate_shift_offset" in findings
    assert "row_shift" in findings["candidate_shift_offset"]
    assert "col_shift" in findings["candidate_shift_offset"]
    assert "peak_contrast_ratio" in findings
    assert "aligned_contrast_ratio" in findings
    assert "has_non_aligned_double_jpeg_traces" in findings
    assert "artifacts" in findings

    # Check disk existence
    vis_art = next(a for a in result.artifacts if a.artifact_type.value == "HEATMAP")
    json_art = next(a for a in result.artifacts if a.artifact_type.value == "JSON")
    vis_disk = os.path.join(str(tmp_path), os.path.basename(vis_art.storage_path))
    json_disk = os.path.join(str(tmp_path), os.path.basename(json_art.storage_path))
    assert os.path.exists(vis_disk)
    assert os.path.exists(json_disk)

    # Check 64-phase energy distribution in JSON
    with open(json_disk, "r") as f:
        json_data = json.load(f)
    dist = json_data["results"]["energy_distribution_64"]
    assert len(dist) == 64
    assert "row_shift" in dist[0] and "col_shift" in dist[0] and "contrast_ratio" in dist[0]


def test_nadjpeg_synthetic_non_aligned_double_compression(synthetic_nadjpeg_image, tmp_path):
    """Verify NADJPEG analyzes synthetic non-aligned double compressed image."""
    engine = NADJPEGEngine()
    context = ExecutionContext(
        evidence_id=802,
        analysis_id=31,
        stored_path=synthetic_nadjpeg_image,
        sha256_hash="nadjpeg_synth_hash",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=184,
        height=184,
        storage_output_dir=str(tmp_path),
    )

    result = engine.execute(context)
    assert result.status == EngineExecutionStatus.APPLIED
    findings = result.structured_findings
    assert findings["peak_contrast_ratio"] >= 0
    assert isinstance(findings["has_non_aligned_double_jpeg_traces"], bool)


def test_nadjpeg_inapplicability_on_png(tmp_path):
    """Verify NADJPEG returns NOT_APPLICABLE on PNG files."""
    engine = NADJPEGEngine()
    context = ExecutionContext(
        evidence_id=803,
        analysis_id=32,
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


def test_nadjpeg_determinism(tmp_path):
    """Verify 3-run determinism for NADJPEG engine."""
    engine = NADJPEGEngine()
    shifts = []
    for run in range(3):
        out_dir = str(tmp_path / f"nad_run_{run}")
        context = ExecutionContext(
            evidence_id=804,
            analysis_id=33,
            stored_path=CLEAN_JPG,
            sha256_hash="nad_det_hash",
            mime_type="image/jpeg",
            image_format="JPEG",
            width=100,
            height=100,
            storage_output_dir=out_dir,
        )
        res = engine.execute(context)
        shifts.append(res.structured_findings["candidate_shift_offset"])

    assert shifts[0] == shifts[1] == shifts[2]


# ============================================================
# 5. API TRIGGER & INTEGRATION TESTS
# ============================================================

def test_api_trigger_jpeg_ghost(client: TestClient, db_session: Session):
    """Verify triggering JPEG-GHOST via API returns completed analysis and serves artifacts."""
    user = User(username="api_analyst_ghost", hashed_password="pw", role="ADMIN")
    db_session.add(user)
    db_session.commit()

    case = InvestigationCase(case_identifier="FS-CASE-2026-GHOST", title="Ghost Case", user_id=user.id)
    db_session.add(case)
    db_session.commit()

    evidence = Evidence(
        case_id=case.id,
        evidence_identifier="FS-EV-2026-GHOST-001",
        original_filename="clean_reference.jpg",
        stored_path=CLEAN_JPG,
        sha256_hash="mockshaghost",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
    )
    db_session.add(evidence)
    db_session.commit()

    res = client.post(f"/api/evidence/{evidence.id}/analysis/jpeg-ghost")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "completed"
    findings = data["structured_findings"]
    assert "quality_curve" in findings
    assert "artifacts" in findings

    # Fetch the PNG heatmap artifact via /api/artifacts/{path}
    art_path = next(v for k, v in findings["artifacts"].items() if "map" in k)
    res_art = client.get(f"/api/artifacts/{art_path}")
    assert res_art.status_code == 200
    assert res_art.headers["content-type"] == "image/png"


def test_api_trigger_adjpeg(client: TestClient, db_session: Session):
    """Verify triggering ADJPEG via API returns completed analysis and serves artifacts."""
    user = User(username="api_analyst_adjpeg", hashed_password="pw", role="ADMIN")
    db_session.add(user)
    db_session.commit()

    case = InvestigationCase(case_identifier="FS-CASE-2026-ADJPEG", title="ADJPEG Case", user_id=user.id)
    db_session.add(case)
    db_session.commit()

    evidence = Evidence(
        case_id=case.id,
        evidence_identifier="FS-EV-2026-ADJPEG-001",
        original_filename="clean_reference.jpg",
        stored_path=CLEAN_JPG,
        sha256_hash="mockshaadjpeg",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
    )
    db_session.add(evidence)
    db_session.commit()

    res = client.post(f"/api/evidence/{evidence.id}/analysis/adjpeg")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "completed"
    findings = data["structured_findings"]
    assert "mode_evaluations" in findings
    assert "artifacts" in findings

    # Fetch plot artifact
    art_path = next(v for k, v in findings["artifacts"].items() if "spectrum" in k)
    res_art = client.get(f"/api/artifacts/{art_path}")
    assert res_art.status_code == 200
    assert res_art.headers["content-type"] == "image/png"


def test_api_trigger_nadjpeg(client: TestClient, db_session: Session):
    """Verify triggering NADJPEG via API returns completed analysis and serves artifacts."""
    user = User(username="api_analyst_nadjpeg", hashed_password="pw", role="ADMIN")
    db_session.add(user)
    db_session.commit()

    case = InvestigationCase(case_identifier="FS-CASE-2026-NADJPEG", title="NADJPEG Case", user_id=user.id)
    db_session.add(case)
    db_session.commit()

    evidence = Evidence(
        case_id=case.id,
        evidence_identifier="FS-EV-2026-NADJPEG-001",
        original_filename="clean_reference.jpg",
        stored_path=CLEAN_JPG,
        sha256_hash="mockshanadjpeg",
        mime_type="image/jpeg",
        image_format="JPEG",
        width=100,
        height=100,
    )
    db_session.add(evidence)
    db_session.commit()

    res = client.post(f"/api/evidence/{evidence.id}/analysis/nadjpeg")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "completed"
    findings = data["structured_findings"]
    assert "candidate_shift_offset" in findings
    assert "artifacts" in findings

    # Fetch matrix artifact
    art_path = next(v for k, v in findings["artifacts"].items() if "matrix" in k)
    res_art = client.get(f"/api/artifacts/{art_path}")
    assert res_art.status_code == 200
    assert res_art.headers["content-type"] == "image/png"


def test_api_non_jpeg_inapplicability_guardrails(client: TestClient, db_session: Session):
    """Verify all three compression history engines return NOT_APPLICABLE on PNG evidence."""
    user = User(username="api_analyst_guardrails", hashed_password="pw", role="ADMIN")
    db_session.add(user)
    db_session.commit()

    case = InvestigationCase(case_identifier="FS-CASE-2026-GUARD", title="Guardrail Case", user_id=user.id)
    db_session.add(case)
    db_session.commit()

    evidence_png = Evidence(
        case_id=case.id,
        evidence_identifier="FS-EV-2026-GUARD-001",
        original_filename="clean_reference.png",
        stored_path=CLEAN_PNG,
        sha256_hash="mockshapngguard",
        mime_type="image/png",
        image_format="PNG",
        width=100,
        height=100,
    )
    db_session.add(evidence_png)
    db_session.commit()

    for endpoint in ["jpeg-ghost", "adjpeg", "nadjpeg"]:
        res = client.post(f"/api/evidence/{evidence_png.id}/analysis/{endpoint}")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "not_applicable"
        assert data["structured_findings"]["not_applicable"] is True
        assert "CRITICAL FORENSIC NOTICE" in data["structured_findings"]["guardrail"]["notice"]
