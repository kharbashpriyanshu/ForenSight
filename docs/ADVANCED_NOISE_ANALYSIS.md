# ForenSight V4 — Advanced Spatial Noise Residual Forensics

## 1. Purpose
The `ADVANCED-NOISE` forensic engine extracts deterministic high-frequency noise residuals from digital images to evaluate sensor noise consistency across luminance and individual RGB channels. In authentic digital photographs, sensor noise is stochastically homogeneous across the imaging frame, governed by photon shot noise, thermal dark current, and analog-to-digital read noise characteristics. When an image is spliced, composited, or subjected to localized inpainting, the foreign or modified region typically exhibits a divergent noise level or noise scale. The `ADVANCED-NOISE` engine calculates global moments, robust noise dispersion estimators (MAD), Shannon residual entropy, and block-level z-score deviations to localize candidate noise-inconsistency regions.

---

## 2. Mathematical & Algorithmic Foundation

### A. High-Frequency Noise Residual Extraction
Given a spatial intensity image $I(x, y) \in [0, 255]$:
A deterministic denoised baseline $I_{\text{denoised}}(x, y)$ is estimated using a Gaussian low-pass spatial filter:
$$I_{\text{denoised}}(x, y) = G_\sigma * I(x, y) = \sum_{i=-k}^{k} \sum_{j=-k}^{k} G_\sigma(i, j) \cdot I(x - i, y - j)$$
where $G_\sigma(i, j) = \frac{1}{2\pi \sigma^2} \exp\left(-\frac{i^2 + j^2}{2\sigma^2}\right)$, with kernel size $5 \times 5$, $\sigma = 1.0$, and symmetric reflect border padding (`BORDER_REFLECT_101`).

The spatial high-frequency noise residual is defined as:
$$R(x, y) = I(x, y) - I_{\text{denoised}}(x, y)$$

### B. Global Residual Moments & Robust Statistics
Because natural scene textures can distort classical Gaussian variance estimators, robust non-parametric statistics are computed alongside empirical moments:
1. **Sample Variance:**
   $$\sigma^2 = \frac{1}{MN} \sum_{x=0}^{M-1} \sum_{y=0}^{N-1} (R(x, y) - \mu)^2$$
2. **Median Absolute Deviation (MAD):**
   $$\text{MAD} = \text{median}\left(\Big| R(x, y) - \text{median}(R) \Big|\right)$$
3. **Robust Noise Scale Estimator ($\hat{\sigma}$):**
   For normally distributed residual signals, the asymptotically unbiased scale estimator is:
   $$\hat{\sigma} = 1.4826 \times \text{MAD}$$
4. **Residual Shannon Entropy:**
   The residual distribution is quantized into 128 empirical bins spanning $[P_5 - 1.0, P_{95} + 1.0]$:
   $$\mathcal{H}_{\text{residual}} = -\sum_{k, p_k > 0} p_k \log_2(p_k)$$
5. **High-Frequency Energy Ratio:**
   $$E_{\text{ratio}} = \frac{\sum_{x, y} R(x, y)^2}{\sum_{x, y} I(x, y)^2 + \epsilon}$$

### C. Spectral Frequency Band Decomposition
The residual signal $R(x, y)$ is transformed into the 2D frequency domain via the 2D Discrete Fourier Transform. Radial concentric masks evaluate spectral power concentration across three normalized radial frequency bands:
- **Low Band ($r \le 0.15$):** Structural remnants passing the high-pass filter.
- **Mid Band ($0.15 < r \le 0.50$):** Intermediate textural residual frequencies.
- **High Band ($r > 0.50$):** High-frequency sensor shot and read noise.

### D. Local Spatial Block Consistency & Candidate Region Clustering
1. **Block Partitioning:** The residual image is partitioned into non-overlapping blocks of dimension $B \times B$ ($32 \times 32$ pixels, or $16 \times 16$ if image dimension $< 256$).
2. **Local Estimators:** In each block $b = (u, v)$, local sample variance $\sigma_b^2$, local MAD, and mean absolute residual are calculated.
3. **Robust Baseline:** The global baseline median $\tilde{\sigma}^2 = \text{median}(\{\sigma_b^2\})$ and scale $\text{MAD}_{\text{blocks}} = \text{median}(|\sigma_b^2 - \tilde{\sigma}^2|)$ are computed across all blocks.
4. **Robust z-Score:**
   $$z_b = \frac{\sigma_b^2 - \tilde{\sigma}^2}{1.4826 \cdot \text{MAD}_{\text{blocks}} + \epsilon}$$
5. **Candidate Inconsistency Localization:**
   Blocks satisfying $|z_b| \ge z_{\text{threshold}}$ ($2.5$ by default) are flagged. Connected components with 8-connectivity and minimum area $\ge 2$ blocks are clustered into candidate bounding boxes $[x, y, w, h]$.

