# ForenSight — Stage 3, Workstream 1, Batch 1
## Implementation Report: Lossless PNG Serialization of Diagnostic Outputs

**Date:** 2026-11-11  
**Workstream:** Workstream 1 — Algorithmic Integrity & Forensic Correctness  
**Batch:** Batch 1 — Lossless PNG Serialization of Diagnostic Outputs  
**Commit Target:** `feat(forensics): preserve diagnostic outputs with lossless PNG`  

---

### 1. Executive Summary

In accordance with the Stage 3 Roadmap (`STAGE_3_PLANNING_AND_ROADMAP.md`, Section 3.1), Batch 1 eliminates avoidable JPEG recompression distortion across all derived diagnostic raster outputs produced by ForenSight's four core forensic engines: Error Level Analysis (ELA), Spatial Noise Analysis, JPEG-DCT Frequency Analysis, and Copy-Move Detection.

Prior to this implementation, derived diagnostic heatmaps and spatial difference arrays were being encoded as lossy JPEG files (`quality=95`), subjecting the diagnostic evidence itself to secondary 8x8 Discrete Cosine Transform quantization and high-frequency coefficient truncation. With Batch 1, all derived diagnostic rasters are serialized to lossless PNG format (`image/png`), ensuring byte-level fidelity between in-memory floating/integer difference arrays and serialized artifacts (`MSE = 0.0`).

All original evidence bytes, database schemas, API contracts, and forensic detection mathematics remain strictly untouched.

---

### 2. Git Baseline and Repository State

- **Canonical Repository:** `F:\Projects\ForenSight`
- **Configured Remote URL:** `https://github.com/kharbashpriyanshu/ForenSight.git`
- **Active Branch:** `main`
- **Base Commit:** `48f8c604ac0d38e111bb5b3096b336baba7bebaf` (`docs(roadmap): correct Stage 3 planning specification and validation registry`)
- **Working Tree Integrity:** All 27 historical audit reports, quality reviews, architectural records, and `STAGE_2_BATCH_4_1_IMPLEMENTATION_REPORT.md` remain strictly preserved without alteration.

---

### 3. Inventory of Modified and Created Files

| File Path | Action | Purpose |
|---|---|---|
| `backend/app/forensics/ela/engine.py` | Modified | Serializes `ela_map_{run_id}.png` as lossless PNG via Pillow; preserves `ela_recompressed_{run_id}.jpg` as lossy JPEG bitstream. |
| `backend/app/forensics/ela/schemas.py` | Modified | Adds backward-compatible `@property` accessors (`error_map_path`, `mean_error`, `max_error`) to `ELAResult` for seamless adapter interoperability. |
| `backend/app/forensics/noise/engine.py` | Modified | Serializes `noise_residual_{run_id}.png` and `noise_local_{run_id}.png` as lossless PNG via Pillow (`mode='L'`). |
| `backend/app/forensics/jpeg_dct/engine.py` | Modified | Serializes `dct_energy_map_{run_id}.png` as lossless PNG via Pillow (`mode='L'`). |
| `backend/app/forensics/copy_move/engine.py` | Modified | Serializes `copymove_map_{run_id}.png` for both match correspondence visualization and empty result fallback via OpenCV (`cv2.imwrite`). |
| `backend/tests/test_lossless_png_serialization.py` | Created | Dedicated verification suite (12 tests) verifying PNG chunk signatures, in-memory array parity, dual-output preservation, evidence SHA-256 invariance, and API media type detection. |
| `STAGE_3_BATCH_1_IMPLEMENTATION_REPORT.md` | Created | This implementation report. |

---

### 4. Per-Engine Lossless Serialization Details

#### 4.1. Error Level Analysis (`ELAEngine`)
- **Artifact Path:** `os.path.join(output_dir, f"ela_map_{run_id}.png")`
- **Encoding:** `error_img = Image.fromarray(norm_arr, mode='RGB'); error_img.save(error_map_path, 'PNG')`
- **Dual-Output Preservation:** The recompressed JPEG probe image (`ela_recompressed_{run_id}.jpg`) remains encoded with `img.save(recompressed_path, 'JPEG', quality=quality)`. This is essential because the recompressed image represents the physical lossy JPEG bitstream used to evaluate recompression delta. The derived diagnostic visualization (`ela_map`), however, is saved as lossless PNG.

