# Sprint 3B Development Log: ELA API Integration & Visualization

## 1. What was implemented
Integrated the standalone Error Level Analysis (ELA) core engine into the FastAPI backend and React frontend. Extended the `Analysis` REST API to seamlessly route uploaded evidence directly into the ELA engine, returning secure mathematical findings. Finally, visualized the artifacts cleanly on the dashboard without exposing internal paths.

## 2. API architecture
Created `POST /api/evidence/{evidence_id}/analysis/ela`. The API endpoint acts as a safe orchestrator, verifying database records and valid file configurations before calling the mathematical engine. It catches `ValueError`, `UnsupportedFormatError`, etc., to generate meaningful HTTP 400s instead of 500s.

## 3. Service integration
Introduced `app/forensics/ela/analyzer.py`. This bridge logic translates the mathematical outputs of the `ELAEngine` into the generic `Analysis` SQLAlchemy ORM structure. 

## 4. Database changes
No schema migrations were needed. ELA results utilize the exact same generic `Analysis` structure established in Sprint 2, proving the robustness of the architecture. The `structured_findings` JSON column effortlessly houses mean error, std dev, and artifact dictionaries.

## 5. Artifact storage architecture
- Artifacts are stored in `storage/analyses/ela/`.
- Paths returned to the client are strictly relative (e.g., `analyses/ela/ela_map_123.jpg`).
- The API hosts `GET /api/artifacts/{path}`, acting as a secure static file proxy that enforces strict validation against `../` path traversal attacks. 

## 6. Frontend changes
Added an ELA analysis card into the `Dashboard.tsx`. 
When triggered, it presents a distinct visual map of recompression errors. Crucially, scientific integrity is maintained with warning banners reminding users that "elevated error" does not inherently mean "manipulated." No components use terminology like "fake."

## 7. Security controls
- **Path Traversal Protection:** Explicit blocking of `../`, `/`, and `\` inside `artifact_path` requests.
- **Evidence Integrity:** Source evidence hashes are not re-written.
- **Type Segregation:** If a user tries to run ELA on a PNG evidence item, the API firmly rejects it because ELA is meaningless on lossless media.

## 8. Technologies used
- **FastAPI `FileResponse`**: Swiftly returning image blobs based on secure internal path concatenation.
- **React State Management**: Gracefully orchestrating simultaneous API requests for Metadata and ELA analysis off a singular piece of Evidence.

## 9. Tests executed
3 new tests (`test_api_ela.py`) evaluating PNG rejections, successful integration mapping, and path traversal security. Plus all existing tests for a total of 19 tests.

## 10. Test results
All 19 tests passed securely using isolated SQLite databases.

## 11. Known limitations
The entire engine triggers on the main FastAPI event loop (synchronously). High-resolution images will cause HTTP connections to hang during matrix array loading. 

## 12. Scientific limitations
The visualization heavily relies on extreme normalization ($M = 255 / max(E)$). If a single pixel anomaly in a 20-megapixel image triggers maximum absolute error, the rest of the image may be drowned out structurally in the visualization array.

## 13. Scope verification
Confirmed NO machine learning models or copy-move detection modules were activated. No deterministic final classifier was built.

## 14. Recommended next step
**Sprint 4: Evidence Fusion & Confidence Scoring**. Now that both Metadata observation and ELA indicator systems exist in parallel, they can be fused into an overarching probabilistic or heuristic risk classifier.