---

## 3. Parameters
| Parameter | Type | Default | Valid Range | Description |
|---|---|---|---|---|
| `filter_kernel_size` | integer | 5 | [3, 11] (odd) | Spatial Gaussian filter kernel dimension |
| `filter_sigma` | float | 1.0 | [0.5, 5.0] | Gaussian denoising standard deviation |
| `block_size` | integer | 32 | [8, 128] | Spatial block dimension for local noise evaluation |
| `z_score_threshold` | float | 2.5 | [1.0, 5.0] | Robust z-score threshold for candidate anomaly detection |
| `min_cluster_blocks` | integer | 2 | [1, 50] | Minimum contiguous blocks to cluster into a candidate region |
| `max_dimension` | integer | 4096 | [256, 8192] | Maximum image dimension before safe proportional downsampling |

---

## 4. Generated Forensic Artifacts
1. **`advanced_noise_map.png` (`ArtifactType.HEATMAP`):**
   Full-resolution spatial map of block z-scores using the Jet colormap, with overlaid candidate noise-inconsistency bounding boxes.
2. **`advanced_noise_analysis.png` (`ArtifactType.PLOT`):**
   Three-panel deterministic diagnostic plot displaying:
   - Panel 1: Residual intensity distribution histogram $[-15, 15]$.
   - Panel 2: Channel-by-channel robust noise scale (MAD & $\hat{\sigma}$) across Luminance, Red, Green, and Blue.
   - Panel 3: Spatial block variance distribution histogram with baseline marker.
3. **`advanced_noise_analysis.json` (`ArtifactType.JSON`):**
   Complete numerical output including parameters, dimensions, per-channel metrics, frequency band ratios, block grid dimensions, and candidate bounding regions with local/baseline variances.

---

## 5. Normalized Observations
- `GLOBAL_NOISE_VARIANCE`: Sample variance of global luminance noise residual.
- `GLOBAL_NOISE_MAD`: Median Absolute Deviation of luminance noise residual.
- `GLOBAL_NOISE_ENTROPY`: Shannon entropy of quantized residual distribution (in bits).
- `HIGH_FREQUENCY_NOISE_ENERGY`: Energy ratio of noise residual to full image signal.
- `NOISE_INCONSISTENCY_REGION_COUNT`: Total count of clustered candidate noise-inconsistency regions.
- `MAX_LOCAL_NOISE_DEVIATION`: Maximum absolute robust z-score observed across candidate regions.

---

## 6. Applicability & Input Requirements
- **Supported Formats:** JPEG, PNG, WebP, TIFF.
- **Minimum Dimensions:** $16 \times 16$ pixels.
- **Color Spaces:** RGB, Grayscale, RGBA (alpha stripped during luminance conversion).
- **Execution Safety:** Non-inapplicable across supported image formats. Images exceeding `max_dimension` are downsampled proportionally with exact scale factor recorded in provenance metadata.

---

## 7. Forensic Interpretation Guidelines & Scientific Guardrails
1. **Empirical Indicator, Not Proof of Manipulation:**
   Localized noise variance differences are empirical physical measurements. They indicate that the statistical characteristics of the high-frequency residual in a specific region deviate from the image's robust baseline.
2. **Natural Sources of Noise Variance:**
   - **Scene Texture:** Highly textured surfaces (e.g. foliage, textiles) generate elevated residual variance after spatial low-pass filtering.
   - **Depth of Field:** Out-of-focus background or foreground regions naturally exhibit lower high-frequency noise variance.
   - **Vignetting & Lighting:** Optical lens falloff and dark shadows exhibit different sensor shot noise levels than brightly illuminated areas.
3. **Cross-Modality Corroboration:**
   Candidate noise-inconsistency regions should be correlated with other independent modalities (e.g. `RESAMPLING`, `BLOCKING-ARTIFACT`, `JPEG-GHOST`, or `COLOR-CHANNEL`) before drawing forensic conclusions.

---

## 8. Scientific References
1. **Pan, X., Zhang, X., Lyu, S.** (2012). *Exposing Digital Forgeries with Inconsistent Local Noise Levels.* IEEE Transactions on Information Forensics and Security, 7(3), 1028–1040.
2. **Mahdian, B., Saic, S.** (2009). *Using Noise Inconsistencies for Blind Image Forensics.* Image and Vision Computing, 27(10), 1497–1503.
3. **Lyu, S., Rockmore, D., Farid, H.** (2014). *Statistical Modeling of Noise Residuals for Digital Image Forensics.* IEEE Transactions on Signal Processing, 62(12), 3120–3131.
