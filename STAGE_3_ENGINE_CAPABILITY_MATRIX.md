# ForenSight — Stage 3, Workstream 1, Batch 3
# Scientific Engine Capability & Analytical Metric Matrix

**Document Version:** 1.0.0  
**Status:** Canonical Reference  
**Scope:** Complete Inventory of All 23 ForenSight Forensic Engines  
**Scientific Core Invariant:** In Strict Effect (`backend/app/forensics/` Frozen)

---

## 1. Executive Summary & Architectural Scope

The ForenSight forensic system comprises twenty-three (23) registered forensic engines across five canonical categories:
- `FILE_ANALYSIS` (4 engines)
- `LOCAL_ANALYSIS` (10 engines)
- `GLOBAL_ANALYSIS` (5 engines)
- `GEOMETRIC_ANALYSIS` (2 engines)
- `CAMERA_IDENTIFICATION` (2 engines)

Each engine performs a mathematically distinct operation on input imagery or container metadata. A persistent source of forensic error in automated image analysis is **metric conflation**—attempting to evaluate an engine's output against ground truth using metrics mathematically incompatible with what the engine measures.

This document establishes the verified capability inventory for all 23 engines. It details the underlying mathematical operation, container prerequisites, output modalities, localization feasibility, legitimate evaluation metrics, and strict non-claims.

---

## 2. Global Capability Summary Table

