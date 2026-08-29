from pydantic import BaseModel
from typing import List, Optional

class DetectionConfig(BaseModel):
    detector: str
    descriptor_type: str
    matching_metric: str
    ratio_threshold: float
    min_spatial_separation: float
    ransac_threshold: float

class ImageInfo(BaseModel):
    width: int
    height: int

class FeatureStatistics(BaseModel):
    keypoints_detected: int
    descriptors_generated: int

class MatchingStatistics(BaseModel):
    raw_matches: int
    ratio_filtered_matches: int
    spatially_filtered_matches: int
    geometric_inliers: int
    inlier_ratio: float

class Geometry(BaseModel):
    transformation_type: str
    transformation_matrix: Optional[List[List[float]]]
    source_centroid: Optional[List[float]]
    destination_centroid: Optional[List[float]]
    displacement: Optional[List[float]]

class CandidateRegions(BaseModel):
    source_bounding_box: Optional[List[float]] # [x, y, w, h]
    destination_bounding_box: Optional[List[float]]
    supporting_matches: int

class CopyMoveResult(BaseModel):
    config: DetectionConfig
    image_info: ImageInfo
    feature_statistics: FeatureStatistics
    matching_statistics: MatchingStatistics
    geometry: Geometry
    candidate_regions: CandidateRegions
    visualization_artifact_path: str
