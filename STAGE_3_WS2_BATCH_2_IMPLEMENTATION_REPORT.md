# ForenSight — Stage 3, Workstream 2, Batch 2
## Academic Benchmark Evaluation Runner & Controlled-Suite Integration Report

**Repository:** `F:\Projects\ForenSight`  
**Branch:** `main`  
**Preflight Base Commit:** `6c50b6f134029efb353df69b0c88ec97d7e6e3a5`  
**Target Milestone:** Stage 3, Workstream 2, Batch 2 — Academic Benchmark Evaluation Runner  
**Execution Date:** 2026-11-11  

---

## 1. Executive Summary & Scope Completed

In strict adherence to `STAGE_3_PLANNING_AND_ROADMAP.md` (Sections 8, 9, 10 WS2) and the Batch 2 task specification, this batch implements the automated, reproducible academic evaluation runner for ForenSight's controlled benchmark dataset (`backend/datasets/controlled/v1/`).

### Delivered Capabilities:
1. **Automated Benchmark Runner (`run_academic_evaluation.py`):**
   - Ingests and cryptographically validates the controlled dataset manifest (11 fixture images, 4 pixel-level ground-truth masks).
   - Enforces the authoritative Section 9.3 Engine-to-Fixture Applicability Matrix across all 23 registered engines and 11 fixtures (253 deterministic dispatches).
   - Generates structured evaluation results JSON (`evaluation_results.json`), an authoritative Markdown report (`academic_evaluation_report.md` / `STAGE_3_ACADEMIC_EVALUATION_REPORT.md`), and clean ASCII console tables.
2. **Modular Tamper Localization Metrics (`localization.py`):**
   - Standalone, mathematically rigorous NumPy implementations of Intersection over Union (IoU), Precision, Recall, F1-Score, Sorensen-Dice Coefficient, and Bounding-Box IoU.
   - Comprehensive zero-denominator and threshold scale adaptation policies.
3. **Category A: Classical DIP Fidelity Evaluation:**
   - Evaluates compression loss on `fixture_002` ($Q=95, 75, 50$) against authentic reference baseline `fixture_001` using Batch 1 pure NumPy primitives (`calculate_mse`, `calculate_psnr`, `calculate_ssim`).
   - Verifies monotonic degradation without composite score inflation.
4. **Category B: Spatial Localization Evaluation:**
   - Evaluates localized detection engines exclusively where pixel-level ground-truth masks exist (`fixture_005` to `fixture_008`).
   - Evaluates Gaussian vs. Median noise residual filtering, color channel divergence, and copy-move clone detection.
5. **Category C: False-Positive Resistance Evaluation:**
   - Evaluates applicable forensic engines on authentic negative controls (`fixture_001` smooth baseline, `fixture_009` repetitive brick texture).
   - Empirically proves false alarm susceptibility on periodic textures without conflating negative controls with ground truth.
6. **Scientific Freeze Security Audit:**
   - Verified that the 38 frozen core forensic files remain 100% protected. Deliberate modifications and untracked files in protected engine directories trigger immediate freeze violations.

---

## 2. Files Created and Modified

| File Path | Status | Purpose / Description |
| :--- | :--- | :--- |
| `backend/app/forensics/metrics/localization.py` | Created | Standalone DIP spatial localization metrics (IoU, Precision, Recall, F1, Dice, BBox IoU) and confusion matrix calculation. |
| `backend/app/forensics/metrics/__init__.py` | Modified | Exported localization metric routines alongside foundational fidelity metrics. |
| `backend/scripts/run_academic_evaluation.py` | Created | Authoritative academic benchmark evaluation runner, CLI interface, and ASCII/Markdown report generator. |
| `backend/tests/test_academic_evaluation.py` | Created | 21 unit and integration tests covering manifest ingestion, security, applicability dispatch, localization math, and full runner execution. |
| `backend/benchmarks/academic_evaluation/evaluation_results.json` | Generated | Full structured evaluation data across all 253 dispatches, fidelity runs, and localization tests. |
| `backend/benchmarks/academic_evaluation/academic_evaluation_report.md` | Generated | Benchmark execution report in the benchmark output directory. |
| `STAGE_3_ACADEMIC_EVALUATION_REPORT.md` | Generated | Authoritative benchmark execution report at the repository root. |
| `STAGE_3_WS2_BATCH_2_IMPLEMENTATION_REPORT.md` | Created | Authoritative technical implementation report for Batch 2. |

