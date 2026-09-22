"""
Data models and parameters for Camera-ID forensic engine.
"""

from typing import Optional, List, Dict, Any, Tuple
from pydantic import BaseModel, Field


class CameraReferenceMetadata(BaseModel):
    """Metadata describing a stored camera sensor reference fingerprint."""
    reference_id: str = Field(..., description="Unique ID of camera reference fingerprint")
    case_id: str = Field(..., description="Case scope isolation ID")
    camera_label: str = Field(..., description="Human-readable camera label (e.g., 'Device A - Nikon D7000')")
    make_model: Optional[str] = Field(default=None, description="Optional camera make/model identifier")
    serial_number: Optional[str] = Field(default=None, description="Optional sensor/device serial number")
    width: int = Field(..., ge=1, description="Sensor width in pixels")
    height: int = Field(..., ge=1, description="Sensor height in pixels")
    num_images_aggregated: int = Field(default=1, ge=1, description="Number of calibration images used in MLE aggregation")
    sha256_hash: str = Field(..., description="SHA-256 integrity hash of .npy reference array")
    created_at: str = Field(..., description="ISO 8601 creation timestamp")
    notes: Optional[str] = Field(default=None, description="Investigator notes")


class CameraComparisonScore(BaseModel):
    """Detailed scientific comparison score against a single camera reference."""
    reference_id: str
    camera_label: str
    make_model: Optional[str] = None
    correlation: float = Field(..., description="Peak normalized cross-correlation value")
    pce: float = Field(..., description="Peak-to-Correlation Energy")
    peak_offset: Tuple[int, int] = Field(default=(0, 0), description="Spatial offset (dy, dx) of cross-correlation peak")
    status: str = Field(..., description="CONSISTENT, INCONCLUSIVE, or INCONSISTENT")
    confidence: str = Field(..., description="HIGH, MEDIUM, LOW, or NONE")
    is_top_candidate: bool = False
    details: Dict[str, Any] = Field(default_factory=dict)


class CameraIDParameters(BaseModel):
    """Execution parameters for CAMERA-ID analysis engine."""
    correlation_threshold: float = Field(
        default=0.015,
        ge=0.001,
        le=0.5,
        description="Threshold for cross-correlation peak significance"
    )
    pce_threshold: float = Field(
        default=50.0,
        ge=10.0,
        le=500.0,
        description="Standard Peak-to-Correlation Energy decision threshold (Fridrich et al.)"
    )
    min_suitability: float = Field(
        default=0.20,
        ge=0.0,
        le=1.0,
        description="Minimum PRNU suitability index required for conclusive comparison"
    )
    target_reference_id: Optional[str] = Field(
        default=None,
        description="Optional specific camera reference ID to test against (if omitted, all case references are tested)"
    )
