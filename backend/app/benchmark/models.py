"""
ForenSight V4 — Forensic Benchmark & Evaluation Models

Strict schemas for dataset manifests, image records, transformation manifests,
benchmark results, and scientific evaluation metrics.
"""

from enum import Enum
from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel, Field, ConfigDict


class AuthenticOrManipulated(str, Enum):
    AUTHENTIC = "AUTHENTIC"
    MANIPULATED = "MANIPULATED"
    UNKNOWN = "UNKNOWN"


class ManipulationType(str, Enum):
    COPY_MOVE = "COPY_MOVE"
    SPLICING = "SPLICING"
    RESAMPLING = "RESAMPLING"
    NOISE = "NOISE"
    COMPRESSION = "COMPRESSION"
    COLOR = "COLOR"
    GEOMETRY = "GEOMETRY"
    REPETITIVE_TEXTURE = "REPETITIVE_TEXTURE"
    NONE = "NONE"
    UNKNOWN = "UNKNOWN"


class BenchmarkStatus(str, Enum):
    APPLIED = "APPLIED"
    NOT_APPLICABLE = "NOT_APPLICABLE"
    FAILED = "FAILED"
    COMPLETED = "COMPLETED"


class UncertaintyStatus(str, Enum):
    """
    Explicit uncertainty classification for metadata and ground-truth fields.
    Guarantees that unasserted, missing, or inapplicable values are not collapsed into generic NULL.
    """
    KNOWN = "KNOWN"                  # Verified and present in ground-truth documentation
    UNKNOWN = "UNKNOWN"              # Unstated, ambiguous, or undetermined
    NOT_PROVIDED = "NOT_PROVIDED"    # Specifically omitted by the dataset creators
    NOT_APPLICABLE = "NOT_APPLICABLE"# Concept mathematically does not apply to this instance
    UNVERIFIED = "UNVERIFIED"        # Asserted by metadata but not verified via on-disk inspection


class ImageRecord(BaseModel):
    """
    Standardized manifest entry representing a single image within an evaluation dataset.
    Unknown fields are strictly preserved as 'UNKNOWN' rather than guessed.
    """
    image_id: str = Field(..., description="Unique alphanumeric identifier within dataset")
    dataset_id: str = Field(default="UNKNOWN", description="Parent dataset identifier")
    source: str = Field(default="UNKNOWN", description="Acquisition device, lab, or publisher")
    source_license: str = Field(default="UNKNOWN", description="Copyright or license classification")
    filename: str = Field(..., description="Relative file path within dataset directory")
    sha256: str = Field(..., description="Cryptographic SHA-256 digest of original bitstream")
    format: str = Field(default="UNKNOWN", description="Container format: JPEG, PNG, TIFF, WEBP")
    width: int = Field(default=0, description="Spatial width in pixels")
    height: int = Field(default=0, description="Spatial height in pixels")
    color_mode: str = Field(default="RGB", description="RGB, L (grayscale), CMYK, RGBA")
    authentic_or_manipulated: AuthenticOrManipulated = Field(
        default=AuthenticOrManipulated.UNKNOWN,
        description="Ground truth authenticity status"
    )
    manipulation_type: ManipulationType = Field(
        default=ManipulationType.UNKNOWN,
        description="Category of manipulation applied if known"
    )
    manipulation_label: Optional[str] = Field(
        default=None,
        description="Exact raw dataset label string without normalization"
    )
    ground_truth_mask: Optional[str] = Field(
        default=None,
        description="Relative path to binary 0/255 manipulation mask"
    )
    ground_truth_availability: UncertaintyStatus = Field(
        default=UncertaintyStatus.UNKNOWN,
        description="Explicit uncertainty state for ground-truth classification"
    )
    mask_availability: UncertaintyStatus = Field(
        default=UncertaintyStatus.UNKNOWN,
        description="Explicit uncertainty state for spatial mask availability"
    )
    transformation_manifest: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Detailed transformation parameters for controlled fixtures"
    )
    transformation_history: Optional[Union[Dict[str, Any], List[Any]]] = Field(
        default=None,
        description="Known prior transformations applied to image"
    )
    transformation_history_status: UncertaintyStatus = Field(
        default=UncertaintyStatus.UNKNOWN,
        description="Uncertainty state of transformation provenance"
    )
    camera_reference: Optional[str] = Field(
        default=None,
        description="Associated camera label, sensor reference id, or make/model"
    )
    camera_reference_status: UncertaintyStatus = Field(
        default=UncertaintyStatus.UNKNOWN,
        description="Uncertainty state of source camera attribution"
    )
    compression_history: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Quantization tables, primary quality factor, or software history"
    )
    compression_history_status: UncertaintyStatus = Field(
        default=UncertaintyStatus.UNKNOWN,
        description="Uncertainty state of JPEG quantization / compression history"
    )
    annotation_provenance: Optional[str] = Field(
        default=None,
        description="Origin of ground truth (e.g. human-annotated, algorithm-generated, unknown)"
    )
    known_dataset_limitations: List[str] = Field(
        default_factory=list,
        description="Known annotation uncertainties, ambiguous boundaries, or compression noise"
    )
    expected_applicable_engines: List[str] = Field(
        default_factory=list,
        description="List of forensic engines expected to be APPLICABLE"
    )
    notes: Optional[str] = Field(default=None, description="Scientific context or anomalies")
    provenance: Optional[Dict[str, Any]] = Field(default=None, description="Chain of custody metadata")

    model_config = ConfigDict(extra="ignore")


