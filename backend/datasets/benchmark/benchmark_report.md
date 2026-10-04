# ForenSight Scientific Benchmark & Evaluation Report

- **Run ID**: `4efd6cba-4d44-4f2c-809f-b2a6c12f9ff5`
- **Dataset**: `controlled-v1` (Version `1.0.0`)
- **Created At**: 2026-09-22T09:38:50Z
- **Images Evaluated**: 11
- **Total Engine Evaluations**: 22
- **Total Elapsed Time**: 2.36s
- **3-Run Determinism**: VERIFIED (Run1 == Run2 == Run3)

---

## 1. Scientific Principles & Methodology

> [!IMPORTANT]
> **No Universal Accuracy Score**: ForenSight strictly avoids reducing diverse empirical modalities
> to a single composite percentage. Applicability (`NOT_APPLICABLE`) is rigorously separated from
> negative forensic attribution.

- **OBSERVED**: What the engine extracted from the decoded spatial or bitstream data.
- **EXPECTED**: The controlled transformation introduced by the laboratory fixture.
- **EVALUATED**: Objective statistical metrics (IoU, precision, recall, PCE margin, runtime).
- **INTERPRETATION**: Forensic significance within established scientific literature.
- **LIMITATION**: Boundary conditions where the modality cannot guarantee conclusive results.

---

## 2. Engine Evaluation Summary Table

| Engine ID | Version | Applied | Inapplicable | Failed | Applicability Rate | Success Rate | Mean Runtime |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `ADVANCED-NOISE` | `1.0.0` | 11 | 0 | 0 | 100.0% | 100.0% | 107.4 ms |
| `RESAMPLING` | `1.0.0` | 11 | 0 | 0 | 100.0% | 100.0% | 93.9 ms |

---

## 3. Spatial Localization & Domain Metrics

| Engine ID | Metric Category | Results |
| :--- | :--- | :--- |
| `ADVANCED-NOISE` | Latency Distribution | P95: 124.0 ms, Completed: 11 |
| `RESAMPLING` | Latency Distribution | P95: 164.9 ms, Completed: 11 |

---

## 4. Scientific Limitations & Boundaries

- Evaluations conducted on controlled and registered external datasets.
- Applicability is strictly separated from negative forensic attribution.
- No universal accuracy score is generated; refer to individual engine distributions.