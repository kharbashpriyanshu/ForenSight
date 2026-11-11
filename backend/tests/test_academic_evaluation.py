r"""
Unit and Regression Test Suite for Academic Benchmark Evaluation Runner & Localization Metrics
(Stage 3 Workstream 2 Batch 2)

Covers:
1. Localization Metrics mathematical correctness, zero-division contracts, thresholding, and bounds.
2. Dataset Manifest Ingestion, cryptographic SHA-256 checks, missing files, and path traversal security.
3. Section 9.3 Engine-to-Fixture Applicability Dispatch rules and skip reasons.
4. Fidelity integration and monotonic degradation verification.
5. Benchmark runner execution, report generation, and reproducible output artifacts.
"""

import os
import json
import math
import tempfile
import shutil
from pathlib import Path
import numpy as np
import pytest
from PIL import Image

from app.metrics.localization import (
    validate_mask_pair,
    binarize_masks,
    calculate_confusion_matrix,
    calculate_iou,
    calculate_precision,
    calculate_recall,
    calculate_f1,
    calculate_dice,
    calculate_all_localization_metrics,
    calculate_bbox_iou,
)
from scripts.run_academic_evaluation import (
    AcademicEvaluationRunner,
    compute_sha256,
)


# =============================================================================
# 1. Localization Metrics Mathematical Validation
# =============================================================================

