# ForenSight Dataset Manifest Specification v1.0.0

## 1. Overview
The ForenSight Dataset Manifest format standardizes how external and synthetic image forensics corpora are described, ingested, and evaluated. 

All manifests are strictly validated using Pydantic schemas defined in `backend/app/benchmark/models.py`.

---

## 2. Security & Integrity Guarantees

### 2.1 Path Traversal Prevention
Dataset manifests specify relative file paths. To eliminate directory traversal vulnerabilities (`../` or absolute path injection):
- All relative paths are checked via `validate_safe_relative_path()`.
- Paths containing `..`, leading drive letters (`C:`), or leading slashes are immediately rejected.
- Normalized target paths must resolve strictly within the configured `dataset_root`.

### 2.2 SHA-256 Bitstream Verification
- Every `ImageRecord` includes an optional or mandatory `sha256` digest.
- The `DatasetAdapter` verifies the on-disk image file against this hash prior to evaluation. If a mismatch is found, the image is marked corrupted and skipped.

---

## 3. Schema Structure

```json
{
  "dataset_id": "controlled-v1",
  "dataset_name": "ForenSight Controlled Synthetic Benchmark Suite",
  "dataset_version": "1.0.0",
  "description": "Controlled fixtures evaluating 8 distinct image forensics modalities.",
  "dataset_type": "CONTROLLED",
  "images": [
    {
      "image_id": "controlled_resampling_scaled",
      "relative_path": "resampling/resampling_scaled.png",
      "format": "PNG",
      "width": 256,
      "height": 256,
      "color_mode": "RGB",
      "authentic_or_manipulated": "MANIPULATED",
      "manipulation_types": ["GEOMETRIC_TRANSFORMATION"],
      "ground_truth_mask": "resampling/resampling_scaled_mask.png",
      "bounding_boxes": [],
      "transformations": [
        {
          "transformation_type": "RESIZE",
          "parameters": { "scale_factor": 1.45, "interpolation": "BICUBIC" },
          "source_image_id": "controlled_pristine_base"
        }
      ],
      "sha256": "4e78...",
      "metadata": {}
    }
  ]
}
```

---

## 4. Ground-Truth Mask Conventions
- **Format**: Lossless 8-bit grayscale image (`PNG` or `TIFF`).
- **Pixel Values**:
  - `0`: Authentic / unaltered background.
  - `255`: Tampered / spliced / pasted region.
  - Values in $(0, 255)$ represent alpha-blended or feather-edged transitions.
- **Dimensionality**: Ground-truth masks must match the exact pixel dimensions $(W, H)$ of the query image.
- **Absence of Mask**: If ground-truth masks do not exist for an external image, `mask_availability` is set to `NOT_PROVIDED` and spatial metrics are recorded as `NOT_EVALUATED`.

---

## 5. Step 10 Uncertainty & Provenance Fields
External forensic evaluation mandates explicit modeling of real-world metadata uncertainty:
- `manipulation_label`: Semantic description of the claimed alteration.
- `ground_truth_availability`: `KNOWN`, `UNKNOWN`, `NOT_PROVIDED`, or `UNVERIFIED`.
- `mask_availability`: `KNOWN`, `NOT_PROVIDED`, etc.
- `transformation_history`: List of known processing steps (e.g. `['crop', 'jpeg_q85']`).
- `transformation_history_status`: `KNOWN`, `UNKNOWN`, `UNVERIFIED`.
- `annotation_provenance`: Origin of annotation (author-provided, automated, estimated).
- `known_dataset_limitations`: Documented flaws (e.g. double compression in base images).
- `compression_history_status`: Degree of knowledge regarding historical encodings.
- `camera_reference_status`: Sensor source verification level.

---

## 6. Dataset Snapshot Specification (`dataset_snapshot.json`)
Before external evaluation, the dataset is cryptographically frozen:
```json
{
  "snapshot_id": "9a3f...",
  "dataset_id": "casia2",
  "dataset_version": "2.0.0",
  "created_at_utc": "2026-09-22T12:00:00Z",
  "total_images": 7491,
  "total_masks": 5123,
  "total_bytes": 1048576000,
  "file_hashes": { ... },
  "duplicate_hashes": []
}
```

