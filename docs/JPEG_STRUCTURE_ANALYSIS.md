# JPEG Structure Analysis (`JPEG-STRUCTURE`)

## 1. Purpose
The `JPEG-STRUCTURE` forensic engine performs low-overhead binary parsing and structural verification of JPEG image containers conforming to ITU-T Recommendation T.81 / ISO/IEC 10918-1. It inspects marker sequences, segment offsets, frame geometry, component sampling factors, and structural anomalies to characterize the image bitstream syntax without decompressing pixel rasters.

---

## 2. Methodology
The engine scans raw file bytes linearly:
1. **Marker Validation**: Confirms the stream begins with a standard Start of Image (SOI, `0xFFD8`) and ends with End of Image (EOI, `0xFFD9`).
2. **Segment Scanning**: Parses variable-length segments by reading their 16-bit big-endian length fields, extracting byte offsets, marker types (`APP0-APP15`, `COM`, `DQT`, `DHT`, `DRI`, `SOF0-SOF15`, `SOS`), and payloads.
3. **Frame Geometry & Sampling**: Parses SOF headers to retrieve pixel dimensions (width $\times$ height), sample precision (e.g. 8-bit), number of components, and component horizontal/vertical sampling ratios (e.g. 4:2:0 YCbCr).
4. **Scan & Entropy Demarcation**: Tracks SOS parameters and scans entropy-coded bitstreams (respecting byte stuffing `0xFF00` and restart markers `RST0-RST7`) until EOI.
5. **Anomaly Detection**: Evaluates boundary consistency, missing or misplaced markers, duplicate SOF segments, truncated lengths, and trailing data appended after EOI.

---

## 3. Input Requirements
- **Container Format**: `JPEG` / `JPG` only.
- **Minimum Dimensions**: $1 \times 1$ pixels.
- **Byte Stream**: Uncorrupted or partially damaged binary bitstream containing JPEG marker sequences.

---

## 4. Outputs
- **Normalized Observation**:
  - `observation_type`: `JPEG_STRUCTURE`
  - `metric_name`: `ANOMALY_COUNT`
  - `raw_value`: Integer count of detected anomalies.
  - `direction`: `"nominal"` if zero anomalies; `"anomalous"` if anomalies observed.
  - `interpretation`: Objective observation text describing marker count and identified inconsistencies.
- **JSON Artifact**:
  - Saved to `storage/analyses/jpeg_structure/jpeg_structure_analysis_{id}.json`.
  - Detailed catalog containing total file bytes, full marker sequence flow, segment byte offsets, lengths, dimensions, components, restart interval, and structural anomaly descriptions.

---

## 5. Execution Parameters
- `include_raw_segments` (boolean, default: `true`): Dictates whether the complete list of segments with byte offsets and sizes is returned in structured findings.

---

## 6. Limitations
- Operates strictly on container syntax; does not decompress DCT blocks or evaluate statistical pixel distributions.
- Non-standard APP marker placements and proprietary metadata tags occur routinely across valid camera firmware and software encoders.
- Structural anomalies indicate file damage, format non-compliance, or unusual encoder behavior; they do not by themselves prove malicious image forgery.

---

## 7. Scientific References
1. **ITU-T Recommendation T.81 / ISO/IEC 10918-1 (1992)**. *Information technology – Digital compression and coding of continuous-tone still images: Requirements and guidelines*. International Telecommunication Union.
2. **Kee, E., Johnson, M. K., & Farid, H. (2011)**. *Digital image authentication from JPEG headers*. IEEE Transactions on Information Forensics and Security, 6(3), 1066-1075.

---

## 8. Interpretation Guidance
- **Nominal Output**: All markers appear in canonical order with matching SOI/EOI, consistent frame headers, and zero trailing bytes.
- **Trailing Bytes after EOI**: Additional data appended after `0xFFD9`. Common in cameras storing proprietary metadata (e.g. MPF/stereoscopic images) or file append tampering.
- **Truncated Stream**: Missing EOI or premature file termination during entropy scan. Indicates transmission failure, network cutoff, or partial file recovery.
- **Misordered / Duplicate Markers**: Multiple SOF markers or unexpected marker sequences indicate non-standard encoders or container manipulation.

---

## 9. Non-Applicability
- Lossless and non-JPEG formats (such as PNG, WebP, TIFF, BMP) return `status = NOT_APPLICABLE` with the mandatory scientific guardrail notice:
  > *Inapplicability is a methodological boundary constraint, NOT negative evidence of forgery or proof of authenticity.*

---

## 10. Known Failure Modes
- Completely scrambled or non-JPEG headers lacking `0xFFD8` return `status = FAILED` with concise error summaries.
- Zero-byte files safely exit with `status = FAILED`.
