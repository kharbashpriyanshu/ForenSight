# Sprint 3A Development Log: ELA Core Engine

## 1. What was implemented
Developed a standalone Error Level Analysis (ELA) core engine. It performs controlled JPEG recompression, vectorized pixel difference calculation, dynamic range normalization, and statistical extraction.

## 2. Algorithm explanation
The engine opens a JPEG, recompresses it at a specified quality (default 90), calculates the absolute difference between the original and recompressed arrays, and scales those differences to 0-255 for visual inspection.

## 3. Mathematical formulation
- Absolute Difference: $D_{i,j} = |O_{i,j} - R_{i,j}|$
- Normalization Multiplier: $M = \frac{255}{\max(D)}$
- Normalized Output: $N_{i,j} = D_{i,j} \times M$

## 4. Files created
- `backend/app/forensics/ela/__init__.py`
- `backend/app/forensics/ela/exceptions.py`
- `backend/app/forensics/ela/schemas.py`
- `backend/app/forensics/ela/engine.py`
- `backend/tests/test_ela.py`
- `backend/scripts/ela_experiment.py`
- `docs/forensics/ela.md`

## 5. Files modified
- `backend/requirements.txt` (Added `numpy`)

## 6. Technologies used
- **Pillow:** Used for decoding the JPEG, converting to RGB, and performing the controlled lossy JPEG re-encoding.
- **NumPy:** Used to convert the Pillow images into mathematical arrays. NumPy performs vectorized subtraction, absolute value calculation, and statistical aggregations (mean, std, percentiles) orders of magnitude faster than standard Python `for` loops.

## 7. Tests executed
5 tests specific to ELA (`test_ela.py`) were executed, alongside the 11 existing tests.

## 8. Test results
All tests passed. The suite verified valid JPEGs, rejected PNGs, validated quality parameter execution, rejected corrupt binaries, and ensured numerical stability.

## 9. Experimental validation
A reproducible script (`ela_experiment.py`) was created. It generates a base JPEG (Quality 90), simulates a manipulation by drawing a new white box, and saves it again at Quality 90. The controlled experiment demonstrated that the modified test image produced different ELA error statistics from the baseline image under the tested conditions.

## 10. Generated artifacts
Derived ELA images are strictly isolated from the original evidence file. The engine accepts an `output_dir` and saves `ela_recompressed_UUID.jpg` and `ela_map_UUID.jpg` deterministically without modifying the source.

## 11. Performance considerations
NumPy was explicitly chosen to avoid $O(N \times M)$ Python loop overhead. `int16` types were used during subtraction to prevent silent wrapping/underflow before taking the absolute value.

## 12. Known limitations
The current implementation runs synchronously. Very large images (e.g., 50 Megapixels) will consume significant RAM when loaded into `int16` NumPy arrays.

## 13. Scientific limitations
The algorithm relies heavily on JPEG quantization tables. Manipulations using identical quantization tables or aggressive downstream compression can hide ELA indicators.

## 14. Documentation created
Created comprehensive mathematical and conceptual documentation in `docs/forensics/ela.md`.

## 15. Scope verification
Confirmed that NO API routes, database schemas, frontend dashboards, or ML classifiers were touched. This sprint strictly delivered the standalone scientific algorithm.

## 16. Recommended next step
**Sprint 3B: ELA Integration**. Now that the engine is validated, integrate it into the `Analysis` REST API, run it asynchronously, and display the error maps in the React Dashboard.
