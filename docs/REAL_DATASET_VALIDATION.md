# ForenSight V4 — Real-World Forensic Dataset Validation

## 1. Scientific Overview & Objectives
ForenSight V4 Step 10 establishes empirical validation infrastructure for evaluating digital image forensics engines against real-world and public benchmark datasets, including:
- **CASIA Image Tampering Detection Evaluation Database v2.0 (CASIA v2.0)**
- **Columbia Uncompressed Splicing Database**
- **NIST/DARPA Open Media Forensics Challenge (OpenMFC)**

### Core Tenet: Scientific Honesty
1. **Absence of Data**: If dataset binaries are not physically present on disk, ForenSight reports `DATASET NOT AVAILABLE`. Results are **never** simulated or fabricated.
2. **Decoupled Applicability**: `NOT_APPLICABLE` (e.g. evaluating DCT quantization tables on a lossless PNG) is strictly distinct from `FAILED` or negative attribution.
3. **No Universal Accuracy Score**: ForenSight strictly prohibits reducing heterogeneous empirical modalities into a single composite percentage or ranking engines. Forensic modalities are orthogonal tools, not competing classifiers.

---

## 2. Dataset Profiles & Adapters

### A. CASIA v2.0
- **Primary Modalities**: Splicing, Copy-Move.
- **Characteristics**: Real-world JPEG/TIFF imagery with post-processing (blurring, resizing) applied to manipulation boundaries.
- **Caveats**: Includes historic JPEG compression artifacts; ground truth binary masks vary in edge boundary precision.

### B. Columbia Uncompressed Splicing
- **Primary Modalities**: Image splicing across uncompressed spatial data.
- **Characteristics**: High-resolution uncompressed TIFF images captured across calibrated DSLR sensors without lossy JPEG DCT quantization.
- **Caveats**: High resolution yields large block processing runtimes; pristine uncompressed noise patterns are atypical of common web distribution.

### C. NIST / DARPA OpenMFC
- **Primary Modalities**: Multi-generation recompression, splicing, seam carving, copy-move.
- **Characteristics**: Heterogeneous camera sources with systematic provenance metadata tables and manipulation masks.
- **Caveats**: Some manipulation sub-types (e.g. video frames or generative artifacts) are out of scope for spatial ForenSight engines.

---

## 3. Evaluation Protocol & Separation Rules

### Authentic vs. Manipulated Grouping
Evaluations are strictly separated into two distinct cohorts:
- **Authentic Cohort**: Known unaltered camera-original imagery. Used strictly to characterize **empirical sensitivity** and **false positive triggers** (e.g., foliage, sand, sharp geometric edges).
- **Manipulated Cohort**: Tampered imagery with defined manipulation types (copy-move, splicing, resampling, recompression).

### Spatial Localization Rigor
- If a dataset manifest provides ground-truth binary masks, pixel-level localization metrics are calculated:
  - Intersection-over-Union (IoU)
  - Precision, Recall, and F1 score
- If a dataset does **not** provide ground truth masks (or the mask file is absent), localization metrics are explicitly recorded as `NOT_EVALUATED` rather than outputting 0.0 or failing the engine.

---

## 4. Boundaries & Anti-Misuse Notice
> [!CAUTION]
> 1. Forensic results indicate mathematical and statistical properties; they do **not** constitute legal verdicts or automated assertions of guilt.
> 2. The absence of an anomaly does not certify authenticity, as sophisticated anti-forensic techniques can conceal traces.
> 3. Detection of an anomaly does not prove malicious intent, as standard photo editors, resizing, and transcoding introduce forensic artifacts.

## 5. External data registration gate

External manifests must carry a provenance record with publisher/source URL, exact license or access terms, a lab rights-review reference, acquisition date and method, annotation source, split policy, held-out grouping, and known limitations. Each image also needs a declared source license and a valid SHA-256 digest. Registration rejects empty image lists and duplicate image identifiers. This gate checks that fields are recorded; it does not certify legal sufficiency, annotation truth, or representativeness.

The external dataset template and acquisition procedure are in `backend/datasets/external/`. Dataset files are intentionally absent from this repository. No external benchmark result should be reported until the licensed dataset is present, registered, integrity-verified, evaluated, and reproducibly rerun.