| Engine ID | Category | Primary Mathematical Operation | Localization Feasibility | Legitimate Metrics | Key Limitation / Non-Claim |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **METADATA** | FILE_ANALYSIS | EXIF / TIFF / XMP container parsing | **NO** | Field presence, string match | Metadata is easily stripped or forged. |
| **JPEG-STRUCTURE** | FILE_ANALYSIS | JPEG segment marker byte parsing | **NO** | Marker presence, offset ordering | Structural anomalies indicate tool signatures, not edit location. |
| **JPEG-QT** | FILE_ANALYSIS | DQT table extraction & DBM lookup | **NO** | Table similarity, Euclidean distance | Identifies source encoder class; does not locate localized edits. |
| **JPEG-HUFFMAN** | FILE_ANALYSIS | DHT table frequency distribution | **NO** | Huffman entropy, table match | Huffman tables are whole-stream properties. |
| **ELA** | LOCAL_ANALYSIS | Recompression error $\|I - I_{Q=95}\|$ | **CONDITIONAL** | MSE, PSNR, SSIM, Saturation % | Residual map is **not** a binary forgery mask; indicates recompression differential. |
| **NOISE** | LOCAL_ANALYSIS | Spatial residual $R = I - \mathcal{F}(I)$ | **YES** | IoU, Precision, Recall, F1, FPR | High edge leakage in textures; cannot distinguish edit from sharp scene edges. |
| **ADVANCED-NOISE** | LOCAL_ANALYSIS | Blockwise wavelet noise variance $\hat{\sigma}^2$ | **YES** | Block variance uniformity, IoU | Sensitive to ISO noise variations, smooth regions yield zero variance. |
| **JPEG-GHOST** | LOCAL_ANALYSIS | Multi-quality resave difference minimum | **YES** | Ghost displacement, cluster IoU | Fails on images resaved multiple times at uniform low quality. |
| **NADJPEG** | LOCAL_ANALYSIS | Non-aligned DCT grid blocking variance | **YES** | Grid shift $(x, y)$, block IoU | Inapplicable if crop aligned on 8x8 boundary. |
| **BLOCKING-ARTIFACT** | LOCAL_ANALYSIS | Periodic 8x8 block boundary step energy | **YES** | Boundary discontinuity ratio, IoU | Smoothing or low-pass filtering erases boundary steps. |
| **COLOR-CHANNEL** | LOCAL_ANALYSIS | Inter-channel gradient cross-correlation | **YES** | Color gradient divergence, IoU | Chromatic aberration in lenses causes natural color divergence. |
| **RESAMPLING** | LOCAL_ANALYSIS | Second-derivative periodic peak detection | **YES** | Periodic peak p-value, mask IoU | Downsampling or severe compression destroys periodic interpolation patterns. |
| **CLONE-BLOCK** | LOCAL_ANALYSIS | 8x8 / 16x16 block DCT hash clustering | **YES** | Match count, cluster IoU, FPR | Severe false alarms on authentic natural repetitive textures. |
| **CLONE-KEYPOINT** | LOCAL_ANALYSIS | SIFT/ORB feature matching & RANSAC | **YES** | Inlier count, inlier ratio, bbox IoU | Fails on uniform/flat duplicated patches lacking distinct keypoints. |
| **JPEG_DCT** | GLOBAL_ANALYSIS | 8x8 orthonormal spatial DCT on luminance | **NO** | Energy ratio, AC variance, blocking score | Operates on decoded spatial pixels; **not** JPEG bitstream quantization parser. |
| **ADJPEG** | GLOBAL_ANALYSIS | Global aligned double JPEG histogram peaks | **NO** | Histogram periodicity, Benford p-val | Global property; does not specify *where* tampering occurred. |
| **HISTOGRAM** | GLOBAL_ANALYSIS | Intensity histogram bin gap/spike analysis | **NO** | Dynamic range, gap count, entropy | Whole-image metric; tonality adjustments alter whole histogram. |
| **FOURIER** | GLOBAL_ANALYSIS | 2D Fast Fourier Transform magnitude | **NO** | Spectral peak energy, radial energy | Identifies periodic grid or filtering; no spatial coordinates. |
| **COPY_MOVE** | GEOMETRIC_ANALYSIS | Keypoint matching & affine spatial cluster | **CONDITIONAL** | Inliers, inlier ratio, bbox overlap | Matches discrete keypoints; does not generate dense pixel masks. |
| **GEOMETRY-PERSPECTIVE** | GEOMETRIC_ANALYSIS | Vanishing point & line intersection | **NO** | Vanishing point consistency | Requires man-made rectilinear scenes with coplanar parallel lines. |
| **PHYSICS-LIGHTING** | GEOMETRIC_ANALYSIS | Pupil / contour 2D light vector fit | **NO** | Vector divergence angle (degrees) | Requires specular reflections; assumes single distant light source. |
| **PRNU** | CAMERA_ID | Wavelet sensor pattern noise extraction | **NO** | Peak-to-Correlation Energy (PCE) | **Uncalibrated:** Cannot claim specific camera attribution without reference library. |
| **CAMERA-ID** | CAMERA_ID | EXIF make/model + PRNU library match | **NO** | PCE score, confidence level | Reference database match only; cannot identify unknown devices. |

---

## 3. Detailed Engine Specifications

### 3.1 Metadata & Container Forensics (`FILE_ANALYSIS`)

#### 1. METADATA (`METADATA`)
- **Mathematical Operation:** Traverses EXIF, TIFF, IPTC, and XMP metadata trees using Pillow/ExifTool primitives. Extracts timestamps, camera serials, lens parameters, and software editing tags.
- **Input Requirements:** JPEG, TIFF, PNG, WEBP; min dimensions $16 \times 16$.
- **Output:** Structured key-value dictionary, observation payload with software alteration indicators.
- **Localization Feasibility:** **NO.** Metadata applies to the container as a whole.
- **Legitimate Metrics:** Field presence, tag consistency, timestamp chronological ordering.
- **Limitations & Non-Claims:** Metadata is completely malleable; presence of editing software tags indicates container modification, but absence does not prove authenticity.

