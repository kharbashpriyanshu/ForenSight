r"""
ForenSight DIP Image Fidelity Metrics (Stage 3 Workstream 2 Batch 1)

Provides mathematically rigorous, standalone, NumPy-based image fidelity metrics:
- Mean Squared Error (MSE)
- Peak Signal-to-Noise Ratio (PSNR)
- Structural Similarity Index (SSIM)

Mathematical & Scientific Principles:
1. Metric Family Separation:
   Image fidelity metrics (Family A) quantify whole-image signal degradation,
   compression loss, or filtering divergence between an authoritative reference image
   and a degraded or reconstructed counterpart. They DO NOT quantify forgery detection,
   authenticity probability, or spatial tamper localization.
   Tamper localization metrics (Family B: IoU, Precision, Recall, F1) belong to a separate,
   unmixed metric family and must never be composited with fidelity metrics.
2. Ground-Truth Alignment:
   Fidelity comparisons are mathematically defined only when reference and comparison
   images share identical spatial dimensions, channel topology, and coordinate registration.
   No silent resizing, cropping, channel dropping, or range compression is performed.
3. Data Range Policy:
   - Unsigned 8-bit (`np.uint8`): Default `data_range = 255.0`.
   - Unsigned 16-bit (`np.uint16`): Default `data_range = 65535.0`.
   - Floating-point (`np.float32`, `np.float64`): Default `data_range = 1.0` if values
     reside in [0.0, 1.0]. Floating-point arrays outside [0.0, 1.0] or arbitrary integer
     types require explicit `data_range` specification.
4. Channel Handling Strategy for SSIM:
   - 2D arrays (grayscale, shape `(H, W)`): Evaluated directly across the 2D plane.
   - 3D arrays (multichannel, shape `(H, W, C)`): Evaluated independently on each channel
     $c \in \{0, \dots, C-1\}$ and averaged across channels: SSIM = (1/C) * sum(SSIM_c).
     This treats all channels symmetrically without assuming color primaries.
5. SSIM Boundary Handling:
   Uses mirror reflection padding (`reflect`), producing a local quality map of identical
   spatial dimensions `(H, W)`. The returned score is the arithmetic mean of this map.
"""

import math
from typing import Optional, Tuple, Union
import numpy as np


