"""
ForenSight V4 — Forensic Scientific Evaluation Metrics

Specialized metric calculators for:
1. Spatial Localization (IoU, Precision, Recall, F1, Dice)
2. Copy-Move Block & Keypoint (Displacement consistency, Candidate overlap, False-Positive rate)
3. Resampling & Periodic Interpolation
4. Noise Residual Scale Discrepancies
5. General Execution & Determinism Metrics
"""

from typing import Dict, Any, List, Optional, Tuple
import numpy as np


def compute_spatial_localization_metrics(
    prediction_mask: np.ndarray,
    ground_truth_mask: np.ndarray,
    threshold: float = 0.5
) -> Dict[str, float]:
    """
    Computes spatial overlap metrics between a continuous/binary predicted heatmap/mask
    and a binary ground truth mask (0 = authentic, 255 = manipulated).
    Only calculated when ground truth mask exists and engine produces a spatial output.
    """
    if prediction_mask.shape != ground_truth_mask.shape:
        # Resize prediction to match ground truth dimensions
        import cv2
        h_gt, w_gt = ground_truth_mask.shape[:2]
        prediction_mask = cv2.resize(prediction_mask.astype(np.float32), (w_gt, h_gt))

    # Binarize masks
    pred_bin = (prediction_mask > threshold).astype(bool)
    gt_bin = (ground_truth_mask > 127).astype(bool)

    tp = np.logical_and(pred_bin, gt_bin).sum()
    fp = np.logical_and(pred_bin, np.logical_not(gt_bin)).sum()
    fn = np.logical_and(np.logical_not(pred_bin), gt_bin).sum()
    tn = np.logical_and(np.logical_not(pred_bin), np.logical_not(gt_bin)).sum()

    union = tp + fp + fn
    iou = float(tp / union) if union > 0 else (1.0 if (tp == 0 and fp == 0 and fn == 0) else 0.0)
    precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    f1 = float(2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    dice = float(2 * tp / (2 * tp + fp + fn)) if (2 * tp + fp + fn) > 0 else 0.0

    return {
        "iou": round(iou, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1, 4),
        "dice": round(dice, 4),
        "true_positives": int(tp),
        "false_positives": int(fp),
        "false_negatives": int(fn),
        "true_negatives": int(tn)
    }


def compute_bbox_iou(boxA: List[int], boxB: List[int]) -> float:
    """Computes Intersection over Union of two bounding boxes [x1, y1, x2, y2]."""
    xA = max(boxA[0], boxB[0])
    yA = max(boxA[1], boxB[1])
    xB = min(boxA[2], boxB[2])
    yB = min(boxA[3], boxB[3])

    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = max(0, boxA[2] - boxA[0]) * max(0, boxA[3] - boxA[1])
    boxBArea = max(0, boxB[2] - boxB[0]) * max(0, boxB[3] - boxB[1])

    denom = float(boxAArea + boxBArea - interArea)
    if denom <= 0:
        return 0.0
    return interArea / denom


def evaluate_copy_move_candidates(
    reported_pairs: List[Dict[str, Any]],
    ground_truth_bbox: Optional[List[int]],
    is_authentic_texture: bool = False
) -> Dict[str, Any]:
    """
    Evaluates block/keypoint copy-move candidates against ground truth manipulation.
    Calculates candidate detection rate on tampered fixtures and false alarm rate on repetitive textures.
    """
    total_reported = len(reported_pairs)
    if is_authentic_texture:
        # For authentic repetitive textures, any reported match is a false alarm
        return {
            "evaluation_type": "FALSE_ALARM_CHALLENGE",
            "false_candidate_count": total_reported,
            "false_positive_triggered": total_reported > 0
        }

    if not ground_truth_bbox:
        return {
            "evaluation_type": "NO_BBOX_AVAILABLE",
            "reported_candidate_pairs": total_reported
        }

    # Measure whether any reported candidate intersects the target bounding box
    matched_candidates = 0
    max_iou = 0.0

    for pair in reported_pairs:
        # Check source or target bbox
        tgt = pair.get("target_bbox") or pair.get("block2_bbox")
        if tgt:
            iou = compute_bbox_iou(tgt, ground_truth_bbox)
            if iou > max_iou:
                max_iou = iou
            if iou > 0.3:
                matched_candidates += 1

    return {
        "evaluation_type": "TARGET_DETECTION",
        "total_reported_pairs": total_reported,
        "valid_matched_pairs": matched_candidates,
        "max_bbox_iou": round(max_iou, 4),
        "target_detected": matched_candidates > 0
    }


def evaluate_resampling_response(
    p_map_peak: float,
    is_resampled: bool
) -> Dict[str, Any]:
    """
    Evaluates the periodic Radon/derivative peak response from the RESAMPLING engine.
    """
    return {
        "p_map_peak": round(float(p_map_peak), 4),
        "ground_truth_resampled": is_resampled,
        "response_consistent": (p_map_peak >= 0.15) if is_resampled else (p_map_peak < 0.15)
    }


def evaluate_noise_discrepancy(
    residual_variance: float,
    expected_variance: float,
    tolerance: float = 15.0
) -> Dict[str, Any]:
    """
    Evaluates noise residual response against controlled noise injection parameters.
    """
    diff = abs(residual_variance - expected_variance)
    return {
        "measured_residual_variance": round(float(residual_variance), 4),
        "expected_noise_variance": round(float(expected_variance), 4),
        "variance_delta": round(float(diff), 4),
        "within_expected_scale": diff <= tolerance
    }


def compute_runtime_distribution(runtimes_ms: List[float]) -> Dict[str, float]:
    """Computes distribution percentiles and statistics for execution runtime."""
    if not runtimes_ms:
        return {"mean": 0.0, "std": 0.0, "min": 0.0, "p50": 0.0, "p95": 0.0, "max": 0.0}

    arr = np.array(runtimes_ms)
    return {
        "mean": round(float(np.mean(arr)), 2),
        "std": round(float(np.std(arr)), 2),
        "min": round(float(np.min(arr)), 2),
        "p50": round(float(np.percentile(arr, 50)), 2),
        "p95": round(float(np.percentile(arr, 95)), 2),
        "max": round(float(np.max(arr)), 2)
    }
