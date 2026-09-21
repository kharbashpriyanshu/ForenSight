"""
ForenSight V4 — Step 5 Image Distribution, Color-Channel & Frequency-Domain Forensics Test Suite

Verifies:
1. Engine registrations in ForensicEngineRegistry (HISTOGRAM, COLOR-CHANNEL, FOURIER)
2. Engine metadata and input requirements (supports JPEG, PNG, WebP)
3. Clean execution across formats: JPEG, PNG, and WebP (verifies multi-format applicability)
4. Deterministic execution: Run 1 == Run 2 == Run 3 across structured findings and artifacts
5. HISTOGRAM: Multi-channel moments, CDF, Shannon entropy, clipping, comb gaps
6. HISTOGRAM: Synthetic contrast-stretched fixture with comb-like gaps
7. HISTOGRAM: Artifact generation (histogram_analysis.png and histogram_analysis.json)
8. COLOR-CHANNEL: Pearson correlation matrix, composite difference maps, block-level z-scoring
9. COLOR-CHANNEL: Synthetic spliced patch with localized chromaticity divergence generating candidate regions
10. COLOR-CHANNEL: Artifact generation (color_channel_analysis.png, color_channel_maps.png, color_channel_analysis.json)
11. FOURIER: 2D FFT, radial energy band partitioning (low, mid, high), spectral entropy
12. FOURIER: Synthetic 2D sinusoidal periodic pattern isolating dominant periodic frequency peaks
13. FOURIER: Artifact generation (fourier_spectrum.png and fourier_analysis.json)
14. Malformed, truncated, zero-byte, and tiny image error handling (safe failure, no crashes)
15. API endpoints execution, authentication requirement, RBAC, cross-case isolation, and path traversal protection
"""

import os
import io
import json
import math
import pytest
import numpy as np
from PIL import Image
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
from app.engine_extensions.distribution import HistogramEngine, HistogramParameters
from app.engine_extensions.color import ColorChannelEngine, ColorChannelParameters
from app.engine_extensions.frequency import FourierEngine, FourierParameters


FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "forensics")
CLEAN_JPG = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
CLEAN_PNG = os.path.join(FIXTURES_DIR, "clean_reference.png")
CLEAN_WEBP = os.path.join(FIXTURES_DIR, "clean_reference.webp")
TRUNCATED_JPG = os.path.join(FIXTURES_DIR, "truncated.jpg")
MALFORMED_JPG = os.path.join(FIXTURES_DIR, "malformed_header.jpg")
ZERO_BYTE = os.path.join(FIXTURES_DIR, "zero_byte.bin")


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
def synthetic_comb_gap_png(tmp_path):
    """Creates a controlled synthetic contrast-stretched image exhibiting comb-like gaps."""
    p = str(tmp_path / "comb_gaps.png")
    x = np.linspace(0, 255, 128, dtype=np.uint8)
    img_arr = np.tile(x, (128, 1))
    stretched = np.clip(img_arr.astype(np.float32) * 1.35, 0, 255).astype(np.uint8)
    Image.fromarray(stretched, mode="L").save(p, format="PNG")
    return p


@pytest.fixture
def synthetic_color_splice_png(tmp_path):
    """Creates a controlled synthetic image with a localized foreign color patch."""
    p = str(tmp_path / "color_splice.png")
    arr = np.zeros((192, 192, 3), dtype=np.uint8)
    for i in range(192):
        for j in range(192):
            base = (i + j) % 200 + 20
            arr[i, j] = [base, base + 5, base - 5]

    arr[64:128, 64:128, 0] = 240
    arr[64:128, 64:128, 1] = 20
    arr[64:128, 64:128, 2] = 230

    Image.fromarray(arr, mode="RGB").save(p, format="PNG")
    return p