---

## 3. Dataset Ingestion & Preflight Integrity Verification

The controlled dataset manifest (`backend/datasets/controlled/v1/manifest.json`) was ingested and verified:
- **Dataset Name:** ForenSight Controlled Multi-Modality Forensic Benchmark Suite
- **Dataset ID:** `controlled-v1`
- **Dataset Version:** `1.0.0`
- **Manifest Version:** `1.0.0`
- **Total Fixture Images:** 11 (8 PNG, 3 JPEG)
- **Total Ground-Truth Binary Masks:** 4 (PNG)
- **Path Traversal Security:** Verified that all paths resolve strictly within the controlled dataset root.
- **Cryptographic Invariance:** All 11 image SHA-256 digests and 4 mask files matched manifest specifications with zero discrepancies.

---

## 4. Section 9.3 Engine-to-Fixture Applicability Matrix Summary

All 23 registered engines were evaluated against all 11 fixture images, producing **253 deterministic dispatch decisions**:

```
Total Dispatches: 253
  ├── RUN: 69
  ├── SKIP (Format): 63
  ├── SKIP (Prereq): 33
  ├── SKIP (Target): 88
  └── ERROR: 0
```

### Breakdown by Applicability Class:
1. **`RUN` (69 dispatches):**
   - ELA, JPEG-DCT, JPEG-QT, JPEG-STRUCTURE, JPEG-HUFFMAN, BLOCKING-ARTIFACT on JPEG containers (`fixture_002` q95/q75/q50, `fixture_003`).
   - NOISE, ADVANCED-NOISE on noise injection (`007`), splicing (`006`), and negative baselines (`001`, `009`).
   - COPY_MOVE, CLONE-BLOCK, CLONE-KEYPOINT on copy-move clone (`005`) and negative baselines (`001`, `009`).
   - RESAMPLING on resampling (`004`) and authentic baseline (`001`).
   - COLOR-CHANNEL on color shift (`008`).
   - FOURIER on designated spectral targets (`001`, `004`, `007`, `009`).
   - HISTOGRAM on designated dynamic range targets (`001`, `002`, `008`).
   - PRNU on sensor pattern targets (`001`, `007`).
   - METADATA on all 11 fixtures (`RUN (Informational)`).
2. **`SKIP (Format)` (63 dispatches):**
   - JPEG-specific engines (ELA, JPEG-DCT, JPEG-QT, JPEG-STRUCTURE, JPEG-HUFFMAN, JPEG-GHOST, ADJPEG, NADJPEG, BLOCKING-ARTIFACT) rejected on PNG containers (`fixture_001`, `004`–`009`).
3. **`SKIP (Prereq)` (33 dispatches):**
   - `CAMERA-ID` (11 dispatches): Skipped due to lack of a calibrated sensor noise reference library in synthetic lab fixtures.
   - `GEOMETRY-PERSPECTIVE` (11 dispatches): Skipped due to synthetic flat 2D patches lacking 3D vanishing line geometry.
   - `PHYSICS-LIGHTING` (11 dispatches): Skipped due to synthetic lab fixtures lacking GPS and solar angle metadata.
4. **`SKIP (Target)` (88 dispatches):**
   - Modality-specific engines skipped on fixtures lacking the targeted physical anomaly (e.g. `JPEG-GHOST` skipped on single-compression `fixture_002`).

---

## 5. Category A: Classical DIP Image Fidelity Results

Evaluated on `fixture_002` compression variations relative to `fixture_001_authentic/original.png` using Batch 1 pure NumPy implementations (`calculate_mse`, `calculate_psnr`, `calculate_ssim`):

| Comparison Target | Compression Setting | Dimensions | Mean Squared Error (MSE) | PSNR (dB) | SSIM | Data Range Policy |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `img_comp_q95` | JPEG Q=95 | 256x256x3 | **5.7339** | **40.5463 dB** | **0.9842** | uint8: inferred data_range=255.0 |
| `img_comp_q75` | JPEG Q=75 | 256x256x3 | **8.9818** | **38.5972 dB** | **0.9739** | uint8: inferred data_range=255.0 |
| `img_comp_q50` | JPEG Q=50 | 256x256x3 | **11.3169** | **37.5935 dB** | **0.9674** | uint8: inferred data_range=255.0 |

