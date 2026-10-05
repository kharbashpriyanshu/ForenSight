"""Deterministic benign-transformation stress runs for registered image datasets.

Profiles are laboratory simulations, not captured output from named messaging
platforms. The report compares engine measurements and applicability by profile;
it deliberately does not turn raw metrics into a universal false-alarm score.
"""

import json
import hashlib
import os
import re
import shutil
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from PIL import Image, ImageOps

from app.benchmark.dataset_adapter import validate_safe_relative_path, compute_sha256
from app.benchmark.models import (
    AuthenticOrManipulated,
    BenchmarkSummary,
    DatasetManifest,
    ImageRecord,
    UncertaintyStatus,
)
from app.benchmark.runner import BenchmarkRunner
from app.engine_extensions.registry import engine_registry


DEFAULT_ENGINES = ["METADATA", "ELA", "NOISE", "JPEG_DCT", "COPY_MOVE", "RESAMPLING"]
MAX_SOURCE_IMAGES = 20

PROFILES = [
    {"id": "forward_jpeg_q82", "label": "Forwarded JPEG", "description": "Resize to a 1600-pixel long edge when needed, then encode as JPEG quality 82 with 4:2:0 chroma subsampling."},
    {"id": "double_recompress_q72_q84", "label": "Double JPEG recompression", "description": "JPEG quality 72 followed by a second JPEG save at quality 84."},
    {"id": "center_crop_5pct", "label": "Small center crop", "description": "Remove 5% from each edge, resize back to the source dimensions, then encode as JPEG quality 84."},
    {"id": "screen_capture_simulation", "label": "Screen recapture simulation", "description": "Fit the image into a 720 x 1280 neutral canvas and re-encode as JPEG quality 80; this is a synthetic lab profile, not a real phone capture."},
    {"id": "pixel_rewrite_png", "label": "Pixel rewrite to PNG", "description": "Decode and rewrite RGB pixels as PNG without carrying source metadata."},
]


