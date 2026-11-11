r"""
ForenSight DIP Tamper Localization Metrics (Stage 3 Workstream 2 Batch 2)

Provides mathematically rigorous, standalone, NumPy-based spatial localization metrics:
- Intersection over Union (IoU / Jaccard Index)
- Precision (Positive Predictive Value)
- Recall (True Positive Rate / Sensitivity)
- F1-Score (Harmonic Mean of Precision and Recall)
- Dice Similarity Coefficient (Sorensen-Dice Index)
- Bounding-Box Intersection over Union (BBox IoU)

Mathematical & Scientific Principles:
1. Metric Family Separation (Family B):
   Localization metrics quantify the spatial overlap and pixel-level classification
   accuracy of a predicted tamper heatmap/mask relative to an authoritative binary
   ground-truth mask. They MUST NOT be composited with image fidelity metrics (MSE, PSNR, SSIM).
2. Binary Ground-Truth Convention:
   Ground-truth masks use standard 8-bit representation:
   - 0: Authentic / Pristine background
   - >0 (typically 255): Tampered / Manipulated foreground region
3. Thresholding Policy:
   Continuous prediction heatmaps are binarized using an explicit, caller-supplied threshold.
   For 8-bit inputs [0, 255], standard evaluation thresholds include 32, 64, 128.
   If inputs are floating-point [0.0, 1.0] and threshold > 1.0, the threshold is automatically
   normalized by 255.0 to maintain scale consistency.
4. Zero-Denominator Policy:
   - Precision: If (TP + FP) == 0, no positive pixels were predicted. Returned precision = 0.0.
   - Recall: If (TP + FN) == 0, the ground truth contains no positive pixels. Returned recall = 0.0.
   - IoU: If (TP + FP + FN) == 0, both prediction and ground truth are entirely negative
     (perfect agreement on negative state). In this scenario, IoU = 1.0. If only the prediction
     is empty while ground truth has positives, IoU = 0.0.
   - F1 & Dice: If (2*TP + FP + FN) == 0, both masks are entirely negative. F1 = 1.0, Dice = 1.0.
     If prediction is empty while ground truth has positives, F1 = 0.0, Dice = 0.0.
"""

from typing import Dict, Any, Tuple, Optional, Union
import numpy as np


