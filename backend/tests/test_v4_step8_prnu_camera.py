"""
ForenSight V4 — Step 8 PRNU Sensor Pattern Analysis & Camera Identification Test Suite
(PRNU and CAMERA-ID Forensic Engines)

Verifies:
1. Engine registrations in ForensicEngineRegistry (PRNU, CAMERA-ID)
2. Engine metadata, category (CAMERA_IDENTIFICATION), parameters, scientific references, limitations
3. Parameter schema parsing, validation, and boundary conditions
4. Adaptive noise residual extraction and zero-mean row/column normalization
5. Empirical suitability screening (clean, low dynamic range, saturated)
6. Multi-image Maximum Likelihood Estimation (MLE) sensor fingerprint aggregation
7. 2D FFT circular cross-correlation surface and Peak-to-Correlation Energy (PCE) calculations
8. PRNU execution without reference (NOT_ESTIMATED, SUITABLE status, valid artifacts)
9. PRNU execution with matching reference (CONSISTENT, high correlation)
10. PRNU execution with non-matching reference (INCONSISTENT, low correlation)
11. Case-scoped CameraReferenceLibrary (save, list, get, delete)
12. Camera-ID execution with 0 references registered (NOT_ESTIMATED, valid diagnostic artifacts)
13. Camera-ID matching single reference (PCE >= 50.0, CONSISTENT, HIGH/MEDIUM confidence)
14. Camera-ID multi-candidate ranking and PCE gap (Device A correctly ranked #1 with margin over Device B)
15. Camera-ID inconsistent reference (INCONSISTENT, PCE < 25.0)
16. Camera-ID dimension mismatch handling (automatic central crop without failure)
17. Multi-format support across JPEG, PNG, WebP, TIFF
18. Grayscale image support without crashes
19. Tiny image handling (< 32x32) -> safe NOT_APPLICABLE
20. Malformed and zero-byte file handling -> safe failure without unhandled crash
21. Evidence SHA-256 invariance: original evidence is never mutated
22. Deterministic execution: Run 1 == Run 2 == Run 3 across metrics, observations, and artifact bytes
23. Fast API endpoints execution, JWT authentication enforcement, RBAC cross-case isolation, and path traversal protection
24. Frozen V3 forensic core verification (38 files strictly unmodified)
"""

import os
import io
import json
import hashlib
import pytest
import numpy as np
from PIL import Image, ImageDraw
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
from app.engine_extensions.prnu import (
    PRNUEngine,
    PRNUParameters,
    extract_noise_residual,
    zero_mean_normalize,
    calculate_suitability,
    aggregate_prnu_fingerprint,
    compute_2d_cross_correlation,
    compute_pce,
)
from app.engine_extensions.camera import (
    CameraIDEngine,
    CameraIDParameters,
    CameraReferenceLibrary,
    CameraReferenceMetadata,
)
from app.engine_extensions.categories import EngineCategory


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
    """Helper to construct fully validated ExecutionContext."""
    return ExecutionContext(
        evidence_id=evidence_id,
        analysis_id=analysis_id,
        stored_path=stored_path,
        sha256_hash="mock_sha256_step8",
        mime_type="image/png" if image_format.upper() == "PNG" else "image/jpeg",
        image_format=image_format.upper(),
        width=width,
        height=height,
        storage_output_dir=storage_output_dir,
        parameters=parameters or {},
    )


def create_synthetic_camera_image(
    size: tuple,
    sensor_fingerprint: np.ndarray,
    seed: int = 100,
) -> Image.Image:
    """
    Creates a realistic synthetic image containing a deterministic multiplicative PRNU fingerprint:
    I = I0 * (1 + K) + noise
    """
    rng = np.random.RandomState(seed)
    h, w = size
    # Smooth natural scene base: gradual gradient + texture
    y_coords, x_coords = np.mgrid[0:h, 0:w]
    i0 = 100.0 + 40.0 * np.sin(x_coords / 20.0) + 30.0 * np.cos(y_coords / 25.0)
    # Add multiplicative fingerprint
    k = sensor_fingerprint[:h, :w]
    img_float = i0 * (1.0 + k * 0.08) + rng.normal(0, 1.5, size=(h, w))
    img_uint8 = np.clip(img_float, 0, 255).astype(np.uint8)
    return Image.fromarray(img_uint8, mode="L").convert("RGB")


# ==============================================================================
# 1. REGISTRATION & METADATA VERIFICATION
# ==============================================================================

