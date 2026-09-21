# ForenSight V4 — Dense Block-Based Copy-Move Clone Forensics

## 1. Purpose
The `CLONE-BLOCK` forensic engine detects duplicated image regions created by copy-move cloning operations using dense sliding-window spatial block decomposition and compact discrete cosine transform (2D DCT) descriptors. Unlike keypoint-based techniques that depend exclusively on high-contrast corner and edge gradients, block-based analysis evaluates dense overlapping patches across the entire image canvas. This provides superior sensitivity to cloned smooth or low-contrast regions (such as cloned sky, grass, water, or uniform wall surfaces) while enforcing spatial exclusion constraints and translation displacement vector clustering to prevent false associations on adjacent blocks.

---

## 2. Mathematical & Algorithmic Foundation

### A. Sliding-Window Block Decomposition
Let $I(x, y)$ denote the grayscale luminance channel of an input image of dimensions $W \times H$. A square spatial window of size $B \times B$ (default $16 \times 16$ pixels) is shifted across the image canvas with a step stride $s$ (default $8$ pixels):
$$\mathcal{B}_{(i, j)} = \{I(x + \Delta x, y + \Delta y) : 0 \le \Delta x < B, \; 0 \le \Delta y < B\}$$
where $(x, y) = (j \cdot s, i \cdot s)$.

For an image of dimensions $W \times H$, the total number of evaluated spatial blocks is:
$$N_{\text{blocks}} = \left\lfloor \frac{W - B}{s} + 1 \right\rfloor \times \left\lfloor \frac{H - B}{s} + 1 \right\rfloor$$

### B. Discrete Cosine Transform (2D DCT) Feature Extraction
To achieve compact descriptor representation and robustness to slight high-frequency variations, each spatial block is transformed using the 2D Discrete Cosine Transform:
$$D(u, v) = \alpha(u) \alpha(v) \sum_{x=0}^{B-1} \sum_{y=0}^{B-1} \mathcal{B}(x, y) \cos\left[\frac{\pi (2x + 1) u}{2B}\right] \cos\left[\frac{\pi (2y + 1) v}{2B}\right]$$
where:
$$\alpha(0) = \sqrt{\frac{1}{B}}, \quad \alpha(u) = \sqrt{\frac{2}{B}} \quad (u > 0)$$

Low-frequency AC coefficients ($u + v \le 4$, excluding DC $u=v=0$) are extracted into a compact 14-dimensional feature vector $\mathbf{f} \in \mathbb{R}^{14}$. Each vector is $L_2$-normalized:
$$\hat{\mathbf{f}} = \frac{\mathbf{f}}{\|\mathbf{f}\|_2 + \epsilon}$$

### C. Lexicographical Sorting & Spatial Exclusion
Following the foundational methodology of Fridrich, Soukal, and Lukas (2003):
1. **Lexicographical Ordering:** The matrix of normalized feature vectors $\mathbf{F} \in \mathbb{R}^{N \times 14}$ is sorted lexicographically. In a lexicographically sorted matrix, identical or highly similar feature descriptors appear in adjacent or proximate rows.
2. **Neighbor Search Window:** For each block $k$, candidates are evaluated across a local neighbor search window $w \in [1, W_{\text{search}}]$ (default depth $15$).
3. **Spatial Separation Constraint:** Candidate pairs $(p, q)$ located at coordinates $(x_p, y_p)$ and $(x_q, y_q)$ are discarded unless their Euclidean spatial distance satisfies:
   $$d_{\text{spatial}} = \sqrt{(x_p - x_q)^2 + (y_p - y_q)^2} \ge D_{\text{min}}$$
   (default $D_{\text{min}} = 32.0$ pixels), preventing self-matching of overlapping adjacent sliding windows.
4. **Cosine Similarity Threshold:** A candidate pair is retained if:
   $$\cos(\hat{\mathbf{f}}_p, \hat{\mathbf{f}}_q) = \hat{\mathbf{f}}_p \cdot \hat{\mathbf{f}}_q \ge \tau_{\text{sim}}$$
   (default $\tau_{\text{sim}} = 0.96$).

### D. Displacement Vector Clustering
True copy-move operations apply a consistent spatial shift $(\Delta x, \Delta y)$ across the cloned region. For each matched pair $(p, q)$ where $x_p \le x_q$:
$$\mathbf{v} = (x_q - x_p, \; y_q - y_p)$$
1. **Binning & Tolerance:** Displacement vectors are quantized into spatial bins of width $\delta_{\text{disp}}$ (default $12.0$ pixels).
2. **Cluster Threshold:** A candidate cloned region is confirmed only if its displacement bin contains at least $K_{\text{min}}$ supporting matched block pairs (default $3$).
3. **Bounding Box Synthesis:** For each confirmed cluster, source and target bounding boxes $[x_{\min}, y_{\min}, x_{\max}, y_{\max}]$ are synthesized enclosing the supporting block coordinates.

---

