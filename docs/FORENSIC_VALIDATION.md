# ForenSight V2.2 — Forensic Validation Framework

## 1. Executive Summary & Verification Philosophy

ForenSight V2.2 treats digital image forensics as an empirical science governed by strict verification standards. Automated tools in judicial, investigative, or military settings must never rely on black-box heuristics, synthetic "manipulation percentage" metrics, or unverified model confidence scores.

The ForenSight Forensic Validation Framework enforces:
1. **Algorithmic Determinism**: Repeated executions across identical evidence assets yield identical numerical and structured metrics ($Run_1 \equiv Run_2 \equiv Run_3$).
2. **Cryptographic Integrity**: Source evidence bitstreams are strictly immutable across upload, job queueing, analysis execution, and report generation.
3. **Controlled Fixture Corpus**: All validation is conducted against programmatically generated, documented test fixtures with explicit ground truth rather than unverified wild captures.
4. **Golden Output Regression**: Analytical outputs are snapshot-verified against normalized golden references (`tests/golden/`).

---

## 2. Controlled Test Fixture Corpus

Fixtures reside in `backend/tests/fixtures/forensics/` and are registered in `fixtures_manifest.json`:

| Fixture Filename | Fixture ID | Container Format | Dimensions | Ground Truth State | Scientific Significance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `clean_reference.jpg` | `FIX-001` | JPEG | 300x300 | `CLEAN_REFERENCE` | Single-pass compression baseline at Q=95; validates low error variance in ELA, uniform DCT blocks, and baseline noise SNR. |
| `clean_reference.png` | `FIX-002` | PNG | 300x300 | `CLEAN_REFERENCE` | Lossless reference; validates container format disambiguation (DCT/ELA inapplicability). |
| `clean_reference.webp` | `FIX-003` | WEBP | 300x300 | `CLEAN_REFERENCE` | WebP reference for modern web asset validation. |
| `metadata_known_camera.jpg` | `FIX-004` | JPEG | 300x300 | `KNOWN_CAMERA_METADATA` | Hardware EXIF signatures (Canon EOS 80D, timestamp, lens profiles). |
| `metadata_stripped.jpg` | `FIX-005` | JPEG | 300x300 | `STRIPPED_METADATA` | Web-optimized/privacy-stripped image with zero EXIF markers. |
| `recompressed_double_jpeg.jpg` | `FIX-006` | JPEG | 300x300 | `DOUBLE_JPEG_RECOMPRESSION` | Two-pass compression (Q=70 followed by Q=90); tests double quantization grid detection. |
| `synthetic_copy_move.jpg` | `FIX-007` | JPEG | 400x400 | `CONTROLLED_SYNTHETIC_COPY_MOVE` | Cloned feature patch placed at (40,40) and (220,220); tests SIFT/ORB keypoint clustering. |
| `localized_splice_ela.jpg` | `FIX-008` | JPEG | 300x300 | `CONTROLLED_SYNTHETIC_SPLICING` | Spliced region with divergent compression history; tests spatial ELA variance. |
| `malformed_header.jpg` | `FIX-009` | Corrupted JPEG | None | `MALFORMED_INPUT` | Corrupted byte headers testing ingest resilience. |
| `malformed_header.png` | `FIX-010` | Corrupted PNG | None | `MALFORMED_INPUT` | Invalid IHDR chunk and CRC bytes testing ingest safety. |
| `truncated.jpg` | `FIX-011` | Truncated JPEG | None | `TRUNCATED_INPUT` | File truncated at 33% byte length; tests decoder EOF error handling. |
| `zero_byte.bin` | `FIX-012` | Empty | None | `ZERO_BYTE` | 0-byte file boundary testing. |
| `unsupported.txt` | `FIX-013` | Text | None | `UNSUPPORTED_FORMAT` | Spoofed extension/MIME boundary test. |
| `tiny_2x2.png` | `FIX-014` | PNG | 2x2 | `EXTREME_DIMENSION` | Sub-block geometry testing (< 8x8 DCT grid). |
| `unusual_aspect_10x1000.jpg` | `FIX-015` | JPEG | 10x1000 | `EXTREME_ASPECT_RATIO` | Extreme 1:100 aspect ratio testing memory allocation and grid tiling. |

---

## 3. Golden Output Baseline Testing

To guard against silent algorithmic drift without modifying frozen forensic engines, ForenSight maintains golden outputs under `tests/golden/`:
- `clean_jpeg_metadata.golden.json`
- `clean_jpeg_ela.golden.json`
- `clean_jpeg_noise.golden.json`
- `clean_jpeg_dct.golden.json`
- `synthetic_copymove.golden.json`
- `correlation_rules.golden.json`

Before comparing analytical results against golden records, non-deterministic environmental fields are normalized:
- Absolute filesystem paths &rarr; `<NORMALIZED_PATH>`
- Microsecond timestamps &rarr; `<NORMALIZED_TIMESTAMP>`
- Dynamic UUIDs / primary keys &rarr; `<NORMALIZED_ID>`
- Floating point values &rarr; rounded to 4 decimal places.

---

## 4. Disambiguating Negative Evidence from Absence of Evidence

A critical scientific principle enforced in ForenSight V2.2:
- **Negative Evidence**: Analysis executed successfully on compatible data, and empirical measurements demonstrated no anomaly (e.g. uniform noise SNR across spatial partitions).
- **Absence of Evidence / Method Inapplicability**: Analysis could not execute because container or file characteristics preclude the physical mechanism (e.g. attempting frequency-domain DCT quantization analysis on a PNG lossless container).

Under rule `CORR-CONFLICT-005`, container inapplicability is explicitly flagged as a methodological constraint, preventing investigators from mistakenly citing format rejection as evidence of image authenticity.