#### 2. JPEG-STRUCTURE (`JPEG-STRUCTURE`)
- **Mathematical Operation:** Sequential byte-level parser for JPEG markers (`0xFFD8` SOI, `0xFFE0`-`0xFFEF` APPn, `0xFFDB` DQT, `0xFFC0` SOF0, `0xFFC4` DHT, `0xFFDA` SOS, `0xFFD9` EOI). Identifies unexpected marker sequences, duplicate headers, or appended trailer payloads.
- **Input Requirements:** Strict JPEG container only; requires lossy compression history.
- **Output:** Sequential marker list, structural anomaly observations.
- **Localization Feasibility:** **NO.** Structural anomalies occur in stream headers, not spatial coordinates.
- **Legitimate Metrics:** Marker sequence compliance, anomaly count.
- **Limitations & Non-Claims:** Does not determine spatial location of edits; reflects encoder architecture.

#### 3. JPEG-QT (`JPEG-QT`)
- **Mathematical Operation:** Extracts 64-element luminance ($Y$) and chrominance ($Cb/Cr$) quantization matrices from `0xFFDB` markers. Computes Euclidean distance and matrix similarity against a database of known camera and editing software quantization tables.
- **Input Requirements:** Strict JPEG container only.
- **Output:** 8x8 quantization tables, estimated quality factor (1-100), closest software/camera match.
- **Localization Feasibility:** **NO.** Quantization tables apply globally to the scan.
- **Legitimate Metrics:** Table match Euclidean distance, estimated quality factor accuracy.
- **Limitations & Non-Claims:** Recompression with standard tables matches common software even if the content is authentic.

#### 4. JPEG-HUFFMAN (`JPEG-HUFFMAN`)
- **Mathematical Operation:** Extracts and parses Huffman coding trees from `0xFFC4` (DHT) segments. Evaluates code length distributions and entropy against standard baseline tables.
- **Input Requirements:** Strict JPEG container only.
- **Output:** Huffman tree topology, entropy score, baseline table conformity.
- **Localization Feasibility:** **NO.**
- **Legitimate Metrics:** Entropy divergence, table identity match.
- **Limitations & Non-Claims:** Global container property; identical tables are shared across many encoders.

---

### 3.2 Localized Forgery & Artifact Analysis (`LOCAL_ANALYSIS`)

#### 5. ELA — Error Level Analysis (`ELA`)
- **Mathematical Operation:** Resaves the input image at a predefined quality ($Q=95$ standard) and computes the absolute pixel-wise difference:
  $$\Delta I(x, y) = |I(x, y) - I_{resaved}(x, y)|$$
  Generates two visualization modalities:
  1. *Dynamic Normalized:* $\Delta I_{dyn}(x, y) = \frac{\Delta I(x, y)}{\max(\Delta I)} \times 255$
  2. *Fixed Scale:* $\Delta I_{fixed20}(x, y) = \min(255, \Delta I(x, y) \times 20.0)$
- **Input Requirements:** Strict JPEG container only; requires lossy DCT history; min dimensions $16 \times 16$.
- **Output:** Mean compression error (scalar), dual heatmap artifacts (`ela_map` and `ela_map_fixed20`).
- **Localization Feasibility:** **CONDITIONAL.** ELA highlights regions with differing compression history or high high-frequency content. It **does not** output a binary mask.
- **Legitimate Metrics:**
  - *Fidelity:* MSE, PSNR, SSIM between original and resaved images.
  - *Artifact Dynamics:* Saturation percentage (% of pixels clipped at 255), dynamic range, mean error.
  - *Evaluation Constraint:* Ground-truth IoU/F1 cannot be computed directly unless a predeclared binarization threshold is specified.
- **Limitations & Non-Claims:**
  - Highly non-linear across texture complexities: sharp edges naturally produce high ELA error.
  - ELA cannot distinguish between spliced foreign content and native high-contrast edge content.
  - Re-saving an image multiple times reduces overall ELA variance, causing false negatives.

#### 6. NOISE — Spatial Residual Analysis (`NOISE`)
- **Mathematical Operation:** Extracts high-frequency spatial residuals by subtracting a low-pass or non-linear smoothed image from the input:
  $$R_{Gauss}(x, y) = |I(x, y) - G_\sigma * I(x, y)|$$
  $$R_{Median}(x, y) = |I(x, y) - \text{medfilt}_{3 \times 3}(I(x, y))|$$