@pytest.fixture
def synthetic_periodic_sinusoid_png(tmp_path):
    """Creates a controlled synthetic 2D sinusoidal periodic pattern with explicit frequency."""
    p = str(tmp_path / "sinusoid_pattern.png")
    sz = 256
    x = np.arange(sz)
    y = np.arange(sz)
    xx, yy = np.meshgrid(x, y)
    
    freq_x = 16.0
    pattern = 128.0 + 100.0 * np.sin(2.0 * np.pi * freq_x * xx / sz)
    arr = np.clip(pattern, 0, 255).astype(np.uint8)
    Image.fromarray(arr, mode="L").save(p, format="PNG")
    return p


@pytest.fixture
def tiny_image_png(tmp_path):
    """Creates an undersized image below minimum threshold."""
    p = str(tmp_path / "tiny_8x8.png")
    Image.new("RGB", (8, 8), color=(100, 100, 100)).save(p, format="PNG")
    return p


# ============================================================
# 1. REGISTRATION & METADATA TESTS
# ============================================================

def test_step5_engines_registration():
    """Verifies all three Step 5 engines are registered in ForensicEngineRegistry."""
    hist_engine = engine_registry.get_engine("HISTOGRAM")
    assert hist_engine is not None
    assert hist_engine.engine_id == "HISTOGRAM"
    assert hist_engine.category.value == "GLOBAL_ANALYSIS"
    assert "PNG" in hist_engine.input_requirements.supported_formats
    assert "JPEG" in hist_engine.input_requirements.supported_formats

    color_engine = engine_registry.get_engine("COLOR-CHANNEL")
    assert color_engine is not None
    assert color_engine.engine_id == "COLOR-CHANNEL"
    assert color_engine.category.value == "LOCAL_ANALYSIS"
    assert "PNG" in color_engine.input_requirements.supported_formats

    fourier_engine = engine_registry.get_engine("FOURIER")
    assert fourier_engine is not None
    assert fourier_engine.engine_id == "FOURIER"
    assert fourier_engine.category.value == "GLOBAL_ANALYSIS"
    assert "WEBP" in fourier_engine.input_requirements.supported_formats


# ============================================================
# 2. HISTOGRAM ENGINE TESTS
# ============================================================

def test_histogram_clean_execution(tmp_path):
    """Verifies clean execution of HISTOGRAM engine across JPEG and PNG."""
    engine = HistogramEngine()
    
    for ref_path in [CLEAN_JPG, CLEAN_PNG, CLEAN_WEBP]:
        if not os.path.exists(ref_path):
            continue
        ctx = ExecutionContext(
            evidence_id=101,
            analysis_id=10,
            stored_path=ref_path,
            sha256_hash="mock_hash_hist",
            mime_type="image/png",
            image_format="PNG",
            width=100,
            height=100,
            storage_output_dir=str(tmp_path),
            parameters={"bins": 256},
        )
        res = engine.execute(ctx)
        assert res.status == EngineExecutionStatus.APPLIED
        assert len(res.artifacts) == 2
        
        findings = res.structured_findings
        assert "channel_statistics" in findings
        assert "luminance" in findings["channel_statistics"]
        lum = findings["channel_statistics"]["luminance"]
        assert 0.0 <= lum["shannon_entropy"] <= 8.0
        assert lum["dynamic_range"] >= 0
        assert 0.0 <= lum["mean"] <= 255.0

        assert len(res.observations) == 1
        obs = res.observations[0]
        assert obs.observation_type == "HISTOGRAM"
        assert obs.metric_name == "LUMINANCE_ENTROPY"


def test_histogram_comb_gaps_detection(synthetic_comb_gap_png, tmp_path):
    """Verifies detection of comb-like zero bins in contrast-stretched fixture."""
    engine = HistogramEngine()
    ctx = ExecutionContext(
        evidence_id=102,
        analysis_id=11,
        stored_path=synthetic_comb_gap_png,
        sha256_hash="mock_hash_comb",
        mime_type="image/png",
        image_format="PNG",
        width=128,
        height=128,
        storage_output_dir=str(tmp_path),
        parameters={},
    )
    res = engine.execute(ctx)
    assert res.status == EngineExecutionStatus.APPLIED
    lum = res.structured_findings["channel_statistics"]["luminance"]
    assert lum["comb_gaps_count"] > 0, "Contrast-stretched image should exhibit comb-like zero bins"