def validate_image_pair(
    reference: np.ndarray,
    comparison: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Validates that reference and comparison inputs are non-empty, finite, numeric
    NumPy arrays with identical spatial and channel shapes.
    
    Converts inputs to float64 to prevent overflow/underflow in subsequent arithmetic.

    Args:
        reference: Reference image array (NumPy ndarray).
        comparison: Comparison/degraded image array (NumPy ndarray).

    Returns:
        Tuple of (reference_float64, comparison_float64).

    Raises:
        TypeError: If either input is not a NumPy ndarray or has non-numeric dtype.
        ValueError: If arrays are empty, contain NaN/inf, have mismatched shapes,
                    or have unsupported dimensionality (only 2D and 3D supported).
    """
    if not isinstance(reference, np.ndarray) or not isinstance(comparison, np.ndarray):
        raise TypeError(
            f"Both inputs must be numpy.ndarray instances. "
            f"Got reference={type(reference).__name__}, comparison={type(comparison).__name__}."
        )

    if not np.issubdtype(reference.dtype, np.number) or not np.issubdtype(comparison.dtype, np.number):
        raise TypeError(
            f"Array dtypes must be numeric. "
            f"Got reference.dtype={reference.dtype}, comparison.dtype={comparison.dtype}."
        )

    if reference.size == 0 or comparison.size == 0:
        raise ValueError("Input arrays must not be empty.")

    if reference.shape != comparison.shape:
        raise ValueError(
            f"Reference and comparison image shapes must match identically. "
            f"Got reference shape {reference.shape} vs comparison shape {comparison.shape}."
        )

    if reference.ndim not in (2, 3):
        raise ValueError(
            f"Unsupported array dimensionality: {reference.ndim}D. "
            f"Only 2D (grayscale: HxW) and 3D (multichannel: HxWxC) images are supported."
        )

    if reference.ndim == 3 and reference.shape[2] == 0:
        raise ValueError("Channel dimension must be at least 1.")

    if not np.all(np.isfinite(reference)):
        raise ValueError("Reference image contains NaN or infinity values.")

    if not np.all(np.isfinite(comparison)):
        raise ValueError("Comparison image contains NaN or infinity values.")

    ref_f = reference.astype(np.float64, copy=False)
    comp_f = comparison.astype(np.float64, copy=False)
    return ref_f, comp_f


def resolve_data_range(
    reference: np.ndarray,
    data_range: Optional[Union[int, float]] = None,
) -> float:
    """
    Resolves and validates the dynamic data range (MAX) of the image representation.

    Args:
        reference: Original reference NumPy array before type casting.
        data_range: Explicit data range, or None to infer from array dtype.

    Returns:
        Positive float representing the peak signal dynamic range.

    Raises:
        ValueError: If explicit data_range is non-positive or non-finite,
                    or if data_range cannot be safely inferred for the array dtype.
    """
    if data_range is not None:
        if isinstance(data_range, bool) or not isinstance(data_range, (int, float, np.number)):
            raise ValueError(f"data_range must be a numeric value, got {type(data_range).__name__}.")
        dr = float(data_range)
        if not math.isfinite(dr) or dr <= 0.0:
            raise ValueError(f"data_range must be a positive finite number, got {data_range}.")
        return dr

    # Infer from dtype
    if reference.dtype == np.uint8:
        return 255.0
    elif reference.dtype == np.uint16:
        return 65535.0
    elif reference.dtype in (np.float32, np.float64):
        # Standard normalized floating-point images reside in [0.0, 1.0]
        ref_min = float(np.min(reference))
        ref_max = float(np.max(reference))
        if 0.0 <= ref_min and ref_max <= 1.0:
            return 1.0
        raise ValueError(
            f"For floating-point arrays with intensity bounds [{ref_min:.4f}, {ref_max:.4f}] "
            f"outside [0.0, 1.0], data_range must be explicitly specified."
        )
    else:
        raise ValueError(
            f"Cannot infer data_range automatically for dtype '{reference.dtype}'. "
            f"Please supply data_range explicitly."
        )


def calculate_mse(
    reference: np.ndarray,
    comparison: np.ndarray,
) -> float:
    """
    Calculates the Mean Squared Error (MSE) between two aligned images:

        MSE = (1 / N) * sum_{i=1}^{N} (I_i - K_i)^2

    Args:
        reference: Reference image array (2D or 3D NumPy array).
        comparison: Comparison image array (must match reference shape and numeric dtype).

    Returns:
        Scalar float representing mean squared pixel-wise difference.
        Returns exactly 0.0 for identical images.

    Raises:
        TypeError: If inputs are not NumPy ndarrays or have non-numeric dtypes.
        ValueError: If inputs are empty, have mismatched shapes, invalid dimensions,
                    or contain NaN/inf.
    """
    ref_f, comp_f = validate_image_pair(reference, comparison)

    # Identical arrays return 0.0 exactly
    if np.array_equal(reference, comparison):
        return 0.0

    diff = ref_f - comp_f
    mse = float(np.mean(diff ** 2))
    return mse


def calculate_psnr(
    reference: np.ndarray,
    comparison: np.ndarray,
    data_range: Optional[Union[int, float]] = None,
) -> float:
    """
    Calculates Peak Signal-to-Noise Ratio (PSNR) in decibels (dB):

        PSNR = 10 * log10( data_range^2 / MSE ) = 20 * log10( data_range / sqrt(MSE) )

    Args:
        reference: Reference image array (2D or 3D NumPy array).
        comparison: Comparison image array (identical dimensions).
        data_range: Dynamic range of pixel values (e.g., 255.0 for 8-bit, 1.0 for float).
                    If None, inferred according to data_range policy.

    Returns:
        Scalar float in decibels.
        Returns float('inf') for identical images (MSE == 0.0).

    Raises:
        TypeError: If inputs are not NumPy ndarrays or have non-numeric dtypes.
        ValueError: If inputs are invalid or data_range is non-positive.
    """
    dr = resolve_data_range(reference, data_range)
    mse = calculate_mse(reference, comparison)

    if mse == 0.0:
        return float("inf")

    psnr = 10.0 * math.log10((dr ** 2) / mse)
    return float(psnr)


def _gaussian_kernel_1d(win_size: int, sigma: float) -> np.ndarray:
    """Computes a normalized 1D Gaussian weighting kernel."""
    coords = np.arange(win_size, dtype=np.float64) - (win_size - 1) / 2.0
    kernel = np.exp(-(coords ** 2) / (2.0 * sigma * sigma))
    return kernel / np.sum(kernel)


def _separable_gaussian_filter_2d(
    arr: np.ndarray,
    win_size: int,
    sigma: float,
) -> np.ndarray:
    """
    Applies a 2D separable Gaussian filter using pure NumPy with mirror reflection boundary.

    Args:
        arr: 2D float64 NumPy array of shape (H, W).
        win_size: Filter window size (must be odd integer >= 3).
        sigma: Standard deviation of Gaussian kernel.

    Returns:
        Filtered 2D float64 array of shape (H, W).
    """
    kernel_1d = _gaussian_kernel_1d(win_size, sigma)
    pad = win_size // 2
    h, w = arr.shape

    # Pass 1: Convolve along columns (axis 0)
    padded_v = np.pad(arr, ((pad, pad), (0, 0)), mode="reflect")
    tmp = np.zeros((h, w), dtype=np.float64)
    for i, weight in enumerate(kernel_1d):
        tmp += weight * padded_v[i : i + h, :]

    # Pass 2: Convolve along rows (axis 1)
    padded_h = np.pad(tmp, ((0, 0), (pad, pad)), mode="reflect")
    out = np.zeros((h, w), dtype=np.float64)
    for j, weight in enumerate(kernel_1d):
        out += weight * padded_h[:, j : j + w]

    return out


def _ssim_single_channel_2d(
    ref_f: np.ndarray,
    comp_f: np.ndarray,
    data_range: float,
    win_size: int,
    sigma: float,
    K1: float,
    K2: float,
) -> float:
    """
    Computes Mean SSIM on a single 2D spatial plane according to Wang et al. (2004).

    Formulation:
        C1 = (K1 * data_range)^2
        C2 = (K2 * data_range)^2
        SSIM(x, y) = ((2 * mu_x * mu_y + C1) * (2 * sigma_xy + C2)) /
                     ((mu_x^2 + mu_y^2 + C1) * (sigma_x^2 + sigma_y^2 + C2))
    """
    C1 = (K1 * data_range) ** 2
    C2 = (K2 * data_range) ** 2

    # Weighted local means
    mu_ref = _separable_gaussian_filter_2d(ref_f, win_size, sigma)
    mu_comp = _separable_gaussian_filter_2d(comp_f, win_size, sigma)

    mu_ref_sq = mu_ref * mu_ref
    mu_comp_sq = mu_comp * mu_comp
    mu_ref_comp = mu_ref * mu_comp

    # Weighted local variances and covariance
    sigma_ref_sq = _separable_gaussian_filter_2d(ref_f * ref_f, win_size, sigma) - mu_ref_sq
    sigma_comp_sq = _separable_gaussian_filter_2d(comp_f * comp_f, win_size, sigma) - mu_comp_sq
    sigma_ref_comp = _separable_gaussian_filter_2d(ref_f * comp_f, win_size, sigma) - mu_ref_comp

    # Numerical safety: clip negative variances arising from floating-point roundoff
    sigma_ref_sq = np.maximum(0.0, sigma_ref_sq)
    sigma_comp_sq = np.maximum(0.0, sigma_comp_sq)

    numerator = (2.0 * mu_ref_comp + C1) * (2.0 * sigma_ref_comp + C2)
    denominator = (mu_ref_sq + mu_comp_sq + C1) * (sigma_ref_sq + sigma_comp_sq + C2)

    ssim_map = numerator / denominator
    return float(np.mean(ssim_map))


def calculate_ssim(
    reference: np.ndarray,
    comparison: np.ndarray,
    data_range: Optional[Union[int, float]] = None,
    win_size: int = 11,
    win_sigma: float = 1.5,
    K1: float = 0.01,
    K2: float = 0.03,
) -> float:
    """
    Calculates the Mean Structural Similarity Index (SSIM) between two images
    according to Wang et al. (2004).

    Parameters:
        reference: Reference image (2D grayscale or 3D multichannel NumPy array).
        comparison: Comparison image (identical dimensions and numeric dtype).
        data_range: Dynamic range of pixel values (e.g. 255.0 for uint8).
                    If None, inferred according to data_range policy.
        win_size: Side length of the sliding Gaussian window. Must be an odd integer >= 3.
                  Default: 11.
        win_sigma: Standard deviation of the Gaussian window. Must be > 0.
                   Default: 1.5.
        K1: Small positive constant for luminance stability. Default: 0.01.
        K2: Small positive constant for contrast/structural stability. Default: 0.03.

    Returns:
        Scalar float representing structural similarity in [-1.0, 1.0] (typically [0.0, 1.0]).
        Identical images return 1.0 within floating-point tolerance.

    Raises:
        TypeError: If inputs are not NumPy ndarrays or have non-numeric dtypes.
        ValueError: If inputs have mismatched shapes, invalid dimensions, contain NaN/inf,
                    or if image spatial dimensions are smaller than win_size.
    """
    ref_f, comp_f = validate_image_pair(reference, comparison)
    dr = resolve_data_range(reference, data_range)

    if not isinstance(win_size, (int, np.integer)) or win_size < 3 or win_size % 2 == 0:
        raise ValueError(f"win_size must be an odd integer >= 3, got {win_size}.")

    if isinstance(win_sigma, bool) or not isinstance(win_sigma, (int, float, np.number)):
        raise ValueError(f"win_sigma must be a numeric value, got {type(win_sigma).__name__}.")
    sigma = float(win_sigma)
    if not math.isfinite(sigma) or sigma <= 0.0:
        raise ValueError(f"win_sigma must be a positive finite number, got {win_sigma}.")

    if isinstance(K1, bool) or not isinstance(K1, (int, float, np.number)):
        raise ValueError(f"K1 must be a numeric value, got {type(K1).__name__}.")
    k1 = float(K1)
    if not math.isfinite(k1) or k1 <= 0.0:
        raise ValueError(f"K1 must be a positive finite number, got {K1}.")

    if isinstance(K2, bool) or not isinstance(K2, (int, float, np.number)):
        raise ValueError(f"K2 must be a numeric value, got {type(K2).__name__}.")
    k2 = float(K2)
    if not math.isfinite(k2) or k2 <= 0.0:
        raise ValueError(f"K2 must be a positive finite number, got {K2}.")

    h, w = ref_f.shape[:2]
    if h < win_size or w < win_size:
        raise ValueError(
            f"Image spatial dimensions ({h}, {w}) must be at least window size {win_size}x{win_size}."
        )

    # Identical shortcut with analytical bound guarantee
    if np.array_equal(reference, comparison):
        return 1.0

    if ref_f.ndim == 2:
        return _ssim_single_channel_2d(ref_f, comp_f, dr, win_size, sigma, k1, k2)
    else:
        # Multichannel: compute SSIM on each channel independently and average
        channels = ref_f.shape[2]
        channel_scores = [
            _ssim_single_channel_2d(
                ref_f[:, :, c],
                comp_f[:, :, c],
                dr,
                win_size,
                sigma,
                k1,
                k2,
            )
            for c in range(channels)
        ]
        return float(np.mean(channel_scores))
