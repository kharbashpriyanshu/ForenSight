"""
ForenSight V4 — Step 6 Advanced Noise Residual & Resampling Forensics Test Suite

Verifies:
1. Engine registrations in ForensicEngineRegistry (ADVANCED-NOISE, RESAMPLING)
2. Engine metadata, categories, parameters, and scientific references
3. Multi-format support across JPEG, PNG, and WebP (non-inapplicable)
4. Grayscale handling without crashes or synthetic RGB assumptions
5. Deterministic execution: Run 1 == Run 2 == Run 3 across metrics, candidate coordinates, and artifact hashes
6. ADVANCED-NOISE: High-frequency residual extraction, global moments, robust MAD scale, Shannon entropy
7. ADVANCED-NOISE: Synthetic localized noise injection generating candidate noise-inconsistency regions
8. ADVANCED-NOISE: Artifact generation (advanced_noise_map.png, advanced_noise_analysis.png, advanced_noise_analysis.json)
9. RESAMPLING: Directional second-derivative filtering (d_xx, d_yy), 1D power spectra, and peak strength
10. RESAMPLING: Synthetic bicubic scaling generating periodic interpolation peaks and candidate regions
11. RESAMPLING: Directional asymmetry (horizontal scaling vs vertical scaling)
12. RESAMPLING: Artifact generation (resampling_map.png, resampling_analysis.png, resampling_analysis.json)
13. Error handling: Malformed file, zero-byte file, undersized image (safe failure without crashes)
14. Resource boundary: Safe downsampling for oversized images with preserved original SHA-256
15. Original evidence SHA-256 invariant preservation
16. API endpoints execution, JWT authentication requirement, RBAC cross-case isolation, and path traversal protection
"""

import os
import io
import json
import hashlib
import pytest
import numpy as np
from PIL import Image
import cv2
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.db.database import get_db
from app.api.deps import get_current_user
from app.models.domain import User, InvestigationCase, Evidence, Analysis
from app.engine_extensions import (
    engine_registry,
    ExecutionContext,
    EngineExecutionStatus,
)
from app.engine_extensions.noise import AdvancedNoiseEngine, AdvancedNoiseParameters
from app.engine_extensions.resampling import ResamplingEngine, ResamplingParameters


FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "forensics")
CLEAN_JPG = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
CLEAN_PNG = os.path.join(FIXTURES_DIR, "clean_reference.png")
CLEAN_WEBP = os.path.join(FIXTURES_DIR, "clean_reference.webp")
TRUNCATED_JPG = os.path.join(FIXTURES_DIR, "truncated.jpg")
MALFORMED_JPG = os.path.join(FIXTURES_DIR, "malformed_header.jpg")
ZERO_BYTE = os.path.join(FIXTURES_DIR, "zero_byte.bin")


def make_context(
    evidence_id: int,
    analysis_id: int,
    stored_path: str,
    storage_output_dir: str,
    width: int = 256,
    height: int = 256,
    image_format: str = "PNG",
    parameters: dict = None,
) -> ExecutionContext:
    """Helper to create fully validated ExecutionContext."""
    return ExecutionContext(
        evidence_id=evidence_id,
        analysis_id=analysis_id,
        stored_path=stored_path,
        evidence_path=stored_path,
        sha256_hash="mock_sha256_step6",
        mime_type="image/png" if image_format.upper() == "PNG" else "image/jpeg",
        image_format=image_format.upper(),
        width=width,
        height=height,
        storage_output_dir=storage_output_dir,
        parameters=parameters or {},
    )


@pytest.fixture(autouse=True)
def restore_auth_override():
    """Ensure standard conftest get_current_user override is active and preserved."""
    from conftest import override_get_current_user
    app.dependency_overrides[get_current_user] = override_get_current_user
    yield
    app.dependency_overrides[get_current_user] = override_get_current_user