- **Input Requirements:** Container agnostic (JPEG, PNG, TIFF, WEBP); min dimensions $16 \times 16$.
- **Output:** Global variance (scalar), residual heatmap artifacts (`noise_residual` and `noise_residual_median`).
- **Localization Feasibility:** **YES.** Areas with injected or inconsistent noise exhibit elevated residual values.
- **Legitimate Metrics:**
  - At predeclared binarization thresholds ($\tau \in \{32, 64, 128\}$): TP, FP, FN, TN, IoU, Precision, Recall, F1, FPR, Specificity.
  - Residual fidelity: MSE, PSNR, SSIM between Gaussian and Median residual maps.
- **Limitations & Non-Claims:**
  - **Edge Leakage:** Sharp authentic edges (text, brickwork, high-frequency patterns) produce strong residuals indistinguishable from noise injection.
  - On authentic repetitive textures, FPR exceeds 15-35% without edge-mask suppression.
  - Cannot claim intentional tampering if noise variation stems from local lighting variations (e.g. shadow noise).

#### 7. ADVANCED-NOISE (`ADVANCED-NOISE`)
- **Mathematical Operation:** Divides image into non-overlapping $16 \times 16$ blocks. Decomposes each block using 2D Daubechies wavelets and estimates local noise variance $\hat{\sigma}^2$ via median absolute deviation (MAD) of the $HH_1$ subband:
  $$\hat{\sigma} = \frac{\text{median}(|HH_1|)}{0.6745}$$
- **Input Requirements:** Unbounded container formats; min dimensions $64 \times 64$.
- **Output:** Block noise variance map, noise variance distribution, anomaly regions.
- **Localization Feasibility:** **YES** (at block resolution).
- **Legitimate Metrics:** Blockwise IoU, Precision, Recall, F1, variance uniformity metric.
- **Limitations & Non-Claims:** Smooth saturated regions (e.g. clear sky) yield near-zero noise variance naturally.

#### 8. JPEG-GHOST (`JPEG-GHOST`)
- **Mathematical Operation:** Recompresses input across quality factors $Q \in [30, 99]$ in increments of 1. Calculates displacement between recompressed and input blocks. For spliced content from a different JPEG quality, the difference reaches a distinctive local minimum when the resave quality equals the donor quality.
- **Input Requirements:** Strict JPEG container; min dimensions $64 \times 64$.
- **Output:** Quality curve per region, ghost candidate map, estimated donor quality.
- **Localization Feasibility:** **YES.** Localizes regions whose ghost minimum differs from the background.
- **Legitimate Metrics:** IoU of ghost candidate bounding box vs ground-truth splicing donor mask.
- **Limitations & Non-Claims:** Fails if the entire image was saved once at high quality or if donor and base have identical compression quality.

#### 9. NADJPEG — Non-Aligned Double JPEG (`NADJPEG`)
- **Mathematical Operation:** Measures periodic blocking artifacts across all 64 spatial grid offsets $(r, c) \in [0, 7] \times [0, 7]$. If a crop/splice occurred at non-multiple of 8, secondary grid peaks appear at $(\Delta x, \Delta y) \neq (0, 0)$.
- **Input Requirements:** Strict JPEG container; min dimensions $64 \times 64$.
- **Output:** Grid offset $(\Delta x, \Delta y)$, non-aligned block probability map.
- **Localization Feasibility:** **YES.** Flags non-aligned spliced blocks.
- **Legitimate Metrics:** Grid shift detection accuracy, blockwise localization IoU.
- **Limitations & Non-Claims:** Completely blind to tamperings aligned exactly on $8 \times 8$ grid boundaries.

