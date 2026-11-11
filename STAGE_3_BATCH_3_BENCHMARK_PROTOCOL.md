# ForenSight — Stage 3, Workstream 1, Batch 3
# Reproducible Forensic Benchmark Protocol

**Document Version:** 1.0.0  
**Status:** Canonical Scientific Protocol  
**Repository Branch:** `main`  
**Scientific Core Invariant:** In Strict Effect (`backend/app/forensics/` Frozen)

---

## 1. Protocol Objective & Governing Principles

This benchmark protocol establishes a reproducible, scientifically rigorous validation framework for ForenSight's existing forensic engines. 

The protocol enforces four fundamental scientific principles:
1. **Separation of Measurement from Evaluation:** What an engine measures (e.g. compression residual, frequency energy, keypoint match count) must never be conflated with the evaluation metric used to score it.
2. **Predeclared Evaluation Thresholds:** All binarization thresholds, quality factors, and scaling constants must be declared *a priori*. Optimization or tuning of detection thresholds against evaluation ground truth is strictly forbidden.
3. **Rigorous Ground-Truth Categorization:** Fixtures must be categorized by the specific question they test—distinguishing authentic negative baselines, positive localized manipulations, and false-positive texture stress tests.
4. **Strict Evidence Invariance:** Forensic analysis must be completely read-only. Every input fixture's SHA-256 cryptographic hash must be verified before and after execution to guarantee zero evidence modification.

---

## 2. Controlled Evaluation Dataset Architecture (`controlled-v1`)

The benchmark operates against the registered canonical dataset located at `backend/datasets/controlled/v1/` described by `manifest.json`.

### 2.1 Fixture Inventory & Ground-Truth Topology

| Image ID | Format | Dimensions | Authenticity Status | Ground-Truth Mask | Primary Forensic Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `img_001_authentic_base` | PNG | $256 \times 256$ | **AUTHENTIC** | Null (All-Negative) | Baseline authentic control; uncompressed synthetic reference. |
| `img_comp_q95` | JPEG | $256 \times 256$ | **AUTHENTIC** | Null (All-Negative) | High-quality single JPEG compression ($Q=95$). |
| `img_comp_q75` | JPEG | $256 \times 256$ | **AUTHENTIC** | Null (All-Negative) | Standard web-quality single JPEG compression ($Q=75$). |
| `img_comp_q50` | JPEG | $256 \times 256$ | **AUTHENTIC** | Null (All-Negative) | Aggressive single JPEG compression ($Q=50$). |
| `img_jpeg_double_q95_q75` | JPEG | $256 \times 256$ | **AUTHENTIC** | Null (All-Negative) | Double JPEG compression ($Q_1=95 \to Q_2=75$). |
| `img_geom_resample_bicubic` | PNG | $256 \times 256$ | **MANIPULATED** | Null (Global) | Bicubic geometric scaling & interpolation evaluation. |
| `img_copymove_translated` | PNG | $256 \times 256$ | **MANIPULATED** | `ground_truth_mask.png` | Localized translation clone ($64 \times 64$ patch duplicated). |
| `img_splicing_donor` | PNG | $256 \times 256$ | **MANIPULATED** | `ground_truth_mask.png` | Composite splicing insertion with contrasting provenance. |
| `img_noise_gaussian_localized` | PNG | $256 \times 256$ | **MANIPULATED** | `ground_truth_mask.png` | Localized additive zero-mean Gaussian noise ($\sigma=25$). |
| `img_color_channel_shift` | PNG | $256 \times 256$ | **MANIPULATED** | `ground_truth_mask.png` | Localized red/green inter-channel shift ($+8$ px offset). |
| `img_false_positive_texture` | PNG | $256 \times 256$ | **AUTHENTIC** | Null (All-Negative) | High-frequency repetitive authentic texture; false alarm stress test. |

---

## 3. Mathematical Evaluation Metrics & Formulas

### 3.1 Analytical Fidelity Metrics

Fidelity metrics quantify the structural and numerical fidelity of recompression, residual generation, and visual representations.

