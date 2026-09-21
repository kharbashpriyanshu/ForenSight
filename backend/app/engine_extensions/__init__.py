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

# Pre-register V3 core engines via non-invasive adapters
engine_registry.register(LegacyMetadataAdapter())
engine_registry.register(LegacyELAAdapter())
engine_registry.register(LegacyNoiseAdapter())
engine_registry.register(LegacyJPEGDCTAdapter())
engine_registry.register(LegacyCopyMoveAdapter())

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
]
