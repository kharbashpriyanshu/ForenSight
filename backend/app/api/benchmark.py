"""
ForenSight V4 — Benchmark API Endpoints

Provides authenticated REST endpoints for:
- Listing available benchmark datasets and manifests
- Triggering deterministic benchmark evaluations
- Querying scientific summary reports
- Executing dedicated PRNU validation protocol
"""

import os
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.models.domain import User
from app.benchmark.runner import BenchmarkRunner, reproduce_benchmark_run
from app.benchmark.reporter import BenchmarkReporter, ExternalBenchmarkReporter
from app.benchmark.prnu_benchmark import PRNUBenchmarkProtocol
from app.benchmark.real_prnu import RealCameraPRNUProtocol
from app.benchmark.transformation_stress import TransformationStressRunner, DEFAULT_ENGINES, MAX_SOURCE_IMAGES, PROFILES
from app.benchmark.controlled_generator import ControlledDatasetGenerator
from app.benchmark.dataset_adapter import register_dataset, verify_dataset_snapshot
from app.benchmark.models import (
    BenchmarkSummary,
    ExternalBenchmarkSummary,
    DatasetRegistrationReport,
)


router = APIRouter(prefix="/benchmark", tags=["Benchmark & Evaluation Harness"])

BENCHMARK_OUTPUT_DIR = os.path.abspath("datasets/benchmark")
CONTROLLED_DATASET_DIR = os.path.abspath("datasets/controlled/v1")


class BenchmarkRunRequest(BaseModel):
    dataset_dir: Optional[str] = Field(default="datasets/controlled/v1")
    engines: Optional[List[str]] = Field(default_factory=lambda: ["all"])
    verify_determinism: bool = True


class PRNUBenchmarkRequest(BaseModel):
    seed: int = 42


@router.get("/datasets")
def list_datasets(current_user: User = Depends(get_current_user)) -> List[Dict[str, Any]]:
    """List available benchmark datasets and generated manifests."""
    datasets_info = []
    base_datasets_dir = os.path.abspath("datasets")

    # Check controlled dataset
    if os.path.exists(CONTROLLED_DATASET_DIR):
        manifest_p = os.path.join(CONTROLLED_DATASET_DIR, "manifest.json")
        datasets_info.append({
            "dataset_id": "controlled-v1",
            "name": "ForenSight Controlled Evaluation Suite",
            "type": "CONTROLLED",
            "path": "datasets/controlled/v1",
            "manifest_exists": os.path.exists(manifest_p),
        })

    # Check external manifests
    manifests_dir = os.path.join(base_datasets_dir, "manifests")
    if os.path.exists(manifests_dir):
        for f in os.listdir(manifests_dir):
            if f.endswith(".json"):
                datasets_info.append({
                    "dataset_id": f.replace(".json", ""),
                    "name": f"Manifest Template: {f}",
                    "type": "EXTERNAL_MANIFEST",
                    "path": os.path.join("datasets/manifests", f),
                    "manifest_exists": True
                })

    return datasets_info


@router.post("/run", response_model=BenchmarkSummary)
def execute_benchmark(
    request: BenchmarkRunRequest,
    current_user: User = Depends(get_current_user)
) -> BenchmarkSummary:
    """
    Executes benchmark runner against target dataset and engines.
    Guarded by RBAC (Investigator or Admin).
    """
    ds_dir = os.path.abspath(request.dataset_dir or "datasets/controlled/v1")

    # Auto-generate controlled dataset if requested and not present
    if not os.path.exists(ds_dir) and "controlled" in ds_dir:
        generator = ControlledDatasetGenerator(ds_dir)
        generator.generate_full_controlled_suite()

    if not os.path.exists(ds_dir):
        raise HTTPException(status_code=404, detail=f"Dataset directory not found: {request.dataset_dir}")

    runner = BenchmarkRunner(dataset_dir=ds_dir)
    summary = runner.run_benchmark(
        engine_ids=request.engines,
        verify_determinism=request.verify_determinism
    )

    reporter = BenchmarkReporter(summary=summary, output_dir=BENCHMARK_OUTPUT_DIR)
    reporter.write_json_report()
    reporter.write_markdown_report()
    reporter.write_html_report()

    return summary


