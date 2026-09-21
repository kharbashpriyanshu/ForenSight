# JPEG 8×8 Blocking Artifact Analysis Engine Specification

**Engine ID:** `BLOCKING-ARTIFACT`  
**Version:** `1.0.0`  
**Category:** `LOCAL_ANALYSIS`  
**Classification:** Digital Image Forensics / Boundary Discontinuity Analysis  

---

## 1. Purpose & Forensic Objectives

The `BLOCKING-ARTIFACT` engine investigates periodic 8×8 Discrete Cosine Transform (DCT) block boundary step discontinuities in JPEG imagery. Its objective is to measure global grid boundary strength, compare boundary steps against intra-block texture gradients, and identify localized candidate regions where blocking characteristics deviate from the surrounding baseline.

Such discrepancies frequently arise when:
1. An uncompressed or differently compressed foreign patch is pasted into a host JPEG without prior matching of compression parameters.
2. A pasted fragment is translated or transformed such that its internal 8×8 block grid is phase-shifted relative to the host 8×8 grid.
3. Post-capture local editing operations (such as smoothing, inpainting, or localized blurring) attenuate natural 8×8 block boundary transitions.

---

## 2. JPEG 8×8 Blocking Concept

Lossy JPEG compression partitions image channels into non-overlapping $8 \times 8$ pixel blocks. A 2D Discrete Cosine Transform (DCT) converts spatial pixel values into 64 frequency coefficients, which are then quantized using an 8×8 quantization matrix ($Q$).

Because quantization rounds high-frequency components independently in each 8×8 block, boundary transitions between neighboring blocks do not maintain the continuous derivative of the original optical scene. Instead, periodic step discontinuities form along regular grid boundaries at multiples of 8:
- Horizontal grid boundaries between row $8i - 1$ and row $8i$ ($i = 1, \dots, N_H - 1$).
- Vertical grid boundaries between column $8j - 1$ and column $8j$ ($j = 1, \dots, N_W - 1$).

---

## 3. Mathematical & Statistical Formulation

### Boundary Discontinuity Extraction
Let $Y(y, x)$ denote the grayscale luminance channel of the image.

#### Horizontal Boundary Analysis (Row Transitions)
Across boundary rows $y_1 = 8i - 1$ and $y_2 = 8i$, the absolute boundary step difference is:
$$S_H(i, x) = |Y(8i, x) - Y(8i-1, x)|$$

The adjacent intra-block neighbor differences (representing the underlying linear texture gradient) are:
$$I_H^{(1)}(i, x) = |Y(8i-1, x) - Y(8i-2, x)|$$
$$I_H^{(2)}(i, x) = |Y(8i+1, x) - Y(8i, x)|$$
$$G_H(i, x) = \frac{I_H^{(1)}(i, x) + I_H^{(2)}(i, x)}{2}$$

The net boundary discontinuity excess is defined as:
$$\Delta_H(i, x) = \max(0, S_H(i, x) - G_H(i, x))$$

For each 8×8 block $(i, j)$, the horizontal boundary score is the average along its 8-pixel horizontal interface:
$$B_H(i, j) = \frac{1}{8} \sum_{k=0}^7 \Delta_H(i, 8j + k)$$

#### Vertical Boundary Analysis (Column Transitions)
Similarly, across boundary columns $x_1 = 8j - 1$ and $x_2 = 8j$:
$$S_V(y, j) = |Y(y, 8j) - Y(y, 8j-1)|$$
$$I_V^{(1)}(y, j) = |Y(y, 8j-1) - Y(y, 8j-2)|$$
$$I_V^{(2)}(y, j) = |Y(y, 8j+1) - Y(y, 8j)|$$
$$G_V(y, j) = \frac{I_V^{(1)}(y, j) + I_V^{(2)}(y, j)}{2}$$
$$\Delta_V(y, j) = \max(0, S_V(y, j) - G_V(y, j))$$

For each 8×8 block $(i, j)$:
$$B_V(i, j) = \frac{1}{8} \sum_{k=0}^7 \Delta_V(8i + k, j)$$

---

## 4. Local Analysis & Roughness Normalization

To prevent textured or high-contrast natural edges from biasing boundary discontinuity measurements, intra-block roughness (activity) is computed for each block:
$$A(i, j) = \frac{1}{N_{\text{int}}} \left( \sum |\nabla_x Y_{\text{int}}| + \sum |\nabla_y Y_{\text{int}}| \right)$$

The normalized local blocking strength matrix $M(i, j)$ is formulated as:
$$M(i, j) = \frac{\frac{1}{2} (B_H(i, j) + B_V(i, j))}{1.0 + 0.15 \cdot A(i, j)}$$

---

## 5. Global Metrics & Periodicity

The engine computes the following global metrics:
1. **Global Blocking Strength ($\mu_M$):** Mean of $M(i, j)$ across all valid blocks.
2. **Global Standard Deviation ($\sigma_M$):** Spatial variation of blocking strength across the image.
3. **Boundary Energy:** Mean squared excess boundary step $\frac{1}{N} \sum (\frac{B_H + B_V}{2})^2$.
4. **Boundary-to-Internal Ratios:**
   $$\text{Ratio}_H = \frac{\text{mean}(S_H)}{\text{mean}(G_H)}, \quad \text{Ratio}_V = \frac{\text{mean}(S_V)}{\text{mean}(G_V)}$$
   Ratios significantly exceeding $1.0$ indicate prominent JPEG blocking boundaries.
