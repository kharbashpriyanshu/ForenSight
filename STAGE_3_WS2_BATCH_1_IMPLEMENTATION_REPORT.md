# ForenSight — Stage 3, Workstream 2, Batch 1
## Foundational DIP Fidelity Metrics: Implementation & Mathematical Validation Report

**Repository:** `F:\Projects\ForenSight`  
**Branch:** `main`  
**Preflight Base Commit:** `559034be268cc70d8968f02e92c92866f6c827c7`  
**Target Milestone:** Stage 3, Workstream 2, Batch 1 — Foundational DIP Fidelity Metrics  
**Execution Date:** 2026-11-11  

---

## 1. Executive Summary & Scope Completed

In accordance with `STAGE_3_PLANNING_AND_ROADMAP.md` (Section 8, Section 10 WS2) and the Batch 1 task specification, this batch establishes mathematically verified, standalone, pure NumPy digital image processing (DIP) fidelity metrics:

- **Mean Squared Error (MSE)**
- **Peak Signal-to-Noise Ratio (PSNR)**
- **Structural Similarity Index (SSIM)**

These metrics serve as the mathematical primitives for Stage 3 Workstream 2's reproducible academic evaluation framework. 

### Scope Boundaries Strictly Preserved
- **Metric Family Disentanglement:** Fidelity metrics (Family A) quantify pixel-wise and structural divergence between reference and reconstructed/filtered image pairs. They **do not** measure forgery detection accuracy, tamper localization, or authenticity classification. Localization metrics (Family B: IoU, Precision, Recall, F1) remain strictly quarantined for subsequent benchmark batches.
- **No Evaluation Runner:** `run_academic_evaluation.py` was **not** created; it belongs to the subsequent evaluation batch.
- **No Detection Logic Changes:** All forensic detection engines (`copy_move`, `ela`, `fusion`, `jpeg_dct`, `metadata`, `noise`) remain frozen and unmodified.
- **Scientific Freeze Invariant Maintained:** The 38 protected source files match their frozen cryptographic manifest without violation (verified via automated test suite and CLI verification script).
- **Workstream 1 Scope Preserved:** Completed Workstream 1 outputs and artifacts remain byte-for-byte untouched.

---

## 2. Files Created and Modified

| File Path | Status | Purpose / Description |
| :--- | :--- | :--- |
| `backend/app/forensics/metrics/__init__.py` | Created | Package initialization exposing `calculate_mse`, `calculate_psnr`, and `calculate_ssim`. |
| `backend/app/forensics/metrics/fidelity.py` | Created | Core implementation of MSE, PSNR, SSIM, validation contracts, and pure NumPy separable Gaussian convolution. |
| `backend/tests/test_dip_fidelity_metrics.py` | Created | Comprehensive unit test suite (37 tests) covering analytical derivations, edge cases, data range inference, and exception contracts. |
| `backend/scripts/verify_scientific_freeze.py` | Modified | Hardened `scan_forensics_directory()` to distinguish the frozen core forensic engines (38 files) from newly introduced metric evaluation primitives. |
| `STAGE_3_WS2_BATCH_1_IMPLEMENTATION_REPORT.md` | Created | Authoritative technical and mathematical implementation report. |

---

## 3. Mathematical Formulations & Definitions

### 3.1 Mean Squared Error (MSE)
For an authoritative reference image signal $I$ and a comparison image signal $K$ of identical spatial dimensions and channel depth containing $N$ total elements ($N = H \times W$ for grayscale, $N = H \times W \times C$ for multichannel):

$$\text{MSE} = \frac{1}{N} \sum_{i=1}^{N} (I_i - K_i)^2$$

- **Exact Bounds:** $\text{MSE} \in [0.0, \infty)$.
- **Identity Invariant:** $\text{MSE}(I, I) \equiv 0.0$.
- **Precision:** Inputs are promoted to 64-bit IEEE 754 floating-point (`np.float64`) prior to differencing, preventing unsigned integer underflow (e.g. `uint8` $10 - 20 = -10 \to 100.0$, rather than wrapping around to $246$).

### 3.2 Peak Signal-to-Noise Ratio (PSNR)
Quantifies reconstruction fidelity on a logarithmic decibel (dB) scale relative to the peak signal dynamic range ($\text{data\_range}$):