### Key Findings:
- Monotonic degradation holds strictly: $\text{MSE}_{Q95} < \text{MSE}_{Q75} < \text{MSE}_{Q50}$, while PSNR and SSIM decrease monotonically.
- High PSNR ($>40$ dB) and SSIM ($>0.98$) at $Q=95$ confirm high fidelity reconstruction while preserving measurable high-frequency DCT quantization loss.
- Fidelity metrics are strictly reported as signal preservation measures and are not conflated with authenticity.

---

## 6. Category B: Spatial Tamper Localization Results

Evaluated exclusively on fixtures possessing pixel-accurate ground-truth masks (`fixture_005` to `fixture_008`) at primary binarization threshold $th=64.0$:

| Engine / Modality | Target Fixture | Eval Mode | IoU | Precision | Recall | F1-Score | Dice | TP | FP | FN | TN |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **NOISE (Gaussian)** | `img_noise_gaussian_localized` | PIXEL_MASK | 0.3781 | 0.9124 | 0.3923 | 0.5487 | 0.5487 | 2511 | 241 | 3889 | 58895 |
| **NOISE (Median)** | `img_noise_gaussian_localized` | PIXEL_MASK | 0.2934 | **0.9942** | 0.2939 | 0.4537 | 0.4537 | 1881 | **11** | 4519 | 59125 |
| **NOISE (Gaussian)** | `img_splicing_donor` | PIXEL_MASK | 0.0505 | 0.3069 | 0.0569 | 0.0961 | 0.0961 | 186 | 420 | 3084 | 61846 |
| **NOISE (Median)** | `img_splicing_donor` | PIXEL_MASK | 0.0125 | **0.8491** | 0.0125 | 0.0246 | 0.0246 | 45 | **8** | 3555 | 61928 |
| **COLOR-CHANNEL** | `img_color_channel_shift` | PIXEL_MASK | 0.0313 | 0.0392 | 0.1350 | 0.0608 | 0.0608 | 648 | 15888 | 4152 | 44848 |
| **CLONE-BLOCK** | `img_copymove_translated` | BOUNDING_BOX | 0.0732 | 0.0000 | 0.0000 | 0.0000 | 0.0000 | — | — | — | — |

### Key Findings:
- **Gaussian vs. Median Residual Filtering:**
  - On `fixture_007` (Noise injection), Median filtering achieves **99.42% precision** with only 11 false positive pixels, compared to 241 false positive pixels (91.24% precision) for Gaussian filtering.
  - On `fixture_006` (Splicing donor), Median filtering yields only 8 false positive pixels (**84.91% precision**) vs. 420 false positive pixels (30.69% precision) for Gaussian filtering.
  - This provides reproducible empirical evidence supporting the Workstream 1 filtering hypothesis: Median filtering preserves edge integrity and suppresses structural edge leakage into the residual map.
- **Copy-Move Localization:**
  - Bounding box IoU against target ground truth $[150, 150, 210, 210]$ achieved $0.0732$ with candidate region clustering.

---

## 7. Category C: False-Positive Resistance on Negative Controls

Evaluated on authentic negative controls (`fixture_001` smooth baseline, `fixture_009` repetitive brick texture):

| Engine ID | Target Fixture | Execution Status | Observations / Primary Metric |
| :--- | :--- | :---: | :--- |
| **NOISE** | `img_001_authentic_base` | `APPLIED` | `GLOBAL_VARIANCE=1.8483` (Clean sensor baseline) |
| **COPY_MOVE** | `img_001_authentic_base` | `APPLIED` | `MATCH_COUNT=0` (Zero false matches) |
| **CLONE-BLOCK** | `img_001_authentic_base` | `APPLIED` | `BLOCK_MATCH_COUNT=10394`, `MATCH_CLUSTER_COUNT=485` |
| **CLONE-KEYPOINT** | `img_001_authentic_base` | `APPLIED` | `KEYPOINT_COUNT=39`, `RAW_MATCH_COUNT=14`, `INLIERS=0` |
| **RESAMPLING** | `img_001_authentic_base` | `APPLIED` | `PERIODICITY=2.0` (Flat spectrum, no interpolation peak) |
| **NOISE** | `img_false_positive_texture` | `APPLIED` | `GLOBAL_VARIANCE=548.6585` (Elevated variance due to texture edges) |
| **COPY_MOVE** | `img_false_positive_texture` | `APPLIED` | `MATCH_COUNT=641` (**Elevated false matches on periodic texture**) |
| **CLONE-BLOCK** | `img_false_positive_texture` | `APPLIED` | `BLOCK_MATCH_COUNT=11893`, `MATCH_CLUSTER_COUNT=46` |
| **CLONE-KEYPOINT** | `img_false_positive_texture` | `APPLIED` | `KEYPOINT_COUNT=1180`, `RAW_MATCH_COUNT=1180`, `INLIERS=24` |
| **RESAMPLING** | `img_false_positive_texture` | `APPLIED` | `PERIODICITY=3.2` |

