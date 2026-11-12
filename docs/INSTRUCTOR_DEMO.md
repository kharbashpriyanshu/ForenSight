# ForenSight Instructor Demonstration Investigation (`FS-DEMO-001`)

## Overview

ForenSight includes a self-contained, reproducible demonstration investigation (`FS-DEMO-001`: **Digital Image Manipulation Investigation — Recruitment Campaign**) so an instructor or reviewer can explore the complete digital image forensics workflow without manually creating a case, uploading files, running analyses, or linking relationships.

> **SYNTHETIC TRAINING DATASET:** All images, metadata, custody events, observations, findings, and reports in `FS-DEMO-001` are programmatically generated synthetic training artifacts.

---

## Development-Only Demo Account

- **Username:** `demo_instructor`
- **Password:** `forensight_demo_instructor`
- **Role:** `INVESTIGATOR` (non-admin; isolated from all other users' cases)
- **Login UI Shortcut:** On `/login`, click **Use Instructor Demo Credentials** (`data-testid="fill-demo-credentials"`).
- **Production Guard:** Both seeding and resetting refuse to run when `ENVIRONMENT` is `production` or `prod`.

---

## Seeding & Resetting

Run from the `backend/` directory:

```bash
# Idempotent seed (safe to re-run; skips if FS-DEMO-001 is already complete)
python -m scripts.seed_instructor_demo

# Reset FS-DEMO-001 and re-seed from scratch (preserves all other users and cases)
python -m scripts.seed_instructor_demo --reset

# Remove only FS-DEMO-001 without re-seeding
python -m scripts.seed_instructor_demo --reset-only
```

---

## Synthetic 7-Image Dataset & Ground Truth

All 7 evidence files are deterministically generated and ingested through ForenSight's real intake, storage, and SHA-256 hashing pipeline:

1. `campaign_original_master.png` — Uncompressed lossless master scene.
2. `campaign_camera_original.jpg` — Primary JPEG capture with synthetic EXIF metadata.
3. `campaign_recompressed_q65.jpg` — Social-media-style recompressed derivative (`Q=65`).
4. `campaign_cropped_derivative.jpg` — Cropped/rescaled derivative for lineage & resampling inspection.
5. `campaign_composite_splice.jpg` — Composite image containing a spliced patch from `campaign_splice_donor.jpg`.
6. `campaign_splice_donor.jpg` — Donor source image for cross-correlation & keypoint matching.
7. `campaign_press_png.png` — Lossless PNG press release export.

A matching ground-truth binary splice mask is saved at `backend/storage/../demo_ground_truth/campaign_composite_splice_mask.png` matching the exact dimensions of `campaign_composite_splice.jpg`.

---

## Executed Pipeline & Capabilities Showcased

- **Real Forensic Engines:** `metadata`, `ela`, `noise`, `jpeg-dct`, `copy-move`, `fourier`, `resampling`, `advanced-noise`, `clone-keypoint`, and `adjpeg` (lossless PNGs run `metadata`, `noise`, `fourier`).
- **Fusion & Cross-Correlation:** Normalized observations, correlated assessments, shared camera/keypoint cross-correlation, and `LineageService` ORB/dHash derivative links.
- **Investigation Graph:** Populated `CASE`, `EVIDENCE`, `OBSERVATION`, `FINDING`, and `REPORT` nodes with `CONTAINS`, `DERIVED_FROM`, `HAS_OBSERVATION`, `SUPPORTS`, and `GENERATED` edges.
- **Analyst Review & Custody:** Verified/annotated findings, analyst notes, intact SHA-256 chain of custody, and hash-chained chronological audit trail.

---

## Known Environment Notes

- **PDF Reports (`reportlab`):** `reportlab` is not installed in the default Python 3.13 environment (`REPORTLAB_AVAILABLE = False`). JSON forensic reports are generated natively and downloadable; PDF generation requires installing `reportlab`.
- **Signed Case Archives (`.forensight`):** Export requires `CASE_EXPORT_SIGNING_PRIVATE_KEY` to be configured. When unset, export fails closed with `SigningKeyUnavailable`.