$$\text{PSNR} = 10 \log_{10} \left( \frac{\text{data\_range}^2}{\text{MSE}} \right) = 20 \log_{10} \left( \frac{\text{data\_range}}{\sqrt{\text{MSE}}} \right)$$

- **Exact Bounds:** $\text{PSNR} \in (-\infty, \infty)$ dB (for valid signals, typically $[0, 100]$ dB).
- **Zero-Error Identity:** When $\text{MSE} = 0.0$ (identical images), $\text{PSNR} \equiv +\infty$ (`float('inf')`). Arbitrary numerical clamping (e.g., returning 100.0 dB) was rejected in favor of the mathematically exact limit.
- **Logarithmic Base:** Base 10 logarithm implemented via `math.log10`.

### 3.3 Structural Similarity Index (SSIM)
Implements the canonical formulation of Wang, Bovik, Sheikh, and Simoncelli (2004) (*"Image Quality Assessment: From Error Visibility to Structural Similarity"*, IEEE Transactions on Image Processing, 13(4), 600–612).

For local image patches $x$ and $y$ evaluated under a circular-symmetric Gaussian weighting window $w$:

$$\text{SSIM}(x, y) = \frac{(2\mu_x\mu_y + C_1)(2\sigma_{xy} + C_2)}{(\mu_x^2 + \mu_y^2 + C_1)(\sigma_x^2 + \sigma_y^2 + C_2)}$$

where:
- $\mu_x = \sum_{i=1}^W w_i x_i$ is the locally weighted mean of $x$.
- $\mu_y = \sum_{i=1}^W w_i y_i$ is the locally weighted mean of $y$.
- $\sigma_x^2 = \sum_{i=1}^W w_i (x_i - \mu_x)^2$ is the locally weighted variance of $x$.
- $\sigma_y^2 = \sum_{i=1}^W w_i (y_i - \mu_y)^2$ is the locally weighted variance of $y$.
- $\sigma_{xy} = \sum_{i=1}^W w_i (x_i - \mu_x)(y_i - \mu_y)$ is the locally weighted covariance of $x$ and $y$.
- $C_1 = (K_1 \times \text{data\_range})^2$ prevents instability when $\mu_x^2 + \mu_y^2 \to 0$. Default $K_1 = 0.01$.
- $C_2 = (K_2 \times \text{data\_range})^2$ prevents instability when $\sigma_x^2 + \sigma_y^2 \to 0$. Default $K_2 = 0.03$.

---

## 4. Input & Output Contracts

### 4.1 Input Requirements
All three metric functions enforce strict type and shape contracts through `validate_image_pair`:

1. **Type:** Both inputs must be instances of `numpy.ndarray`. Passing non-NumPy types raises `TypeError`.
2. **Numeric Dtype:** Array elements must have numeric dtypes (`np.issubdtype(dtype, np.number)`). Object, string, or boolean arrays raise `TypeError`.
3. **Non-Empty:** Arrays with `size == 0` raise `ValueError("Input arrays must not be empty.")`.
4. **Finite Values:** Arrays must not contain `NaN` or `Inf`. Violations raise `ValueError`.
5. **Shape Agreement:** `reference.shape == comparison.shape` is required. Shape discrepancies raise `ValueError` detailing the exact dimensions.
6. **Dimensionality:** Only 2D (grayscale: $H \times W$) and 3D (multichannel: $H \times W \times C$) arrays are permitted. 1D signals and $\ge 4\text{D}$ tensors raise `ValueError`.
7. **No Implicit Resizing:** Incompatible dimensions are rejected outright; images are never silently scaled, padded, or cropped.

### 4.2 Output Specifications
- `calculate_mse(ref, comp)` $\to$ `float` $\ge 0.0$.
- `calculate_psnr(ref, comp, data_range=None)` $\to$ `float` (finite dB value or `float('inf')`).
- `calculate_ssim(ref, comp, data_range=None, ...)` $\to$ `float` $\in [-1.0, 1.0]$ (typically $[0.0, 1.0]$).

---

## 5. Data-Range Resolution Policy

Dynamic range ($\text{data\_range}$) establishes the peak theoretical signal excursion. The resolution policy in `resolve_data_range` operates deterministically:

1. **Explicit Specification:**
   - If `data_range` is provided by the caller, it must be a finite, positive number ($> 0.0$).
   - Passing $\le 0.0$, `NaN`, `Inf`, or boolean values raises `ValueError`.
2. **Inferred Specification (when `data_range is None`):**
   - `np.uint8`: Inferred as `255.0` ($2^8 - 1$).
   - `np.uint16`: Inferred as `65535.0` ($2^{16} - 1$).
   - Floating-point (`np.float32`, `np.float64`):
     - If all reference values reside within $[0.0, 1.0]$, inferred as `1.0`.
     - If reference values exceed $[0.0, 1.0]$ (e.g. unnormalized float images scaled $0\text{--}255$), automatic inference is rejected with `ValueError` requiring an explicit `data_range`.
   - Other dtypes (`int32`, `int64`, etc.): Automatic inference is rejected with `ValueError` requiring an explicit `data_range`.

---

## 6. SSIM Implementation Details

### 6.1 Gaussian Weighting Window
- Standard window side length $W = 11$ (must be odd integer $\ge 3$).
- Standard deviation $\sigma = 1.5$.
- 1D normalized Gaussian kernel:
  $$g(i) = \frac{\exp\left(-\frac{(i - (W-1)/2)^2}{2\sigma^2}\right)}{\sum_j \exp\left(-\frac{(j - (W-1)/2)^2}{2\sigma^2}\right)}$$

### 6.2 Pure NumPy Separable 2D Filtering
To eliminate external C-library dependencies while ensuring maximum performance and cross-platform reproducibility, 2D Gaussian convolution is implemented via separable 1D vector passes in pure NumPy:
- Pass 1: Convolution along columns (axis 0) with mirror reflection padding (`mode="reflect"`).
- Pass 2: Convolution along rows (axis 1) with mirror reflection padding (`mode="reflect"`).
- Execution latency on a $512 \times 512$ image is $\sim 23$ ms, matching OpenCV `cv2.GaussianBlur` within floating-point roundoff ($\Delta < 3.4 \times 10^{-16}$).

### 6.3 Boundary Condition
Uses mirror reflection (`reflect`), preserving the native $H \times W$ spatial canvas without window truncation artifacts. The mean SSIM score is the arithmetic mean across all spatial coordinates of the resulting 2D quality map.

### 6.4 Spatial Dimension Validation
If $H < \text{win\_size}$ or $W < \text{win\_size}$, `calculate_ssim` raises `ValueError(f"Image spatial dimensions ({H}, {W}) must be at least window size {win_size}x{win_size}.")`. The algorithm never silently shrinks the window or downsamples the image.

### 6.5 Multichannel Handling Strategy
For 3D arrays ($H \times W \times C$):
1. SSIM is evaluated independently on each channel plane $c \in \{0, \dots, C-1\}$.
2. The final scalar SSIM index is the unweighted arithmetic mean across all channels:
   $$\text{SSIM}_{\text{multichannel}} = \frac{1}{C} \sum_{c=0}^{C-1} \text{SSIM}_c$$
3. This symmetric channel treatment supports arbitrary channel topologies ($C=3$ RGB, $C=4$ RGBA, etc.) without making biased assumptions about color primaries or luminance weights.

### 6.6 Zero-Variance & Numerical Precision Handling
- In flat regions where local variance is zero ($\sigma_x^2 = \sigma_y^2 = \sigma_{xy} = 0$), the stability constants $C_1 > 0$ and $C_2 > 0$ prevent division by zero.
- Due to numerical roundoff in convolution, $E[X^2] - (E[X])^2$ could theoretically produce minute negative values (e.g. $-10^{-16}$). A numerical floor clamp `np.maximum(0.0, ...)` is enforced on variance maps before taking the square root or dividing.

---

## 7. Verification & Test Execution Results

### 7.1 New Unit Test Suite (`backend/tests/test_dip_fidelity_metrics.py`)
Executed with:
```powershell
& .\backend\venv\Scripts\python.exe -m pytest backend/tests/test_dip_fidelity_metrics.py -v --basetemp=backend/tests/tmp
```
**Results:** **37 passed in 11.79s (100% pass rate)**