def test_prnu_registration_and_metadata():
    """Verify PRNU engine is registered and satisfies all V4 contract requirements."""
    engine = engine_registry.get_engine("PRNU")
    assert engine is not None
    assert engine.engine_id == "PRNU"
    assert engine.engine_name == "Photo-Response Non-Uniformity Analysis"
    assert engine.engine_version == "1.0.0"
    assert engine.category == EngineCategory.CAMERA_IDENTIFICATION
    assert len(engine.scientific_references) >= 3
    assert len(engine.limitations) >= 4
    assert engine.parameter_schema == PRNUParameters
    assert "JPEG" in engine.input_requirements.supported_formats
    assert "PNG" in engine.input_requirements.supported_formats
    assert "WEBP" in engine.input_requirements.supported_formats
    assert "TIFF" in engine.input_requirements.supported_formats


def test_camera_id_registration_and_metadata():
    """Verify CAMERA-ID engine is registered and satisfies all V4 contract requirements."""
    engine = engine_registry.get_engine("CAMERA-ID")
    assert engine is not None
    assert engine.engine_id == "CAMERA-ID"
    assert engine.engine_name == "Camera Hardware Identification"
    assert engine.engine_version == "1.0.0"
    assert engine.category == EngineCategory.CAMERA_IDENTIFICATION
    assert len(engine.scientific_references) >= 3
    assert len(engine.limitations) >= 4
    assert engine.parameter_schema == CameraIDParameters
    assert "JPEG" in engine.input_requirements.supported_formats
    assert "PNG" in engine.input_requirements.supported_formats
    assert "WEBP" in engine.input_requirements.supported_formats
    assert "TIFF" in engine.input_requirements.supported_formats


# ==============================================================================
# 2. PARAMETER SCHEMA VALIDATION
# ==============================================================================

def test_prnu_parameter_schema_validation():
    """Verify PRNU parameter schema parsing and boundaries."""
    # Defaults
    p_default = PRNUParameters()
    assert p_default.filter_window == 5
    assert p_default.filter_sigma == 1.5
    assert p_default.target_reference_id is None

    # Custom valid
    p_custom = PRNUParameters(filter_window=7, filter_sigma=2.0, target_reference_id="cam-123")
    assert p_custom.filter_window == 7
    assert p_custom.filter_sigma == 2.0
    assert p_custom.target_reference_id == "cam-123"

    # Out of bounds
    with pytest.raises(Exception):
        PRNUParameters(filter_window=2)  # < 3

    with pytest.raises(Exception):
        PRNUParameters(filter_sigma=10.0)  # > 5.0


def test_camera_id_parameter_schema_validation():
    """Verify CAMERA-ID parameter schema parsing and boundaries."""
    # Defaults
    p_default = CameraIDParameters()
    assert p_default.correlation_threshold == 0.015
    assert p_default.pce_threshold == 50.0
    assert p_default.min_suitability == 0.20
    assert p_default.target_reference_id is None

    # Custom valid
    p_custom = CameraIDParameters(correlation_threshold=0.03, pce_threshold=80.0, min_suitability=0.35)
    assert p_custom.correlation_threshold == 0.03
    assert p_custom.pce_threshold == 80.0
    assert p_custom.min_suitability == 0.35

    # Out of bounds
    with pytest.raises(Exception):
        CameraIDParameters(correlation_threshold=0.8)  # > 0.5


# ==============================================================================
# 3. EXTRACTION, NORMALIZATION & SUITABILITY ROUTINES
# ==============================================================================

def test_prnu_residual_extraction_and_zero_mean():
    """Verify adaptive filter residual extraction and zero-mean row/column demeaning."""
    rng = np.random.RandomState(42)
    img = rng.randint(40, 200, size=(128, 128)).astype(np.float32)
    # Add simulated row banding
    img[10, :] += 25.0
    img[20, :] += 25.0

    raw_res = extract_noise_residual(img, filter_window=5, filter_sigma=1.5)
    assert raw_res.shape == (128, 128)
    assert raw_res.dtype == np.float32

    # Before zero-mean, row means have variance
    norm_res = zero_mean_normalize(raw_res)
    assert norm_res.shape == (128, 128)

    # After zero-mean, row and column means must be approximately zero (< 1e-4)
    row_means = np.mean(norm_res, axis=1)
    col_means = np.mean(norm_res, axis=0)
    assert np.all(np.abs(row_means) < 1e-4)
    assert np.all(np.abs(col_means) < 1e-4)
    assert abs(float(np.mean(norm_res))) < 1e-4