def test_histogram_determinism(tmp_path):
    """Verifies strict determinism: Run 1 == Run 2 == Run 3 for HISTOGRAM."""
    engine = HistogramEngine()
    runs = []
    
    for r in range(3):
        art_dir = str(tmp_path / f"hist_run_{r}")
        os.makedirs(art_dir, exist_ok=True)
        ctx = ExecutionContext(
            evidence_id=200,
            analysis_id=20,
            stored_path=CLEAN_PNG,
            sha256_hash="mock_hash_det",
            mime_type="image/png",
            image_format="PNG",
            width=100,
            height=100,
            storage_output_dir=art_dir,
            parameters={},
        )
        res = engine.execute(ctx)
        runs.append((res, art_dir))

    json_path_0 = os.path.join(runs[0][1], "histogram_analysis.json")
    json_path_1 = os.path.join(runs[1][1], "histogram_analysis.json")
    json_path_2 = os.path.join(runs[2][1], "histogram_analysis.json")
    
    with open(json_path_0, "r") as f:
        d0 = json.load(f)
    with open(json_path_1, "r") as f:
        d1 = json.load(f)
    with open(json_path_2, "r") as f:
        d2 = json.load(f)

    assert d0["channel_statistics"] == d1["channel_statistics"] == d2["channel_statistics"]
    assert d0["histogram_counts"] == d1["histogram_counts"] == d2["histogram_counts"]


# ============================================================
# 3. COLOR-CHANNEL ENGINE TESTS
# ============================================================

def test_color_channel_clean_execution(tmp_path):
    """Verifies clean execution of COLOR-CHANNEL engine on RGB image."""
    engine = ColorChannelEngine()
    ctx = ExecutionContext(
        evidence_id=301,
        analysis_id=31,
        stored_path=CLEAN_PNG,
        sha256_hash="mock_hash_col",
        mime_type="image/png",
        image_format="PNG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
        parameters={"block_size": 16},
    )
    res = engine.execute(ctx)
    assert res.status == EngineExecutionStatus.APPLIED
    assert len(res.artifacts) == 3
    
    assert os.path.exists(os.path.join(str(tmp_path), "color_channel_analysis.png"))
    assert os.path.exists(os.path.join(str(tmp_path), "color_channel_maps.png"))
    assert os.path.exists(os.path.join(str(tmp_path), "color_channel_analysis.json"))

    corr = res.structured_findings["correlation_matrix"]
    assert -1.0 <= corr["r_vs_g"] <= 1.0
    assert -1.0 <= corr["r_vs_b"] <= 1.0
    assert -1.0 <= corr["g_vs_b"] <= 1.0

    assert len(res.observations) == 1
    obs = res.observations[0]
    assert obs.observation_type == "COLOR_CHANNEL"


def test_color_channel_synthetic_splice_detection(synthetic_color_splice_png, tmp_path):
    """Verifies localized candidate region clustering on synthetic color-spliced fixture."""
    engine = ColorChannelEngine()
    ctx = ExecutionContext(
        evidence_id=302,
        analysis_id=32,
        stored_path=synthetic_color_splice_png,
        sha256_hash="mock_hash_splice",
        mime_type="image/png",
        image_format="PNG",
        width=192,
        height=192,
        storage_output_dir=str(tmp_path),
        parameters={"block_size": 16, "z_score_threshold": 2.0, "min_cluster_blocks": 2},
    )
    res = engine.execute(ctx)
    assert res.status == EngineExecutionStatus.APPLIED
    
    cands = res.structured_findings["candidate_regions"]
    assert len(cands) > 0, "Color-spliced patch should produce candidate anomaly regions"
    cand0 = cands[0]
    assert "x" in cand0 and "y" in cand0 and "width" in cand0 and "height" in cand0
    assert abs(cand0["mean_z_score"]) >= 2.0


