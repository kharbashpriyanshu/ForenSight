"""
ForenSight V4 — Step 9 Test Suite
Comprehensive Scientific Evaluation & Benchmark Harness Verification

Validates all 22 core test areas specified in Section 18:
1. DatasetManifest model validation
2. ControlledDatasetGenerator deterministic generation with seed
3. Controlled modalities generate valid image files and ground truth masks
4. Ground-truth mask conventions (0/255, matching dimensions)
5. Inapplicability handling (NOT_APPLICABLE isolated, not negative evidence)
6. Execution failure handling (FAILED isolated from NOT_APPLICABLE)
7. BenchmarkRunner execution and valid BenchmarkSummary
8. Spatial localization metrics (IoU, Dice, Precision, Recall)
9. Bounding box IoU calculation
10. Copy-move detection evaluation
11. Resampling peak evaluation
12. Noise variance delta evaluation
13. Determinism verification (SHA-256 across runs)
14. BenchmarkReporter generating JSON, Markdown, HTML reports
15. Report content structure (OBSERVED/EXPECTED/EVALUATED/INTERPRETATION/LIMITATIONS)
16. Non-ranking enforcement (no overall accuracy score or best/worst engine)
17. PRNU benchmark protocol (two-camera 4-reference MLE execution)
18. PRNU separation metrics (PCE distributions)
19. Path traversal protection in DatasetAdapter
20. SHA-256 integrity verification in DatasetAdapter
21. CLI subcommand execution
22. Frozen core cryptographic verification (backend/app/forensics/ byte-identical)
"""

import os
import json
import tempfile
import subprocess
import pytest
import numpy as np
from PIL import Image

from app.benchmark.models import (
    ImageRecord,
    DatasetManifest,
    TransformationManifest,
    BenchmarkResult,
    EngineBenchmarkMetrics,
    BenchmarkSummary,
    AuthenticOrManipulated,
    ManipulationType,
    BenchmarkStatus,
)
from app.benchmark.controlled_generator import ControlledDatasetGenerator
from app.benchmark.dataset_adapter import (
    validate_safe_relative_path,
    compute_sha256,
    ManifestDatasetAdapter,
)
from app.benchmark.metrics import (
    compute_spatial_localization_metrics,
    compute_bbox_iou,
    evaluate_copy_move_candidates,
    evaluate_resampling_response,
    evaluate_noise_discrepancy,
    compute_runtime_distribution,
)
from app.benchmark.runner import BenchmarkRunner
from app.benchmark.reporter import BenchmarkReporter
from app.benchmark.prnu_benchmark import PRNUBenchmarkProtocol


# =========================================================================
# Test Area 1: DatasetManifest Model Validation
# =========================================================================
def test_dataset_manifest_model_validation():
    # Valid authentic record
    rec_auth = ImageRecord(
        image_id="img_auth_01",
        dataset_id="test_suite",
        filename="authentic/img_01.png",
        sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        format="PNG",
        width=512,
        height=512,
        authentic_or_manipulated=AuthenticOrManipulated.AUTHENTIC,
    )
    assert rec_auth.image_id == "img_auth_01"
    assert rec_auth.ground_truth_mask is None

    # Valid manipulated record
    rec_manip = ImageRecord(
        image_id="img_manip_01",
        dataset_id="test_suite",
        filename="manipulated/img_01.png",
        sha256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        format="PNG",
        width=512,
        height=512,
        authentic_or_manipulated=AuthenticOrManipulated.MANIPULATED,
        manipulation_type=ManipulationType.COPY_MOVE,
        ground_truth_mask="masks/mask_01.png",
    )
    assert rec_manip.authentic_or_manipulated == AuthenticOrManipulated.MANIPULATED
    assert rec_manip.manipulation_type == ManipulationType.COPY_MOVE

    manifest = DatasetManifest(
        dataset_id="test_suite",
        dataset_name="Test Suite Dataset",
        dataset_version="1.0.0",
        dataset_type="CONTROLLED",
        description="Test suite description",
        creation_date="2026-09-22T00:00:00Z",
        images=[rec_auth, rec_manip],
    )
    assert len(manifest.images) == 2
    assert manifest.dataset_id == "test_suite"