def validate_mask_pair(
    prediction: np.ndarray,
    ground_truth: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Validates that prediction and ground truth masks are non-empty, finite, numeric
    NumPy arrays with identical 2D spatial dimensions.

    Args:
        prediction: Predicted tamper heatmap or binary mask.
        ground_truth: Authoritative binary ground-truth mask.

    Returns:
        Tuple of (prediction_2d, ground_truth_2d) as 2D NumPy arrays.

    Raises:
        TypeError: If either input is not a NumPy ndarray or has non-numeric dtype.
        ValueError: If arrays are empty, contain NaN/inf, have mismatched shapes,
                    or have unsupported dimensionality (must be 2D or squeezeable to 2D).
    """
    if not isinstance(prediction, np.ndarray) or not isinstance(ground_truth, np.ndarray):
        raise TypeError(
            f"Both masks must be numpy.ndarray instances. "
            f"Got prediction={type(prediction).__name__}, ground_truth={type(ground_truth).__name__}."
        )

    if not np.issubdtype(prediction.dtype, np.number) or not np.issubdtype(ground_truth.dtype, np.number):
        raise TypeError(
            f"Mask dtypes must be numeric. "
            f"Got prediction.dtype={prediction.dtype}, ground_truth.dtype={ground_truth.dtype}."
        )

    if prediction.size == 0 or ground_truth.size == 0:
        raise ValueError("Mask arrays must not be empty.")

    # Squeeze trailing channel dimension if shape is (H, W, 1)
    pred_sq = np.squeeze(prediction)
    gt_sq = np.squeeze(ground_truth)

    if pred_sq.ndim != 2 or gt_sq.ndim != 2:
        raise ValueError(
            f"Masks must have 2D spatial dimensions (H, W). "
            f"Got prediction shape {prediction.shape} ({pred_sq.ndim}D), "
            f"ground_truth shape {ground_truth.shape} ({gt_sq.ndim}D)."
        )

    if pred_sq.shape != gt_sq.shape:
        raise ValueError(
            f"Mask spatial dimensions must match identically. "
            f"Got prediction shape {pred_sq.shape} vs ground_truth shape {gt_sq.shape}."
        )

    if not np.all(np.isfinite(pred_sq)):
        raise ValueError("Prediction mask contains NaN or infinity values.")

    if not np.all(np.isfinite(gt_sq)):
        raise ValueError("Ground-truth mask contains NaN or infinity values.")

    return pred_sq, gt_sq


def binarize_masks(
    prediction: np.ndarray,
    ground_truth: np.ndarray,
    threshold: float = 128.0,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Binarizes prediction and ground truth masks into boolean NumPy arrays.

    Args:
        prediction: 2D continuous or binary prediction array.
        ground_truth: 2D ground truth array (0=authentic, >0=tampered).
        threshold: Binarization cutoff for prediction.

    Returns:
        Tuple of (pred_bool, gt_bool) arrays of dtype bool.
    """
    pred_2d, gt_2d = validate_mask_pair(prediction, ground_truth)

    if not isinstance(threshold, (int, float, np.number)) or isinstance(threshold, bool):
        raise ValueError(f"threshold must be a numeric value, got {type(threshold).__name__}.")

    th = float(threshold)
    if not np.isfinite(th):
        raise ValueError(f"threshold must be finite, got {threshold}.")

    # Adapt threshold scale if prediction is float in [0.0, 1.0] and threshold was given on [0, 255] scale
    if np.issubdtype(pred_2d.dtype, np.floating) and float(np.max(pred_2d)) <= 1.0 and th > 1.0:
        th = th / 255.0

    pred_bool = pred_2d >= th
    gt_bool = gt_2d > 0

    return pred_bool, gt_bool


def calculate_confusion_matrix(
    prediction: np.ndarray,
    ground_truth: np.ndarray,
    threshold: float = 128.0,
) -> Dict[str, int]:
    """
    Computes pixel-level confusion matrix counts: TP, FP, FN, TN.

    Args:
        prediction: Predicted heatmap or binary mask.
        ground_truth: Ground truth binary mask.
        threshold: Threshold for binarizing prediction.

    Returns:
        Dict with keys: "tp", "fp", "fn", "tn", "total_pixels".
    """
    pred_bool, gt_bool = binarize_masks(prediction, ground_truth, threshold)

    tp = int(np.sum(pred_bool & gt_bool))
    fp = int(np.sum(pred_bool & ~gt_bool))
    fn = int(np.sum(~pred_bool & gt_bool))
    tn = int(np.sum(~pred_bool & ~gt_bool))
    total = int(pred_bool.size)

    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "total_pixels": total,
    }


def calculate_iou(
    prediction: np.ndarray,
    ground_truth: np.ndarray,
    threshold: float = 128.0,
) -> float:
    """
    Calculates Intersection over Union (IoU / Jaccard Index):

        IoU = TP / (TP + FP + FN)

    If (TP + FP + FN) == 0 (both masks are completely negative), returns 1.0.
    """
    cm = calculate_confusion_matrix(prediction, ground_truth, threshold)
    denom = cm["tp"] + cm["fp"] + cm["fn"]
    if denom == 0:
        return 1.0
    return float(cm["tp"] / denom)


def calculate_precision(
    prediction: np.ndarray,
    ground_truth: np.ndarray,
    threshold: float = 128.0,
) -> float:
    """
    Calculates Precision (Positive Predictive Value):

        Precision = TP / (TP + FP)

    If (TP + FP) == 0 (no positive pixels predicted), returns 0.0.
    """
    cm = calculate_confusion_matrix(prediction, ground_truth, threshold)
    denom = cm["tp"] + cm["fp"]
    if denom == 0:
        return 0.0
    return float(cm["tp"] / denom)


def calculate_recall(
    prediction: np.ndarray,
    ground_truth: np.ndarray,
    threshold: float = 128.0,
) -> float:
    """
    Calculates Recall (True Positive Rate / Sensitivity):

        Recall = TP / (TP + FN)

    If (TP + FN) == 0 (ground truth has no positive pixels), returns 0.0.
    """
    cm = calculate_confusion_matrix(prediction, ground_truth, threshold)
    denom = cm["tp"] + cm["fn"]
    if denom == 0:
        return 0.0
    return float(cm["tp"] / denom)


