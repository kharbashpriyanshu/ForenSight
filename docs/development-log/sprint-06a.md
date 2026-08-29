# Sprint 6A Development Log: Classical Copy-Move Core Engine

## 1. What was implemented
Developed a standalone, classical computer-vision engine to detect Copy-Move manipulation within a single image. The engine utilizes Scale-Invariant Feature Transform (SIFT) for robust local feature extraction and applies rigorous geometric RANSAC verification to isolate structurally duplicated regions while aggressively filtering out noise.

## 2. Feature detection & descriptor approach
Utilized `cv2.SIFT_create()`. SIFT was selected over ORB or SURF because it is highly robust to scale and rotation, which are common when a forger resizes or slightly rotates a cloned patch to fit the destination perspective. Descriptors are 128-dimensional floating-point arrays.

## 3. Matching strategy
Used a Brute-Force Matcher (`cv2.BFMatcher(cv2.NORM_L2)`) performing a K-Nearest Neighbor search ($k=3$). 
- **Self-Match Filter**: $k=1$ is always the keypoint itself, so it is skipped.
- **Lowe's Ratio Test**: The remaining two closest matches are compared. If the closest is less than 75% the distance of the second closest, it is kept. This eliminates weak, ambiguous matches.
- **Spatial Filter**: Matches closer than 30 pixels are discarded to prevent detecting overlapping textures on the exact same object.

## 4. Geometric verification
Employed `cv2.estimateAffinePartial2D` with the RANSAC method. Unlike a simple homography (which can overfit planar distortion), the partial affine transform correctly models the translation, rotation, and uniform scaling typical of a simple copy-paste operation. Matches that do not fit the estimated mathematical model are discarded as outliers.

## 5. Candidate region estimation
For the geometrically verified inliers, the engine computes the source and destination centroids, the global displacement vector, and the coordinate bounding boxes wrapping the clusters.

## 6. Visualization approach
Generates a direct OpenCV `drawMatches` artifact. It overlays green lines connecting the source and destination inlier keypoints over the original image. 

## 7. Files created
- `backend/app/forensics/copy_move/__init__.py`
- `backend/app/forensics/copy_move/exceptions.py`
- `backend/app/forensics/copy_move/schemas.py`
- `backend/app/forensics/copy_move/engine.py`
- `backend/tests/test_copy_move.py`
- `backend/scripts/copy_move_experiment.py`
- `docs/forensics/copy-move.md`
- `docs/development-log/sprint-06a.md`

## 8. Files modified
No existing files were modified. This was a standalone algorithmic module.

## 9. Technologies used
- **OpenCV (`cv2`)**: Executed the entire heavy-lifting computer vision pipeline (SIFT, BFMatcher, RANSAC, drawMatches). OpenCV was introduced previously in Sprint 4 (Noise).
- **NumPy**: Handled coordinate array management, centroid averaging, and Euclidean distance math. Used previously in Sprints 3, 4, and 5.

## 10. Tests executed
- **New Sprint 6A tests**: 5 executed.
- **Full suite**: 39 passed / 0 failed.

## 11. Mathematical/algorithmic validation
`test_copymove_deterministic_positive` generates a clean mathematical gradient background, injects a randomized high-texture patch, and mathematically copies it to a completely different sector of the image. The test verified that the SIFT pipeline successfully identified $>4$ inliers, successfully computed the displacement matrix, and mapped the regions accurately. 
`test_copymove_negative` ensured a pure gradient image generated 0 matches.

## 12. Experimental validation
`scripts/copy_move_experiment.py` synthesized a cloned patch and simulated a forged brightness adjustment (+20 intensity) to mimic imperfect cloning. The engine successfully saw through the brightness shift, locking onto the gradient texture with SIFT, and correctly mapping the transformation.

## 13. Generated artifacts
Generates safe `copymove_map_UUID.jpg` visualization files locally.

## 14. Performance considerations
SIFT is computationally expensive on high-megapixel images. To prevent memory exhaustion and timeout faults, `max_features` is capped at 5,000 by default.

## 15. Scientific limitations
Natural imagery containing repeating geometry (brick walls, windows on a skyscraper, symmetrical designs) will trigger perfect geometric inliers. The engine detects "spatial structural repetition", which does not guarantee malicious tampering.

## 16. Scope verification
**Explicitly Confirmed:** NO API endpoints, Database models, React UI, evidence fusion, risk scoring, ML classifiers, or definitive "fake/real" labels were implemented.

## 17. Recommended next step
**Sprint 6B: Classical Copy-Move API Integration & Visualization.** Now that the engine reliably extracts structural correspondences, it should be connected to the FastAPI endpoints and visualized in the React Dashboard.
