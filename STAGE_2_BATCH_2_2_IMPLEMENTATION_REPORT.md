# ForenSight — Stage 2, Batch 2.2: Implementation Report
## Scientific Description Corrections & Recommendation Reconciliation

**Repository:** `F:\Projects\ForenSight`  
**GitHub Remote:** `https://github.com/kharbashpriyanshu/ForenSight.git`  
**Branch:** `main`  
**Execution Date:** 2026-11-09 (Reconciled in Batch 2.4)  
**Specification:** Stage 2 Batch 2.2 — Scientific Description Corrections & Recommendation Reconciliation  

---

## A. Preflight Verification

Before implementing code changes, environment preflight checks were executed to confirm repository integrity:

- **Repository Root:** `F:\Projects\ForenSight`
- **Branch:** `main`
- **Remote Origin:** `https://github.com/kharbashpriyanshu/ForenSight.git`
- **Starting HEAD Commit:** `a2f78f05ca77f5ab78f53f11db40b392566e5a9d` (`feat(forensics): implement guided forensic analysis and engine catalog`)
- **Git Working Tree State:** Clean prior to edits, preserving all 20 historical untracked audit documents:
  - `AUDIT_EXECUTION_LOG.md`
  - `AUDIT_QUALITY_REVIEW.md`
  - `AUTH_DATABASE_DIAGNOSTIC_REPORT.md`
  - `DIP_PROJECT_AUDIT_REPORT.md`
  - `FRESH_DIP_PROJECT_AUDIT.md`
  - `FRESH_REPOSITORY_BASELINE.md`
  - `IMPLEMENTATION_DECISION_REGISTER.md`
  - `PREVIOUS_AUDIT_RECONCILIATION.md`
  - `REVISED_IMPLEMENTATION_ROADMAP.md`
  - `REVISED_IMPLEMENTATION_ROADMAP_V2.md`
  - `STAGE_1_IMPLEMENTATION_SPEC.md`
  - `STAGE_1_SPECIFICATION_REVIEW.md`
  - `STAGE_2_BATCH_1_1_FINAL_RELIABILITY_AUDIT.md`
  - `STAGE_2_BATCH_1_2_FINAL_VERIFICATION_AUDIT.md`
  - `STAGE_2_BATCH_1_VERIFICATION_AUDIT.md`
  - `STAGE_2_BATCH_2_1_SCIENTIFIC_ACCURACY_AUDIT.md`
  - `USER_JOURNEY_AND_INFORMATION_ARCHITECTURE.md`
  - `UX_AUDIT_REPORT.md`
  - `UX_COMPONENT_INVENTORY.md`
  - `UX_REDESIGN_ROADMAP.md`

---

## B. Scientific Corrections

Based on the findings from `STAGE_2_BATCH_2_1_SCIENTIFIC_ACCURACY_AUDIT.md`, 5 major forensic engine descriptions were corrected in `frontend/src/components/evidence/GuidedExaminationWorkflow.tsx` to match their underlying Python code implementations:

### 1. JPEG Discrete Cosine Transform (`JPEG_DCT` / `jpeg-dct`)
- **Previous Claim in UI:** Claimed extraction of quantization tables and raw coefficients from compressed JPEG bitstream headers, and claimed checking first-digit distributions via Benford's Law.
- **Actual Underlying Implementation (`backend/app/forensics/jpeg_dct/engine.py`):**
  - Loads evidence image using OpenCV (`cv2.imread(..., cv2.IMREAD_GRAYSCALE)`).
  - Converts pixel values to `float32`.
  - Loops over 8×8 blocks of spatial pixels and computes 2D orthonormal Discrete Cosine Transform via `cv2.dct()`.
  - Quantizes block coefficients using standard JPEG luminance quantization matrix.
  - Computes global AC coefficient distribution histogram across 100 bins in range $[-50, 50]$.
  - Calculates histogram variance and returns quantized spatial coefficient summary statistics.
  - Does **not** read bitstream entropy headers or Huffman coding tables; does **not** evaluate Benford's Law distributions.
- **Corrected User-Facing Text:**
  - *Method:* Spatial 8×8 block orthonormal DCT matrix transformation on decoded grayscale pixel arrays.
  - *Limitations:* Operates on decoded spatial pixel blocks, not raw quantized bitstream coefficients. It does not perform Benford's Law or DCT histogram periodicity fitting. Block-level frequency variations occur naturally across detailed scene textures and do not independently establish image tampering.
