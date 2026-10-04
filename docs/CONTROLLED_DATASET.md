# ForenSight Controlled Synthetic Benchmark Suite (`controlled-v1`)

## 1. Design Rationale
Evaluating digital image forensic algorithms exclusively on external, uncontrolled "wild" internet images introduces confounding variables:
- Unknown compression history and camera post-processing pipelines.
- Imprecise ground-truth boundary delineation.
- Inability to parameterize manipulation strength.

The **ForenSight Controlled Synthetic Benchmark Suite** generates mathematically rigorous, parameterized test fixtures across 8 forensic modalities using reproducible seeds.

---

## 2. Modality Fixtures & Ground Truth

| Modality | Fixture ID | Operation | Ground Truth Specification |
| :--- | :--- | :--- | :--- |
| **Authentic Pristine** | `controlled_pristine_base` | Synthetic natural gradients with procedural texture. | Authentic; No manipulation mask (`null`). |
| **JPEG Compression** | `controlled_jpeg_q75` | Pristine image compressed at Q75 and re-saved. | Global compression artifact; No spatial mask. |
| **Double Compression** | `controlled_jpeg_double_q90_q70` | Primary Q90 quantization followed by localized/global Q70 compression. | Secondary grid phase alignment & quantization mismatch. |
| **Resampling: Scaling** | `controlled_resampling_scaled` | Bicubic upscaling by 1.45x introducing periodic interpolation traces. | Periodic derivative correlation peak expected. |
| **Resampling: Rotation** | `controlled_resampling_rotated` | Bi-linear rotation by 15° with boundary cropping. | Periodic interpolation artifact; ground truth mask at rotated area. |
| **Copy-Move: Block** | `controlled_copymove_block` | $48 \times 48$ pixel textured patch duplicated with $+60$ px translation. | Exact ground-truth mask with donor and clone bounding boxes. |
| **Copy-Move: Scaled/Rotated**| `controlled_copymove_keypoint` | Textured keypoint-dense patch duplicated, rotated 30°, and scaled 1.2x. | Exact ground-truth mask at transformed duplicate location. |
| **Spatial Splicing** | `controlled_splicing_patch` | Foreign textured block inserted into base scene. | Binary mask ($255$ at spliced patch coordinates). |
| **Noise Residual Delta** | `controlled_noise_inconsistent` | High-frequency Gaussian noise residual ($\sigma = 18$) injected into quadrant. | Binary mask covering injected noise quadrant; MAD discrepancy $\ge 12.0$. |
| **Color Temperature** | `controlled_color_adjustment` | Chrominance balance shift ($\Delta U = +25, \Delta V = -30$) in localized zone. | Binary mask covering shifted zone. |
| **Repetitive FP Control** | `controlled_texture_repetitive` | Pristine repeating checkerboard pattern designed to test false-positive resistance. | Authentic; 0 false positive clusters expected. |

---

## 3. Deterministic Generation
To re-generate the controlled dataset fixtures:
```bash
python -m app.benchmark generate --output datasets/controlled/v1 --seed 42
```
All random number generators in `controlled_generator.py` are explicitly seeded with `numpy.random.RandomState(seed)`, guaranteeing bit-identical test fixtures across platforms.