5. **Grid Periodicity Peak Ratio:** Measured from the 1D autocorrelation profiles of row and column projections at lag 8 relative to neighboring lags (harmonic ratio).

---

## 6. Candidate-Region Methodology

Candidate anomalous regions are identified deterministically using spatial z-score clustering:
1. For each block $(i, j)$, compute the z-score:
   $$Z(i, j) = \frac{M(i, j) - \mu_M}{\sigma_M + \epsilon}$$
2. Flag blocks where $|Z(i, j)| \ge z_{\text{threshold}}$ (default: 2.2).
3. Connect adjacent flagged blocks using 8-connectivity connected-component labeling.
4. Filter out clusters with block count $< \text{min\_cluster\_blocks}$ (default: 4 blocks, corresponding to $16 \times 16$ pixels).
5. For each valid cluster, classify the observation type:
   - **`elevated_discontinuity`:** Region with higher-than-average boundary steps (e.g. secondary compression boundary or misaligned block grid).
   - **`attenuated_blocking`:** Region with lower-than-average boundary steps (e.g. uncompressed insertion or local blurring/smoothing).
6. Record normalized bounding boxes and spatial descriptors.

---

## 7. Engine Parameters

| Parameter | Type | Default | Range | Description |
| :--- | :--- | :--- | :--- | :--- |
| `z_score_threshold` | `float` | `2.2` | 1.0 – 5.0 | Statistical threshold for anomaly block identification. |
| `min_cluster_blocks` | `int` | `4` | 1 – 64 | Minimum contiguous 8×8 blocks required to define a candidate region. |
| `max_dimension` | `int` | `4096` | 256 – 8192 | Bounded execution cap protecting against excessive memory usage. |

---

## 8. Artifacts Generated

1. **`blocking_artifact_map.png`**
   - 2D spatial heatmap (Inferno colormap) displaying normalized local blocking strength across the image geometry.
   - Overlaid with subtle 8×8 grid boundary guidelines and colored bounding boxes for candidate anomaly clusters.
2. **`blocking_artifact_analysis.json`**
   - Comprehensive machine-readable payload containing:
     - `engine` metadata
     - `input_information` (dimensions, block counts)
     - `horizontal_boundary_statistics`
     - `vertical_boundary_statistics`
     - `global_statistics`
     - `candidate_regions` (bounding boxes, area, z-scores, descriptions)
     - `algorithm_parameters`
     - `reproducibility_metadata`
     - `limitations`

---

## 9. Applicability & Scientific Guardrails

- **Supported Formats:** `JPEG`, `JPG`
- **Unsupported Formats:** `PNG`, `WEBP`, `TIFF`, `BMP`
- When presented with unsupported formats, the engine returns `status = NOT_APPLICABLE` alongside the forensic guardrail notice:
  > *"Blocking artifact grid analysis is applicable exclusively to ITU-T T.81 / ISO 10918-1 JPEG bitstreams exhibiting 8×8 DCT quantization. Inapplicability is a mathematical constraint, NOT negative evidence of manipulation or proof of authenticity."*

---

## 10. Limitations

- **Not an Authenticity Verdict:** Measured boundary steps reflect physical compression physics, not intentionality or fraud.
- **Natural Flat Regions:** Smooth sky, snow, or underexposed shadows legitimately lack texture and may exhibit attenuated boundary steps.
- **Deblocking Filters:** Modern smartphones and editing suites frequently apply post-capture edge-preserving deblocking filters that diminish boundary step heights.
- **High Quality Factors:** JPEGs compressed at Q $\ge$ 95 employ small quantization divisors, resulting in subtle boundary transitions close to the noise floor.

---

## 11. Computational Complexity

- **Time Complexity:** $\mathcal{O}(H \times W)$ linear with respect to image pixels.
- **Space Complexity:** $\mathcal{O}(\frac{H}{8} \times \frac{W}{8})$ for the block grid matrices.
- **Execution Bound:** Automatically downscales images exceeding `max_dimension` to maintain deterministic latency under 500 ms on standard commodity CPUs.

---

## 12. Scientific References

1. **Wang, Z., Sheikh, H. R., & Bovik, A. C. (2002).**  
   *No-reference perceptual quality assessment of JPEG compressed images based on blockiness and luminance masking.*  
   IEEE International Conference on Image Processing (ICIP), 1, I-441.
2. **Fan, Z., & de Queiroz, R. L. (2003).**  
   *Identification of bitmap images from JPEG squeezing.*  
   IEEE Transactions on Information Forensics and Security / Image Processing, 12(2), 230–235.
3. **Li, W., Yuan, Y., & Yu, N. (2009).**  
   *Detecting digital image forgeries using local blocking artifact grid inconsistencies.*  
   Journal of Systems and Software, 82(1), 85–94.
