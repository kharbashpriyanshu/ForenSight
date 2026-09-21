# Non-Aligned Double JPEG Compression Analysis Engine Specification

**Engine ID:** `NADJPEG`  
**Version:** 1.0.0  
**Category:** `LOCAL_ANALYSIS`  
**Classification:** Analytical Spatial Domain / Grid Discontinuity Forensics  

---

## 1. Scientific Overview & Theoretical Foundation

When an image compressed as JPEG is cropped, resized, translated, or composed into another document before being saved again as JPEG, the $8 \times 8$ pixel grid of the second compression is frequently misaligned relative to the $8 \times 8$ grid of the first compression.

In single JPEG compression, block boundary artifacts occur exclusively at spatial coordinates that are multiples of 8:
$$x \equiv 0 \pmod 8, \quad y \equiv 0 \pmod 8$$
When an image underwent a prior compression with spatial shift $(\Delta r, \Delta c) \in [0..7] \times [0..7]$, primary block boundary artifacts were embedded at shifted coordinates $(8k + \Delta r, 8m + \Delta c)$. Upon secondary compression at $(8k, 8m)$, the primary boundary artifacts now reside *inside* the new $8 \times 8$ blocks.

Because the human visual system and forward DCT do not eradicate these interior inter-pixel intensity gradients, the primary grid boundary discontinuities remain measurable in the spatial domain as periodic energy spikes along the shifted grid lines.

---

## 2. Mathematical Formulation

1. **Spatial Boundary Discontinuity Operator**:
   For luminance channel $I(r, c)$, let the vertical and horizontal first-order difference gradients across pixel boundaries be:
   $$\Delta_v(r, c) = |I(r, c) - I(r+1, c)|$$
   $$\Delta_h(r, c) = |I(r, c) - I(r, c+1)|$$

2. **64-Phase Discontinuity Grid Energy Matrix**:
   For each possible 2D spatial phase shift $(\Delta r, \Delta c) \in \{0, 1, \dots, 7\} \times \{0, 1, \dots, 7\}$, compute the average boundary energy across all grid lines aligned to that phase:
   $$E(\Delta r, \Delta c) = \frac{1}{|\Omega_{\Delta r, \Delta c}|} \sum_{(r, c) \in \Omega_{\Delta r, \Delta c}} \left( \Delta_v(r, c) + \Delta_h(r, c) \right)$$
   where $\Omega_{\Delta r, \Delta c} = \{(r, c) \mid r \equiv \Delta r \pmod 8, \, c \equiv \Delta c \pmod 8\}$.

3. **Contrast Ratio Normalization**:
   To eliminate the confounding influence of intrinsic image texture and luminance gradients, normalize the energy matrix by the background energy (mean or median across all 64 phases):
   $$C(\Delta r, \Delta c) = \frac{E(\Delta r, \Delta c)}{\bar{E}_{\text{all}}}$$

4. **Candidate Shift Detection**:
   Excluding the aligned secondary compression grid $(0, 0)$, identify the maximal non-aligned phase peak:
   $$(\Delta r^*, \Delta c^*) = \arg\max_{(\Delta r, \Delta c) \neq (0, 0)} C(\Delta r, \Delta c)$$
   $$C^* = C(\Delta r^*, \Delta c^*)$$
   If $C^* > \gamma$ (default $\gamma = 1.35$), the image exhibits significant non-aligned boundary discontinuities consistent with a prior JPEG compression shifted by $(\Delta r^*, \Delta c^*)$ pixels.

---

## 3. Engine Parameters

| Parameter | Type | Default | Valid Range | Description |
| :--- | :--- | :--- | :--- | :--- |
| `spatial_threshold` | `float` | 1.35 | 1.1..3.0 | Minimum contrast ratio for candidate non-aligned shift detection. |
| `max_dimension` | `int` | 2048 | 256..4096 | Maximum dimension constraint for performance preservation. |

---

## 4. Observations & Structured Findings

### Normalized Observation Output
- **`observation_type`**: `NADJPEG`
- **`metric_name`**: `GRID_DISCONTINUITY_CONTRAST`
- **`raw_value`**: Candidate shift string and contrast ratio (e.g. `"(3,5) @ 1.82x"`)
- **`normalized_value`**: Continuous anomaly score $[0.0, 1.0]$ based on peak contrast
- **`direction`**: `anomalous` if peak contrast exceeds threshold; otherwise `nominal`

### Structured Findings Schema
```json
{
  "has_non_aligned_double_jpeg_traces": true,
  "candidate_shift_offset": {
    "row_shift": 3,
    "col_shift": 5
  },
  "peak_contrast_ratio": 1.824,
  "aligned_contrast_ratio": 1.042,
  "artifacts": {
    "nadjpeg_matrix": "analyses/nadjpeg/nadjpeg_matrix_1.png",
    "nadjpeg_data": "analyses/nadjpeg/nadjpeg_analysis_1.json"
  }
}
```

---

## 5. Diagnostic Artifact Descriptions

1. **`nadjpeg_matrix.png`**: High-contrast 480x360 px diagnostic visualization:
   - Displays the 64-phase $[0..7] \times [0..7]$ energy matrix with color-coded cells (deep blue/slate baseline to cyan/emerald elevated energy).
   - Prominently highlights the candidate peak shift $(\Delta r^*, \Delta c^*)$ in bright red/amber border with contrast metrics.
2. **`nadjpeg_analysis.json`**: Complete numerical matrix of all 64 phase entries, row/col shifts, energy levels, background statistics, and forensic provenance metadata.

---

## 6. Scientific Limitations & Failure Modes

1. **Grid-Aligned Cropping ($8k \times 8m$)**: If an image is cropped by exact multiples of 8 pixels (e.g. $\Delta r = 0, \Delta c = 0$), the primary and secondary grids remain aligned. The image will NOT exhibit non-aligned boundary discontinuities, but may instead be detected by `ADJPEG`.
2. **Periodic Scene Textures**: Fine synthetic patterns such as window blinds, fabric weaves, or brick mortar whose periodicity coincides with 8-pixel spacing can produce localized energy peaks that mimic non-aligned grid shifts.
3. **Heavy Filtering or Resampling**: Subsequent bicubic or bilinear resizing dissolves the sharp high-frequency 1-pixel boundary discontinuity, attenuating the measurable contrast peak.
4. **Non-Accusatory Requirement**: The detection of an offset compression grid indicates that the image has undergone non-aligned cropping or recompression during its lifecycle (e.g. standard editing, screenshotting, or cropping). It does NOT inherently imply fraudulent tampering or deceptive fabrication.

---

## 7. Scientific References

1. Li, B., Shi, Y. Q., & Huang, J. (2008). *Detecting Doubly Compressed JPEG Images with Different Block Grids*. IEEE International Conference on Multimedia and Expo (ICME), 1017–1020.
2. Bianchi, T., & Piva, A. (2011). *Detection of Nonaligned Double JPEG Compression with Application to Image Tampering Detection*. IEEE Transactions on Information Forensics and Security, 7(2), 842–848.
3. ISO/IEC 10918-1:1994 / ITU-T Recommendation T.81. *Information technology — Digital compression and coding of continuous-tone still images — Requirements and guidelines*.
