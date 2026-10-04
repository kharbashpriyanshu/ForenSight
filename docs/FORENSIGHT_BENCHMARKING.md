# ForenSight Scientific Evaluation & Benchmark Harness v1.0.0

## 1. Executive Summary & Purpose
The **ForenSight Forensic Evaluation & Benchmark Harness** provides empirical, reproducible, and scientifically defensible testing infrastructure for all 16 ForenSight forensic engines. 

Unlike machine learning evaluation frameworks that seek to maximize a single aggregate accuracy metric, digital image forensics requires strict methodology:
1. **Physical & Mathematical Prerequisites**: Different algorithms inspect different physical traces (sensor noise, quantization artifacts, periodic interpolation, CFA interpolation, or keypoint repetition). When an image does not possess the physical container prerequisites (e.g. evaluating DCT coefficients on a lossless PNG), the engine must report `NOT_APPLICABLE`.
2. **Strict Guardrail**: `NOT_APPLICABLE` must **never** be interpreted as negative evidence or proof of authenticity.
3. **Non-Circularity**: Ground-truth masks and labels must originate from controlled generation or external human-annotated datasets—never circularly from forensic engine predictions.
4. **No Aggregate Ranking**: Engines must not be ranked as "best" or "worst", because each algorithm addresses distinct empirical modalities.

---

## 2. Scientific Evaluation Principles

### 2.1 Separation of Outcomes
Every evaluation maps to one of four mutually exclusive terminal states:
- **`COMPLETED` / `APPLIED`**: The image meets all mathematical and format prerequisites, and the engine executed to completion, outputting empirical observations and artifacts.
- **`NOT_APPLICABLE`**: The image format, dimensions, or compression history do not satisfy the engine's mathematical input contract. **This is not an error, nor is it evidence of image integrity.**
- **`FAILED`**: The engine encountered an unhandled runtime error, process boundary breach, or corrupted bitstream.
- **`PENDING` / `RUNNING`**: Active job execution state.

### 2.2 Determinism Protocol
Forensic admissibility requires bit-for-bit reproducibility:
- For every evaluation, the engine is executed **3 consecutive times** under identical execution contexts.
- The SHA-256 digests of all generated spatial artifacts (heatmaps, clone masks, residual matrices) and observation payloads are verified.
- If any divergence occurs, `determinism_verified` is flagged as `False`.

### 2.3 Spatial Localization Metrics
For localized tampering (copy-move, splicing, resampling, inpainting):
- **Intersection over Union (IoU)**: $\frac{|P \cap GT|}{|P \cup GT|}$
- **Dice Similarity Coefficient (F1)**: $\frac{2 |P \cap GT|}{|P| + |GT|}$
- **Pixel-Level Precision & Recall**: Derived from binarized detection heatmaps against ground-truth masks.

---

## 3. Supported Datasets

1. **ForenSight Controlled Synthetic Suite (`controlled-v1`)**:
   - 11 deterministic fixtures across 8 forensic modalities:
     - JPEG Quantization / Compression Tampering
     - Geometric Resampling & Rotation
     - Block-Based Copy-Move
     - Keypoint-Based Copy-Move
     - Spatial Splicing / Compositing
     - Inconsistent Noise Scales (MAD)
     - Color Temperature Inconsistencies
     - False-Positive Control (Repetitive Natural Textures)
2. **CASIA Image Tampering Dataset v2.0**:
   - External manifest adapter supporting authentic and spliced/copy-move images with ground-truth masks.
3. **Columbia Uncompressed Image Splicing Dataset**:
   - High-resolution uncompressed TIFF image pairs evaluating raw demosaicing and edge transitions.
4. **NIST OpenMFC / Media Forensics Challenge**:
   - Complex multi-operation manipulation challenge datasets.

---

## 4. Execution Interface

### 4.1 CLI Interface
```bash
# Generate controlled dataset fixtures
python -m app.benchmark generate --output datasets/controlled/v1 --seed 42

# Execute benchmark suite across all engines (Controlled)
python -m app.benchmark run --dataset-dir datasets/controlled/v1 --engines all --output datasets/benchmark

# Register & Snapshot an external dataset
python -m app.benchmark register-dataset --dataset-dir datasets/external/casia2

# Verify snapshot integrity
python -m app.benchmark verify-dataset --dataset-dir datasets/external/casia2

# Run external dataset benchmark (Step 10)
python -m app.benchmark run-external --dataset-dir datasets/external/casia2 --output datasets/benchmark/external

# Reproduce previous external benchmark run
python -m app.benchmark reproduce --run-dir datasets/benchmark/external

# Run real-camera PRNU validation protocol
python -m app.benchmark prnu-real --output datasets/benchmark/prnu_real
```

### 4.2 REST API Endpoints
- `GET /api/benchmark/datasets`: Enumerate available controlled and external manifests.
- `POST /api/benchmark/run`: Trigger controlled benchmark evaluation run.
- `POST /api/benchmark/register-dataset`: Validate structure and compute cryptographic snapshot.
- `POST /api/benchmark/verify-dataset`: Verify on-disk files against cryptographic snapshot.
- `POST /api/benchmark/run-external`: Execute scientifically hardened external dataset benchmark.
- `GET /api/benchmark/reports/external/latest`: Retrieve latest external benchmark JSON summary.
- `POST /api/benchmark/reproduce`: Test bit-for-bit reproduction of a benchmark run.
- `POST /api/benchmark/prnu-real`: Run multi-reference MLE PRNU protocol on real camera images.

---

## 5. Report Artifacts
Each benchmark run outputs synchronized report artifacts adhering to the 15-section scientific reporting structure:
- `external_benchmark_results.json`: Machine-readable metrics, environment snapshot, authentic vs. manipulated separation.
- `external_benchmark_report.md`: Formatted Markdown audit document documenting observations, ground truth, and scope boundaries.
- `external_benchmark_report.html`: Self-contained visual Light-Theme HTML report for reproducible empirical review.
- `benchmark_observations.jsonl`: Streaming row-level observation log for large-scale external evaluations.

