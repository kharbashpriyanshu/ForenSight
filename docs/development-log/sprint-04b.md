# Sprint 4B Development Log: Noise API Integration & Visualization

## 1. What was implemented
The standalone Noise Residual Engine was successfully integrated into the ForenSight FastAPI application. We created the necessary API orchestration routes, expanded the React dashboard to trigger and visualize the artifacts, and linked the results into the generic Evidence-Analysis ORM architecture.

## 2. API architecture
Created a new `POST /api/evidence/{evidence_id}/analysis/noise` endpoint.
It ensures that evidence exists, hands it over to the analyzer service, and returns structured findings. The endpoint explicitly maps math/IO exceptions (like `UnsupportedFormatError`) into `HTTP 400` errors, guaranteeing that backend 500s are only thrown for genuine application failures.

## 3. Analyzer/service architecture
Introduced `app/forensics/noise/analyzer.py`. This bridges the Database `Evidence` to the `NoiseEngine`. It captures the dictionary response of the engine and seamlessly maps it into the `Analysis.structured_findings` JSON column. 

## 4. Database architecture
No schema migrations were needed. The `Analysis` model from Sprint 2 flexibly accepted `analysis_type="NOISE"`. This guarantees our database layer remains tightly focused and agnostic to the mathematical specifics of future forensic modules.

## 5. Artifact storage
Noise artifacts (Global and Local maps) are stored in `storage/analyses/noise/`. 
To preserve rigorous filesystem security, the API does not expose absolute server paths. It securely yields relative paths (`analyses/noise/noise_residual_UUID.jpg`) which are resolved dynamically by the previously established artifact-serving proxy route.

## 6. Frontend changes
Added "Run Noise Analysis" capabilities to the React `Dashboard.tsx`.
When activated, a purple-themed results card appears containing:
- Global Statistics (Mean, Median, Max, Std Dev).
- Local Window Configurations (e.g., 16x16 window, 16px stride).
- Direct img renderings of the Global and Local noise maps safely requested via the API proxy.

## 7. Scientific interpretation
To prevent misuse, the UI contains a hardcoded warning:
> **Important:** Elevated residual magnitude was observed in portions of the image. This may reflect structural detail, texture, compression, or image-processing history. High residual ≠ manipulation.

**Signed vs Absolute Residual:** A conceptual distinction was documented regarding $R_s = I - S_{hat}$ versus $R_{abs} = |I - S_{hat}|$. The engine only exposes absolute residuals for statistics and visualization. This choice was deliberately retained to simplify visualization mapping and because magnitude is the primary driver of structural anomalies at this stage.

## 8. Security controls
- **Path Traversal Blocking**: Reused the `GET /api/artifacts/{path}` endpoint from Sprint 3B, ensuring users cannot request arbitrary OS files.
- **Evidence Immutability**: All artifacts are strictly placed in a parallel `analyses/` branch. The original evidence SHA-256 remains byte-for-byte unadulterated.

## 9. Technologies used
- **FastAPI**: Manages the orchestration and async event loops to safely isolate engine crashes.
- **React.js**: Reused to dynamically spawn simultaneous analytical observation streams (Metadata + ELA + Noise) for a singular evidence item.
- **SQLAlchemy (JSON column)**: Safely absorbs arbitrary dynamic statistical nesting (e.g., dictionaries of percentiles and configurations).

## 10. Tests executed
2 tests were executed specifically for this new API integration (`test_api_noise.py`), alongside the remaining 19 test modules, totaling 21 executed tests.

## 11. Test results
All tests Passed.

## 12. Manual validation
Simulated uploading a valid JPEG through the frontend, triggered Noise Analysis, and verified that both global and local maps successfully painted on the DOM.

## 13. Evidence integrity verification
Integration tests implicitly assert that the byte-reading process applied by the engine does not invoke an overwriting stream on the original evidence.

## 14. Documentation changes
Created `docs/development-log/sprint-04b.md`.
Updated `README.md` and `docs/architecture.md` to reflect the completion of the Noise capability.

## 15. Known limitations
Similar to ELA, large resolution analysis is blocking the asynchronous thread. We must implement a Celery worker queue in the future to handle multi-megapixel arrays efficiently.

## 16. Scope verification
Confirmed NO evidence fusion, heuristic risk scoring, manipulation labeling, ML algorithms, or fake/real classifiers were implemented.

## 17. Recommended next step
**Sprint 5: Evidence Fusion Engine**. With Metadata, ELA, and Noise observation layers established, the application is finally ready to compute heuristic risk scores by evaluating overlapping anomalies.