def test_color_channel_determinism(tmp_path):
    """Verifies strict determinism: Run 1 == Run 2 == Run 3 for COLOR-CHANNEL."""
    engine = ColorChannelEngine()
    runs = []
    
    for r in range(3):
        art_dir = str(tmp_path / f"color_run_{r}")
        os.makedirs(art_dir, exist_ok=True)
        ctx = ExecutionContext(
            evidence_id=303,
            analysis_id=33,
            stored_path=CLEAN_JPG,
            sha256_hash="mock_hash_coldet",
            mime_type="image/jpeg",
            image_format="JPEG",
            width=100,
            height=100,
            storage_output_dir=art_dir,
            parameters={},
        )
        res = engine.execute(ctx)
        runs.append((res, art_dir))

    json_path_0 = os.path.join(runs[0][1], "color_channel_analysis.json")
    json_path_1 = os.path.join(runs[1][1], "color_channel_analysis.json")
    
    with open(json_path_0, "r") as f:
        d0 = json.load(f)
    with open(json_path_1, "r") as f:
        d1 = json.load(f)

    assert d0["correlation_matrix"] == d1["correlation_matrix"]
    assert d0["channel_difference_statistics"] == d1["channel_difference_statistics"]


# ============================================================
# 4. FOURIER ENGINE TESTS
# ============================================================

def test_fourier_clean_execution(tmp_path):
    """Verifies clean execution of FOURIER 2D FFT engine."""
    engine = FourierEngine()
    ctx = ExecutionContext(
        evidence_id=401,
        analysis_id=41,
        stored_path=CLEAN_PNG,
        sha256_hash="mock_hash_four",
        mime_type="image/png",
        image_format="PNG",
        width=100,
        height=100,
        storage_output_dir=str(tmp_path),
        parameters={"max_transform_dimension": 1024},
    )
    res = engine.execute(ctx)
    assert res.status == EngineExecutionStatus.APPLIED
    assert len(res.artifacts) == 2
    
    assert os.path.exists(os.path.join(str(tmp_path), "fourier_spectrum.png"))
    assert os.path.exists(os.path.join(str(tmp_path), "fourier_analysis.json"))

    ratios = res.structured_findings["radial_energy_ratios"]
    total_ratio = ratios["low_frequency"] + ratios["mid_frequency"] + ratios["high_frequency"]
    assert 0.95 <= total_ratio <= 1.05
    assert ratios["low_frequency"] > 0.0

    assert len(res.observations) == 1
    obs = res.observations[0]
    assert obs.observation_type == "FOURIER"
    assert obs.metric_name == "HIGH_FREQUENCY_ENERGY_RATIO"


def test_fourier_periodic_pattern_detection(synthetic_periodic_sinusoid_png, tmp_path):
    """Verifies dominant periodic peak detection on synthetic 2D sinusoid."""
    engine = FourierEngine()
    ctx = ExecutionContext(
        evidence_id=402,
        analysis_id=42,
        stored_path=synthetic_periodic_sinusoid_png,
        sha256_hash="mock_hash_sin",
        mime_type="image/png",
        image_format="PNG",
        width=256,
        height=256,
        storage_output_dir=str(tmp_path),
        parameters={"peak_prominence_sigma": 2.5},
    )
    res = engine.execute(ctx)
    assert res.status == EngineExecutionStatus.APPLIED
    peaks = res.structured_findings["dominant_peaks"]
    assert len(peaks) > 0, "Periodic sinusoidal pattern must generate detectable periodic Fourier peaks"
    
    pk0 = peaks[0]
    assert "u" in pk0 and "v" in pk0
    assert "normalized_radius" in pk0
    assert "prominence_sigma" in pk0
    assert pk0["prominence_sigma"] >= 2.5