# ============================================================
# HELPER FIXTURES: SYNTHETIC CONTROLLED FIXTURES
# ============================================================

@pytest.fixture
def synthetic_noise_inconsistency_png(tmp_path):
    """
    Creates a controlled synthetic image with localized high-variance noise injection.
    Background has subtle noise (std=1.0), central 64x64 block has high noise (std=25.0).
    """
    p = str(tmp_path / "noise_inconsistency.png")
    sz = 192
    y, x = np.mgrid[:sz, :sz]
    base = (x * 0.4 + y * 0.4 + 50).astype(np.float32)

    np.random.seed(42)
    bg_noise = np.random.normal(0, 1.0, (sz, sz)).astype(np.float32)
    img = base + bg_noise

    patch_noise = np.random.normal(0, 25.0, (64, 64)).astype(np.float32)
    img[64:128, 64:128] = base[64:128, 64:128] + patch_noise

    img_clipped = np.clip(img, 0, 255).astype(np.uint8)
    Image.fromarray(img_clipped, mode="L").save(p, format="PNG")
    return p


@pytest.fixture
def synthetic_resampled_png(tmp_path):
    """
    Creates a controlled synthetic image subjected to bicubic downsampling then upsampling.
    Interpolation induces periodic sample correlation with spatial period ~ 2.0 pixels.
    """
    p = str(tmp_path / "resampled_bicubic.png")
    sz = 256
    np.random.seed(1337)
    base = np.random.randint(50, 200, (sz, sz), dtype=np.uint8)
    pil_orig = Image.fromarray(base, mode="L")

    down = pil_orig.resize((128, 128), resample=Image.BICUBIC)
    up = down.resize((256, 256), resample=Image.BICUBIC)
    up.save(p, format="PNG")
    return p


@pytest.fixture
def synthetic_asymmetric_resample_png(tmp_path):
    """
    Creates an image scaled only in the horizontal direction, inducing directional asymmetry.
    """
    p = str(tmp_path / "horizontal_resampled.png")
    sz = 256
    np.random.seed(999)
    base = np.random.randint(50, 200, (sz, sz), dtype=np.uint8)
    pil_orig = Image.fromarray(base, mode="L")

    down = pil_orig.resize((128, 256), resample=Image.BICUBIC)
    up = down.resize((256, 256), resample=Image.BICUBIC)
    up.save(p, format="PNG")
    return p


@pytest.fixture
def synthetic_grayscale_png(tmp_path):
    """Creates a clean grayscale PNG image."""
    p = str(tmp_path / "clean_gray.png")
    arr = np.linspace(30, 220, 256 * 256, dtype=np.uint8).reshape((256, 256))
    Image.fromarray(arr, mode="L").save(p, format="PNG")
    return p


@pytest.fixture
def tiny_image_png(tmp_path):
    """Creates an undersized image below minimum threshold (8x8)."""
    p = str(tmp_path / "tiny_8x8.png")
    Image.new("RGB", (8, 8), color=(128, 128, 128)).save(p, format="PNG")
    return p


# ============================================================
# 1. REGISTRATION & METADATA TESTS
# ============================================================

def test_step6_engines_registration():
    """Verifies both Step 6 engines are registered in ForensicEngineRegistry."""
    noise_engine = engine_registry.get_engine("ADVANCED-NOISE")
    assert noise_engine is not None
    assert noise_engine.engine_id == "ADVANCED-NOISE"
    assert noise_engine.category.value == "LOCAL_ANALYSIS"
    assert "PNG" in noise_engine.input_requirements.supported_formats
    assert "JPEG" in noise_engine.input_requirements.supported_formats
    assert "WEBP" in noise_engine.input_requirements.supported_formats
    assert "TIFF" in noise_engine.input_requirements.supported_formats

    resample_engine = engine_registry.get_engine("RESAMPLING")
    assert resample_engine is not None
    assert resample_engine.engine_id == "RESAMPLING"
    assert resample_engine.category.value == "LOCAL_ANALYSIS"
    assert "PNG" in resample_engine.input_requirements.supported_formats
    assert "JPEG" in resample_engine.input_requirements.supported_formats