class DatasetSnapshot(BaseModel):
    """
    Cryptographic snapshot of an external or registered dataset for immutable verification.
    """
    snapshot_version: str = "1.0.0"
    dataset_id: str
    dataset_version: str
    total_records: int
    total_bytes: int
    manifest_sha256: str
    image_hashes: Dict[str, str] = Field(default_factory=dict, description="Relative path -> SHA-256")
    mask_hashes: Dict[str, str] = Field(default_factory=dict, description="Relative mask path -> SHA-256")
    generated_at: str
    harness_version: str = "1.0.0"

    model_config = ConfigDict(extra="ignore")


class DatasetRegistrationReport(BaseModel):
    """
    Report produced upon validating and registering an external dataset manifest.
    """
    registration_id: str
    dataset_id: str
    dataset_version: str
    status: str = Field(..., description="'VALID' or 'INVALID'")
    is_valid: bool
    total_images_discovered: int = 0
    total_masks_validated: int = 0
    total_bytes: int = 0
    duplicate_hash_count: int = 0
    duplicate_hashes: List[str] = Field(default_factory=list)
    validation_errors: List[str] = Field(default_factory=list)
    snapshot_path: Optional[str] = None
    timestamp_utc: str

    model_config = ConfigDict(extra="ignore")


class BenchmarkEnvironmentSnapshot(BaseModel):
    """
    Runtime execution environment captured alongside benchmark runs for exact reproducibility.
    """
    benchmark_version: str = "1.0.0"
    dataset_version: str = "1.0.0"
    engine_manifest_version: str = "1.0.0"
    git_commit: str = "UNKNOWN"
    python_version: str
    opencv_version: str
    numpy_version: str
    scipy_version: str
    os_info: str
    captured_at: str

    model_config = ConfigDict(extra="ignore")