#### 10. BLOCKING-ARTIFACT (`BLOCKING-ARTIFACT`)
- **Mathematical Operation:** Evaluates boundary step discontinuities across $8 \times 8$ grid lines:
  $$D_h(x, y) = |I(8x, y) - I(8x+1, y)|, \quad D_{non-h}(x, y) = |I(8x+1, y) - I(8x+2, y)|$$
  Computes the blocking artifact power ratio $Z = \frac{\langle D_{grid} \rangle}{\langle D_{non-grid} \rangle}$.
- **Input Requirements:** JPEG or recompressed containers; min dimensions $32 \times 32$.
- **Output:** Blocking grid strength map, boundary discontinuity ratio.
- **Localization Feasibility:** **YES.** Flags blocks where grid structure is broken or smoothed.
- **Legitimate Metrics:** Grid continuity score, localized grid disruption IoU.
- **Limitations & Non-Claims:** Heavy post-processing, blurring, or resizing removes blocking boundaries.

#### 11. COLOR-CHANNEL (`COLOR-CHANNEL`)
- **Mathematical Operation:** Evaluates inter-channel spatial correlations between $R$, $G$, and $B$ channels. In unedited optical captures, lens chromatic aberration produces predictable lateral displacement. Spliced or synthetic patches show abnormal cross-channel phase alignment.
- **Input Requirements:** 3-channel RGB images; min dimensions $32 \times 32$.
- **Output:** Color gradient divergence map, channel misalignment score.
- **Localization Feasibility:** **YES.** Localizes regions with anomalous color channel gradients.
- **Legitimate Metrics:** Mask IoU, Precision, Recall on color shift fixtures (`fixture_008_color_shift`).
- **Limitations & Non-Claims:** Low-cost lenses or intentional artistic color filters induce non-uniform chromatic shifts naturally.

#### 12. RESAMPLING (`RESAMPLING`)
- **Mathematical Operation:** Computes second derivatives of image rows and columns. Interpolation (scaling, rotation) introduces periodic linear dependencies detected via p-spectrum periodicity in the Radon or Fourier domain.
- **Input Requirements:** Container agnostic; min dimensions $64 \times 64$.
- **Output:** Periodic interpolation map, p-value of resampling periodicity, estimated scaling factor.
- **Localization Feasibility:** **YES.** Identifies scaled or rotated objects within a composite.
- **Legitimate Metrics:** Detection p-value, bounding box IoU on resampled regions (`fixture_004_geometry_resample`).
- **Limitations & Non-Claims:** Multiple resamplings or heavy JPEG compression destroys subtle interpolation peaks.

#### 13. CLONE-BLOCK (`CLONE-BLOCK`)
- **Mathematical Operation:** Extracts overlapping blocks ($8 \times 8$ or $16 \times 16$), computes DCT coefficients or lexicographical feature vectors, sorts vectors, and clusters spatial pairs with identical features and consistent displacement vectors.
- **Input Requirements:** Container agnostic; min dimensions $32 \times 32$.
- **Output:** Block match count, displacement consistency score, cluster map.
- **Localization Feasibility:** **YES.**
- **Legitimate Metrics:** Match cluster count, displacement consistency, candidate region IoU.
- **Limitations & Non-Claims:** Massive false-alarm rate on authentic repetitive textures (fabrics, grids, foliage, wallpaper).

#### 14. CLONE-KEYPOINT (`CLONE-KEYPOINT`)
- **Mathematical Operation:** Detects sparse invariant keypoints (SIFT / ORB), computes 128D/32D feature descriptors, performs agglomerative $k$-NN matching with Lowe's ratio test, and applies RANSAC / affine clustering to filter spatial outliers.
- **Input Requirements:** Container agnostic; min dimensions $32 \times 32$.
- **Output:** Keypoint count, raw match count, filtered matches, geometric inlier count, inlier ratio, candidate region bounding boxes.
- **Localization Feasibility:** **YES.** Produces bounding boxes for duplicated regions.
- **Legitimate Metrics:**
  - *Keypoint Level:* Raw matches, geometric inlier count, inlier ratio.
  - *Spatial Level:* Bounding box IoU against ground-truth copy-move masks.
  - *Constraint:* Keypoint overlay images cannot be evaluated with pixel-wise SSIM against binary masks.