1. **Mean Squared Error (MSE):**
   $$\text{MSE}(I_1, I_2) = \frac{1}{M \cdot N \cdot C} \sum_{c=1}^C \sum_{y=1}^M \sum_{x=1}^N \left(I_1(x, y, c) - I_2(x, y, c)\right)^2$$
   *Validation Requirement:* $M, N, C$ must match identically. $\text{MSE} \ge 0.0$.

2. **Peak Signal-to-Noise Ratio (PSNR):**
   $$\text{PSNR}(I_1, I_2) = 10 \cdot \log_{10} \left( \frac{\text{MAX}^2}{\text{MSE}(I_1, I_2)} \right)$$
   *Implementation Constraint:* When $\text{MSE} = 0$, PSNR is bounded to $+100.0\text{ dB}$ to avoid division by zero. $\text{MAX} = 255.0$ for 8-bit imagery.

3. **Structural Similarity Index Measure (SSIM):**
   Evaluated on luminance according to Wang et al. (2004) using an $11 \times 11$ circular-symmetric Gaussian weighting window ($\sigma=1.5$):
   $$\text{SSIM}(x, y) = \frac{(2\mu_x\mu_y + C_1)(2\sigma_{xy} + C_2)}{(\mu_x^2 + \mu_y^2 + C_1)(\sigma_x^2 + \mu_y^2 + C_2)}$$
   where $C_1 = (0.01 \cdot 255)^2 = 6.5025$ and $C_2 = (0.03 \cdot 255)^2 = 58.5225$.

### 3.2 Spatial Localization Metrics

Continuous residual or heatmap predictions $P(x, y) \in [0, 255]$ are binarized against a predeclared threshold $\tau$:
$$\hat{M}_\tau(x, y) = \begin{cases} 1 & \text{if } P(x, y) \ge \tau \\ 0 & \text{otherwise} \end{cases}$$
The binary prediction $\hat{M}_\tau$ is compared against the ground-truth mask $M(x, y) \in \{0, 1\}$:

1. **Confusion Matrix Elements:**
   - **True Positives ($TP$):** $\sum_{x, y} \hat{M}_\tau(x, y) \cdot M(x, y)$
   - **False Positives ($FP$):** $\sum_{x, y} \hat{M}_\tau(x, y) \cdot (1 - M(x, y))$
   - **False Negatives ($FN$):** $\sum_{x, y} (1 - \hat{M}_\tau(x, y)) \cdot M(x, y)$
   - **True Negatives ($TN$):** $\sum_{x, y} (1 - \hat{M}_\tau(x, y)) \cdot (1 - M(x, y))$

2. **Pixel Conservation Law (Mandatory Invariant):**
   $$TP + FP + FN + TN \equiv \text{Total Pixels} = M \times N$$
   Every benchmark test must assert this identity to guarantee zero unclassified pixels.

3. **Derived Statistical Measures:**
   - **Intersection-over-Union (IoU / Jaccard Index):** $\text{IoU} = \frac{TP}{TP + FP + FN}$
   - **Precision (Positive Predictive Value):** $\text{Prec} = \frac{TP}{TP + FP}$
   - **Recall (Sensitivity / True Positive Rate):** $\text{Rec} = \frac{TP}{TP + FN}$
   - **F1 Score:** $F_1 = 2 \cdot \frac{\text{Prec} \cdot \text{Rec}}{\text{Prec} + \text{Rec}} = \frac{2TP}{2TP + FP + FN}$
   - **False Positive Rate (Fall-out):** $\text{FPR} = \frac{FP}{FP + TN}$
   - **Specificity (True Negative Rate):** $\text{Spec} = \frac{TN}{TN + FP} = 1 - \text{FPR}$
   - **Overall Pixel Accuracy:** $\text{Acc} = \frac{TP + TN}{TP + FP + FN + TN}$

---

## 4. Predeclared Algorithmic Thresholds & Experimental Protocols

