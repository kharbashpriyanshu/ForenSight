"""
Unit and Mathematical Validation Test Suite for Foundational DIP Fidelity Metrics
(Stage 3 Workstream 2 Batch 1)

Validates mathematical correctness, boundary conditions, and exception contracts for:
- calculate_mse
- calculate_psnr
- calculate_ssim
"""

import math
import numpy as np
import pytest

from app.forensics.metrics.fidelity import (
    calculate_mse,
    calculate_psnr,
    calculate_ssim,
    validate_image_pair,
    resolve_data_range,
)


# =============================================================================
# 1. Validation & Data Range Resolution Tests
# =============================================================================

class TestInputValidationAndDataRange:
    """Tests input shape, type, and data_range resolution policies."""

    def test_non_numpy_input_raises_type_error(self):
        with pytest.raises(TypeError, match="numpy.ndarray"):
            validate_image_pair([1, 2, 3], np.zeros((10, 10)))  # type: ignore

        with pytest.raises(TypeError, match="numpy.ndarray"):
            validate_image_pair(np.zeros((10, 10)), "not an array")  # type: ignore

    def test_non_numeric_dtype_raises_type_error(self):
        arr_bool = np.zeros((10, 10), dtype=bool)
        arr_valid = np.zeros((10, 10), dtype=np.uint8)
        with pytest.raises(TypeError, match="numeric"):
            validate_image_pair(arr_bool, arr_valid)

    def test_empty_array_raises_value_error(self):
        empty = np.array([], dtype=np.float64)
        valid = np.zeros((10, 10), dtype=np.float64)
        with pytest.raises(ValueError, match="empty"):
            validate_image_pair(empty, empty)
        with pytest.raises(ValueError, match="empty"):
            validate_image_pair(empty, valid)

    def test_shape_mismatch_raises_value_error(self):
        arr1 = np.zeros((10, 10), dtype=np.uint8)
        arr2 = np.zeros((10, 12), dtype=np.uint8)
        with pytest.raises(ValueError, match="shapes must match identically"):
            validate_image_pair(arr1, arr2)

    def test_unsupported_dimensions_raises_value_error(self):
        arr_1d = np.zeros((10,), dtype=np.float64)
        with pytest.raises(ValueError, match="dimensionality: 1D"):
            validate_image_pair(arr_1d, arr_1d)

        arr_4d = np.zeros((2, 10, 10, 3), dtype=np.float64)
        with pytest.raises(ValueError, match="dimensionality: 4D"):
            validate_image_pair(arr_4d, arr_4d)

    def test_channel_dimension_zero_raises_value_error(self):
        arr_zero_ch = np.zeros((10, 10, 0), dtype=np.float64)
        with pytest.raises(ValueError, match="empty"):
            validate_image_pair(arr_zero_ch, arr_zero_ch)

    def test_nan_or_inf_raises_value_error(self):
        ref = np.zeros((10, 10), dtype=np.float64)
        comp_nan = np.zeros((10, 10), dtype=np.float64)
        comp_nan[5, 5] = np.nan
        with pytest.raises(ValueError, match="NaN or infinity"):
            validate_image_pair(ref, comp_nan)

        comp_inf = np.zeros((10, 10), dtype=np.float64)
        comp_inf[5, 5] = np.inf
        with pytest.raises(ValueError, match="NaN or infinity"):
            validate_image_pair(comp_inf, ref)

    def test_data_range_explicit_positive_valid(self):
        ref = np.zeros((10, 10), dtype=np.uint8)
        assert resolve_data_range(ref, data_range=255.0) == 255.0
        assert resolve_data_range(ref, data_range=1.0) == 1.0
        assert resolve_data_range(ref, data_range=4095) == 4095.0

    def test_data_range_explicit_invalid_raises_value_error(self):
        ref = np.zeros((10, 10), dtype=np.uint8)
        with pytest.raises(ValueError, match="positive finite number"):
            resolve_data_range(ref, data_range=0.0)
        with pytest.raises(ValueError, match="positive finite number"):
            resolve_data_range(ref, data_range=-10.0)
        with pytest.raises(ValueError, match="positive finite number"):
            resolve_data_range(ref, data_range=float("nan"))
        with pytest.raises(ValueError, match="positive finite number"):
            resolve_data_range(ref, data_range=float("inf"))
        with pytest.raises(ValueError, match="numeric value"):
            resolve_data_range(ref, data_range=True)  # type: ignore

    def test_data_range_inferred_uint8_and_uint16(self):
        ref_u8 = np.zeros((10, 10), dtype=np.uint8)
        assert resolve_data_range(ref_u8) == 255.0

        ref_u16 = np.zeros((10, 10), dtype=np.uint16)
        assert resolve_data_range(ref_u16) == 65535.0

    def test_data_range_inferred_float_in_unit_interval(self):
        ref_f32 = np.array([[0.0, 0.5], [0.8, 1.0]], dtype=np.float32)
        assert resolve_data_range(ref_f32) == 1.0

        ref_f64 = np.array([[0.1, 0.2], [0.3, 0.4]], dtype=np.float64)
        assert resolve_data_range(ref_f64) == 1.0

    def test_data_range_inferred_float_outside_unit_interval_raises(self):
        ref_f = np.array([[0.0, 10.0], [20.0, 255.0]], dtype=np.float64)
        with pytest.raises(ValueError, match="outside \\[0.0, 1.0\\]"):
            resolve_data_range(ref_f)

    def test_data_range_inferred_unsupported_dtype_raises(self):
        ref_int32 = np.zeros((10, 10), dtype=np.int32)
        with pytest.raises(ValueError, match="Cannot infer data_range automatically"):
            resolve_data_range(ref_int32)