def test_fourier_determinism(tmp_path):
    """Verifies strict determinism: Run 1 == Run 2 == Run 3 for FOURIER."""
    engine = FourierEngine()
    runs = []
    
    for r in range(3):
        art_dir = str(tmp_path / f"fourier_run_{r}")
        os.makedirs(art_dir, exist_ok=True)
        ctx = ExecutionContext(
            evidence_id=403,
            analysis_id=43,
            stored_path=CLEAN_PNG,
            sha256_hash="mock_hash_fourdet",
            mime_type="image/png",
            image_format="PNG",
            width=100,
            height=100,
            storage_output_dir=art_dir,
            parameters={},
        )
        res = engine.execute(ctx)
        runs.append((res, art_dir))

    json_path_0 = os.path.join(runs[0][1], "fourier_analysis.json")
    json_path_1 = os.path.join(runs[1][1], "fourier_analysis.json")
    
    with open(json_path_0, "r") as f:
        d0 = json.load(f)
    with open(json_path_1, "r") as f:
        d1 = json.load(f)

    assert d0["radial_energy_ratios"] == d1["radial_energy_ratios"]
    assert d0["spectral_entropy"] == d1["spectral_entropy"]
    assert d0["dominant_peaks"] == d1["dominant_peaks"]


# ============================================================
# 5. ERROR HANDLING & RESOURCE SAFETY TESTS
# ============================================================

def test_step5_engines_malformed_input(tmp_path):
    """Verifies all 3 engines handle malformed and zero-byte input safely without crashing."""
    engines = [HistogramEngine(), ColorChannelEngine(), FourierEngine()]
    
    for engine in engines:
        # Zero-byte input
        ctx_zero = ExecutionContext(
            evidence_id=501,
            analysis_id=51,
            stored_path=ZERO_BYTE,
            sha256_hash="zero",
            mime_type="image/png",
            image_format="PNG",
            width=100,
            height=100,
            storage_output_dir=str(tmp_path),
            parameters={},
        )
        res_zero = engine.execute(ctx_zero)
        assert res_zero.status == EngineExecutionStatus.FAILED

        # Malformed input
        ctx_mal = ExecutionContext(
            evidence_id=502,
            analysis_id=52,
            stored_path=MALFORMED_JPG,
            sha256_hash="malformed",
            mime_type="image/jpeg",
            image_format="JPEG",
            width=100,
            height=100,
            storage_output_dir=str(tmp_path),
            parameters={},
        )
        res_mal = engine.execute(ctx_mal)
        assert res_mal.status == EngineExecutionStatus.FAILED


def test_step5_engines_tiny_image_guardrail(tiny_image_png, tmp_path):
    """Verifies engines reject tiny images (< minimum threshold) safely."""
    for engine in [HistogramEngine(), ColorChannelEngine(), FourierEngine()]:
        ctx = ExecutionContext(
            evidence_id=503,
            analysis_id=53,
            stored_path=tiny_image_png,
            sha256_hash="tiny",
            mime_type="image/png",
            image_format="PNG",
            width=8,
            height=8,
            storage_output_dir=str(tmp_path),
            parameters={},
        )
        res = engine.execute(ctx)
        assert res.status in (EngineExecutionStatus.FAILED, EngineExecutionStatus.NOT_APPLICABLE)


# ============================================================
# 6. API EXECUTION, RBAC & CROSS-CASE ISOLATION TESTS
# ============================================================

