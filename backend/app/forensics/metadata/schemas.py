from pydantic import BaseModel
from typing import Optional, Dict, Any, List

class ExtractedMetadata(BaseModel):
    image_format: str
    width: int
    height: int
    color_mode: str
    exif: Dict[str, Any]
    gps_info: Optional[Dict[str, Any]] = None

class MetadataFindings(BaseModel):
    indicators: List[str]
    software_detected: Optional[str] = None
    camera_make: Optional[str] = None
    camera_model: Optional[str] = None
    capture_time: Optional[str] = None
    has_gps: bool = False
