"""
ForenSight V4 — Benchmark CLI

Command-line interface for:
- Generating controlled datasets (python -m app.benchmark generate)
- Running benchmarks (python -m app.benchmark run --dataset ... --engines ...)
- Executing dedicated PRNU validation protocol (python -m app.benchmark prnu)
"""

import os
import sys
import argparse
import json

from .controlled_generator import ControlledDatasetGenerator
from .runner import BenchmarkRunner, reproduce_benchmark_run
from .reporter import BenchmarkReporter, ExternalBenchmarkReporter
from .prnu_benchmark import PRNUBenchmarkProtocol
from .real_prnu import RealCameraPRNUProtocol
from .dataset_adapter import register_dataset, verify_dataset_snapshot


def main():
    parser = argparse.ArgumentParser(
        prog="python -m app.benchmark",
        description="ForenSight V4 Scientific Forensic Benchmark & Evaluation Harness"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcommand: generate
    gen_parser = subparsers.add_parser("generate", help="Generate controlled synthetic benchmark dataset")
    gen_parser.add_argument("--output", "-o", default="datasets/controlled/v1", help="Output directory for generated dataset")
    gen_parser.add_argument("--dataset-id", default="controlled-v1", help="Dataset identifier")
    gen_parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic generation")

    # Subcommand: run
    run_parser = subparsers.add_parser("run", help="Run benchmark suite on a dataset")
    run_parser.add_argument("--dataset-dir", "-d", default="datasets/controlled/v1", help="Directory containing dataset and manifest.json")
    run_parser.add_argument("--manifest", "-m", default=None, help="Direct path to manifest.json file or its parent directory")
    run_parser.add_argument("--engines", "-e", default="all", help="Comma-separated engine IDs or 'all'")
    run_parser.add_argument("--output", "-o", default="datasets/benchmark", help="Output directory for benchmark reports")
    run_parser.add_argument("--no-determinism", action="store_true", help="Skip 3-run determinism verification")

    # Subcommand: prnu
    prnu_parser = subparsers.add_parser("prnu", help="Run dedicated PRNU camera attribution protocol")
    prnu_parser.add_argument("--output", "-o", default="datasets/benchmark/prnu", help="Output directory for PRNU benchmark results")
    prnu_parser.add_argument("--seed", type=int, default=42, help="Random seed for synthetic sensors")

    # Subcommand: register-dataset
    reg_parser = subparsers.add_parser("register-dataset", help="Validate and register an external forensic dataset")
    reg_parser.add_argument("--dataset-dir", "-d", required=True, help="Directory containing external dataset")
    reg_parser.add_argument("--manifest", "-m", default="manifest.json", help="Manifest filename within dataset-dir")

    # Subcommand: verify-dataset
    ver_parser = subparsers.add_parser("verify-dataset", help="Cryptographically verify dataset files against snapshot")
    ver_parser.add_argument("--dataset-dir", "-d", required=True, help="Directory containing external dataset")
    ver_parser.add_argument("--snapshot", "-s", default="dataset_snapshot.json", help="Snapshot filename within dataset-dir")

    # Subcommand: run-external
    ext_parser = subparsers.add_parser("run-external", help="Run scientifically hardened benchmark on external dataset")
    ext_parser.add_argument("--dataset-dir", "-d", required=True, help="Directory containing external dataset")
    ext_parser.add_argument("--engines", "-e", default="all", help="Comma-separated engine IDs or 'all'")
    ext_parser.add_argument("--output", "-o", default="datasets/benchmark/external", help="Output directory for reports")
    ext_parser.add_argument("--no-determinism", action="store_true", help="Skip 3-run determinism check")
    ext_parser.add_argument("--no-hash-verify", action="store_true", help="Skip per-image SHA-256 integrity verification")

    # Subcommand: reproduce
    rep_parser = subparsers.add_parser("reproduce", help="Re-execute benchmark run to verify exact reproducibility")
    rep_parser.add_argument("--run-dir", "-r", required=True, help="Artifact directory containing external_benchmark_results.json")
    rep_parser.add_argument("--dataset-dir", "-d", default=None, help="Optional override path to dataset directory")

    # Subcommand: prnu-real
    prnu_real_parser = subparsers.add_parser("prnu-real", help="Run PRNU protocol on real multi-reference camera imagery")
    prnu_real_parser.add_argument("--output", "-o", default="datasets/benchmark/prnu_real", help="Output directory")
    prnu_real_parser.add_argument("--cameras-json", "-c", default=None, help="JSON configuration mapping camera_id to image lists")

    args = parser.parse_args()

    if args.command == "generate":
        print(f"=== Generating Controlled ForenSight Dataset: {args.dataset_id} ===")
        print(f"Output directory: {args.output} (Seed: {args.seed})")
        gen = ControlledDatasetGenerator(output_dir=args.output, seed=args.seed)
        manifest = gen.generate_full_controlled_suite(dataset_id=args.dataset_id)
        print(f"Successfully generated {len(manifest.images)} controlled fixtures with ground truth masks.")
        print(f"Manifest saved to: {os.path.join(args.output, 'manifest.json')}")

    elif args.command == "run":
        target_dir = args.manifest if args.manifest else args.dataset_dir
        if os.path.isfile(target_dir):
            target_dir = os.path.dirname(target_dir)
        engines_list = [eng.strip() for eng in args.engines.split(",") if eng.strip()]
        print(f"=== Executing ForenSight Forensic Benchmark ===")
        print(f"Dataset path: {target_dir}")
        print(f"Target engines: {engines_list}")
        
        runner = BenchmarkRunner(dataset_dir=target_dir)
        summary = runner.run_benchmark(
            engine_ids=engines_list,
            verify_determinism=not args.no_determinism
        )

        reporter = BenchmarkReporter(summary=summary, output_dir=args.output)
        json_p = reporter.write_json_report()
        md_p = reporter.write_markdown_report()
        html_p = reporter.write_html_report()

        print("=== Benchmark Run Completed ===")
        print(f"Total Evaluations: {summary.total_evaluations}")
        print(f"Determinism Verified: {summary.determinism_verified}")
        print(f"JSON Report: {json_p}")
        print(f"Markdown Report: {md_p}")
        print(f"HTML Report: {html_p}")

    elif args.command == "prnu":
        print(f"=== Running PRNU Multi-Camera Attribution Protocol ===")
        protocol = PRNUBenchmarkProtocol(output_dir=args.output, seed=args.seed)
        res = protocol.execute_evaluation()
        os.makedirs(args.output, exist_ok=True)
        out_p = os.path.join(args.output, "prnu_benchmark_results.json")
        with open(out_p, "w", encoding="utf-8") as f:
            json.dump(res, f, indent=2)
        print(f"PRNU Benchmark Completed.")
        print(f"Same-Camera Mean PCE: {res['same_camera_distribution']['mean_pce']}")
        print(f"Different-Camera Mean PCE: {res['different_camera_distribution']['mean_pce']}")
        print(f"Separation Gap: {res['separation_metrics']['pce_separation_gap']}")
        print(f"Results written to: {out_p}")

    elif args.command == "register-dataset":
        print(f"=== Registering External Dataset ===")
        print(f"Directory: {args.dataset_dir}")
        print(f"Manifest: {args.manifest}")
        report = register_dataset(args.dataset_dir, args.manifest)
        print(f"Registration Status: {report.status}")
        print(f"Total Images Discovered: {report.total_images_discovered}")
        print(f"Total Masks Validated: {report.total_masks_validated}")
        print(f"Duplicate Hashes: {report.duplicate_hash_count}")
        if report.snapshot_path:
            print(f"Snapshot written to: {report.snapshot_path}")
        if report.validation_errors:
            print("Validation Warnings / Errors:")
            for err in report.validation_errors:
                print(f" - {err}")

    elif args.command == "verify-dataset":
        print(f"=== Verifying External Dataset Integrity ===")
        is_valid, status, reasons = verify_dataset_snapshot(args.dataset_dir, args.snapshot)
        print(f"Verification Status: {status}")
        print(f"Cryptographic Integrity: {'PASSED' if is_valid else 'FAILED'}")
        if reasons:
            print("Discrepancies:")
            for r in reasons:
                print(f" - {r}")

    elif args.command == "run-external":
        engines_list = [eng.strip() for eng in args.engines.split(",") if eng.strip()]
        print(f"=== Executing External Forensic Dataset Benchmark ===")
        print(f"Dataset Directory: {args.dataset_dir}")
        print(f"Engines: {engines_list}")

        runner = BenchmarkRunner(dataset_dir=args.dataset_dir)
        summary = runner.run_external_benchmark(
            output_dir=args.output,
            engine_ids=engines_list,
            verify_determinism=not args.no_determinism,
            verify_hashes=not args.no_hash_verify
        )

        reporter = ExternalBenchmarkReporter(summary=summary, output_dir=args.output)
        json_p = reporter.write_json_report()
        md_p = reporter.write_markdown_report()
        html_p = reporter.write_html_report()

        print("=== External Benchmark Run Completed ===")
        print(f"Status: {summary.status}")
        print(f"Evaluations: {summary.total_evaluations}")
        print(f"Determinism: {'VERIFIED' if summary.determinism_verified else 'DISCREPANCY'}")
        print(f"JSON Report: {json_p}")
        print(f"Markdown Report: {md_p}")
        print(f"HTML Report: {html_p}")
        if summary.observations_jsonl_path:
            print(f"Observation Stream: {summary.observations_jsonl_path}")

    elif args.command == "reproduce":
        print(f"=== Reproducing External Benchmark Run ===")
        print(f"Run Directory: {args.run_dir}")
        rep = reproduce_benchmark_run(args.run_dir, dataset_dir=args.dataset_dir)
        print(f"Reproduction Status: {rep['status']}")
        print(f"Bit-for-Bit Deterministic Match: {rep['reproducible']}")
        print(f"Match Rate: {rep.get('match_rate', 0.0) * 100:.1f}%")
        if rep.get("discrepancies"):
            print("Discrepancies:")
            for disc in rep["discrepancies"]:
                print(f" - {disc}")

    elif args.command == "prnu-real":
        print(f"=== Executing Real-Camera PRNU Validation Protocol ===")
        camera_dict = {}
        if args.cameras_json and os.path.exists(args.cameras_json):
            with open(args.cameras_json, "r", encoding="utf-8") as f:
                camera_dict = json.load(f)
        protocol = RealCameraPRNUProtocol(output_dir=args.output, camera_images=camera_dict)
        results = protocol.execute_protocol()
        out_p = os.path.join(args.output, "real_prnu_results.json")
        os.makedirs(args.output, exist_ok=True)
        with open(out_p, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        print(f"Real PRNU Protocol Completed.")
        print(f"Results written to: {out_p}")


if __name__ == "__main__":
    main()