- **Limitations & Non-Claims:** Ineffective on smooth, textureless duplicated patches (e.g. blue sky, solid walls) lacking keypoint features.

---

### 3.3 Global Frequency & Transform Forensics (`GLOBAL_ANALYSIS`)

#### 15. JPEG_DCT (`JPEG_DCT`)
- **Mathematical Operation:**
  > [!IMPORTANT]
  > Production `JPEGDCTEngine` applies an **orthonormal $8 \times 8$ discrete cosine transform on spatial pixels** ($Y = 0.299R + 0.587G + 0.114B$). It decomposes the decoded spatial image into $8 \times 8$ spatial blocks and evaluates AC coefficient energy distributions, high-frequency attenuation, and grid boundary variance.
  >
  > It **does NOT parse raw compressed quantized DCT coefficients from the JPEG bitstream**. (Bitstream header parsing is handled by `JPEG-QT` and `JPEG-STRUCTURE`.)
- **Input Requirements:** Decoded image (JPEG, PNG, TIFF); min dimensions $32 \times 32$.
- **Output:** Total blocks processed (e.g. 1024 for $256 \times 256$), high-frequency energy ratio, AC energy variance, DCT energy map artifact.
- **Localization Feasibility:** **NO.** Produces diagnostic frequency distributions across the full frame.
- **Legitimate Metrics:** Energy concentration ratio, block variance, high-frequency dropoff score.
- **Limitations & Non-Claims:** Cannot localize spliced content; sensitive to image content sharpness.

#### 16. ADJPEG — Aligned Double JPEG (`ADJPEG`)
- **Mathematical Operation:** Evaluates global DCT coefficient histograms for periodic comb structures (periodicity in first-digit Benford distribution or histogram peak-valley oscillations) caused by consecutive quantization at different steps: $Q_1 \to Q_2$.
- **Input Requirements:** Strict JPEG container; min dimensions $64 \times 64$.
- **Output:** Double compression probability score, periodicity peak height, estimated primary quality $Q_1$.
- **Localization Feasibility:** **NO.** Global image property.
- **Legitimate Metrics:** Double compression detection classification accuracy (AUC, sensitivity).
- **Limitations & Non-Claims:** Does not indicate *which* part of the image was modified. If $Q_2 \gg Q_1$, periodic peaks can be smoothed.

#### 17. HISTOGRAM (`HISTOGRAM`)
- **Mathematical Operation:** Calculates 256-bin intensity distributions across RGB and luminance. Computes Shannon entropy, histogram gap counts, and comb patterns indicative of global contrast equalization or level adjustments.
- **Input Requirements:** Container agnostic; min dimensions $16 \times 16$.
- **Output:** Entropy, gap count, dynamic range, saturation metrics.
- **Localization Feasibility:** **NO.**
- **Legitimate Metrics:** Shannon entropy, histogram peak-to-valley ratio.
- **Limitations & Non-Claims:** Global adjustment indicator; cannot detect localized cut-and-paste tampering.

#### 18. FOURIER (`FOURIER`)
- **Mathematical Operation:** Computes 2D Fast Fourier Transform ($\mathcal{FFT}$) magnitude spectrum on luminance. Evaluates radial energy distribution, directional power spikes, and cross-shaped artifacts characteristic of artificial grid boundaries or periodic resampling.
- **Input Requirements:** Container agnostic; min dimensions $32 \times 32$.
- **Output:** Spectrum visualization artifact, peak spectral energy, high-to-low frequency ratio.
- **Localization Feasibility:** **NO.** Fourier space is non-localized in the spatial domain.
- **Legitimate Metrics:** Radial energy drop-off rate, harmonic peak count.
- **Limitations & Non-Claims:** Spatial coordinates are completely lost in the global magnitude spectrum.