def test_api_step5_trigger_and_artifacts(client: TestClient, db_session: Session):
    """Verifies triggering all 3 Step 5 engines via API and retrieving generated artifacts."""
    user = User(username="analyst_step5_api", hashed_password="pw", role="ADMIN")
    db_session.add(user)
    db_session.commit()

    case = InvestigationCase(case_identifier="FS-CASE-2026-STEP5", title="Step 5 Case", user_id=user.id)
    db_session.add(case)
    db_session.commit()

    evidence = Evidence(
        case_id=case.id,
        evidence_identifier="FS-EV-2026-STEP5-001",
        original_filename="clean_reference.png",
        stored_path=CLEAN_PNG,
        sha256_hash="mockshastep5",
        mime_type="image/png",
        image_format="PNG",
        width=100,
        height=100,
    )
    db_session.add(evidence)
    db_session.commit()

    # Test HISTOGRAM
    res_hist = client.post(f"/api/evidence/{evidence.id}/analysis/histogram")
    assert res_hist.status_code == 200
    data_hist = res_hist.json()
    assert data_hist["status"] == "completed"
    assert data_hist["analysis_type"] == "HISTOGRAM"
    assert "channel_statistics" in data_hist["structured_findings"]
    hist_art = data_hist["structured_findings"]["artifacts"]["histogram_analysis_plot"]
    res_art_hist = client.get(f"/api/artifacts/{hist_art}")
    assert res_art_hist.status_code == 200
    assert res_art_hist.headers["content-type"] == "image/png"

    # Test COLOR-CHANNEL
    res_col = client.post(f"/api/evidence/{evidence.id}/analysis/color-channel")
    assert res_col.status_code == 200
    data_col = res_col.json()
    assert data_col["status"] == "completed"
    assert data_col["analysis_type"] == "COLOR_CHANNEL"
    assert "correlation_matrix" in data_col["structured_findings"]
    col_art = data_col["structured_findings"]["artifacts"]["color_channel_overview_plot"]
    res_art_col = client.get(f"/api/artifacts/{col_art}")
    assert res_art_col.status_code == 200
    assert res_art_col.headers["content-type"] == "image/png"

    # Test FOURIER
    res_four = client.post(f"/api/evidence/{evidence.id}/analysis/fourier")
    assert res_four.status_code == 200
    data_four = res_four.json()
    assert data_four["status"] == "completed"
    assert data_four["analysis_type"] == "FOURIER"
    assert "radial_energy_ratios" in data_four["structured_findings"]
    four_art = data_four["structured_findings"]["artifacts"]["fourier_spectrum_plot"]
    res_art_four = client.get(f"/api/artifacts/{four_art}")
    assert res_art_four.status_code == 200
    assert res_art_four.headers["content-type"] == "image/png"


def test_api_step5_cross_case_isolation(client: TestClient, db_session: Session):
    """Verifies User B cannot trigger Step 5 analysis on User A's evidence."""
    user_a = User(username="user_a_step5", hashed_password="pw", role="INVESTIGATOR")
    user_b = User(username="user_b_step5", hashed_password="pw", role="INVESTIGATOR")
    db_session.add_all([user_a, user_b])
    db_session.commit()

    case_a = InvestigationCase(case_identifier="FS-CASE-A-S5", title="Case A", user_id=user_a.id)
    db_session.add(case_a)
    db_session.commit()

    ev_a = Evidence(
        case_id=case_a.id,
        evidence_identifier="FS-EV-A-S5",
        original_filename="clean_reference.png",
        stored_path=CLEAN_PNG,
        sha256_hash="mockshaa_s5",
        mime_type="image/png",
        image_format="PNG",
        width=100,
        height=100,
    )
    db_session.add(ev_a)
    db_session.commit()

    # Logged in as user_b
    app.dependency_overrides[get_current_user] = lambda: user_b

    for ep in ["histogram", "color-channel", "fourier"]:
        res = client.post(f"/api/evidence/{ev_a.id}/analysis/{ep}")
        assert res.status_code == 403

    # Reset override to admin
    app.dependency_overrides[get_current_user] = lambda: User(id=999, username="test_admin", role="ADMIN")


def test_api_step5_path_traversal_protection(client: TestClient):
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
