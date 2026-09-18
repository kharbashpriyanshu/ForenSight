# ForenSight V2.2 — Correlation Engine Validation & Rule Catalog

## 1. Overview

The Cross-Modality Correlation Engine synthesizes observations from the 5 classical forensic engines into actionable findings using deterministic rules.

Each rule is versioned, audited, and strictly documented below with inputs, conditions, outputs, limitations, and verification test cases.

---

## 2. Comprehensive Rule Catalog & Validation

### Rule CORR-META-001: Metadata History & Encoding Footprints
- **Rule Version**: `1.0`
- **Severity**: `SUSPICIOUS`
- **Target Modalities**: Metadata Extraction
- **Input Preconditions**: Completed `METADATA` analysis run.
- **Trigger Conditions**:
  1. `software_detected` contains known editing suites (`Photoshop`, `GIMP`, `Canva`, `Lightroom`), OR
  2. Camera make/model is absent while EXIF headers exist with compression discrepancies.
- **Output Finding**:
  - `finding_type`: `METADATA_DISCREPANCY`
  - `title`: `Editing Software Signature Detected in Metadata`
  - `summary`: Metadata tags identify post-processing software footprint.
- **Scientific Limitations**:
  - Metadata can be stripped, forged, or altered in transit without modifying image pixel data. Third-party viewing tools may touch timestamps innocently.
- **Validation Test Cases**:
  - *Positive Control*: JPEG with EXIF Software tag = "Adobe Photoshop 2024". (Triggers finding)
  - *Negative Control*: Clean JPEG without editing software tags. (Does not trigger finding)

---

### Rule CORR-COMP-002: Multi-Frequency Compression Variance (ELA & DCT)
- **Rule Version**: `1.0`
- **Severity**: `HIGH`
- **Target Modalities**: Error Level Analysis (ELA) + JPEG DCT Block Analysis
- **Input Preconditions**: Completed `ELA` and `JPEG_DCT` analysis runs.
- **Trigger Conditions**:
  1. ELA identifies high error level variance (> threshold) across localized non-edge blocks.
  2. JPEG DCT analysis confirms non-uniform quantization tables or double-quantization histograms.
- **Output Finding**:
  - `finding_type`: `COMPRESSION_DISCORDANCE`
  - `title`: `Multi-Modal Compression Grid Inconsistency`
  - `summary`: Multi-frequency compression discordance detected between spatial ELA response and frequency-domain DCT coefficients.
- **Scientific Limitations**:
  - High-contrast edges and multiple sequential resaves at varying quality factors naturally elevate error levels without localized splicing.
- **Validation Test Cases**:
  - *Positive Control*: Spliced JPEG fixture (`localized_splice_ela.jpg`). (Triggers finding)
  - *Negative Control*: Single-pass uniform clean JPEG (`clean_reference.jpg`). (Does not trigger finding)

---

### Rule CORR-NOISE-003: Sensor Noise Residual & High-Frequency Texture Consistency
- **Rule Version**: `1.0`
- **Severity**: `SUSPICIOUS`
- **Target Modalities**: Noise Residual Analysis
- **Input Preconditions**: Completed `NOISE` analysis run.
- **Trigger Conditions**:
  1. Local noise variance ratio between image sub-blocks exceeds 1.8x.
- **Output Finding**:
  - `finding_type`: `NOISE_INCONSISTENCY`
  - `title`: `Sensor Noise Residual Discrepancy`
  - `summary`: Significant local sensor pattern noise variance across image partitions.
- **Scientific Limitations**:
  - In-camera noise reduction, varying scene luminance, and high sensor ISO produce localized SNR discrepancies under normal capture.
- **Validation Test Cases**:
  - *Positive Control*: Image spliced with different noise profile. (Triggers finding)
  - *Negative Control*: Uniform noise field image (`clean_reference.jpg`). (Does not trigger finding)

---

### Rule CORR-CLONE-004: Geometric Keypoint Duplication & Spatial Consistency
- **Rule Version**: `1.0`
- **Severity**: `HIGH`
- **Target Modalities**: Copy-Move Detection (SIFT / ORB)
- **Input Preconditions**: Completed `COPY_MOVE` analysis run.
- **Trigger Conditions**:
  1. Feature matching detects duplicated keypoint clusters above inlier threshold ($\ge 4$) with non-zero spatial displacement.
- **Output Finding**:
  - `finding_type`: `COPY_MOVE_CLONING`
  - `title`: `Duplicated Feature Keypoint Splicing`
  - `summary`: Geometrically aligned duplicate keypoint clusters identified within single image frame.
- **Scientific Limitations**:
  - Repetitive organic textures (grass, water ripples) and architectural motifs (window arrays) generate natural feature matches.
- **Validation Test Cases**:
  - *Positive Control*: Cloned patch fixture (`synthetic_copy_move.jpg`). (Triggers finding with displacement [180, 180])
  - *Negative Control*: Gradient texture image without duplication. (Does not trigger finding)

---

### Rule CORR-CONFLICT-005: Methodological Conflict & Container Disambiguation
- **Rule Version**: `1.0`
- **Severity**: `INFO`
- **Target Modalities**: Multi-Modal Cross-Check
- **Input Preconditions**: Analysis run on non-JPEG container (PNG, WebP).
- **Trigger Conditions**:
  1. Evidence format is PNG or lossless, causing frequency-domain JPEG DCT analysis to fail or return inapplicability.
- **Output Finding**:
  - `finding_type`: `METHOD_INAPPLICABILITY_CONFLICT`
  - `title`: `Container Format Incompatibility (Negative Evidence)`
  - `summary`: JPEG DCT block analysis was not applicable because the ingested image format is PNG.
  - `interpretation`: CRITICAL FORENSIC DISTINCTION: This constitutes NEGATIVE EVIDENCE (incompatible modality). It must NOT be interpreted as NO EVIDENCE or proof that the image lacks compression artifacts.
- **Scientific Limitations**:
  - Container format limitations prevent frequency-domain DCT analysis, necessitating spatial and noise analysis instead.
- **Validation Test Cases**:
  - *Positive Control*: Lossless PNG fixture (`clean_reference.png`). (Triggers `CORR-CONFLICT-005`)
  - *Negative Control*: Native JPEG fixture (`clean_reference.jpg`). (Does not trigger `CORR-CONFLICT-005`)
