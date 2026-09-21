"""
ForenSight V4 — Forensic Engine Categories

Standardized taxonomy of forensic algorithm categories.
Designed to be open and extensible for future modalities without database migrations.
"""

from enum import Enum


class EngineCategory(str, Enum):
    """
    Standardized categorization for forensic analytical engines.
    """
    FILE_ANALYSIS = "FILE_ANALYSIS"
    GLOBAL_ANALYSIS = "GLOBAL_ANALYSIS"
    LOCAL_ANALYSIS = "LOCAL_ANALYSIS"
    CAMERA_IDENTIFICATION = "CAMERA_IDENTIFICATION"
    GEOMETRIC_ANALYSIS = "GEOMETRIC_ANALYSIS"
    AI_SCREENING = "AI_SCREENING"
    VIDEO_FORENSICS = "VIDEO_FORENSICS"

    @classmethod
    def has_category(cls, value: str) -> bool:
        return value.upper() in cls._value2member_map_

    @classmethod
    def describe(cls, category: "EngineCategory") -> str:
        descriptions = {
            cls.FILE_ANALYSIS: "Container, metadata, structural headers, and format integrity analysis.",
            cls.GLOBAL_ANALYSIS: "Whole-image statistical distributions, frequency spectra, and global quantization.",
            cls.LOCAL_ANALYSIS: "Localized spatial anomalies, error-level discrepancies, and regional residual noise.",
            cls.CAMERA_IDENTIFICATION: "Sensor pattern noise (PRNU), optical distortions, and device hardware signatures.",
            cls.GEOMETRIC_ANALYSIS: "Perspective geometry, shadow consistency, keypoint cloning, and vanishing lines.",
            cls.AI_SCREENING: "Deep-learning screening, generative diffusion artifacts, and synthetic face analysis.",
            cls.VIDEO_FORENSICS: "Temporal frame coherence, GOP structure, and optical flow container forensics.",
        }
        return descriptions.get(category, "Uncategorized forensic analytical modality.")