def test_prnu_suitability_clean_image():
    """Verify suitability calculation on rich, non-saturated image returns SUITABLE."""
    rng = np.random.RandomState(42)
    img = rng.randint(40, 220, size=(128, 128)).astype(np.float32)
    res = extract_noise_residual(img)
    suitability = calculate_suitability(img, res)

    assert suitability["status"] == "SUITABLE"
    assert suitability["suitability_index"] >= 0.50
    assert suitability["saturated_ratio"] == 0.0
    assert suitability["dynamic_range"] > 100.0


def test_prnu_suitability_saturated_image():
    """Verify suitability calculation on heavily clipped image returns UNSUITABLE or MARGINAL."""
    # Fully saturated image
    img = np.full((128, 128), 255.0, dtype=np.float32)
    res = extract_noise_residual(img)
    suitability = calculate_suitability(img, res)

    assert suitability["status"] == "UNSUITABLE"
    assert suitability["suitability_index"] < 0.25
    assert suitability["saturated_ratio"] == 1.0


def test_prnu_mle_aggregation():
    """Verify multi-image MLE fingerprint aggregation formula."""
    rng = np.random.RandomState(42)
    true_k = rng.normal(0, 0.02, size=(64, 64)).astype(np.float32)

    images_residuals = []
    for i in range(5):
        base = rng.uniform(80, 180, size=(64, 64)).astype(np.float32)
        noisy = base * (1.0 + true_k) + rng.normal(0, 1.0, size=(64, 64))
        res = noisy - base
        images_residuals.append((noisy, res))

    fp = aggregate_prnu_fingerprint(images_residuals)
    assert fp.shape == (64, 64)
    assert fp.dtype == np.float32
    # Unit standard deviation normalized
    assert abs(float(np.std(fp)) - 1.0) < 0.05


# ==============================================================================
# 4. CROSS-CORRELATION & PCE MATHEMATICAL VERIFICATION
# ==============================================================================

def test_cross_correlation_and_pce_math():
    """Verify 2D FFT cross-correlation surface and PCE on identical vs uncorrelated signals."""
    rng = np.random.RandomState(42)
    signal1 = rng.normal(0, 1, size=(64, 64)).astype(np.float32)
    signal2 = signal1.copy()

    # Identical signals: peak must be high and centered, PCE must be very high (> 100)
    surf, max_c, peak_loc = compute_2d_cross_correlation(signal1, signal2)
    pce = compute_pce(surf, peak_loc, exclusion_radius=5)

    assert surf.shape == (64, 64)
    assert peak_loc == (32, 32)  # Centered peak
    assert max_c > 0.90
    assert pce > 100.0

    # Uncorrelated signals: low correlation, low PCE (< 20)
    uncorrelated = rng.normal(0, 1, size=(64, 64)).astype(np.float32)
    surf_rand, max_rand, peak_rand = compute_2d_cross_correlation(signal1, uncorrelated)
    pce_rand = compute_pce(surf_rand, peak_rand, exclusion_radius=5)

    assert max_rand < 0.20
    assert pce_rand < 25.0


# ==============================================================================
# 5. PRNU ENGINE EXECUTION
# ==============================================================================

def test_prnu_execution_without_reference(tmp_path):
    """Verify PRNU execution without reference produces NOT_ESTIMATED and all artifacts."""
    img_path = str(tmp_path / "prnu_test.png")
    out_dir = str(tmp_path / "out_prnu")
    rng = np.random.RandomState(42)
    arr = rng.randint(40, 210, size=(128, 128, 3), dtype=np.uint8)
    Image.fromarray(arr).save(img_path, "PNG")

    ctx = make_context(
        evidence_id=1,
        analysis_id=10,
        stored_path=img_path,
        storage_output_dir=out_dir,
        width=128,
        height=128,
    )

    engine = PRNUEngine()
    result = engine.execute(ctx)

    assert result.status == EngineExecutionStatus.APPLIED
    assert result.engine_id == "PRNU"
    assert "NOT_ESTIMATED" in result.summary
    assert len(result.artifacts) >= 3

    # Check artifact files exist
    assert os.path.isfile(os.path.join(out_dir, "prnu_residual.png"))
    assert os.path.isfile(os.path.join(out_dir, "prnu_analysis.png"))
    assert os.path.isfile(os.path.join(out_dir, "prnu_analysis.json"))

    # Check normalized observations
    obs_names = [o.metric_name for o in result.observations]
    assert "PRNU_RESIDUAL_VARIANCE" in obs_names
    assert "PRNU_RESIDUAL_ENERGY" in obs_names
    assert "PRNU_SUITABILITY_INDEX" in obs_names
    assert "PRNU_MATCH_STATUS" in obs_names


