"""
ForenSight V4 — PRNU Parameter & Metadata Schemas
"""

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from pydantic import BaseModel, Field


class PRNUParameters(BaseModel):
    """Parameters for Photo-Response Non-Uniformity (PRNU) sensor pattern analysis."""
    filter_sigma: float = Field(1.5, ge=0.5, le=5.0, description="Denoising filter Gaussian scale/variance.")
    filter_window: int = Field(5, ge=3, le=15, description="Local spatial window size for adaptive Wiener estimation.")
    zero_mean_normalization: bool = Field(True, description="Subtract row and column means to suppress readout line artifacts.")
    max_dimension: int = Field(2048, ge=256, le=4096, description="Maximum image dimension before proportional safety downsampling.")
    reference_id: Optional[str] = Field(None, description="Optional target reference fingerprint ID to evaluate against.")
    target_reference_id: Optional[str] = Field(None, description="Alias for reference_id.")
    case_id: Optional[int] = Field(None, description="Investigation case ID for case-scoped reference resolution.")


class PRNUFingerprintMetadata(BaseModel):
    """Metadata describing an aggregated camera reference PRNU fingerprint."""
    reference_id: str = Field(..., description="Unique case-scoped identifier for the camera reference.")
    case_id: int = Field(..., description="Parent case ID.")
    camera_label: str = Field(..., description="Investigator-supplied camera label (metadata, not verified ground truth).")
    fingerprint_version: str = Field("1.0.0", description="Fingerprint extraction algorithm version.")
    image_count: int = Field(..., ge=1, description="Number of independent reference images aggregated.")
    dimensions: List[int] = Field(..., description="Spatial resolution [width, height].")
    source_image_hashes: List[str] = Field(default_factory=list, description="SHA-256 digests of source reference images.")
    fingerprint_sha256: str = Field(..., description="Cryptographic SHA-256 digest of binary fingerprint array.")
    processing_parameters: Dict[str, Any] = Field(default_factory=dict, description="Parameters used during fingerprint extraction.")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat(), description="Creation timestamp.")