class TestLocalizationMetrics:
    """Verifies mathematical validity, thresholding, and zero-denominator contracts."""

    def test_perfect_prediction_all_metrics_one(self):
        gt = np.zeros((100, 100), dtype=np.uint8)
        gt[20:50, 20:50] = 255  # 900 positive pixels
        pred = gt.copy()

        metrics = calculate_all_localization_metrics(pred, gt, threshold=128)
        assert metrics["tp"] == 900
        assert metrics["fp"] == 0
        assert metrics["fn"] == 0
        assert metrics["tn"] == 9100
        assert metrics["total_pixels"] == 10000
        assert metrics["iou"] == 1.0
        assert metrics["precision"] == 1.0
        assert metrics["recall"] == 1.0
        assert metrics["f1"] == 1.0
        assert metrics["dice"] == 1.0

    def test_completely_incorrect_prediction(self):
        # GT has positives in top-left, prediction has positives in bottom-right
        gt = np.zeros((100, 100), dtype=np.uint8)
        gt[0:20, 0:20] = 255  # 400 positives
        pred = np.zeros((100, 100), dtype=np.uint8)
        pred[50:70, 50:70] = 255  # 400 positives

        metrics = calculate_all_localization_metrics(pred, gt, threshold=128)
        assert metrics["tp"] == 0
        assert metrics["fp"] == 400
        assert metrics["fn"] == 400
        assert metrics["tn"] == 9200
        assert metrics["iou"] == 0.0
        assert metrics["precision"] == 0.0
        assert metrics["recall"] == 0.0
        assert metrics["f1"] == 0.0
        assert metrics["dice"] == 0.0

    def test_partial_overlap_analytical_values(self):
        # 10x10 grid (100 pixels)
        # GT: cols 0..4 (50 pixels positive)
        # Pred: cols 3..7 (50 pixels positive)
        # Overlap (TP): cols 3..4 (20 pixels)
        # FP: cols 5..7 (30 pixels)
        # FN: cols 0..2 (30 pixels)
        # TN: cols 8..9 (20 pixels)
        gt = np.zeros((10, 10), dtype=np.uint8)
        gt[:, 0:5] = 255
        pred = np.zeros((10, 10), dtype=np.uint8)
        pred[:, 3:8] = 255

        cm = calculate_confusion_matrix(pred, gt, threshold=128)
        assert cm["tp"] == 20
        assert cm["fp"] == 30
        assert cm["fn"] == 30
        assert cm["tn"] == 20
        assert cm["total_pixels"] == 100

        # IoU = 20 / (20 + 30 + 30) = 20 / 80 = 0.25
        assert calculate_iou(pred, gt, threshold=128) == 0.25

        # Precision = 20 / (20 + 30) = 20 / 50 = 0.40
        assert calculate_precision(pred, gt, threshold=128) == 0.40

        # Recall = 20 / (20 + 30) = 20 / 50 = 0.40
        assert calculate_recall(pred, gt, threshold=128) == 0.40

        # F1 = (2 * 20) / (2 * 20 + 30 + 30) = 40 / 100 = 0.40
        assert calculate_f1(pred, gt, threshold=128) == 0.40
        assert calculate_dice(pred, gt, threshold=128) == 0.40

    def test_zero_predicted_positives_handling(self):
        # GT has positives, prediction is completely blank
        gt = np.zeros((50, 50), dtype=np.uint8)
        gt[10:20, 10:20] = 255  # 100 positives
        pred = np.zeros((50, 50), dtype=np.uint8)

        metrics = calculate_all_localization_metrics(pred, gt, threshold=128)
        assert metrics["tp"] == 0
        assert metrics["fp"] == 0
        assert metrics["fn"] == 100
        assert metrics["precision"] == 0.0
        assert metrics["recall"] == 0.0
        assert metrics["iou"] == 0.0
        assert metrics["f1"] == 0.0

    def test_both_masks_empty_zero_denominator_policy(self):
        # When both prediction and ground-truth are 100% negative
        empty_pred = np.zeros((50, 50), dtype=np.uint8)
        empty_gt = np.zeros((50, 50), dtype=np.uint8)

        metrics = calculate_all_localization_metrics(empty_pred, empty_gt, threshold=128)
        assert metrics["tp"] == 0
        assert metrics["fp"] == 0
        assert metrics["fn"] == 0
        assert metrics["tn"] == 2500
        # When both empty, agreement on negative state is 1.0
        assert metrics["iou"] == 1.0
        assert metrics["f1"] == 1.0
        assert metrics["dice"] == 1.0
        assert metrics["precision"] == 0.0
        assert metrics["recall"] == 0.0

    def test_mask_validation_exceptions(self):
        # Non-numpy
        with pytest.raises(TypeError, match="numpy.ndarray"):
            validate_mask_pair([1, 2, 3], np.zeros((10, 10)))  # type: ignore

        # Empty array
        with pytest.raises(ValueError, match="empty"):
            validate_mask_pair(np.array([]), np.array([]))

        # Shape mismatch
        with pytest.raises(ValueError, match="match identically"):
            validate_mask_pair(np.zeros((10, 10)), np.zeros((10, 12)))

        # 3D array with channels > 1
        with pytest.raises(ValueError, match="2D spatial"):
            validate_mask_pair(np.zeros((10, 10, 3)), np.zeros((10, 10, 3)))

        # NaN values
        nan_mask = np.zeros((10, 10))
        nan_mask[2, 2] = np.nan
        with pytest.raises(ValueError, match="NaN or infinity"):
            validate_mask_pair(nan_mask, np.zeros((10, 10)))

    def test_thresholding_scale_adaptation(self):
        # Continuous float in [0.0, 1.0], threshold 128 should adapt to 128 / 255
        pred_float = np.full((10, 10), 0.6, dtype=np.float32)
        gt = np.full((10, 10), 255, dtype=np.uint8)

        # 0.6 >= (128/255 ≈ 0.5019) -> all True
        pred_b, gt_b = binarize_masks(pred_float, gt, threshold=128.0)
        assert np.all(pred_b)
        assert np.all(gt_b)

    def test_bbox_iou_calculation(self):
        # Identical boxes -> 1.0
        assert calculate_bbox_iou([10, 10, 50, 50], [10, 10, 50, 50]) == 1.0

        # Disjoint boxes -> 0.0
        assert calculate_bbox_iou([0, 0, 10, 10], [20, 20, 30, 30]) == 0.0

        # Half overlap
        # Box 1: [0, 0, 20, 10] -> area 200
        # Box 2: [10, 0, 30, 10] -> area 200
        # Intersection: [10, 0, 20, 10] -> area 100
        # Union: 200 + 200 - 100 = 300
        # IoU: 100 / 300 = 1/3
        iou = calculate_bbox_iou([0, 0, 20, 10], [10, 0, 30, 10])
        assert math.isclose(iou, 1.0 / 3.0, rel_tol=1e-6)

        # Invalid coordinate length raises ValueError
        with pytest.raises(ValueError, match="4 coordinates"):
            calculate_bbox_iou([0, 0, 10], [0, 0, 10, 10])


