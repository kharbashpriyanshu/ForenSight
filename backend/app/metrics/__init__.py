"""
ForenSight DIP Metrics Subsystem (Stage 3 Workstream 2)

Provides mathematically rigorous, independently tested digital image processing
fidelity metrics:
- Mean Squared Error (MSE)
- Peak Signal-to-Noise Ratio (PSNR)
- Structural Similarity Index (SSIM)
"""

from app.metrics.fidelity import (
    calculate_mse,
    calculate_psnr,
    calculate_ssim,
)
from app.metrics.localization import (
    calculate_confusion_matrix,
    calculate_iou,
    calculate_precision,
    calculate_recall,
    calculate_f1,
    calculate_dice,
    calculate_all_localization_metrics,
    calculate_bbox_iou,
)

__all__ = [
    "calculate_mse",
    "calculate_psnr",
    "calculate_ssim",
    "calculate_confusion_matrix",
    "calculate_iou",
    "calculate_precision",
    "calculate_recall",
    "calculate_f1",
    "calculate_dice",
    "calculate_all_localization_metrics",
    "calculate_bbox_iou",
]