- **Files Changed:** `frontend/src/components/evidence/GuidedExaminationWorkflow.tsx`

---

### 2. Camera Identification (`CAMERA-ID` / `camera-id`)
- **Previous Claim in UI:** Claimed identifying camera make/model and sensor characteristics by extracting sensor fingerprint from a single image and cross-referencing against a global device database.
- **Actual Underlying Implementation (`backend/app/engine_extensions/camera/camera_id_engine.py`):**
  - Extracts Photo-Response Non-Uniformity (PRNU) noise residual from query image using 4-level discrete wavelet decomposition and Wiener adaptive denoising filtering.
  - Searches for camera reference library files (`.npy` files) in `cases/{case_id}/reference_cameras/`.
  - If reference library exists: computes circular cross-correlation normalized by energy, Peak-to-Correlation Energy (PCE), and Peak Correlation Value (PCV).
  - If no reference library exists: returns status `unmatched` with clear notice that matching requires reference fingerprints from the target camera.
  - Does **not** query an external internet/vendor sensor fingerprint database.
- **Corrected User-Facing Text:**
  - *Method:* Empirical 2D circular cross-correlation and Peak-to-Correlation Energy (PCE) testing against case sensor reference fingerprints.
  - *Limitations:* Requires pre-registered reference sensor fingerprints from suspect camera devices. If no reference fingerprints are available in the case library, the engine cannot perform attribution comparison. High correlation indicates sensor noise similarity but does not independently establish provenance, as resizing, cropping, or heavy recompression degrades correlation surfaces.
- **Files Changed:** `frontend/src/components/evidence/GuidedExaminationWorkflow.tsx`

---

### 3. Color Channel Correlation (`COLOR-CHANNEL` / `color-channel`)
- **Previous Claim in UI:** Claimed Color Filter Array (CFA) demosaicing artifact detection, interpolation anomaly detection, and Bayer pattern inconsistency verification.
- **Actual Underlying Implementation (`backend/app/engine_extensions/color/color_channel_engine.py`):**
  - Reads image into RGB color channels.
  - Computes global Pearson linear correlation coefficients between channel pairs ($r_{RG}, r_{RB}, r_{GB}$).
  - Evaluates local 8×8 block-level correlations and cross-channel differences.
  - Computes local correlation disparity and identifies spatial outliers where disparity deviates by $>2.5$ standard deviations ($Z \text{ score} > 2.5$) from the image mean.
  - Does **not** perform bilinear/bicubic Bayer CFA reconstruction analysis or demosaicing kernel inversion.
- **Corrected User-Facing Text:**
  - *Method:* Inter-channel Pearson correlation, chromaticity mapping, and spatial block disparity Z-score analysis.
  - *Limitations:* Measures statistical and spatial color channel relationships; it does not analyze Color Filter Array (CFA) or Bayer demosaicing interpolation patterns. Vivid natural subjects, optical vignetting, and chromatic aberration naturally produce localized channel differences without any manipulation.
- **Files Changed:** `frontend/src/components/evidence/GuidedExaminationWorkflow.tsx`

---

### 4. Advanced Noise Analysis (`ADVANCED-NOISE` / `advanced-noise`)
- **Previous Claim in UI:** Claimed multi-resolution wavelet decomposition (DWT) noise extraction and adaptive filtering across sub-bands.
- **Actual Underlying Implementation (`backend/app/engine_extensions/noise/advanced_noise_engine.py`):**
  - Applies spatial Gaussian blur filter (`cv2.GaussianBlur`) to generate smoothed spatial base.
  - Subtracts smoothed image from original grayscale to compute spatial noise residual:
    $$R(x, y) = I(x, y) - G_{\sigma}(I(x, y))$$
  - Computes 2D Fast Fourier Transform (FFT) of spatial noise residual with zero-frequency shift (`np.fft.fftshift(np.fft.fft2(R))`).
  - Divides 2D magnitude spectrum into concentric radial frequency bands (low, mid, high) and computes energy distribution across radial bands.
  - Computes local patch noise variances via sliding window and robust Median Absolute Deviation (MAD) scale.
  - Does **not** perform multi-scale Discrete Wavelet Transform (DWT) subband analysis.
