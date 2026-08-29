# Sprint 5A Development Log: JPEG/DCT Core Engine

## 1. What was implemented
Developed a mathematically precise, standalone JPEG/DCT forensic analysis engine. It parses original JPEG Quantization Tables directly from the file header, securely edge-pads non-aligned images, performs fully vectorized 2D Discrete Cosine Transforms (DCT) on 8x8 blocks, and extracts comprehensive DC, AC, and frequency-band statistics.

## 2. JPEG processing pipeline
The engine uses Pillow to parse the Quantization tables out of the JPEG headers. It then extracts the spatial pixel data, forces it to Luminance (Grayscale), subtracts 128 (standard JPEG DC shift), reshapes the matrix into $8 \times 8$ blocks, and applies the DCT transform.

## 3. DCT mathematical implementation
Rather than relying on external libraries like SciPy, or slow Python nested loops, the engine natively implements the $C = T \times B \times T^T$ matrix multiplication. $T$ is the standard DCT basis matrix.
Using NumPy's `np.einsum('ij,njk,kl->nil', T, blocks, T.T)`, the engine executes the 2D DCT simultaneously across tens of thousands of blocks in a fraction of a second, perfectly vectorized.

## 4. Quantization analysis
The engine extracts the actual Quantization Tables used by the encoder via Pillow's `img.quantization` attribute. It calculates the Min, Max, Mean, Median, and Standard Deviation of the table coefficients to quantify the compression severity.

## 5. Frequency-domain analysis
The engine securely segregates the DC coefficient ($[0,0]$) from the remaining 63 AC coefficients. It computes exact energy metrics (mean absolute magnitude) for low, mid, and high-frequency conceptual bands using boolean masking. It explicitly measures the `zero_proportion` of AC coefficients, a critical metric for evaluating heavy quantization.

## 6. Recompression experiment
Created `scripts/jpeg_dct_experiment.py`. 
It synthesizes a complex image (gradients + high-frequency noise), saves it at Quality 95 (HQ), and then recompresses that file at Quality 50 (LQ). 
The output mathematically proved:
- The Quantization Table Mean jumped significantly.
- The AC Coefficient Mean Absolute plummeted.
- The proportion of AC coefficients crushed to pure zero increased massively.
- High-frequency energy was measurably stripped from the LQ file.

## 7. Visualization approach
Generates a "Global Average DCT Energy Map". It calculates the mean magnitude for each of the 64 coefficient positions across the entire image. Because the DC coefficient dominates exponentially, a `log1p` scale is applied before mapping to 0-255 uint8 grayscale, yielding a clear $8 \times 8$ visual representation of frequency energy distribution.

## 8. Files created
- `backend/app/forensics/jpeg_dct/__init__.py`
- `backend/app/forensics/jpeg_dct/exceptions.py`
- `backend/app/forensics/jpeg_dct/schemas.py`
- `backend/app/forensics/jpeg_dct/jpeg_parser.py`
- `backend/app/forensics/jpeg_dct/engine.py`
- `backend/tests/test_jpeg_dct.py`
- `backend/scripts/jpeg_dct_experiment.py`
- `docs/forensics/jpeg-dct.md`
- `docs/development-log/sprint-05a.md`

## 9. Files modified
No existing files were modified. This was a purely additive standalone module.

## 10. Technologies used
- **NumPy**: Executed the `einsum` block-wise matrix multiplication and boolean array masking for statistics. Previously used heavily in Sprints 3 and 4.
- **Pillow**: Crucial for its ability to parse the raw JPEG header and extract the `quantization` dictionary without decompressing the pixel data, allowing true forensic inspection. Previously used in Sprints 1, 2, 3, and 4.
- *(Note: OpenCV/SciPy were deemed unnecessary for the DCT due to the efficiency of the vectorized NumPy implementation).*

## 11. Tests executed
- **New Sprint 5A tests**: 5 executed.
- **Full suite**: 30 passed / 0 failed.

## 12. Mathematical validation
Implemented `test_jpeg_dct_constant_block_math`. It feeds a perfectly flat image (all pixels = 200). After shifting by -128, the pixels become 72. The math dictates the DC coefficient must equal $72 \times 8 = 576$, and all AC coefficients must equal 0. The test verifies these exact mathematical bounds, proving the vectorized `einsum` implementation is scientifically accurate.

## 13. Experimental validation
The double-compression experiment succeeded in demonstrating measurable frequency suppression and quantization shifts. We explicitly avoided claiming that this automatically identifies malicious intent.

## 14. Generated artifacts
Generates safe, isolated JPEG artifacts using UUID-suffixed filenames: `dct_energy_map_UUID.jpg`.

## 15. Performance considerations
NumPy's `einsum` evaluates tens of thousands of $8 \times 8$ matrix multiplications purely in C. The performance is blisteringly fast, negating any need to introduce heavy dependencies like SciPy for a single transform.

## 16. Scientific limitations
Different software (Photoshop vs Lightroom vs iOS) uses entirely different default Quantization Tables and subsampling ratios. Double compression characteristics can simply indicate that an authentic image was uploaded to Twitter and re-downloaded.

## 17. Documentation created
Drafted comprehensive physics/math documentation in `docs/forensics/jpeg-dct.md` and this Sprint 5A log.

## 18. Scope verification
**Explicitly Confirmed:** NO API endpoints, Database models, React UI, evidence fusion, risk scoring, fake/real classification, machine learning, copy-move detection, or splicing detection mechanisms were implemented.

## 19. Recommended next step
**Sprint 5B: JPEG/DCT API Integration & Visualization.** Now that the engine is mathematically verified, it should be connected to the FastAPI endpoints and visualized in the React Dashboard alongside Metadata, ELA, and Noise.