---

### 3.4 Geometric & Physics Analysis (`GEOMETRIC_ANALYSIS`)

#### 19. COPY_MOVE (`COPY_MOVE`)
- **Mathematical Operation:** Legacy adapter interface executing multi-stage feature extraction, keypoint matching, and affine RANSAC verification.
- **Input Requirements:** Container agnostic; min dimensions $32 \times 32$.
- **Output:** Match count, geometric inlier count, candidate region bounding boxes, primary single-frame coordinate overlay ($W \times H$), secondary side-by-side match artifact ($2W \times H$).
- **Localization Feasibility:** **CONDITIONAL.** Yields candidate bounding boxes, not dense pixel masks.
- **Legitimate Metrics:** Inlier count, inlier ratio, candidate bounding box IoU vs ground-truth bounding box.
- **Limitations & Non-Claims:** Fails on featureless duplicated patches; prone to false positives on repetitive textures.

#### 20. GEOMETRY-PERSPECTIVE (`GEOMETRY-PERSPECTIVE`)
- **Mathematical Operation:** Detects structural straight lines using LSD (Line Segment Detector), groups lines into parallel bundles in 3D space, and computes vanishing points ($\mathbf{VP}$). Checks if objects share consistent vanishing lines and horizon heights.
- **Input Requirements:** High-resolution architectural or planar imagery; min dimensions $128 \times 128$.
- **Output:** Vanishing points, horizon line equation, perspective inconsistency score.
- **Localization Feasibility:** **NO.**
- **Legitimate Metrics:** Vanishing point angular consistency, horizon line deviation.
- **Limitations & Non-Claims:** Requires rectilinear, man-made scenes with long parallel lines; completely inapplicable to natural landscapes, organic scenes, or macro photography.

#### 21. PHYSICS-LIGHTING (`PHYSICS-LIGHTING`)
- **Mathematical Operation:** Estimates 2D/3D illumination direction vectors from surface normal gradients and specular highlights (e.g. corneal reflections or spherical objects). Evaluates angular divergence between illumination vectors across subjects.
- **Input Requirements:** Color imagery containing visible shading contours or specular points; min dimensions $64 \times 64$.
- **Output:** Estimated light source azimuth/elevation angles, angular divergence $(\Delta \theta)$.
- **Localization Feasibility:** **NO.**
- **Legitimate Metrics:** Illumination vector angular difference (degrees).
- **Limitations & Non-Claims:** Highly sensitive to non-Lambertian surfaces, multiple ambient light sources, and bounce light.

---

### 3.5 Camera Sensor Identification (`CAMERA_IDENTIFICATION`)

#### 22. PRNU — Photo-Response Non-Uniformity (`PRNU`)
- **Mathematical Operation:** Extracts high-frequency sensor noise patterns via 2D discrete wavelet decomposition (DWT) de-noising filters:
  $$W = I - \text{DWT\_Denoise}(I)$$
  Computes cross-correlation and Peak-to-Correlation Energy (PCE) against candidate sensor fingerprints.
- **Input Requirements:** Container agnostic; requires original resolution (no cropping or scaling); min dimensions $128 \times 128$.
- **Output:** Extracted noise pattern artifact, noise energy variance, PCE score.
- **Localization Feasibility:** **NO.**
- **Legitimate Metrics:** PCE score, normalized cross-correlation peak.
- **Limitations & Non-Claims:**
  > [!WARNING]
  > **Uncalibrated Operation Notice:** Without a calibrated library of multiple (e.g. $\ge 30$) known flat-field reference images from a specific physical device, PRNU **cannot claim definitive device attribution**.
  > An uncalibrated run measures high-frequency residual energy only.

