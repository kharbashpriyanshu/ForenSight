# ForenSight V4 — External Benchmark Protocol & 15-Section Reporting

## 1. Scientific Protocol Architecture
The External Benchmark Harness executes forensic engines against registered external datasets under strict reproducible controls.

```
External Dataset
       │
       ▼
Dataset Adapter ──► SHA-256 Validation & Safe Path Resolution
       │
       ├─────────────────────────┬─────────────────────────┐
       ▼                         ▼                         ▼
Authentic Cohort          Manipulated Cohort        Environment Snapshot
(Empirical Triggers)      (Manipulation Breakdown) (OS, Python, Git)
       │                         │                         │
       └─────────────────────────┼─────────────────────────┘
                                 │
                                 ▼
                     16 Production V4 Engines
                                 │
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
          Streaming Observations       15-Section Reports
        (benchmark_observations.jsonl) (JSON, MD, Light HTML)
```

---

## 2. The Standardized 15-Section Report Structure
All external benchmark evaluations produce reports adhering to this 15-section structure:

1. **Benchmark Metadata**: Dataset identifier, release version, execution timestamp, runtime environment, git commit.
2. **Dataset Provenance and Integrity**: File count, mask count, cryptographic snapshot hash, pre-validation status.
3. **Dataset Limitations and Caveats**: Known compression artifacts, unverified sensor chains, annotation uncertainties.
4. **Evaluation Scope**: Engines evaluated, version tags, rationale for modality inclusion/exclusion.
5. **Execution Summary**: Total evaluations, elapsed runtime, completed, inapplicable, failed, determinism status.
6. **Applicability Analysis**: Per-engine applicability percentages and structural reasons for container inapplicability.
7. **Determinism and Reproducibility**: 3-run repeatability rate, bit-for-bit finding parity, environment match.
8. **Authentic Image Evaluation**: False positive sensitivity characterization on known authentic images (textures, edges, gradients).
9. **Manipulated Image Evaluation**: Detection breakdown across manipulation modalities (copy-move, splicing, resampling, etc.).
10. **Localization Performance**: Pixel-level IoU, precision, recall, and F1 (or explicitly marked `NOT_EVALUATED` if no mask).
11. **Processing Sensitivity and Robustness**: Performance stratified across JPEG quality levels, resolution bands, and format types.
12. **Failure Mode Analysis**: Breakdown of unexpected exceptions, out-of-memory guards, or numerical instability.
13. **Per-Engine Detailed Scorecards**: Comprehensive individual engine profiles without cross-engine rank.
14. **Comparative Observation**: Complementarity across orthogonal modalities (Fourier, spatial noise, DCT, PRNU).
15. **Scientific Conclusions & Boundaries**: Documented scope limits and anti-misuse guidelines.

---

## 3. Streaming Observations Export (`benchmark_observations.jsonl`)
Evaluation outputs stream observation rows line-by-line in normalized JSON format without duplicating large binary image payloads.

---

## 4. Run Reproduction Protocol
Given an artifact directory from a prior run, `reproduce_benchmark_run` re-executes the benchmark against the target dataset and validates:
- Environment parity (Python interpreter, NumPy, SciPy versions).
- Finding stability (100% match rate across engine statuses and metrics).
- Reproducibility hash verification.