# =============================================================================
# 2. Mean Squared Error (MSE) Tests
# =============================================================================

class TestMeanSquaredError:
    """Validates mathematical correctness and precision of calculate_mse."""

    def test_mse_identical_arrays_returns_exact_zero(self):
        ref_2d = np.array([[10, 20], [30, 40]], dtype=np.uint8)
        assert calculate_mse(ref_2d, ref_2d) == 0.0

        ref_3d = np.ones((16, 16, 3), dtype=np.float32) * 0.5
        assert calculate_mse(ref_3d, ref_3d) == 0.0

    def test_mse_analytically_known_calculation(self):
        # 2x2 grid with known errors:
        # ref:  [[10, 20], [30, 40]]
        # comp: [[12, 18], [30, 45]]
        # diffs:   [ 2, -2,  0,  5]
        # squared: [ 4,  4,  0, 25]
        # sum: 33, mean = 33 / 4 = 8.25
        ref = np.array([[10, 20], [30, 40]], dtype=np.uint8)
        comp = np.array([[12, 18], [30, 45]], dtype=np.uint8)
        expected_mse = 8.25
        assert calculate_mse(ref, comp) == expected_mse

    def test_mse_unsigned_integer_underflow_safety(self):
        # In uint8: 10 - 20 would underflow to 246 without proper float64 casting
        # Correct diff: -10, squared: 100.0
        ref = np.array([[10]], dtype=np.uint8)
        comp = np.array([[20]], dtype=np.uint8)
        assert calculate_mse(ref, comp) == 100.0

    def test_mse_multichannel_arrays(self):
        # 1x1x3 pixel:
        # ch0 diff: 2 -> sq 4
        # ch1 diff: 4 -> sq 16
        # ch2 diff: 6 -> sq 36
        # mean: (4 + 16 + 36) / 3 = 56 / 3 = 18.666666666666668
        ref = np.zeros((1, 1, 3), dtype=np.float64)
        comp = np.zeros((1, 1, 3), dtype=np.float64)
        comp[0, 0, :] = [2.0, 4.0, 6.0]
        expected_mse = 56.0 / 3.0
        assert math.isclose(calculate_mse(ref, comp), expected_mse, rel_tol=1e-12)

    def test_mse_floating_point_precision(self):
        ref = np.full((10, 10), 0.123456789, dtype=np.float64)
        comp = np.full((10, 10), 0.123456780, dtype=np.float64)
        expected_diff = 0.123456789 - 0.123456780
        expected_mse = expected_diff ** 2
        assert math.isclose(calculate_mse(ref, comp), expected_mse, rel_tol=1e-10)

    def test_mse_shape_mismatch_raises_value_error(self):
        ref = np.zeros((20, 20), dtype=np.uint8)
        comp = np.zeros((20, 21), dtype=np.uint8)
        with pytest.raises(ValueError, match="shapes must match"):
            calculate_mse(ref, comp)

    def test_mse_empty_array_raises_value_error(self):
        with pytest.raises(ValueError, match="empty"):
            calculate_mse(np.array([]), np.array([]))

    def test_mse_nan_raises_value_error(self):
        ref = np.zeros((10, 10))
        comp = np.zeros((10, 10))
        comp[0, 0] = np.nan
        with pytest.raises(ValueError, match="NaN or infinity"):
            calculate_mse(ref, comp)


# =============================================================================
# 3. Peak Signal-to-Noise Ratio (PSNR) Tests
# =============================================================================