- **Corrected User-Facing Text:**
  - *Method:* Gaussian spatial residual extraction, robust MAD scale estimation, and radial 2D Fast Fourier Transform (FFT) frequency bandpass decomposition.
  - *Limitations:* Uses spatial Gaussian filtering and 2D Fourier transform (FFT) radial decomposition, not Discrete Wavelet Transform (DWT). Natural texture variations (grass, sand, fabric) inherently modulate high-frequency energy and can trigger statistical alerts on authentic images.
- **Files Changed:** `frontend/src/components/evidence/GuidedExaminationWorkflow.tsx`

---

### 5. Copy-Move vs Clone Keypoint Methodological Distinction
- **`COPY_MOVE` (`copy-move`):**
  - *Backend Implementation (`backend/app/forensics/copy_move/engine.py`):* Uses OpenCV SIFT (Scale-Invariant Feature Transform) keypoint detector with L2 Euclidean nearest-neighbor matching and spatial agglomerative clustering.
  - *Corrected User-Facing Text:* Updated to explicitly state "Keypoint Clone Detection (SIFT) — Spatially duplicated image patches identified through Scale-Invariant Feature Transform (SIFT) interest points and L2 Euclidean descriptor matching."
  - *Limitations:* Uses SIFT keypoints exclusively. Naturally repetitive scene textures (brickwork, foliage, window grids) generate false-positive matches. Ineffective on featureless, smooth, or heavily blurred cloned patches.
- **`CLONE-KEYPOINT` (`clone-keypoint`):**
  - *Backend Implementation (`backend/app/engine_extensions/clone_keypoint/clone_keypoint_engine.py`):* Uses ORB (Oriented FAST and Rotated BRIEF) keypoint detector with Hamming distance matching, Lowe's ratio test, and affine RANSAC homography estimation.
  - *Corrected User-Facing Text:* Updated to explicitly state "Keypoint Clone & Affine Transformation Matching (ORB) — Duplicated image regions detected via Oriented FAST and Rotated BRIEF (ORB) binary descriptors, spatial-exclusion self-matching, and affine RANSAC geometric consensus modeling."
  - *Limitations:* Uses ORB binary descriptors with Hamming distance, separate from the SIFT-based COPY_MOVE engine. Requires distinct corner texture; smooth synthetic regions cannot be matched.
- **Files Changed:** `frontend/src/components/evidence/GuidedExaminationWorkflow.tsx`

---

## C. Complete 23-Engine Catalogue

The complete catalogue of all 23 genuine forensic engines implemented in ForenSight, matching `engine_registry` in `backend/app/engine_extensions/__init__.py` and `FORENSIC_EXAMINATION_CATALOGUE` in `frontend/src/components/evidence/GuidedExaminationWorkflow.tsx`:

> [!NOTE]
> **Implementation Method vs Scientific Validation**:
> The methods below document verified source-code implementations. They represent internal algorithmic behavior rather than formal external scientific validation across real-world benchmark corpora.

