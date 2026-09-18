# ForenSight V2.2 — Cross-Modality Correlation Engine

## 1. Scientific Philosophy & Core Invariant

The ForenSight Cross-Modality Correlation Engine is a **deterministic, rule-based inference system**. It synthesizes signals across independent forensic modalities without resorting to:
- Black-box probabilistic algorithms or synthetic "manipulation percentages" (e.g., "87% manipulated").
- Generative AI / Large Language Models hallucinating investigative findings.
- Speculative leaps that violate forensic admissibility standards.

### Fundamental Principle: Negative Evidence vs. Absence of Evidence
A cornerstone of ForenSight forensic intelligence is the strict mathematical distinction between:
- **Negative Evidence**: An analysis technique was executed, its prerequisites were satisfied, and the empirical measurement definitively exhibited no anomalous variance (e.g., uniform noise variance across high-gradient edges, or consistent double-quantization histograms matching camera firmware).
- **Absence of Evidence / Method Inapplicability**: An analysis technique could **not** be applied or was mathematically constrained due to container or format limitations (e.g., attempting JPEG DCT coefficient analysis or Error Level Analysis on a lossless PNG image, or absent EXIF structures due to web optimization striping). In ForenSight, method inapplicability is explicitly flagged as a methodological limitation and never conflated with evidence of authenticity.

---

## 2. Deterministic Rule Catalog

The engine executes versioned, audited rules defined in `backend/app/services/correlation.py`. Each rule specifies prerequisite modalities, triggers, technical reasoning, and explicit caveats.

| Rule ID | Version | Primary Trigger | Target Modalities | Severity | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CORR-META-001` | `1.0.0` | Inconsistent software fingerprint or missing hardware tags | Metadata, File Structure | `SUSPICIOUS` | Flags editing software signatures (Photoshop, GIMP, Canva) or stripping of camera serials/pipeline metadata. |
| `CORR-COMP-002` | `1.0.0` | ELA variance + JPEG DCT quantization grid discordance | ELA, JPEG DCT | `HIGH` | Confirms compression artifact mismatch between resaved regions and primary background grid. |
| `CORR-NOISE-003` | `1.0.0` | High local noise variance ratio (> 1.8x) across spatial regions | Noise Residual Analysis | `SUSPICIOUS` | Isolates anomalous sensor pattern noise or denoising masks indicative of splicing or inpainting. |
| `CORR-CLONE-004` | `1.0.0` | Keypoint feature cluster matching + spatial separation | Copy-Move (SIFT/ORB) | `HIGH` | Discovers duplicated pixel regions matching affine transformations within the same image canvas. |
| `CORR-CONFLICT-005` | `1.0.0` | Technique inapplicability or conflicting modality indicators | Cross-Modality Matrix | `INFO` / `REVIEW_REQUIRED` | Highlights format constraints (e.g., PNG container preventing DCT analysis) or conflicting modality signals requiring analyst arbitration. |

---

## 3. Rule Execution Engine Specification

### Rule CORR-META-001: Metadata Integrity & Software Fingerprinting
- **Condition**:
  1. `software` or `processing_software` metadata fields match known editing suites (`Adobe Photoshop`, `GIMP`, `Canva`, `Lightroom`), OR
  2. Image contains EXIF header metadata but lacks camera make/model and sensor pipeline attributes while displaying compression signatures.
- **Correlated Finding**:
  - **Type**: `METADATA_DISCREPANCY`
  - **Severity**: `SUSPICIOUS`
  - **Summary**: Software fingerprint indicates post-capture editing or metadata regeneration.
  - **Interpretation**: The image was parsed by post-processing software after initial acquisition. While not definitive proof of malicious tampering, camera hardware provenance is broken.

### Rule CORR-COMP-002: Multi-Modal Compression Grid Discordance
- **Condition**:
  1. Error Level Analysis (ELA) identifies high error variance (> threshold) localized in non-edge regions.
  2. JPEG DCT coefficient grid analysis exhibits non-uniform quantization tables or double-quantization ghosting.
- **Correlated Finding**:
  - **Type**: `COMPRESSION_DISCORDANCE`
  - **Severity**: `HIGH`
  - **Summary**: Multi-modal compression discordance detected between spatial ELA response and frequency-domain DCT coefficients.
  - **Interpretation**: Spliced or modified regions were saved under different JPEG quality factors or compression grids than the host image.

### Rule CORR-NOISE-003: Sensor Noise Inconsistency
- **Condition**:
  1. Noise analysis local noise variance ratio exceeds 1.8x between sub-blocks.
- **Correlated Finding**:
  - **Type**: `NOISE_INCONSISTENCY`
  - **Severity**: `SUSPICIOUS`
  - **Summary**: Significant local sensor pattern noise variance across image partitions.
  - **Interpretation**: Regions displaying distinct noise footprints suggest external source insertion or regional smoothing/filtering.

### Rule CORR-CLONE-004: Duplicated Feature Keypoint Splicing
- **Condition**:
  1. Copy-move detection identifies valid keypoint pairs above cluster threshold with geometric consistency.
- **Correlated Finding**:
  - **Type**: `COPY_MOVE_CLONING`
  - **Severity**: `HIGH`
  - **Summary**: Geometrically aligned duplicate keypoint clusters identified within single image frame.
  - **Interpretation**: Identical pixel structures appear in multiple spatial locations, typical of clone-stamp concealing or duplication.

### Rule CORR-CONFLICT-005: Methodological Conflict & Container Disambiguation
- **Condition**:
  1. Evidence format is non-JPEG (e.g., PNG, WebP lossless), causing JPEG DCT or ELA compression analysis to return format rejection or zero-signal.
- **Correlated Finding**:
  - **Type**: `METHOD_INAPPLICABILITY_CONFLICT`
  - **Severity**: `INFO`
  - **Summary**: Methodological constraint: Lossless/non-JPEG container limits frequency-domain compression analysis.
  - **Interpretation**: Inability to run DCT analysis is an inherent technical limitation of lossless containers, representing an absence of applicability rather than proof of image authenticity.

---

## 4. API Endpoints

- `GET /api/cases/{case_id}/correlations`: Returns currently generated findings and active rule matrix for the case.
- `POST /api/cases/{case_id}/correlations/run`: Triggers deterministic cross-modality evaluation across all completed analyses in the case, creating new findings or updating unreviewed records.

---

## 5. Phase 7 Validation & Golden Snapshots

The Correlation Engine is validated under `backend/tests/test_phase7_forensic_validation.py`:
- **Deterministic Output**: Correlation rule evaluation across identical evidence runs produces identical finding IDs, rule versions, and severity classifications.
- **Golden Baseline**: Rule definitions are snapshot-verified against `backend/tests/golden/correlation_rules.golden.json`.
- **Negative Evidence Disambiguation**: Automated tests verify that lossless PNG containers trigger `CORR-CONFLICT-005` rather than silent omission or false authenticity verdicts.
- **Detailed Validation Documentation**: See `docs/CORRELATION_VALIDATION.md` for full test cases and control conditions.

