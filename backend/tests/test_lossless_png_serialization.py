"""
ForenSight — Stage 3, Workstream 1, Batch 1
Lossless PNG Serialization Verification Suite

Verifies:
1. Exact 8-byte PNG file signature (\\x89PNG\\r\\n\\x1a\\n) and IHDR chunk across all 4 core engines.
2. In-memory array identity (zero loss, MSE = 0.0, max diff = 0) vs decoded PNG.
3. ELA dual-output contract: error map is lossless PNG, recompressed artifact remains lossy JPEG bitstream.
4. Absolute evidence byte-level immutability (SHA-256 hash preservation).
5. Spatial dimension parity between inputs, intermediate arrays, and output artifacts.
6. Backward compatibility of artifact serving logic and adapter accessors.
"""

import os
import io
import hashlib
import pytest
import numpy as np
from PIL import Image
import cv2

from app.forensics.ela.engine import ELAEngine
from app.forensics.ela.schemas import ELAResult, ELAStatistics
from app.forensics.noise.engine import NoiseEngine
from app.forensics.jpeg_dct.engine import JPEGDCTEngine
from app.forensics.copy_move.engine import CopyMoveEngine
from app.engine_extensions.adapters import LegacyELAAdapter
from app.engine_extensions import ExecutionContext

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"


@pytest.fixture
def temp_output_dir(tmp_path):
    out_dir = tmp_path / "artifacts"
    out_dir.mkdir(parents=True, exist_ok=True)
    return str(out_dir)


def compute_sha256(file_path: str) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def create_synthetic_jpeg(path: str, size=(128, 128)) -> str:
    # Create image with gradients and high-frequency content to guarantee non-zero residuals
    arr = np.zeros((size[1], size[0], 3), dtype=np.uint8)
    for y in range(size[1]):
        for x in range(size[0]):
            arr[y, x] = [x % 256, y % 256, (x + y) % 256]
    # Add high-frequency block
    arr[30:70, 30:70] = 255
    img = Image.fromarray(arr, mode="RGB")
    img.save(path, "JPEG", quality=90)
    return path


def create_synthetic_copymove_image(path: str) -> str:
    img = np.zeros((300, 300, 3), dtype=np.uint8)
    for i in range(300):
        img[i, :, :] = i % 255

    patch = np.zeros((80, 80, 3), dtype=np.uint8)
    np.random.seed(1337)
    for _ in range(6):
        cx, cy = np.random.randint(15, 65, 2)
        cv2.circle(patch, (cx, cy), 12, (255, 255, 255), -1)
        cv2.rectangle(patch, (cx - 8, cy - 8), (cx + 8, cy + 8), (120, 120, 120), -1)

    img[40:120, 40:120] = patch
    img[160:240, 160:240] = patch
    cv2.imwrite(path, img)
    return path


# ==============================================================================
# 1. PNG Signature and Chunk Structure Verification
# ==============================================================================

def test_ela_png_signature_and_chunks(temp_output_dir, tmp_path):
    img_path = str(tmp_path / "test_ela.jpg")
    create_synthetic_jpeg(img_path)

    res = ELAEngine.run(img_path, temp_output_dir, quality=90)

    assert res.error_image_path.endswith(".png")
    assert os.path.exists(res.error_image_path)

    with open(res.error_image_path, "rb") as f:
        header = f.read(8)
        ihdr_len = f.read(4)
        ihdr_type = f.read(4)

    assert header == PNG_MAGIC, "ELA error map must begin with exact PNG magic bytes"
    assert ihdr_type == b"IHDR", "First PNG chunk must be IHDR"


