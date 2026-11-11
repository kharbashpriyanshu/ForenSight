"""
ForenSight Scientific Benchmark — Image Fidelity & Localization Metric Contracts
(Stage 3 WS1 Batch 3)

Provides mathematically rigorous, predeclared evaluation metrics for:
1. Image Fidelity Assessment (MSE, PSNR, SSIM) between original evidence and derived/reconstructed artifacts.
2. Forgery Spatial Localization Metrics (IoU, Precision, Recall, F1, FPR, Specificity) against ground truth masks.
"""

from typing import Dict, Any, Tuple, Optional
import numpy as np
import cv2


def validate_image_pair(img1: np.ndarray, img2: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    """
    Validates that two images have identical spatial dimensions and channel counts.
    Converts inputs to float64 for high-precision arithmetic.
    """
    if not isinstance(img1, np.ndarray) or not isinstance(img2, np.ndarray):
        raise TypeError("Both inputs must be numpy ndarrays.")
    
    if img1.shape != img2.shape:
        raise ValueError(
            f"Image dimensions must match identically for fidelity evaluation. "
            f"Image 1: {img1.shape}, Image 2: {img2.shape}"
        )
    
    arr1 = img1.astype(np.float64)
    arr2 = img2.astype(np.float64)
    return arr1, arr2


def compute_mse(img1: np.ndarray, img2: np.ndarray) -> float:
    """
    Computes Mean Squared Error (MSE) between two aligned images:
    MSE = (1 / N) * sum((img1 - img2) ** 2)
    """
    arr1, arr2 = validate_image_pair(img1, img2)
    mse_val = np.mean((arr1 - arr2) ** 2)
    return float(mse_val)


def compute_psnr(img1: np.ndarray, img2: np.ndarray, max_val: float = 255.0) -> float:
    """
    Computes Peak Signal-to-Noise Ratio (PSNR) in decibels:
    PSNR = 10 * log10(max_val^2 / MSE) = 20 * log10(max_val / sqrt(MSE))
    
    Returns 100.0 dB if MSE == 0 (identical images) for numerical stability.
    """
    mse_val = compute_mse(img1, img2)
    if mse_val <= 1e-12:
        return 100.0  # Conventionally bounded representation for identical images
    
    psnr_val = 10.0 * np.log10((max_val ** 2) / mse_val)
    return float(psnr_val)


def _to_luminance(arr: np.ndarray) -> np.ndarray:
    """Converts 3-channel RGB/BGR image to standard ITU-R BT.601 luminance."""
    if arr.ndim == 3 and arr.shape[2] == 3:
        # 0.299 * R + 0.587 * G + 0.114 * B
        return 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    elif arr.ndim == 2:
        return arr
    else:
        raise ValueError(f"Unsupported image array shape for luminance conversion: {arr.shape}")


def compute_ssim(
    img1: np.ndarray,
    img2: np.ndarray,
    max_val: float = 255.0,
    k1: float = 0.01,
    k2: float = 0.03,
    win_size: int = 11,
    sigma: float = 1.5
) -> float:
    """
    Computes Mean Structural Similarity Index (SSIM) according to Wang et al. (2004).
    Uses a standard Gaussian weighting window (11x11, sigma=1.5).
    Evaluates structural similarity on luminance channel.
    
    Formula:
    SSIM(x, y) = ((2*mu_x*mu_y + C1) * (2*sigma_xy + C2)) /
                 ((mu_x^2 + mu_y^2 + C1) * (sigma_x^2 + sigma_y^2 + C2))
    where C1 = (k1 * max_val)^2, C2 = (k2 * max_val)^2
    """
    arr1, arr2 = validate_image_pair(img1, img2)
    
    lum1 = _to_luminance(arr1)
    lum2 = _to_luminance(arr2)
    
    c1 = (k1 * max_val) ** 2
    c2 = (k2 * max_val) ** 2
    
    # 11x11 Gaussian filter
    kernel_size = (win_size, win_size)
    mu1 = cv2.GaussianBlur(lum1, kernel_size, sigmaX=sigma, sigmaY=sigma)
    mu2 = cv2.GaussianBlur(lum2, kernel_size, sigmaX=sigma, sigmaY=sigma)
    
    mu1_sq = mu1 ** 2
    mu2_sq = mu2 ** 2
    mu1_mu2 = mu1 * mu2
    
    sigma1_sq = cv2.GaussianBlur(lum1 * lum1, kernel_size, sigmaX=sigma, sigmaY=sigma) - mu1_sq
    sigma2_sq = cv2.GaussianBlur(lum2 * lum2, kernel_size, sigmaX=sigma, sigmaY=sigma) - mu2_sq
    sigma12 = cv2.GaussianBlur(lum1 * lum2, kernel_size, sigmaX=sigma, sigmaY=sigma) - mu1_mu2
    
    # Prevent negative variances due to float precision
    sigma1_sq = np.maximum(0.0, sigma1_sq)
    sigma2_sq = np.maximum(0.0, sigma2_sq)
    
    numerator = (2.0 * mu1_mu2 + c1) * (2.0 * sigma12 + c2)
    denominator = (mu1_sq + mu2_sq + c1) * (sigma1_sq + sigma2_sq + c2)
    
    ssim_map = numerator / denominator
    return float(np.mean(ssim_map))


def compute_all_fidelity_metrics(img1: np.ndarray, img2: np.ndarray) -> Dict[str, float]:
    """Computes full image fidelity suite (MSE, PSNR, SSIM) between two images."""
    mse_val = compute_mse(img1, img2)
    psnr_val = compute_psnr(img1, img2)
    ssim_val = compute_ssim(img1, img2)
    
    return {
        "mse": round(mse_val, 4),
        "psnr_db": round(psnr_val, 4),
        "ssim": round(ssim_val, 4)
    }


def compute_comprehensive_localization_metrics(
    prediction_mask: np.ndarray,
    ground_truth_mask: np.ndarray,
    threshold: float = 0.5
) -> Dict[str, Any]:
    """
    Computes complete forgery localization confusion matrix and evaluation metrics.
    
    Ground truth convention:
    - 0 = Authentic negative pixel
    - > 127 = Manipulated positive pixel
    
    Prediction convention:
    - Values > threshold are binarized as positive (predicted forged)
    """
    if prediction_mask.shape != ground_truth_mask.shape:
        h_gt, w_gt = ground_truth_mask.shape[:2]
        prediction_mask = cv2.resize(prediction_mask.astype(np.float32), (w_gt, h_gt))
    
    # Predeclared binary thresholding
    pred_bin = (prediction_mask > threshold).astype(bool)
    gt_bin = (ground_truth_mask > 127).astype(bool)
    
    tp = int(np.logical_and(pred_bin, gt_bin).sum())
    fp = int(np.logical_and(pred_bin, np.logical_not(gt_bin)).sum())
    fn = int(np.logical_and(np.logical_not(pred_bin), gt_bin).sum())
    tn = int(np.logical_and(np.logical_not(pred_bin), np.logical_not(gt_bin)).sum())
    
    total_pixels = tp + fp + fn + tn
    assert total_pixels == ground_truth_mask.size, "Pixel conservation invariant must hold"
    
    # Positives and negatives
    p = tp + fn
    n = tn + fp
    
    # Overlap and classification metrics
    union = tp + fp + fn
    iou = float(tp / union) if union > 0 else (1.0 if (tp == 0 and fp == 0 and fn == 0) else 0.0)
    precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = float(tp / p) if p > 0 else 0.0
    f1 = float(2.0 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    
    fpr = float(fp / n) if n > 0 else 0.0
    specificity = float(tn / n) if n > 0 else 1.0  # True Negative Rate = 1 - FPR
    accuracy = float((tp + tn) / total_pixels) if total_pixels > 0 else 0.0
    
    return {
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "true_negatives": tn,
        "total_pixels": total_pixels,
        "ground_truth_positives": p,
        "ground_truth_negatives": n,
        "iou": round(iou, 6),
        "precision": round(precision, 6),
        "recall": round(recall, 6),
        "f1_score": round(f1, 6),
        "false_positive_rate": round(fpr, 6),
        "specificity": round(specificity, 6),
        "overall_pixel_accuracy": round(accuracy, 6)
    }