class TransformationStressRunner:
    def __init__(self, dataset_dir: str):
        self.dataset_dir = os.path.abspath(dataset_dir)
        self.source_runner = BenchmarkRunner(self.dataset_dir)
        if self.source_runner.manifest is None:
            raise ValueError("Dataset does not contain a readable manifest")

    def run(self, engines: Optional[List[str]] = None, limit: int = MAX_SOURCE_IMAGES) -> Dict[str, Any]:
        if limit < 1 or limit > MAX_SOURCE_IMAGES:
            raise ValueError(f"The transformation stress run accepts 1 to {MAX_SOURCE_IMAGES} source images")
        selected = [
            item for item in self.source_runner.manifest.images
            if item.authentic_or_manipulated in (AuthenticOrManipulated.AUTHENTIC, AuthenticOrManipulated.MANIPULATED)
        ][:limit]
        if not selected:
            raise ValueError("Dataset has no records with known authentic/manipulated labels")

        selected_engines = engines or DEFAULT_ENGINES
        registered_engine_ids = [engine.engine_id for engine in engine_registry.list_engines()]
        if any(engine.lower() == "all" for engine in selected_engines):
            selected_engines = registered_engine_ids
        known_engine_ids = {engine.upper() for engine in registered_engine_ids}
        unknown_engines = [engine for engine in selected_engines if engine.upper() not in known_engine_ids]
        if unknown_engines:
            raise ValueError(
                "Unknown engine ID(s): "
                + ", ".join(unknown_engines)
                + ". Use the IDs listed by GET /api/engines."
            )
        with tempfile.TemporaryDirectory(prefix="forensight_transform_stress_") as temp_root:
            temp_path = Path(temp_root)
            baseline_records = []
            for record in selected:
                baseline_records.append(self._copy_baseline(record, temp_path))
            baseline_manifest = self._manifest("baseline", baseline_records)
            baseline_runner = BenchmarkRunner(temp_root, manifest=baseline_manifest)
            baseline_summary = baseline_runner.run_benchmark(selected_engines, verify_determinism=False)
            baseline_values = self._measurements(baseline_runner)

            profile_reports = []
            for profile in PROFILES:
                profile_dir = temp_path / profile["id"]
                profile_records = []
                variant_to_source = {}
                for record in selected:
                    variant = self._make_variant(record, profile, profile_dir)
                    profile_records.append(variant)
                    variant_to_source[variant.image_id] = self._safe_image_id(record.image_id)
                profile_manifest = self._manifest(profile["id"], profile_records)
                profile_runner = BenchmarkRunner(temp_root, manifest=profile_manifest)
                profile_summary = profile_runner.run_benchmark(selected_engines, verify_determinism=False)
                profile_reports.append({
                    "profile": profile,
                    "source_image_count": len(profile_records),
                    "summary": profile_summary.model_dump(mode="json"),
                    "measurement_drift": self._measurement_drift(
                        baseline_values, self._measurements(profile_runner), variant_to_source,
                    ),
                    "limitations": [
                        "A profile is a synthetic operation sequence and does not claim to reproduce any named platform.",
                        "Execution success and measurement drift are reported; these are not false-positive rates or real-world accuracy estimates.",
                    ],
                })

            return {
                "report_type": "BENIGN_TRANSFORMATION_ROBUSTNESS",
                "dataset_id": self.source_runner.manifest.dataset_id,
                "dataset_version": self.source_runner.manifest.dataset_version,
                "source_images": [item.image_id for item in selected],
                "engines": selected_engines,
                "baseline": baseline_summary.model_dump(mode="json"),
                "profiles": profile_reports,
                "profile_catalog": PROFILES,
                "methodology": "Each source image is run once unchanged and once per deterministic benign transformation profile. Ground-truth labels are carried through; spatial masks are transformed with crop/resize geometry. No authenticity score is synthesized.",
                "limitations": [
                    "This is a controlled robustness check, not an evaluation against real messaging-app output.",
                    "Platform-specific false-alarm and detection rates require licensed, labelled external or captured reference data and task-specific decision rules.",
                    "Engine measurements can be content-dependent and should be reviewed per modality.",
                    "Determinism repeats are disabled for this multi-profile run to keep execution bounded.",
                ],
            }

    def _copy_baseline(self, record: ImageRecord, root: Path) -> ImageRecord:
        source = validate_safe_relative_path(self.dataset_dir, record.filename)
        safe_id = self._safe_image_id(record.image_id)
        suffix = Path(record.filename).suffix or ".img"
        target = root / "baseline" / f"{safe_id}{suffix}"
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        updated = record.model_copy(update={
            "image_id": safe_id,
            "filename": target.relative_to(root).as_posix(),
            "sha256": compute_sha256(str(target)),
        })
        if record.ground_truth_mask:
            mask_source = validate_safe_relative_path(self.dataset_dir, record.ground_truth_mask)
            mask_target = root / "baseline" / "masks" / f"{safe_id}.png"
            mask_target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(mask_source, mask_target)
            updated = updated.model_copy(update={"ground_truth_mask": mask_target.relative_to(root).as_posix()})
        return updated

    def _make_variant(self, record: ImageRecord, profile: Dict[str, str], root: Path) -> ImageRecord:
        source = validate_safe_relative_path(self.dataset_dir, record.filename)
        root.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as original:
            image = ImageOps.exif_transpose(original).convert("RGB")
        safe_id = self._safe_image_id(record.image_id)
        source_size = image.size
        mask = None
        if record.ground_truth_mask:
            mask_path = validate_safe_relative_path(self.dataset_dir, record.ground_truth_mask)
            with Image.open(mask_path) as mask_image:
                mask = mask_image.convert("L")

        geometry: Dict[str, Any] = {"crop": None, "canvas_offset": None}
        profile_id = profile["id"]
        if profile_id == "forward_jpeg_q82":
            image = self._resize_long_edge(image, 1600)
        elif profile_id == "double_recompress_q72_q84":
            stage = root / f"{safe_id}.stage.jpg"
            image.save(stage, format="JPEG", quality=72, subsampling=2)
            with Image.open(stage) as compressed:
                image = compressed.convert("RGB")
            stage.unlink(missing_ok=True)
        elif profile_id == "center_crop_5pct":
            width, height = image.size
            crop = (int(width * 0.05), int(height * 0.05), int(width * 0.95), int(height * 0.95))
            image = image.crop(crop).resize((width, height), Image.Resampling.LANCZOS)
            geometry["crop"] = list(crop)
            if mask is not None:
                mask = mask.crop(crop).resize((width, height), Image.Resampling.NEAREST)
        elif profile_id == "screen_capture_simulation":
            canvas_size = (720, 1280)
            image = self._place_on_canvas(image, canvas_size, geometry)
            if mask is not None:
                mask = self._place_mask_on_canvas(mask, canvas_size, geometry)

        output_format = "PNG" if profile_id == "pixel_rewrite_png" else "JPEG"
        suffix = ".png" if output_format == "PNG" else ".jpg"
        destination = root / f"{safe_id}{suffix}"
        if output_format == "PNG":
            image.save(destination, format="PNG", optimize=False)
        else:
            quality = 82 if profile_id == "forward_jpeg_q82" else 80 if profile_id == "screen_capture_simulation" else 84
            image.save(destination, format="JPEG", quality=quality, subsampling=2)

        image_id = f"{safe_id}__{profile_id}"
        mask_filename = None
        if mask is not None:
            mask = mask.resize(image.size, Image.Resampling.NEAREST)
            mask_target = root / "masks" / f"{image_id}.png"
            mask_target.parent.mkdir(parents=True, exist_ok=True)
            mask.save(mask_target, format="PNG")
            mask_filename = mask_target.relative_to(root.parent).as_posix()

        history = list(record.transformation_history) if isinstance(record.transformation_history, list) else []
        history.append({"kind": "BENIGN_DELIVERY_SIMULATION", "profile": profile_id, "geometry": geometry})
        return record.model_copy(update={
            "image_id": image_id,
            "filename": destination.relative_to(root.parent).as_posix(),
            "sha256": compute_sha256(str(destination)),
            "format": output_format,
            "width": image.width,
            "height": image.height,
            "ground_truth_mask": mask_filename,
            "transformation_history": history,
            "transformation_history_status": UncertaintyStatus.KNOWN,
            "notes": f"Benign transformation stress variant of {record.image_id}; source size {source_size[0]}x{source_size[1]}.",
        })

    @staticmethod
    def _safe_image_id(image_id: str) -> str:
        """Create a stable filesystem-safe identifier without collisions."""
        readable = re.sub(r"[^A-Za-z0-9_-]+", "_", str(image_id)).strip("_")[:48] or "image"
        digest = hashlib.sha256(str(image_id).encode("utf-8", errors="replace")).hexdigest()[:10]
        return f"{readable}_{digest}"

    @staticmethod
    def _resize_long_edge(image: Image.Image, max_edge: int) -> Image.Image:
        if max(image.size) <= max_edge:
            return image.copy()
        image.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        return image

    @staticmethod
    def _place_on_canvas(image: Image.Image, canvas_size: Tuple[int, int], geometry: Dict[str, Any]) -> Image.Image:
        margin = 36
        fitted = image.copy()
        fitted.thumbnail((canvas_size[0] - margin * 2, canvas_size[1] - margin * 2), Image.Resampling.LANCZOS)
        offset = ((canvas_size[0] - fitted.width) // 2, (canvas_size[1] - fitted.height) // 2)
        canvas = Image.new("RGB", canvas_size, (242, 242, 242))
        canvas.paste(fitted, offset)
        geometry["canvas_offset"] = [offset[0], offset[1], fitted.width, fitted.height]
        return canvas

    @staticmethod
    def _place_mask_on_canvas(mask: Image.Image, canvas_size: Tuple[int, int], geometry: Dict[str, Any]) -> Image.Image:
        left, top, width, height = geometry["canvas_offset"]
        fitted = mask.copy().resize((width, height), Image.Resampling.NEAREST)
        canvas = Image.new("L", canvas_size, 0)
        canvas.paste(fitted, (left, top))
        return canvas

    def _manifest(self, suffix: str, records: List[ImageRecord]) -> DatasetManifest:
        source = self.source_runner.manifest
        return DatasetManifest(
            dataset_id=f"{source.dataset_id}-transform-{suffix}",
            dataset_version=source.dataset_version,
            dataset_name=f"{source.dataset_name} — Transformation Stress",
            dataset_type="CONTROLLED",
            description="Deterministic baseline or benign delivery-transform variant subset. Refer to the report for limitations.",
            creation_date=source.creation_date,
            images=records,
        )

    @staticmethod
    def _measurements(runner: BenchmarkRunner) -> Dict[Tuple[str, str, str], float]:
        values: Dict[Tuple[str, str, str], float] = {}
        for engine_id, results in runner.results_by_engine.items():
            for result in results:
                for observation in result.observations:
                    metric = observation.get("metric_name") or observation.get("observation_type")
                    value = observation.get("normalized_value")
                    if metric and isinstance(value, (int, float)):
                        values[(engine_id, result.image_id, str(metric))] = float(value)
        return values

    @staticmethod
    def _measurement_drift(
        baseline: Dict[Tuple[str, str, str], float],
        transformed: Dict[Tuple[str, str, str], float],
        variant_to_source: Dict[str, str],
    ) -> Dict[str, Any]:
        grouped: Dict[Tuple[str, str], List[Tuple[float, Optional[float]]]] = defaultdict(list)
        for (engine_id, variant_id, metric), transformed_value in transformed.items():
            source_id = variant_to_source.get(variant_id)
            if not source_id:
                continue
            baseline_value = baseline.get((engine_id, source_id, metric))
            absolute = abs(transformed_value - baseline_value) if baseline_value is not None else None
            relative = absolute / abs(baseline_value) * 100 if absolute is not None and abs(baseline_value) > 1e-9 else None
            grouped[(engine_id, metric)].append((absolute, relative))

        result: Dict[str, Any] = {}
        for (engine_id, metric), rows in sorted(grouped.items()):
            absolute_values = [row[0] for row in rows if row[0] is not None]
            relative_values = [row[1] for row in rows if row[1] is not None]
            result.setdefault(engine_id, {})[metric] = {
                "paired_measurement_count": len(absolute_values),
                "mean_absolute_change": round(sum(absolute_values) / len(absolute_values), 6) if absolute_values else None,
                "mean_relative_change_percent": round(sum(relative_values) / len(relative_values), 3) if relative_values else None,
            }
        return result
