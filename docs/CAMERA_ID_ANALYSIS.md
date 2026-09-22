# ForenSight V4 — Camera Hardware Identification (CAMERA-ID) Forensics

## 1. Purpose
The `CAMERA-ID` forensic engine attributes evidence imagery to specific physical source camera devices by comparing extracted PRNU sensor noise residuals against case-scoped camera reference fingerprints. Using 2D circular cross-correlation surfaces and Peak-to-Correlation Energy (PCE) statistical thresholding (Chen et al. 2008, Goljan et al. 2009), the engine measures sensor alignment, identifies the highest-matching candidate reference, calculates confidence intervals and candidate separation gaps, and provides rigorous forensic documentation for provenance determination.

---

## 2. Mathematical & Algorithmic Foundation

### A. 2D Circular Normalized Cross-Correlation Surface
Given a zero-mean query noise residual $W \in \mathbb{R}^{H \times W}$ and a zero-mean camera reference fingerprint $K \in \mathbb{R}^{H \times W}$:
1. Compute 2D Fast Fourier Transforms:
   $$\hat{W} = \mathcal{F}_{2D}(W), \quad \hat{K} = \mathcal{F}_{2D}(K)$$
2. Compute cross-spectral power and inverse 2D FFT:
   $$C(u, v) = \frac{\text{Re}\left(\mathcal{F}_{2D}^{-1}\big(\hat{W} \odot \hat{K}^*\big)\right)}{\|W\|_2 \cdot \|K\|_2 + \epsilon}$$
3. Center the zero-shift coordinate via `fftshift`:
   $$C_{\text{centered}} = \text{fftshift}(C)$$
4. Locate the maximum cross-correlation peak:
   $$(u_{\max}, v_{\max}) = \arg\max_{(u, v)} |C_{\text{centered}}(u, v)|$$
   $$C_{\max} = C_{\text{centered}}(u_{\max}, v_{\max})$$
   $$\text{Spatial Offset } (\Delta y, \Delta x) = (u_{\max} - H/2, v_{\max} - W/2)$$

### B. Peak-to-Correlation Energy (PCE)
While raw correlation $C_{\max}$ can be biased by scene textures and compression artifacts, Peak-to-Correlation Energy (PCE) evaluates the sharpness and statistical significance of the peak relative to surrounding non-peak noise (Chen et al. 2008):
$$\text{PCE} = \frac{C_{\max}^2}{\frac{1}{N - |\mathcal{N}_{\text{peak}}|} \sum_{(x, y) \notin \mathcal{N}_{\text{peak}}} C_{\text{centered}}(x, y)^2}$$
where:
- $N = H \cdot W$ is the total number of pixels in the correlation surface.
- $\mathcal{N}_{\text{peak}}$ is a square exclusion neighborhood of size $(2r + 1) \times (2r + 1)$ (typically $r = 5$, giving an $11 \times 11$ exclusion area around $(u_{\max}, v_{\max})$).

### C. Attribution Classification Rules
The engine classifies each candidate reference fingerprint using rigorous scientific criteria:
1. **`CONSISTENT`**:
   - $\text{PCE} \ge \text{PCE}_{\text{threshold}}$ (default $\ge 50.0$)
   - $C_{\max} \ge \text{Corr}_{\text{threshold}}$ (default $\ge 0.015$)
   - Suitability Index $\ge \text{MinSuitability}$ (default $\ge 0.20$)
   - Confidence: `HIGH` if $\text{PCE} \ge 100.0$, otherwise `MEDIUM`.
2. **`INCONCLUSIVE`**:
   - $\text{PCE} \ge 25.0$ or $C_{\max} \ge 0.010$, but criteria for `CONSISTENT` are not fully met (or suitability $< 0.20$).
   - Confidence: `LOW`.
3. **`INCONSISTENT`**:
   - $\text{PCE} < 25.0$ and $C_{\max} < 0.010$. No statistically significant correlation observed.
   - Confidence: `NONE`.
4. **`NOT_ESTIMATED`**:
   - No camera reference fingerprints are registered in the active case library.

