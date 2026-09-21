# ForenSight V3 vs. Amped Authenticate — Forensic Capability Parity Matrix

**Document Version:** 4.0.0-STEP2  
**Baseline Status:** V3 BASELINE VERIFIED & FROZEN | V4 STEP 2 ADVANCED JPEG ENGINES IMPLEMENTED  
**Date:** 2026-09-21  

This document presents a transparent, evidence-based assessment of ForenSight's digital image forensic capabilities in comparison to industry-standard forensic suites (e.g., Amped Authenticate). It reflects current baseline capabilities, frozen V3 algorithms, and the V4 Forensic Engine Extension Architecture without speculative claims or synthetic indicators.

---

## 1. Forensic Modality & Algorithmic Parity Matrix

| Capability / Modality | ForenSight V3 Status | V4 Extension Architecture Status | Algorithmic Implementation Details / Contract Specification | Notes & Limitations |
| :--- | :--- | :--- | :--- | :--- |
| **Metadata & EXIF Parsing** | **IMPLEMENTED** | **ADAPTED** (`LegacyMetadataAdapter`) | Raw container parsing via `exifread`/PIL; extracts EXIF tags, camera make/model, timestamps, software signatures, GPS, and lens data. | Easily altered or stripped; absence does not indicate manipulation. |
| **Error Level Analysis (ELA)** | **IMPLEMENTED** | **ADAPTED** (`LegacyELAAdapter`) | Recompression at 95% JPEG quality; computes absolute pixel-wise difference, scales error intensity, computes mean/max error metrics. | JPEG only. Lossless formats (PNG, WebP) yield `NOT_APPLICABLE` (not negative evidence). |
| **Noise Residual Analysis** | **IMPLEMENTED** | **ADAPTED** (`LegacyNoiseAdapter`) | High-frequency noise extraction via spatial median filtering ($3 \times 3$, $5 \times 5$ kernels); calculates noise variance, SNR, and localized SNR grids. | Measures high-frequency residuals; does not calculate sensor PRNU. |
| **JPEG / DCT Block Analysis** | **IMPLEMENTED** | **ADAPTED** (`LegacyJPEGDCTAdapter`) | Discrete Cosine Transform on $8 \times 8$ pixel blocks; parses quantization tables, luminance/chrominance histograms, and detects double quantization traces. | JPEG only; rejected for non-JPEG formats. Multiple saves in authentic editors legitimately trigger anomalies. |
| **Classical Copy-Move Detection**| **IMPLEMENTED** | **ADAPTED** (`LegacyCopyMoveAdapter`) | SIFT/ORB keypoint feature detection, brute-force k-NN matching with Lowe's ratio test ($0.75$), spatial distance thresholding ($> 30$ px), and DBSCAN keypoint clustering. | Detects cloned regions; ineffective against heavily blurred, rotated, or affine-distorted clones without matching descriptors. |
| **Deterministic Evidence Fusion** | **IMPLEMENTED** | **INTEGRATED** (`Rule 7B-v1`) | Rule Engine (Rule 7B-v1) grouping observations into orthogonal families (Compression, Noise, Geometry, Metadata) to derive qualitative follow-up recommendations. | Rejects black-box "fake %" scores. Outputs qualitative concern levels (`NONE`, `LOW`, `MODERATE`, `ELEVATED`, `HIGH`). |
| **Forensic Observation Heatmap** | **IMPLEMENTED** | **INTEGRATED** (`ArtifactType.HEATMAP`) | Multi-modality spatial overlay mapping normalized bounding regions for ELA, Noise, and Copy-Move on a standardized $[0.0, 1.0]$ coordinate grid. | Explainable observation layers; no synthetic probability masks or arbitrary suspicion percentages. |
| **Side-by-Side Comparison** | **IMPLEMENTED** | **INTEGRATED** (Dual-Canvas View) | Synchronized dual-canvas viewport comparing file metadata, dimensions, hash signatures, compression parameters, and modality artifacts. | Structural and perceptual comparison; does not compute automated manipulation scores. |
| **Cross-Image Correlation** | **IMPLEMENTED** | **INTEGRATED** (`CrossCorrelationService`) | Evaluates case-wide evidence for shared camera hardware fingerprints (Make/Model/Serial), temporal capture sequencing, and cross-evidence descriptor matching. | Inter-image correlation within case scope; case-isolated. |
| **Investigation Knowledge Graph**| **IMPLEMENTED** | **INTEGRATED** (`CASE->...->REPORT`) | Directed acyclic topological graph linking `CASE -> EVIDENCE -> ANALYSIS_JOB -> ANALYSIS -> OBSERVATION -> ARTIFACT -> FINDING -> REPORT`. | Enforces relational integrity; audit and case-scoped. |
| **Cryptographic Chain of Custody**| **IMPLEMENTED** | **INTEGRATED** (`CustodyService`) | SHA-256 fingerprinting on ingestion, immutable custody ledger, on-demand byte-level integrity verification, tamper detection. | Detects bit-rot and unauthorized disk tampering in real time. |
| **Rule-Based Assistant** | **IMPLEMENTED** | **INTEGRATED** (`AssistantService`) | 3-part structured guidance ("What was found", "Why might it matter", "Recommended next steps"), counter-hypotheses, and completeness tracking. | Strictly deterministic rule logic; no generative hallucinations or unsupported guilt conclusions. |
| **Findings Lifecycle & Review** | **IMPLEMENTED** | **INTEGRATED** (`FindingService`) | Formal state machine (`GENERATED`, `REVIEW_REQUIRED`, `ACKNOWLEDGED`, `CONFIRMED_BY_ANALYST`, `DISMISSED`, `INCONCLUSIVE`) with mandatory justification and analyst audit trail. | Ensures human-in-the-loop analyst governance. |
| **Export Reporting (PDF/JSON)** | **IMPLEMENTED** | **INTEGRATED** (`ReportService`) | Dual-format export bundling case metadata, evidence hashes, findings, analyst review decisions, notes, and full provenance trees. | Uses compliant terminology ("Professional forensic investigation report"); prohibits "court-ready" claims. |
| **Cryptographic Replay** | **IMPLEMENTED** | **INTEGRATED** (`ReplayService`) | Reconstructs analytical state from stored parameters, engine version, and source hash; validates output determinism. | Replay verification of deterministic forensic pipeline. |
| **JPEG Structure & Marker Analysis** | **NOT IMPLEMENTED** | **IMPLEMENTED** (`JPEG-STRUCTURE`, v1.0.0) | Low-overhead byte stream parsing of marker sequences (SOI, EOI, APP, DQT, SOF, DHT, DRI, SOS), segment byte offsets, lengths, dimensions, component sampling factors, and detection of structural anomalies (missing SOI/EOI, trailing bytes, truncations). | Validated across clean, truncated, malformed, and non-JPEG inputs. Operates directly on byte stream. |
| **JPEG Quantization Table Analysis** | **NOT IMPLEMENTED** | **IMPLEMENTED** (`JPEG-QT`, v1.0.0) | Direct DQT segment extraction, 8x8 matrix reconstruction, deterministic statistics (min, max, mean, variance, DC/AC split), SHA-256 table fingerprints, component associations, and calibrated IJG quality factor curve fitting with explicit scientific disclaimer. | Validated across multiple tables and custom profiles. Non-IJG tables return `NOT_ESTIMATED`. |
| **JPEG Huffman Coding Analysis** | **NOT IMPLEMENTED** | **IMPLEMENTED** (`JPEG-HUFFMAN`, v1.0.0) | Direct DHT segment extraction, DC/AC separation, 16-bin code length distributions, symbol cardinality counts, SHA-256 fingerprints, and comparison against ITU-T T.81 Annex K standard baseline tables. | Distinguishes standard baseline tables from custom/optimized tables without inferring malicious intent. |
| **JPEG Ghost Detection** | **NOT IMPLEMENTED** | **IMPLEMENTED** (`JPEG-GHOST`, v1.0.0) | Controlled recompression sweep across quality spectrum $[q_{\min}, q_{\max}]$ (Farid 2009), global response curve calculation, localized candidate spliced region detection via IQR thresholding, and pseudo-color Viridis difference heatmap generation. | Non-JPEG returns `NOT_APPLICABLE` (not negative evidence). Evaluates compression history variations; does not output fake probability. |
| **Blocking Artifact Inconsistency** | **NOT IMPLEMENTED** | **PLANNED** (`BLOCKING-ARTIFACT`, v1.0.0) | Contract specified in manifest; 8x8 block boundary gradient discontinuities and grid displacement. | Planned for future implementation. |
| **Aligned Double JPEG (ADJPEG)** | **NOT IMPLEMENTED** | **IMPLEMENTED** (`ADJPEG`, v1.0.0) | Aligned double-JPEG compression detector evaluating $8 \times 8$ block DCT coefficient histograms across 8 primary AC frequency modes, 1D FFT periodicity peak ratio calculation against the spectral noise floor, and 2-panel diagnostic histogram/spectrum plotting. | Non-JPEG returns `NOT_APPLICABLE`. Detects double quantization comb artifacts. |
| **Non-Aligned Double JPEG (NADJPEG)** | **NOT IMPLEMENTED** | **IMPLEMENTED** (`NADJPEG`, v1.0.0) | Non-aligned double-JPEG compression detector calculating inter-pixel boundary discontinuity gradients across all 64 candidate phase shifts $[0..7] \times [0..7]$ (Li 2008 / Bianchi 2011), candidate spatial shift $(\Delta r^*, \Delta c^*)$ extraction, and 64-cell energy matrix visualization. | Non-JPEG returns `NOT_APPLICABLE`. Detects shifted compression grids from cropping/resaving. |
| **Color Histogram Analysis** | **NOT IMPLEMENTED** | **PLANNED** (`HISTOGRAM`, v1.0.0) | Contract specified in manifest; channel distribution analysis for comb artifacts and dynamic range gaps. | Planned for future implementation. |
| **Color Channel Discrepancy** | **NOT IMPLEMENTED** | **PLANNED** (`COLOR-CHANNEL`, v1.0.0) | Contract specified in manifest; inter-channel correlation matrices and lateral chromatic aberration modeling. | Planned for future implementation. |
| **Fourier / 2D FFT Spectrum** | **NOT IMPLEMENTED** | **PLANNED** (`FOURIER`, v1.0.0) | Contract specified in manifest; 2D FFT magnitude spectrum to isolate periodic frequency spikes from resampling. | Planned for future implementation. |
| **Advanced Multiscale Noise** | **NOT IMPLEMENTED** | **PLANNED** (`ADVANCED-NOISE`, v1.0.0) | Contract specified in manifest; wavelet subband decomposition for localized noise variance mapping. | Planned for future implementation. |
| **Resampling & Interpolation** | **NOT IMPLEMENTED** | **PLANNED** (`RESAMPLING`, v1.0.0) | Contract specified in manifest; linear predictor error mapping and p-spectrum periodic artifact analysis. | Planned for future implementation. |
| **Block-Based Clone Detection** | **NOT IMPLEMENTED** | **PLANNED** (`CLONE-BLOCK`, v1.0.0) | Contract specified in manifest; sliding window lexicographical sorting of DCT block descriptors. | Planned for future implementation. |
| **Keypoint-Based Geometric Cloning**| **NOT IMPLEMENTED** | **PLANNED** (`CLONE-KEYPOINT`, v1.0.0) | Contract specified in manifest; affine-invariant keypoint matching resilient to rotation and scaling. | Planned for future implementation. |
| **Photo Response Non-Uniformity (PRNU)** | **NOT IMPLEMENTED** | **PLANNED** (`PRNU`, v1.0.0) | Contract specified in manifest; sensor noise pattern extraction for device fingerprinting and PCE calculation. | Planned for future implementation. |
| **Camera Hardware Identification** | **NOT IMPLEMENTED** | **PLANNED** (`CAMERA-ID`, v1.0.0) | Contract specified in manifest; sensor noise, CFA demosaicing traces, and DQT clustering to identify hardware make/model. | Planned for future implementation. |
| **Synthetic & AI Screening** | **NOT IMPLEMENTED** | **PLANNED** (`AI-SCREENING`, v1.0.0) | Contract specified in manifest; spectral checkerboard artifacts and physical rendering anomalies of generative models. | Planned for future implementation. |
| **Video Forensics** | **NOT IMPLEMENTED** | **PLANNED** (`VIDEO-FORENSICS`, v1.0.0) | Contract specified in manifest; video container atom inspection, GOP cadence, and optical flow vectors. | Planned for future implementation. |

---

## 2. Summary of Architecture & Scope Confirmation

ForenSight V4 Step 3 implements the next three real forensic engines under the V4 Extension Architecture:
1. `JPEG-GHOST` (JPEG Ghost Detection)
2. `ADJPEG` (Aligned Double JPEG Compression Analysis)
3. `NADJPEG` (Non-Aligned Double JPEG Compression Analysis)

Alongside the Phase 2A engines (`JPEG-STRUCTURE`, `JPEG-QT`, `JPEG-HUFFMAN`), six production V4 engines are now fully operational.

**EXPLICIT CONFIRMATION:**  
- **ONLY THESE THREE ENGINES WERE IMPLEMENTED IN STEP 3.**  
- All other 12 future forensic modules remain strictly cataloged with `STATUS = PLANNED`.  
- The 38 frozen files in `backend/app/forensics/` remain completely unchanged (verified cryptographically).