#### 23. CAMERA-ID (`CAMERA-ID`)
- **Mathematical Operation:** Correlates extracted EXIF camera model metadata with an internal reference database of sensor physical parameters, Bayer CFA patterns, and known PRNU signatures.
- **Input Requirements:** Original camera captures with intact metadata; min dimensions $128 \times 128$.
- **Output:** Matched camera model, sensor size classification, attribution confidence score.
- **Localization Feasibility:** **NO.**
- **Legitimate Metrics:** Classification accuracy, database retrieval top-1 accuracy.
- **Limitations & Non-Claims:** Cannot differentiate between two physical devices of the exact same camera make and model without calibrated PRNU fingerprints.

---

## 4. Analytical Metric Applicability Matrix

The table below strictly defines which quantitative metrics may be computed for each engine's output:

| Metric Name | Mathematical Definition | Valid Engine Targets | Invalid / Forbidden Applications |
| :--- | :--- | :--- | :--- |
| **Mean Squared Error (MSE)** | $\frac{1}{MN}\sum (I_1 - I_2)^2$ | ELA resave fidelity, Noise residual comparison | **Forbidden:** Comparing sparse keypoint overlays to binary masks. |
| **Peak Signal-to-Noise Ratio (PSNR)** | $10 \log_{10}\left(\frac{\text{MAX}^2}{\text{MSE}}\right)$ | ELA compression fidelity, Noise residual comparisons | **Forbidden:** Metadata, JPEG structure, global frequency engines. |
| **Structural Similarity (SSIM)** | $\frac{(2\mu_x\mu_y+c_1)(2\sigma_{xy}+c_2)}{(\mu_x^2+\mu_y^2+c_1)(\sigma_x^2+\sigma_y^2+c_2)}$ | ELA resave fidelity, image degradation quantification | **Forbidden:** Evaluating binary ground-truth masks against continuous heatmaps. |
| **Intersection-over-Union (IoU)** | $\frac{|A \cap B|}{|A \cup B|}$ | Binarized NOISE, ADVANCED-NOISE, RESAMPLING, CLONE-KEYPOINT bbox | **Forbidden:** Non-binarized heatmaps, global scalar engines (ADJPEG, ELA). |
| **Precision, Recall, F1** | $\frac{TP}{TP+FP}, \frac{TP}{TP+FN}, \frac{2PR}{P+R}$ | Binarized localization masks against ground-truth masks | **Forbidden:** Global engines without explicit spatial coordinate output. |
| **False Positive Rate (FPR)** | $\frac{FP}{FP+TN}$ | Binarized localization masks evaluated on authentic negatives | **Forbidden:** Evaluating on manipulated images lacking negative regions. |
| **Keypoint Inlier Ratio** | $\frac{\text{Inliers}}{\text{Raw Matches}}$ | COPY_MOVE, CLONE-KEYPOINT | **Forbidden:** Block-matching engines, continuous heatmap engines. |
| **Peak-to-Correlation Energy (PCE)** | $\frac{|r_{peak}|^2}{\frac{1}{|A|}\sum_{A} |r(x, y)|^2}$ | PRNU, CAMERA-ID | **Forbidden:** Spatial residual engines, metadata, ELA. |

---

## 5. Summary of Scope Boundaries

1. **Pixel-Level Localization Masks:** Only a subset of engines (`NOISE`, `ADVANCED-NOISE`, `RESAMPLING`, `JPEG-GHOST`, `BLOCKING-ARTIFACT`, `COLOR-CHANNEL`, `CLONE-BLOCK`, `CLONE-KEYPOINT`) have spatial localization outputs that can be evaluated against pixel ground-truth masks.
2. **Predeclared Threshold Invariant:** A continuous residual heatmap (such as ELA or Noise) cannot be scored for IoU/F1 without a predeclared binarization threshold ($\tau$). The threshold must not be tuned on the test set.
3. **Evidence Invariance:** All forensic engines operate strictly non-destructively; original evidence byte hashes must remain identical before, during, and after analysis.
