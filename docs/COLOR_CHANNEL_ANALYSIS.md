# ForenSight V4 — Color Channel Forensics

## 1. Purpose
The `COLOR-CHANNEL` engine evaluates spatial relationships, cross-channel Pearson correlations, and localized chromaticity discrepancies across Red ($R$), Green ($G$), and Blue ($B$) color bands. Composite splicing, localized hue/saturation retouches, or blending images from different sensor models frequently alter natural inter-channel dependencies, introducing measurable spatial color discrepancies.

---

## 2. Mathematical Basis

### A. Global Inter-Channel Pearson Correlation
For channel pairs $(X, Y) \in \{(R, G), (R, B), (G, B)\}$:
$$\rho(X, Y) = \frac{\sum_{i=1}^{N} (X_i - \mu_X)(Y_i - \mu_Y)}{\sqrt{\sum_{i=1}^{N} (X_i - \mu_X)^2} \sqrt{\sum_{i=1}^{N} (Y_i - \mu_Y)^2}}$$
Natural optical capture through color filter arrays (CFAs) typically maintains strong cross-channel correlation ($\rho \ge 0.85$) across broadband scene regions.

### B. Pixel-Level Difference Maps
$$D_{RG}(x, y) = |R(x, y) - G(x, y)|$$
$$D_{RB}(x, y) = |R(x, y) - B(x, y)|$$
$$D_{GB}(x, y) = |G(x, y) - B(x, y)|$$
$$D_{\text{composite}}(x, y) = \frac{1}{3} \left[ D_{RG}(x, y) + D_{RB}(x, y) + D_{GB}(x, y) \right]$$

### C. Normalized Chromaticity Coordinates
To eliminate luminance variation:
$$r(x, y) = \frac{R(x, y)}{R+G+B+\epsilon}, \quad g(x, y) = \frac{G(x, y)}{R+G+B+\epsilon}, \quad b(x, y) = \frac{B(x, y)}{R+G+B+\epsilon}$$

### D. Local Spatial Block Discrepancy & Z-Scoring
The image is partitioned into non-overlapping spatial blocks of size $S \times S$ (default: $16 \times 16$). For each block $b$:
$$\overline{D}(b) = \frac{1}{S^2} \sum_{(x, y) \in b} D_{\text{composite}}(x, y)$$
The spatial departure of block $b$ relative to host color variance is normalized via robust z-scoring:
$$Z(b) = \frac{\overline{D}(b) - \mu_{\overline{D}}}{\sigma_{\overline{D}} + \epsilon}$$

### E. Candidate Anomaly Region Clustering
Blocks exhibiting $|Z(b)| \ge \theta$ (default: $\theta = 2.5$) are flagged as candidate outliers. Contiguous anomalous blocks are clustered using 8-connectivity connected components into bounding boxes $(x, y, w, h)$.

---

## 3. Exact Implementation
Implemented in `ColorChannelEngine`:
1. Verifies input dimensions and raster compatibility.
2. Extracts float32 matrices for $R$, $G$, $B$, and calculates composite difference maps.
3. Computes the $3 \times 3$ global Pearson correlation matrix.
4. Performs block-based spatial channel deviation and z-score mapping.
5. Clusters contiguous outlier blocks meeting cluster size threshold into candidate bounding boxes.
6. Persists artifacts:
   - `color_channel_analysis.png`: R, G, B channel decompositions and normalized chromaticity map.
   - `color_channel_maps.png`: Spatial composite difference heatmap with overlaid candidate anomaly bounding boxes.
   - `color_channel_analysis.json`: Numerical statistics, correlation matrix, and candidate regions metadata.

---

## 4. Parameters
| Parameter | Type | Default | Range | Description |
|---|---|---|---|---|
| `block_size` | integer | 16 | [8, 64] | Spatial evaluation block dimension (pixels) |
| `z_score_threshold` | float | 2.5 | [1.0, 5.0] | Z-score cutoff for candidate outlier blocks |
| `min_cluster_blocks` | integer | 4 | [1, 64] | Minimum contiguous blocks to form a candidate region |
| `max_dimension` | integer | 4096 | [256, 8192] | Dimension limit for bounded resource safety |

---

## 5. Output Metrics
- `corr_rg`: Global Pearson correlation coefficient between Red and Green channels.
- `corr_rb`: Global Pearson correlation coefficient between Red and Blue channels.
- `corr_gb`: Global Pearson correlation coefficient between Green and Blue channels.
- `mean_diff_composite`: Average pixel-wise composite channel difference.
- `candidate_region_count`: Number of clustered anomalous spatial regions.

---

## 6. Generated Artifacts
1. **`color_channel_analysis.png`**: Isolated Red, Green, and Blue intensity maps alongside normalized $(r, g, b)$ chromaticity.
2. **`color_channel_maps.png`**: Composite channel difference heatmap and block z-score map displaying clustered candidate bounding boxes.
3. **`color_channel_analysis.json`**: Global correlation metrics, moments, candidate bounding boxes, and execution parameters.

---

## 7. Applicability
- **Supported Formats:** JPEG, JPG, PNG, WebP, TIFF.
- **Minimum Dimensions:** $32 \times 32$ pixels.
- **Requirement:** Color image (RGB). Grayscale images are gracefully handled with identity correlation.

---

## 8. Limitations & Forensic Guardrails
1. **Vivid Saturated Objects:** Naturally saturated scene elements (bright red clothing, blue sky, green grass) produce high localized channel differences without forgery.
2. **Optical Vignetting & Chromatic Aberration:** Camera lenses introduce natural radial color fringing towards image borders.
3. **Analyst Review Required:** Candidate regions represent statistical divergence in inter-channel relationships, **NOT** proof of intentional manipulation.

---

## 9. Computational Complexity
- **Time Complexity:** $\mathcal{O}(N)$ where $N = W \times H$. Block analysis and connected components operate in linear time.
- **Space Complexity:** $\mathcal{O}(N)$ for difference matrices and downscaled block grids.

---

## 10. Scientific References
- Ng, T. T., Chang, S. F., & Hsu, J. (2005). *Image Splicing Detection Using Inter-Scale and Inter-Channel Dependencies*. IEEE International Conference on Image Processing (ICIP).
- Riess, C., & Angelopoulou, E. (2010). *Exposing Digital Forgeries from Inconsistent Color Illuminant*. ACM Multimedia and Security Workshop, 15–24.
- Carvalho, T., Riess, C., Angelopoulou, E., Pedrini, H., & de Rocha, A. (2013). *Detecting Photographic Composites of People using Color Inconsistencies*. IEEE Transactions on Information Forensics and Security, 8(12), 2064–2077.