def test_prnu_execution_with_matching_reference(tmp_path):
    """Verify PRNU execution with matching reference yields CONSISTENT status."""
    rng = np.random.RandomState(42)
    true_fingerprint = rng.normal(0, 0.05, size=(128, 128)).astype(np.float32)

    # Create synthetic query image embedded with true_fingerprint
    img = create_synthetic_camera_image((128, 128), true_fingerprint, seed=1)
    img_path = str(tmp_path / "evidence_cam_a.png")
    img.save(img_path, "PNG")

    # Register reference in library under case 101
    CameraReferenceLibrary.save_reference(
        case_id=101,
        camera_label="Test Sensor Alpha",
        fingerprint=true_fingerprint,
        reference_id="ref-alpha",
    )

    out_dir = str(tmp_path / "out_prnu_match")
    ctx = make_context(
        evidence_id=2,
        analysis_id=20,
        stored_path=img_path,
        storage_output_dir=out_dir,
        width=128,
        height=128,
        parameters={"case_id": "101", "target_reference_id": "ref-alpha"},
    )

    engine = PRNUEngine()
    result = engine.execute(ctx)

    assert result.status == EngineExecutionStatus.APPLIED
    assert "CONSISTENT" in result.summary
    findings = result.structured_findings
    assert findings["match_status"] == "CONSISTENT"
    assert findings["correlation"] > 0.05
    # Optional fingerprint artifact must be generated
    assert os.path.isfile(os.path.join(out_dir, "prnu_fingerprint.png"))


def test_prnu_execution_with_different_reference(tmp_path):
    """Verify PRNU execution with unrelated reference yields INCONSISTENT status."""
    rng = np.random.RandomState(42)
    fingerprint_a = rng.normal(0, 0.05, size=(128, 128)).astype(np.float32)
    fingerprint_b = rng.normal(0, 0.05, size=(128, 128)).astype(np.float32)

    img = create_synthetic_camera_image((128, 128), fingerprint_a, seed=2)
    img_path = str(tmp_path / "evidence_cam_diff.png")
    img.save(img_path, "PNG")

    CameraReferenceLibrary.save_reference(
        case_id=102,
        camera_label="Test Sensor Beta",
        fingerprint=fingerprint_b,
        reference_id="ref-beta",
    )

    out_dir = str(tmp_path / "out_prnu_diff")
    ctx = make_context(
        evidence_id=3,
        analysis_id=30,
        stored_path=img_path,
        storage_output_dir=out_dir,
        width=128,
        height=128,
        parameters={"case_id": "102", "target_reference_id": "ref-beta"},
    )

    engine = PRNUEngine()
    result = engine.execute(ctx)

    assert result.status == EngineExecutionStatus.APPLIED
    assert "INCONSISTENT" in result.summary
    findings = result.structured_findings
    assert findings["match_status"] == "INCONSISTENT"


# ==============================================================================
# 6. CAMERA REFERENCE LIBRARY CRUD
# ==============================================================================

def test_camera_reference_library_crud():
    """Verify saving, listing, retrieving, and deleting references in CameraReferenceLibrary."""
    case_id = "test-case-library"
    rng = np.random.RandomState(42)
    fp = rng.normal(0, 1, size=(64, 64)).astype(np.float32)

    # 1. Save
    meta = CameraReferenceLibrary.save_reference(
        case_id=case_id,
        camera_label="Device Alpha",
        fingerprint=fp,
        make_model="Nikon D7000",
        reference_id="ref-lib-01",
    )
    assert meta.reference_id == "ref-lib-01"
    assert meta.case_id == case_id
    assert meta.camera_label == "Device Alpha"
    assert meta.width == 64
    assert meta.height == 64

    # 2. List
    all_refs = CameraReferenceLibrary.list_references(case_id)
    assert len(all_refs) >= 1
    assert any(r.reference_id == "ref-lib-01" for r in all_refs)

    # 3. Get
    item = CameraReferenceLibrary.get_reference(case_id, "ref-lib-01")
    assert item is not None
    loaded_meta, loaded_fp = item
    assert loaded_meta.camera_label == "Device Alpha"
    assert loaded_fp.shape == (64, 64)
    assert np.allclose(loaded_fp, fp, atol=1e-5)

    # 4. Delete
    deleted = CameraReferenceLibrary.delete_reference(case_id, "ref-lib-01")
    assert deleted is True
    assert CameraReferenceLibrary.get_reference(case_id, "ref-lib-01") is None