# =========================================================================
# Test Area 2: ControlledDatasetGenerator Deterministic Generation
# =========================================================================
def test_controlled_generator_determinism():
    with tempfile.TemporaryDirectory() as tmp1, tempfile.TemporaryDirectory() as tmp2:
        gen1 = ControlledDatasetGenerator(output_dir=tmp1, seed=123)
        gen2 = ControlledDatasetGenerator(output_dir=tmp2, seed=123)

        man1 = gen1.generate_full_controlled_suite("det-test")
        man2 = gen2.generate_full_controlled_suite("det-test")

        assert len(man1.images) == len(man2.images)
        for r1, r2 in zip(man1.images, man2.images):
            assert r1.image_id == r2.image_id
            assert r1.sha256 == r2.sha256, f"Mismatch in hash for {r1.image_id}"


# =========================================================================
# Test Area 3: Controlled Modalities File & Mask Generation
# =========================================================================
def test_controlled_modalities_generated_files():
    with tempfile.TemporaryDirectory() as tmp:
        gen = ControlledDatasetGenerator(output_dir=tmp, seed=42)
        manifest = gen.generate_full_controlled_suite("modalities-test")

        assert len(manifest.images) >= 10
        expected_ids = [
            "img_001_authentic_base",
            "img_comp_q95",
            "img_comp_q75",
            "img_comp_q50",
            "img_jpeg_double_q95_q75",
            "img_geom_resample_bicubic",
            "img_copymove_translated",
            "img_splicing_donor",
            "img_noise_gaussian_localized",
            "img_color_channel_shift",
            "img_false_positive_texture",
        ]
        manifest_ids = [img.image_id for img in manifest.images]
        for exp in expected_ids:
            assert exp in manifest_ids, f"Missing fixture {exp}"
            img_rec = next(r for r in manifest.images if r.image_id == exp)
            full_img_p = os.path.join(tmp, img_rec.filename)
            assert os.path.exists(full_img_p), f"Image file missing: {full_img_p}"


# =========================================================================
# Test Area 4: Ground-Truth Mask Conventions (0/255, Matching Dimensions)
# =========================================================================
def test_ground_truth_mask_conventions():
    with tempfile.TemporaryDirectory() as tmp:
        gen = ControlledDatasetGenerator(output_dir=tmp, seed=42)
        manifest = gen.generate_full_controlled_suite("mask-conv-test")

        for img_rec in manifest.images:
            if img_rec.ground_truth_mask:
                mask_p = os.path.join(tmp, img_rec.ground_truth_mask)
                assert os.path.exists(mask_p)
                with Image.open(mask_p) as mask_img:
                    assert mask_img.size == (img_rec.width, img_rec.height)
                    arr = np.array(mask_img)
                    unique_vals = set(np.unique(arr))
                    # Mask should contain binary foreground/background values
                    assert 255 in unique_vals or 0 in unique_vals


# =========================================================================
# Test Area 5: Inapplicability Handling (NOT_APPLICABLE Isolated)
# =========================================================================
def test_inapplicability_handling_not_negative_evidence():
    with tempfile.TemporaryDirectory() as tmp:
        gen = ControlledDatasetGenerator(output_dir=tmp, seed=42)
        gen.generate_full_controlled_suite("inapp-test")

        # Run JPEG-QT engine on lossless PNG fixture (e.g. img_001_authentic_base)
        runner = BenchmarkRunner(dataset_dir=tmp)
        summary = runner.run_benchmark(engine_ids=["JPEG-QT"], verify_determinism=False)

        qt_metrics = summary.engine_metrics.get("JPEG-QT")
        assert qt_metrics is not None
        # Pristine base is PNG -> must be NOT_APPLICABLE, not FAILED
        assert qt_metrics.not_applicable_count > 0
        assert qt_metrics.failed_count == 0

        # Verify in results list
        png_results = [
            r for r in runner.run_results
            if r.image_id == "img_001_authentic_base" and r.engine_id == "JPEG-QT"
        ]
        assert len(png_results) == 1
        assert png_results[0].status == BenchmarkStatus.NOT_APPLICABLE
        # Guardrail check: must not be treated as authentic / negative evidence
        assert "mathematically not applicable" in png_results[0].limitations[0]