class TestPeakSignalToNoiseRatio:
    """Validates mathematical correctness, logarithmic scaling, and infinite bounds."""

    def test_psnr_identical_images_returns_positive_infinity(self):
        ref_u8 = np.full((32, 32), 128, dtype=np.uint8)
        psnr_u8 = calculate_psnr(ref_u8, ref_u8)
        assert math.isinf(psnr_u8) and psnr_u8 > 0.0

        ref_f = np.full((32, 32, 3), 0.5, dtype=np.float64)
        psnr_f = calculate_psnr(ref_f, ref_f)
        assert math.isinf(psnr_f) and psnr_f > 0.0

    def test_psnr_analytically_known_calculation_uint8(self):
        # Reference vs comparison with constant offset diff = 5 on all pixels
        # MSE = 25.0
        # data_range = 255.0
        # PSNR = 10 * log10(255^2 / 25) = 10 * log10(65025 / 25) = 10 * log10(2601)
        # 10 * 3.4151403756 = 34.151403756 dB
        ref = np.zeros((10, 10), dtype=np.uint8)
        comp = np.full((10, 10), 5, dtype=np.uint8)
        expected_psnr = 10.0 * math.log10((255.0 ** 2) / 25.0)
        actual_psnr = calculate_psnr(ref, comp)
        assert math.isclose(actual_psnr, expected_psnr, rel_tol=1e-10)

    def test_psnr_analytically_known_calculation_float(self):
        # Reference vs comparison with constant offset diff = 0.1 on all pixels
        # MSE = 0.01
        # data_range = 1.0
        # PSNR = 10 * log10(1.0^2 / 0.01) = 10 * log10(100) = 20.0 dB
        ref = np.zeros((10, 10), dtype=np.float64)
        comp = np.full((10, 10), 0.1, dtype=np.float64)
        actual_psnr = calculate_psnr(ref, comp, data_range=1.0)
        assert math.isclose(actual_psnr, 20.0, rel_tol=1e-10)

    def test_psnr_explicit_data_range_override(self):
        # uint8 array with explicit data_range=100.0 instead of default 255.0
        ref = np.zeros((10, 10), dtype=np.uint8)
        comp = np.full((10, 10), 10, dtype=np.uint8)  # MSE = 100.0
        # PSNR = 10 * log10(100^2 / 100) = 10 * log10(100) = 20.0 dB
        psnr = calculate_psnr(ref, comp, data_range=100.0)
        assert math.isclose(psnr, 20.0, rel_tol=1e-10)

    def test_psnr_invalid_data_range_raises_value_error(self):
        ref = np.zeros((10, 10), dtype=np.uint8)
        comp = np.ones((10, 10), dtype=np.uint8)
        with pytest.raises(ValueError, match="positive finite number"):
            calculate_psnr(ref, comp, data_range=-5.0)

    def test_psnr_shape_mismatch_raises_value_error(self):
        ref = np.zeros((10, 10), dtype=np.uint8)
        comp = np.zeros((10, 15), dtype=np.uint8)
        with pytest.raises(ValueError, match="shapes must match"):
            calculate_psnr(ref, comp)


# =============================================================================
# 4. Structural Similarity Index (SSIM) Tests
# =============================================================================