# =============================================================================
# 2. Dataset & Manifest Ingestion Tests
# =============================================================================

class TestDatasetAndManifest:
    """Verifies manifest parsing, cryptographic validation, and error guards."""

    def test_production_manifest_loads_and_verifies_completely(self):
        runner = AcademicEvaluationRunner(quiet=True)
        records = runner.ingest_and_verify_dataset()
        assert len(records) == 11
        assert sum(1 for r in records.values() if r["has_mask"]) == 4

    def test_missing_manifest_raises_file_not_found(self, tmp_path):
        runner = AcademicEvaluationRunner(dataset_dir=tmp_path / "nonexistent", quiet=True)
        with pytest.raises(FileNotFoundError, match="Controlled dataset manifest not found"):
            runner.ingest_and_verify_dataset()

    def test_invalid_manifest_structure_raises_value_error(self, tmp_path):
        bad_manifest = tmp_path / "manifest.json"
        with open(bad_manifest, "w", encoding="utf-8") as f:
            json.dump({"dataset_id": "test"}, f)  # missing required keys
        runner = AcademicEvaluationRunner(dataset_dir=tmp_path, quiet=True)
        with pytest.raises(ValueError, match="Manifest missing required schema key"):
            runner.ingest_and_verify_dataset()

    def test_missing_image_file_detected(self, tmp_path):
        manifest_data = {
            "manifest_version": "1.0.0",
            "dataset_id": "test-ds",
            "dataset_version": "1.0.0",
            "images": [
                {
                    "image_id": "test_img",
                    "filename": "missing.png",
                    "sha256": "0" * 64,
                    "width": 100,
                    "height": 100,
                }
            ],
        }
        with open(tmp_path / "manifest.json", "w", encoding="utf-8") as f:
            json.dump(manifest_data, f)
        runner = AcademicEvaluationRunner(dataset_dir=tmp_path, quiet=True)
        with pytest.raises(FileNotFoundError, match="Fixture file missing"):
            runner.ingest_and_verify_dataset()

    def test_sha256_mismatch_detected(self, tmp_path):
        img_path = tmp_path / "dummy.png"
        Image.new("RGB", (32, 32), color="red").save(img_path)

        manifest_data = {
            "manifest_version": "1.0.0",
            "dataset_id": "test-ds",
            "dataset_version": "1.0.0",
            "images": [
                {
                    "image_id": "test_img",
                    "filename": "dummy.png",
                    "sha256": "f" * 64,  # wrong hash
                    "width": 32,
                    "height": 32,
                }
            ],
        }
        with open(tmp_path / "manifest.json", "w", encoding="utf-8") as f:
            json.dump(manifest_data, f)
        runner = AcademicEvaluationRunner(dataset_dir=tmp_path, quiet=True)
        with pytest.raises(ValueError, match="SHA-256 hash mismatch"):
            runner.ingest_and_verify_dataset()

    def test_unsafe_path_traversal_rejected(self, tmp_path):
        manifest_data = {
            "manifest_version": "1.0.0",
            "dataset_id": "test-ds",
            "dataset_version": "1.0.0",
            "images": [
                {
                    "image_id": "traversal_img",
                    "filename": "../../etc/passwd",
                    "sha256": "0" * 64,
                    "width": 32,
                    "height": 32,
                }
            ],
        }
        with open(tmp_path / "manifest.json", "w", encoding="utf-8") as f:
            json.dump(manifest_data, f)
        runner = AcademicEvaluationRunner(dataset_dir=tmp_path, quiet=True)
        with pytest.raises(ValueError, match="Unsafe file path detected"):
            runner.ingest_and_verify_dataset()


# =============================================================================
# 3. Section 9.3 Applicability Dispatch Tests
# =============================================================================