| # | Exact Frontend ID | Exact Backend ID | Display Name | Category | Suggested Starting? | Implementation Method | Supported Formats | Required Reference Data | Registry Status | Dispatch Status | Actual Execution Verified? |
|---|---|---|---|---|:---:|---|---|:---:|:---:|:---:|:---:|
| 1 | `metadata` | `METADATA` | Container & Camera Hardware Metadata | `FILE_ANALYSIS` | Yes (Universal) | Standardized EXIF 2.32 / CIPA tag parsing with firmware signature validation. | JPEG, JPG, PNG, WEBP, TIFF | None | Registered | Dispatched | Verified (`test.cjs`, `test_cases.py`) |
| 2 | `ela` | `ELA` | Compression & Resave Variance Analysis (ELA) | `LOCAL_ANALYSIS` | Yes (JPEG only) | Single-pass uniform quality factor recompression delta computation (Krawetz, 2007). | JPEG, JPG | None | Registered | Dispatched | Verified (`test_ela.py`) |
| 3 | `noise` | `NOISE` | Spatial Noise Residual Consistency | `LOCAL_ANALYSIS` | Yes (Universal) | Spatial adaptive median filter residual extraction with block-level variance analysis. | JPEG, JPG, PNG, WEBP | None | Registered | Dispatched | Verified (`test_noise.py`) |
| 4 | `jpeg-dct` | `JPEG_DCT` | JPEG Block-Frequency Characteristics | `GLOBAL_ANALYSIS` | Yes (JPEG only) | Spatial 8×8 block orthonormal DCT matrix transformation on decoded grayscale pixel arrays. | JPEG, JPG | Standard IJG Lum. Table | Registered | Dispatched | Verified (`test_jpeg_dct.py`) |
| 5 | `copy-move` | `COPY_MOVE` | Keypoint Clone Detection (SIFT) | `GEOMETRIC_ANALYSIS` | Yes (Universal) | OpenCV SIFT descriptor extraction with L2 nearest-neighbor matching and spatial agglomerative clustering. | JPEG, JPG, PNG, WEBP | None | Registered | Dispatched | Verified (`test_copy_move.py`) |
| 6 | `resampling` | `RESAMPLING` | Pixel Resampling & Interpolation Traces | `LOCAL_ANALYSIS` | Yes (Lossless only) | Directional second-derivative filtering and 1D spectral projection periodicity analysis. | JPEG, JPG, PNG, WEBP, TIFF | None | Registered | Dispatched | Verified (`test_v4_step6`) |
| 7 | `advanced-noise` | `ADVANCED-NOISE` | Multi-Band Spatial Noise Analysis | `LOCAL_ANALYSIS` | No | Gaussian spatial residual extraction, robust MAD scale estimation, and radial 2D FFT frequency bandpass decomposition. | JPEG, JPG, PNG, WEBP, TIFF | None | Registered | Dispatched | Verified (`test_v4_step6`) |
| 8 | `clone-block` | `CLONE-BLOCK` | Block-Based Exhaustive Clone Matching | `LOCAL_ANALYSIS` | No | Lexicographical sorting of compact 2D DCT block descriptors with translation displacement clustering. | JPEG, JPG, PNG, WEBP, TIFF | None | Registered | Dispatched | Verified (`test_v4_step7`) |
| 9 | `clone-keypoint` | `CLONE-KEYPOINT` | Keypoint Clone & Affine Matching (ORB) | `LOCAL_ANALYSIS` | No | ORB binary feature detection, Hamming distance Lowe ratio test, and affine RANSAC homography estimation. | JPEG, JPG, PNG, WEBP, TIFF | None | Registered | Dispatched | Verified (`test_v4_step7`) |
| 10 | `histogram` | `HISTOGRAM` | Color Histogram & Dynamic Range Analysis | `GLOBAL_ANALYSIS` | No | Multi-channel 256-bin histogram profiling, comb-artifact detection, and dynamic range entropy calculation. | JPEG, JPG, PNG, WEBP, TIFF | None | Registered | Dispatched | Verified (`test_v4_step5`) |
| 11 | `color-channel` | `COLOR-CHANNEL` | Color Channel Consistency Analysis | `LOCAL_ANALYSIS` | No | Inter-channel Pearson correlation, chromaticity mapping, and spatial block disparity Z-score analysis. | JPEG, JPG, PNG, WEBP, TIFF | None | Registered | Dispatched | Verified (`test_v4_step5`) |
| 12 | `fourier` | `FOURIER` | Fourier 2D Frequency Spectrum Analysis | `GLOBAL_ANALYSIS` | No | 2D Discrete Fourier Transform magnitude power spectrum computation with radial frequency partitioning. | JPEG, JPG, PNG, WEBP, TIFF | None | Registered | Dispatched | Verified (`test_v4_step5`) |
| 13 | `prnu` | `PRNU` | Photo-Response Non-Uniformity (Sensor PRNU) | `CAMERA_IDENTIFICATION` | No | Adaptive local noise extraction with filter residual and normalized cross-correlation. | JPEG, JPG, PNG, WEBP, TIFF | Optional (Reference sensor profile) | Registered | Dispatched | Verified (`test_v4_step8`) |
| 14 | `camera-id` | `CAMERA-ID` | Camera Sensor Pattern Comparison | `CAMERA_IDENTIFICATION` | No | Empirical 2D circular cross-correlation and Peak-to-Correlation Energy (PCE) testing against case sensor reference fingerprints. | JPEG, JPG, PNG, WEBP, TIFF | **Mandatory** (`.npy` in case library) | Registered | Dispatched | Verified (`test_v4_step8`) |
| 15 | `geometry-perspective` | `GEOMETRY-PERSPECTIVE` | Vanishing Point & Perspective Geometry | `GEOMETRIC_ANALYSIS` | No | LSD line segment detection with Gaussian sphere vanishing point estimation. | JPEG, JPG, PNG, WEBP, TIFF | None | Registered | Dispatched | Verified (`test_v4_step11`) |
| 16 | `physics-lighting` | `PHYSICS-LIGHTING` | Solar Ephemeris & Shadow Illumination Physics | `GEOMETRIC_ANALYSIS` | No | Astronomical solar position algorithm (SPA) with 2D shadow vector triangulation. | JPEG, JPG, PNG, WEBP, TIFF | Optional (EXIF timestamp & GPS) | Registered | Dispatched | Verified (`test_v4_step11`) |
| 17 | `jpeg-structure` | `JPEG-STRUCTURE` | JPEG Container Marker & Header Inspection | `FILE_ANALYSIS` | No | Binary marker stream inspection and anomaly parsing. | JPEG, JPG | None | Registered | Dispatched | Verified (`test_v4_step2`) |
| 18 | `jpeg-qt` | `JPEG-QT` | Quantization Table Signature & Quality Extraction | `FILE_ANALYSIS` | No | DQT table distance metric against standard IJG quantization profiles. | JPEG, JPG | Standard IJG tables & profiles | Registered | Dispatched | Verified (`test_v4_step2`) |
| 19 | `jpeg-huffman` | `JPEG-HUFFMAN` | Huffman Coding & Entropy Table Analysis | `FILE_ANALYSIS` | No | DHT entropy table verification against reference hardware tables. | JPEG, JPG | Standard IJG DHT profiles | Registered | Dispatched | Verified (`test_v4_step2`) |
| 20 | `jpeg-ghost` | `JPEG-GHOST` | JPEG Ghost Compression Resave Detection | `LOCAL_ANALYSIS` | No | Quality factor search space disparity analysis (Farid, 2009). | JPEG, JPG | None | Registered | Dispatched | Verified (`test_v4_step3`) |
| 21 | `adjpeg` | `ADJPEG` | Aligned Double JPEG Compression (ADJPEG) | `GLOBAL_ANALYSIS` | No | First-digit distribution and histogram periodicity Fourier analysis. | JPEG, JPG | None | Registered | Dispatched | Verified (`test_v4_step3`) |
| 22 | `nadjpeg` | `NADJPEG` | Non-Aligned Double JPEG Compression (NADJPEG) | `LOCAL_ANALYSIS` | No | Shifted 8×8 block grid mismatch variance modeling across 64 spatial offsets. | JPEG, JPG | None | Registered | Dispatched | Verified (`test_v4_step3`) |
| 23 | `blocking-artifact` | `BLOCKING-ARTIFACT` | Blocking Artifact Inconsistency (BAI) | `LOCAL_ANALYSIS` | No | Blockiness metric estimation across horizontal and vertical 8×8 block boundaries. | JPEG, JPG | None | Registered | Dispatched | Verified (`test_v4_step4`) |