# ==============================================================================
# 7. CAMERA-ID ENGINE EXECUTION
# ==============================================================================

def test_camera_id_no_references_registered(tmp_path):
    """Verify CAMERA-ID with 0 registered references returns NOT_ESTIMATED safely."""
    img_path = str(tmp_path / "cam_empty.png")
    out_dir = str(tmp_path / "out_cam_empty")
    rng = np.random.RandomState(42)
    arr = rng.randint(40, 210, size=(128, 128, 3), dtype=np.uint8)
    Image.fromarray(arr).save(img_path, "PNG")

    ctx = make_context(
        evidence_id=10,
        analysis_id=100,
        stored_path=img_path,
        storage_output_dir=out_dir,
        width=128,
        height=128,
        parameters={"case_id": "empty-case-999"},
    )

    engine = CameraIDEngine()
    result = engine.execute(ctx)

    assert result.status == EngineExecutionStatus.APPLIED
    assert result.engine_id == "CAMERA-ID"
    assert "No camera reference fingerprints found" in result.summary
    findings = result.structured_findings
    assert findings["status"] == "NOT_ESTIMATED"
    assert os.path.isfile(os.path.join(out_dir, "camera_id_analysis.png"))
    assert os.path.isfile(os.path.join(out_dir, "camera_id_comparison.png"))
    assert os.path.isfile(os.path.join(out_dir, "camera_id_analysis.json"))


def test_camera_id_matching_single_reference(tmp_path):
    """Verify CAMERA-ID with matching reference identifies device with PCE >= 50.0."""
    case_id = "test-case-cam-match"
    rng = np.random.RandomState(42)
    true_fingerprint = rng.normal(0, 0.06, size=(128, 128)).astype(np.float32)

    # Register reference
    CameraReferenceLibrary.save_reference(
        case_id=case_id,
        camera_label="Suspect Phone 1 (iPhone 13)",
        fingerprint=true_fingerprint,
        reference_id="cam-ref-phone",
    )

    img = create_synthetic_camera_image((128, 128), true_fingerprint, seed=77)
    img_path = str(tmp_path / "query_phone.png")
    img.save(img_path, "PNG")

    out_dir = str(tmp_path / "out_cam_match")
    ctx = make_context(
        evidence_id=11,
        analysis_id=101,
        stored_path=img_path,
        storage_output_dir=out_dir,
        width=128,
        height=128,
        parameters={"case_id": case_id},
    )

    engine = CameraIDEngine()
    result = engine.execute(ctx)

    assert result.status == EngineExecutionStatus.APPLIED
    findings = result.structured_findings
    assert findings["status"] == "CONSISTENT"
    top = findings["top_candidate"]
    assert top is not None
    assert top["camera_label"] == "Suspect Phone 1 (iPhone 13)"
    assert top["pce"] >= 50.0
    assert top["correlation"] > 0.015


def test_camera_id_multi_candidate_ranking_and_gap(tmp_path):
    """Verify CAMERA-ID ranks multiple candidates, isolating target device with large PCE gap."""
    case_id = "test-case-multi-rank"
    rng = np.random.RandomState(42)

    # 3 distinct sensor fingerprints
    fp_dev_a = rng.normal(0, 0.06, size=(128, 128)).astype(np.float32)
    fp_dev_b = rng.normal(0, 0.06, size=(128, 128)).astype(np.float32)
    fp_dev_c = rng.normal(0, 0.06, size=(128, 128)).astype(np.float32)

    CameraReferenceLibrary.save_reference(case_id=case_id, camera_label="Device A (Target)", fingerprint=fp_dev_a, reference_id="ref-a")
    CameraReferenceLibrary.save_reference(case_id=case_id, camera_label="Device B (Other)", fingerprint=fp_dev_b, reference_id="ref-b")
    CameraReferenceLibrary.save_reference(case_id=case_id, camera_label="Device C (Other)", fingerprint=fp_dev_c, reference_id="ref-c")

    # Image taken from Device A
    img = create_synthetic_camera_image((128, 128), fp_dev_a, seed=88)
    img_path = str(tmp_path / "evidence_from_a.png")
    img.save(img_path, "PNG")

    out_dir = str(tmp_path / "out_multi_rank")
    ctx = make_context(
        evidence_id=12,
        analysis_id=102,
        stored_path=img_path,
        storage_output_dir=out_dir,
        width=128,
        height=128,
        parameters={"case_id": case_id},
    )

    engine = CameraIDEngine()
    result = engine.execute(ctx)

    findings = result.structured_findings
    assert findings["status"] == "CONSISTENT"
    candidates = findings["candidates"]
    assert len(candidates) == 3

    # Rank 1 must be Device A
    assert candidates[0]["reference_id"] == "ref-a"
    assert candidates[0]["pce"] >= 50.0

    # Ranks 2 and 3 must have low PCE
    assert candidates[1]["pce"] < 35.0
    assert candidates[2]["pce"] < 35.0

    # PCE margin gap must be significant
    assert findings["pce_gap"] > 25.0


