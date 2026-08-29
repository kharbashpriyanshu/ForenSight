from pydantic import BaseModel
from typing import Dict, Any

class NoiseStatistics(BaseModel):
    mean_residual: float
    median_residual: float
    max_residual: float
    std_residual: float
    percentiles: Dict[str, float]

class FilterConfig(BaseModel):
    method: str
    kernel_size: int
    sigma: float

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
