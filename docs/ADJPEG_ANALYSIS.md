# Aligned Double JPEG Compression Analysis Engine Specification

**Engine ID:** `ADJPEG`  
**Version:** 1.0.0  
**Category:** `GLOBAL_ANALYSIS`  
**Classification:** Analytical Frequency Domain / Double Quantization Forensics  

---

## 1. Scientific Overview & Theoretical Foundation

When an image is compressed as JPEG twice with identical $8 \times 8$ grid alignment, its Discrete Cosine Transform (DCT) coefficients undergo double quantization.

Let $c$ denote an unquantized DCT coefficient, and $q_1, q_2$ denote the first and second quantization step sizes for a specific frequency mode $(u, v)$. In single compression:
$$c' = \left[ \frac{c}{q_2} \right] \cdot q_2$$
The histogram of dequantized or integer DCT coefficients exhibits a smooth, approximately Laplacian or generalized Gaussian distribution centered at zero.

In double compression, the coefficient has already been quantized by $q_1$ before subsequent quantization by $q_2$:
$$c'' = \left[ \frac{\left[ \frac{c}{q_1} \right] q_1}{q_2} \right]$$
When $q_1 \neq q_2$, this mapping is non-bijective. Certain bins in the histogram of $c''$ receive contributions from multiple bins of the original quantization, while adjacent bins receive fewer or zero contributions. This creates a periodic comb-like oscillation (double quantization artifact) in the coefficient histogram.

The period of this modulation is approximately:
$$T \approx \frac{q_1}{\gcd(q_1, q_2)} \quad \text{or} \quad \frac{q_1}{q_2}$$
By computing the Fourier transform (FFT) of the DCT coefficient histogram, this periodic modulation manifests as a distinct peak at frequency $f = 1/T$ in the Fourier magnitude spectrum.

---

## 2. Mathematical Formulation

1. **Grid Block Partitioning & Forward DCT**:
   For the luminance ($Y$) channel of the input image, partition into non-overlapping $8 \times 8$ pixel blocks $B_{r,c}$. For each block, compute the 2D Discrete Cosine Transform:
   $$D_{r,c} = \text{cv2.dct}(B_{r,c} - 128)$$

2. **Selected AC Frequency Modes**:
   Evaluate the 8 primary low-to-mid AC frequency modes most sensitive to quantization artifacts:
   $$\mathcal{M} = \{(0, 1), (1, 0), (2, 0), (1, 1), (0, 2), (2, 1), (1, 2), (3, 0)\}$$

3. **Histogram Estimation**:
   For each mode $(u, v) \in \mathcal{M}$, aggregate all block coefficients into an integer histogram $H(k)$ over range $k \in [-R, +R]$ (default $R = 50$, 101 bins):
   $$H(k) = \sum_{r, c} \mathbb{I}\left( \text{round}(D_{r,c}(u, v)) = k \right)$$

4. **Fourier Periodicity Analysis**:
   Remove DC bias and window the histogram to mitigate edge discontinuity effects:
   $$h(k) = H(k) - \text{Smooth}(H(k))$$
   Compute the 1D real Fast Fourier Transform:
   $$S(f) = |\text{np.fft.rfft}(h)|$$
   Excluding the immediate DC proximity ($f < f_{\min}$), identify the maximal spectral peak:
   $$P_{\max} = \max_{f \ge f_{\min}} S(f)$$
   Compute the periodicity peak ratio relative to the spectral noise floor (median magnitude):
   $$\rho(u, v) = \frac{P_{\max}}{\text{Median}(S) + \epsilon}$$

5. **Double Quantization Assessment**:
   A frequency mode is flagged as exhibiting double quantization periodicity if $\rho(u, v) > \tau$ (default $\tau = 2.5$). If multiple modes exhibit elevated peak ratios, the image is classified as consistent with aligned double JPEG compression.

---

## 3. Engine Parameters

