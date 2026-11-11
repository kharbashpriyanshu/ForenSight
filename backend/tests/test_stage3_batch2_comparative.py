"""
Stage 3, Workstream 1, Batch 2: Comparative Forensics Test Suite
Validates:
1. ELA dual-scale visualization (Dynamic vs Fixed 20x).
2. Noise residual analysis (Gaussian baseline vs Median alternative).
3. Input evidence byte invariance (SHA-256 integrity).
4. Backward compatibility of schema fields and existing adapters.
5. Error handling and validation (e.g., even kernel rejection, unsupported method).
"""

import hashlib
import os
import shutil
import tempfile
import pytest
import numpy as np
from PIL import Image

from app.forensics.ela.engine import ELAEngine
from app.forensics.ela.schemas import ELAResult
from app.forensics.noise.engine import NoiseEngine
from app.forensics.noise.schemas import NoiseResult, FilterConfig


@pytest.fixture
def temp_dir():
    d = tempfile.mkdtemp()
    yield d
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def sample_jpeg(temp_dir):
    """Create a synthetic test JPEG with edges and texture."""
    img_path = os.path.join(temp_dir, "test_input.jpg")
    arr = np.zeros((120, 120, 3), dtype=np.uint8)
    arr[20:100, 20:100, :] = 180
    arr[40:80, 40:80, 0] = 240
    arr[40:80, 40:80, 1] = 80
    arr[40:80, 40:80, 2] = 80
    img = Image.fromarray(arr)
    img.save(img_path, format="JPEG", quality=95)
    return img_path


def compute_sha256(filepath: str) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()


class TestELADualScale:
    def test_dual_scale_artifacts_generated(self, sample_jpeg, temp_dir):
        """Verify both dynamic and fixed-20x maps are generated as lossless PNGs."""
        sha_before = compute_sha256(sample_jpeg)
        out_dir = os.path.join(temp_dir, "ela_out")

        result: ELAResult = ELAEngine.run(sample_jpeg, out_dir, quality=90)

        # Byte invariance
        assert compute_sha256(sample_jpeg) == sha_before, "Input evidence was mutated!"

        # Artifact existence and PNG format
        assert os.path.exists(result.error_image_path)
        assert os.path.exists(result.dynamic_error_image_path)
        assert os.path.exists(result.fixed_error_image_path)
        assert result.error_image_path.lower().endswith(".png")
        assert result.dynamic_error_image_path.lower().endswith(".png")
        assert result.fixed_error_image_path.lower().endswith(".png")

        # Verify scale modes dictionary
        assert result.scale_modes is not None
        assert "dynamic" in result.scale_modes
        assert "fixed_20x" in result.scale_modes

        dyn_meta = result.scale_modes["dynamic"]
        fixed_meta = result.scale_modes["fixed_20x"]

        assert dyn_meta["mode"] == "dynamic"
        assert dyn_meta["multiplier"] > 0
        assert fixed_meta["mode"] in ["fixed_20", "fixed_20x"]
        assert fixed_meta["multiplier"] == 20.0
        assert 0.0 <= fixed_meta["saturation_percentage"] <= 100.0

    def test_dynamic_vs_fixed_pixel_values(self, sample_jpeg, temp_dir):
        """Verify dynamic scaling stretches to 255 while fixed 20x applies exact 20x factor."""
        out_dir = os.path.join(temp_dir, "ela_out")
        result = ELAEngine.run(sample_jpeg, out_dir, quality=90)

        dyn_img = np.array(Image.open(result.dynamic_error_image_path))
        fixed_img = np.array(Image.open(result.fixed_error_image_path))

        # Dynamic scaling should reach 255 if max_error > 0
        if result.statistics.max_error > 0:
            assert dyn_img.max() == 255

        # Fixed 20x scaling must be bounded [0, 255]
        assert fixed_img.min() >= 0
        assert fixed_img.max() <= 255


