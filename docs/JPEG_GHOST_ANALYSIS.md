# JPEG Ghost Analysis Engine Specification

**Engine ID:** `JPEG-GHOST`  
**Version:** 1.0.0  
**Category:** `LOCAL_ANALYSIS`  
**Classification:** Analytical DIP / Compression History Forensics  

---

## 1. Scientific Overview & Theoretical Foundation

When an image containing an existing JPEG block structure is re-saved at a secondary JPEG quality factor $q_2$, or when a fragment extracted from an image compressed at quality $q_1$ is spliced into a host image saved at quality $q_2$, spatial recompression residuals vary systematically across the quality spectrum.

Farid (2009) established that if a JPEG image compressed at quality $q^*$ is iteratively recompressed across a range of test quality factors $q \in [q_{\min}, q_{\max}]$:
$$R_q(x, y) = |I(x, y) - I_q(x, y)|$$
the average difference between the input image and the recompressed version exhibits a pronounced local minimum at $q = q^*$ because quantizing coefficients already quantized at step size $Q(q^*)$ introduces minimal new quantization error when re-quantized with the same or multiple step size.

In spliced images where a localized region originates from an image compressed at $q_1$ while the remainder was compressed at $q_2 \neq q_1$, the residual difference in the spliced region drops significantly at $q = q_1$, appearing as a distinct "ghost" contrast anomaly against the surrounding background.

---

## 2. Mathematical Formulation

1. **Recompression Sweep**:
   For candidate quality levels $q \in \{q_{\min}, q_{\min} + \Delta q, \dots, q_{\max}\}$:
   $$I_q = \text{JPEGCompressDecompress}(I, q)$$
   Compute absolute pixel difference:
   $$D_q(x, y) = \frac{1}{3} \sum_{c \in \{R,G,B\}} |I_c(x, y) - I_{q,c}(x, y)|$$

2. **Spatial Block Averaging**:
   To isolate macroscopic regional differences from high-frequency pixel noise, the difference map is spatially averaged over $b \times b$ blocks (default $b = 16$):
   $$\bar{D}_q(B) = \frac{1}{b^2} \sum_{(x, y) \in B} D_q(x, y)$$

3. **Global Curve & Local Minima Detection**:
   The global mean residual is evaluated across the quality sweep:
   $$\mu(q) = \frac{1}{HW} \sum_{x=1}^W \sum_{y=1}^H D_q(x, y)$$
   Candidate qualities $q^*$ are identified where $\mu(q^* - \Delta q) > \mu(q^*) < \mu(q^* + \Delta q)$.

4. **Spatial Outlier Detection (Interquartile Range - IQR)**:
   For the best candidate quality $q^*$, spatial blocks with difference values significantly lower than the image median are flagged:
   $$\text{Threshold} = Q_1 - 1.5 \times \text{IQR}$$
   Contiguous clusters of candidate outlier blocks define candidate spliced regions with bounding boxes $[y_{\min}, x_{\min}, y_{\max}, x_{\max}]$.

---

## 3. Engine Parameters

| Parameter | Type | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- |
| `quality_min` | `int` | 50 | 1..99 | Minimum recompression quality sweep bound. |
| `quality_max` | `int` | 95 | 2..100 | Maximum recompression quality sweep bound ($q_{\max} > q_{\min}$). |
| `quality_step` | `int` | 5 | 1..25 | Increment between consecutive test recompressions. |
| `block_size` | `int` | 16 | 4..64 | Spatial block aggregation size for difference smoothing. |
| `max_dimension` | `int` | 1024 | 256..4096 | Maximum dimension constraint for performance preservation. |

---

## 4. Observations & Structured Findings

### Normalized Observation Output
- **`observation_type`**: `JPEG_GHOST`
- **`metric_name`**: `GHOST_CONTRAST_RATIO`
- **`raw_value`**: Candidate quality factor or contrast metric string
- **`normalized_value`**: Continuous anomaly score $[0.0, 1.0]$ based on IQR outlier spread
- **`direction`**: `anomalous` if localized candidate regions exist with substantial residual variance; otherwise `nominal`

### Structured Findings Schema
```json
{
  "candidate_quality": 75,
  "candidate_qualities": [75],
  "candidate_regions_count": 1,
  "candidate_regions": [
    {
      "bounding_box": [32, 48, 128, 160],
      "mean_difference": 1.42,
      "z_score": -2.85,
      "area_pixels": 10752
    }
  ],
  "quality_curve": [
    {"quality": 50, "mean_difference": 8.41, "min_difference": 2.1, "max_difference": 15.3, "is_local_minimum": false},
    {"quality": 75, "mean_difference": 2.15, "min_difference": 0.4, "max_difference": 6.8, "is_local_minimum": true}
  ],
  "global_statistics": {
    "median_difference": 3.82,
    "iqr": 2.14,
    "min_mean_difference": 2.15,
    "max_mean_difference": 8.41
  },
  "artifacts": {
    "jpeg_ghost_map": "analyses/jpeg_ghost/jpeg_ghost_map_1.png",
    "jpeg_ghost_data": "analyses/jpeg_ghost/jpeg_ghost_analysis_1.json"
  }
}
```

---

## 5. Artifact Descriptions

1. **`jpeg_ghost_map.png`**: 2D pseudo-color spatial heatmap encoded using the Viridis colormap representing normalized block residuals at the candidate quality minimum $q^*$. Areas of minimal residual (ghost candidates) render as dark purple/blue, while areas with high residual render in vibrant yellow/green.
2. **`jpeg_ghost_analysis.json`**: Complete machine-readable record including the full numerical quality response curve, global IQR distribution, bounding boxes, and provenance metadata.

---

## 6. Scientific Limitations & Failure Modes

1. **Non-Accusatory Requirement**: A localized JPEG Ghost response demonstrates spatial variations in compression residual behavior. It does NOT prove intentional malice, manipulation, or fabrication.
2. **Texture and Scene Sensitivity**: Flat, featureless areas (e.g. clear skies) intrinsically yield minimal recompression difference across many quality factors, potentially generating pseudo-minima. Highly textured or noisy regions exhibit elevated residuals.
3. **Repeated Whole-Frame Recompression**: Images recompressed globally multiple times may exhibit flattened, ambiguous curves without distinct local minima.
4. **Color Subsampling Differences**: Variations in chroma subsampling ($4:2:0$ vs $4:4:4$) between the original donor and host images introduce systematic edge discrepancies.
5. **Inapplicability Guardrail**: Non-JPEG containers (PNG, WebP, TIFF) return `status = NOT_APPLICABLE` with the mandatory guardrail notice. Inapplicability is never negative evidence.

---

## 7. Scientific References

1. Farid, H. (2009). *Exposing Digital Forgeries from JPEG Ghosts*. IEEE Transactions on Information Forensics and Security, 4(1), 154–160.
2. Stamm, M. C., & Liu, K. J. (2010). *Forensic Detection of Image Tampering Using JPEG Post-Compression Artifacts*. IEEE International Conference on Image Processing (ICIP), 4385–4388.
3. ISO/IEC 10918-1:1994 / ITU-T Recommendation T.81. *Information technology — Digital compression and coding of continuous-tone still images — Requirements and guidelines*.