def calculate_f1(
    prediction: np.ndarray,
    ground_truth: np.ndarray,
    threshold: float = 128.0,
) -> float:
    """
    Calculates F1-Score (Harmonic mean of Precision and Recall):

        F1 = (2 * Precision * Recall) / (Precision + Recall)
           = (2 * TP) / (2 * TP + FP + FN)

    If (2 * TP + FP + FN) == 0 (both masks are completely negative), returns 1.0.
    If only prediction is negative while ground truth has positives, returns 0.0.
    """
    cm = calculate_confusion_matrix(prediction, ground_truth, threshold)
    denom = 2 * cm["tp"] + cm["fp"] + cm["fn"]
    if denom == 0:
        return 1.0
    return float((2.0 * cm["tp"]) / denom)


def calculate_dice(
    prediction: np.ndarray,
    ground_truth: np.ndarray,
    threshold: float = 128.0,
) -> float:
    """
    Calculates Sorensen-Dice Coefficient:

        Dice = (2 * TP) / (2 * TP + FP + FN)

    Note: In binary evaluation, Dice is mathematically identical to F1-Score.
    Both are reported independently per protocol requirements.
    """
    return calculate_f1(prediction, ground_truth, threshold)


def calculate_all_localization_metrics(
    prediction: np.ndarray,
    ground_truth: np.ndarray,
    threshold: float = 128.0,
) -> Dict[str, Any]:
    """
    Computes all standard spatial localization metrics and confusion counts.

    Returns:
        Dict containing:
        - "threshold": binarization threshold used
        - "tp": True Positives
        - "fp": False Positives
        - "fn": False Negatives
        - "tn": True Negatives
        - "total_pixels": Total pixels evaluated
        - "iou": Intersection over Union [0.0, 1.0]
        - "precision": Precision [0.0, 1.0]
        - "recall": Recall [0.0, 1.0]
        - "f1": F1-Score [0.0, 1.0]
        - "dice": Dice coefficient [0.0, 1.0]
    """
    cm = calculate_confusion_matrix(prediction, ground_truth, threshold)
    tp, fp, fn, tn = cm["tp"], cm["fp"], cm["fn"], cm["tn"]

    iou = float(tp / (tp + fp + fn)) if (tp + fp + fn) > 0 else 1.0
    precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    f1 = float((2.0 * tp) / (2 * tp + fp + fn)) if (2 * tp + fp + fn) > 0 else 1.0
    dice = f1

    return {
        "threshold": float(threshold),
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "total_pixels": cm["total_pixels"],
        "iou": iou,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "dice": dice,
    }


def calculate_bbox_iou(
    bbox_pred: Union[list, tuple],
    bbox_gt: Union[list, tuple],
) -> float:
    """
    Calculates Bounding-Box Intersection over Union (BBox IoU).

    Args:
        bbox_pred: [x_min, y_min, x_max, y_max] predicted coordinates.
        bbox_gt: [x_min, y_min, x_max, y_max] ground-truth coordinates.

    Returns:
        Scalar float IoU in [0.0, 1.0].
    """
    if len(bbox_pred) != 4 or len(bbox_gt) != 4:
        raise ValueError(f"Bounding boxes must have 4 coordinates [x1, y1, x2, y2]. Got {bbox_pred}, {bbox_gt}.")

    px1, py1, px2, py2 = float(bbox_pred[0]), float(bbox_pred[1]), float(bbox_pred[2]), float(bbox_pred[3])
    gx1, gy1, gx2, gy2 = float(bbox_gt[0]), float(bbox_gt[1]), float(bbox_gt[2]), float(bbox_gt[3])

    ix1 = max(px1, gx1)
    iy1 = max(py1, gy1)
    ix2 = min(px2, gx2)
    iy2 = min(py2, gy2)

    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    intersection = iw * ih

    area_pred = max(0.0, px2 - px1) * max(0.0, py2 - py1)
    area_gt = max(0.0, gx2 - gx1) * max(0.0, gy2 - gy1)

    union = area_pred + area_gt - intersection
    if union <= 0.0:
        return 0.0

    return float(intersection / union)

