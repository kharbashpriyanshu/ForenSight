"""
PRNU Sensor Pattern Analysis Engine Extension Package.
Provides PRNUEngine for photo-response non-uniformity extraction and fingerprint analysis.
"""

from app.engine_extensions.prnu.prnu_models import (
    PRNUParameters,
    PRNUFingerprintMetadata,
)
from app.engine_extensions.prnu.prnu_extractor import (
    extract_noise_residual,
    zero_mean_normalize,
    calculate_suitability,
    aggregate_prnu_fingerprint,
    compute_2d_cross_correlation,
    compute_pce,
)
from app.engine_extensions.prnu.prnu_engine import PRNUEngine

__all__ = [
    "PRNUEngine",
    "PRNUParameters",
    "PRNUFingerprintMetadata",
    "extract_noise_residual",
    "zero_mean_normalize",
    "calculate_suitability",
    "aggregate_prnu_fingerprint",
    "compute_2d_cross_correlation",
    "compute_pce",
]