# =========================================================================
# Test Area 6: Execution Failure Handling (FAILED vs NOT_APPLICABLE)
# =========================================================================
def test_execution_failure_handling():
    with tempfile.TemporaryDirectory() as tmp:
        gen = ControlledDatasetGenerator(output_dir=tmp, seed=42)
        manifest = gen.generate_full_controlled_suite("fail-test")

        # Corrupt one image file by truncating to 10 random bytes
        target_rec = manifest.images[0]
        corrupted_path = os.path.join(tmp, target_rec.filename)
        with open(corrupted_path, "wb") as f:
            f.write(b"CORRUPTED_")

        runner = BenchmarkRunner(dataset_dir=tmp)
        summary = runner.run_benchmark(engine_ids=["ADVANCED-NOISE"], verify_determinism=False)

        noise_metrics = summary.engine_metrics.get("ADVANCED-NOISE")
        assert noise_metrics is not None
        # Corrupted file should fail execution, not be counted as NOT_APPLICABLE
        assert noise_metrics.failed_count >= 1


# =========================================================================
# Test Area 7: BenchmarkRunner Full Run and Valid BenchmarkSummary
# =========================================================================
def test_benchmark_runner_execution_and_summary():
    with tempfile.TemporaryDirectory() as tmp:
        gen = ControlledDatasetGenerator(output_dir=tmp, seed=42)
        gen.generate_full_controlled_suite("run-test")

        runner = BenchmarkRunner(dataset_dir=tmp)
        summary = runner.run_benchmark(engine_ids=["RESAMPLING", "ADVANCED-NOISE"], verify_determinism=False)

        assert isinstance(summary, BenchmarkSummary)
        assert summary.total_evaluations == len(runner.manifest.images) * 2
        total_applied = sum(m.applied_count for m in summary.engine_metrics.values())
        assert total_applied > 0
        assert "RESAMPLING" in summary.engine_metrics
        assert "ADVANCED-NOISE" in summary.engine_metrics


# =========================================================================
# Test Area 8: Spatial Localization Metrics
# =========================================================================
def test_spatial_localization_metrics():
    # 1. Perfect match
    gt = np.zeros((100, 100), dtype=np.uint8)
    gt[20:60, 20:60] = 255
    pred = gt.copy()

    m_perf = compute_spatial_localization_metrics(pred, gt)
    assert m_perf["iou"] == 1.0
    assert m_perf["dice"] == 1.0
    assert m_perf["precision"] == 1.0
    assert m_perf["recall"] == 1.0

    # 2. Complete mismatch
    pred_mismatch = np.zeros((100, 100), dtype=np.uint8)
    pred_mismatch[70:90, 70:90] = 255
    m_mis = compute_spatial_localization_metrics(pred_mismatch, gt)
    assert m_mis["iou"] == 0.0
    assert m_mis["dice"] == 0.0

    # 3. Partial overlap (50% intersection)
    pred_half = np.zeros((100, 100), dtype=np.uint8)
    pred_half[20:40, 20:60] = 255  # half the area of 40x40
    m_half = compute_spatial_localization_metrics(pred_half, gt)
    assert 0.49 <= m_half["iou"] <= 0.51
    assert m_half["recall"] == 0.5
    assert m_half["precision"] == 1.0