## 3. Parameters
| Parameter | Type | Default | Valid Range | Description |
|---|---|---|---|---|
| `block_size` | `int` | `16` | `[8, 64]` | Square spatial window dimension in pixels. |
| `stride` | `int` | `8` | `[4, 32]` | Step stride between adjacent sliding window blocks. |
| `min_spatial_distance` | `float` | `32.0` | `[8.0, 256.0]` | Minimum Euclidean pixel distance between matched block pairs. |
| `similarity_threshold` | `float` | `0.96` | `[0.80, 0.999]` | Minimum cosine similarity of normalized DCT feature vectors. |
| `min_cluster_size` | `int` | `3` | `[2, 50]` | Minimum supporting block pairs sharing a consistent displacement. |
| `displacement_tolerance` | `float` | `12.0` | `[1.0, 64.0]` | Spatial bin tolerance for grouping displacement vectors. |
| `search_window` | `int` | `15` | `[5, 50]` | Lexicographical neighbor search window depth. |
| `max_dimension` | `int` | `2048` | `[256, 4096]` | Maximum dimension before proportional downscaling. |

---

## 4. Input Requirements & Applicability
- **Supported Formats:** JPEG, PNG, WebP, TIFF.
- **Minimum Dimensions:** $32 \times 32$ pixels.
- **Color Spaces:** Decoded spatial RGB, Grayscale, RGBA.
- **Inapplicability Conditions:** Images with dimensions $< 32 \times 32$ or unsupported container formats return `NOT_APPLICABLE` with scientific explanation.
- **Proportional Scaling:** Images with $\max(W, H) > 2048$ are scaled down using area-averaging (`INTER_AREA`) for processing efficiency. Coordinates are mapped back to original dimensions, and original file bytes and SHA-256 hashes are strictly preserved.

---

## 5. Artifacts Produced
1. `clone_block_map.png` (`IMAGE`):
   Visual forensic overlay displaying detected block pairings connected by displacement lines, highlighted source/target bounding boxes, and active block centroids.
2. `clone_block_analysis.png` (`IMAGE`):
   Deterministic 3-panel diagnostic visualization:
   - Panel 1: Displacement cluster sizes and top displacement vectors.
   - Panel 2: Cosine similarity distribution histogram for candidate pairs.
   - Panel 3: Candidate duplicated regions summary table.
3. `clone_block_analysis.json` (`JSON`):
   Machine-readable record detailing total evaluated blocks, matched pairs count, displacement cluster bins, candidate bounding boxes, and execution metadata.

---

## 6. Normalized Observations
| Metric Name | Type | Value Representation | Direction | Interpretation |
|---|---|---|---|---|
| `BLOCK_MATCH_COUNT` | `int` | Raw count of matched pairs | `elevated` if $> 0$ else `informational` | Number of block pairs satisfying similarity and spatial separation constraints. |
| `MATCH_CLUSTER_COUNT` | `int` | Count of confirmed clusters | `elevated` if $> 0$ else `informational` | Number of coherent spatial displacement clusters. |
| `MAX_CLUSTER_SIZE` | `int` | Size of largest cluster | `elevated` if $\ge 3$ else `informational` | Maximum number of supporting block pairs sharing a common displacement vector. |
| `CANDIDATE_REGION_COUNT` | `int` | Number of candidate regions | `elevated` if $> 0$ else `informational` | Confirmed candidate cloned region pairs. |

---

## 7. Limitations & Scientific Caveats
1. **Computational Complexity with Dense Windows:** Exhaustive block comparison across very large images with small strides ($s \le 4$) scales with $\mathcal{O}(N \log N + N \cdot W_{\text{search}})$; downscaling above 2048px preserves tractability while maintaining sensitivity.
2. **Rotation & Scale Invariance:** Pure block-based translation clustering assumes near-zero rotation ($\Delta \theta \approx 0$) and uniform scale ($s \approx 1.0$). Cloned fragments subjected to significant rotation or scaling are analyzed complementary by `CLONE-KEYPOINT`.
3. **Repetitive Textures:** Highly repetitive textures (e.g. brick facades, textile patterns) produce recurring similar blocks; displacement vector clustering and spatial separation thresholds filter random pairings, but dense periodic patterns may require analyst review.
4. **Post-Processing Degradation:** Heavy recompression (JPEG $Q < 50$) or aggressive Gaussian smoothing attenuates high-frequency DCT coefficients, potentially diminishing similarity metrics.

---

## 8. References
1. Fridrich, J., Soukal, D., & Lukas, J. (2003). *Detection of Copy-Move Forgery in Digital Images*. Proceedings of the Digital Forensic Research Workshop (DFRWS).
2. Popescu, A. C., & Farid, H. (2004). *Exposing Digital Forgeries in Color Images*. IEEE Transactions on Signal Processing, 52(11), 3248-3257.
3. Christlein, V., Riess, C., Jordan, J., & Angelopoulou, E. (2012). *An Evaluation of Popular Copy-Move Forgery Detection Approaches*. IEEE Transactions on Information Forensics and Security, 7(6), 1841-1854.
