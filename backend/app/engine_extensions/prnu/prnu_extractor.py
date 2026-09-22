"""
ForenSight V4 — PRNU Extraction & Scientific Processing Routines

Implements standard, deterministic sensor pattern noise extraction,
zero-mean readout suppression, multi-image Maximum Likelihood Estimation (MLE),
and image suitability diagnostics.
"""

from typing import Dict, Any, List, Tuple
import numpy as np
import cv2


def extract_noise_residual(
    image_gray: np.ndarray,
    filter_window: int = 5,
    filter_sigma: float = 1.5,
) -> np.ndarray:
    """
    Extracts high-frequency noise residual W = I - F(I) using an adaptive
    local-variance spatial filter (Wiener-type formulation).
    """
    if image_gray.dtype != np.float32 and image_gray.dtype != np.float64:
        img = image_gray.astype(np.float32)
    else:
        img = image_gray.copy()

    # Ensure odd filter window size
    ksize = filter_window if filter_window % 2 == 1 else filter_window + 1
    ksize = max(3, ksize)

    # 1. Local mean and variance estimation
    local_mean = cv2.blur(img, (ksize, ksize))
    local_sq_mean = cv2.blur(img * img, (ksize, ksize))
    local_var = np.maximum(0.0, local_sq_mean - local_mean * local_mean)

    # 2. Noise variance estimate based on filter_sigma
    noise_var = float(filter_sigma * filter_sigma * 9.0)

    # 3. Adaptive local filter: F(I) = mu + max(0, var - n_var) / max(var, n_var) * (I - mu)
    ratio = np.maximum(0.0, local_var - noise_var) / (local_var + 1e-6)
    ratio = np.clip(ratio, 0.0, 1.0)
    denoised = local_mean + ratio * (img - local_mean)

    # 4. Raw noise residual
    residual = img - denoised
    return residual.astype(np.float32)


def zero_mean_normalize(residual: np.ndarray) -> np.ndarray:
    """
    Removes periodic readout artifacts, row/column sensor banding,
    and demosaicing traces by subtracting row and column means.
    """
    res = residual.astype(np.float32).copy()
    # Subtract row means
    row_means = np.mean(res, axis=1, keepdims=True)
    res = res - row_means
    # Subtract column means
    col_means = np.mean(res, axis=0, keepdims=True)
    res = res - col_means
    # Demean global
    res = res - float(np.mean(res))
    return res


def calculate_suitability(
    image_gray: np.ndarray,
    residual: np.ndarray,
) -> Dict[str, Any]:
    """
    Calculates empirical suitability indicators evaluating whether the
    image contains sufficient non-saturated dynamic range for reliable PRNU.
    """
    total_pixels = float(image_gray.size)
    if total_pixels == 0:
        return {
            "suitability_index": 0.0,
            "status": "UNSUITABLE",
            "saturated_ratio": 1.0,
            "dynamic_range": 0.0,
            "residual_variance": 0.0,
            "notes": "Empty image canvas.",
        }

    # Saturated pixels (< 5 or > 250 in 8-bit scale)
    saturated_count = np.count_nonzero((image_gray <= 5.0) | (image_gray >= 250.0))
    saturated_ratio = float(saturated_count / total_pixels)

    # Dynamic range
    img_min = float(np.min(image_gray))
    img_max = float(np.max(image_gray))
    dynamic_range = float(img_max - img_min)

    # Residual variance and energy
    res_var = float(np.var(residual))
    res_energy = float(np.mean(residual * residual))

    # Suitability index [0.0, 1.0]
    # Penalized by saturated pixels, very low dynamic range, or very low residual energy
    sat_factor = max(0.0, 1.0 - saturated_ratio * 2.0)
    dr_factor = min(1.0, dynamic_range / 128.0)
    var_factor = min(1.0, res_var / 0.5) if res_var > 0 else 0.0

    suitability_index = float(sat_factor * 0.5 + dr_factor * 0.3 + var_factor * 0.2)
    suitability_index = round(float(np.clip(suitability_index, 0.0, 1.0)), 4)

    if suitability_index >= 0.50:
        status = "SUITABLE"
    elif suitability_index >= 0.25:
        status = "MARGINAL"
    else:
        status = "UNSUITABLE"

    return {
        "suitability_index": suitability_index,
        "status": status,
        "saturated_ratio": round(saturated_ratio, 4),
        "dynamic_range": round(dynamic_range, 2),
        "residual_variance": round(res_var, 6),
        "residual_energy": round(res_energy, 6),
        "notes": (
            "Image contains adequate tonal distribution for PRNU evaluation."
            if status == "SUITABLE"
            else "Image exhibits saturation, low contrast, or compression suppression that degrades PRNU sensitivity."
        ),
    }


