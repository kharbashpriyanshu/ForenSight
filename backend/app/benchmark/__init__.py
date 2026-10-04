"""
ForenSight V4 — Forensic Evaluation & Benchmark Harness Package
"""

from .models import (
    ImageRecord,
    DatasetManifest,
    TransformationManifest,
    BenchmarkStatus,
    BenchmarkResult,
    EngineBenchmarkMetrics,
    BenchmarkSummary,
    ExternalBenchmarkSummary,
    AuthenticOrManipulated,
    ManipulationType,
    UncertaintyStatus,
    DatasetSnapshot,
    DatasetRegistrationReport,
    BenchmarkEnvironmentSnapshot,
    BenchmarkObservationRecord,
)
from .controlled_generator import ControlledDatasetGenerator
from .dataset_adapter import (
    BaseDatasetAdapter,
    ManifestDatasetAdapter,
    GenericDirectoryAdapter,
    CASIADatasetAdapter,
    ColumbiaDatasetAdapter,
    NISTOpenMFCDatasetAdapter,
    validate_safe_relative_path,
    compute_sha256,
    register_dataset,
    create_dataset_snapshot,
    verify_dataset_snapshot,
)
from .metrics import (
    compute_spatial_localization_metrics,
    compute_bbox_iou,
    evaluate_copy_move_candidates,
    evaluate_resampling_response,
    evaluate_noise_discrepancy,
    compute_runtime_distribution,
)
from .prnu_benchmark import PRNUBenchmarkProtocol
from .real_prnu import RealCameraPRNUProtocol
from .runner import (
    BenchmarkRunner,
    capture_environment_snapshot,
    reproduce_benchmark_run,
)
from .reporter import BenchmarkReporter, ExternalBenchmarkReporter

__all__ = [
    "ImageRecord",
    "DatasetManifest",
    "TransformationManifest",
    "BenchmarkStatus",
    "BenchmarkResult",
    "EngineBenchmarkMetrics",
    "BenchmarkSummary",
    "ExternalBenchmarkSummary",
    "AuthenticOrManipulated",
    "ManipulationType",
    "UncertaintyStatus",
    "DatasetSnapshot",
    "DatasetRegistrationReport",
    "BenchmarkEnvironmentSnapshot",
    "BenchmarkObservationRecord",
    "ControlledDatasetGenerator",
    "BaseDatasetAdapter",
    "ManifestDatasetAdapter",
    "GenericDirectoryAdapter",
    "CASIADatasetAdapter",
    "ColumbiaDatasetAdapter",
    "NISTOpenMFCDatasetAdapter",
    "validate_safe_relative_path",
    "compute_sha256",
    "register_dataset",
    "create_dataset_snapshot",
    "verify_dataset_snapshot",
    "compute_spatial_localization_metrics",
    "compute_bbox_iou",
    "evaluate_copy_move_candidates",
    "evaluate_resampling_response",
    "evaluate_noise_discrepancy",
    "compute_runtime_distribution",
    "PRNUBenchmarkProtocol",
    "RealCameraPRNUProtocol",
    "BenchmarkRunner",
    "capture_environment_snapshot",
    "reproduce_benchmark_run",
    "BenchmarkReporter",
    "ExternalBenchmarkReporter",
]
