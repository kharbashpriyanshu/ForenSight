# ForenSight — Stage 3, Workstream 2 Academic Evaluation Report
## Reproducible Forensic Benchmark on Controlled Dataset v1

**Execution Date:** 2026-11-11 08:57:10 UTC  
**Dataset Identifier:** `controlled-v1` (v`1.0.0`)  
**Manifest Version:** `1.0.0`  
**Total Fixture Images:** 11  
**Total Registered Engines:** 23  
**Evidence Integrity:** All 11 source fixture SHA-256 digests strictly verified.

---

## 1. Executive Summary & Scientific Method
This report documents the automated, reproducible academic evaluation of ForenSight's forensic analysis engines using the approved controlled benchmark suite (`backend/datasets/controlled/v1/`). In strict accordance with the Stage 3 scientific roadmap, this evaluation enforces:
1. **Metric Family Disentanglement:** Classical image fidelity metrics (MSE, PSNR, SSIM) evaluate signal loss    across compression factors; spatial localization metrics (IoU, Precision, Recall, F1, Dice) evaluate mask    overlap against ground truth. They are never combined into composite scores.
2. **Strict Section 9.3 Applicability:** Every engine/fixture combination is governed by explicit compatibility    rules rather than ad-hoc execution.
3. **Negative-Control Separation:** Negative controls evaluate false alarms on authentic content and are never    scored as localization ground truth.

## 2. Dataset Ingestion & Preflight Integrity Verification

| Image ID | Container File | Format | Dimensions | Ground Truth Mask | SHA-256 Verified |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `img_001_authentic_base` | `fixture_001_authentic/original.png` | PNG | 256x256 | *None (Negative/Compression)* | **VALID** |
| `img_color_channel_shift` | `fixture_008_color_shift/derived_color_shifted.png` | PNG | 256x256 | `fixture_008_color_shift/ground_truth_mask.png` | **VALID** |
| `img_comp_q50` | `fixture_002_jpeg_q50/derived_q50.jpg` | JPEG | 256x256 | *None (Negative/Compression)* | **VALID** |
| `img_comp_q75` | `fixture_002_jpeg_q75/derived_q75.jpg` | JPEG | 256x256 | *None (Negative/Compression)* | **VALID** |
| `img_comp_q95` | `fixture_002_jpeg_q95/derived_q95.jpg` | JPEG | 256x256 | *None (Negative/Compression)* | **VALID** |
| `img_copymove_translated` | `fixture_005_copymove_clone/derived_copymove.png` | PNG | 256x256 | `fixture_005_copymove_clone/ground_truth_mask.png` | **VALID** |
| `img_false_positive_texture` | `fixture_009_false_positive_texture/authentic_repetitive_texture.png` | PNG | 256x256 | *None (Negative/Compression)* | **VALID** |
| `img_geom_resample_bicubic` | `fixture_004_geometry_resample/derived_resampled.png` | PNG | 256x256 | *None (Negative/Compression)* | **VALID** |
| `img_jpeg_double_q95_q75` | `fixture_003_jpeg_double_q95_q75/derived_double.jpg` | JPEG | 256x256 | *None (Negative/Compression)* | **VALID** |
| `img_noise_gaussian_localized` | `fixture_007_noise_injection/derived_noise_injected.png` | PNG | 256x256 | `fixture_007_noise_injection/ground_truth_mask.png` | **VALID** |
| `img_splicing_donor` | `fixture_006_splicing_donor/derived_spliced.png` | PNG | 256x256 | `fixture_006_splicing_donor/ground_truth_mask.png` | **VALID** |


## 3. Section 9.3 Engine-to-Fixture Applicability Matrix

- **Total Dispatches Evaluated:** 253 (23 engines x 11 fixtures = 253 combinations)
- **Applicable Executions (`RUN`):** 69
- **Skipped — Incompatible Format (`SKIP (Format)`):** 63
- **Skipped — Missing Prerequisite (`SKIP (Prereq)`):** 33
- **Skipped — Inapplicable Target (`SKIP (Target)`):** 88
- **Execution Errors:** 0 (Zero crashes, zero unhandled exceptions)

### 3.1 Engine-to-Fixture Compatibility Grid (23 x 11)

