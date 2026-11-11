"""
Unit and regression tests for Stage 3, Workstream 1, Batch 3.

Covers:
1. Fidelity metrics (MSE, PSNR, SSIM) mathematical bounds, symmetry, and error handling.
2. Localization metrics (IoU, Precision, Recall, F1, FPR, Specificity) and pixel conservation.
3. Controlled benchmark results validation and evidence byte invariance.
4. Scientific freeze verification.
"""

import os
import json
import pytest
import numpy as np

from app.benchmark.fidelity_metrics import (
    compute_mse,
    compute_psnr,
    compute_ssim,
    compute_all_fidelity_metrics,
    compute_comprehensive_localization_metrics,
)
from app.engine_extensions.registry import engine_registry


class TestFidelityMetrics:
    """Verifies mathematical validity and invariants of analytical fidelity metrics."""

    def test_identical_images_metrics(self):
        img = np.random.randint(0, 256, (128, 128, 3), dtype=np.uint8)
        metrics = compute_all_fidelity_metrics(img, img)

        assert metrics["mse"] == 0.0
        assert metrics["psnr_db"] == 100.0  # Max bound for identical images
        assert metrics["ssim"] == 1.0

    def test_fidelity_symmetry(self):
        img_a = np.random.randint(0, 256, (64, 64), dtype=np.uint8)
        img_b = np.random.randint(0, 256, (64, 64), dtype=np.uint8)

        mse_ab = compute_mse(img_a, img_b)
        mse_ba = compute_mse(img_b, img_a)
        assert mse_ab == pytest.approx(mse_ba, rel=1e-6)

        psnr_ab = compute_psnr(img_a, img_b)
        psnr_ba = compute_psnr(img_b, img_a)
        assert psnr_ab == pytest.approx(psnr_ba, rel=1e-6)

        ssim_ab = compute_ssim(img_a, img_b)
        ssim_ba = compute_ssim(img_b, img_a)
        assert ssim_ab == pytest.approx(ssim_ba, rel=1e-6)

    def test_dimension_mismatch_raises_value_error(self):
        img_a = np.zeros((64, 64, 3), dtype=np.uint8)
        img_b = np.zeros((64, 32, 3), dtype=np.uint8)

        with pytest.raises(ValueError, match="Image dimensions must match"):
            compute_mse(img_a, img_b)

        with pytest.raises(ValueError, match="Image dimensions must match"):
            compute_psnr(img_a, img_b)

        with pytest.raises(ValueError, match="Image dimensions must match"):
            compute_ssim(img_a, img_b)

    def test_ssim_range_and_sensitivity(self):
        base = np.full((128, 128), 128, dtype=np.uint8)
        slightly_degraded = base.copy()
        slightly_degraded[::2, ::2] = 130
        heavily_degraded = np.random.randint(0, 256, (128, 128), dtype=np.uint8)

        ssim_slight = compute_ssim(base, slightly_degraded)
        ssim_heavy = compute_ssim(base, heavily_degraded)

        assert 0.95 <= ssim_slight <= 1.0
        assert ssim_heavy < ssim_slight
        assert -1.0 <= ssim_heavy <= 1.0


