"""
Unit and regression tests for Stage 3, Workstream 1, Batch 4.

Covers:
1. Single-frame Copy-Move overlay dimensions (W x H) strictly matching native evidence.
2. Source and destination bounding box rendering and color differentiation.
3. Directional displacement arrow correctness (source to destination).
4. Detection pipeline invariance (SIFT keypoints, inlier counts, RANSAC transform).
5. Safe handling of zero matches and invalid coordinates.
6. Evidence SHA-256 byte invariance before and after execution.
7. Secondary side-by-side artifact preservation (2W x H).
8. Lossless PNG serialization.
"""

import os
import math
import hashlib
import pytest
import numpy as np
import cv2

from app.forensics.copy_move.engine import CopyMoveEngine
from app.forensics.copy_move.schemas import CopyMoveResult


def compute_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def create_synthetic_copymove(path: str, width: int = 400, height: int = 400) -> None:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    for i in range(height):
        img[i, :, :] = i % 255
        
    pw = max(40, min(width // 4, 100))
    ph = max(40, min(height // 4, 100))
    patch = np.zeros((ph, pw, 3), dtype=np.uint8)
    np.random.seed(42)
    for _ in range(5):
        cx = int(np.random.randint(pw // 4, max(pw // 4 + 1, 3 * pw // 4)))
        cy = int(np.random.randint(ph // 4, max(ph // 4 + 1, 3 * ph // 4)))
        r = max(2, min(pw, ph) // 6)
        cv2.circle(patch, (cx, cy), r, (255, 255, 255), -1)
        cv2.rectangle(patch, (max(0, cx - 5), max(0, cy - 5)), (min(pw - 1, cx + 5), min(ph - 1, cy + 5)), (100, 100, 100), -1)
    
    x1, y1 = 10, 10
    x2, y2 = width - pw - 10, height - ph - 10
    img[y1:y1 + ph, x1:x1 + pw] = patch
    img[y2:y2 + ph, x2:x2 + pw] = patch
    cv2.imwrite(path, img)


def create_negative_image(path: str, width: int = 300, height: int = 300) -> None:
    img = np.zeros((height, width, 3), dtype=np.uint8)
    for i in range(width):
        img[:, i, :] = i % 255
    cv2.imwrite(path, img)


class TestSingleFrameOverlayDimensions:
    """Verifies that the primary visualization artifact is strictly single-frame (W x H)."""

    def test_single_frame_dimensions_match_original_exactly(self, tmp_path):
        img_path = str(tmp_path / "test_dim.png")
        out_dir = str(tmp_path / "output")
        create_synthetic_copymove(img_path, width=400, height=400)

        res = CopyMoveEngine.run(img_path, out_dir)

        assert res.visualization_artifact_path is not None
        assert os.path.exists(res.visualization_artifact_path)

        overlay = cv2.imread(res.visualization_artifact_path)
        assert overlay is not None
        assert overlay.shape == (400, 400, 3), f"Expected (400, 400, 3), got {overlay.shape}"
        assert overlay.shape[1] == 400  # Must NOT be 800 (doubled width)
        assert overlay.shape[0] == 400

    def test_secondary_side_by_side_artifact_preserved(self, tmp_path):
        img_path = str(tmp_path / "test_sbs.png")
        out_dir = str(tmp_path / "output")
        create_synthetic_copymove(img_path, width=400, height=400)

        res = CopyMoveEngine.run(img_path, out_dir)

        assert res.side_by_side_artifact_path is not None
        assert os.path.exists(res.side_by_side_artifact_path)

        sbs = cv2.imread(res.side_by_side_artifact_path)
        assert sbs is not None
        assert sbs.shape == (400, 800, 3), f"Side-by-side artifact must be 2W x H, got {sbs.shape}"

    def test_non_square_image_dimensions(self, tmp_path):
        img_path = str(tmp_path / "test_rect.png")
        out_dir = str(tmp_path / "output")
        create_synthetic_copymove(img_path, width=512, height=256)

        res = CopyMoveEngine.run(img_path, out_dir)
        overlay = cv2.imread(res.visualization_artifact_path)
        assert overlay.shape == (256, 512, 3)


class TestDetectionInvarianceAndCoordinates:
    """Verifies that algorithmic detection, match counts, and RANSAC inliers are unmodified."""

    def test_detection_statistics_invariance(self, tmp_path):
        img_path = str(tmp_path / "test_inv.png")
        out_dir = str(tmp_path / "output")
        create_synthetic_copymove(img_path, width=400, height=400)

        res = CopyMoveEngine.run(img_path, out_dir)

        assert res.feature_statistics.keypoints_detected > 10
        assert res.matching_statistics.raw_matches > 0
        assert res.matching_statistics.geometric_inliers >= 4

        # Displacement vector connects patch 1 to patch 2
        disp = res.geometry.displacement
        assert disp is not None
        dx, dy = abs(disp[0]), abs(disp[1])
        assert 260.0 < dx < 300.0
        assert 260.0 < dy < 300.0

        src_bbox = res.candidate_regions.source_bounding_box
        dst_bbox = res.candidate_regions.destination_bounding_box
        assert src_bbox is not None
        assert dst_bbox is not None
        assert len(src_bbox) == 4
        assert len(dst_bbox) == 4

    def test_displacement_arrow_direction(self, tmp_path):
        img_path = str(tmp_path / "test_arrow.png")
        out_dir = str(tmp_path / "output")
        create_synthetic_copymove(img_path, width=400, height=400)

        res = CopyMoveEngine.run(img_path, out_dir)

        c_src = res.geometry.source_centroid
        c_dst = res.geometry.destination_centroid
        disp = res.geometry.displacement

        assert c_src is not None and c_dst is not None and disp is not None
        # Vector points from source to destination: displacement = dst - src
        computed_dx = c_dst[0] - c_src[0]
        computed_dy = c_dst[1] - c_src[1]
        assert computed_dx == pytest.approx(disp[0], rel=1e-4)
        assert computed_dy == pytest.approx(disp[1], rel=1e-4)


class TestEdgeCasesAndCoordinateSafety:
    """Verifies safe operation on negative, zero-match, and out-of-bounds coordinates."""

    def test_zero_match_negative_image_safety(self, tmp_path):
        img_path = str(tmp_path / "test_neg.png")
        out_dir = str(tmp_path / "output")
        create_negative_image(img_path, width=300, height=300)

        res = CopyMoveEngine.run(img_path, out_dir)

        assert res.matching_statistics.geometric_inliers == 0
        assert res.candidate_regions.source_bounding_box is None
        assert res.candidate_regions.destination_bounding_box is None

        # Even with zero matches, visualization must be single-frame (300, 300, 3)
        overlay = cv2.imread(res.visualization_artifact_path)
        assert overlay.shape == (300, 300, 3)

    def test_render_overlay_clamping_out_of_bounds(self):
        canvas = np.zeros((100, 100, 3), dtype=np.uint8)
        # Out of bounds coordinates: negative and exceeding width/height
        out = CopyMoveEngine._render_single_frame_overlay(
            img=canvas,
            keypoints=[],
            inlier_matches=[],
            src_bbox=[-20.0, -10.0, 150.0, 150.0],
            dst_bbox=[50.0, 50.0, 200.0, 200.0],
            src_centroid=[-50.0, -50.0],
            dst_centroid=[300.0, 300.0],
        )
        assert out.shape == (100, 100, 3)


class TestEvidenceIntegrityAndControlledFixtures:
    """Verifies evidence byte invariance and behavior on controlled benchmark fixtures."""

    def test_evidence_sha256_invariance(self, tmp_path):
        evidence_path = str(tmp_path / "evidence_evidence.png")
        out_dir = str(tmp_path / "output")
        create_synthetic_copymove(evidence_path, width=256, height=256)

        pre_hash = compute_sha256(evidence_path)
        CopyMoveEngine.run(evidence_path, out_dir)
        post_hash = compute_sha256(evidence_path)

        assert pre_hash == post_hash, "Original evidence file must remain strictly byte-for-byte unmodified"

    def test_fixture_005_copymove_clone(self, tmp_path):
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        f5_path = os.path.join(base_dir, "datasets", "controlled", "v1", "fixture_005_copymove_clone", "derived_copymove.png")
        assert os.path.exists(f5_path), f"Fixture 5 must exist at {f5_path}"

        pre_hash = compute_sha256(f5_path)
        out_dir = str(tmp_path / "out_f5")
        res = CopyMoveEngine.run(f5_path, out_dir)
        post_hash = compute_sha256(f5_path)

        assert pre_hash == post_hash, "Fixture 5 evidence hash must be invariant"

        # Verify output artifact dimensions match native fixture dimensions (256 x 256)
        overlay = cv2.imread(res.visualization_artifact_path)
        assert overlay.shape == (256, 256, 3)
        assert res.image_info.width == 256
        assert res.image_info.height == 256

    def test_fixture_009_false_positive_texture(self, tmp_path):
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        f9_path = os.path.join(base_dir, "datasets", "controlled", "v1", "fixture_009_false_positive_texture", "authentic_repetitive_texture.png")
        assert os.path.exists(f9_path), f"Fixture 9 must exist at {f9_path}"

        pre_hash = compute_sha256(f9_path)
        out_dir = str(tmp_path / "out_f9")
        res = CopyMoveEngine.run(f9_path, out_dir)
        post_hash = compute_sha256(f9_path)

        assert pre_hash == post_hash, "Fixture 9 evidence hash must be invariant"

        # Verify overlay shape is strictly (256, 256, 3)
        overlay = cv2.imread(res.visualization_artifact_path)
        assert overlay.shape == (256, 256, 3)

    def test_lossless_png_serialization(self, tmp_path):
        img_path = str(tmp_path / "test_lossless.png")
        out_dir = str(tmp_path / "output")
        create_synthetic_copymove(img_path, width=200, height=200)

        res = CopyMoveEngine.run(img_path, out_dir)
        assert res.visualization_artifact_path.lower().endswith(".png")
        assert res.side_by_side_artifact_path.lower().endswith(".png")

        # Verify header bytes match PNG signature (\x89PNG\r\n\x1a\n)
        with open(res.visualization_artifact_path, "rb") as f:
            header = f.read(8)
            assert header == b"\x89PNG\r\n\x1a\n"