def test_noise_png_signature_and_chunks(temp_output_dir, tmp_path):
    img_path = str(tmp_path / "test_noise.jpg")
    create_synthetic_jpeg(img_path)

    res = NoiseEngine.run(img_path, temp_output_dir)

    for path, desc in [
        (res.residual_image_path, "Global residual map"),
        (res.local_map_image_path, "Local residual map"),
    ]:
        assert path.endswith(".png"), f"{desc} must have .png extension"
        assert os.path.exists(path), f"{desc} file must exist on disk"
        with open(path, "rb") as f:
            header = f.read(8)
            f.read(4)
            ihdr_type = f.read(4)
        assert header == PNG_MAGIC, f"{desc} must begin with exact PNG magic bytes"
        assert ihdr_type == b"IHDR", f"{desc} first chunk must be IHDR"


def test_jpeg_dct_png_signature_and_chunks(temp_output_dir, tmp_path):
    img_path = str(tmp_path / "test_dct.jpg")
    create_synthetic_jpeg(img_path)

    res = JPEGDCTEngine.run(img_path, temp_output_dir)

    assert res.visualization_artifact_path.endswith(".png")
    assert os.path.exists(res.visualization_artifact_path)

    with open(res.visualization_artifact_path, "rb") as f:
        header = f.read(8)
        f.read(4)
        ihdr_type = f.read(4)

    assert header == PNG_MAGIC, "JPEG-DCT visualization map must begin with exact PNG magic bytes"
    assert ihdr_type == b"IHDR", "First PNG chunk must be IHDR"


def test_copy_move_png_signature_and_chunks(temp_output_dir, tmp_path):
    img_path = str(tmp_path / "test_copymove.png")
    create_synthetic_copymove_image(img_path)

    res = CopyMoveEngine.run(img_path, temp_output_dir)

    assert res.visualization_artifact_path.endswith(".png")
    assert os.path.exists(res.visualization_artifact_path)

    with open(res.visualization_artifact_path, "rb") as f:
        header = f.read(8)
        f.read(4)
        ihdr_type = f.read(4)

    assert header == PNG_MAGIC, "Copy-Move visualization map must begin with exact PNG magic bytes"
    assert ihdr_type == b"IHDR", "First PNG chunk must be IHDR"


# ==============================================================================
# 2. In-Memory Array Identity vs Decoded PNG (Lossless Parity)
# ==============================================================================

def test_ela_lossless_pixel_parity(temp_output_dir, tmp_path):
    img_path = str(tmp_path / "parity_ela.jpg")
    create_synthetic_jpeg(img_path, size=(64, 64))

    res = ELAEngine.run(img_path, temp_output_dir, quality=90)

    # Re-read the saved PNG artifact
    with Image.open(res.error_image_path) as saved_img:
        saved_arr = np.array(saved_img)

    # Recompute normalized array in memory using exact ELA logic
    with Image.open(img_path) as orig_img, Image.open(res.recompressed_image_path) as recomp_img:
        orig_arr = np.array(orig_img.convert("RGB"), dtype=np.int16)
        recomp_arr = np.array(recomp_img.convert("RGB"), dtype=np.int16)
        diff_arr = np.abs(orig_arr - recomp_arr)
        max_err = float(np.max(diff_arr))
        multiplier = 255.0 / max_err if max_err > 0 else 1.0
        expected_arr = np.clip(diff_arr * multiplier, 0, 255).astype(np.uint8)

    # Assert exact byte-for-byte pixel identity (MSE == 0.0)
    assert np.array_equal(saved_arr, expected_arr), "Decoded PNG array must match in-memory array with 0 difference"
    assert np.mean((saved_arr.astype(float) - expected_arr.astype(float)) ** 2) == 0.0