class TestStructuralSimilarityIndex:
    """Validates mathematical correctness, structural sensitivity, and stability of SSIM."""

    def test_ssim_identical_images_returns_exact_one(self):
        # 2D Grayscale
        np.random.seed(42)
        ref_2d = np.random.randint(0, 256, (64, 64), dtype=np.uint8)
        assert calculate_ssim(ref_2d, ref_2d) == 1.0

        # 3D Multichannel
        ref_3d = np.random.randint(0, 256, (64, 64, 3), dtype=np.uint8)
        assert calculate_ssim(ref_3d, ref_3d) == 1.0

        # Floating point
        ref_f = np.random.uniform(0.0, 1.0, (64, 64)).astype(np.float64)
        assert calculate_ssim(ref_f, ref_f) == 1.0

    def test_ssim_analytical_bounds(self):
        # Test on varied deterministic image pairs; SSIM must reside in [-1.0, 1.0]
        np.random.seed(123)
        img1 = np.random.randint(0, 256, (32, 32), dtype=np.uint8)
        img2 = np.random.randint(0, 256, (32, 32), dtype=np.uint8)
        score = calculate_ssim(img1, img2)
        assert -1.0 <= score <= 1.0

    def test_ssim_controlled_degradation_monotonically_decreases(self):
        # Progressive Gaussian noise injection must strictly decrease SSIM
        np.random.seed(100)
        # Smooth gradient base image
        x = np.linspace(50, 200, 64)
        y = np.linspace(50, 200, 64)
        xx, yy = np.meshgrid(x, y)
        base = (0.5 * xx + 0.5 * yy).astype(np.float64)

        noise_mild = np.random.normal(0, 5, base.shape)
        noise_mod = np.random.normal(0, 20, base.shape)
        noise_severe = np.random.normal(0, 60, base.shape)

        img_mild = np.clip(base + noise_mild, 0, 255).astype(np.uint8)
        img_mod = np.clip(base + noise_mod, 0, 255).astype(np.uint8)
        img_severe = np.clip(base + noise_severe, 0, 255).astype(np.uint8)
        img_base = base.astype(np.uint8)

        ssim_mild = calculate_ssim(img_base, img_mild)
        ssim_mod = calculate_ssim(img_base, img_mod)
        ssim_severe = calculate_ssim(img_base, img_severe)

        assert 1.0 > ssim_mild > ssim_mod > ssim_severe >= 0.0

    def test_ssim_multichannel_averaging(self):
        # 3-channel image where channel 0 is identical (SSIM=1.0)
        # channel 1 has mild noise, channel 2 has moderate noise.
        # Overall SSIM must equal the exact average of individual channels.
        np.random.seed(200)
        base = np.random.randint(50, 200, (32, 32), dtype=np.uint8)
        ch0 = base.copy()
        ch1 = np.clip(base.astype(float) + np.random.normal(0, 10, base.shape), 0, 255).astype(np.uint8)
        ch2 = np.clip(base.astype(float) + np.random.normal(0, 30, base.shape), 0, 255).astype(np.uint8)

        ref_3d = np.stack([base, base, base], axis=2)
        comp_3d = np.stack([ch0, ch1, ch2], axis=2)

        score_ch0 = calculate_ssim(base, ch0)
        score_ch1 = calculate_ssim(base, ch1)
        score_ch2 = calculate_ssim(base, ch2)
        expected_avg = (score_ch0 + score_ch1 + score_ch2) / 3.0

        actual_multichannel = calculate_ssim(ref_3d, comp_3d)
        assert math.isclose(actual_multichannel, expected_avg, rel_tol=1e-10)

    def test_ssim_zero_variance_flat_images(self):
        # Two identical solid uniform images
        flat_a = np.full((32, 32), 128, dtype=np.uint8)
        flat_b = np.full((32, 32), 128, dtype=np.uint8)
        assert calculate_ssim(flat_a, flat_b) == 1.0

        # Two different solid uniform images (all 0 vs all 255)
        # Local variances = 0, C1 and C2 prevent division by zero
        flat_black = np.zeros((32, 32), dtype=np.uint8)
        flat_white = np.full((32, 32), 255, dtype=np.uint8)
        score_diff = calculate_ssim(flat_black, flat_white)
        assert 0.0 <= score_diff < 0.01  # Very low, positive, no NaN or ZeroDivisionError

    def test_ssim_image_smaller_than_window_raises_value_error(self):
        # Window size 11, image 10x10 -> must raise ValueError
        small = np.zeros((10, 10), dtype=np.uint8)
        with pytest.raises(ValueError, match="must be at least window size 11x11"):
            calculate_ssim(small, small, win_size=11)

        # Non-square: 12x8 -> width < 11
        small_w = np.zeros((12, 8), dtype=np.uint8)
        with pytest.raises(ValueError, match="must be at least window size 11x11"):
            calculate_ssim(small_w, small_w, win_size=11)

    def test_ssim_window_size_validation(self):
        valid_img = np.zeros((32, 32), dtype=np.uint8)
        # Even window size
        with pytest.raises(ValueError, match="odd integer >= 3"):
            calculate_ssim(valid_img, valid_img, win_size=10)
        # win_size < 3
        with pytest.raises(ValueError, match="odd integer >= 3"):
            calculate_ssim(valid_img, valid_img, win_size=1)
        # Non-integer win_size
        with pytest.raises(ValueError, match="odd integer >= 3"):
            calculate_ssim(valid_img, valid_img, win_size=11.0)  # type: ignore

    def test_ssim_win_sigma_and_constants_validation(self):
        valid_img = np.zeros((32, 32), dtype=np.uint8)
        with pytest.raises(ValueError, match="win_sigma must be a positive"):
            calculate_ssim(valid_img, valid_img, win_sigma=0.0)
        with pytest.raises(ValueError, match="K1 must be a positive"):
            calculate_ssim(valid_img, valid_img, K1=-0.01)
        with pytest.raises(ValueError, match="K2 must be a positive"):
            calculate_ssim(valid_img, valid_img, K2=0.0)

    def test_ssim_explicit_data_range_matches_inferred_uint8(self):
        np.random.seed(55)
        img1 = np.random.randint(0, 256, (32, 32), dtype=np.uint8)
        img2 = np.random.randint(0, 256, (32, 32), dtype=np.uint8)
        score_inferred = calculate_ssim(img1, img2)
        score_explicit = calculate_ssim(img1, img2, data_range=255.0)
        assert score_inferred == score_explicit

    def test_ssim_nan_values_rejected(self):
        ref = np.zeros((32, 32), dtype=np.float64)
        comp = np.zeros((32, 32), dtype=np.float64)
        comp[16, 16] = np.nan
        with pytest.raises(ValueError, match="NaN or infinity"):
            calculate_ssim(ref, comp)