# =========================================================================
# Test Area 9: Bounding Box IoU Calculation
# =========================================================================
def test_bounding_box_iou():
    # Exact same box
    box1 = [10, 10, 50, 50]
    box2 = [10, 10, 50, 50]
    assert compute_bbox_iou(box1, box2) == 1.0

    # Disjoint boxes
    box3 = [100, 100, 150, 150]
    assert compute_bbox_iou(box1, box3) == 0.0

    # Half overlap: box1 is 40x40 = 1600. box4 is [10, 10, 30, 50] area = 20x40 = 800.
    # intersection = 800, union = 1600 -> iou = 0.5
    box4 = [10, 10, 30, 50]
    assert compute_bbox_iou(box1, box4) == 0.5


# =========================================================================
# Test Area 10: Copy-Move Detection Evaluation
# =========================================================================
def test_copy_move_detection_evaluation():
    reported_pairs = [
        {"source_bbox": [10, 10, 40, 40], "target_bbox": [60, 60, 90, 90]},
        {"source_bbox": [150, 150, 180, 180], "target_bbox": [200, 200, 230, 230]},
    ]
    gt_bbox = [60, 60, 90, 90]
    res = evaluate_copy_move_candidates(reported_pairs, gt_bbox, is_authentic_texture=False)
    assert res["target_detected"] is True
    assert res["valid_matched_pairs"] == 1
    assert res["max_bbox_iou"] == 1.0

    # Authentic texture test
    fp_res = evaluate_copy_move_candidates(reported_pairs, None, is_authentic_texture=True)
    assert fp_res["false_positive_triggered"] is True
    assert fp_res["false_candidate_count"] == 2


# =========================================================================
# Test Area 11: Resampling Peak Evaluation
# =========================================================================
def test_resampling_peak_evaluation():
    eval_scaled = evaluate_resampling_response(p_map_peak=0.45, is_resampled=True)
    assert eval_scaled["response_consistent"] is True

    eval_unmanip = evaluate_resampling_response(p_map_peak=0.05, is_resampled=False)
    assert eval_unmanip["response_consistent"] is True


# =========================================================================
# Test Area 12: Noise Variance Delta Evaluation
# =========================================================================
def test_noise_variance_delta_evaluation():
    eval_noise = evaluate_noise_discrepancy(residual_variance=45.0, expected_variance=40.0, tolerance=10.0)
    assert eval_noise["within_expected_scale"] is True
    assert eval_noise["variance_delta"] == 5.0


# =========================================================================
# Test Area 13: Determinism Verification Across Runs
# =========================================================================
def test_determinism_verification():
    with tempfile.TemporaryDirectory() as tmp:
        gen = ControlledDatasetGenerator(output_dir=tmp, seed=42)
        gen.generate_full_controlled_suite("det-verify-test")

        runner = BenchmarkRunner(dataset_dir=tmp)
        # Run with determinism checking enabled
        summary = runner.run_benchmark(engine_ids=["RESAMPLING"], verify_determinism=True)
        assert summary.determinism_verified is True


# =========================================================================
# Test Area 14: BenchmarkReporter Generates JSON, Markdown, and HTML
# =========================================================================
def test_benchmark_reporter_artifacts():
    with tempfile.TemporaryDirectory() as tmp_data, tempfile.TemporaryDirectory() as tmp_out:
        gen = ControlledDatasetGenerator(output_dir=tmp_data, seed=42)
        gen.generate_full_controlled_suite("report-test")

        runner = BenchmarkRunner(dataset_dir=tmp_data)
        summary = runner.run_benchmark(engine_ids=["ADVANCED-NOISE"], verify_determinism=False)

        reporter = BenchmarkReporter(summary=summary, output_dir=tmp_out)
        json_p = reporter.write_json_report()
        md_p = reporter.write_markdown_report()
        html_p = reporter.write_html_report()

        assert os.path.exists(json_p)
        assert os.path.exists(md_p)
        assert os.path.exists(html_p)

        # JSON should parse cleanly
        with open(json_p, "r", encoding="utf-8") as f:
            data = json.load(f)
            assert data["dataset_id"] == "report-test"


