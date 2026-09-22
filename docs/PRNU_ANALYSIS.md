# ForenSight V4 — Photo-Response Non-Uniformity (PRNU) Sensor Pattern Forensics

## 1. Purpose
The `PRNU` forensic engine analyzes Photo-Response Non-Uniformity—an intrinsic, deterministic physical hardware fingerprint embedded in digital images by microscopic imperfections in silicon photosensors (Lukas et al. 2006, Chen et al. 2008). Every individual sensor exhibits tiny physical differences in light-to-charge conversion sensitivity across its pixel array. This pattern is temporally stable, unique to each individual camera body (even of the same make and model), and multiplicative with scene radiance. The `PRNU` engine extracts high-frequency sensor noise residuals, suppresses row/column sensor readout banding and demosaicing artifacts, calculates an empirical image suitability index, and optionally evaluates correlation against investigator-supplied reference fingerprints.

---

## 2. Mathematical & Algorithmic Foundation

### A. Physical Sensor Model
Under continuous illumination, pixel output $I(i, j)$ from a CMOS or CCD sensor can be modeled as:
$$I(i, j) = I^{(0)}(i, j) + I^{(0)}(i, j) \cdot K(i, j) + \Theta(i, j)$$
where:
- $I^{(0)}(i, j)$ is the noise-free optical scene radiance.
- $K(i, j)$ is the zero-mean PRNU multiplicative factor (typically standard deviation $\sigma_K \approx 0.005$ to $0.02$).
- $\Theta(i, j)$ represents additive noise components, including photon shot noise, readout noise, dark current, and quantization noise.

### B. Adaptive Noise Residual Extraction
To isolate the weak sensor pattern noise residual $W$ from prominent optical scene details, a Wiener-type adaptive local variance filter $F(I)$ is applied:
$$\mu(i, j) = \frac{1}{|N|} \sum_{(x, y) \in N} I(x, y)$$
$$\sigma^2(i, j) = \max\left(0, \frac{1}{|N|} \sum_{(x, y) \in N} I(x, y)^2 - \mu(i, j)^2\right)$$
$$F(I)(i, j) = \mu(i, j) + \frac{\max(0, \sigma^2(i, j) - \sigma_0^2)}{\max(\sigma^2(i, j), \sigma_0^2) + \epsilon} \cdot \big(I(i, j) - \mu(i, j)\big)$$
where $\sigma_0^2 = 9 \cdot \sigma_{\text{filter}}^2$ is the nominal additive noise variance baseline.
The raw sensor noise residual is:
$$W_{\text{raw}} = I - F(I)$$

### C. Zero-Mean Readout & Demodulation Normalization
Sensors, analog-to-digital converters, and color filter array (CFA) demosaicing interpolation introduce linear row and column artifacts (banding). To prevent artificial cross-correlation peaks from these non-PRNU artifacts:
1. Row means are subtracted:
   $$W'(i, j) = W_{\text{raw}}(i, j) - \frac{1}{W} \sum_{c=0}^{W-1} W_{\text{raw}}(i, c)$$
2. Column means are subtracted:
   $$W''(i, j) = W'(i, j) - \frac{1}{H} \sum_{r=0}^{H-1} W'(r, j)$$
3. Global mean is subtracted:
   $$W(i, j) = W''(i, j) - \bar{W}''$$

### D. Empirical Suitability Screening
PRNU detection sensitivity depends strongly on dynamic range and absence of saturation. Saturated pixels (0 or 255 in 8-bit scale) fail to capture multiplicative variations:
1. **Saturation Penalty:**
   $$R_{\text{sat}} = \frac{|\{p : I(p) \le 5 \text{ or } I(p) \ge 250\}|}{H \cdot W}$$
   $$f_{\text{sat}} = \max(0.0, 1.0 - 2.0 \cdot R_{\text{sat}})$$
2. **Dynamic Range Factor:**
   $$f_{\text{dr}} = \min\left(1.0, \frac{\max(I) - \min(I)}{128.0}\right)$$
3. **Residual Variance Factor:**
   $$f_{\text{var}} = \min\left(1.0, \frac{\text{Var}(W)}{0.50}\right)$$
