from pydantic import BaseModel
from typing import Dict, Any, Optional

class ELAStatistics(BaseModel):
    mean_error: float
    max_error: float
    std_error: float
    median_error: float
    percentiles: Dict[str, float]

class ELAResult(BaseModel):
    input_format: str
    width: int
    height: int
    jpeg_quality: int
    statistics: ELAStatistics
    error_image_path: str
    recompressed_image_path: str
    dynamic_error_image_path: Optional[str] = None
    fixed_error_image_path: Optional[str] = None
    scale_modes: Optional[Dict[str, Any]] = None

    @property
    def error_map_path(self) -> str:
        return self.error_image_path

    @property
    def mean_error(self) -> float:
        return self.statistics.mean_error

    @property
    def max_error(self) -> float:
        return self.statistics.max_error