---

## D. Recommendation Reconciliation

### 1. Terminology Reconciliation
In alignment with forensic standards (SWGDE / ENFSI / ASTM E30.12), automated tools must avoid presenting preliminary starting selections as an authoritative or definitive recommendation:
- **Previous Terminology:** *"Recommended Multi-Modality Baseline"* / `"RECOMMENDED"` badge.
- **Reconciled Terminology:** *"Suggested Starting Examinations"* / `"SUGGESTED"` badge.
- **Banner Statement:**
  > *"These suggested examinations provide a preliminary multi-modality screening... These selections serve as a practical starting point and do not guarantee complete manipulation detection."*

### 2. Format-Aware Selection Logic (JPEG vs. PNG)
The baseline selection logic in `GuidedExaminationWorkflow.tsx` evaluates `isRecommendedBaseline(rawFormat)` dynamically:

- **JPEG Evidence Images (5 Examinations Suggested):**
  1. `metadata` (Container & Camera Hardware Metadata — container provenance and EXIF integrity)
  2. `ela` (Compression & Resave Variance Analysis — uniform recompression error variance)
  3. `noise` (Spatial Noise Residual Consistency — high-frequency sensor noise uniformity)
  4. `jpeg-dct` (JPEG Block-Frequency Characteristics — 8×8 block frequency distribution)
  5. `copy-move` (Keypoint Clone Detection SIFT — duplicated image region clustering)
  *Rationale:* Provides multi-modal screening covering container headers, lossy compression error, sensor noise consistency, frequency block structure, and geometric clone duplication.

