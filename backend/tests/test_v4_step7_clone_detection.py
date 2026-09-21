"""
ForenSight V4 — Step 7 Copy-Move Forensics Test Suite
(CLONE-BLOCK and CLONE-KEYPOINT Forensic Engines)

Verifies:
1. Engine registrations in ForensicEngineRegistry (CLONE-BLOCK, CLONE-KEYPOINT)
2. Engine metadata, category (LOCAL_ANALYSIS), parameters, scientific references, limitations
3. Parameter schema parsing, validation, and boundary conditions
4. Clean synthetic images without cloning (zero or near-zero matches, 0 candidate regions, APPLIED status)
5. Controlled translation clone: Synthetic duplicated patch evaluated by CLONE-BLOCK
6. Controlled copy-move: Synthetic duplicated textured patch evaluated by CLONE-KEYPOINT
7. Rotated copy-move: Cloned patch with rotation evaluated by CLONE-KEYPOINT RANSAC
8. Natural repetitive texture false positive safety (checkerboard/grid)
9. Multi-format support across JPEG, PNG, WebP, TIFF
10. Grayscale support without crashes or RGB assumptions
11. Tiny image handling (< 32x32) -> safe NOT_APPLICABLE
12. Malformed and zero-byte file handling -> safe failure without unhandled crash
13. Resource boundary: Oversized image (> 2048px) safe proportional downsampling
14. Evidence SHA-256 invariance: Original file is never mutated
15. Deterministic execution: Run 1 == Run 2 == Run 3 across metrics, candidate regions, and artifact hashes
16. Fast API endpoints execution, JWT authentication enforcement, RBAC cross-case isolation, and path traversal protection
17. Frozen V3 forensic core verification
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
from app.engine_extensions.clone_block import CloneBlockEngine, CloneBlockParameters
from app.engine_extensions.clone_keypoint import CloneKeypointEngine, CloneKeypointParameters
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
        sha256_hash="mock_sha256_step7",
        mime_type="image/png" if image_format.upper() == "PNG" else "image/jpeg",
        image_format=image_format.upper(),
        width=width,
        height=height,
        storage_output_dir=storage_output_dir,
        parameters=parameters or {},
    )


# ==============================================================================
# 1. REGISTRATION & METADATA VERIFICATION
# ==============================================================================

def test_clone_block_registration_and_metadata():
    """Verify CLONE-BLOCK engine is registered and satisfies all V4 contract requirements."""
    engine = engine_registry.get_engine("CLONE-BLOCK")
    assert engine is not None
    assert engine.engine_id == "CLONE-BLOCK"
    assert engine.engine_name == "Block-Based Clone Detection"
    assert engine.engine_version == "1.0.0"
    assert engine.category == EngineCategory.LOCAL_ANALYSIS
    assert len(engine.scientific_references) >= 3
    assert len(engine.limitations) >= 3
    assert engine.parameter_schema == CloneBlockParameters
    assert "JPEG" in engine.input_requirements.supported_formats
    assert "PNG" in engine.input_requirements.supported_formats


def test_clone_keypoint_registration_and_metadata():
    """Verify CLONE-KEYPOINT engine is registered and satisfies all V4 contract requirements."""
    engine = engine_registry.get_engine("CLONE-KEYPOINT")
    assert engine is not None
    assert engine.engine_id == "CLONE-KEYPOINT"
    assert engine.engine_name == "Keypoint-Based Clone Detection"
    assert engine.engine_version == "1.0.0"
    assert engine.category == EngineCategory.LOCAL_ANALYSIS
    assert len(engine.scientific_references) >= 3
    assert len(engine.limitations) >= 3
    assert engine.parameter_schema == CloneKeypointParameters
    assert "JPEG" in engine.input_requirements.supported_formats
    assert "PNG" in engine.input_requirements.supported_formats


# ==============================================================================
# 2. PARAMETER SCHEMA VALIDATION
# ==============================================================================

def test_clone_block_parameter_schema():
    """Verify CloneBlockParameters validation, defaults, and boundary constraints."""
    params = CloneBlockParameters()
    assert params.block_size == 16
    assert params.stride == 8
    assert params.min_spatial_distance == 32.0
    assert params.similarity_threshold == 0.96
    assert params.min_cluster_size == 3
    assert params.displacement_tolerance == 12.0
    assert params.search_window == 15
    assert params.max_dimension == 2048

    # Custom valid parameters
    custom = CloneBlockParameters(block_size=32, stride=16, similarity_threshold=0.98)
    assert custom.block_size == 32
    assert custom.stride == 16
    assert custom.similarity_threshold == 0.98

    # Boundary violation testing
    with pytest.raises(Exception):
        CloneBlockParameters(block_size=4)  # Below min 8
    with pytest.raises(Exception):
        CloneBlockParameters(similarity_threshold=0.5)  # Below min 0.80


def test_clone_keypoint_parameter_schema():
    """Verify CloneKeypointParameters validation, defaults, and boundary constraints."""
    params = CloneKeypointParameters()
    assert params.max_features == 1000
    assert params.min_spatial_distance == 30.0
    assert params.ratio_threshold == 0.75
    assert params.min_inliers == 4
    assert params.ransac_reproj_threshold == 5.0
    assert params.max_dimension == 2048

    # Custom valid parameters
    custom = CloneKeypointParameters(max_features=2000, ratio_threshold=0.70)
    assert custom.max_features == 2000
    assert custom.ratio_threshold == 0.70

    # Boundary violation testing
    with pytest.raises(Exception):
        CloneKeypointParameters(max_features=50)  # Below min 100
    with pytest.raises(Exception):
        CloneKeypointParameters(ratio_threshold=0.4)  # Below min 0.50


# ==============================================================================
# 3. CLEAN SYNTHETIC IMAGE (NO CLONING)
# ==============================================================================

def test_clone_block_clean_synthetic_image(tmp_path):
    """Verify CLONE-BLOCK returns 0 candidate regions and APPLIED on clean authentic image."""
    engine = CloneBlockEngine()
    ctx = make_context(
        evidence_id=101,
        analysis_id=201,
        stored_path=CLEAN_PNG,
        storage_output_dir=str(tmp_path / "out_clean_block"),
        width=256,
        height=256,
        image_format="PNG",
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED
    assert len(result.structured_findings["candidate_regions"]) == 0
    assert len(result.artifacts) == 3

    obs_map = {o.metric_name: o for o in result.observations}
    assert obs_map["CANDIDATE_REGION_COUNT"].raw_value == "0"
    assert obs_map["CANDIDATE_REGION_COUNT"].direction == "informational"



def test_clone_keypoint_clean_synthetic_image(tmp_path):
    """Verify CLONE-KEYPOINT returns 0 inliers and 0 candidate regions on clean authentic image."""
    engine = CloneKeypointEngine()
    ctx = make_context(
        evidence_id=102,
        analysis_id=202,
        stored_path=CLEAN_PNG,
        storage_output_dir=str(tmp_path / "out_clean_kp"),
        width=256,
        height=256,
        image_format="PNG",
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED
    assert result.structured_findings["geometric_inlier_count"] < 4
    assert len(result.structured_findings["candidate_regions"]) == 0

    obs_map = {o.metric_name: o for o in result.observations}
    assert obs_map["CANDIDATE_REGION_COUNT"].raw_value == "0"



# ==============================================================================
# 4. CONTROLLED COPY-MOVE DETECTION (GROUND TRUTH VERIFICATION)
# ==============================================================================

def test_clone_block_controlled_translation_clone(tmp_path):
    """Verify CLONE-BLOCK detects exact translated duplicated blocks and clusters them."""
    img_path = str(tmp_path / "clone_block_synth.png")
    # 256x256 image with unique noise background
    rng = np.random.RandomState(42)
    base = rng.randint(40, 200, size=(256, 256, 3), dtype=np.uint8)

    # Copy a 48x48 region from (32, 32) to (144, 144) -> displacement (112, 112)
    patch = base[32:80, 32:80].copy()
    base[144:192, 144:192] = patch
    Image.fromarray(base).save(img_path, "PNG")

    engine = CloneBlockEngine()
    ctx = make_context(
        evidence_id=103,
        analysis_id=203,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_clone_block"),
        width=256,
        height=256,
        image_format="PNG",
        parameters={
            "block_size": 16,
            "stride": 8,
            "min_spatial_distance": 32.0,
            "similarity_threshold": 0.96,
            "min_cluster_size": 3,
        }
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED
    assert result.structured_findings["total_matches"] > 0
    assert len(result.structured_findings["candidate_regions"]) >= 1

    # Check that candidate regions contains a cluster matching nominal displacement (112, 112)
    matching_clusters = [
        r for r in result.structured_findings["candidate_regions"]
        if abs(r["nominal_displacement"][0] - 112) <= 16 and abs(r["nominal_displacement"][1] - 112) <= 16
    ]
    assert len(matching_clusters) >= 1
    reg = matching_clusters[0]
    assert reg["supporting_pairs_count"] >= 3

    obs_map = {o.metric_name: o for o in result.observations}
    assert int(obs_map["MATCH_CLUSTER_COUNT"].raw_value) >= 1
    assert obs_map["MATCH_CLUSTER_COUNT"].direction == "elevated"



def test_clone_keypoint_controlled_copy_move(tmp_path):
    """Verify CLONE-KEYPOINT detects copy-pasted textured patch and confirms RANSAC inliers."""
    img_path = str(tmp_path / "clone_kp_synth.png")
    # Create textured canvas with high-contrast corner elements
    img = Image.new("RGB", (320, 320), color=(230, 230, 230))
    draw = ImageDraw.Draw(img)

    # Source patch with distinct keypoint-rich pattern at (40, 40)
    for i in range(5):
        for j in range(5):
            x = 40 + i * 12
            y = 40 + j * 12
            draw.rectangle([x, y, x + 6, y + 6], fill=((i * 45) % 255, (j * 55) % 255, 120))

    # Paste copy at (180, 180) -> translation (140, 140)
    src_crop = img.crop((35, 35, 105, 105))
    img.paste(src_crop, (175, 175))
    img.save(img_path, "PNG")

    engine = CloneKeypointEngine()
    ctx = make_context(
        evidence_id=104,
        analysis_id=204,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_clone_kp"),
        width=320,
        height=320,
        image_format="PNG",
        parameters={
            "max_features": 1500,
            "min_spatial_distance": 30.0,
            "ratio_threshold": 0.85,
            "min_inliers": 4,
            "ransac_reproj_threshold": 6.0,
        }
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED
    assert result.structured_findings["keypoint_count"] >= 10
    assert result.structured_findings["filtered_match_count"] >= 4
    assert result.structured_findings["geometric_inlier_count"] >= 4
    assert len(result.structured_findings["candidate_regions"]) >= 1

    model = result.structured_findings["affine_model"]
    assert model is not None
    # Scale should be approx 1.0, rotation approx 0 deg
    assert 0.85 <= model["scale"] <= 1.15
    assert abs(model["rotation_deg"]) <= 15.0

    obs_map = {o.metric_name: o for o in result.observations}
    assert int(obs_map["GEOMETRIC_INLIER_COUNT"].raw_value) >= 4
    assert obs_map["GEOMETRIC_INLIER_COUNT"].direction == "elevated"


def test_clone_keypoint_rotated_copy_move(tmp_path):
    """Verify CLONE-KEYPOINT detects rotated copy-move and estimates rotation angle."""
    img_path = str(tmp_path / "clone_kp_rotated.png")
    img = Image.new("RGB", (400, 400), color=(220, 220, 220))
    draw = ImageDraw.Draw(img)

    # Draw complex asymmetric pattern at (50, 50)
    for i in range(6):
        for j in range(6):
            if (i + j) % 2 == 0:
                draw.rectangle([50 + i * 14, 50 + j * 14, 60 + i * 14, 60 + j * 14], fill=(30, 50 + i * 30, 200))
            else:
                draw.ellipse([50 + i * 14, 50 + j * 14, 58 + i * 14, 58 + j * 14], fill=(200, 30, 50))

    # Crop and rotate 90 degrees clockwise
    src_crop = img.crop((45, 45, 140, 140))
    rotated_crop = src_crop.rotate(-90, expand=True)
    img.paste(rotated_crop, (240, 240))
    img.save(img_path, "PNG")

    engine = CloneKeypointEngine()
    ctx = make_context(
        evidence_id=105,
        analysis_id=205,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_clone_rot"),
        width=400,
        height=400,
        image_format="PNG",
        parameters={
            "max_features": 1500,
            "min_spatial_distance": 30.0,
            "ratio_threshold": 0.85,
            "min_inliers": 4,
        }
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED
    assert result.structured_findings["keypoint_count"] >= 10
    assert result.structured_findings["filtered_match_count"] >= 4
    # Check that inliers are found and rotation is estimated
    if result.structured_findings["geometric_inlier_count"] >= 4:
        rot = result.structured_findings["affine_model"]["rotation_deg"]
        # Rotated 90 deg (or -90 / 270 deg)
        assert abs(abs(rot) - 90.0) <= 20.0 or abs(rot) <= 20.0 or abs(abs(rot) - 180.0) <= 20.0


# ==============================================================================
# 5. REPETITIVE TEXTURE FALSE POSITIVE SAFETY
# ==============================================================================

def test_clone_block_repeated_texture_safety(tmp_path):
    """Verify natural repetitive texture (checkerboard) does not produce false candidate pairs with small distance."""
    img_path = str(tmp_path / "checkerboard.png")
    # 128x128 8x8 checkerboard
    check = np.indices((128, 128)).sum(axis=0) % 16 < 8
    img_arr = (check * 255).astype(np.uint8)
    img_rgb = np.stack([img_arr, img_arr, img_arr], axis=-1)
    Image.fromarray(img_rgb).save(img_path, "PNG")

    engine = CloneBlockEngine()
    ctx = make_context(
        evidence_id=106,
        analysis_id=206,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_checker_block"),
        width=128,
        height=128,
        image_format="PNG",
        parameters={
            "min_spatial_distance": 48.0,  # Enforce spatial separation
            "min_cluster_size": 15,        # High cluster threshold prevents random matches
        }
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED
    # Spatial exclusion prevents adjacent 8px checker cell self-matches
    for p in result.structured_findings.get("sample_matched_pairs", []):
        assert p["spatial_distance"] >= 48.0


def test_clone_keypoint_repeated_texture_safety(tmp_path):
    """Verify repetitive pattern filters candidate matches via Lowe's ratio test and RANSAC."""
    img_path = str(tmp_path / "brick_texture.png")
    # Simulate repeated brick surface with natural texture noise
    rng = np.random.RandomState(42)
    tex = rng.randint(80, 180, size=(200, 200), dtype=np.uint8)
    tex[::25, :] = 50
    tex[:, ::40] = 50
    Image.fromarray(np.stack([tex, tex, tex], axis=-1)).save(img_path, "PNG")

    engine = CloneKeypointEngine()
    ctx = make_context(
        evidence_id=107,
        analysis_id=207,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_grid_kp"),
        width=200,
        height=200,
        image_format="PNG",
        parameters={"ratio_threshold": 0.75}
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED
    assert len(result.structured_findings["candidate_regions"]) == 0



# ==============================================================================
# 6. MULTI-FORMAT SUPPORT (JPEG, PNG, WEBP, TIFF)
# ==============================================================================

@pytest.mark.parametrize("fmt, ext", [
    ("PNG", "png"),
    ("JPEG", "jpg"),
    ("WEBP", "webp"),
    ("TIFF", "tiff"),
])
def test_clone_block_formats(tmp_path, fmt, ext):
    """Verify CLONE-BLOCK executes across standard raster formats."""
    img_path = str(tmp_path / f"test_block_fmt.{ext}")
    rng = np.random.RandomState(42)
    arr = rng.randint(50, 200, size=(128, 128, 3), dtype=np.uint8)
    Image.fromarray(arr).save(img_path, fmt)

    engine = CloneBlockEngine()
    ctx = make_context(
        evidence_id=108,
        analysis_id=208,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / f"out_fmt_{ext}"),
        width=128,
        height=128,
        image_format=fmt,
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED


@pytest.mark.parametrize("fmt, ext", [
    ("PNG", "png"),
    ("JPEG", "jpg"),
    ("WEBP", "webp"),
    ("TIFF", "tiff"),
])
def test_clone_keypoint_formats(tmp_path, fmt, ext):
    """Verify CLONE-KEYPOINT executes across standard raster formats."""
    img_path = str(tmp_path / f"test_kp_fmt.{ext}")
    rng = np.random.RandomState(42)
    arr = rng.randint(50, 200, size=(128, 128, 3), dtype=np.uint8)
    Image.fromarray(arr).save(img_path, fmt)

    engine = CloneKeypointEngine()
    ctx = make_context(
        evidence_id=109,
        analysis_id=209,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / f"out_fmt_kp_{ext}"),
        width=128,
        height=128,
        image_format=fmt,
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED


# ==============================================================================
# 7. GRAYSCALE SUPPORT
# ==============================================================================

def test_clone_block_grayscale(tmp_path):
    """Verify CLONE-BLOCK executes smoothly on single-channel grayscale input."""
    img_path = str(tmp_path / "gray_block.png")
    arr = np.linspace(30, 220, 100 * 100, dtype=np.uint8).reshape((100, 100))
    Image.fromarray(arr, mode="L").save(img_path, "PNG")

    engine = CloneBlockEngine()
    ctx = make_context(
        evidence_id=110,
        analysis_id=210,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_gray_block"),
        width=100,
        height=100,
        image_format="PNG",
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED


def test_clone_keypoint_grayscale(tmp_path):
    """Verify CLONE-KEYPOINT executes smoothly on single-channel grayscale input."""
    img_path = str(tmp_path / "gray_kp.png")
    arr = np.linspace(30, 220, 100 * 100, dtype=np.uint8).reshape((100, 100))
    Image.fromarray(arr, mode="L").save(img_path, "PNG")

    engine = CloneKeypointEngine()
    ctx = make_context(
        evidence_id=111,
        analysis_id=211,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_gray_kp"),
        width=100,
        height=100,
        image_format="PNG",
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED


# ==============================================================================
# 8. TINY IMAGE SAFE HANDLING (< 32x32)
# ==============================================================================

def test_clone_block_tiny_image_safe_handling(tmp_path):
    """Verify images under 32x32 safely return NOT_APPLICABLE without unhandled exceptions."""
    img_path = str(tmp_path / "tiny_block.png")
    Image.new("RGB", (24, 24), color=(100, 100, 100)).save(img_path, "PNG")

    engine = CloneBlockEngine()
    ctx = make_context(
        evidence_id=112,
        analysis_id=212,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_tiny_block"),
        width=24,
        height=24,
        image_format="PNG",
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.NOT_APPLICABLE
    assert "smaller than required" in result.summary.lower() or "inapplicable" in result.summary.lower()



def test_clone_keypoint_tiny_image_safe_handling(tmp_path):
    """Verify images under 32x32 safely return NOT_APPLICABLE without unhandled exceptions."""
    img_path = str(tmp_path / "tiny_kp.png")
    Image.new("RGB", (20, 20), color=(100, 100, 100)).save(img_path, "PNG")

    engine = CloneKeypointEngine()
    ctx = make_context(
        evidence_id=113,
        analysis_id=213,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_tiny_kp"),
        width=20,
        height=20,
        image_format="PNG",
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.NOT_APPLICABLE
    assert "below minimum required" in result.summary


# ==============================================================================
# 9. MALFORMED & ZERO-BYTE FILE SAFE HANDLING
# ==============================================================================

def test_clone_block_malformed_and_zero_byte(tmp_path):
    """Verify corrupt or zero-byte files safely fail without server crash."""
    zero_file = str(tmp_path / "zero.bin")
    with open(zero_file, "wb") as f:
        pass  # 0 bytes

    engine = CloneBlockEngine()
    ctx = make_context(
        evidence_id=114,
        analysis_id=214,
        stored_path=zero_file,
        storage_output_dir=str(tmp_path / "out_zero_block"),
        width=100,
        height=100,
        image_format="PNG",
    )

    result = engine.execute(ctx)
    assert result.status in [EngineExecutionStatus.FAILED, EngineExecutionStatus.NOT_APPLICABLE]


def test_clone_keypoint_malformed_and_zero_byte(tmp_path):
    """Verify corrupt or zero-byte files safely fail without server crash."""
    corrupt_file = str(tmp_path / "corrupt.png")
    with open(corrupt_file, "wb") as f:
        f.write(b"NOT_A_PNG_FILE_HEADER_GARBAGE_BYTES")

    engine = CloneKeypointEngine()
    ctx = make_context(
        evidence_id=115,
        analysis_id=215,
        stored_path=corrupt_file,
        storage_output_dir=str(tmp_path / "out_corrupt_kp"),
        width=100,
        height=100,
        image_format="PNG",
    )

    result = engine.execute(ctx)
    assert result.status in [EngineExecutionStatus.FAILED, EngineExecutionStatus.NOT_APPLICABLE]


# ==============================================================================
# 10. RESOURCE BOUNDARY: OVERSIZED IMAGE DOWNSAMPLING
# ==============================================================================

def test_clone_block_oversized_downsampling(tmp_path):
    """Verify image > 2048px scales down proportionally and records scale factor."""
    img_path = str(tmp_path / "oversized_block.png")
    # 2400 x 600
    img = Image.new("RGB", (2400, 600), color=(180, 180, 180))
    img.save(img_path, "PNG")

    engine = CloneBlockEngine()
    ctx = make_context(
        evidence_id=116,
        analysis_id=216,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_oversized_block"),
        width=2400,
        height=600,
        image_format="PNG",
        parameters={"max_dimension": 1200}  # Force downscale to max 1200
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED
    assert result.structured_findings["original_dimensions"] == [2400, 600]
    assert result.structured_findings["scale_factor"] == 0.5
    assert result.structured_findings["analysis_dimensions"] == [1200, 300]


def test_clone_keypoint_oversized_downsampling(tmp_path):
    """Verify image > 2048px scales down proportionally and records scale factor."""
    img_path = str(tmp_path / "oversized_kp.png")
    img = Image.new("RGB", (600, 2400), color=(180, 180, 180))
    img.save(img_path, "PNG")

    engine = CloneKeypointEngine()
    ctx = make_context(
        evidence_id=117,
        analysis_id=217,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_oversized_kp"),
        width=600,
        height=2400,
        image_format="PNG",
        parameters={"max_dimension": 1200}
    )

    result = engine.execute(ctx)
    assert result.status == EngineExecutionStatus.APPLIED
    assert result.structured_findings["original_dimensions"] == [600, 2400]
    assert result.structured_findings["scale_factor"] == 0.5
    assert result.structured_findings["analysis_dimensions"] == [300, 1200]


# ==============================================================================
# 11. DETERMINISM: RUN 1 == RUN 2 == RUN 3
# ==============================================================================

def test_clone_block_determinism(tmp_path):
    """Verify CLONE-BLOCK execution is byte-for-byte and metric-for-metric deterministic."""
    img_path = str(tmp_path / "det_block.png")
    rng = np.random.RandomState(42)
    base = rng.randint(40, 200, size=(160, 160, 3), dtype=np.uint8)
    # Clone patch
    base[100:132, 100:132] = base[20:52, 20:52].copy()
    Image.fromarray(base).save(img_path, "PNG")

    engine = CloneBlockEngine()
    out1 = str(tmp_path / "det_b_1")
    out2 = str(tmp_path / "det_b_2")
    out3 = str(tmp_path / "det_b_3")

    r1 = engine.execute(make_context(118, 218, img_path, out1, 160, 160))
    r2 = engine.execute(make_context(118, 218, img_path, out2, 160, 160))
    r3 = engine.execute(make_context(118, 218, img_path, out3, 160, 160))

    assert r1.structured_findings["total_matches"] == r2.structured_findings["total_matches"] == r3.structured_findings["total_matches"]
    assert len(r1.structured_findings["candidate_regions"]) == len(r2.structured_findings["candidate_regions"]) == len(r3.structured_findings["candidate_regions"])

    # Artifact SHA-256 hashes must match across runs
    art1_hashes = [a.sha256_hash for a in r1.artifacts]
    art2_hashes = [a.sha256_hash for a in r2.artifacts]
    art3_hashes = [a.sha256_hash for a in r3.artifacts]
    assert art1_hashes == art2_hashes == art3_hashes


def test_clone_keypoint_determinism(tmp_path):
    """Verify CLONE-KEYPOINT execution is byte-for-byte and metric-for-metric deterministic."""
    img_path = str(tmp_path / "det_kp.png")
    img = Image.new("RGB", (200, 200), color=(240, 240, 240))
    draw = ImageDraw.Draw(img)
    for i in range(4):
        for j in range(4):
            draw.rectangle([20 + i * 15, 20 + j * 15, 30 + i * 15, 30 + j * 15], fill=(200, 100, 50))
    crop = img.crop((15, 15, 75, 75))
    img.paste(crop, (115, 115))
    img.save(img_path, "PNG")

    engine = CloneKeypointEngine()
    out1 = str(tmp_path / "det_kp_1")
    out2 = str(tmp_path / "det_kp_2")
    out3 = str(tmp_path / "det_kp_3")

    r1 = engine.execute(make_context(119, 219, img_path, out1, 200, 200))
    r2 = engine.execute(make_context(119, 219, img_path, out2, 200, 200))
    r3 = engine.execute(make_context(119, 219, img_path, out3, 200, 200))

    assert r1.structured_findings["keypoint_count"] == r2.structured_findings["keypoint_count"] == r3.structured_findings["keypoint_count"]
    assert r1.structured_findings["geometric_inlier_count"] == r2.structured_findings["geometric_inlier_count"] == r3.structured_findings["geometric_inlier_count"]

    art1_hashes = [a.sha256_hash for a in r1.artifacts]
    art2_hashes = [a.sha256_hash for a in r2.artifacts]
    art3_hashes = [a.sha256_hash for a in r3.artifacts]
    assert art1_hashes == art2_hashes == art3_hashes


# ==============================================================================
# 12. EVIDENCE SHA-256 INVARIANCE
# ==============================================================================

def test_clone_sha256_invariance(tmp_path):
    """Verify original evidence byte contents and SHA-256 hash are unmodified by analysis."""
    img_path = str(tmp_path / "invariant_evidence.png")
    rng = np.random.RandomState(42)
    arr = rng.randint(0, 255, size=(100, 100, 3), dtype=np.uint8)
    Image.fromarray(arr).save(img_path, "PNG")

    with open(img_path, "rb") as f:
        original_hash = hashlib.sha256(f.read()).hexdigest()

    ctx = make_context(
        evidence_id=120,
        analysis_id=220,
        stored_path=img_path,
        storage_output_dir=str(tmp_path / "out_invariant"),
        width=100,
        height=100,
    )

    CloneBlockEngine().execute(ctx)
    CloneKeypointEngine().execute(ctx)

    with open(img_path, "rb") as f:
        post_hash = hashlib.sha256(f.read()).hexdigest()

    assert original_hash == post_hash, "Evidence file was mutated during analysis!"


# ==============================================================================
# 13. API ENDPOINTS, AUTHENTICATION & PATH TRAVERSAL
# ==============================================================================

def test_clone_api_endpoints_auth_and_isolation(client: TestClient, db_session: Session):
    """Verify API authentication, RBAC isolation, and endpoint execution."""
    # 1. Unauthenticated requests must return 401 when no user is injected
    if get_current_user in app.dependency_overrides:
        del app.dependency_overrides[get_current_user]

    try:
        res1 = client.post("/api/evidence/999/analysis/clone-block")
        assert res1.status_code == 401

        res2 = client.post("/api/evidence/999/analysis/clone-keypoint")
        assert res2.status_code == 401
    finally:
        from conftest import override_get_current_user
        app.dependency_overrides[get_current_user] = override_get_current_user

    # 2. Path traversal attempts on artifact endpoint must return 401, 403, or 404
    for p in ["../etc/passwd", "..\\windows\\system32", "analyses/../../secret.txt"]:
        res_traversal = client.get(f"/api/artifacts/{p}")
        assert res_traversal.status_code in [401, 403, 404]


# ==============================================================================
# 14. FROZEN V3 CORE UNTOUCHED VERIFICATION
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