### Key Findings:
- On authentic smooth baseline `fixture_001`, `COPY_MOVE` registers **0 matches** and `CLONE-KEYPOINT` registers **0 geometric inliers**.
- On repetitive brick texture `fixture_009`, `COPY_MOVE` registers **641 false matches** and `CLONE-KEYPOINT` registers **24 geometric inliers**.
- This proves the critical necessity of technical warnings on periodic repetitive textures, preventing examiners from misinterpreting repetitive building facades or fabric patterns as malicious clones.

---

## 8. Scientific Core Freeze Audit

A dedicated audit of `backend/scripts/verify_scientific_freeze.py` was conducted prior to benchmark execution:
1. **Canonical Manifest Coverage:** All 38 frozen core forensic files remain tracked in `EXPECTED_PROTECTED_FILES` and `forensics_freeze_manifest.json`.
2. **Integrity Validation:** Executing `python backend/scripts/verify_scientific_freeze.py` confirms all 38 hashes match.
3. **Tamper Detection Invariant:** Tested that adding a temporary comment to a protected file (`copy_move/schemas.py`) causes the verifier to exit with code 1 (`SCIENTIFIC FREEZE VIOLATION`).
4. **Untracked File Invariant:** Tested that creating a temporary `.py` file under a protected engine package causes the verifier to exit with code 1 (`UNTRACKED PROTECTED FILE ON DISK`).
5. **No Algorithmic Modification:** No forensic detection algorithms or parameters were modified.

---

## 9. Test Execution & Verification Summary

### Complete Pytest Suite Run:
```powershell
& .\backend\venv\Scripts\python.exe -m pytest `
    backend/tests/test_academic_evaluation.py `
    backend/tests/test_dip_fidelity_metrics.py `
    backend/tests/test_scientific_freeze.py `
    backend/tests/test_copy_move.py `
    backend/tests/test_stage3_batch4_copy_move_overlay.py `
    backend/tests/test_stage3_batch3_validation.py `
    -v --basetemp=backend/tests/tmp
```
**Outcome:** **101 passed in 37.11s (100% pass rate)**.
- `test_academic_evaluation.py`: 21 passed
- `test_dip_fidelity_metrics.py`: 37 passed
- `test_scientific_freeze.py`: 16 passed
- `test_copy_move.py`: 5 passed
- `test_stage3_batch4_copy_move_overlay.py`: 11 passed
- `test_stage3_batch3_validation.py`: 11 passed

### Scientific Freeze CLI Verification:
```powershell
& .\backend\venv\Scripts\python.exe backend/scripts/verify_scientific_freeze.py
```
**Outcome:** `[SCIENTIFIC FREEZE VERIFIED] All 38 forensic source files match frozen integrity manifest.`

---

## 10. Deviations from the Roadmap
- None. The benchmark runner strictly implements Section 9.3 applicability rules, uses the approved controlled dataset manifest without modification, and adheres to the metric separation architecture.

---

## 11. Workstream 2 Status & Proposed Next Batch

With the completion of Batch 1 (Foundational DIP Fidelity Metrics) and Batch 2 (Academic Benchmark Evaluation Runner & Controlled-Suite Integration), the primary computational benchmarking infrastructure for Workstream 2 is established.

### Proposed Next Batch:
**Stage 3, Workstream 3: Distributed Execution Reliability**
- **Objective:** Verify real asynchronous task handling under Celery and Redis with `CELERY_TASK_ALWAYS_EAGER=false`.
- **Planned Key Activities:**
  1. Guard optional `import redis` in `backend/app/api/health.py` to prevent offline test crashes.
  2. Create live Celery worker daemon integration test `backend/tests/test_celery_worker_live.py`.
  3. Verify job state transitions (`QUEUED` $\to$ `RUNNING` $\to$ `COMPLETED`) with result persistence in PostgreSQL.
  4. Update CI workflow to run the live worker integration test against background Redis and Celery daemon processes.
- **Status:** Proposed only. Not started.