- **PNG / Lossless Evidence Images (4 Examinations Suggested):**
  1. `metadata` (Container & Camera Hardware Metadata — container provenance)
  2. `noise` (Spatial Noise Residual Consistency — high-frequency spatial noise residual)
  3. `copy-move` (Keypoint Clone Detection SIFT — duplicated image region clustering)
  4. `resampling` (Pixel Resampling & Interpolation Traces — periodic derivative interpolation artifacts)
  *Rationale:* Lossy compression tests (`requiresLossy: true`) are mathematically inapplicable to lossless containers and are excluded. Resampling detection is substituted to detect periodic interpolation introduced by scaling or rotating spliced elements.

### 3. "Select All Compatible" Behavior
- The button is labeled `"Select All Compatible"` and executes:
  ```typescript
  const handleSelectAllCompatible = () => {
    const allCompatible = FORENSIC_EXAMINATION_CATALOGUE
      .filter(exam => isCompatible(exam))
      .map(exam => exam.id);
    setSelectedEngines(new Set(allCompatible));
  };
  ```
- **On JPEG evidence:** All 23 engines are compatible $\to$ **23 selected**.
- **On PNG evidence:** 9 lossy engines (`ela`, `jpeg-dct`, `jpeg-structure`, `jpeg-qt`, `jpeg-huffman`, `jpeg-ghost`, `adjpeg`, `nadjpeg`, `blocking-artifact`) are incompatible $\to$ **14 selected**.

### 4. Client-Side Batch Execution Guardrail
In `GuidedExaminationWorkflow.tsx`, `handleExecuteSelected` enforces strict pre-dispatch validation:
```typescript
const toRun = Array.from(selectedEngines).filter(id => {
  const exam = FORENSIC_EXAMINATION_CATALOGUE.find(e => e.id === id);
  if (!exam || !isCompatible(exam)) return false;
  const status = getEngineStatus(id);
  return status !== 'COMPLETED' && status !== 'RUNNING' && status !== 'QUEUED';
});

if (toRun.length === 0) {
  // Alerts user if selected engines are already queued or incompatible
  return;
}
```

---

## E. Identifier Mapping & Dispatch Resolution

Every frontend identifier maps directly to a registered backend engine key:

