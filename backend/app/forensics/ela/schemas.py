from pydantic import BaseModel
from typing import Dict, Any

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
