# Sprint 4A Development Log: Noise Residual Core Engine

## 1. What was implemented
Developed a standalone, mathematically rigorous Noise Residual Core Engine. It isolates the high-frequency residual component of an image by estimating and subtracting a Gaussian-smoothed baseline signal, providing both global and local statistical analysis.

## 2. Mathematical model
$I = S + N$
Where $I$ is the image, $S$ is the smoothed signal, and $N$ is the extracted residual.

## 3. Filtering approach
Implemented OpenCV-based Gaussian low-pass filtering (`cv2.GaussianBlur`). The parameters `kernel_size` and `sigma` are dynamically configurable, defaulting to 5 and 1.0 respectively.

## 4. Local analysis approach
Designed a configurable sliding-window local aggregator. It extracts subsets of the residual matrix (default 16x16 blocks) and computes the localized mean absolute residual, producing a spatial map of high-frequency density.

## 5. Files created
- `backend/app/forensics/noise/__init__.py`
- `backend/app/forensics/noise/exceptions.py`
- `backend/app/forensics/noise/schemas.py`
- `backend/app/forensics/noise/engine.py`
- `backend/tests/test_noise.py`
- `backend/scripts/noise_experiment.py`
- `docs/forensics/noise-residual.md`

## 6. Files modified
- `backend/requirements.txt` (Added `opencv-python-headless`)

## 7. Technologies used
- **OpenCV (`cv2`)**: Introduced in this sprint to perform highly optimized 2D convolutions (Gaussian Blur) natively in C++, vastly outperforming Pillow's standard image filters.
- **NumPy**: Reused from Sprint 3 to manage `float32` matrix subtraction, ensuring mathematical stability (preventing `uint8` underflow wrapping).
- **Pillow**: Reused to safely read file headers, enforce format conversions (to Grayscale 'L' mode), and safely write the derived artifacts to disk.

## 8. Tests executed
4 tests specific to the Noise engine (`test_noise.py`) were executed.

## 9. Test results
All 4 tests passed. Confirmed numerical safety, invalid configuration rejection, format parsing, and source file integrity.

## 10. Reproducible experiment
Created `noise_experiment.py`. It computationally synthesizes an image with a perfectly smooth flat region, a randomized textured region, and a stark geometric edge. When the Noise Engine processed this image, it numerically and visually demonstrated that high residuals naturally concentrate around the simulated texture and edges, while the smooth region registered a baseline near 0. This conclusively proves that structural content drives residual magnitude, reinforcing why high noise cannot blindly be classified as "manipulated."

## 11. Generated artifacts
Generates safe, isolated JPEG artifacts using UUID-suffixed filenames: `noise_residual_UUID.jpg` (global normalized residual) and `noise_local_UUID.jpg` (local aggregated map).

## 12. Performance considerations
NumPy and OpenCV eliminate the need for nested Python loops. The local analysis windowing is currently implemented with a simple nested loop over the downsampled grid dimensions (e.g., $1000 \times 1000$ image with stride 16 yields only $62 \times 62 = 3844$ iterations), which executes in milliseconds.

## 13. Scientific limitations
The baseline model assumes signal and noise are linearly additive ($I = S + N$). In reality, digital camera noise is often multiplicative (signal-dependent). The engine treats all high-frequency data (edges, textures, true sensor noise) equally as "residual".

## 14. Documentation created
Drafted comprehensive physics/math documentation in `docs/forensics/noise-residual.md`.

## 15. Scope verification
Confirmed that NO API integration, database persistence, frontend React dashboards, ML models, copy-move detection, or fake/real risk scoring systems were implemented. This sprint remains strictly an isolated algorithm.

## 16. Recommended next step
**Sprint 4B: Noise API Integration & Visualization.** Now that the engine is built, it should be connected to the `Analysis` REST API and surfaced in the ForenSight React Dashboard.
