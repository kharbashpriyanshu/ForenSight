# ForenSight V4 — Resampling & Periodic Interpolation Forensics

## 1. Purpose
The `RESAMPLING` forensic engine detects periodic interpolation traces and directional derivative correlations introduced by geometric transformations, including digital upscaling, downscaling, affine rotation, and shearing. When an image or spliced fragment is scaled or rotated to fit into a composited scene, spatial interpolation (e.g. bilinear, bicubic, Lanczos) generates periodic dependencies among adjacent pixel samples (Popescu & Farid 2005). The `RESAMPLING` engine evaluates horizontal and vertical second-order spatial derivative spectra to isolate dominant interpolation periods, computes directional asymmetry, and performs block-level curvature consistency mapping to identify candidate resampling-consistent regions.

---

## 2. Mathematical & Algorithmic Foundation

### A. Interpolation Model & Periodic Dependencies
Consider a 1D continuous signal $s(t)$ sampled at integer intervals $t = k$. When resampled to a new sampling grid $t' = k \cdot \alpha$ with scaling factor $\alpha$:
Each resampled point $y[n]$ is synthesized as a weighted linear combination of neighboring samples $x[k]$ via an interpolation kernel $h(t)$:
$$y[n] = \sum_{k} x[k] \cdot h(n\alpha - k)$$
Because the relative fractional distance $(n\alpha \bmod 1)$ between the new sample positions and the original grid is periodic with spatial period $T = \frac{p}{\gcd(p, q)}$ (where $\alpha = p/q$), the linear predictor error and the spatial differences exhibit periodic variance and sample correlations (Popescu & Farid 2005; Mahdian & Saic 2008).

### B. Directional Second Derivative Filtering
To suppress macroscopic scene content and isolate high-frequency interpolation dependencies, directional second-difference filters are applied:
- **Horizontal Second Derivative ($D_{xx}$):**
  $$D_{xx}(x, y) = I(x + 1, y) - 2I(x, y) + I(x - 1, y)$$
  Implemented via convolution kernel $K_{xx} = [1, -2, 1]$.
- **Vertical Second Derivative ($D_{yy}$):**
  $$D_{yy}(x, y) = I(x, y + 1) - 2I(x, y) + I(x, y - 1)$$
  Implemented via convolution kernel $K_{yy} = [1, -2, 1]^T$.

Symmetric reflect padding (`BORDER_REFLECT_101`) is applied at image boundaries to prevent edge step artifacts.

### C. 1D Spectral Periodicity Analysis
For horizontal analysis ($D_{xx}$), each row $y$ is transformed via 1D real-to-complex FFT:
$$F_y(f) = \sum_{x=0}^{W-1} D_{xx}(x, y) e^{-j 2\pi f x / W}, \quad f \in [0, W/2]$$
The average power spectrum is obtained by averaging across all rows:
$$P_H(f) = \frac{1}{H} \sum_{y=0}^{H-1} |F_y(f)|^2$$
An identical calculation along image columns yields the vertical average power spectrum $P_V(f)$.

### D. Peak Period & Strength Estimation
1. **Search Band:** Spatial periods $T \in [T_{\min}, T_{\max}]$ ($[1.5, 8.0]$ pixels by default) map to frequency interval:
   $$f_{\min} = \frac{1}{T_{\max}}, \quad f_{\max} = \min\left(0.5, \frac{1}{T_{\min}}\right)$$
2. **Baseline Floor:** The median spectral power within the valid frequency band is computed as the robust noise floor:
   $$P_{\text{baseline}} = \text{median}\Big(\{P(f) : f \in [f_{\min}, f_{\max}]\}\Big)$$
3. **Peak Extraction:**
   $$f^* = \arg\max_{f \in [f_{\min}, f_{\max}]} P(f), \quad T^* = \frac{1}{f^*}$$
   $$\text{Peak Strength} = \frac{P(f^*)}{P_{\text{baseline}}}$$

### E. Directional Asymmetry
Geometric operations that scale along one axis more than the other (e.g. non-uniform scaling or horizontal stretching) produce directional discrepancy:
$$\mathcal{A}_{\text{dir}} = \frac{|S_H - S_V|}{S_H + S_V + \epsilon}$$
where $S_H$ and $S_V$ denote horizontal and vertical peak strength ratios.

### F. Local Spatial Block Consistency Mapping
1. **Curvature Energy Ratio:** In resampled regions, the second-derivative curvature concentration relative to the first-derivative gradient is elevated. For each spatial block $b$:
   $$C_b = \frac{\sum_{(x, y) \in b} (D_{xx}^2 + D_{yy}^2)}{\sum_{(x, y) \in b} (\nabla_x^2 + \nabla_y^2 + \epsilon)}$$
   where $\nabla_x, \nabla_y$ are first-order Sobel spatial gradients.