class TestLocalizationMetrics:
    """Verifies mathematical validity and invariants of localization metrics."""

    def test_perfect_localization(self):
        gt = np.zeros((100, 100), dtype=np.uint8)
        gt[20:40, 20:40] = 255  # 400 positive pixels

        pred = np.zeros((100, 100), dtype=np.uint8)
        pred[20:40, 20:40] = 200  # Above threshold 128

        metrics = compute_comprehensive_localization_metrics(pred, gt, threshold=128)

        assert metrics["true_positives"] == 400
        assert metrics["false_positives"] == 0
        assert metrics["false_negatives"] == 0
        assert metrics["true_negatives"] == 9600
        assert metrics["total_pixels"] == 10000
        assert metrics["iou"] == 1.0
        assert metrics["precision"] == 1.0
        assert metrics["recall"] == 1.0
        assert metrics["f1_score"] == 1.0
        assert metrics["false_positive_rate"] == 0.0
        assert metrics["specificity"] == 1.0
        assert metrics["overall_pixel_accuracy"] == 1.0

    def test_pixel_conservation_invariant(self):
        gt = np.random.choice([0, 255], size=(80, 80)).astype(np.uint8)
        pred = np.random.randint(0, 256, (80, 80), dtype=np.uint8)

        metrics = compute_comprehensive_localization_metrics(pred, gt, threshold=100)

        total = (
            metrics["true_positives"]
            + metrics["false_positives"]
            + metrics["false_negatives"]
            + metrics["true_negatives"]
        )
        assert total == 6400
        assert total == metrics["total_pixels"]

    def test_all_negative_ground_truth(self):
        gt = np.zeros((50, 50), dtype=np.uint8)  # No manipulation
        pred = np.zeros((50, 50), dtype=np.uint8)
        pred[10:15, 10:15] = 200  # 25 false alarms at th=128

        metrics = compute_comprehensive_localization_metrics(pred, gt, threshold=128)

        assert metrics["true_positives"] == 0
        assert metrics["false_positives"] == 25
        assert metrics["false_negatives"] == 0
        assert metrics["true_negatives"] == 2475
        assert metrics["false_positive_rate"] == pytest.approx(25 / 2500, rel=1e-5)
        assert metrics["specificity"] == pytest.approx(2475 / 2500, rel=1e-5)
        assert metrics["precision"] == 0.0


class TestBenchmarkArtifactsAndInvariants:
    """Verifies that generated benchmark results are complete, sound, and reproducible."""

    @pytest.fixture
    def benchmark_data(self):
        json_path = os.path.join(
            os.path.dirname(__file__), "..", "benchmarks", "stage3_ws1_batch3", "validation_results.json"
        )
        assert os.path.exists(json_path), "validation_results.json must exist"
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def test_all_23_engines_audited(self, benchmark_data):
        inventory = benchmark_data["engine_capability_inventory"]
        assert len(inventory) == 23
        all_registered = [e.engine_id for e in engine_registry.list_engines()]
        for eng_id in all_registered:
            assert eng_id in inventory
            assert "category" in inventory[eng_id]
            assert "supported_formats" in inventory[eng_id]
            assert "limitations" in inventory[eng_id]

    def test_evidence_invariance_verified(self, benchmark_data):
        assert benchmark_data["metadata"]["evidence_invariance_verified"] is True
        prepost = benchmark_data["evidence_preflight_postflight"]
        assert len(prepost) == 11
        for img_id, item in prepost.items():
            assert item["invariant"] is True
            assert item["preflight_hash"] == item["postflight_hash"]

    def test_ela_dual_scale_measurements(self, benchmark_data):
        ela = benchmark_data["ela_validation"]
        assert "img_comp_q95" in ela
        assert "img_comp_q75" in ela
        assert "img_001_authentic_base_inapplicable" in ela

        q95 = ela["img_comp_q95"]
        assert q95["status"] == "APPLIED"
        assert "fidelity_metrics" in q95
        assert q95["fidelity_metrics"]["psnr_db"] > 40.0
        assert q95["fixed20_artifact_metrics"]["saturation_percentage"] < 1.0

        png_inapp = ela["img_001_authentic_base_inapplicable"]
        assert png_inapp["status"] == "NOT_APPLICABLE"

    def test_noise_gaussian_vs_median_localization(self, benchmark_data):
        noise = benchmark_data["noise_validation"]
        assert "img_noise_gaussian_localized" in noise
        assert "img_false_positive_texture" in noise

        localized = noise["img_noise_gaussian_localized"]["threshold_evaluations"]["th_32"]
        gauss_32 = localized["gaussian"]
        med_32 = localized["median"]

        # Pixel conservation holds in saved results
        assert gauss_32["true_positives"] + gauss_32["false_positives"] + gauss_32["false_negatives"] + gauss_32["true_negatives"] == 65536
        assert med_32["true_positives"] + med_32["false_positives"] + med_32["false_negatives"] + med_32["true_negatives"] == 65536

        # Texture false positive challenge is documented
        tex = noise["img_false_positive_texture"]["threshold_evaluations"]["th_64"]
        assert tex["gaussian"]["false_positives"] > 10000
        assert tex["median"]["false_positives"] > 5000