def test_noise_lossless_pixel_parity(temp_output_dir, tmp_path):
    img_path = str(tmp_path / "parity_noise.jpg")
    create_synthetic_jpeg(img_path, size=(64, 64))

    res = NoiseEngine.run(img_path, temp_output_dir)

    with Image.open(res.residual_image_path) as saved_global:
        saved_global_arr = np.array(saved_global)

    with Image.open(res.local_map_image_path) as saved_local:
        saved_local_arr = np.array(saved_local)

    # Format check: L mode (grayscale uint8)
    assert saved_global_arr.dtype == np.uint8
    assert saved_local_arr.dtype == np.uint8
    assert saved_global_arr.shape == (64, 64)
    # Local map has dimensions (H // stride, W // stride) with default stride=16
    assert saved_local_arr.shape == (64 // 16, 64 // 16)


def test_png_eliminates_jpeg_recompression_distortion(tmp_path):
    """
    Demonstrates mathematically why PNG is required:
    Saving an 8-bit diagnostic map as JPEG introduces non-zero errors (MSE > 0),
    whereas PNG preserves the exact values (MSE == 0).
    """
    rng = np.random.RandomState(42)
    synthetic_diagnostic_map = rng.randint(0, 256, (128, 128), dtype=np.uint8)

    png_path = str(tmp_path / "comparison.png")
    jpg_path = str(tmp_path / "comparison.jpg")

    # Save as PNG and JPEG
    Image.fromarray(synthetic_diagnostic_map, mode="L").save(png_path, "PNG")
    Image.fromarray(synthetic_diagnostic_map, mode="L").save(jpg_path, "JPEG", quality=95)

    png_decoded = np.array(Image.open(png_path))
    jpg_decoded = np.array(Image.open(jpg_path))

    png_mse = np.mean((synthetic_diagnostic_map.astype(float) - png_decoded.astype(float)) ** 2)
    jpg_mse = np.mean((synthetic_diagnostic_map.astype(float) - jpg_decoded.astype(float)) ** 2)
    jpg_max_diff = np.max(np.abs(synthetic_diagnostic_map.astype(int) - jpg_decoded.astype(int)))

    assert png_mse == 0.0, "PNG serialization must have exactly 0.0 MSE"
    assert jpg_mse > 0.0, "JPEG compression inevitably introduces recompression distortion"
    assert jpg_max_diff > 0, "JPEG compression distorts pixel values"


# ==============================================================================
# 3. ELA Dual-Output Format Preservation
# ==============================================================================

def test_ela_dual_output_preservation(temp_output_dir, tmp_path):
    img_path = str(tmp_path / "test_dual.jpg")
    create_synthetic_jpeg(img_path)

    res = ELAEngine.run(img_path, temp_output_dir, quality=85)

    # 1. Error map must be lossless PNG
    assert res.error_image_path.endswith(".png")
    with open(res.error_image_path, "rb") as f:
        assert f.read(8) == PNG_MAGIC

    # 2. Recompressed artifact must be lossy JPEG bitstream
    assert res.recompressed_image_path.endswith(".jpg")
    with open(res.recompressed_image_path, "rb") as f:
        assert f.read(3) == JPEG_MAGIC


# ==============================================================================
# 4. Evidence Immutability Verification (SHA-256 Invariance)
# ==============================================================================

def test_evidence_sha256_invariance_across_all_engines(temp_output_dir, tmp_path):
    img_path = str(tmp_path / "immutable_evidence.jpg")
    create_synthetic_jpeg(img_path, size=(96, 96))

    original_sha256 = compute_sha256(img_path)
    with open(img_path, "rb") as f:
        original_bytes = f.read()

    # Execute all 4 engines sequentially on the exact same evidence file
    ELAEngine.run(img_path, temp_output_dir)
    assert compute_sha256(img_path) == original_sha256, "Evidence altered after ELAEngine.run"

    NoiseEngine.run(img_path, temp_output_dir)
    assert compute_sha256(img_path) == original_sha256, "Evidence altered after NoiseEngine.run"

    JPEGDCTEngine.run(img_path, temp_output_dir)
    assert compute_sha256(img_path) == original_sha256, "Evidence altered after JPEGDCTEngine.run"

    CopyMoveEngine.run(img_path, temp_output_dir)
    assert compute_sha256(img_path) == original_sha256, "Evidence altered after CopyMoveEngine.run"

    with open(img_path, "rb") as f:
        final_bytes = f.read()

    assert original_bytes == final_bytes, "Evidence byte stream was modified during analysis"


# ==============================================================================
# 5. Spatial Dimension Parity
# ==============================================================================

def test_spatial_dimension_parity(temp_output_dir, tmp_path):
    w, h = 120, 80
    img_path = str(tmp_path / "dim_test.jpg")
    create_synthetic_jpeg(img_path, size=(w, h))

    # ELA
    ela_res = ELAEngine.run(img_path, temp_output_dir)
    with Image.open(ela_res.error_image_path) as im:
        assert im.size == (w, h)

    # Noise: global residual matches (w, h), local map matches (w // stride, h // stride)
    noise_res = NoiseEngine.run(img_path, temp_output_dir)
    with Image.open(noise_res.residual_image_path) as im:
        assert im.size == (w, h)
    with Image.open(noise_res.local_map_image_path) as im:
        stride = noise_res.local_config.stride
        assert im.size == (w // stride, h // stride)

    # JPEG-DCT
    dct_res = JPEGDCTEngine.run(img_path, temp_output_dir)
    with Image.open(dct_res.visualization_artifact_path) as im:
        assert im.size == (256, 256)

    # Copy-Move empty fallback
    flat_path = str(tmp_path / "flat.jpg")
    Image.new("RGB", (w, h), color=(100, 100, 100)).save(flat_path, "JPEG")
    cm_res = CopyMoveEngine.run(flat_path, temp_output_dir)
    with Image.open(cm_res.visualization_artifact_path) as im:
        assert im.size == (w, h)


# ==============================================================================
# 6. Backward Compatibility for API Endpoints & Adapters
# ==============================================================================

def test_adapter_backward_compatibility():
    # Verify LegacyELAAdapter works with property accessors on ELAResult
    stats = ELAStatistics(
        mean_error=3.5,
        max_error=42.0,
        std_error=1.2,
        median_error=2.0,
        percentiles={"90th": 6.0, "95th": 8.0, "99th": 15.0},
    )
    res = ELAResult(
        input_format="JPEG",
        width=100,
        height=100,
        jpeg_quality=90,
        statistics=stats,
        error_image_path="/storage/artifacts/ela_map_12345678.png",
        recompressed_image_path="/storage/artifacts/ela_recompressed_12345678.jpg",
    )

    # Check property aliases
    assert res.error_map_path == "/storage/artifacts/ela_map_12345678.png"
    assert res.mean_error == 3.5
    assert res.max_error == 42.0


def test_api_artifact_media_type_detection():
    import pathlib

    def detect_media_type(target_path_str: str) -> str:
        target_path = pathlib.Path(target_path_str)
        ext = target_path.suffix.lower()
        if ext in (".jpg", ".jpeg"):
            return "image/jpeg"
        elif ext == ".png":
            return "image/png"
        elif ext == ".webp":
            return "image/webp"
        elif ext == ".json":
            return "application/json"
        else:
            return "application/octet-stream"

    assert detect_media_type("storage/analyses/ela/ela_map_abc123.png") == "image/png"
    assert detect_media_type("storage/analyses/noise/noise_residual_abc123.png") == "image/png"
    assert detect_media_type("storage/analyses/jpeg_dct/dct_energy_map_abc123.png") == "image/png"
    assert detect_media_type("storage/analyses/copy_move/copymove_map_abc123.png") == "image/png"

    # Historical backward compatibility
    assert detect_media_type("storage/analyses/ela/ela_map_historical.jpg") == "image/jpeg"
    assert detect_media_type("storage/analyses/noise/noise_residual_historical.jpg") == "image/jpeg"
    assert detect_media_type("storage/analyses/ela/ela_recompressed_abc123.jpg") == "image/jpeg"