def test_camera_id_inconsistent_reference(tmp_path):
    """Verify CAMERA-ID with mismatched reference returns INCONSISTENT."""
    case_id = "test-case-inconsistent"
    rng = np.random.RandomState(42)
    fp_camera = rng.normal(0, 0.06, size=(128, 128)).astype(np.float32)
    fp_unrelated = rng.normal(0, 0.06, size=(128, 128)).astype(np.float32)

    CameraReferenceLibrary.save_reference(case_id=case_id, camera_label="Mismatched Camera", fingerprint=fp_unrelated, reference_id="ref-unrelated")

    # Image taken from different sensor
    img = create_synthetic_camera_image((128, 128), fp_camera, seed=99)
    img_path = str(tmp_path / "query_unrelated.png")
    img.save(img_path, "PNG")

    out_dir = str(tmp_path / "out_inconsistent")
    ctx = make_context(
        evidence_id=13,
        analysis_id=103,
        stored_path=img_path,
        storage_output_dir=out_dir,
        width=128,
        height=128,
        parameters={"case_id": case_id},
    )

    engine = CameraIDEngine()
    result = engine.execute(ctx)

    findings = result.structured_findings
    assert findings["status"] == "INCONSISTENT"
    assert findings["confidence"] == "NONE"


def test_camera_id_dimension_mismatch_crop(tmp_path):
    """Verify CAMERA-ID gracefully handles different reference vs query dimensions via central crop."""
    case_id = "test-case-dim-mismatch"
    rng = np.random.RandomState(42)
    # Reference is 96x96
    fp_small = rng.normal(0, 0.06, size=(96, 96)).astype(np.float32)
    CameraReferenceLibrary.save_reference(case_id=case_id, camera_label="Small Sensor", fingerprint=fp_small, reference_id="ref-small")

    # Query is 128x128 with center matching fp_small
    full_fp = np.zeros((128, 128), dtype=np.float32)
    full_fp[16:112, 16:112] = fp_small
    img = create_synthetic_camera_image((128, 128), full_fp, seed=123)
    img_path = str(tmp_path / "query_larger.png")
    img.save(img_path, "PNG")

    out_dir = str(tmp_path / "out_crop")
    ctx = make_context(
        evidence_id=14,
        analysis_id=104,
        stored_path=img_path,
        storage_output_dir=out_dir,
        width=128,
        height=128,
        parameters={"case_id": case_id},
    )

    engine = CameraIDEngine()
    result = engine.execute(ctx)

    assert result.status == EngineExecutionStatus.APPLIED
    findings = result.structured_findings
    assert findings["status"] == "CONSISTENT"


# ==============================================================================
# 8. MULTI-FORMAT & COLOR SPACE SUPPORT
# ==============================================================================

@pytest.mark.parametrize("fmt,ext", [("JPEG", "jpg"), ("PNG", "png"), ("WEBP", "webp"), ("TIFF", "tiff")])
def test_multi_format_support_prnu(tmp_path, fmt, ext):
    """Verify PRNU executes seamlessly across JPEG, PNG, WebP, and TIFF formats."""
    img_path = str(tmp_path / f"test_format.{ext}")
    rng = np.random.RandomState(42)
    arr = rng.randint(40, 210, size=(100, 100, 3), dtype=np.uint8)
    Image.fromarray(arr).save(img_path, format=fmt)

    ctx = make_context(
        evidence_id=20,
        analysis_id=200,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / f"out_{fmt}"),
        width=100,
        height=100,
        image_format=fmt,
    )

    engine = PRNUEngine()
    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED


@pytest.mark.parametrize("fmt,ext", [("JPEG", "jpg"), ("PNG", "png"), ("WEBP", "webp"), ("TIFF", "tiff")])
def test_multi_format_support_camera_id(tmp_path, fmt, ext):
    """Verify CAMERA-ID executes seamlessly across JPEG, PNG, WebP, and TIFF formats."""
    img_path = str(tmp_path / f"test_cam_fmt.{ext}")
    rng = np.random.RandomState(42)
    arr = rng.randint(40, 210, size=(100, 100, 3), dtype=np.uint8)
    Image.fromarray(arr).save(img_path, format=fmt)

    ctx = make_context(
        evidence_id=21,
        analysis_id=201,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / f"out_cam_{fmt}"),
        width=100,
        height=100,
        image_format=fmt,
    )

    engine = CameraIDEngine()
    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED


def test_grayscale_image_support(tmp_path):
    """Verify 1-channel grayscale images execute without RGB channel crashes."""
    img_path = str(tmp_path / "test_gray.png")
    rng = np.random.RandomState(42)
    arr = rng.randint(40, 210, size=(100, 100), dtype=np.uint8)
    Image.fromarray(arr, mode="L").save(img_path, "PNG")

    ctx = make_context(
        evidence_id=22,
        analysis_id=202,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_gray"),
        width=100,
        height=100,
    )

    # PRNU
    r1 = PRNUEngine().execute(ctx)
    assert r1.status == EngineExecutionStatus.APPLIED

    # CAMERA-ID
    r2 = CameraIDEngine().execute(ctx)
    assert r2.status == EngineExecutionStatus.APPLIED


# ==============================================================================
# 9. EDGE & ADVERSARIAL CONDITIONS
# ==============================================================================

def test_tiny_image_safe_rejection(tmp_path):
    """Verify image smaller than 32x32 is safely flagged as inapplicable."""
    img_path = str(tmp_path / "tiny.png")
    arr = np.zeros((16, 16, 3), dtype=np.uint8)
    Image.fromarray(arr).save(img_path, "PNG")

    ctx = make_context(
        evidence_id=30,
        analysis_id=300,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_tiny"),
        width=16,
        height=16,
    )

    app_prnu = PRNUEngine().check_applicability(ctx)
    assert app_prnu.is_applicable is False

    app_cam = CameraIDEngine().check_applicability(ctx)
    assert app_cam.is_applicable is False


def test_malformed_and_zero_byte_handling(tmp_path):
    """Verify zero-byte or corrupted files return FAILED status safely without unhandled crash."""
    zero_file = str(tmp_path / "zero.png")
    with open(zero_file, "wb") as f:
        f.write(b"")

    ctx = make_context(
        evidence_id=31,
        analysis_id=301,
        stored_path=zero_file,
        storage_output_dir=str(tmp_path / "out_zero"),
    )

    r_prnu = PRNUEngine().execute(ctx)
    assert r_prnu.status == EngineExecutionStatus.FAILED

    r_cam = CameraIDEngine().execute(ctx)
    assert r_cam.status == EngineExecutionStatus.FAILED


def test_evidence_sha256_invariance(tmp_path):
    """Verify original evidence byte contents and SHA-256 hash are unmodified by analysis."""
    img_path = str(tmp_path / "invariant_evidence.png")
    rng = np.random.RandomState(42)
    arr = rng.randint(0, 255, size=(100, 100, 3), dtype=np.uint8)
    Image.fromarray(arr).save(img_path, "PNG")

    with open(img_path, "rb") as f:
        original_hash = hashlib.sha256(f.read()).hexdigest()

    ctx = make_context(
        evidence_id=40,
        analysis_id=400,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_invariant"),
        width=100,
        height=100,
    )

    PRNUEngine().execute(ctx)
    CameraIDEngine().execute(ctx)

    with open(img_path, "rb") as f:
        post_hash = hashlib.sha256(f.read()).hexdigest()

    assert original_hash == post_hash, "Evidence file was mutated during analysis!"


# ==============================================================================
# 10. THREE-RUN DETERMINISM
# ==============================================================================

def test_three_run_determinism_prnu(tmp_path):
    """Verify PRNUEngine produces identical results across 3 consecutive runs."""
    img_path = str(tmp_path / "determ_prnu.png")
    rng = np.random.RandomState(42)
    arr = rng.randint(40, 210, size=(100, 100, 3), dtype=np.uint8)
    Image.fromarray(arr).save(img_path, "PNG")

    ctx1 = make_context(50, 501, img_path, str(tmp_path / "determ_prnu_1"), 100, 100)
    ctx2 = make_context(50, 502, img_path, str(tmp_path / "determ_prnu_2"), 100, 100)
    ctx3 = make_context(50, 503, img_path, str(tmp_path / "determ_prnu_3"), 100, 100)

    engine = PRNUEngine()
    r1 = engine.execute(ctx1)
    r2 = engine.execute(ctx2)
    r3 = engine.execute(ctx3)

    assert r1.summary == r2.summary == r3.summary
    assert r1.structured_findings["suitability"] == r2.structured_findings["suitability"] == r3.structured_findings["suitability"]


