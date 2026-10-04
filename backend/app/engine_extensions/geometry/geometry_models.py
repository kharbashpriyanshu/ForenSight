"""
ForenSight V4 — Geometric Perspective & Vanishing Point Models
"""

from typing import List, Optional, Tuple, Dict, Any
from pydantic import BaseModel, Field


class PerspectiveParameters(BaseModel):
    """Configuration parameters for Perspective and Vanishing Point analysis."""
    min_line_length: int = Field(35, ge=10, le=200, description="Minimum straight line segment pixel length.")
    max_line_gap: int = Field(10, ge=2, le=50, description="Maximum pixel gap to bridge collinear line segments.")
    canny_low: int = Field(50, ge=10, le=200, description="Lower hysteresis threshold for Canny edge operator.")
    canny_high: int = Field(150, ge=50, le=300, description="Upper hysteresis threshold for Canny edge operator.")
    ransac_iterations: int = Field(500, ge=100, le=2000, description="RANSAC iterations for vanishing point hypothesis generation.")
    angle_tolerance_deg: float = Field(3.5, ge=1.0, le=15.0, description="Angular tolerance in degrees for assigning lines to vanishing points.")
    max_vanishing_points: int = Field(3, ge=1, le=5, description="Maximum primary vanishing points to extract (typically 2 or 3).")


class VanishingPoint(BaseModel):
    """Represents a primary perspective vanishing point."""
    vp_index: int
    x: float
    y: float
    conforming_lines: int
    mean_residual_deg: float
    is_at_infinity: bool = False


class HorizonLine(BaseModel):
    """Represents the estimated camera horizon line in image space."""
    slope: float
    intercept: float
    camera_roll_deg: float
    camera_vertical_fraction: float


class PerspectiveOutlierLine(BaseModel):
    """Represents a line segment that violates all dominant scene vanishing points."""
    x1: float
    y1: float
    x2: float
    y2: float
    length: float
    min_angular_error_deg: float


class PerspectiveAnalysisResult(BaseModel):
    """Comprehensive findings for Perspective and Vanishing Point forensic analysis."""
    total_segments: int
    clustered_segments: int
    outlier_segments: int
    outlier_ratio: float
    perspective_inconsistency_score: float
    verdict: str
    vanishing_points: List[VanishingPoint]
    horizon: Optional[HorizonLine] = None
    outliers: List[PerspectiveOutlierLine] = []
    interpretation: str