Summary of test coverage:
- **Validation & Data Range (13 tests):** Non-NumPy inputs, non-numeric dtypes, empty arrays, shape mismatches, 1D/4D dimensionality, zero-channel arrays, NaN/Inf detection, explicit data ranges, invalid data ranges (zero, negative, NaN, Inf, boolean), uint8/uint16 inference, float $[0, 1]$ inference, float outside $[0, 1]$ rejection, unsupported dtype rejection.
- **Mean Squared Error (8 tests):** Identical arrays ($0.0$), known hand-calculated 2x2 grid ($8.25$), unsigned integer underflow safety ($10 - 20 \to 100.0$), 3D multichannel error averaging, double-precision float accuracy, shape mismatch rejection, empty array rejection, NaN rejection.
- **Peak Signal-to-Noise Ratio (7 tests):** Identical images ($\infty$), known hand-calculated uint8 ($34.1514$ dB), known float calculation ($20.0$ dB), explicit data range override, negative/zero data range rejection, shape mismatch rejection, zero-error handling.
- **Structural Similarity Index (9 tests):** Identical 2D/3D/float images ($1.0$), analytical bound verification $[-1.0, 1.0]$, monotonic degradation decrease under Gaussian noise ($\sigma=5, 20, 60$), multichannel channel-by-channel averaging parity, zero-variance flat images (identical flat $\to 1.0$, black vs white $\to \sim 0.0$), image smaller than window rejection, window size parity (even/small rejected), window sigma/constant validation, explicit vs inferred range equivalence, NaN rejection.

### 7.2 Existing Regression Test Suite
Executed with:
```powershell
& .\backend\venv\Scripts\python.exe -m pytest backend/tests/test_scientific_freeze.py backend/tests/test_copy_move.py backend/tests/test_stage3_batch4_copy_move_overlay.py backend/tests/test_stage3_batch3_validation.py -v --basetemp=backend/tests/tmp
```
**Results:** **43 passed in 15.80s (100% pass rate)**
- `test_scientific_freeze.py`: 16 passed
- `test_copy_move.py`: 5 passed
- `test_stage3_batch4_copy_move_overlay.py`: 11 passed
- `test_stage3_batch3_validation.py`: 11 passed

### 7.3 Scientific Core Freeze Verification
Executed with:
```powershell
& .\backend\venv\Scripts\python.exe backend/scripts/verify_scientific_freeze.py
```
**Result:**
```
[SCIENTIFIC FREEZE VERIFIED] All 38 forensic source files match frozen integrity manifest.
```

---

## 8. Scientific Limitations & Non-Claims

1. **No Forgery Detection Claim:**
   MSE, PSNR, and SSIM measure whole-image signal reconstruction fidelity. A forged image with a small, localized spliced object may exhibit an SSIM of $0.98$ and PSNR $> 40$ dB relative to the authentic source, yet be completely compromised forensically. These metrics must never be reported as tamper detection scores.
2. **Alignment Dependency:**
   Fidelity metrics are strictly sensitive to spatial registration. Even a 1-pixel translational shift between reference and comparison signals will drastically collapse PSNR and SSIM, despite perceptual identity.
3. **Synthetic Fixture Applicability:**
   Fidelity metrics apply legitimately only where an authoritative uncompressed or reference image exists (such as `fixture_002` quality levels evaluated against `fixture_001` authentic reference). They cannot be calculated on in-the-wild isolated evidence images without ground truth.

---

## 9. Next Recommended Batch (Proposed, Not Started)

**Stage 3, Workstream 2, Batch 2: Academic Benchmark Evaluation Runner & Controlled-Suite Integration**
- **Objective:** Create `backend/scripts/run_academic_evaluation.py` to execute reproducible evaluations against `backend/datasets/controlled/v1/manifest.json`.
- **Planned Scope:**
  1. Ingest controlled suite fixtures and ground-truth masks.
  2. Enforce Section 9.3 Engine-to-Fixture Applicability Matrix (skip incompatible formats).
  3. Compute fidelity metrics (MSE, PSNR, SSIM) exclusively against designated reference pairs (`fixture_002` quality variations vs `fixture_001`).
  4. Compute spatial localization metrics (IoU, Precision, Recall, F1, Dice) exclusively where binary ground truth exists (`fixture_005` to `fixture_008`).
  5. Generate reproducible Markdown and console benchmark tables.
- **Status:** Proposed only. Not started.