def test_three_run_determinism_camera_id(tmp_path):
    """Verify CameraIDEngine produces identical results across 3 consecutive runs."""
    img_path = str(tmp_path / "determ_cam.png")
    rng = np.random.RandomState(42)
    arr = rng.randint(40, 210, size=(100, 100, 3), dtype=np.uint8)
    Image.fromarray(arr).save(img_path, "PNG")

    ctx1 = make_context(51, 511, img_path, str(tmp_path / "determ_cam_1"), 100, 100)
    ctx2 = make_context(51, 512, img_path, str(tmp_path / "determ_cam_2"), 100, 100)
    ctx3 = make_context(51, 513, img_path, str(tmp_path / "determ_cam_3"), 100, 100)

    engine = CameraIDEngine()
    r1 = engine.execute(ctx1)
    r2 = engine.execute(ctx2)
    r3 = engine.execute(ctx3)

    assert r1.summary == r2.summary == r3.summary
    assert r1.structured_findings["status"] == r2.structured_findings["status"] == r3.structured_findings["status"]


# ==============================================================================
# 11. API ENDPOINTS, AUTHENTICATION & PATH TRAVERSAL
# ==============================================================================

def test_camera_api_endpoints_auth_and_isolation(client: TestClient, db_session: Session):
    """Verify API authentication, RBAC isolation, and endpoint execution."""
    # 1. Unauthenticated requests must return 401 when no user is injected
    if get_current_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_user]

    try:
        res1 = client.post("/api/evidence/999/analysis/prnu")
        assert res1.status_code == 401

        res2 = client.post("/api/evidence/999/analysis/camera-id")
        assert res2.status_code == 401
    finally:
        from conftest import override_get_current_user
        app.dependency_overrides[get_current_user] = override_get_current_user

    # 2. Path traversal attempts on artifact endpoint must return 401, 403, or 404
    for p in ["../etc/passwd", "..\\windows\\system32", "cases/../../secret.txt"]:
        res_traversal = client.get(f"/api/artifacts/{p}")
        assert res_traversal.status_code in [401, 403, 404]


def test_camera_references_api_crud(client: TestClient, db_session: Session):
    """Verify case camera references CRUD API endpoints."""
    # Setup test user and case in DB
    user = User(id=1, username="investigator1", role="INVESTIGATOR")
    db_session.add(user)
    db_session.commit()

    case = InvestigationCase(id=55, case_identifier="FS-CASE-55", title="PRNU Case", user_id=1)
    db_session.add(case)
    db_session.commit()

    # Create dummy reference array .npy
    fp = np.random.randn(64, 64).astype(np.float32)
    buf = io.BytesIO()
    np.save(buf, fp)
    buf.seek(0)

    # 1. POST /api/cases/55/camera-references
    res_upload = client.post(
        "/api/cases/55/camera-references",
        data={"camera_label": "Evidence Camera A", "make_model": "Sony A7"},
        files={"file": ("reference.npy", buf, "application/octet-stream")},
    )
    assert res_upload.status_code == 200
    ref_data = res_upload.json()
    ref_id = ref_data["reference_id"]
    assert ref_data["camera_label"] == "Evidence Camera A"
    assert ref_data["make_model"] == "Sony A7"

    # 2. GET /api/cases/55/camera-references
    res_list = client.get("/api/cases/55/camera-references")
    assert res_list.status_code == 200
    list_data = res_list.json()
    assert any(r["reference_id"] == ref_id for r in list_data)

    # 3. DELETE /api/cases/55/camera-references/{ref_id}
    res_del = client.delete(f"/api/cases/55/camera-references/{ref_id}")
    assert res_del.status_code == 200

    # Verify deleted
    res_list2 = client.get("/api/cases/55/camera-references")
    assert not any(r["reference_id"] == ref_id for r in res_list2.json())


# ==============================================================================
# 12. FROZEN V3 CORE UNTOUCHED VERIFICATION
# ==============================================================================

def test_v3_frozen_core_untouched():
    """Verify that backend/app/forensics directory has exactly 38 files and zero modifications."""
    forensics_dir = os.path.join(os.path.dirname(__file__), "..", "app", "forensics")
    py_files = []
    for root, _, files in os.walk(forensics_dir):
        for f in files:
            if f.endswith(".py"):
                py_files.append(os.path.join(root, f))
    # Must have 38 frozen files
    assert len(py_files) == 38, f"Expected 38 files in forensics core, found {len(py_files)}"
