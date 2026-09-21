# JPEG Huffman Coding Analysis (`JPEG-HUFFMAN`)

## 1. Purpose
The `JPEG-HUFFMAN` forensic engine extracts and inspects JPEG Huffman coding tables from DHT (`0xFFC4`) segments. Huffman tables define prefix codes used for lossless variable-length entropy coding of quantized DCT coefficients. Comparing table structure against baseline standards provides insight into encoder implementations and software signatures.

---

## 2. Methodology
1. **DHT Segment Parsing**: Directly reads all DHT segments in the stream, isolating:
   - Table class: DC (differential DC coefficient coding) vs AC (high-frequency zig-zag run-length coding)
   - Table destination ID: 0 to 3
   - 16-element array of code length counts $L_1 \dots L_{16}$, representing the count of codes for each bit length from 1 to 16
   - Symbol value sequence of length $\sum L_i$
2. **Canonical Code Verification**: Reconstructs canonical code structure and validates that symbol counts match specified lengths without payload overrun.
3. **Annex K Baseline Comparison**: Compares code length distributions against the four canonical baseline tables defined in ITU-T Recommendation T.81 Annex K:
   - Table K.3: Luminance DC
   - Table K.4: Luminance AC
   - Table K.5: Chrominance DC
   - Table K.6: Chrominance AC
   Identifies whether each table matches the standard baseline or represents a custom/optimized distribution.
4. **Scan Component Association**: Cross-references table IDs with SOS (Start of Scan) component selectors to determine which image channels (Y, Cb, Cr) utilize each Huffman table.
5. **Cryptographic Fingerprinting**: Computes a deterministic SHA-256 hash over the canonical table structure (class, ID, code lengths, and symbol values).

---

## 3. Input Requirements
- **Container Format**: `JPEG` / `JPG` only.
- **Minimum Dimensions**: $1 \times 1$ pixels.
- **Prerequisite Markers**: Must contain at least one valid DHT segment.

---

## 4. Outputs
- **Normalized Observation**:
  - `observation_type`: `JPEG_HUFFMAN`
  - `metric_name`: `TABLE_COUNT`
  - `raw_value`: Number of extracted Huffman tables.
  - `direction`: `"standard_baseline"` if all tables match Annex K; `"custom_entropy"` if optimized tables exist.
  - `interpretation`: Text summary stating DC/AC table counts, standard vs custom table breakdown, and availability of table fingerprints.
- **JSON Artifact**:
  - Saved to `storage/analyses/jpeg_huffman/jpeg_huffman_analysis_{id}.json`.
  - Comprehensive structure containing table class, destination ID, total symbols, code-length distributions, symbol sequences, component links, and SHA-256 fingerprints.

---

## 5. Execution Parameters
- `include_symbol_details` (boolean, default: `true`): Controls whether full raw symbol sequences are included in structured findings.

---

## 6. Limitations
- Huffman table analysis evaluates entropy coding structures; it does not decode or verify the variable-length bitstream payload.
- Custom or optimized Huffman tables are standard industry practice in modern encoders (e.g. `mozjpeg`, Adobe Photoshop, GIMP) to minimize file size, and must *never* be interpreted alone as evidence of forgery.
- Arithmetic-coded JPEGs (which use DAC instead of DHT) return `NOT_APPLICABLE`.

---

## 7. Scientific References
1. **ITU-T Recommendation T.81 / ISO/IEC 10918-1 (1992)**. *Annex K: Examples and guidelines (Huffman table specification)*. International Telecommunication Union.
2. **Stamm, M. C., Wu, M., & Liu, K. J. R. (2013)**. *Information forensics: An overview of the first decade*. IEEE Access, 1, 167-200.

---

## 8. Interpretation Guidance
- **Standard Annex K Baseline**: The encoder used fixed, pre-computed default Huffman tables. Common in digital cameras and standard hardware capture pipelines.
- **Custom / Optimized Tables**: The encoder performed a two-pass analysis of DCT coefficients to generate frequency-optimal prefix codes. Characteristic of software post-processing tools and modern web encoders.
- **Fingerprinting**: Table SHA-256 fingerprints can be compared against known software libraries to assist in encoder lineage identification.

---

## 9. Non-Applicability
- Non-JPEG images (PNG, WebP) and arithmetic-coded JPEGs return `status = NOT_APPLICABLE` with the mandatory scientific guardrail notice.

---

## 10. Known Failure Modes
- Truncated DHT segments with fewer bytes than specified by the symbol count are safely caught and reported as structural anomalies.