def aggregate_prnu_fingerprint(
    images_with_residuals: List[Tuple[np.ndarray, np.ndarray]],
) -> np.ndarray:
    """
    Computes Maximum Likelihood Estimator (MLE) of camera PRNU fingerprint
    across multiple reference images:
        K = sum(W_i * I_i) / (sum(I_i^2) + epsilon)
    Normalized to zero-mean and unit variance.
    """
    if not images_with_residuals:
        raise ValueError("At least one reference image with residual is required.")

    H, W = images_with_residuals[0][0].shape
    numerator = np.zeros((H, W), dtype=np.float64)
    denominator = np.zeros((H, W), dtype=np.float64)

    for img_gray, residual in images_with_residuals:
        if img_gray.shape != (H, W):
            raise ValueError(f"Incompatible reference image dimensions {img_gray.shape} vs {(H, W)}.")
        norm_res = zero_mean_normalize(residual)
        numerator += (norm_res * img_gray).astype(np.float64)
        denominator += (img_gray * img_gray).astype(np.float64)

    fingerprint = numerator / (denominator + 1e-6)
    # Zero-mean normalize fingerprint
    fingerprint = zero_mean_normalize(fingerprint)

    # Unit standard deviation normalization
    std_val = float(np.std(fingerprint))
    if std_val > 1e-7:
        fingerprint = fingerprint / std_val

    return fingerprint.astype(np.float32)


def compute_2d_cross_correlation(
    x: np.ndarray,
    y: np.ndarray,
) -> Tuple[np.ndarray, float, Tuple[int, int]]:
    """
    Computes normalized 2D circular cross-correlation surface between x and y via 2D FFT.
    Returns (corr_surface, max_corr, (peak_y, peak_x)).
    """
    if x.shape != y.shape:
        raise ValueError(f"Shape mismatch: {x.shape} vs {y.shape}")

    H, W = x.shape
    x_zm = x.astype(np.float64) - np.mean(x)
    y_zm = y.astype(np.float64) - np.mean(y)

    norm_x = float(np.linalg.norm(x_zm))
    norm_y = float(np.linalg.norm(y_zm))
    denominator = (norm_x * norm_y) + 1e-12

    F_x = np.fft.fft2(x_zm)
    F_y = np.fft.fft2(y_zm)

    # Cross-spectral power
    cross_spec = F_x * np.conj(F_y)
    corr_surface = np.fft.ifft2(cross_spec).real / denominator
    corr_surface = np.fft.fftshift(corr_surface)

    # Find peak
    abs_surf = np.abs(corr_surface)
    peak_idx = np.unravel_index(np.argmax(abs_surf), abs_surf.shape)
    peak_y, peak_x = int(peak_idx[0]), int(peak_idx[1])
    max_corr = float(corr_surface[peak_y, peak_x])

    return corr_surface.astype(np.float32), max_corr, (peak_y, peak_x)


def compute_pce(
    corr_surface: np.ndarray,
    peak_loc: Tuple[int, int],
    exclusion_radius: int = 5,
) -> float:
    """
    Calculates Peak-to-Correlation Energy (PCE):
    PCE = C_max^2 / ( 1/(N - |N_peak|) * sum_{(u,v) not in N_peak} C(u,v)^2 )
    where exclusion neighborhood is square of side (2*exclusion_radius + 1).
    """
    H, W = corr_surface.shape
    py, px = peak_loc
    c_max = float(corr_surface[py, px])

    # Mask exclusion area
    mask = np.ones((H, W), dtype=bool)
    y_min = max(0, py - exclusion_radius)
    y_max = min(H, py + exclusion_radius + 1)
    x_min = max(0, px - exclusion_radius)
    x_max = min(W, px + exclusion_radius + 1)
    mask[y_min:y_max, x_min:x_max] = False

    non_peak_values = corr_surface[mask]
    if len(non_peak_values) == 0:
        return 0.0

    energy = float(np.mean(non_peak_values ** 2))
    if energy <= 1e-12:
        return float(c_max * c_max / 1e-12)

    pce = float((c_max * c_max) / energy)
    return round(float(pce), 2)