### 4.1 Error Level Analysis (ELA) Protocol
- **Resave Quality Factor:** $Q_{resave} = 95$ (standard forensic baseline).
- **Dual-Scale Visualization Modes:**
  1. *Dynamic Normalized:* Scaled linearly by $\frac{255}{\max(\Delta I)}$.
  2. *Fixed Scale:* Scaled deterministically by a constant multiplier of $20.0$:
     $$I_{fixed20}(x, y) = \min(255, \Delta I(x, y) \cdot 20.0)$$
- **Fidelity Evaluation:** MSE, PSNR, SSIM measured between input image $I$ and $I_{resaved}$.
- **Artifact Diagnostics:**
  - Saturation percentage: $\frac{\sum [I_{fixed20}(x, y) == 255]}{M \cdot N} \times 100\%$.
  - Intensity statistics: Mean, standard deviation, min, max.
- **Applicability Guardrail:** ELA requires lossy DCT history. Input images with container format `PNG` or `TIFF` must be formally rejected with `EngineExecutionStatus.NOT_APPLICABLE`.

### 4.2 Spatial Noise Residual Analysis Protocol (Gaussian vs. Median)
- **Filters Evaluated:**
  1. *Gaussian Filter:* $G_\sigma$ with kernel size $3 \times 3$, $\sigma = 0.5$.
  2. *Median Filter:* Non-linear spatial median with window $3 \times 3$.
- **Predeclared Localization Thresholds:**
  - $\tau_1 = 32$ (High sensitivity, exploratory threshold)
  - $\tau_2 = 64$ (Balanced forensic operational threshold)
  - $\tau_3 = 128$ (High specificity, conservative threshold)
- **Target Fixtures:**
  1. `img_noise_gaussian_localized` (Positive evaluation against ground-truth mask).
  2. `img_false_positive_texture` (Negative stress test: measures edge leakage FPR on authentic texture).
  3. `img_001_authentic_base` (Negative baseline: measures baseline sensor noise residual).

### 4.3 JPEG-DCT Spatial Frequency Protocol
- **Transform:** 2D orthonormal $8 \times 8$ Discrete Cosine Transform applied to luminance:
  $$Y(x, y) = 0.299 \cdot R(x, y) + 0.587 \cdot G(x, y) + 0.114 \cdot B(x, y)$$
- **Metrics Recorded:** Total $8 \times 8$ blocks processed, high-frequency energy ratio, blocking grid boundary power ratio.
- **Architectural Scope Declaration:** Evaluates spatial block frequencies across decoded pixels; does not claim bitstream quantization matrix parsing.

### 4.4 Copy-Move / Geometric Cloning Protocol
- **Engines Evaluated:** `COPY_MOVE`, `CLONE-BLOCK`, `CLONE-KEYPOINT`.
- **Target Fixtures:**
  1. `img_copymove_translated` (Positive detection of duplicated patch).
  2. `img_false_positive_texture` (False alarm challenge on repetitive authentic texture).
  3. `img_001_authentic_base` (Authentic reference negative).
- **Metrics Recorded:** Raw match count, filtered matches, geometric inliers, inlier ratio, candidate region bounding boxes.

---

## 5. Execution & Verification Workflow

1. **Preflight Step:** Calculate SHA-256 for all 11 fixtures in `backend/datasets/controlled/v1/` and verify match with `manifest.json`.
2. **Execution Step:** Run `backend/scripts/run_stage3_batch3_validation.py`.
3. **Artifact Persistence:** Output comprehensive results to `backend/benchmarks/stage3_ws1_batch3/validation_results.json`.
4. **Postflight Step:** Re-calculate SHA-256 for all 11 fixtures and verify exact invariance:
   $$\text{SHA256}_{post}(I) \equiv \text{SHA256}_{pre}(I), \quad \forall I \in \text{controlled-v1}$$
5. **Automated Verification:** Execute regression test suite `backend/tests/test_stage3_batch3_validation.py` and scientific freeze test `backend/tests/test_scientific_freeze.py`.