@router.get("/reports/latest")
def get_latest_report(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Retrieves the latest generated benchmark_results.json."""
    results_p = os.path.join(BENCHMARK_OUTPUT_DIR, "benchmark_results.json")
    if not os.path.exists(results_p):
        raise HTTPException(status_code=404, detail="No benchmark report has been generated yet.")

    import json
    with open(results_p, "r", encoding="utf-8") as f:
        return json.load(f)


@router.post("/prnu")
def execute_prnu_benchmark(
    request: PRNUBenchmarkRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Runs the two-camera 4-reference PRNU empirical evaluation protocol."""
    out_dir = os.path.join(BENCHMARK_OUTPUT_DIR, "prnu")
    protocol = PRNUBenchmarkProtocol(output_dir=out_dir, seed=request.seed)
    results = protocol.execute_evaluation()

    import json
    with open(os.path.join(out_dir, "prnu_benchmark_results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    return results


class DatasetRegistrationRequest(BaseModel):
    dataset_dir: str
    manifest_filename: str = "manifest.json"


class DatasetVerificationRequest(BaseModel):
    dataset_dir: str
    snapshot_filename: str = "dataset_snapshot.json"


class ExternalBenchmarkRunRequest(BaseModel):
    dataset_dir: str
    engines: Optional[List[str]] = Field(default_factory=lambda: ["all"])
    verify_determinism: bool = True
    verify_hashes: bool = True


class BenchmarkReproduceRequest(BaseModel):
    run_dir: str
    dataset_dir: Optional[str] = None


class RealPRNUBenchmarkRequest(BaseModel):
    camera_images: Optional[Dict[str, List[str]]] = None


class TransformationStressRequest(BaseModel):
    dataset_dir: str = "datasets/controlled/v1"
    engines: List[str] = Field(default_factory=lambda: list(DEFAULT_ENGINES))
    limit: int = Field(default=MAX_SOURCE_IMAGES, ge=1, le=MAX_SOURCE_IMAGES)


@router.post("/register-dataset", response_model=DatasetRegistrationReport)
def register_external_dataset(
    request: DatasetRegistrationRequest,
    current_user: User = Depends(get_current_user)
) -> DatasetRegistrationReport:
    """Validates external dataset structure, file decodability, and writes a cryptographic snapshot."""
    return register_dataset(request.dataset_dir, request.manifest_filename)


@router.post("/verify-dataset")
def verify_external_dataset(
    request: DatasetVerificationRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Cryptographically verifies on-disk external dataset against a prior snapshot."""
    is_valid, status, reasons = verify_dataset_snapshot(request.dataset_dir, request.snapshot_filename)
    return {
        "is_valid": is_valid,
        "status": status,
        "reasons": reasons
    }


@router.post("/run-external", response_model=ExternalBenchmarkSummary)
def execute_external_benchmark(
    request: ExternalBenchmarkRunRequest,
    current_user: User = Depends(get_current_user)
) -> ExternalBenchmarkSummary:
    """
    Executes a scientifically-hardened benchmark on an external forensic dataset.
    Generates 15-section JSON, Markdown, and Light HTML reports alongside streaming JSONL observations.
    """
    ds_dir = os.path.abspath(request.dataset_dir)
    out_dir = os.path.join(BENCHMARK_OUTPUT_DIR, "external")
    runner = BenchmarkRunner(dataset_dir=ds_dir)

    summary = runner.run_external_benchmark(
        output_dir=out_dir,
        engine_ids=request.engines,
        verify_determinism=request.verify_determinism,
        verify_hashes=request.verify_hashes,
    )

    if summary.status != "DATASET NOT AVAILABLE":
        reporter = ExternalBenchmarkReporter(summary=summary, output_dir=out_dir)
        reporter.write_json_report()
        reporter.write_markdown_report()
        reporter.write_html_report()

    return summary


@router.get("/reports/external/latest")
def get_latest_external_report(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    """Retrieves the latest external_benchmark_results.json."""
    results_p = os.path.join(BENCHMARK_OUTPUT_DIR, "external", "external_benchmark_results.json")
    if not os.path.exists(results_p):
        raise HTTPException(status_code=404, detail="No external benchmark report has been generated yet.")

    import json
    with open(results_p, "r", encoding="utf-8") as f:
        return json.load(f)


@router.post("/reproduce")
def reproduce_run(
    request: BenchmarkReproduceRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Re-executes a prior benchmark run and tests bit-for-bit repeatability and environment stability."""
    return reproduce_benchmark_run(request.run_dir, dataset_dir=request.dataset_dir)


@router.post("/prnu-real")
def execute_real_prnu_benchmark(
    request: RealPRNUBenchmarkRequest,
    current_user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Executes multi-reference MLE PRNU evaluation with sensitivity analysis on real camera imagery."""
    out_dir = os.path.join(BENCHMARK_OUTPUT_DIR, "prnu_real")
    protocol = RealCameraPRNUProtocol(output_dir=out_dir, camera_images=request.camera_images)
    results = protocol.execute_protocol()

    import json
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "real_prnu_results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    return results


@router.get("/transformation-profiles")
def list_transformation_profiles(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    return {
        "profiles": PROFILES,
        "default_engines": DEFAULT_ENGINES,
        "max_source_images": MAX_SOURCE_IMAGES,
        "disclaimer": "Profiles are synthetic, deterministic laboratory operations. They are not captured output from named social or messaging platforms.",
    }


@router.post("/transformation-stress")
def execute_transformation_stress(
    request: TransformationStressRequest,
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    dataset_dir = os.path.abspath(request.dataset_dir)
    if not os.path.exists(dataset_dir) and "controlled" in dataset_dir:
        ControlledDatasetGenerator(dataset_dir).generate_full_controlled_suite()
    if not os.path.isdir(dataset_dir):
        raise HTTPException(status_code=404, detail="Dataset directory not found")
    try:
        report = TransformationStressRunner(dataset_dir).run(request.engines, request.limit)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    output_dir = os.path.join(BENCHMARK_OUTPUT_DIR, "transformation-stress")
    os.makedirs(output_dir, exist_ok=True)
    report_path = os.path.join(output_dir, "latest.json")
    report["report_path"] = "datasets/benchmark/transformation-stress/latest.json"
    with open(report_path, "w", encoding="utf-8") as output:
        import json
        json.dump(report, output, indent=2)
    return report


@router.get("/transformation-stress/latest")
def get_latest_transformation_stress(current_user: User = Depends(get_current_user)) -> Dict[str, Any]:
    report_path = os.path.join(BENCHMARK_OUTPUT_DIR, "transformation-stress", "latest.json")
    if not os.path.isfile(report_path):
        raise HTTPException(status_code=404, detail="No transformation stress report has been generated yet")
    import json
    with open(report_path, "r", encoding="utf-8") as source:
        return json.load(source)

