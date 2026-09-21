# JPEG Quantization Table Analysis (`JPEG-QT`)

## 1. Purpose
The `JPEG-QT` forensic engine extracts, characterizes, and fingerprints raw $8 \times 8$ quantization tables stored in DQT (`0xFFDB`) segments. Quantization tables govern frequency loss in JPEG compression and vary significantly across camera manufacturers, firmware revisions, and photo-editing software packages.

---

## 2. Methodology
1. **DQT Parsing**: Directly parses all DQT segments in the file bytes, extracting precision (8-bit or 16-bit), destination table IDs (0 to 3), and zig-zag ordered values.
2. **Matrix Reconstruction**: Maps zig-zag sequences into natural $8 \times 8$ row-major matrices using the standard ITU-T T.81 zig-zag permutation index.
3. **Component Mapping**: Correlates table IDs with SOF component definitions to identify luminance (Y) and chrominance (Cb/Cr) associations.
4. **Deterministic Descriptors**: Computes deterministic statistical profiles for each table:
   - DC coefficient value (matrix coordinate `[0, 0]`)
   - Overall minimum, maximum, mean, median, variance, and standard deviation across all 64 coefficients
   - AC coefficient statistics across the 63 high-frequency entries
5. **Cryptographic Fingerprinting**: Calculates deterministic SHA-256 digests over the 64-element table bytes for reference comparison.
6. **Calibrated IJG Quality Estimation**: Evaluates luminance tables against the Independent JPEG Group (IJG) standard luminance baseline scaling curve. Inverts the 50-scale formula across qualities $Q \in [1, 100]$. If the closest match has a Mean Absolute Deviation (MAD) $\le 2.5$, the estimated quality factor is reported with match confidence; otherwise, `NOT_ESTIMATED` is returned.

---

## 3. Input Requirements
- **Container Format**: `JPEG` / `JPG` only.
- **Minimum Dimensions**: $1 \times 1$ pixels.
- **Prerequisite Markers**: Must contain at least one valid DQT segment.

---

## 4. Outputs
- **Normalized Observation**:
  - `observation_type`: `JPEG_QUANTIZATION`
  - `metric_name`: `TABLE_COUNT`
  - `raw_value`: Number of extracted quantization tables.
  - `direction`: `"nominal"`
  - `interpretation`: Text summary containing table count, estimated IJG quality (or explanation if non-standard), and confirmation of table fingerprints.
- **JSON Artifact**:
  - Saved to `storage/analyses/jpeg_qt/jpeg_qt_analysis_{id}.json`.
  - Machine-readable payload with raw $8 \times 8$ matrices, zig-zag vectors, component references, statistics, and SHA-256 fingerprints.

---

## 5. Execution Parameters
- `estimate_quality` (boolean, default: `true`): Controls whether IJG quality factor curve fitting is executed.

---

## 6. Limitations
- Quantization tables capture only the most recent lossy compression cycle; earlier compression history cannot be directly determined from tables alone.
- Common compression libraries (e.g. `libjpeg`, `libjpeg-turbo`) are shared across thousands of camera firmware builds and applications, meaning identical tables can stem from different sources.
- Quality factor estimation is valid strictly for encoders adhering to standard IJG linear scaling; proprietary camera tables (e.g. Sony, Nikon custom curves) deliberately produce `NOT_ESTIMATED`.

---

## 7. Scientific References
1. **Lukas, J., & Fridrich, J. (2003)**. *Estimation of primary quantization matrix in double compressed JPEG images*. Proc. of Digital Forensic Research Workshop (DFRWS).
2. **Farid, H. (2009)**. *Exposing digital forgeries from JPEG ghosts*. IEEE Transactions on Information Forensics and Security, 4(1), 154-160.

---

## 8. Interpretation Guidance
- **Luminance Table (Table 0)**: Dictates contrast and high-frequency edge retention. Coarse (high) values indicate aggressive lossy compression.
- **Chrominance Table (Table 1)**: Dictates color fidelity. Typically quantizes color channels more aggressively than luminance.
- **Estimated Quality Factor**: A calibrated mathematical approximation. Must *never* be reported as definitive camera acquisition quality or absolute proof of authenticity.
- **Reference Comparison**: SHA-256 table fingerprints allow analysts to verify whether an image's tables match reference tables produced by known camera hardware or image editors.

---

## 9. Non-Applicability
- Lossless containers (PNG, WebP, TIFF) lack DCT quantization tables and yield `status = NOT_APPLICABLE` with the mandatory scientific guardrail notice.

---

## 10. Known Failure Modes
- Corrupted DQT payloads with truncated lengths are safely intercepted and flagged.
- Files lacking DQT markers return `status = FAILED` with a clear explanation.
