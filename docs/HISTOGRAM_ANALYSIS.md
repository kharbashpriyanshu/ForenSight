# ForenSight V4 — Histogram & Distribution Forensics

## 1. Purpose
The `HISTOGRAM` engine evaluates global and channel-specific tonal and chromatic distributions in raster imagery. Discrete image histograms expose statistical signatures of sensor dynamic range, quantization levels, tone mapping curves, shadow/highlight saturation (clipping), information entropy, and non-linear contrast adjustments (manifested as comb-like zero-bin gaps).

---

## 2. Mathematical Basis
For an 8-bit channel image $I(x, y) \in \{0, \dots, 255\}$ containing $N = W \times H$ pixels:

### A. Discrete Histogram & Probability Density Function (PDF)
$$H(k) = \sum_{x=0}^{W-1} \sum_{y=0}^{H-1} \mathbb{I}(I(x, y) = k), \quad k \in [0, 255]$$
$$p(k) = \frac{H(k)}{N}$$

### B. Cumulative Distribution Function (CDF)
$$\text{CDF}(k) = \sum_{j=0}^{k} p(j)$$

### C. Moments & Spread Metrics
- **Mean Intensity:**
  $$\mu = \sum_{k=0}^{255} k \cdot p(k)$$
- **Standard Deviation:**
  $$\sigma = \sqrt{\sum_{k=0}^{255} (k - \mu)^2 p(k)}$$
- **Dynamic Range Span:**
  $$\Delta_{\text{range}} = \max \{ k \mid H(k) > 0 \} - \min \{ k \mid H(k) > 0 \}$$

### D. Shannon Information Entropy
$$\mathcal{H} = -\sum_{k=0, p(k) > 0}^{255} p(k) \log_2 p(k) \quad [\text{bits/pixel}]$$
For an 8-bit uniform discrete distribution, $\mathcal{H}_{\max} = \log_2(256) = 8.0 \text{ b/px}$.

### E. Comb-Like Zero-Bin Artifacts
Non-linear contrast expansion maps contiguous input intensity levels to non-contiguous discrete output levels, resulting in periodic empty bins (zero frequency) within the active dynamic range:
$$N_{\text{comb}} = \sum_{k=\min}^{\max} \mathbb{I}(H(k) = 0)$$

### F. Boundary Extrema Clipping
$$\text{Clip}_{\text{shadow}} = \frac{H(0)}{N} \times 100\%, \quad \text{Clip}_{\text{highlight}} = \frac{H(255)}{N} \times 100\%$$

---

## 3. Exact Implementation
The engine executes within `HistogramEngine`:
1. Validates raster format (JPEG, PNG, WebP, TIFF).
2. Rescales boundedly if dimensions exceed `max_dimension` (default: 4096).
3. Computes ITU-R BT.601 luminance ($Y = 0.299R + 0.587G + 0.114B$) and isolates individual $R$, $G$, and $B$ channels.
4. Generates 256-bin counts, PDFs, CDFs, moments, percentiles ($p_{10}, p_{25}, p_{50}, p_{75}, p_{90}$), Shannon entropy, dynamic range span, and clipping percentages.
5. Identifies interior comb-like gaps.
6. Persists structured data (`histogram_analysis.json`) and 4-panel distribution visualization (`histogram_analysis.png`).

---

## 4. Parameters
| Parameter | Type | Default | Range | Description |
|---|---|---|---|---|
| `bins` | integer | 256 | [16, 256] | Histogram quantization bins |
| `compute_comb_gaps` | boolean | true | true/false | Detect interior zero bins |
| `max_dimension` | integer | 4096 | [256, 8192] | Maximum image dimension for bounded resource usage |

---

## 5. Output Metrics
- `shannon_entropy`: Discrete information entropy (bits/pixel).
- `comb_gaps_count`: Number of interior unoccupied bins between minimum and maximum active levels.
- `shadow_clipping_pct`: Percentage of pixels at intensity 0.
- `highlight_clipping_pct`: Percentage of pixels at intensity 255.
- `dynamic_range`: Difference between highest and lowest active intensity levels.

---

## 6. Generated Artifacts
1. **`histogram_analysis.png`**: High-contrast 4-panel distribution plot displaying Luminance, Red, Green, and Blue histograms alongside cumulative distribution curves (CDF).
2. **`histogram_analysis.json`**: Complete 256-bin counts, normalized PDFs, CDFs, percentiles, moments, parameters, and limitations.

---

## 7. Applicability
- **Supported Formats:** JPEG, JPG, PNG, WebP, TIFF.
- **Minimum Dimensions:** $16 \times 16$ pixels.
- **Multi-modal:** Applies to both color (RGB) and grayscale imagery.

---

## 8. Limitations & Forensic Guardrails
1. **Scene Dependence:** Histogram distributions are determined primarily by scene illumination, lighting geometry, and subject matter.
2. **Standard Processing:** Auto-exposure, white-balancing, and tone curves routinely induce comb-like gaps and edge clipping during normal camera operation.
3. **No Automatic Guilt:** An unusual histogram distribution is an analytical observation, **NOT** proof of deceptive manipulation.

---

## 9. Computational Complexity
- **Time Complexity:** $\mathcal{O}(N)$ where $N$ is total pixel count ($W \times H$).
- **Space Complexity:** $\mathcal{O}(B)$ where $B = 256$ bins. Memory usage is strictly bounded.

---

## 10. Scientific References
- Stamm, M. C., & Liu, K. J. R. (2010). *Detecting Contrast Adjustments in Digital Images*. IEEE Transactions on Information Forensics and Security, 5(2), 269–285.
- Gonzalez, R. C., & Woods, R. E. (2018). *Digital Image Processing* (4th ed.). Pearson.
- Farid, H. (2008). *Forensic Detection of Image Equalization and Gamma Correction*. IEEE Signal Processing Letters, 15, 597–600.