| Engine ID | F001<br>Base | F002<br>Q95 | F002<br>Q75 | F002<br>Q50 | F003<br>Dbl | F004<br>Res | F005<br>Clone | F006<br>Spl | F007<br>Noise | F008<br>Col | F009<br>Tex | Total RUN |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `METADATA` | **RUN** | **RUN** | **RUN** | **RUN** | **RUN** | **RUN** | **RUN** | **RUN** | **RUN** | **RUN** | **RUN** | **11** |
| `ELA` | SK-F | SK-F | **RUN** | **RUN** | **RUN** | SK-F | SK-F | SK-F | **RUN** | SK-F | SK-F | **4** |
| `NOISE` | **RUN** | SK-T | SK-T | SK-T | SK-T | SK-T | **RUN** | SK-T | SK-T | **RUN** | **RUN** | **4** |
| `JPEG_DCT` | SK-F | SK-F | **RUN** | **RUN** | **RUN** | SK-F | SK-F | SK-F | **RUN** | SK-F | SK-F | **4** |
| `COPY_MOVE` | **RUN** | SK-T | SK-T | SK-T | SK-T | **RUN** | **RUN** | SK-T | SK-T | SK-T | SK-T | **3** |
| `JPEG-STRUCTURE` | SK-F | SK-F | **RUN** | **RUN** | **RUN** | SK-F | SK-F | SK-F | **RUN** | SK-F | SK-F | **4** |
| `JPEG-QT` | SK-F | SK-F | **RUN** | **RUN** | **RUN** | SK-F | SK-F | SK-F | **RUN** | SK-F | SK-F | **4** |
| `JPEG-HUFFMAN` | SK-F | SK-F | **RUN** | **RUN** | **RUN** | SK-F | SK-F | SK-F | **RUN** | SK-F | SK-F | **4** |
| `JPEG-GHOST` | SK-F | SK-F | SK-T | SK-T | SK-T | SK-F | SK-F | SK-F | **RUN** | SK-F | SK-F | **1** |
| `ADJPEG` | SK-F | SK-F | SK-T | SK-T | SK-T | SK-F | SK-F | SK-F | **RUN** | SK-F | SK-F | **1** |
| `NADJPEG` | SK-F | SK-F | SK-T | SK-T | SK-T | SK-F | SK-F | SK-F | **RUN** | SK-F | SK-F | **1** |
| `BLOCKING-ARTIFACT` | SK-F | SK-F | **RUN** | **RUN** | **RUN** | SK-F | SK-F | SK-F | **RUN** | SK-F | SK-F | **4** |
| `HISTOGRAM` | **RUN** | **RUN** | **RUN** | **RUN** | **RUN** | SK-T | SK-T | SK-T | SK-T | SK-T | SK-T | **5** |
| `COLOR-CHANNEL` | SK-T | **RUN** | SK-T | SK-T | SK-T | SK-T | SK-T | SK-T | SK-T | SK-T | SK-T | **1** |
| `FOURIER` | **RUN** | SK-T | SK-T | SK-T | SK-T | SK-T | **RUN** | **RUN** | SK-T | **RUN** | SK-T | **4** |
| `ADVANCED-NOISE` | **RUN** | SK-T | SK-T | SK-T | SK-T | SK-T | **RUN** | SK-T | SK-T | **RUN** | **RUN** | **4** |
| `RESAMPLING` | **RUN** | SK-T | SK-T | SK-T | SK-T | SK-T | SK-T | **RUN** | SK-T | SK-T | SK-T | **2** |
| `CLONE-BLOCK` | **RUN** | SK-T | SK-T | SK-T | SK-T | **RUN** | **RUN** | SK-T | SK-T | SK-T | SK-T | **3** |
| `CLONE-KEYPOINT` | **RUN** | SK-T | SK-T | SK-T | SK-T | **RUN** | **RUN** | SK-T | SK-T | SK-T | SK-T | **3** |
| `PRNU` | **RUN** | SK-T | SK-T | SK-T | SK-T | SK-T | SK-T | SK-T | SK-T | **RUN** | SK-T | **2** |
| `CAMERA-ID` | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | **0** |
| `GEOMETRY-PERSPECTIVE` | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | **0** |
| `PHYSICS-LIGHTING` | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | SK-P | **0** |

*Legend: `RUN` = Applicable Execution; `SK-F` = Skipped (Format Mismatch); `SK-P` = Skipped (Missing Prerequisite/Reference); `SK-T` = Skipped (Inapplicable Modality Target).*

### 3.2 Exhaustive 253-Entry Dispatch Ledger

