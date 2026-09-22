"""
Camera Identification Engine Extension Package.
Provides CameraIDEngine, models, and reference library for PRNU-based device attribution.
"""

from app.engine_extensions.camera.camera_id_models import (
    CameraReferenceMetadata,
    CameraComparisonScore,
    CameraIDParameters,
)
from app.engine_extensions.camera.camera_reference_library import CameraReferenceLibrary
from app.engine_extensions.camera.camera_id_engine import CameraIDEngine

__all__ = [
    "CameraIDEngine",
    "CameraReferenceMetadata",
    "CameraComparisonScore",
    "CameraIDParameters",
    "CameraReferenceLibrary",
]