### D. Multi-Candidate Ranking & PCE Gap
When multiple candidate devices are evaluated, candidate scores are sorted by PCE descending. The discriminability margin between the top candidate and the second-place runner-up is computed:
$$\Delta \text{PCE} = \text{PCE}_{\text{rank 1}} - \text{PCE}_{\text{rank 2}}$$
A large $\Delta \text{PCE} \ge 30.0$ strongly isolates the primary candidate from cross-device false correlations.

---

## 3. Parameters
| Parameter | Type | Default | Range | Description |
|---|---|---|---|---|
| `correlation_threshold` | `float` | `0.015` | `0.001`–`0.50` | Minimum cross-correlation peak height for consistency. |
| `pce_threshold` | `float` | `50.0` | `10.0`–`500.0` | Standard Peak-to-Correlation Energy decision threshold (Chen et al. 2008). |
| `min_suitability` | `float` | `0.20` | `0.0`–`1.0` | Minimum PRNU suitability index required for conclusive comparison. |
| `target_reference_id` | `string` | `null` | String ID | Optional specific reference ID to test; if omitted, all case references are evaluated. |

---

## 4. Output Artifacts
| Artifact Filename | Type | Description |
|---|---|---|
| `camera_id_analysis.png` | `PLOT` | 2-panel diagnostic visualization: 2D cross-correlation peak surface and candidate ranking bar chart with PCE threshold line. |
| `camera_id_comparison.png` | `VISUALIZATION` | Side-by-side visual alignment showing query residual $W$ and candidate reference fingerprint $K$. |
| `camera_id_analysis.json` | `JSON` | Complete machine-readable candidate leaderboard, offsets, PCE metrics, and findings. |

---

## 5. Normalized Observations
| Metric Name | Type | Range | Direction | Reliability | Description |
|---|---|---|---|---|---|
| `REFERENCE_COUNT` | `float` | $[0.0, \infty)$ | `informational` | `HIGH` | Total number of case camera references evaluated. |
| `MAX_CORRELATION` | `float` | $[0.0, 1.0]$ | `elevated` | `HIGH` | Peak cross-correlation value with top candidate. |
| `PCE` | `float` | $[0.0, \infty)$ | `elevated` | `HIGH` | Peak-to-Correlation Energy of top candidate. |
| `SECOND_BEST_CORRELATION` | `float` | $[0.0, 1.0]$ | `informational` | `HIGH` | Peak correlation of second-place candidate (or 0.0 if single reference). |
| `CORRELATION_GAP` | `float` | $[0.0, \infty)$ | `elevated` | `HIGH` | PCE margin between top and runner-up candidate. |
| `CANDIDATE_CAMERA_CONSISTENCY` | `float` | $[0.0, 1.0]$ | `elevated` | `HIGH` | Consistency indicator (1.0 = CONSISTENT, 0.5 = INCONCLUSIVE, 0.0 = INCONSISTENT / NOT_ESTIMATED). |
| `SUITABILITY_INDEX` | `float` | $[0.0, 1.0]$ | `informational` | `HIGH` | Query image PRNU suitability index. |

---

## 6. Scientific References
1. **Chen, M., Fridrich, J., Goljan, M., & Lukáš, J. (2008).** "Determining image origin and integrity using sensor noise." *IEEE Transactions on Information Forensics and Security*, 3(1), 74-90.
2. **Goljan, M., Fridrich, J., & Chen, M. (2009).** "Sensor noise camera identification: Countering device attacks." *Media Forensics and Security*, SPIE Vol. 7254, 72540I.
3. **Kang, X., Li, Y., Qu, Z., & Huang, J. (2012).** "Enhancing source camera identification performance with a new color decoupling method." *IEEE Transactions on Information Forensics and Security*, 7(4), 1093-1102.

---

## 7. Forensic Limitations & Guardrails
- **Spatial Alignment Prerequisite:** PRNU matching evaluates sensor pixel coordinate correspondence. Geometric operations (scaling, rotation, cropping) alter pixel alignment and reduce PCE unless resynchronized.
- **Reference Library Scope:** Attribution conclusions are strictly relative to the registered reference set ("highest measured correlation in this reference set").
- **No Pseudo-Certainty:** ForenSight prohibits statements such as "98% camera match" or "camera confirmed." Results are strictly reported as `CONSISTENT`, `INCONCLUSIVE`, or `INCONSISTENT` with measured PCE and correlation values.