4. **Suitability Index:**
   $$\mathcal{S} = 0.50 \cdot f_{\text{sat}} + 0.30 \cdot f_{\text{dr}} + 0.20 \cdot f_{\text{var}} \in [0.0, 1.0]$$
   - $\mathcal{S} \ge 0.50 \implies \text{SUITABLE}$
   - $0.25 \le \mathcal{S} < 0.50 \implies \text{MARGINAL}$
   - $\mathcal{S} < 0.25 \implies \text{UNSUITABLE}$

### E. Multi-Image MLE Reference Aggregation
When $M$ calibration images from the same camera device are available, the Maximum Likelihood Estimator (MLE) of the camera fingerprint $K$ is computed as:
$$K = \frac{\sum_{m=1}^M W_m \cdot I_m}{\sum_{m=1}^M I_m^2 + \epsilon}$$
Normalized to zero-mean and unit variance.

---

## 3. Parameters
| Parameter | Type | Default | Range | Description |
|---|---|---|---|---|
| `filter_window` | `int` | `5` | `3`–`15` (odd) | Spatial local variance estimation window size ($k \times k$). |
| `filter_sigma` | `float` | `1.5` | `0.5`–`5.0` | Assumed additive noise standard deviation for spatial adaptive filter. |
| `target_reference_id` | `string` | `null` | String ID | Optional case camera reference ID to correlate against. |

---

## 4. Output Artifacts
| Artifact Filename | Type | Description |
|---|---|---|
| `prnu_residual.png` | `VISUALIZATION` | Contrast-stretched normalized visualization of extracted noise residual $W$. |
| `prnu_analysis.png` | `PLOT` | 3-panel diagnostic plot: suitability metrics, amplitude histogram, and zero-mean profile. |
| `prnu_analysis.json` | `JSON` | Complete machine-readable suitability indices, parameters, and correlation status. |
| `prnu_fingerprint.png` | `VISUALIZATION` | (Optional) Stored reference fingerprint map when target reference is evaluated. |

---

## 5. Normalized Observations
| Metric Name | Type | Range | Direction | Reliability | Description |
|---|---|---|---|---|---|
| `PRNU_RESIDUAL_VARIANCE` | `float` | $[0.0, 1.0]$ | `informational` | `HIGH` | Sample variance of zero-mean normalized noise residual. |
| `PRNU_RESIDUAL_ENERGY` | `float` | $[0.0, 1.0]$ | `informational` | `HIGH` | Mean squared energy $\frac{1}{N} \sum W^2$. |
| `PRNU_SUITABILITY_INDEX` | `float` | $[0.0, 1.0]$ | `elevated` | `HIGH` | Empirical reliability index evaluating saturation and dynamic range. |
| `PRNU_MATCH_STATUS` | `string` | N/A | `informational` | `HIGH` | Attribution status: `NOT_ESTIMATED`, `CONSISTENT`, `INCONSISTENT`, or `INCONCLUSIVE`. |
| `PRNU_CORRELATION` | `float` | $[0.0, 1.0]$ | `elevated` | `HIGH` | Normalized cross-correlation coefficient against reference fingerprint. |

---

## 6. Scientific References
1. **Lukas, J., Goljan, M., & Fridrich, J. (2006).** "Digital camera identification from sensor pattern noise." *IEEE Transactions on Information Forensics and Security*, 1(2), 205-214.
2. **Chen, M., Fridrich, J., Goljan, M., & Lukáš, J. (2008).** "Determining image origin and integrity using sensor noise." *IEEE Transactions on Information Forensics and Security*, 3(1), 74-90.
3. **Goljan, M., Fridrich, J., & Chen, M. (2009).** "Sensor fingerprint approach to digital camera identification and forgery detection." *Proceedings of SPIE*, Vol. 7254, 72540I.

---

## 7. Forensic Limitations & Guardrails
- **Reference Dependency:** PRNU residual extraction evaluates sensor noise suitability; physical device attribution strictly requires comparing against verified camera reference fingerprints.
- **Compression Attenuation:** Aggressive lossy JPEG compression ($Q < 60$) quantizes away weak high-frequency sensor noise residuals.
- **Geometric Invariance:** PRNU patterns assume pixel grid alignment. Scaled, rotated, or cropped imagery requires geometric resynchronization before comparison.
- **Qualified Language:** ForenSight reports attribution results using objective scientific terminology (`CONSISTENT`, `INCONCLUSIVE`, `NOT_ESTIMATED`) and never asserts absolute proof or fake match percentages.
