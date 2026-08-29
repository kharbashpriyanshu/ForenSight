from pydantic import BaseModel
from typing import Dict, List

class QuantizationTable(BaseModel):
    table_index: int
    values: List[int]
    min_val: int
    max_val: int
    mean_val: float
    median_val: float
    std_val: float

class DCTStatistics(BaseModel):
    mean: float
    median: float
    std: float
    min_val: float
    max_val: float

class DCTACStatistics(DCTStatistics):
    mean_abs: float
    median_abs: float
    zero_proportion: float
    percentiles: Dict[str, float]

class FrequencyBandStatistics(BaseModel):
    low_freq_energy: float
    mid_freq_energy: float
    high_freq_energy: float

class JPEGDCTResult(BaseModel):
    image_width: int
    image_height: int
    padded_width: int
    padded_height: int
    total_blocks: int
    jpeg_format: str
    quantization_tables: List[QuantizationTable]
    dc_statistics: DCTStatistics
    ac_statistics: DCTACStatistics
    band_statistics: FrequencyBandStatistics
    visualization_artifact_path: str
