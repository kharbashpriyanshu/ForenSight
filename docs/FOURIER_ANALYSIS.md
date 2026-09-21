# ForenSight V4 — Fourier 2D Frequency Spectrum Forensics

## 1. Purpose
The `FOURIER` engine transforms image luminance into the 2D spatial frequency domain using the Fast Fourier Transform (FFT). It evaluates global spectral energy distribution across low, mid, and high frequency bands, calculates spectral entropy, and isolates discrete periodic harmonic spikes. In forensic investigations, periodic frequency peaks expose affine resampling, interpolation periodicities, screen halftoning, regular texture repetition, and periodic sensor filter array artifacts.

---

## 2. Mathematical Basis

### A. 2D Discrete Fourier Transform (2D DFT)
For a luminance image $I(x, y)$ of size $M \times N$:
$$F(u, v) = \sum_{x=0}^{M-1} \sum_{y=0}^{N-1} I(x, y) e^{-j 2\pi \left(\frac{ux}{M} + \frac{vy}{N}\right)}$$
where $u \in [0, M-1]$ and $v \in [0, N-1]$ denote spatial frequencies.

### B. Centered Magnitude & Power Spectrum
The zero-frequency component $(0, 0)$ is shifted to the spatial center $(M/2, N/2)$ via `fftshift`:
$$|F(u, v)| = \sqrt{\text{Re}(F(u, v))^2 + \text{Im}(F(u, v))^2}$$
$$P(u, v) = |F(u, v)|^2$$
Log-scaled magnitude for human perception and dynamic range compression:
$$L(u, v) = \ln(1 + |F(u, v)|)$$

### C. Radial Frequency Band Energy Partitioning
Normalized radial distance from DC center $(c_y, c_x)$:
$$r_{\text{norm}}(u, v) = \frac{\sqrt{(u - c_x)^2 + (v - c_y)^2}}{\sqrt{c_x^2 + c_y^2}} \in [0.0, 1.0]$$
Energy is partitioned into three concentric frequency bands:
- **Low Band:** $r_{\text{norm}} \in [0.0, 0.15]$ (macroscopic scene brightness and fundamental structures)
- **Mid Band:** $r_{\text{norm}} \in (0.15, 0.50]$ (object boundaries and prominent textures)
- **High Band:** $r_{\text{norm}} \in (0.50, 1.0]$ (fine textures, edge transitions, sensor noise floor)

Band energy ratios:
$$e_{\text{band}} = \frac{\sum_{(u, v) \in \text{band}} P(u, v)}{\sum_{u, v} P(u, v)}$$

### D. Spectral Entropy
Measures frequency domain energy dispersion:
$$\mathcal{H}_{\text{spectral}} = -\sum_{u, v, p(u, v)>0} p(u, v) \log_2 p(u, v), \quad p(u, v) = \frac{P(u, v)}{\sum P}$$

### E. Dominant Periodic Peak Detection
1. The central DC neighborhood ($r_{\text{norm}} < 0.03$) is masked out to eliminate fundamental illumination bias.
2. Background spectral energy $L_{\text{bg}}(u, v)$ is estimated via Gaussian smoothing ($\sigma = 5.0$).
3. Prominence difference $D(u, v) = L(u, v) - L_{\text{bg}}(u, v)$ is evaluated against the residual background standard deviation:
   $$D(u, v) \ge \mu_D + k \cdot \sigma_D \quad (k \ge 3.0)$$
4. Peaks are extracted using local $5 \times 5$ morphological dilation maxima filtering.

---

## 3. Exact Implementation
Implemented in `FourierEngine`:
1. Validates format compatibility and image dimensions.
2. Converts input to float32 grayscale luminance.
3. Bounded transform sizing: if $\max(M, N) > 2048$, bilinearly downsamples to cap execution time and memory allocation strictly within $\mathcal{O}(N \log N)$ bounds.
4. Executes 2D FFT and centers DC with `np.fft.fftshift`.
5. Partitions radial band energies (low, mid, high) and computes spectral entropy.
6. Isolates dominant periodic harmonic peaks with coordinates $(u, v)$, radial frequency distance, orientation angle, magnitude, and prominence $\sigma$.
7. Generates artifacts:
   - `fourier_spectrum.png`: Annotated 2D log magnitude spectrum with radial band rings and circled periodic peaks alongside radial bar charts.
   - `fourier_analysis.json`: Numerical spectral energy ratios, entropy, and peak coordinates list.

---

## 4. Parameters
| Parameter | Type | Default | Range | Description |
|---|---|---|---|---|
| `max_transform_dimension` | integer | 2048 | [256, 4096] | Maximum dimension bound for FFT computation |
| `peak_prominence_sigma` | float | 3.0 | [1.5, 8.0] | Prominence cutoff in background standard deviations |
| `max_reported_peaks` | integer | 20 | [1, 100] | Maximum number of peaks to report |

---

## 5. Output Metrics
- `low_frequency_ratio`: Fraction of total power concentrated in radial band $[0, 0.15]$.
- `mid_frequency_ratio`: Fraction of total power concentrated in radial band $(0.15, 0.50]$.
- `high_frequency_ratio`: Fraction of total power concentrated in radial band $(0.50, 1.0]$.
- `spectral_entropy`: Dispersion entropy of normalized power spectrum.
- `dominant_peak_count`: Number of isolated non-DC periodic harmonic peaks.

---

## 6. Generated Artifacts
1. **`fourier_spectrum.png`**: Centered 2D log magnitude spectrum showing radial band boundaries and overlaid periodic peak locations, paired with fractional energy bar charts.
2. **`fourier_analysis.json`**: Energy ratios, transform dimensions, spectral entropy, and peak list with $(u, v)$ coordinates, orientation angles, and prominence.

---

## 7. Applicability
- **Supported Formats:** JPEG, JPG, PNG, WebP, TIFF.
- **Minimum Dimensions:** $32 \times 32$ pixels.
- **Multi-modal:** Operates on converted grayscale luminance.

---

## 8. Limitations & Forensic Guardrails
1. **Natural Periodicity:** Textiles, window blinds, brick facades, halftone printing screens, and repetitive geometric patterns naturally introduce strong periodic frequency spikes.
2. **JPEG Block Harmonics:** Lossy JPEG compression introduces characteristic grid harmonics at multiples of the 8-pixel block frequency along the horizontal and vertical axes.
3. **No Automatic Verdict:** A periodic frequency peak indicates spatial periodicity in the pixel grid; it does **NOT** by itself prove forgery or tampering.

---

## 9. Computational Complexity
- **Time Complexity:** $\mathcal{O}(N \log N)$ where $N = M \times N$. Capped by `max_transform_dimension` to ensure execution completes in $< 500\text{ ms}$.
- **Space Complexity:** $\mathcal{O}(N)$ complex64 array for transform storage.

---

## 10. Scientific References
- Popescu, A. C., & Farid, H. (2005). *Exposing Digital Forgeries by Detecting Traces of Resampling*. IEEE Transactions on Signal Processing, 53(2), 758–767.
- Gonzalez, R. C., & Woods, R. E. (2018). *Digital Image Processing* (4th ed.). Pearson.
- Bashar, M. K., Noda, K., Ohnishi, N., & Mori, K. (2010). *Detection of Copy-Move Forgery Using Discrete Fourier Transform*. IEEE International Conference on Image Processing (ICIP), 4385–4388.
