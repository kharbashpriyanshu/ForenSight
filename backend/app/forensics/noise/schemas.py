from pydantic import BaseModel
from typing import Dict, Any, Optional
import numpy as np

class NoiseStatistics(BaseModel):
    mean_residual: float
    median_residual: float
    max_residual: float
    std_residual: float
    percentiles: Dict[str, float]

    @property
    def variance(self) -> float:
        return float(self.std_residual ** 2)

    @property
    def full_scale_residual_db(self) -> float:
        """
        Calculates 20 * log10(255.0 / (std_residual + 1e-6)).
        Technically defined as full-scale dynamic range reference (255.0) relative to
        residual standard deviation, expressed in decibels.
        Note: This is not classical Signal-to-Noise Ratio (SNR).
        """
        return float(20.0 * np.log10(255.0 / (self.std_residual + 1e-6)))

    @property
    def snr_db(self) -> float:
        """
        Deprecated alias for full_scale_residual_db preserved for backward compatibility.
        """
        return self.full_scale_residual_db

class FilterConfig(BaseModel):
    method: str = "Gaussian"
    kernel_size: int = 5
    sigma: Optional[float] = 1.0

class LocalAnalysisConfig(BaseModel):
    window_size: int
    stride: int
    aggregation_method: str

class NoiseResult(BaseModel):
    width: int
    height: int
    filter_config: FilterConfig
    global_statistics: NoiseStatistics
    local_config: LocalAnalysisConfig
    local_statistics: NoiseStatistics
    residual_image_path: str
    local_map_image_path: str
    comparison_filter_config: Optional[FilterConfig] = None
    comparison_global_statistics: Optional[NoiseStatistics] = None
    comparison_local_statistics: Optional[NoiseStatistics] = None
    comparison_residual_image_path: Optional[str] = None
    comparison_local_map_image_path: Optional[str] = None
    comparative_methods: Optional[Dict[str, Any]] = None
