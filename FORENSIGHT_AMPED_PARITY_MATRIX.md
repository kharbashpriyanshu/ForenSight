# ForenSight V3 vs. Amped Authenticate — Forensic Capability Parity Matrix

**Document Version:** 4.0.0-STEP1  
**Baseline Status:** V3 BASELINE VERIFIED & FROZEN | V4 STEP 1 ARCHITECTURE READY  
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
| **JPEG Quantization Table Analysis** | **NOT IMPLEMENTED** | **PLANNED** (`JPEG-QT`, v1.0.0) | Contract specified in manifest; comparison against camera and editing software quantization matrices. | Planned for future implementation. |
| **JPEG Huffman Coding Analysis** | **NOT IMPLEMENTED** | **PLANNED** (`JPEG-HUFFMAN`, v1.0.0) | Contract specified in manifest; DHT code length and custom table inspection. | Planned for future implementation. |
| **JPEG Structure & Marker Analysis** | **NOT IMPLEMENTED** | **PLANNED** (`JPEG-STRUCTURE`, v1.0.0) | Contract specified in manifest; marker sequence ordering, restart markers, and trailing bytes. | Planned for future implementation. |
| **JPEG Ghost Detection** | **NOT IMPLEMENTED** | **PLANNED** (`JPEG-GHOST`, v1.0.0) | Contract specified in manifest; iterative recompression difference curve analysis across varying quality factors. | Planned for future implementation. |
| **Blocking Artifact Inconsistency** | **NOT IMPLEMENTED** | **PLANNED** (`BLOCKING-ARTIFACT`, v1.0.0) | Contract specified in manifest; 8x8 block boundary gradient discontinuities and grid displacement. | Planned for future implementation. |
| **Aligned Double JPEG (ADJPEG)** | **NOT IMPLEMENTED** | **PLANNED** (`ADJPEG`, v1.0.0) | Contract specified in manifest; periodic peak and zero detection in DCT coefficient histograms. | Planned for future implementation. |
| **Non-Aligned Double JPEG (NADJPEG)** | **NOT IMPLEMENTED** | **PLANNED** (`NADJPEG`, v1.0.0) | Contract specified in manifest; double compression detection across shifted/cropped 8x8 block boundaries. | Planned for future implementation. |
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

ForenSight V4 Step 1 establishes the unified extension architecture for forensic algorithms without implementing unverified code. 

**EXPLICIT CONFIRMATION:**  
- **NO NEW FORENSIC ALGORITHM WAS IMPLEMENTED IN THIS STEP.**  
- All 18 future forensic modules are strictly cataloged with `STATUS = PLANNED`.  
- The 38 frozen files in `backend/app/forensics/` remain completely unchanged.