| Parameter | Type | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- |
| `hist_range` | `int` | 50 | 20..200 | Half-range $R$ for DCT coefficient histogram construction. |
| `periodicity_threshold` | `float` | 2.5 | 1.5..10.0 | Peak-to-floor ratio threshold for periodic artifact detection. |
| `min_blocks` | `int` | 64 | 16..1000 | Minimum required $8 \times 8$ blocks for statistical validity. |
| `max_dimension` | `int` | 2048 | 256..4096 | Maximum dimension constraint for performance preservation. |

---

## 4. Observations & Structured Findings

### Normalized Observation Output
- **`observation_type`**: `ADJPEG`
- **`metric_name`**: `PERIODICITY_STRENGTH`
- **`raw_value`**: Maximal periodicity peak ratio string (e.g. `"3.45"`)
- **`normalized_value`**: Continuous anomaly score $[0.0, 1.0]$ normalized by calibration scale
- **`direction`**: `anomalous` if periodic modes exceed threshold; otherwise `nominal`

### Structured Findings Schema
```json
{
  "has_aligned_double_jpeg_traces": true,
  "periodic_modes_count": 3,
  "max_periodicity_ratio": 3.452,
  "total_blocks": 16384,
  "mode_evaluations": [
    {
      "mode": "(1,0)",
      "periodicity_ratio": 3.452,
      "peak_frequency": 0.25,
      "estimated_period": 4.0,
      "is_periodic": true
    },
    {
      "mode": "(0,1)",
      "periodicity_ratio": 1.18,
      "peak_frequency": 0.12,
      "estimated_period": 8.33,
      "is_periodic": false
    }
  ],
  "artifacts": {
    "adjpeg_spectrum": "analyses/adjpeg/adjpeg_spectrum_1.png",
    "adjpeg_data": "analyses/adjpeg/adjpeg_analysis_1.json"
  }
}
```

---

## 5. Diagnostic Artifact Descriptions

1. **`adjpeg_spectrum.png`**: Clean 2-panel diagnostic chart (640x320 px):
   - **Left Panel**: Integer DCT coefficient histogram for the primary frequency mode $(u^*, v^*)$ showing comb-like bin modulation.
   - **Right Panel**: Magnitude spectrum $|S(f)|$ highlighting the primary periodicity peak and baseline threshold.
2. **`adjpeg_analysis.json`**: Complete numerical mode evaluation table, spectral bins, parameters, and forensic provenance metadata.

---

## 6. Scientific Limitations & Failure Modes

1. **Quality Factor Ordering ($q_1 \gg q_2$)**: If the secondary compression is dramatically coarser than the first (e.g., $q_1 = 95, q_2 = 40$), the coarse secondary quantization obliterates the finer primary quantization grid, eliminating detectable histogram periodicity.
2. **Identical Quality Compression ($q_1 = q_2$)**: If the exact same quantization table is applied to an already-quantized grid without spatial modification, coefficients fall directly into the center of existing bins, leaving no periodic comb structure.
3. **Small or Smooth Images**: Images with fewer than 64 non-flat $8 \times 8$ blocks lack sufficient statistical support for histogram FFT analysis.
4. **Spatial Cropping / Grid Shift**: If an image is cropped by a non-multiple of 8 pixels, the $8 \times 8$ DCT grid shifts, transitioning the phenomenon from Aligned (ADJPEG) to Non-Aligned Double JPEG (NADJPEG).

---

## 7. Scientific References

1. Lukáš, J., & Fridrich, J. (2003). *Estimation of Primary Quantization Matrix in Double Compressed JPEG Images*. Digital Forensic Research Workshop (DFRWS).
2. Popescu, A. C., & Farid, H. (2004). *Statistical Tools for Digital Image Forensics: Exposing Digital Forgeries in JPEG Images*. IEEE Transactions on Information Forensics and Security.
3. Bianchi, T., & Piva, A. (2011). *Detection of Nonaligned Double JPEG Compression with Application to Image Tampering Detection*. IEEE Transactions on Information Forensics and Security, 7(2), 842–848.