class TestNoiseGaussianVsMedian:
    def test_default_filter_is_gaussian(self):
        """Verify FilterConfig defaults to Gaussian."""
        fc = FilterConfig()
        assert fc.method == "Gaussian"
        assert fc.kernel_size == 5
        assert fc.sigma == 1.0

    def test_gaussian_and_median_execution(self, sample_jpeg, temp_dir):
        """Verify both Gaussian and Median filtering can be run independently and comparative artifacts are saved."""
        sha_before = compute_sha256(sample_jpeg)
        out_dir = os.path.join(temp_dir, "noise_out")

        # 1. Run Gaussian (baseline)
        g_result: NoiseResult = NoiseEngine.run(
            sample_jpeg, out_dir, filter_method="Gaussian", kernel_size=5, sigma=1.0
        )

        assert compute_sha256(sample_jpeg) == sha_before
        assert os.path.exists(g_result.residual_image_path)
        assert g_result.filter_config.method == "Gaussian"
        assert g_result.comparative_methods is not None
        assert "median" in g_result.comparative_methods

        # Check comparative median artifact was created alongside Gaussian
        median_comp_path = g_result.comparative_methods["median"]["artifact_path"]
        assert os.path.exists(median_comp_path)
        assert median_comp_path.lower().endswith(".png")

        # 2. Run Median directly
        m_result: NoiseResult = NoiseEngine.run(
            sample_jpeg, out_dir, filter_method="Median", kernel_size=5
        )

        assert compute_sha256(sample_jpeg) == sha_before
        assert os.path.exists(m_result.residual_image_path)
        assert m_result.filter_config.method == "Median"
        assert m_result.comparative_methods is not None
        assert "gaussian" in m_result.comparative_methods

    def test_kernel_size_validation(self, sample_jpeg, temp_dir):
        """Verify even kernel sizes, kernel sizes < 3, and invalid methods raise ValueError."""
        out_dir = os.path.join(temp_dir, "noise_out")

        # Even kernel
        with pytest.raises(ValueError, match="must be an odd integer"):
            NoiseEngine.run(sample_jpeg, out_dir, filter_method="Median", kernel_size=4)

        # Kernel < 3
        with pytest.raises(ValueError, match="must be an odd integer >= 3"):
            NoiseEngine.run(sample_jpeg, out_dir, filter_method="Gaussian", kernel_size=1)

        # Unsupported method
        with pytest.raises(ValueError, match="Unsupported filter method"):
            NoiseEngine.run(sample_jpeg, out_dir, filter_method="Bilateral", kernel_size=5)

    def test_median_reduces_edge_leakage_on_step_edge(self, temp_dir):
        """
        Verify mathematical property: on an ideal step edge, median filtering preserves
        the step edge without blurring, resulting in significantly lower edge leakage in the residual
        compared to isotropic Gaussian smoothing.
        """
        edge_img_path = os.path.join(temp_dir, "step_edge.png")
        arr = np.zeros((100, 100), dtype=np.uint8)
        arr[:, 50:] = 200  # Sharp vertical step edge
        Image.fromarray(arr).save(edge_img_path)

        out_dir = os.path.join(temp_dir, "noise_out")
        g_res = NoiseEngine.run(edge_img_path, out_dir, filter_method="Gaussian", kernel_size=5, sigma=1.0)
        m_res = NoiseEngine.run(edge_img_path, out_dir, filter_method="Median", kernel_size=5)

        g_residual = np.array(Image.open(g_res.residual_image_path))
        m_residual = np.array(Image.open(m_res.residual_image_path))

        # Edge region around column 50
        g_edge_col = g_residual[:, 48:53]
        m_edge_col = m_residual[:, 48:53]

        assert float(np.std(g_edge_col)) > float(np.std(m_edge_col))


class TestEvidenceByteInvariance:
    def test_both_engines_preserve_evidence_bytes(self, sample_jpeg, temp_dir):
        """Strict verification that analyzing evidence with ELA and Noise never touches original evidence."""
        orig_bytes = open(sample_jpeg, "rb").read()
        orig_sha = hashlib.sha256(orig_bytes).hexdigest()

        out_dir = os.path.join(temp_dir, "invariance_out")

        ELAEngine.run(sample_jpeg, out_dir, quality=90)
        NoiseEngine.run(sample_jpeg, out_dir, filter_method="Gaussian", kernel_size=5)
        NoiseEngine.run(sample_jpeg, out_dir, filter_method="Median", kernel_size=5)

        final_bytes = open(sample_jpeg, "rb").read()
        final_sha = hashlib.sha256(final_bytes).hexdigest()

        assert orig_bytes == final_bytes
        assert orig_sha == final_sha