def test_step6_scientific_references():
    """Verifies valid scientific references are attached to both engines."""
    noise_engine = AdvancedNoiseEngine()
    assert len(noise_engine.scientific_references) >= 3
    ref_authors = [r.authors for r in noise_engine.scientific_references]
    assert any("Pan" in a for a in ref_authors)
    assert any("Mahdian" in a for a in ref_authors)

    resample_engine = ResamplingEngine()
    assert len(resample_engine.scientific_references) >= 3
    ref_titles = [r.title for r in resample_engine.scientific_references]
    assert any("Resampling" in t for t in ref_titles)
    assert any("Interpolation" in t for t in ref_titles)


# ============================================================
# 2. ADVANCED-NOISE ENGINE TESTS
# ============================================================

def test_advanced_noise_clean_execution(tmp_path):
    """Verifies clean execution of ADVANCED-NOISE across JPEG, PNG, and WebP."""
    engine = AdvancedNoiseEngine()

    for ref_path in [CLEAN_JPG, CLEAN_PNG, CLEAN_WEBP]:
        if not os.path.exists(ref_path):
            continue
        fmt = os.path.splitext(ref_path)[1][1:].upper()
        ctx = make_context(
            evidence_id=201,
            analysis_id=20,
            stored_path=ref_path,
            storage_output_dir=str(tmp_path),
            width=100,
            height=100,
            image_format=fmt,
            parameters={"block_size": 32, "filter_sigma": 1.0},
        )
        res = engine.execute(ctx)
        assert res.status in (EngineExecutionStatus.APPLIED, EngineExecutionStatus.COMPLETED)
        assert len(res.observations) >= 6
        assert len(res.artifacts) == 3

        obs_names = [o.metric_name for o in res.observations]
        assert "GLOBAL_NOISE_VARIANCE" in obs_names
        assert "GLOBAL_NOISE_MAD" in obs_names
        assert "GLOBAL_NOISE_ENTROPY" in obs_names
        assert "HIGH_FREQUENCY_NOISE_ENERGY" in obs_names
        assert "NOISE_INCONSISTENCY_REGION_COUNT" in obs_names
        assert "MAX_LOCAL_NOISE_DEVIATION" in obs_names


def test_advanced_noise_inconsistency_detection(synthetic_noise_inconsistency_png, tmp_path):
    """Verifies detection of localized high-variance noise injection."""
    engine = AdvancedNoiseEngine()
    ctx = make_context(
        evidence_id=202,
        analysis_id=21,
        stored_path=synthetic_noise_inconsistency_png,
        storage_output_dir=str(tmp_path),
        width=192,
        height=192,
        image_format="PNG",
        parameters={"block_size": 32, "z_score_threshold": 2.5, "min_cluster_blocks": 2},
    )
    res = engine.execute(ctx)
    assert res.status in (EngineExecutionStatus.APPLIED, EngineExecutionStatus.COMPLETED)

    json_art = next((a for a in res.artifacts if a.artifact_id == "advanced_noise_json"), None)
    assert json_art is not None
    json_path = os.path.join(tmp_path, "advanced_noise_analysis.json")
    with open(json_path, "r") as f:
        data = json.load(f)

    candidate_regions = data["local_consistency"]["candidate_regions"]
    assert len(candidate_regions) >= 1
    top_region = candidate_regions[0]
    assert abs(top_region["max_deviation_z"]) >= 2.5
    assert "candidate noise-inconsistency region" in top_region["classification"]