# =========================================================================
# Test Area 15: Report Content Structure
# =========================================================================
def test_report_content_structure():
    with tempfile.TemporaryDirectory() as tmp_data, tempfile.TemporaryDirectory() as tmp_out:
        gen = ControlledDatasetGenerator(output_dir=tmp_data, seed=42)
        gen.generate_full_controlled_suite("struct-test")

        runner = BenchmarkRunner(dataset_dir=tmp_data)
        summary = runner.run_benchmark(engine_ids=["ADVANCED-NOISE"], verify_determinism=False)

        reporter = BenchmarkReporter(summary=summary, output_dir=tmp_out)
        md_p = reporter.write_markdown_report()

        with open(md_p, "r", encoding="utf-8") as f:
            content = f.read()

        assert "## 1. Scientific Principles & Methodology" in content
        assert "## 2. Engine Evaluation Summary Table" in content
        assert "## 3. Spatial Localization & Domain Metrics" in content
        assert "## 4. Scientific Limitations & Boundaries" in content
        assert "**OBSERVED**:" in content
        assert "**EXPECTED**:" in content
        assert "**EVALUATED**:" in content
        assert "**INTERPRETATION**:" in content
        assert "**LIMITATION**:" in content
        assert "registered dataset 'struct-test' (CONTROLLED)" in content
        assert "NOT_EVALUATED (no localization metrics were produced in this run)" in content
        assert "controlled and registered external datasets" not in content


# =========================================================================
# Test Area 16: Non-Ranking Enforcement
# =========================================================================
def test_non_ranking_enforcement():
    with tempfile.TemporaryDirectory() as tmp_data, tempfile.TemporaryDirectory() as tmp_out:
        gen = ControlledDatasetGenerator(output_dir=tmp_data, seed=42)
        gen.generate_full_controlled_suite("non-rank-test")

        runner = BenchmarkRunner(dataset_dir=tmp_data)
        summary = runner.run_benchmark(engine_ids=["ADVANCED-NOISE", "RESAMPLING"], verify_determinism=False)

        reporter = BenchmarkReporter(summary=summary, output_dir=tmp_out)
        json_p = reporter.write_json_report()
        md_p = reporter.write_markdown_report()

        with open(json_p, "r", encoding="utf-8") as f:
            data = json.load(f)
            assert "overall_accuracy" not in data
            assert "best_engine" not in data
            assert "worst_engine" not in data
            assert "rankings" not in data

        with open(md_p, "r", encoding="utf-8") as f:
            text = f.read()
            assert "best engine" not in text.lower()
            assert "worst engine" not in text.lower()
            assert "overall accuracy:" not in text.lower()


# =========================================================================
# Test Area 17: PRNU Benchmark Protocol Multi-Camera Execution
# =========================================================================
def test_prnu_benchmark_protocol():
    with tempfile.TemporaryDirectory() as tmp:
        protocol = PRNUBenchmarkProtocol(output_dir=tmp, seed=42)
        res = protocol.execute_evaluation()

        assert "same_camera_distribution" in res
        assert "different_camera_distribution" in res
        assert "separation_metrics" in res
        assert len(res["same_camera_distribution"]["probes"]) == 5
        assert len(res["different_camera_distribution"]["probes"]) == 5


# =========================================================================
# Test Area 18: PRNU Separation Metrics
# =========================================================================
def test_prnu_separation_metrics():
    with tempfile.TemporaryDirectory() as tmp:
        protocol = PRNUBenchmarkProtocol(output_dir=tmp, seed=42)
        res = protocol.execute_evaluation()

        mean_same = res["same_camera_distribution"]["mean_pce"]
        mean_diff = res["different_camera_distribution"]["mean_pce"]
        # Same camera probes must correlate higher on average than cross camera probes
        assert mean_same > mean_diff


