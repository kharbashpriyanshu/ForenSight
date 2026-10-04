"""
ForenSight V4 — Physical Lighting, Shadow & Solar Ephemeris Models
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class LightingParameters(BaseModel):
    """Parameters for Physical Illumination, Shadow and Solar Ephemeris Analysis."""
    grid_divisions: int = Field(4, ge=2, le=8, description="Number of vertical and horizontal grid divisions for patch-based illumination estimation.")
    min_gradient_magnitude: float = Field(8.0, ge=1.0, le=100.0, description="Minimum spatial gradient magnitude to contribute to illumination vector.")
    shadow_luminance_threshold: int = Field(65, ge=20, le=120, description="Maximum luminance value to classify pixels as candidate cast shadow.")
    divergence_threshold_deg: float = Field(45.0, ge=15.0, le=90.0, description="Angular divergence threshold in degrees indicating inconsistent illumination.")
    solar_azimuth_tolerance_deg: float = Field(35.0, ge=10.0, le=60.0, description="Acceptable angular margin of error between astronomical shadow and image shadow.")


class IlluminationPatch(BaseModel):
    """Estimated 2D light source direction for a spatial image quadrant/patch."""
    patch_id: str
    box: List[int]  # [x1, y1, x2, y2]
    illuminant_angle_deg: float  # 0 to 360 degrees
    confidence: float
    is_divergent: bool
    angular_discrepancy_deg: float


class DetectedShadowRay(BaseModel):
    """Cast shadow directional vector connecting object boundary to shadow boundary."""
    caster_x: float
    caster_y: float
    shadow_x: float
    shadow_y: float
    vector_angle_deg: float
    ray_length: float


class SolarEphemerisEvaluation(BaseModel):
    """Astronomical sun position calculation compared against physical image shadows."""
    exif_timestamp: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    solar_elevation_deg: Optional[float] = None
    solar_azimuth_deg: Optional[float] = None
    expected_shadow_azimuth_deg: Optional[float] = None
    expected_shadow_ratio: Optional[float] = None
    astronomical_consistency: str  # CONSISTENT, INCONSISTENT, DAY_NIGHT_CONFLICT, METADATA_UNAVAILABLE
    reasoning: str


class LightingAnalysisResult(BaseModel):
    """Comprehensive findings for Physical Lighting and Solar consistency forensics."""
    mean_illuminant_angle_deg: float
    illuminant_angular_variance: float
    total_patches: int
    divergent_patches: int
    divergence_ratio: float
    patches: List[IlluminationPatch] = []
    shadow_rays: List[DetectedShadowRay] = []
    solar_ephemeris: Optional[SolarEphemerisEvaluation] = None
    lighting_inconsistency_score: float
    verdict: str
    interpretation: str