2. **Robust z-Score:**
   $$z_b = \frac{C_b - \text{median}(\{C\})}{1.4826 \cdot \text{MAD}(\{C\}) + \epsilon}$$
3. **Clustering:** Blocks with $z_b \ge z_{\text{threshold}}$ ($2.5$ by default) are clustered via 8-connected component analysis to define candidate bounding boxes.

---

## 3. Parameters
| Parameter | Type | Default | Valid Range | Description |
|---|---|---|---|---|
| `min_period` | float | 1.5 | [1.1, 10.0] | Minimum spatial period to evaluate (pixels) |
| `max_period` | float | 8.0 | [2.0, 20.0] | Maximum spatial period to evaluate (pixels) |
| `block_size` | integer | 32 | [8, 128] | Spatial block dimension for local resampling localization |
| `z_score_threshold` | float | 2.5 | [1.0, 5.0] | Robust z-score threshold for candidate anomaly detection |
| `min_cluster_blocks` | integer | 2 | [1, 50] | Minimum contiguous blocks to cluster into a candidate region |
| `max_dimension` | integer | 4096 | [256, 8192] | Maximum image dimension before safe proportional downsampling |

---

## 4. Generated Forensic Artifacts
1. **`resampling_map.png` (`ArtifactType.HEATMAP`):**
   Full-resolution spatial map of local curvature response using the Turbo colormap, with overlaid candidate resampling-consistent bounding boxes.
2. **`resampling_analysis.png` (`ArtifactType.PLOT`):**
   Two-panel deterministic diagnostic plot showing:
   - Panel 1: Horizontal derivative power spectrum ($D_{xx}$) on log scale, baseline floor, search band boundaries, and peak marker.
   - Panel 2: Vertical derivative power spectrum ($D_{yy}$) with peak frequency and period notation.
3. **`resampling_analysis.json` (`ArtifactType.JSON`):**
   Complete numerical dataset including evaluated frequency search bands, horizontal/vertical peak periods, peak strength ratios, directional asymmetry, and candidate bounding regions.

---

## 5. Normalized Observations
- `HORIZONTAL_PERIODICITY`: Detected candidate interpolation period in horizontal derivative spectrum (in pixels).
- `VERTICAL_PERIODICITY`: Detected candidate interpolation period in vertical derivative spectrum (in pixels).
- `DOMINANT_PERIOD`: Strongest candidate interpolation period across both coordinate axes.
- `PERIODICITY_PEAK_STRENGTH`: Ratio of dominant spectral peak power relative to median spectrum baseline.
- `RESAMPLING_CANDIDATE_REGION_COUNT`: Total count of clustered candidate resampling-consistent regions.

---

## 6. Applicability & Input Requirements
- **Supported Formats:** JPEG, PNG, WebP, TIFF.
- **Minimum Dimensions:** $16 \times 16$ pixels.
- **Color Spaces:** RGB, Grayscale, RGBA (converted to luminance float32 signal).
- **Execution Safety:** Non-inapplicable across supported image formats. Images exceeding `max_dimension` are downsampled proportionally with exact scale factor recorded in provenance metadata.

---

## 7. Forensic Interpretation Guidelines & Scientific Guardrails
1. **Periodic Signals Are Empirical Indicators:**
   A detected periodicity peak indicates that spatial derivatives exhibit repetitive sample dependencies. While characteristic of digital interpolation from scaling or rotation, periodicity alone does not constitute definitive proof of fraudulent alteration.
2. **Natural Sources of Periodicity:**
   - **Repetitive Textures:** Woven fabrics, window screens, architectural facades, brickwork, and railings naturally generate strong periodic frequency spikes.
   - **Optical Sensor Demosaicing:** Color Filter Arrays (CFA) such as Bayer patterns introduce subtle periodic interpolation traces during the camera's original raw development pipeline (Gallagher & Chen 2008).
   - **Halftone Printing / Scans:** Printed imagery scanned into digital format exhibits periodic halftone dot screen patterns.
3. **Multi-Modality Verification:**
   Resampling findings should be interpreted in conjunction with compression history (`ADJPEG`, `NADJPEG`, `JPEG-GHOST`), spatial blocking (`BLOCKING-ARTIFACT`), and noise residual consistency (`ADVANCED-NOISE`).

---

## 8. Scientific References
1. **Popescu, A. C., Farid, H.** (2005). *Exposing Digital Forgeries by Detecting Traces of Resampling.* IEEE Transactions on Signal Processing, 53(2), 758–767.
2. **Mahdian, B., Saic, S.** (2008). *Blind Authentication Using Periodic Properties of Interpolation.* Information Sciences, 178(23), 4520–4533.
3. **Gallagher, A. C., Chen, T.** (2008). *Image Authentication by Detecting Traces of Demosaicing.* IEEE Computer Vision and Pattern Recognition Workshops (CVPRW), 1–8.