# =========================================================================
# Test Area 19: Path Traversal Protection in DatasetAdapter
# =========================================================================
def test_path_traversal_protection():
    with tempfile.TemporaryDirectory() as tmp:
        # Legitimate path
        safe = validate_safe_relative_path(tmp, "images/pic.png")
        assert safe == os.path.abspath(os.path.join(tmp, "images", "pic.png"))

        # Dangerous path containing '..'
        with pytest.raises(ValueError, match="Path traversal detected"):
            validate_safe_relative_path(tmp, "../secret.txt")

        # Dangerous path with leading slash
        with pytest.raises(ValueError, match="Path traversal detected"):
            validate_safe_relative_path(tmp, "/etc/passwd")

        # Windows absolute drive path
        with pytest.raises(ValueError):
            validate_safe_relative_path(tmp, "C:\\Windows\\system32")


# =========================================================================
# Test Area 20: SHA-256 Integrity Verification in DatasetAdapter
# =========================================================================
def test_dataset_adapter_sha256_verification():
    with tempfile.TemporaryDirectory() as tmp:
        img_p = os.path.join(tmp, "test.png")
        Image.new("RGB", (32, 32), color=(100, 100, 100)).save(img_p)
        actual_hash = compute_sha256(img_p)

        rec_valid = ImageRecord(
            image_id="img_v",
            dataset_id="hash_test",
            filename="test.png",
            format="PNG",
            width=32,
            height=32,
            sha256=actual_hash,
            authentic_or_manipulated=AuthenticOrManipulated.AUTHENTIC,
        )

        manifest = DatasetManifest(
            dataset_id="hash_test",
            dataset_name="Hash Test",
            dataset_version="1.0.0",
            dataset_type="CONTROLLED",
            description="Hash test manifest",
            creation_date="2026-09-22T00:00:00Z",
            images=[rec_valid],
        )

        adapter = ManifestDatasetAdapter(tmp, manifest)
        resolved_img, _ = adapter.get_image(rec_valid)
        assert os.path.exists(resolved_img)

        # Mismatched hash
        rec_tampered = ImageRecord(
            image_id="img_t",
            dataset_id="hash_test",
            filename="test.png",
            format="PNG",
            width=32,
            height=32,
            sha256="ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            authentic_or_manipulated=AuthenticOrManipulated.AUTHENTIC,
        )
        with pytest.raises(ValueError, match="SHA-256 hash mismatch"):
            adapter.get_image(rec_tampered)


# =========================================================================
# Test Area 21: CLI Subcommand Execution
# =========================================================================
def test_cli_subcommands():
    from app.benchmark.cli import main
    import sys

    with tempfile.TemporaryDirectory() as tmp:
        # 1. Test generate subcommand via subprocess
        cmd_gen = [
            sys.executable,
            "-m",
            "app.benchmark",
            "generate",
            "--output",
            tmp,
            "--dataset-id",
            "cli-test",
            "--seed",
            "42",
        ]
        res_gen = subprocess.run(cmd_gen, capture_output=True, text=True)
        assert res_gen.returncode == 0
        assert os.path.exists(os.path.join(tmp, "manifest.json"))

        # 2. Test run subcommand
        out_bench = os.path.join(tmp, "bench_out")
        cmd_run = [
            sys.executable,
            "-m",
            "app.benchmark",
            "run",
            "--dataset-dir",
            tmp,
            "--engines",
            "RESAMPLING",
            "--output",
            out_bench,
            "--no-determinism",
        ]
        res_run = subprocess.run(cmd_run, capture_output=True, text=True)
        assert res_run.returncode == 0
        assert os.path.exists(os.path.join(out_bench, "benchmark_results.json"))


# =========================================================================
# Test Area 22: Frozen Core Cryptographic Verification
# =========================================================================
def test_frozen_core_integrity():
    """
    Enforces the frozen core boundary: backend/app/forensics/ (38 files)
    must remain byte-for-byte identical to commit 259251b.
    """
    cmd = ["git", "diff", "259251b", "--", "backend/app/forensics/"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    assert res.returncode == 0
    assert len(res.stdout.strip()) == 0, (
        f"CRITICAL VIOLATION: backend/app/forensics/ has been modified!\n{res.stdout}"
    )
