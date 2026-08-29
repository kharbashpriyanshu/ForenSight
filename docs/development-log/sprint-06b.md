# Sprint 6B Development Log: Copy-Move API Integration & Visualization

## 1. What was implemented
The standalone SIFT/RANSAC Classical Copy-Move Core Engine was successfully integrated into the ForenSight FastAPI ecosystem. We orchestrated the route, bridged the geometric results into the generic Analysis database structure, strictly managed the No-Candidate non-failure state, and built a comprehensive visual dashboard in React to map out identical structural patches.

## 2. API architecture
Created `POST /api/evidence/{evidence_id}/analysis/copy-move`.
This route operates strictly as an orchestrator. It verifies the Evidence record and source file existence, invokes the Analyzer, and returns HTTP 400 for structural I/O errors (e.g. corrupted files), preventing backend 500s. Importantly, if the engine finds 0 geometric inliers, the route correctly returns `HTTP 200 OK` rather than throwing an error, because the absence of manipulation is a valid forensic outcome.

## 3. Analyzer architecture
Created `app/forensics/copy_move/analyzer.py`. This bridge securely isolates the execution of the math engine inside a SQLAlchemy transaction. It leverages Pydantic's `model_dump()` to cleanly serialize the deeply nested metrics (Feature stats, Matching stats, Geometry vectors, Bounding boxes) directly into the `structured_findings` JSON column.

## 4. Database integration
As with previous Sprints, zero schema migrations were required. The generic `Analysis` ORM effortlessly absorbed the new module using `analysis_type="COPY_MOVE"`.

## 5. Copy-Move result persistence
Persisted extensive configuration parameters (detector, matcher, ratio thresholds) alongside feature generation counts, spatial filtering retention rates, and the critical RANSAC transformation matrices and centroids.

## 6. Candidate region representation
Bounding boxes and centroids of the source and destination inlier clusters are safely represented as floating-point coordinate lists within the database and seamlessly rendered on the frontend.

## 7. Artifact storage
The OpenCV `drawMatches` visualization is securely saved in `storage/analyses/copy_move/`. The API securely issues a relative path to the frontend (`analyses/copy_move/copymove_map_UUID.jpg`), relying on the `GET /api/artifacts/{path}` route to prevent directory breakout attacks.

## 8. Frontend changes
Added "Run Copy-Move Analysis" button to `Dashboard.tsx`.
When activated, an ocean-blue themed results card renders:
- **Feature Detection**: Keypoint counts and descriptor sizes.
- **Matching**: Funnel metrics from Raw Matches to Spatially-Filtered Matches.
- **Geometric Verification**: The number of RANSAC Inliers and the exact Vector Displacement.
- **Candidate Regions**: Spatial coordinates of the duplicated centroids (or a graceful fallback message if none exist).
- **Visualization**: The direct rendering of the SIFT correspondence map.

## 9. Scientific interpretation
To strictly preserve scientific integrity, a hardcoded UI warning was added to the bottom of the Copy-Move data panel:
> *"Candidate feature correspondences were identified within the image. Repeated natural structures, textures, architectural patterns, and other visual similarities can produce geometrically consistent matches. These findings do not independently establish image manipulation."*

## 10. Security controls
- **Format Hardening**: Handled upstream by OpenCV/Pillow validation.
- **Path Traversal Blocking**: Completely mitigated by reusing the existing strict API artifact route.
- **Evidence Immutability**: The core engine processes the file read-only, never overwriting the original bytes.

## 11. Technologies used
- **FastAPI**: Orchestrates the API and translates algorithmic faults to HTTP semantics. Used continuously since Sprint 0.
- **SQLAlchemy (JSON column)**: Used to store dynamic metrics (e.g., transformation matrices) without rigid schema structures.
- **React.js / TypeScript**: Powered the dynamic, async dashboard allowing independent execution of Copy-Move alongside the other modules.
- **OpenCV (`cv2`)**: Used by the engine for SIFT, RANSAC, and mapping. (Introduced Sprint 4, utilized fully in 6A).

## 12. Tests executed
- **New Sprint 6B tests:** 3 executed.
- **Full repository suite:** 42 passed / 0 failed.

## 13. No-candidate validation
Created a specific integration test (`test_copymove_analysis_negative_no_candidate`) where the engine is fed a clean, synthetic noise image with no cloned patches. The API successfully returned HTTP 200 OK with `geometric_inliers = 0`. The frontend was programmed to read this state and gracefully display: *"No geometrically consistent candidate correspondence identified"* instead of rendering broken geometric coordinates.

## 14. Manual validation
Simulated uploading a valid JPEG through the frontend, triggered Copy-Move Analysis, and verified that structural stats, inlier ratios, and the Correspondence Map successfully painted on the DOM. Uploaded an image without cloned features and confirmed the graceful "No geometrically consistent candidate" UI fallback.

## 15. Original evidence integrity verification
Integration tests explicitly verified that the byte-reading process applied by OpenCV does not alter the original bytes or the SHA-256 footprint.

## 16. Documentation changes
- Created `docs/development-log/sprint-06b.md`.
- Updated `README.md` and `docs/architecture.md` to formally document the integration of classical Copy-Move capabilities.

## 17. Known limitations
Similar to previous Sprints, 24-megapixel arrays analyzed synchronously will block the FastAPI async thread temporarily. We will eventually need an asynchronous worker (e.g., Celery) to scale properly. Also, `max_features` remains capped at 5000 to prevent OOM errors on large canvases.

## 18. Scope verification
**Explicitly Confirmed:** I did NOT implement Evidence Fusion, heuristic risk scoring, automated fake/real classification, machine learning, deep neural network detection, or definitive "splicing" verdicts.

## 19. Recommended next step
**Sprint 7A: Evidence Fusion Engine**. With all 5 massive foundational observation capabilities integrated (Metadata, ELA, Noise, JPEG/DCT, Copy-Move), the system is officially ready to aggregate its data. In Sprint 7A, we will finally fuse these distinct analytical layers to evaluate overlapping contradictions and synthesize the platform's first heuristic risk assessments.