#### 4.2. Spatial Noise Analysis (`NoiseEngine`)
- **Global Residual Map:** `os.path.join(output_dir, f"noise_residual_{run_id}.png")`
- **Local Residual Map:** `os.path.join(output_dir, f"noise_local_{run_id}.png")`
- **Encoding:** `Image.fromarray(norm_global, mode='L').save(global_map_path, 'PNG')` and `Image.fromarray(norm_local, mode='L').save(local_map_path, 'PNG')`
- **Preservation:** The 8-bit normalized global noise residual array and local patch variance statistics are preserved without block-boundary distortion.

#### 4.3. JPEG-DCT Frequency Analysis (`JPEGDCTEngine`)
- **Artifact Path:** `os.path.join(output_dir, f"dct_energy_map_{run_id}.png")`
- **Encoding:** `vis_img = Image.fromarray(vis_arr, mode='L').resize((256, 256), Image.Resampling.NEAREST); vis_img.save(vis_path, 'PNG')`
- **Preservation:** The 8x8 average logarithmic DCT block frequency distribution representation resized to 256x256 via nearest-neighbor interpolation is stored without lossy compression ringing.

#### 4.4. Copy-Move Forgery Detection (`CopyMoveEngine`)
- **Artifact Path:** `os.path.join(output_dir, f"copymove_map_{run_id}.png")`
- **Encoding:** `cv2.imwrite(vis_path, vis_img)` (OpenCV automatically selects the PNG codec based on the `.png` extension)
- **Empty Fallback:** When zero inliers or keypoint correspondences are detected, `_empty_result` similarly outputs `copymove_map_{run_id}.png`.
- **Preservation:** Geometric keypoint correspondence lines drawn with `cv2.drawMatches()` retain crisp vector-like edges without JPEG color subsampling artifacts (chroma bleeding).

---

### 5. API and Frontend Compatibility Verification

1. **Artifact Endpoint Serving (`/api/artifacts/{path:path}`):**
   - In `backend/app/api/analysis.py`, lines 660-672 inspect file extension:
     ```python
     ext = target_path.suffix.lower()
     if ext in (".jpg", ".jpeg"):
         media_type = "image/jpeg"
     elif ext == ".png":
         media_type = "image/png"
     ```
   - New PNG artifacts are served with `Content-Type: image/png`.
   - Historical cases containing `.jpg` artifacts continue to be served with `Content-Type: image/jpeg` without regression.
2. **Adapter Layer (`LegacyELAAdapter`):**
   - `LegacyELAAdapter` in `backend/app/engine_extensions/adapters.py` accesses `res.error_map_path`, `res.mean_error`, and `res.max_error`.
   - `ELAResult` in `backend/app/forensics/ela/schemas.py` defines `@property` accessors aliasing these attributes to `error_image_path` and `statistics.*`, ensuring zero compatibility breaks across both modern and legacy execution pathways.
3. **Frontend Dashboard & Viewer:**
   - Frontend components (`Dashboard.tsx`, `UnifiedForensicResults.tsx`, `AnalysisJobCard.tsx`) receive artifact paths dynamically through `analysis.structured_findings.artifacts` and load them directly via `<img>` tags, which seamlessly render PNGs without code modifications.

---

### 6. Quantitative Distortion Comparison: Lossless PNG vs Lossy JPEG

A mathematical validation test (`test_png_eliminates_jpeg_recompression_distortion`) was executed on an 8-bit synthetic diagnostic raster:

| Metric | Lossless PNG Serialization | Lossy JPEG Serialization (`quality=95`) | Forensic Interpretation |
|---|---|---|---|
| **Mean Squared Error (MSE)** | **0.0000** | **1.2481** | PNG introduces zero numerical variance into the diagnostic output. |
| **Max Absolute Pixel Difference** | **0** | **9** | JPEG recompression alters diagnostic pixel values by up to 9 intensity levels. |
| **8x8 Block Grid Artifacts** | **None** | **Present** | JPEG introduces artificial 8x8 DCT grid lines into spatial noise maps. |
| **File Format Header** | `b'\x89PNG\r\n\x1a\n'` | `b'\xff\xd8\xff'` | Compliant with PNG specification (RFC 2083). |

---

### 7. Evidence Immutability Verification (SHA-256 Invariance)

Original uploaded evidence must be preserved with absolute cryptographic immutability:
- Synthetic evidence image created with initial SHA-256 hash.
- All four engines (`ELAEngine`, `NoiseEngine`, `JPEGDCTEngine`, `CopyMoveEngine`) executed in succession against the input file.
- Exact byte-level verification (`assert original_bytes == final_bytes`) and cryptographic verification (`assert compute_sha256(img) == original_sha256`) passed with 100% invariance.

---

### 8. Test Execution Summary

The test suite was executed using the project's virtual environment:
`backend/venv/Scripts/python -m pytest backend/tests/test_lossless_png_serialization.py backend/tests/test_ela.py backend/tests/test_noise.py backend/tests/test_jpeg_dct.py backend/tests/test_copy_move.py -v`

#### Results: 32 passed, 0 failed in 15.82s

- `test_lossless_png_serialization.py::test_ela_png_signature_and_chunks`: **PASSED**
- `test_lossless_png_serialization.py::test_noise_png_signature_and_chunks`: **PASSED**
- `test_lossless_png_serialization.py::test_jpeg_dct_png_signature_and_chunks`: **PASSED**
- `test_lossless_png_serialization.py::test_copy_move_png_signature_and_chunks`: **PASSED**
- `test_lossless_png_serialization.py::test_ela_lossless_pixel_parity`: **PASSED**
- `test_lossless_png_serialization.py::test_noise_lossless_pixel_parity`: **PASSED**
- `test_lossless_png_serialization.py::test_png_eliminates_jpeg_recompression_distortion`: **PASSED**
- `test_lossless_png_serialization.py::test_ela_dual_output_preservation`: **PASSED**
- `test_lossless_png_serialization.py::test_evidence_sha256_invariance_across_all_engines`: **PASSED**
- `test_lossless_png_serialization.py::test_spatial_dimension_parity`: **PASSED**
- `test_lossless_png_serialization.py::test_adapter_backward_compatibility`: **PASSED**
- `test_lossless_png_serialization.py::test_api_artifact_media_type_detection`: **PASSED**
- `test_ela.py` (5 tests): **PASSED**
- `test_noise.py` (5 tests): **PASSED**
- `test_jpeg_dct.py` (5 tests): **PASSED**
- `test_copy_move.py` (5 tests): **PASSED**

---

### 9. Scope Boundary and Exclusions

1. **ELA Fixed Scaling & Normalization:** Intentionally deferred to Workstream 1, Batch 2. ELA dynamic normalization (`multiplier = 255.0 / max_err`) was preserved without modification.
2. **Median Filtering for Noise Analysis:** Intentionally deferred to Workstream 1, Batch 2. Gaussian filtering parameters and kernels were preserved without modification.
3. **Copy-Move Spatial In-Situ Overlay:** Intentionally deferred to Workstream 1, Batch 3. Side-by-side `cv2.drawMatches()` visualization was preserved without modification.
4. **Database Schemas & Models:** No database migrations, alembic revisions, or table schema modifications were introduced.
5. **Frontend UI Presentation:** No UI layout, CSS stylesheets, or component templates were modified.

---

### 10. Conclusion

Stage 3, Workstream 1, Batch 1 is fully implemented, verified, and ready for deployment. Lossless PNG serialization is established as the standard for diagnostic outputs, preserving scientific evidence integrity without disrupting backward compatibility.
