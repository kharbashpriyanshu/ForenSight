# ForenSight V4 — Keypoint-Based Geometric Copy-Move Clone Forensics

## 1. Purpose
The `CLONE-KEYPOINT` forensic engine detects copy-move image manipulations that involve geometric transformations such as affine rotation, scaling, and translation. While dense block-based matching (`CLONE-BLOCK`) is optimal for translation-only cloning across smooth or textureless regions, it is inherently sensitive to orientation and scale variations. The `CLONE-KEYPOINT` engine uses independent binary keypoint extraction (ORB), Hamming distance self-matching with spatial exclusion, Lowe's ratio test, and affine RANSAC (RANdom SAmple Consensus) geometric modeling to reliably identify duplicated fragments that have been rotated, resized, or translated into another portion of the image.

---

## 2. Mathematical & Algorithmic Foundation

### A. Deterministic Feature Extraction (ORB)
To ensure repeatable and rotation-invariant feature extraction without licensing encumbrances, Oriented FAST and Rotated BRIEF (ORB) (Rublee et al. 2011) is utilized with deterministic random seeding (`setRNGSeed(42)`):
1. **FAST Keypoint Detection:** Multi-scale corner candidates are detected across an 8-level image pyramid with scale factor $1.2$.
2. **Orientation Assignment:** Intensity centroid orientation $\theta$ is computed within each circular patch:
   $$m_{pq} = \sum_{x, y} x^p y^q I(x, y), \quad C = \left(\frac{m_{10}}{m_{00}}, \frac{m_{01}}{m_{00}}\right), \quad \theta = \operatorname{atan2}(m_{01}, m_{10})$$
3. **Rotated BRIEF Descriptors:** Binary descriptors $\mathbf{d} \in \{0, 1\}^{256}$ are steered by orientation $\theta$, producing 32-byte bitstrings invariant to in-plane rotation.

### B. Spatial-Exclusion Self-Matching & Lowe's Ratio Test
Keypoints from an image are compared against each other within the same image canvas:
1. **$k$-Nearest Neighbor Matching:** For each keypoint $i$ with descriptor $\mathbf{d}_i$, the Brute-Force Hamming matcher identifies nearest neighbors with Hamming distances:
   $$D_H(\mathbf{d}_i, \mathbf{d}_j) = \sum_{b=0}^{255} (\mathbf{d}_{i}[b] \oplus \mathbf{d}_{j}[b])$$
2. **Spatial Separation Constraint:** Candidate matches $(i, j)$ are rejected if their Euclidean distance in pixel space is less than $D_{\text{min}}$:
   $$\sqrt{(x_i - x_j)^2 + (y_i - y_j)^2} < D_{\text{min}}$$
   (default $D_{\text{min}} = 30.0$ pixels), eliminating self-matches and trivial local neighbor clusters.
3. **Lowe's Ratio Test:** Let $j_1$ be the closest spatially valid neighbor with distance $d_1$, and $j_2$ be the second closest spatially valid neighbor with distance $d_2$. The candidate match is accepted only if:
   $$\frac{d_1}{d_2} \le \tau_{\text{ratio}}$$
   (default $\tau_{\text{ratio}} = 0.75$), discarding ambiguous or repetitive texture matches.

### C. Affine RANSAC Geometric Consistency Modeling
Cloned fragments undergo an underlying geometric mapping $\mathbf{p}' = \mathbf{M} \mathbf{p}$. For planar rotation, uniform scaling, and translation, the partial affine transformation matrix is defined as:
$$\mathbf{M} = \begin{bmatrix} s \cos\theta & -s \sin\theta & t_x \\ s \sin\theta & s \cos\theta & t_y \end{bmatrix}$$
1. **Consensus Estimation:** Robust affine parameters are estimated using RANSAC with reprojection error threshold $\tau_{\text{reproj}}$ (default $5.0$ pixels) across $2000$ iterations:
   $$\|\mathbf{p}_j - \mathbf{M} \mathbf{p}_i\|_2 \le \tau_{\text{reproj}}$$
2. **Decomposition:**
   - Scale factor: $s = \sqrt{M_{00}^2 + M_{10}^2}$
   - Rotation angle: $\theta = \operatorname{atan2}(M_{10}, M_{00}) \times \frac{180}{\pi}$
   - Translation vector: $(t_x, t_y) = (M_{02}, M_{12})$
3. **Confirmation Criterion:** A candidate copy-move transformation is confirmed if the number of consensus inliers satisfies $N_{\text{inliers}} \ge K_{\text{min}}$ (default $4$).
4. **Bounding Box Formulation:** Convex enclosures for source and target inlier keypoint clusters are synthesized into bounding box coordinates $[x_{\min}, y_{\min}, x_{\max}, y_{\max}]$.

---

