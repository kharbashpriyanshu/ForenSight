"""
ForenSight V4 — Base Forensic Engine Contract

Defines the abstract interface and data structures required for all V4 forensic engines.
Ensures uniform applicability checking, parameter validation, observation generation,
artifact registration, and scientific safeguards across analytical modalities.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional, Type, Tuple
from pydantic import BaseModel, Field

from .categories import EngineCategory
from .status import EngineExecutionStatus, ScientificInapplicabilityExplanation
from .reference import ScientificReference
from .artifact import EngineArtifactMetadata, ArtifactType
from .observation import NormalizedObservation


class InputRequirements(BaseModel):
    """
    Format and dimensional constraints required for engine applicability.
    """
    supported_formats: List[str] = Field(default_factory=lambda: ["JPEG", "JPG", "PNG", "WEBP", "TIFF"], description="Uppercase container format extensions.")
    min_dimensions: Tuple[int, int] = Field((16, 16), description="Minimum (width, height) in pixels.")
    max_dimensions: Optional[Tuple[int, int]] = Field(None, description="Maximum (width, height) in pixels, or None if unbounded.")
    requires_color: bool = Field(False, description="True if engine requires 3-channel RGB imagery.")
    requires_lossy_compression: bool = Field(False, description="True if engine mathematically requires DCT/lossy compression history.")


class ApplicabilityResult(BaseModel):
    """
    Outcome of an applicability check prior to execution.
    """
    is_applicable: bool = Field(..., description="Whether the evidence meets all input prerequisites.")
    reason: Optional[str] = Field(None, description="Explanation when not applicable.")
    guardrail_notice: Optional[str] = Field(None, description="Notice ensuring inapplicability is not confused with negative evidence.")

    @classmethod
    def applicable(cls) -> "ApplicabilityResult":
        return cls(is_applicable=True)

    @classmethod
    def inapplicable(cls, engine_id: str, reason: str, target_format: str, required_format: str) -> "ApplicabilityResult":
        notice = ScientificInapplicabilityExplanation.create_payload(
            engine_id=engine_id,
            reason=reason,
            container_format=target_format,
            required_format=required_format
        )["scientific_guardrail"]
        return cls(
            is_applicable=False,
            reason=reason,
            guardrail_notice=notice
        )


class ExecutionContext(BaseModel):
    """
    Runtime execution context supplied to the engine.
    """
    evidence_id: int
    analysis_id: Optional[int] = None
    stored_path: str
    sha256_hash: str
    mime_type: str
    image_format: str
    width: int
    height: int
    parameters: Dict[str, Any] = Field(default_factory=dict)
    storage_output_dir: str


class EngineExecutionResult(BaseModel):
    """
    Standardized payload produced upon engine completion.
    """
    engine_id: str
    engine_version: str
    status: EngineExecutionStatus
    summary: str
    observations: List[NormalizedObservation] = Field(default_factory=list)
    artifacts: List[EngineArtifactMetadata] = Field(default_factory=list)
    structured_findings: Dict[str, Any] = Field(default_factory=dict)
    execution_time_ms: float = 0.0
    limitations: List[str] = Field(default_factory=list)
    inapplicability_data: Optional[Dict[str, Any]] = None


class BaseForensicEngine(ABC):
    """
    Standardized contract for all ForenSight analytical forensic engines.
    """
    engine_id: str
    engine_name: str
    engine_version: str = "1.0.0"
    category: EngineCategory
    description: str
    input_requirements: InputRequirements = InputRequirements()
    limitations: List[str] = []
    scientific_references: List[ScientificReference] = []

    parameter_schema: Type[BaseModel] = BaseModel
    observation_schema: Type[BaseModel] = BaseModel

    def check_applicability(self, context: ExecutionContext) -> ApplicabilityResult:
        """
        Validates container format, dimensions, and channel requirements.
        Subclasses may override to add specialized algorithmic prerequisites.
        """
        fmt = (context.image_format or "").upper()
        if self.input_requirements.supported_formats != ["ALL"]:
            if fmt not in [f.upper() for f in self.input_requirements.supported_formats]:
                return ApplicabilityResult.inapplicable(
                    engine_id=self.engine_id,
                    reason=f"Container format '{fmt}' is not supported by {self.engine_name}.",
                    target_format=fmt,
                    required_format=", ".join(self.input_requirements.supported_formats)
                )

        min_w, min_h = self.input_requirements.min_dimensions
        if context.width < min_w or context.height < min_h:
            return ApplicabilityResult.inapplicable(
                engine_id=self.engine_id,
                reason=f"Dimensions {context.width}x{context.height} are smaller than required {min_w}x{min_h}.",
                target_format=fmt,
                required_format=f"Min {min_w}x{min_h}"
            )

        if self.input_requirements.max_dimensions:
            max_w, max_h = self.input_requirements.max_dimensions
            if context.width > max_w or context.height > max_h:
                return ApplicabilityResult.inapplicable(
                    engine_id=self.engine_id,
                    reason=f"Dimensions {context.width}x{context.height} exceed safe bound {max_w}x{max_h}.",
                    target_format=fmt,
                    required_format=f"Max {max_w}x{max_h}"
                )

        return ApplicabilityResult.applicable()

    @abstractmethod
    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        """
        Executes the forensic analysis.
        Must respect applicability checks and return an EngineExecutionResult.
        """
        pass

    def get_metadata(self) -> Dict[str, Any]:
        """
        Returns complete engine registration metadata.
        """
        return {
            "engine_id": self.engine_id,
            "engine_name": self.engine_name,
            "engine_version": self.engine_version,
            "category": self.category.value,
            "description": self.description,
            "input_requirements": self.input_requirements.model_dump(),
            "limitations": self.limitations,
            "scientific_references": [r.model_dump() for r in self.scientific_references],
            "parameter_schema": self.parameter_schema.model_json_schema() if hasattr(self.parameter_schema, "model_json_schema") and self.parameter_schema is not BaseModel else {},
        }