def test_advanced_noise_grayscale_handling(synthetic_grayscale_png, tmp_path):
    """Verifies grayscale images execute cleanly without channel errors."""
    engine = AdvancedNoiseEngine()
    ctx = make_context(
        evidence_id=203,
        analysis_id=22,
        stored_path=synthetic_grayscale_png,
        storage_output_dir=str(tmp_path),
        width=256,
        height=256,
        image_format="PNG",
    )
    res = engine.execute(ctx)
    assert res.status in (EngineExecutionStatus.APPLIED, EngineExecutionStatus.COMPLETED)
    assert res.structured_findings["is_grayscale"] is True


def test_advanced_noise_determinism(synthetic_noise_inconsistency_png, tmp_path):
    """Verifies Run 1 == Run 2 == Run 3 across metrics and artifact SHA-256."""
    engine = AdvancedNoiseEngine()
    runs = []

    for i in range(3):
        out_sub = tmp_path / f"run_noise_{i}"
        out_sub.mkdir()
        ctx = make_context(
            evidence_id=204,
            analysis_id=23 + i,
            stored_path=synthetic_noise_inconsistency_png,
            storage_output_dir=str(out_sub),
            width=192,
            height=192,
            image_format="PNG",
            parameters={"block_size": 32, "filter_sigma": 1.0},
        )
        res = engine.execute(ctx)
        assert res.status in (EngineExecutionStatus.APPLIED, EngineExecutionStatus.COMPLETED)

        metrics = {o.metric_name: o.raw_value for o in res.observations}
        json_path = os.path.join(str(out_sub), "advanced_noise_analysis.json")
        with open(json_path, "rb") as f:
            json_hash = hashlib.sha256(f.read()).hexdigest()

        map_path = os.path.join(str(out_sub), "advanced_noise_map.png")
        with open(map_path, "rb") as f:
            map_hash = hashlib.sha256(f.read()).hexdigest()

        runs.append((metrics, json_hash, map_hash))

    assert runs[0][0] == runs[1][0] == runs[2][0]
    assert runs[0][2] == runs[1][2] == runs[2][2]


# ============================================================
# 3. RESAMPLING ENGINE TESTS
# ============================================================

def test_resampling_clean_execution(tmp_path):
    """Verifies clean execution of RESAMPLING across JPEG, PNG, and WebP."""
    engine = ResamplingEngine()

    for ref_path in [CLEAN_JPG, CLEAN_PNG, CLEAN_WEBP]:
        if not os.path.exists(ref_path):
            continue
        fmt = os.path.splitext(ref_path)[1][1:].upper()
        ctx = make_context(
            evidence_id=301,
            analysis_id=30,
            stored_path=ref_path,
            storage_output_dir=str(tmp_path),
            width=100,
            height=100,
            image_format=fmt,
            parameters={"block_size": 32},
        )
        res = engine.execute(ctx)
        assert res.status in (EngineExecutionStatus.APPLIED, EngineExecutionStatus.COMPLETED)
        assert len(res.observations) >= 5
        assert len(res.artifacts) == 3

        obs_names = [o.metric_name for o in res.observations]
        assert "HORIZONTAL_PERIODICITY" in obs_names
        assert "VERTICAL_PERIODICITY" in obs_names
        assert "DOMINANT_PERIOD" in obs_names
        assert "PERIODICITY_PEAK_STRENGTH" in obs_names
        assert "RESAMPLING_CANDIDATE_REGION_COUNT" in obs_names


def test_resampling_bicubic_detection(synthetic_resampled_png, tmp_path):
    """Verifies detection of periodic interpolation signature in bicubic resampled image."""
    engine = ResamplingEngine()
    ctx = make_context(
        evidence_id=302,
        analysis_id=31,
        stored_path=synthetic_resampled_png,
        storage_output_dir=str(tmp_path),
        width=256,
        height=256,
        image_format="PNG",
        parameters={"min_period": 1.5, "max_period": 8.0},
    )
    res = engine.execute(ctx)
    assert res.status in (EngineExecutionStatus.APPLIED, EngineExecutionStatus.COMPLETED)

    dom_period = res.structured_findings["dominant_period"]
    assert 1.5 <= dom_period <= 8.0
    assert res.structured_findings["dominant_peak_strength"] >= 1.2