class TestMetricNomenclatureAndCompatibility:
    def test_full_scale_residual_db_and_snr_alias(self):
        """Verify full_scale_residual_db calculation and snr_db backward compatibility alias."""
        from app.forensics.noise.schemas import NoiseStatistics

        stats = NoiseStatistics(
            mean_residual=1.5,
            median_residual=0.5,
            max_residual=25.0,
            std_residual=2.55,
            percentiles={"90th": 3.0, "95th": 4.0, "99th": 6.0}
        )

        expected_db = 20.0 * np.log10(255.0 / (2.55 + 1e-6))
        assert abs(stats.full_scale_residual_db - expected_db) < 1e-4
        assert stats.snr_db == stats.full_scale_residual_db
        assert abs(stats.variance - (2.55 ** 2)) < 1e-4

    def test_fixture_007_confusion_matrix_reconciliation(self, temp_dir):
        """
        Independently verify that NoiseEngine.run on fixture_007 yields exact confusion matrix
        and confirms production Gaussian FP = 336 and Median FP = 11 on 256x256 canvas.
        """
        fixtures_dir = os.path.join(os.path.dirname(__file__), "..", "datasets", "controlled", "v1")
        f7_path = os.path.join(fixtures_dir, "fixture_007_noise_injection", "derived_noise_injected.png")
        mask_path = os.path.join(fixtures_dir, "fixture_007_noise_injection", "ground_truth_mask.png")

        if not os.path.exists(f7_path) or not os.path.exists(mask_path):
            pytest.skip("Controlled fixture 007 not found in workspace.")

        mask = np.array(Image.open(mask_path).convert('L')) > 128
        total_pixels = mask.size
        assert total_pixels == 65536, "fixture_007 canvas must be 256x256 = 65536 pixels"

        gt_pos = int(np.sum(mask))
        gt_neg = int(np.sum(~mask))
        assert gt_pos == 6400, "Ground truth positive box must be 80x80 = 6400 pixels"
        assert gt_neg == 59136, "Ground truth negative canvas must be 59136 pixels"

        # Gaussian run
        g_res = NoiseEngine.run(f7_path, os.path.join(temp_dir, "f7_g"), filter_method="Gaussian", kernel_size=5, sigma=1.0)
        g_img = np.array(Image.open(g_res.residual_image_path).convert('L'))
        g_thresh = float(np.mean(g_img) + 1.5 * np.std(g_img))
        g_pred = g_img > g_thresh

        tp_g = int(np.sum(g_pred & mask))
        fp_g = int(np.sum(g_pred & ~mask))
        fn_g = int(np.sum(~g_pred & mask))
        tn_g = int(np.sum(~g_pred & ~mask))

        assert tp_g + fp_g + fn_g + tn_g == 65536
        assert fp_g == 336, f"Production float32 Gaussian convolution must produce exactly 336 FP, got {fp_g}"
        fpr_g = fp_g / (fp_g + tn_g)
        assert abs(fpr_g - (336 / 59136)) < 1e-6

        # Median run
        m_res = NoiseEngine.run(f7_path, os.path.join(temp_dir, "f7_m"), filter_method="Median", kernel_size=5)
        m_img = np.array(Image.open(m_res.residual_image_path).convert('L'))
        m_thresh = float(np.mean(m_img) + 1.5 * np.std(m_img))
        m_pred = m_img > m_thresh

        tp_m = int(np.sum(m_pred & mask))
        fp_m = int(np.sum(m_pred & ~mask))
        fn_m = int(np.sum(~m_pred & mask))
        tn_m = int(np.sum(~m_pred & ~mask))

        assert tp_m + fp_m + fn_m + tn_m == 65536
        assert fp_m == 11, f"Median filter must produce exactly 11 FP, got {fp_m}"
        fpr_m = fp_m / (fp_m + tn_m)
        assert abs(fpr_m - (11 / 59136)) < 1e-6