class BenchmarkObservationRecord(BaseModel):
    """
    Normalized, row-level observation entry for streaming benchmark_observations.jsonl export.
    Never duplicates large binary image payloads.
    """
    benchmark_run_id: str
    dataset_id: str
    dataset_version: str
    image_id: str
    image_sha256: str
    engine_id: str
    engine_version: str
    observation_type: str
    status: str
    observation_value: Any
    metric_name: Optional[str] = None
    metric_value: Optional[float] = None
    ground_truth_reference: Optional[str] = None
    artifact_reference: Optional[str] = None
    runtime_ms: float = 0.0
    limitations: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class DatasetManifest(BaseModel):
    """
    Manifest header and collection of image records for a forensic benchmark dataset.
    """
    manifest_version: str = Field(default="1.0.0", description="Manifest schema version")
    dataset_id: str = Field(..., description="Short canonical identifier (e.g. controlled-v1)")
    dataset_version: str = Field(default="1.0.0", description="Dataset release version")
    dataset_name: str = Field(..., description="Full descriptive title")
    dataset_type: str = Field(..., description="'CONTROLLED' or 'EXTERNAL'")
    description: str = Field(..., description="Methodology, goals, and known limitations")
    creation_date: str = Field(..., description="ISO 8601 date string")
    images: List[ImageRecord] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class TransformationManifest(BaseModel):
    """
    Specification for a controlled synthetic or laboratory image manipulation.
    """
    transformation_id: str
    transformation_type: ManipulationType
    source_image_id: str
    derived_image_id: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    affected_bbox: Optional[List[int]] = Field(
        default=None,
        description="[x_min, y_min, x_max, y_max] bounding box in pixel coordinates"
    )
    mask_filename: Optional[str] = None
    description: str


class BenchmarkResult(BaseModel):
    """
    Individual evaluation result for a single (Image, Engine) execution pair.
    """
    benchmark_id: str = Field(..., description="Unique evaluation uuid")
    benchmark_version: str = Field(default="1.0.0", description="Harness version")
    dataset_id: str
    dataset_version: str
    image_id: str
    source_sha256: str
    engine_id: str
    engine_version: str
    status: BenchmarkStatus
    runtime_ms: float
    processing_dimensions: Dict[str, int] = Field(default_factory=dict)
    observations: List[Dict[str, Any]] = Field(default_factory=list)
    artifacts: List[Dict[str, Any]] = Field(default_factory=list)
    ground_truth: Dict[str, Any] = Field(default_factory=dict)
    evaluation_metrics: Dict[str, Any] = Field(default_factory=dict)
    limitations: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class EngineBenchmarkMetrics(BaseModel):
    """
    Aggregated scientific metrics for a specific engine over an entire dataset.
    """
    engine_id: str
    engine_version: str
    total_images_evaluated: int = 0
    applied_count: int = 0
    not_applicable_count: int = 0
    failed_count: int = 0
    applicability_rate: float = 0.0
    execution_success_rate: float = 0.0
    mean_runtime_ms: float = 0.0
    p95_runtime_ms: float = 0.0
    deterministic_repeatability_rate: float = 1.0
    localization_metrics: Optional[Dict[str, float]] = None
    domain_specific_metrics: Dict[str, Any] = Field(default_factory=dict)


class BenchmarkSummary(BaseModel):
    """
    Full scientific evaluation report summary across all evaluated engines and datasets.
    """
    summary_id: str
    benchmark_version: str = "1.0.0"
    dataset_id: str
    dataset_version: str
    created_at: str
    total_images: int
    total_evaluations: int
    engines_evaluated: List[str]
    engine_metrics: Dict[str, EngineBenchmarkMetrics]
    determinism_verified: bool
    runtime_total_seconds: float
    overall_limitations: List[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class ExternalBenchmarkSummary(BenchmarkSummary):
    """
    Extended evaluation report summary for real-world external dataset benchmarks.
    Enforces scientific reporting rigor: authentic/manipulated separation,
    manipulation breakdown, compression stratification, and false positive characterization.
    """
    status: str = "COMPLETED"  # "COMPLETED" or "DATASET NOT AVAILABLE"
    dataset_type: str = "EXTERNAL"
    environment_snapshot: Optional[BenchmarkEnvironmentSnapshot] = None
    dataset_snapshot_path: Optional[str] = None
    authentic_evaluations: Dict[str, Any] = Field(default_factory=dict)
    manipulated_evaluations: Dict[str, Any] = Field(default_factory=dict)
    manipulation_type_breakdown: Dict[str, Any] = Field(default_factory=dict)
    compression_stratification: Dict[str, Any] = Field(default_factory=dict)
    false_positive_characterization: Dict[str, Any] = Field(default_factory=dict)
    observations_jsonl_path: Optional[str] = None
    reproducibility_hash: Optional[str] = None

