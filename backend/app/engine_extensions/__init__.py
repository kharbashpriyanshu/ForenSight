"""
ForenSight V4 — Forensic Engine Extension Framework

Standardized architecture for extending ForenSight with future forensic analytical engines.
Maintains strict scientific safeguards, normalized observations, artifact tracking,
and discovery registration without altering the frozen V3 forensic core.
"""

from .categories import EngineCategory
from .status import EngineExecutionStatus, ScientificInapplicabilityExplanation
from .reference import ScientificReference, ReferenceType
from .artifact import ArtifactType, EngineArtifactMetadata
from .observation import NormalizedObservation
from .contract import (
    BaseForensicEngine,
    InputRequirements,
    ApplicabilityResult,
    ExecutionContext,
    EngineExecutionResult,
)
from .manifest import (
    PLANNED_FUTURE_ENGINES,
    PlannedEngineDescriptor,
    get_planned_engine_manifest,
)
from .registry import ForensicEngineRegistry, engine_registry
from .adapters import (
    LegacyMetadataAdapter,
    LegacyELAAdapter,
    LegacyNoiseAdapter,
    LegacyJPEGDCTAdapter,
    LegacyCopyMoveAdapter,
)
from .jpeg import (
    JPEGStructureEngine,
    JPEGQuantizationTableEngine,
    JPEGHuffmanEngine,
)
from .compression import (
    JPEGGhostEngine,
    ADJPEGEngine,
    NADJPEGEngine,
)
from .blocking import (
    BlockingArtifactEngine,
    BlockingArtifactParameters,
)
from .distribution import (
    HistogramEngine,
    HistogramParameters,
)
from .color import (
    ColorChannelEngine,
    ColorChannelParameters,
)
from .frequency import (
    FourierEngine,
    FourierParameters,
)
from .noise import (
    AdvancedNoiseEngine,
    AdvancedNoiseParameters,
)
from .resampling import (
    ResamplingEngine,
    ResamplingParameters,
)
from .clone_block import (
    CloneBlockEngine,
    CloneBlockParameters,
)
from .clone_keypoint import (
    CloneKeypointEngine,
    CloneKeypointParameters,
)
from .prnu import (
    PRNUEngine,
    PRNUParameters,
    PRNUFingerprintMetadata,
)
from .camera import (
    CameraIDEngine,
    CameraIDParameters,
    CameraReferenceMetadata,
    CameraReferenceLibrary,
)

# Pre-register V3 core engines via non-invasive adapters
engine_registry.register(LegacyMetadataAdapter())
engine_registry.register(LegacyELAAdapter())
engine_registry.register(LegacyNoiseAdapter())
engine_registry.register(LegacyJPEGDCTAdapter())
engine_registry.register(LegacyCopyMoveAdapter())

# Register V4 Step 2 JPEG engines
engine_registry.register(JPEGStructureEngine())
engine_registry.register(JPEGQuantizationTableEngine())
engine_registry.register(JPEGHuffmanEngine())

# Register V4 Step 3 Compression History engines
engine_registry.register(JPEGGhostEngine())
engine_registry.register(ADJPEGEngine())
engine_registry.register(NADJPEGEngine())

# Register V4 Step 4 Blocking Artifact engine
engine_registry.register(BlockingArtifactEngine())

# Register V4 Step 5 Distribution, Color, and Frequency engines
engine_registry.register(HistogramEngine())
engine_registry.register(ColorChannelEngine())
engine_registry.register(FourierEngine())

# Register V4 Step 6 Advanced Noise and Resampling engines
engine_registry.register(AdvancedNoiseEngine())
engine_registry.register(ResamplingEngine())

# Register V4 Step 7 Copy-Move engines
engine_registry.register(CloneBlockEngine())
engine_registry.register(CloneKeypointEngine())

# Register V4 Step 8 PRNU and Camera-ID engines
engine_registry.register(PRNUEngine())
engine_registry.register(CameraIDEngine())

from .runner import V4EngineRunner

__all__ = [
    "EngineCategory",
    "EngineExecutionStatus",
    "ScientificInapplicabilityExplanation",
    "ScientificReference",
    "ReferenceType",
    "ArtifactType",
    "EngineArtifactMetadata",
    "NormalizedObservation",
    "BaseForensicEngine",
    "InputRequirements",
    "ApplicabilityResult",
    "ExecutionContext",
    "EngineExecutionResult",
    "PLANNED_FUTURE_ENGINES",
    "PlannedEngineDescriptor",
    "get_planned_engine_manifest",
    "ForensicEngineRegistry",
    "engine_registry",
    "LegacyMetadataAdapter",
    "LegacyELAAdapter",
    "LegacyNoiseAdapter",
    "LegacyJPEGDCTAdapter",
    "LegacyCopyMoveAdapter",
    "JPEGStructureEngine",
    "JPEGQuantizationTableEngine",
    "JPEGHuffmanEngine",
    "JPEGGhostEngine",
    "ADJPEGEngine",
    "NADJPEGEngine",
    "BlockingArtifactEngine",
    "BlockingArtifactParameters",
    "HistogramEngine",
    "HistogramParameters",
    "ColorChannelEngine",
    "ColorChannelParameters",
    "FourierEngine",
    "FourierParameters",
    "AdvancedNoiseEngine",
    "AdvancedNoiseParameters",
    "ResamplingEngine",
    "ResamplingParameters",
    "CloneBlockEngine",
    "CloneBlockParameters",
    "CloneKeypointEngine",
    "CloneKeypointParameters",
    "PRNUEngine",
    "PRNUParameters",
    "PRNUFingerprintMetadata",
    "CameraIDEngine",
    "CameraIDParameters",
    "CameraReferenceMetadata",
    "CameraReferenceLibrary",
    "V4EngineRunner",
]