## 3. Parameters
| Parameter | Type | Default | Valid Range | Description |
|---|---|---|---|---|
| `max_features` | `int` | `1000` | `[100, 5000]` | Maximum number of ORB keypoints to extract. |
| `min_spatial_distance` | `float` | `30.0` | `[5.0, 200.0]` | Minimum Euclidean pixel distance between matched keypoints. |
| `ratio_threshold` | `float` | `0.75` | `[0.50, 0.95]` | Lowe's ratio test threshold on Hamming distances. |
| `min_inliers` | `int` | `4` | `[3, 50]` | Minimum geometric inliers required to confirm affine transformation. |
| `ransac_reproj_threshold` | `float` | `5.0` | `[1.0, 20.0]` | Maximum reprojection error for RANSAC consensus in pixels. |
| `max_dimension` | `int` | `2048` | `[256, 4096]` | Maximum dimension before proportional downscaling. |

---

## 4. Input Requirements & Applicability
- **Supported Formats:** JPEG, PNG, WebP, TIFF.
- **Minimum Dimensions:** $32 \times 32$ pixels.
- **Color Spaces:** Decoded RGB, Grayscale, RGBA.
- **Proportional Scaling:** Images exceeding $2048\text{px}$ along any axis are scaled down using area interpolation (`INTER_AREA`). Keypoint locations and bounding boxes are mapped back to original coordinates, and original files/hashes remain unchanged.

---

## 5. Artifacts Produced
1. `clone_keypoint_map.png` (`IMAGE`):
   Visual forensic overlay displaying detected keypoints, non-inlier candidate links (subtle gray), verified geometric inlier vectors (emerald/cyan), and source/target bounding boxes.
2. `clone_keypoint_analysis.png` (`IMAGE`):
   Deterministic 3-panel diagnostic visualization:
   - Panel 1: Keypoint matching funnel (raw keypoints $\to$ spatial candidates $\to$ ratio filtered $\to$ RANSAC inliers).
   - Panel 2: Geometric consensus meter and affine model parameters (scale, rotation, translation, mean error).
   - Panel 3: Candidate cloned regions table and inlier counts.
3. `clone_keypoint_analysis.json` (`JSON`):
   Machine-readable record containing keypoint metrics, filtered match counts, affine transformation matrix, residual errors, bounding box coordinates, and parameter configuration.

---

## 6. Normalized Observations
| Metric Name | Type | Value Representation | Direction | Interpretation |
|---|---|---|---|---|
| `KEYPOINT_COUNT` | `int` | Count of detected keypoints | `informational` | Total ORB features extracted across active gradient regions. |
| `RAW_MATCH_COUNT` | `int` | Count of spatial neighbors | `informational` | Keypoints possessing spatial neighbors beyond $D_{\text{min}}$. |
| `FILTERED_MATCH_COUNT` | `int` | Count of ratio-filtered pairs | `elevated` if inliers $\ge 4$ else `informational` | Match pairs passing Lowe's ratio test. |
| `GEOMETRIC_INLIER_COUNT` | `int` | Consensus inlier count | `elevated` if $\ge 4$ else `informational` | Keypoint pairings satisfying affine transformation consistency. |
| `GEOMETRIC_INLIER_RATIO` | `float` | Consensus inlier ratio $[0.0, 1.0]$ | `elevated` if inliers $\ge 4$ else `informational` | Ratio of confirmed inliers to filtered candidate pairs. |
| `CANDIDATE_REGION_COUNT` | `int` | Number of candidate regions | `elevated` if $> 0$ else `informational` | Confirmed candidate cloned region pairs. |

---

## 7. Limitations & Scientific Caveats
1. **Featureless Surfaces:** Smooth, low-gradient regions (e.g. clear sky, uniform paint) do not generate sufficient keypoints for geometric analysis; such regions are evaluated complementarily by `CLONE-BLOCK`.
2. **Non-Rigid Deformations:** The affine model captures rotation, uniform scaling, and translation. Highly non-rigid or elastic warping (e.g. liquid smear, non-affine morphing) may yield lower inlier counts.
3. **Severe Downsampling & Compression:** Heavy lossy recompression (JPEG $Q < 40$) degrades high-frequency FAST corner responses and descriptor stability.
4. **Natural Symmetry:** Bilateral architectural symmetry or reflections (e.g. water reflections) may yield affine consensus; forensic analysts must contextualize geometric inliers with physical scene layout.

---

## 8. References
1. Amerini, I., Ballan, L., Caldelli, R., Del Bimbo, A., & Serra, G. (2011). *A SIFT-Based Forensic Method for Copy-Move Attack Detection and Transformation Recovery*. IEEE Transactions on Information Forensics and Security, 6(3), 1099-1110.
2. Silva, E., Carvalho, T., Ferreira, A., & Rocha, A. (2015). *Going deeper into copy-move forgery detection: explore image telltales via multi-scale analysis and dense local features*. Journal of Visual Communication and Image Representation, 32, 275-286.
3. Rublee, E., Rabaud, V., Konolige, K., & Bradski, G. (2011). *ORB: An efficient alternative to SIFT or SURF*. Proceedings of the IEEE International Conference on Computer Vision (ICCV), 2564-2571.