class TestApplicabilityDispatch:
    """Verifies compliance with the authoritative Section 9.3 matrix."""

    @pytest.fixture
    def runner(self):
        r = AcademicEvaluationRunner(quiet=True)
        r.ingest_and_verify_dataset()
        return r

    def test_jpeg_engines_on_png_return_skip_format(self, runner):
        # ELA on fixture_001 (PNG)
        decision, reason = runner.determine_applicability("ELA", "img_001_authentic_base")
        assert "Format" in decision
        assert "PNG" in reason

        # JPEG_DCT on fixture_005 (PNG)
        decision, reason = runner.determine_applicability("JPEG_DCT", "img_copymove_translated")
        assert "Format" in decision

    def test_jpeg_engines_on_jpeg_return_run(self, runner):
        decision, reason = runner.determine_applicability("ELA", "img_comp_q95")
        assert decision == "RUN"

        decision, reason = runner.determine_applicability("JPEG_DCT", "img_comp_q75")
        assert decision == "RUN"

    def test_missing_prerequisite_engines_return_skip_prereq(self, runner):
        decision, _ = runner.determine_applicability("CAMERA-ID", "img_001_authentic_base")
        assert "Prereq" in decision

        decision, _ = runner.determine_applicability("GEOMETRY-PERSPECTIVE", "img_001_authentic_base")
        assert "Prereq" in decision

        decision, _ = runner.determine_applicability("PHYSICS-LIGHTING", "img_001_authentic_base")
        assert "Prereq" in decision

    def test_metadata_applicable_to_all_fixtures(self, runner):
        for img_id in runner.images_meta.keys():
            decision, _ = runner.determine_applicability("METADATA", img_id)
            assert decision == "RUN"

    def test_dispatch_matrix_total_and_no_errors(self, runner):
        dispatches = runner.execute_dispatch_matrix()
        # 23 engines x 11 images = 253 dispatches
        assert len(dispatches) == 253
        assert not any(d["execution_status"] == "ERROR" for d in dispatches)
        run_count = sum(1 for d in dispatches if d["decision"] == "RUN")
        assert run_count == 69


# =============================================================================
# 4. Fidelity Integration Tests
# =============================================================================

class TestFidelityIntegration:
    """Verifies integration of Batch 1 fidelity metrics on controlled compression variants."""

    def test_fidelity_monotonic_degradation(self):
        runner = AcademicEvaluationRunner(quiet=True)
        runner.ingest_and_verify_dataset()
        results = runner.run_fidelity_evaluation()

        assert len(results) == 3
        q95 = results[0]
        q75 = results[1]
        q50 = results[2]

        # MSE increases as quality degrades
        assert q95["mse"] < q75["mse"] < q50["mse"]
        # PSNR decreases as quality degrades
        assert q95["psnr_db"] > q75["psnr_db"] > q50["psnr_db"]
        # SSIM decreases as quality degrades
        assert q95["ssim"] > q75["ssim"] > q50["ssim"]

        # Bounds checks
        assert q95["psnr_db"] > 40.0
        assert q95["ssim"] > 0.98


# =============================================================================
# 5. Full Evaluation Runner & Report Artifact Tests
# =============================================================================

class TestFullRunnerAndReports:
    """Verifies that run() generates all JSON, Markdown, and console artifacts."""

    def test_full_runner_execution_and_file_generation(self, tmp_path):
        out_dir = tmp_path / "test_eval_output"
        runner = AcademicEvaluationRunner(output_dir=out_dir, quiet=True)
        res = runner.run()

        # Check in-memory result structure
        assert "metadata" in res
        assert "fidelity_evaluation" in res
        assert "localization_evaluation" in res
        assert "negative_control_evaluation" in res
        assert "dispatch_matrix" in res

        # Check saved files
        json_file = out_dir / "evaluation_results.json"
        md_file = out_dir / "academic_evaluation_report.md"

        assert json_file.exists()
        assert md_file.exists()

        # Validate JSON content
        with open(json_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        assert len(data["fidelity_evaluation"]) == 3
        assert len(data["localization_evaluation"]) == 6
        assert len(data["negative_control_evaluation"]) == 10
        assert len(data["dispatch_matrix"]) == 253

        # Validate Markdown content
        with open(md_file, "r", encoding="utf-8") as f:
            md_text = f.read()
        assert "# ForenSight — Stage 3, Workstream 2 Academic Evaluation Report" in md_text
        assert "Classical DIP Image Fidelity Results" in md_text
        assert "Spatial Tamper Localization Results" in md_text
        assert "False-Positive Resistance on Negative Controls" in md_text