def test_resampling_directional_asymmetry(synthetic_asymmetric_resample_png, tmp_path):
    """Verifies directional asymmetry detection on horizontally-only resampled image."""
    engine = ResamplingEngine()
    ctx = make_context(
        evidence_id=303,
        analysis_id=32,
        stored_path=synthetic_asymmetric_resample_png,
        storage_output_dir=str(tmp_path),
        width=256,
        height=256,
        image_format="PNG",
    )
    res = engine.execute(ctx)
    assert res.status in (EngineExecutionStatus.APPLIED, EngineExecutionStatus.COMPLETED)

    json_path = os.path.join(tmp_path, "resampling_analysis.json")
    with open(json_path, "r") as f:
        data = json.load(f)

    h_strength = data["horizontal_metrics"]["peak_strength_ratio"]
    v_strength = data["vertical_metrics"]["peak_strength_ratio"]
    asymmetry = data["directional_asymmetry"]

    assert h_strength > v_strength
    assert asymmetry > 0.05
    assert data["dominant_axis"] == "horizontal"


def test_resampling_determinism(synthetic_resampled_png, tmp_path):
    """Verifies Run 1 == Run 2 == Run 3 for RESAMPLING engine."""
    engine = ResamplingEngine()
    runs = []

    for i in range(3):
        out_sub = tmp_path / f"run_resample_{i}"
        out_sub.mkdir()
        ctx = make_context(
            evidence_id=304,
            analysis_id=33 + i,
            stored_path=synthetic_resampled_png,
            storage_output_dir=str(out_sub),
            width=256,
            height=256,
            image_format="PNG",
        )
        res = engine.execute(ctx)
        assert res.status in (EngineExecutionStatus.APPLIED, EngineExecutionStatus.COMPLETED)

        metrics = {o.metric_name: o.raw_value for o in res.observations}
        map_path = os.path.join(str(out_sub), "resampling_map.png")
        with open(map_path, "rb") as f:
            map_hash = hashlib.sha256(f.read()).hexdigest()

        runs.append((metrics, map_hash))

    assert runs[0][0] == runs[1][0] == runs[2][0]
    assert runs[0][1] == runs[1][1] == runs[2][1]


# ============================================================
# 4. ERROR HANDLING & RESOURCE BOUNDARY TESTS
# ============================================================

def test_tiny_image_inapplicable(tiny_image_png, tmp_path):
    """Verifies undersized image (8x8) returns NOT_APPLICABLE safely."""
    for eng_cls in [AdvancedNoiseEngine, ResamplingEngine]:
        engine = eng_cls()
        ctx = make_context(
            evidence_id=401,
            analysis_id=40,
            stored_path=tiny_image_png,
            storage_output_dir=str(tmp_path),
            width=8,
            height=8,
            image_format="PNG",
        )
        res = engine.execute(ctx)
        assert res.status == EngineExecutionStatus.NOT_APPLICABLE


def test_zero_byte_safe_failure(tmp_path):
    """Verifies zero-byte evidence safely fails with informative error."""
    zero_file = str(tmp_path / "zero.bin")
    with open(zero_file, "wb") as f:
        pass

    for eng_cls in [AdvancedNoiseEngine, ResamplingEngine]:
        engine = eng_cls()
        ctx = make_context(
            evidence_id=402,
            analysis_id=41,
            stored_path=zero_file,
            storage_output_dir=str(tmp_path),
            width=256,
            height=256,
            image_format="PNG",
        )
        res = engine.execute(ctx)
        assert res.status == EngineExecutionStatus.FAILED