| Engine ID | Image ID | Format | Decision | Execution Status | Runtime (ms) | Obs | Reason |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `METADATA` | `img_001_authentic_base` | PNG | `RUN` | `APPLIED` | 1.31 | 1 | Container metadata tag extraction (Informational). |
| `METADATA` | `img_color_channel_shift` | PNG | `RUN` | `APPLIED` | 1.08 | 1 | Container metadata tag extraction (Informational). |
| `METADATA` | `img_comp_q50` | JPEG | `RUN` | `APPLIED` | 0.28 | 1 | Container metadata tag extraction (Informational). |
| `METADATA` | `img_comp_q75` | JPEG | `RUN` | `APPLIED` | 0.24 | 1 | Container metadata tag extraction (Informational). |
| `METADATA` | `img_comp_q95` | JPEG | `RUN` | `APPLIED` | 0.21 | 1 | Container metadata tag extraction (Informational). |
| `METADATA` | `img_copymove_translated` | PNG | `RUN` | `APPLIED` | 0.96 | 1 | Container metadata tag extraction (Informational). |
| `METADATA` | `img_false_positive_texture` | PNG | `RUN` | `APPLIED` | 0.41 | 1 | Container metadata tag extraction (Informational). |
| `METADATA` | `img_geom_resample_bicubic` | PNG | `RUN` | `APPLIED` | 1.39 | 1 | Container metadata tag extraction (Informational). |
| `METADATA` | `img_jpeg_double_q95_q75` | JPEG | `RUN` | `APPLIED` | 0.26 | 1 | Container metadata tag extraction (Informational). |
| `METADATA` | `img_noise_gaussian_localized` | PNG | `RUN` | `APPLIED` | 0.96 | 1 | Container metadata tag extraction (Informational). |
| `METADATA` | `img_splicing_donor` | PNG | `RUN` | `APPLIED` | 1.01 | 1 | Container metadata tag extraction (Informational). |
| `ELA` | `img_001_authentic_base` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `ELA` | `img_color_channel_shift` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `ELA` | `img_comp_q50` | JPEG | `RUN` | `APPLIED` | 34.55 | 1 | Recompression error residual analysis on JPEG container. |
| `ELA` | `img_comp_q75` | JPEG | `RUN` | `APPLIED` | 16.67 | 1 | Recompression error residual analysis on JPEG container. |
| `ELA` | `img_comp_q95` | JPEG | `RUN` | `APPLIED` | 19.58 | 1 | Recompression error residual analysis on JPEG container. |
| `ELA` | `img_copymove_translated` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `ELA` | `img_false_positive_texture` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `ELA` | `img_geom_resample_bicubic` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `ELA` | `img_jpeg_double_q95_q75` | JPEG | `RUN` | `APPLIED` | 17.00 | 1 | Recompression error residual analysis on JPEG container. |
| `ELA` | `img_noise_gaussian_localized` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `ELA` | `img_splicing_donor` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `NOISE` | `img_001_authentic_base` | PNG | `RUN` | `APPLIED` | 25.04 | 1 | Authentic sensor noise negative baseline. |
| `NOISE` | `img_color_channel_shift` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no noise tampering or negative baseline challenge). |
| `NOISE` | `img_comp_q50` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no noise tampering or negative baseline challenge). |
| `NOISE` | `img_comp_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no noise tampering or negative baseline challenge). |
| `NOISE` | `img_comp_q95` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no noise tampering or negative baseline challenge). |
| `NOISE` | `img_copymove_translated` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no noise tampering or negative baseline challenge). |
| `NOISE` | `img_false_positive_texture` | PNG | `RUN` | `APPLIED` | 10.92 | 1 | Authentic sensor noise negative baseline. |
| `NOISE` | `img_geom_resample_bicubic` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no noise tampering or negative baseline challenge). |
| `NOISE` | `img_jpeg_double_q95_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no noise tampering or negative baseline challenge). |
| `NOISE` | `img_noise_gaussian_localized` | PNG | `RUN` | `APPLIED` | 17.13 | 1 | Spatial noise residual localization against mask. |
| `NOISE` | `img_splicing_donor` | PNG | `RUN` | `APPLIED` | 15.81 | 1 | Spatial noise residual localization against mask. |
| `JPEG_DCT` | `img_001_authentic_base` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG_DCT` | `img_color_channel_shift` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG_DCT` | `img_comp_q50` | JPEG | `RUN` | `APPLIED` | 10.92 | 1 | Spatial 8x8 block orthonormal DCT spectral energy analysis. |
| `JPEG_DCT` | `img_comp_q75` | JPEG | `RUN` | `APPLIED` | 10.81 | 1 | Spatial 8x8 block orthonormal DCT spectral energy analysis. |
| `JPEG_DCT` | `img_comp_q95` | JPEG | `RUN` | `APPLIED` | 11.13 | 1 | Spatial 8x8 block orthonormal DCT spectral energy analysis. |
| `JPEG_DCT` | `img_copymove_translated` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG_DCT` | `img_false_positive_texture` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG_DCT` | `img_geom_resample_bicubic` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG_DCT` | `img_jpeg_double_q95_q75` | JPEG | `RUN` | `APPLIED` | 10.84 | 1 | Spatial 8x8 block orthonormal DCT spectral energy analysis. |
| `JPEG_DCT` | `img_noise_gaussian_localized` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG_DCT` | `img_splicing_donor` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `COPY_MOVE` | `img_001_authentic_base` | PNG | `RUN` | `APPLIED` | 42.11 | 1 | Authentic negative baseline / repetitive texture challenge. |
| `COPY_MOVE` | `img_color_channel_shift` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `COPY_MOVE` | `img_comp_q50` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `COPY_MOVE` | `img_comp_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `COPY_MOVE` | `img_comp_q95` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `COPY_MOVE` | `img_copymove_translated` | PNG | `RUN` | `APPLIED` | 42.45 | 1 | Cloning detection on translated copy-move target. |
| `COPY_MOVE` | `img_false_positive_texture` | PNG | `RUN` | `APPLIED` | 51.84 | 1 | Authentic negative baseline / repetitive texture challenge. |
| `COPY_MOVE` | `img_geom_resample_bicubic` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `COPY_MOVE` | `img_jpeg_double_q95_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `COPY_MOVE` | `img_noise_gaussian_localized` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `COPY_MOVE` | `img_splicing_donor` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `JPEG-STRUCTURE` | `img_001_authentic_base` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-STRUCTURE` | `img_color_channel_shift` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-STRUCTURE` | `img_comp_q50` | JPEG | `RUN` | `APPLIED` | 2.29 | 1 | JPEG header/table structure validation. |
| `JPEG-STRUCTURE` | `img_comp_q75` | JPEG | `RUN` | `APPLIED` | 1.89 | 1 | JPEG header/table structure validation. |
| `JPEG-STRUCTURE` | `img_comp_q95` | JPEG | `RUN` | `APPLIED` | 2.05 | 1 | JPEG header/table structure validation. |
| `JPEG-STRUCTURE` | `img_copymove_translated` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-STRUCTURE` | `img_false_positive_texture` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-STRUCTURE` | `img_geom_resample_bicubic` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-STRUCTURE` | `img_jpeg_double_q95_q75` | JPEG | `RUN` | `APPLIED` | 1.46 | 1 | JPEG header/table structure validation. |
| `JPEG-STRUCTURE` | `img_noise_gaussian_localized` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-STRUCTURE` | `img_splicing_donor` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-QT` | `img_001_authentic_base` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-QT` | `img_color_channel_shift` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-QT` | `img_comp_q50` | JPEG | `RUN` | `APPLIED` | 3.14 | 1 | JPEG header/table structure validation. |
| `JPEG-QT` | `img_comp_q75` | JPEG | `RUN` | `APPLIED` | 2.83 | 1 | JPEG header/table structure validation. |
| `JPEG-QT` | `img_comp_q95` | JPEG | `RUN` | `APPLIED` | 2.75 | 1 | JPEG header/table structure validation. |
| `JPEG-QT` | `img_copymove_translated` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-QT` | `img_false_positive_texture` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-QT` | `img_geom_resample_bicubic` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-QT` | `img_jpeg_double_q95_q75` | JPEG | `RUN` | `APPLIED` | 2.41 | 1 | JPEG header/table structure validation. |
| `JPEG-QT` | `img_noise_gaussian_localized` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-QT` | `img_splicing_donor` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-HUFFMAN` | `img_001_authentic_base` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-HUFFMAN` | `img_color_channel_shift` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-HUFFMAN` | `img_comp_q50` | JPEG | `RUN` | `APPLIED` | 1.10 | 1 | JPEG header/table structure validation. |
| `JPEG-HUFFMAN` | `img_comp_q75` | JPEG | `RUN` | `APPLIED` | 1.11 | 1 | JPEG header/table structure validation. |
| `JPEG-HUFFMAN` | `img_comp_q95` | JPEG | `RUN` | `APPLIED` | 1.35 | 1 | JPEG header/table structure validation. |
| `JPEG-HUFFMAN` | `img_copymove_translated` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-HUFFMAN` | `img_false_positive_texture` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-HUFFMAN` | `img_geom_resample_bicubic` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-HUFFMAN` | `img_jpeg_double_q95_q75` | JPEG | `RUN` | `APPLIED` | 1.07 | 1 | JPEG header/table structure validation. |
| `JPEG-HUFFMAN` | `img_noise_gaussian_localized` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-HUFFMAN` | `img_splicing_donor` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-GHOST` | `img_001_authentic_base` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-GHOST` | `img_color_channel_shift` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-GHOST` | `img_comp_q50` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (engine targets double-compressed JPEG streams). |
| `JPEG-GHOST` | `img_comp_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (engine targets double-compressed JPEG streams). |
| `JPEG-GHOST` | `img_comp_q95` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (engine targets double-compressed JPEG streams). |
| `JPEG-GHOST` | `img_copymove_translated` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-GHOST` | `img_false_positive_texture` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-GHOST` | `img_geom_resample_bicubic` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-GHOST` | `img_jpeg_double_q95_q75` | JPEG | `RUN` | `APPLIED` | 49.92 | 1 | Double-compression artifact detection. |
| `JPEG-GHOST` | `img_noise_gaussian_localized` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `JPEG-GHOST` | `img_splicing_donor` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `ADJPEG` | `img_001_authentic_base` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `ADJPEG` | `img_color_channel_shift` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `ADJPEG` | `img_comp_q50` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (engine targets double-compressed JPEG streams). |
| `ADJPEG` | `img_comp_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (engine targets double-compressed JPEG streams). |
| `ADJPEG` | `img_comp_q95` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (engine targets double-compressed JPEG streams). |
| `ADJPEG` | `img_copymove_translated` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `ADJPEG` | `img_false_positive_texture` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `ADJPEG` | `img_geom_resample_bicubic` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `ADJPEG` | `img_jpeg_double_q95_q75` | JPEG | `RUN` | `APPLIED` | 25.64 | 1 | Double-compression artifact detection. |
| `ADJPEG` | `img_noise_gaussian_localized` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `ADJPEG` | `img_splicing_donor` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `NADJPEG` | `img_001_authentic_base` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `NADJPEG` | `img_color_channel_shift` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `NADJPEG` | `img_comp_q50` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (engine targets double-compressed JPEG streams). |
| `NADJPEG` | `img_comp_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (engine targets double-compressed JPEG streams). |
| `NADJPEG` | `img_comp_q95` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (engine targets double-compressed JPEG streams). |
| `NADJPEG` | `img_copymove_translated` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `NADJPEG` | `img_false_positive_texture` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `NADJPEG` | `img_geom_resample_bicubic` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `NADJPEG` | `img_jpeg_double_q95_q75` | JPEG | `RUN` | `APPLIED` | 33.77 | 1 | Double-compression artifact detection. |
| `NADJPEG` | `img_noise_gaussian_localized` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `NADJPEG` | `img_splicing_donor` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `BLOCKING-ARTIFACT` | `img_001_authentic_base` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `BLOCKING-ARTIFACT` | `img_color_channel_shift` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `BLOCKING-ARTIFACT` | `img_comp_q50` | JPEG | `RUN` | `APPLIED` | 53.65 | 1 | 8x8 block boundary discontinuity analysis. |
| `BLOCKING-ARTIFACT` | `img_comp_q75` | JPEG | `RUN` | `APPLIED` | 58.43 | 1 | 8x8 block boundary discontinuity analysis. |
| `BLOCKING-ARTIFACT` | `img_comp_q95` | JPEG | `RUN` | `APPLIED` | 47.47 | 1 | 8x8 block boundary discontinuity analysis. |
| `BLOCKING-ARTIFACT` | `img_copymove_translated` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `BLOCKING-ARTIFACT` | `img_false_positive_texture` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `BLOCKING-ARTIFACT` | `img_geom_resample_bicubic` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `BLOCKING-ARTIFACT` | `img_jpeg_double_q95_q75` | JPEG | `RUN` | `APPLIED` | 43.64 | 1 | 8x8 block boundary discontinuity analysis. |
| `BLOCKING-ARTIFACT` | `img_noise_gaussian_localized` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `BLOCKING-ARTIFACT` | `img_splicing_donor` | PNG | `SKIP (Format)` | `SKIPPED` | - | 0 | Engine requires JPEG bitstream/quantization tables; container is PNG. |
| `HISTOGRAM` | `img_001_authentic_base` | PNG | `RUN` | `APPLIED` | 40.18 | 1 | RGB dynamic range, entropy, and comb-gap analysis. |
| `HISTOGRAM` | `img_color_channel_shift` | PNG | `RUN` | `APPLIED` | 40.91 | 1 | RGB dynamic range, entropy, and comb-gap analysis. |
| `HISTOGRAM` | `img_comp_q50` | JPEG | `RUN` | `APPLIED` | 41.38 | 1 | RGB dynamic range, entropy, and comb-gap analysis. |
| `HISTOGRAM` | `img_comp_q75` | JPEG | `RUN` | `APPLIED` | 32.00 | 1 | RGB dynamic range, entropy, and comb-gap analysis. |
| `HISTOGRAM` | `img_comp_q95` | JPEG | `RUN` | `APPLIED` | 36.76 | 1 | RGB dynamic range, entropy, and comb-gap analysis. |
| `HISTOGRAM` | `img_copymove_translated` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated histogram evaluation subset. |
| `HISTOGRAM` | `img_false_positive_texture` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated histogram evaluation subset. |
| `HISTOGRAM` | `img_geom_resample_bicubic` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated histogram evaluation subset. |
| `HISTOGRAM` | `img_jpeg_double_q95_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated histogram evaluation subset. |
| `HISTOGRAM` | `img_noise_gaussian_localized` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated histogram evaluation subset. |
| `HISTOGRAM` | `img_splicing_donor` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated histogram evaluation subset. |
| `COLOR-CHANNEL` | `img_001_authentic_base` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (targets inter-channel color shift anomalies). |
| `COLOR-CHANNEL` | `img_color_channel_shift` | PNG | `RUN` | `APPLIED` | 50.95 | 1 | Inter-channel gradient divergence analysis. |
| `COLOR-CHANNEL` | `img_comp_q50` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (targets inter-channel color shift anomalies). |
| `COLOR-CHANNEL` | `img_comp_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (targets inter-channel color shift anomalies). |
| `COLOR-CHANNEL` | `img_comp_q95` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (targets inter-channel color shift anomalies). |
| `COLOR-CHANNEL` | `img_copymove_translated` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (targets inter-channel color shift anomalies). |
| `COLOR-CHANNEL` | `img_false_positive_texture` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (targets inter-channel color shift anomalies). |
| `COLOR-CHANNEL` | `img_geom_resample_bicubic` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (targets inter-channel color shift anomalies). |
| `COLOR-CHANNEL` | `img_jpeg_double_q95_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (targets inter-channel color shift anomalies). |
| `COLOR-CHANNEL` | `img_noise_gaussian_localized` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (targets inter-channel color shift anomalies). |
| `COLOR-CHANNEL` | `img_splicing_donor` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (targets inter-channel color shift anomalies). |
| `FOURIER` | `img_001_authentic_base` | PNG | `RUN` | `APPLIED` | 37.36 | 1 | 2D FFT magnitude spectrum and radial band statistics. |
| `FOURIER` | `img_color_channel_shift` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated Fourier evaluation subset. |
| `FOURIER` | `img_comp_q50` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated Fourier evaluation subset. |
| `FOURIER` | `img_comp_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated Fourier evaluation subset. |
| `FOURIER` | `img_comp_q95` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated Fourier evaluation subset. |
| `FOURIER` | `img_copymove_translated` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated Fourier evaluation subset. |
| `FOURIER` | `img_false_positive_texture` | PNG | `RUN` | `APPLIED` | 34.56 | 1 | 2D FFT magnitude spectrum and radial band statistics. |
| `FOURIER` | `img_geom_resample_bicubic` | PNG | `RUN` | `APPLIED` | 44.16 | 1 | 2D FFT magnitude spectrum and radial band statistics. |
| `FOURIER` | `img_jpeg_double_q95_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated Fourier evaluation subset. |
| `FOURIER` | `img_noise_gaussian_localized` | PNG | `RUN` | `APPLIED` | 45.47 | 1 | 2D FFT magnitude spectrum and radial band statistics. |
| `FOURIER` | `img_splicing_donor` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated Fourier evaluation subset. |
| `ADVANCED-NOISE` | `img_001_authentic_base` | PNG | `RUN` | `APPLIED` | 112.35 | 6 | Multi-band wavelet noise residual analysis. |
| `ADVANCED-NOISE` | `img_color_channel_shift` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content. |
| `ADVANCED-NOISE` | `img_comp_q50` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content. |
| `ADVANCED-NOISE` | `img_comp_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content. |
| `ADVANCED-NOISE` | `img_comp_q95` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content. |
| `ADVANCED-NOISE` | `img_copymove_translated` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content. |
| `ADVANCED-NOISE` | `img_false_positive_texture` | PNG | `RUN` | `APPLIED` | 66.45 | 6 | Multi-band wavelet noise residual analysis. |
| `ADVANCED-NOISE` | `img_geom_resample_bicubic` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content. |
| `ADVANCED-NOISE` | `img_jpeg_double_q95_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content. |
| `ADVANCED-NOISE` | `img_noise_gaussian_localized` | PNG | `RUN` | `APPLIED` | 57.92 | 6 | Multi-band wavelet noise residual analysis. |
| `ADVANCED-NOISE` | `img_splicing_donor` | PNG | `RUN` | `APPLIED` | 60.31 | 6 | Multi-band wavelet noise residual analysis. |
| `RESAMPLING` | `img_001_authentic_base` | PNG | `RUN` | `APPLIED` | 39.75 | 5 | Second-derivative periodic interpolation spectrum analysis. |
| `RESAMPLING` | `img_color_channel_shift` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no resampling or baseline comparison). |
| `RESAMPLING` | `img_comp_q50` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no resampling or baseline comparison). |
| `RESAMPLING` | `img_comp_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no resampling or baseline comparison). |
| `RESAMPLING` | `img_comp_q95` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no resampling or baseline comparison). |
| `RESAMPLING` | `img_copymove_translated` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no resampling or baseline comparison). |
| `RESAMPLING` | `img_false_positive_texture` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no resampling or baseline comparison). |
| `RESAMPLING` | `img_geom_resample_bicubic` | PNG | `RUN` | `APPLIED` | 41.63 | 5 | Second-derivative periodic interpolation spectrum analysis. |
| `RESAMPLING` | `img_jpeg_double_q95_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no resampling or baseline comparison). |
| `RESAMPLING` | `img_noise_gaussian_localized` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no resampling or baseline comparison). |
| `RESAMPLING` | `img_splicing_donor` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no resampling or baseline comparison). |
| `CLONE-BLOCK` | `img_001_authentic_base` | PNG | `RUN` | `APPLIED` | 211.65 | 5 | Authentic negative baseline / repetitive texture challenge. |
| `CLONE-BLOCK` | `img_color_channel_shift` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-BLOCK` | `img_comp_q50` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-BLOCK` | `img_comp_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-BLOCK` | `img_comp_q95` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-BLOCK` | `img_copymove_translated` | PNG | `RUN` | `APPLIED` | 246.54 | 5 | Cloning detection on translated copy-move target. |
| `CLONE-BLOCK` | `img_false_positive_texture` | PNG | `RUN` | `APPLIED` | 244.68 | 5 | Authentic negative baseline / repetitive texture challenge. |
| `CLONE-BLOCK` | `img_geom_resample_bicubic` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-BLOCK` | `img_jpeg_double_q95_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-BLOCK` | `img_noise_gaussian_localized` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-BLOCK` | `img_splicing_donor` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-KEYPOINT` | `img_001_authentic_base` | PNG | `RUN` | `APPLIED` | 132.69 | 6 | Authentic negative baseline / repetitive texture challenge. |
| `CLONE-KEYPOINT` | `img_color_channel_shift` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-KEYPOINT` | `img_comp_q50` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-KEYPOINT` | `img_comp_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-KEYPOINT` | `img_comp_q95` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-KEYPOINT` | `img_copymove_translated` | PNG | `RUN` | `APPLIED` | 81.38 | 6 | Cloning detection on translated copy-move target. |
| `CLONE-KEYPOINT` | `img_false_positive_texture` | PNG | `RUN` | `APPLIED` | 89.28 | 6 | Authentic negative baseline / repetitive texture challenge. |
| `CLONE-KEYPOINT` | `img_geom_resample_bicubic` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-KEYPOINT` | `img_jpeg_double_q95_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-KEYPOINT` | `img_noise_gaussian_localized` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `CLONE-KEYPOINT` | `img_splicing_donor` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Inapplicable target content (no copy-move manipulation or repetitive texture challenge). |
| `PRNU` | `img_001_authentic_base` | PNG | `RUN` | `APPLIED` | 86.16 | 4 | Uncalibrated sensor pattern noise energy extraction. |
| `PRNU` | `img_color_channel_shift` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated PRNU evaluation subset. |
| `PRNU` | `img_comp_q50` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated PRNU evaluation subset. |
| `PRNU` | `img_comp_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated PRNU evaluation subset. |
| `PRNU` | `img_comp_q95` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated PRNU evaluation subset. |
| `PRNU` | `img_copymove_translated` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated PRNU evaluation subset. |
| `PRNU` | `img_false_positive_texture` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated PRNU evaluation subset. |
| `PRNU` | `img_geom_resample_bicubic` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated PRNU evaluation subset. |
| `PRNU` | `img_jpeg_double_q95_q75` | JPEG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated PRNU evaluation subset. |
| `PRNU` | `img_noise_gaussian_localized` | PNG | `RUN` | `APPLIED` | 67.72 | 4 | Uncalibrated sensor pattern noise energy extraction. |
| `PRNU` | `img_splicing_donor` | PNG | `SKIP (Target)` | `SKIPPED` | - | 0 | Target not in designated PRNU evaluation subset. |
| `CAMERA-ID` | `img_001_authentic_base` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires calibrated camera reference profile library; none available in synthetic lab suite. |
| `CAMERA-ID` | `img_color_channel_shift` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires calibrated camera reference profile library; none available in synthetic lab suite. |
| `CAMERA-ID` | `img_comp_q50` | JPEG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires calibrated camera reference profile library; none available in synthetic lab suite. |
| `CAMERA-ID` | `img_comp_q75` | JPEG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires calibrated camera reference profile library; none available in synthetic lab suite. |
| `CAMERA-ID` | `img_comp_q95` | JPEG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires calibrated camera reference profile library; none available in synthetic lab suite. |
| `CAMERA-ID` | `img_copymove_translated` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires calibrated camera reference profile library; none available in synthetic lab suite. |
| `CAMERA-ID` | `img_false_positive_texture` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires calibrated camera reference profile library; none available in synthetic lab suite. |
| `CAMERA-ID` | `img_geom_resample_bicubic` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires calibrated camera reference profile library; none available in synthetic lab suite. |
| `CAMERA-ID` | `img_jpeg_double_q95_q75` | JPEG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires calibrated camera reference profile library; none available in synthetic lab suite. |
| `CAMERA-ID` | `img_noise_gaussian_localized` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires calibrated camera reference profile library; none available in synthetic lab suite. |
| `CAMERA-ID` | `img_splicing_donor` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires calibrated camera reference profile library; none available in synthetic lab suite. |
| `GEOMETRY-PERSPECTIVE` | `img_001_authentic_base` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires 3D man-made rectilinear vanishing lines; controlled fixtures are synthetic 2D patches. |
| `GEOMETRY-PERSPECTIVE` | `img_color_channel_shift` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires 3D man-made rectilinear vanishing lines; controlled fixtures are synthetic 2D patches. |
| `GEOMETRY-PERSPECTIVE` | `img_comp_q50` | JPEG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires 3D man-made rectilinear vanishing lines; controlled fixtures are synthetic 2D patches. |
| `GEOMETRY-PERSPECTIVE` | `img_comp_q75` | JPEG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires 3D man-made rectilinear vanishing lines; controlled fixtures are synthetic 2D patches. |
| `GEOMETRY-PERSPECTIVE` | `img_comp_q95` | JPEG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires 3D man-made rectilinear vanishing lines; controlled fixtures are synthetic 2D patches. |
| `GEOMETRY-PERSPECTIVE` | `img_copymove_translated` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires 3D man-made rectilinear vanishing lines; controlled fixtures are synthetic 2D patches. |
| `GEOMETRY-PERSPECTIVE` | `img_false_positive_texture` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires 3D man-made rectilinear vanishing lines; controlled fixtures are synthetic 2D patches. |
| `GEOMETRY-PERSPECTIVE` | `img_geom_resample_bicubic` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires 3D man-made rectilinear vanishing lines; controlled fixtures are synthetic 2D patches. |
| `GEOMETRY-PERSPECTIVE` | `img_jpeg_double_q95_q75` | JPEG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires 3D man-made rectilinear vanishing lines; controlled fixtures are synthetic 2D patches. |
| `GEOMETRY-PERSPECTIVE` | `img_noise_gaussian_localized` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires 3D man-made rectilinear vanishing lines; controlled fixtures are synthetic 2D patches. |
| `GEOMETRY-PERSPECTIVE` | `img_splicing_donor` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires 3D man-made rectilinear vanishing lines; controlled fixtures are synthetic 2D patches. |
| `PHYSICS-LIGHTING` | `img_001_authentic_base` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires solar geometry and specular shadow metadata; unavailable in synthetic lab fixtures. |
| `PHYSICS-LIGHTING` | `img_color_channel_shift` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires solar geometry and specular shadow metadata; unavailable in synthetic lab fixtures. |
| `PHYSICS-LIGHTING` | `img_comp_q50` | JPEG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires solar geometry and specular shadow metadata; unavailable in synthetic lab fixtures. |
| `PHYSICS-LIGHTING` | `img_comp_q75` | JPEG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires solar geometry and specular shadow metadata; unavailable in synthetic lab fixtures. |
| `PHYSICS-LIGHTING` | `img_comp_q95` | JPEG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires solar geometry and specular shadow metadata; unavailable in synthetic lab fixtures. |
| `PHYSICS-LIGHTING` | `img_copymove_translated` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires solar geometry and specular shadow metadata; unavailable in synthetic lab fixtures. |
| `PHYSICS-LIGHTING` | `img_false_positive_texture` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires solar geometry and specular shadow metadata; unavailable in synthetic lab fixtures. |
| `PHYSICS-LIGHTING` | `img_geom_resample_bicubic` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires solar geometry and specular shadow metadata; unavailable in synthetic lab fixtures. |
| `PHYSICS-LIGHTING` | `img_jpeg_double_q95_q75` | JPEG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires solar geometry and specular shadow metadata; unavailable in synthetic lab fixtures. |
| `PHYSICS-LIGHTING` | `img_noise_gaussian_localized` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires solar geometry and specular shadow metadata; unavailable in synthetic lab fixtures. |
| `PHYSICS-LIGHTING` | `img_splicing_donor` | PNG | `SKIP (Prereq)` | `SKIPPED` | - | 0 | Requires solar geometry and specular shadow metadata; unavailable in synthetic lab fixtures. |


## 4. Category A: Classical DIP Image Fidelity Results

Evaluates compression distortion across JPEG quality factors against authentic reference baseline (`fixture_001_authentic/original.png`) using the pure NumPy Batch 1 metrics.

| Comparison Target | Quality Setting | Dimensions | Mean Squared Error (MSE) | PSNR (dB) | SSIM | Data Range Policy |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `img_comp_q95` | JPEG Q=95 | 256x256 | 5.7339 | 40.5463 dB | 0.9842 | uint8: inferred data_range=255.0 |
| `img_comp_q75` | JPEG Q=75 | 256x256 | 8.9818 | 38.5972 dB | 0.9739 | uint8: inferred data_range=255.0 |
| `img_comp_q50` | JPEG Q=50 | 256x256 | 11.3169 | 37.5935 dB | 0.9674 | uint8: inferred data_range=255.0 |

> **Fidelity Finding:** Monotonic degradation holds strictly: MSE increases ($5.7339 \to 8.9818 \to 11.3169$) and PSNR/SSIM decrease ($40.5463\text{ dB} \to 38.5972\text{ dB} \to 37.5935\text{ dB}$; $0.9842 \to 0.9739 \to 0.9674$) as JPEG compression quality is lowered ($Q=95 \to Q=75 \to Q=50$).

## 5. Category B: Spatial Tamper Localization Results

Computed exclusively on fixtures possessing pixel-accurate ground-truth masks (`fixture_005` to `fixture_008`). Evaluated at primary binarization threshold $th=64.0$.

| Engine / Modality | Target Fixture | Eval Mode | IoU | Precision | Recall | F1-Score | Dice | TP | FP | FN | TN |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **NOISE (Gaussian)** | `img_noise_gaussian_localized` | PIXEL_MASK | 0.3781 | 0.9124 | 0.3923 | 0.5487 | 0.5487 | 2511 | 241 | 3889 | 58895 |
| **NOISE (Median)** | `img_noise_gaussian_localized` | PIXEL_MASK | 0.2934 | 0.9942 | 0.2939 | 0.4537 | 0.4537 | 1881 | 11 | 4519 | 59125 |
| **NOISE (Gaussian)** | `img_splicing_donor` | PIXEL_MASK | 0.0505 | 0.3069 | 0.0569 | 0.0961 | 0.0961 | 205 | 463 | 3395 | 61473 |
| **NOISE (Median)** | `img_splicing_donor` | PIXEL_MASK | 0.0125 | 0.8491 | 0.0125 | 0.0246 | 0.0246 | 45 | 8 | 3555 | 61928 |
| **Standard Gradient Divergence** | `img_color_channel_shift` | PIXEL_MASK | 0.0313 | 0.0392 | 0.1350 | 0.0608 | 0.0608 | 864 | 21166 | 5536 | 37970 |
| **Sliding-Window DCT Sort** | `img_copymove_translated` | BOUNDING_BOX | 0.0732 (BBox) | N/A (BBox) | N/A (BBox) | N/A (BBox) | N/A (BBox) | - | - | - | - |

### 5.1 Analysis of Spatial Localization Performance

- **Median Filter Noise Estimation on Localized Noise (`fixture_007`):**
  * *Confusion Counts:* $TP = 1881$, $FP = 11$, $FN = 4519$, $TN = 59125$ ($N = 65536$).
  * *Metrics:* $IoU = 0.2934$, $\text{Precision} = 0.9942$ ($99.42\%$), $\text{Recall} = 0.2939$ ($29.39\%$), $F_1 = 0.4537$.
  * *Scientific Explanation of High Precision vs. Lower Recall:* The median filter computes the non-linear residual $|I - \text{median}_k(I)|$. On authentic background gradients and natural edges, the local median closely matches authentic pixels, almost entirely eliminating false edge leakage ($FP = 11$, false positive rate $0.018\%$). Thus, any residual exceeding threshold $th=64.0$ is overwhelmingly genuine tampering ($\text{Precision} = 99.42\%$). However, localized zero-mean Gaussian noise contains many pixels whose perturbations fall below $64.0$ or are partially preserved in the local median window, leading to $FN = 4519$ and a lower recall of $29.39\%$.
  * *Contrast with Linear Gaussian Filter:* Gaussian residual estimation achieves higher recall ($39.23\%$, $TP = 2511$) by capturing more subtle variations, but incurs significantly higher false alarm leakage along high-frequency edges ($FP = 241$, $\text{Precision} = 91.24\%$).
- **Bounding-Box Evaluation Mode (`CLONE-BLOCK`):**
  * Evaluated via spatial bounding-box intersection over union (`BBox IoU = 0.0732`) against ground-truth cloned patch $[150, 150, 210, 210]$. Pixel confusion metrics ($TP, FP, FN, TN$) do not apply to bounding-box coordinates and are designated as `N/A (BBox)`.

## 6. Category C: False-Positive Resistance on Negative Controls

Authentic negative controls (`fixture_001` smooth baseline, `fixture_009` repetitive brick texture) test algorithmic susceptibility to false alarms on pristine content.

| Engine ID | Target Fixture | Execution Status | Primary Metric / Observation Summary |
| :--- | :--- | :---: | :--- |
| **NOISE** | `img_001_authentic_base` | `APPLIED` | GLOBAL_VARIANCE=1.8483 |
| **COPY_MOVE** | `img_001_authentic_base` | `APPLIED` | MATCH_COUNT=0 |
| **CLONE-BLOCK** | `img_001_authentic_base` | `APPLIED` | BLOCK_MATCH_COUNT=10394, MATCH_CLUSTER_COUNT=485 |
| **CLONE-KEYPOINT** | `img_001_authentic_base` | `APPLIED` | KEYPOINT_COUNT=39, RAW_MATCH_COUNT=14 |
| **RESAMPLING** | `img_001_authentic_base` | `APPLIED` | HORIZONTAL_PERIODICITY=2.0, VERTICAL_PERIODICITY=2.0 |
| **NOISE** | `img_false_positive_texture` | `APPLIED` | GLOBAL_VARIANCE=548.6585 |
| **COPY_MOVE** | `img_false_positive_texture` | `APPLIED` | MATCH_COUNT=641 |
| **CLONE-BLOCK** | `img_false_positive_texture` | `APPLIED` | BLOCK_MATCH_COUNT=11893, MATCH_CLUSTER_COUNT=46 |
| **CLONE-KEYPOINT** | `img_false_positive_texture` | `APPLIED` | KEYPOINT_COUNT=1180, RAW_MATCH_COUNT=1180 |
| **RESAMPLING** | `img_false_positive_texture` | `APPLIED` | HORIZONTAL_PERIODICITY=3.2, VERTICAL_PERIODICITY=3.2 |

### 6.1 Copy-Move & Keypoint Matching Reconciliation on Negative Controls

A critical scientific finding from the controlled evaluation is the distinct operational behavior between `COPY_MOVE` (`LegacyCopyMoveAdapter` wrapping `CopyMoveEngine`) and `CLONE-KEYPOINT` (`CloneKeypointEngine`):

1. **Smooth Authentic Baseline (`fixture_001` / `img_001_authentic_base`):**
   - `COPY_MOVE`: Detected 0 SIFT keypoints, 0 raw matches, 0 geometric inliers, 0 candidate clusters. Emitted observation `MATCH_COUNT = 0` (status `APPLIED`, direction `informational`). Zero false positives.
   - `CLONE-KEYPOINT`: Detected 39 ORB/BRISK keypoints, 14 raw candidates, 2 filtered matches, 0 affine RANSAC inliers, 0 candidate regions. Emitted `GEOMETRIC_INLIER_COUNT = 0`, `CANDIDATE_REGION_COUNT = 0`. Zero false positives.

2. **Repetitive Brick Texture (`fixture_009` / `img_false_positive_texture`):**
   - `COPY_MOVE`: SIFT extracted 641 keypoints across brick corners and mortar joints. During descriptor matching, 641 correspondence candidates were evaluated. Crucially, after ratio test ($0.75$) and spatial distance filtering ($50.0$), **0 pairs passed to geometric inliers** (`geometric_inliers = 0`). Candidate clusters: 0 (`source_bounding_box = None`). Accepted tamper detections: 0. The adapter's observation `MATCH_COUNT` reflects raw matching candidates (`641`), but direction is strictly `informational` and no cloning was flagged.
   - `CLONE-KEYPOINT`: Detected 1180 keypoints, 1180 raw match candidates, 235 distance-filtered pairs, and **24 geometric inliers** (inlier ratio $0.1021$) forming 1 candidate region. The affine consensus model identified an inverted symmetry (scale $0.998$, rotation $-179.9^\circ$, mean error $0.438\text{ px}$) between periodic mortar intersections across the repetitive brick facade.
   - **Scientific Reconciliation:** `COPY_MOVE` successfully avoided false cloning detection at the geometric verification stage (0 inliers, 0 clusters, 0 accepted regions). `CLONE-KEYPOINT` identified genuine repetitive affine symmetry in the physical brick pattern, demonstrating empirically why geometric cloning algorithms must surface prominent false-alarm warnings on periodic textures as mandated by Stage 3 roadmap Section 9.3.

## 7. Scientific Limitations & Scope Boundaries

1. **Controlled Synthetic Benchmark:** The evaluation suite consists of 11 targeted synthetic fixtures.    It does not represent a statistically sampled real-world dataset.
2. **No Generalization Claim:** Passing scores on these controlled fixtures demonstrate implementation correctness,    not universal in-the-wild detection efficacy.
3. **Fidelity Metrics Isolation:** PSNR and SSIM measure signal difference, not authenticity. High SSIM does not imply    an image is untampered.
4. **Negative Controls Scope:** Resistance to false alarms on two controlled fixtures does not guarantee false-alarm immunity    across natural photographic textures.