| Frontend UI ID (`FORENSIC_EXAMINATION_CATALOGUE.id`) | Backend Registry ID (`engine_registry`) | Normalization in API (`jobs.py`) | Celery Worker Dispatch (`analysis_worker.py`) |
|---|---|---|---|
| `metadata` | `METADATA` | Legacy set `{"metadata", ...}` | `MetadataAnalyzer.run_analysis` |
| `ela` | `ELA` | Legacy set `{"ela", ...}` | `ELAAnalyzer.run_analysis` |
| `noise` | `NOISE` | Legacy set `{"noise", ...}` | `NoiseAnalyzer.run_analysis` |
| `jpeg-dct` | `JPEG_DCT` | Legacy set `{"jpeg_dct", ...}` | `JPEGDCTAnalyzer.run_analysis` |
| `copy-move` | `COPY_MOVE` | Legacy set `{"copy_move", ...}` | `CopyMoveAnalyzer.run_analysis` |
| `resampling` | `RESAMPLING` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("RESAMPLING")` |
| `advanced-noise` | `ADVANCED-NOISE` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("ADVANCED-NOISE")` |
| `clone-block` | `CLONE-BLOCK` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("CLONE-BLOCK")` |
| `clone-keypoint` | `CLONE-KEYPOINT` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("CLONE-KEYPOINT")` |
| `histogram` | `HISTOGRAM` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("HISTOGRAM")` |
| `color-channel` | `COLOR-CHANNEL` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("COLOR-CHANNEL")` |
| `fourier` | `FOURIER` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("FOURIER")` |
| `prnu` | `PRNU` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("PRNU")` |
| `camera-id` | `CAMERA-ID` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("CAMERA-ID")` |
| `geometry-perspective` | `GEOMETRY-PERSPECTIVE` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("GEOMETRY-PERSPECTIVE")` |
| `physics-lighting` | `PHYSICS-LIGHTING` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("PHYSICS-LIGHTING")` |
| `jpeg-structure` | `JPEG-STRUCTURE` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("JPEG-STRUCTURE")` |
| `jpeg-qt` | `JPEG-QT` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("JPEG-QT")` |
| `jpeg-huffman` | `JPEG-HUFFMAN` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("JPEG-HUFFMAN")` |
| `jpeg-ghost` | `JPEG-GHOST` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("JPEG-GHOST")` |
| `adjpeg` | `ADJPEG` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("ADJPEG")` |
| `nadjpeg` | `NADJPEG` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("NADJPEG")` |
| `blocking-artifact` | `BLOCKING-ARTIFACT` | `analysis_type.upper().replace("_", "-")` | `V4EngineRunner.run_engine("BLOCKING-ARTIFACT")` |

---

## F. Regression Tests & Verification Distinctions

### 1. Distinction of Verification Levels
To maintain scientific and technical rigor:
1. **Registered:** The engine class inherits from `BaseForensicEngine` or is wrapped by an adapter and is registered in `engine_registry` in `backend/app/engine_extensions/__init__.py`. (Verified for all 23 engines).
2. **API Accepted:** The endpoint `POST /api/jobs/analysis/{evidence_id}/{analysis_type}` validates the engine identifier and returns HTTP 200/202 with status `QUEUED`. (Verified for all 23 engines in `test_forensic_engine_catalog.py`).
3. **Dispatched:** The job outbox entry is recorded in the database and prepared for Celery broker delivery. (Verified for all 23 engines).
4. **Successfully Executed:** The Celery worker runs the analysis algorithm and stores completed findings in the database. (Individually verified across V4 step test suites `test_v4_step2` through `test_v4_step11`, and core pipeline in `test.cjs`).
5. **Scientifically Validated:** Empirical false-positive and detection rate benchmarks evaluated against standardized multi-camera ground-truth forensic datasets. (Not claimed based on code inspection alone).

### 2. Test Suite Execution Results
- **`backend/tests/test_forensic_engine_catalog.py`:**
  - `test_all_23_engines_registered`: PASSED
  - `test_engine_metadata_and_categories`: PASSED
  - `test_frontend_id_resolution_and_compatibility`: PASSED
  - `test_format_compatibility_declarations`: PASSED
  - `test_camera_and_prnu_reference_requirements`: PASSED
  - `test_job_dispatch_queueing_endpoint`: PASSED
  - `test_unsupported_engine_rejection`: PASSED
  - *Result:* **7 passed in 2.94s (Exit code: 0)**
- **`backend/tests/test_evidence_intake_lifecycle.py` & `test_cases.py`:**
  - *Result:* **28 passed in 11.40s (Exit code: 0)**
- **`npm --prefix frontend run build`:**
  - *Result:* **Built in 1.07s, 0 errors (Exit code: 0)**
- **`node frontend/test-stage2-batch2.cjs`:**
  - *Result:* **ALL PASSED (Exit code: 0)**
- **`node frontend/test.cjs`:**
  - *Result:* **PASS (Exit code: 0)**
- **`node frontend/test-batch2.cjs`:**
  - *Result:* **ALL PASSED (Exit code: 0)**
- **`node frontend/test-stage2-batch1.cjs`:**
  - *Result:* **ALL PASSED (Exit code: 0)**
- **`audit_integrity.py verify-chain`:**
  - *Result:* **Verified 5 events, 1 case head intact (Exit code: 0)**

---

## G. Remaining Limitations

1. **Algorithm Mathematics Preserved:**
   No underlying forensic algorithms were altered. Changes strictly corrected user-facing descriptions and recommendation logic to align with existing code capabilities.
2. **CAMERA-ID Reference Dependency:**
   `CAMERA-ID` requires reference camera `.npy` models enrolled in `cases/{case_id}/reference_cameras/`. Without reference models, it returns `unmatched`.
3. **Standalone vs Comparative Engines:**
   Comparative analysis requiring multiple reference images or camera profiles requires case-level preparation.

---

## H. Git Verification

- **Commit:** `fd6e0fb1344824f15aa02deb212b2df7b558faed`
- **Tracked Files Committed:**
  - `frontend/src/components/evidence/GuidedExaminationWorkflow.tsx`
  - `frontend/test-stage2-batch2.cjs`
  - `backend/tests/test_forensic_engine_catalog.py`
  - `STAGE_2_BATCH_2_2_IMPLEMENTATION_REPORT.md`
- **Untracked Historical Documents:** All preserved intact.