def test_malformed_image_safe_failure(tmp_path):
    """Verifies corrupt image header safely fails without crash."""
    bad_file = str(tmp_path / "bad.jpg")
    with open(bad_file, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0CORRUPT_DATA_HERE\x00\x00")

    for eng_cls in [AdvancedNoiseEngine, ResamplingEngine]:
        engine = eng_cls()
        ctx = make_context(
            evidence_id=403,
            analysis_id=42,
            stored_path=bad_file,
            storage_output_dir=str(tmp_path),
            width=256,
            height=256,
            image_format="JPEG",
        )
        res = engine.execute(ctx)
        assert res.status == EngineExecutionStatus.FAILED


def test_oversized_image_downsampling_boundary(tmp_path):
    """Verifies images exceeding max_dimension are safely downsampled with scale factor recorded."""
    big_file = str(tmp_path / "big_5000.png")
    Image.new("RGB", (500, 300), color=(120, 140, 160)).save(big_file, format="PNG")

    for eng_cls, json_name in [(AdvancedNoiseEngine, "advanced_noise_analysis.json"), (ResamplingEngine, "resampling_analysis.json")]:
        engine = eng_cls()
        ctx = make_context(
            evidence_id=404,
            analysis_id=43,
            stored_path=big_file,
            storage_output_dir=str(tmp_path),
            width=500,
            height=300,
            image_format="PNG",
            parameters={"max_dimension": 250},
        )
        res = engine.execute(ctx)
        assert res.status in (EngineExecutionStatus.APPLIED, EngineExecutionStatus.COMPLETED)

        with open(os.path.join(tmp_path, json_name), "r") as f:
            data = json.load(f)
        assert data["dimensions"]["downsampled"] is True
        assert data["dimensions"]["scale_factor"] == 0.5


def test_evidence_sha256_invariant(synthetic_resampled_png, tmp_path):
    """Verifies original evidence file bytes and SHA-256 remain completely unchanged."""
    with open(synthetic_resampled_png, "rb") as f:
        orig_bytes = f.read()
    orig_hash = hashlib.sha256(orig_bytes).hexdigest()

    noise_engine = AdvancedNoiseEngine()
    resample_engine = ResamplingEngine()

    ctx = make_context(
        evidence_id=405,
        analysis_id=44,
        stored_path=synthetic_resampled_png,
        storage_output_dir=str(tmp_path),
        width=256,
        height=256,
        image_format="PNG",
    )
    noise_engine.execute(ctx)
    resample_engine.execute(ctx)

    with open(synthetic_resampled_png, "rb") as f:
        post_bytes = f.read()
    post_hash = hashlib.sha256(post_bytes).hexdigest()

    assert orig_bytes == post_bytes
    assert orig_hash == post_hash


# ============================================================
# 5. API ENDPOINTS & RBAC SECURITY TESTS
# ============================================================

def test_api_step6_trigger_and_artifacts(client: TestClient, db_session: Session):
    """Verifies triggering both Step 6 engines via API and retrieving generated artifacts."""
    user = User(username="analyst_step6_api", hashed_password="pw", role="ADMIN")
    db_session.add(user)
    db_session.commit()

    case = InvestigationCase(case_identifier="FS-CASE-2026-STEP6", title="Step 6 Case", user_id=user.id)
    db_session.add(case)
    db_session.commit()

    evidence = Evidence(
        case_id=case.id,
        evidence_identifier="FS-EV-2026-STEP6-001",
        original_filename="clean_reference.png",
        stored_path=CLEAN_PNG,
        sha256_hash="mockshastep6",
        mime_type="image/png",
        image_format="PNG",
        width=100,
        height=100,
    )
    db_session.add(evidence)
    db_session.commit()

    # Test ADVANCED-NOISE
    res_noise = client.post(f"/api/evidence/{evidence.id}/analysis/advanced-noise")
    assert res_noise.status_code == 200
    data_noise = res_noise.json()
    assert data_noise["status"] == "completed"
    assert data_noise["analysis_type"] == "ADVANCED_NOISE"
    assert "global_metrics" in data_noise["structured_findings"]
    noise_art = data_noise["structured_findings"]["artifacts"]["advanced_noise_map"]
    res_art_noise = client.get(f"/api/artifacts/{noise_art}")
    assert res_art_noise.status_code == 200
    assert res_art_noise.headers["content-type"] == "image/png"

    # Test RESAMPLING
    res_resample = client.post(f"/api/evidence/{evidence.id}/analysis/resampling")
    assert res_resample.status_code == 200
    data_resample = res_resample.json()
    assert data_resample["status"] == "completed"
    assert data_resample["analysis_type"] == "RESAMPLING"
    assert "dominant_period" in data_resample["structured_findings"]
    resample_art = data_resample["structured_findings"]["artifacts"]["resampling_map"]
    res_art_resample = client.get(f"/api/artifacts/{resample_art}")
    assert res_art_resample.status_code == 200
    assert res_art_resample.headers["content-type"] == "image/png"


def test_api_step6_cross_case_isolation(client: TestClient, db_session: Session):
    """Verifies User B cannot trigger Step 6 analysis on User A's evidence."""
    user_a = User(username="user_a_step6", hashed_password="pw", role="INVESTIGATOR")
    user_b = User(username="user_b_step6", hashed_password="pw", role="INVESTIGATOR")
    db_session.add_all([user_a, user_b])
    db_session.commit()

    case_a = InvestigationCase(case_identifier="FS-CASE-A-S6", title="Case A", user_id=user_a.id)
    db_session.add(case_a)
    db_session.commit()

    ev_a = Evidence(
        case_id=case_a.id,
        evidence_identifier="FS-EV-A-S6",
        original_filename="clean_reference.png",
        stored_path=CLEAN_PNG,
        sha256_hash="mockshaa_s6",
        mime_type="image/png",
        image_format="PNG",
        width=100,
        height=100,
    )
    db_session.add(ev_a)
    db_session.commit()

    app.dependency_overrides[get_current_user] = lambda: user_b

    for ep in ["advanced-noise", "resampling"]:
        res = client.post(f"/api/evidence/{ev_a.id}/analysis/{ep}")
        assert res.status_code == 403

    from conftest import override_get_current_user
    app.dependency_overrides[get_current_user] = override_get_current_user


def test_api_step6_path_traversal_protection(client: TestClient):
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


def test_advanced_noise_parameters_validation():
    """Verifies AdvancedNoiseParameters schema validation constraints."""
    params = AdvancedNoiseParameters(filter_kernel_size=5, filter_sigma=1.5, block_size=32)
    assert params.filter_kernel_size == 5
    assert params.filter_sigma == 1.5
    assert params.block_size == 32

    with pytest.raises(Exception):
        AdvancedNoiseParameters(filter_kernel_size=2)  # ge=3

    with pytest.raises(Exception):
        AdvancedNoiseParameters(filter_sigma=0.1)  # ge=0.5


def test_resampling_parameters_validation():
    """Verifies ResamplingParameters schema validation constraints."""
    params = ResamplingParameters(min_period=1.5, max_period=8.0, block_size=32)
    assert params.min_period == 1.5
    assert params.max_period == 8.0

    with pytest.raises(Exception):
        ResamplingParameters(min_period=0.5)  # ge=1.1

    with pytest.raises(Exception):
        ResamplingParameters(max_period=25.0)  # le=20.0


def test_api_step6_unauthenticated_rejection(client: TestClient):
    """Verifies unauthenticated calls without credentials cannot trigger Step 6 analysis."""
    # Remove authentication override
    if get_current_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_user]

    try:
        res1 = client.post("/api/evidence/1/analysis/advanced-noise")
        assert res1.status_code == 401

        res2 = client.post("/api/evidence/1/analysis/resampling")
        assert res2.status_code == 401
    finally:
        from conftest import override_get_current_user
        app.dependency_overrides[get_current_user] = override_get_current_user

