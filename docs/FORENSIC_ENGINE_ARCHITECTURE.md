# ForenSight V4 — Forensic Engine Extension Architecture

**Version:** 4.0.0-STEP1-ARCHITECTURE  
**Status:** ARCHITECTURAL SPECIFICATION & FRAMEWORK  
**Date:** 2026-09-21  

---

## 1. Executive Summary

ForenSight V4 introduces the **Forensic Engine Extension Architecture**, an open, standardized framework designed to integrate diverse physical, frequency, and statistical forensic analytical engines. 

This architecture guarantees:
1. **Scientific Honesty**: Enforces the non-negotiable rule that `NOT_APPLICABLE != NEGATIVE_EVIDENCE`. Incompatible container formats or dimensions are rejected with explicit technical justifications rather than false negative verdicts.
2. **Frozen Core Preservation**: The 38-file V3 forensic core (`metadata`, `ela`, `noise`, `jpeg_dct`, `copy_move`, `fusion`) remains 100% frozen and unmodified. Legacy engines are exposed to the new extension contract through non-invasive adapters.
3. **Additive Modularity**: Future engines can be introduced without destructive schema migrations, preserving complete provenance, audit, graph, and reporting integration.
4. **Planned Cataloging Without Fake Science**: Future analytical engines are formally inventoried under `STATUS = PLANNED` with zero placeholder algorithms or fabricated scientific citations.

---

## 2. Core Engine Contract

All forensic engines in V4 inherit from the abstract base class `BaseForensicEngine` located in [`backend/app/engine_extensions/contract.py`](file:///d:/Project%20Resume/ForenSight/backend/app/engine_extensions/contract.py).

```python
class BaseForensicEngine(ABC):
    engine_id: str                      # Unique uppercase identifier (e.g., "JPEG_DCT", "PRNU")
    engine_name: str                    # Human-readable title
    engine_version: str = "1.0.0"       # Semantic versioning
    category: EngineCategory            # Standardized algorithmic taxonomy
    description: str                    # Methodological scope
    input_requirements: InputRequirements # Supported formats, dimensions, color channels
    limitations: List[str]              # Documented false-positive / false-negative constraints
    scientific_references: List[ScientificReference] # Literature and standard citations

    parameter_schema: Type[BaseModel]   # Pydantic schema for serializable parameters
    observation_schema: Type[BaseModel] # Pydantic schema for empirical measurements

    def check_applicability(self, context: ExecutionContext) -> ApplicabilityResult:
        """Evaluates container format and resolution prerequisites."""
        ...

    @abstractmethod
    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        """Executes analysis and generates normalized observations and artifacts."""
        ...
```

### Key Subordinate Structures

- **`InputRequirements`**: Defines supported image formats (e.g. `["JPEG", "JPG"]` or `["ALL"]`), minimum pixel dimensions, maximum dimension bounds, color space requirements, and whether lossy compression history is required.
- **`ApplicabilityResult`**: Explicit boolean flag with descriptive rationale and the required forensic guardrail notice.
- **`ExecutionContext`**: Immutable input packet including evidence IDs, storage file paths, SHA-256 hash, image geometry, execution parameters, and output directories.
- **`EngineExecutionResult`**: Standardized output payload carrying status, execution time in milliseconds, list of `NormalizedObservation`s, list of `EngineArtifactMetadata`s, structured findings, and inapplicability payloads.

---

## 3. Standard Engine Status & The Scientific Safeguard

Analytical outcomes are governed by the `EngineExecutionStatus` enumeration:

| Status | Definition | Scientific Meaning |
| :--- | :--- | :--- |
| `APPLIED` / `COMPLETED` | Algorithm executed and computed empirical metrics. | Measurements are recorded for analyst interpretation. |
| `NOT_APPLICABLE` | Input fails mathematical/container prerequisites (e.g. DCT on PNG). | **NOT NEGATIVE EVIDENCE.** The method cannot be applied; does NOT prove authenticity. |
| `FAILED` | Process error, truncated input, or unexpected exception. | Systemic failure; no scientific inference can be drawn. |
| `PENDING` / `RUNNING` | In queue or actively computing. | Non-terminal scheduling states. |

### The Critical Inapplicability Rule: `NOT_APPLICABLE != NEGATIVE_EVIDENCE`
When an image container or structure does not meet the mathematical requirements of a forensic engine (e.g., attempting JPEG frequency analysis on a lossless PNG image), the engine **MUST** return `status = NOT_APPLICABLE`.

The engine contract embeds the following non-negotiable scientific guardrail notice in all inapplicability payloads:
> *"CRITICAL FORENSIC NOTICE: Method inapplicability is NOT negative evidence. The target image container or structure does not meet the mathematical requirements of this forensic filter. The absence of findings under this method MUST NOT be cited as evidence of image authenticity or absence of manipulation."*

---

## 4. Engine Categories Taxonomy

The `EngineCategory` enum defines seven orthogonal analytical domains:

1. **`FILE_ANALYSIS`**: Container headers, EXIF/XMP/IPTC metadata, structural markers, and format integrity.
2. **`GLOBAL_ANALYSIS`**: Whole-image frequency spectra (2D FFT), DCT coefficient distributions, and histogram anomalies.
3. **`LOCAL_ANALYSIS`**: Localized spatial variances, error-level analysis (ELA), spatial noise residuals, and blocking artifacts.
4. **`CAMERA_IDENTIFICATION`**: Physical sensor pattern noise (PRNU), color filter array (CFA) demosaicing, and optical lens distortions.
5. **`GEOMETRIC_ANALYSIS`**: Perspective geometry, shadow consistency, keypoint cloning (SIFT/ORB), and block-matching clone detection.
6. **`AI_SCREENING`**: Deep-learning screening, generative diffusion checkerboard artifacts, and synthetic face indicators.
7. **`VIDEO_FORENSICS`**: Temporal frame coherence, GOP compression cadence, and inter-frame optical flow vectors.

---

## 5. Normalized Observation & Artifact Contracts

### Normalized Observation Model
Observations generated by engines adhere to `NormalizedObservation` ([`observation.py`](file:///d:/Project%20Resume/ForenSight/backend/app/engine_extensions/observation.py)):
- `evidence_id`: Target evidence asset.
- `analysis_id`: Linked analysis record.
- `engine_id` & `engine_version`: Originating engine identity and semantic version.
- `status`: Execution status (`APPLIED`, `NOT_APPLICABLE`, `FAILED`).
- `observation_type`: Category identifier (e.g., `COMPRESSION_ERROR`, `NOISE_RESIDUAL`).
- `metric_name`: Specific measurement (e.g., `MEAN_ERROR`, `HIST_ENERGY`).
- `raw_value`: Unscaled string representation.
- `normalized_value`: Scaled scalar in $[0.0, 1.0]$ when mathematically defensible.
- `direction`: `elevated`, `consistent`, or `informational`.
- `technical_reliability`: `HIGH`, `MEDIUM`, or `CONDITIONAL`.
- `interpretation`: Factual, objective description of physical phenomenon.
- `limitations`: Explicit list of caveats.
- `parameters_used`: Record of all configuration inputs.

To integrate seamlessly with the existing database schema, `NormalizedObservation.to_domain_observation()` maps directly to the SQLAlchemy `EvidenceObservation` model.

### Standard Artifact Metadata Model
Artifacts generated by engines (heatmaps, spectra, plots, masks) adhere to `EngineArtifactMetadata` ([`artifact.py`](file:///d:/Project%20Resume/ForenSight/backend/app/engine_extensions/artifact.py)):
- `artifact_type`: `HEATMAP`, `PLOT`, `VISUALIZATION`, `MASK`, `SPECTRUM`, `TABLE`, `JSON`, `DERIVED_IMAGE`.
- `storage_path`: Relative path under `backend/storage/`.
- `sha256_hash`: Cryptographic digest of the generated artifact file.
- `width`, `height`, `mime_type`: Geometric and format properties.
- `to_legacy_artifact_dict()`: Maps to `Analysis.structured_findings["artifacts"]` for graph and report consumption.

---

## 6. Engine Registry & Discovery

The singleton `ForensicEngineRegistry` ([`registry.py`](file:///d:/Project%20Resume/ForenSight/backend/app/engine_extensions/registry.py)) maintains an in-memory catalog of active engines:
- `register(engine)`: Registers an active engine instance.
- `get_engine(engine_id)`: Fetches an engine by case-insensitive ID.
- `list_engines(category)`: Lists active engines with optional category filtering.
- `filter_by_format(format)`: Discovers engines supporting a given image container.
- `check_applicability(engine_id, context)`: Pre-execution capability check.
- `get_planned_manifest()`: Returns the catalog of planned future engines.

**Execution Boundary:** The registry is strictly a discovery mechanism. It does NOT automatically trigger execution; execution orchestration remains under the governance of the API gateway and Celery worker pipeline.

---

## 7. Authenticated Discovery API

The extension architecture exposes authenticated, read-only endpoints via `/api/engines`:

| Method | Endpoint | Description |
| :---: | :--- | :--- |
| `GET` | `/api/engines` | Lists all active registered engines (supports `?category=` and `?container_format=`). |
| `GET` | `/api/engines/categories` | Returns all 7 engine categories and their descriptions. |
| `GET` | `/api/engines/planned` | Returns the formal catalog of 18 planned future engines. |
| `GET` | `/api/engines/{engine_id}` | Retrieves full metadata, input requirements, limitations, and citations. |

All endpoints enforce JWT authentication via `get_current_user`.

---

## 8. Provenance, Investigation Graph & Report Compatibility

The V4 Extension Architecture adheres strictly to the existing investigation provenance pipeline:

```
CASE
 → EVIDENCE (SHA-256 Fingerprint)
   → ANALYSIS_JOB (Async Scheduling)
     → ANALYSIS (Engine Record, Parameters & Version)
       → OBSERVATION (Normalized Observation Metrics)
       → ARTIFACT (Heatmaps, Spectra, Error Maps)
         → FINDING (Correlated Rule Findings & Analyst Decisions)
           → REPORT (PDF / JSON Export Documentation)
```

1. **Investigation Graph**: Artifacts generated by new engines are registered under `Analysis.structured_findings["artifacts"]`, automatically generating `ARTIFACT` nodes in `GET /api/cases/{case_id}/graph`.
2. **Correlation Engine**: Normalized observations feed directly into the existing `EvidenceObservation` table, allowing the Correlation Engine (`Rule 7B-v1`) to ingest new measurements without code rewriting.
3. **Audit Ledger & Chain of Custody**: Job dispatches and completions continue to be logged to `AuditEvent`, maintaining byte-level traceability.
4. **Reports**: Reporting services extract engine name, semantic version, parameters, limitations, and artifact paths directly from `Analysis` records.

---

## 9. How Future Engines Should Be Added

When a future engine is ready for implementation in a subsequent phase:
1. **Implement Engine**: Create a subclass of `BaseForensicEngine` under `backend/app/engine_extensions/`.
2. **Specify Contract**: Define `InputRequirements`, explicit `parameter_schema`, `limitations`, and peer-reviewed `scientific_references`.
3. **Implement Execution**: Implement `execute(context)` producing `NormalizedObservation`s and `EngineArtifactMetadata`s.
4. **Register**: Add the engine instance to `engine_registry.register(MyEngine())`.
5. **Add Unit Tests**: Write unit tests covering determinism, applicability, and parameter validation.

---

## 10. Implemented V4 Forensic Engines (Phase 2A: Advanced JPEG)

The following three production engines were implemented and verified in V4 Step 2 under `backend/app/engine_extensions/jpeg/`:

1. **`JPEG-STRUCTURE` (v1.0.0)**: Low-overhead binary parser for ITU-T T.81 marker sequences, segment offsets, frame geometry, component sampling factors, and structural anomaly detection.  
   *Reference Documentation:* [docs/JPEG_STRUCTURE_ANALYSIS.md](file:///d:/Project%20Resume/ForenSight/docs/JPEG_STRUCTURE_ANALYSIS.md)
2. **`JPEG-QT` (v1.0.0)**: Direct DQT segment parsing, $8 \times 8$ matrix reconstruction, deterministic statistics (DC/AC split, min, max, mean, variance), SHA-256 table fingerprints, and calibrated IJG quality factor estimation.  
   *Reference Documentation:* [docs/JPEG_QUANTIZATION_ANALYSIS.md](file:///d:/Project%20Resume/ForenSight/docs/JPEG_QUANTIZATION_ANALYSIS.md)
3. **`JPEG-HUFFMAN` (v1.0.0)**: DHT segment parsing, DC/AC separation, 16-element code length histograms, symbol counts, table fingerprints, and ITU-T T.81 Annex K baseline compliance checking.  
   *Reference Documentation:* [docs/JPEG_HUFFMAN_ANALYSIS.md](file:///d:/Project%20Resume/ForenSight/docs/JPEG_HUFFMAN_ANALYSIS.md)

---

## 11. Implemented V4 Forensic Engines (Phase 2B: JPEG Compression History)

The following three production engines were implemented and verified in V4 Step 3 under `backend/app/engine_extensions/compression/`:

1. **`JPEG-GHOST` (v1.0.0)**: Iterative recompression residual sweep across quality spectrum $[q_{\min}, q_{\max}]$ (Farid 2009), global response curve calculation, localized candidate spliced region detection via IQR thresholding, and pseudo-color Viridis difference heatmap generation.  
   *Reference Documentation:* [docs/JPEG_GHOST_ANALYSIS.md](file:///d:/Project%20Resume/ForenSight/docs/JPEG_GHOST_ANALYSIS.md)
2. **`ADJPEG` (v1.0.0)**: Aligned double-JPEG compression detector evaluating $8 \times 8$ block DCT coefficient histograms across 8 primary AC frequency modes, 1D FFT periodicity peak ratio calculation against the spectral noise floor, and 2-panel diagnostic histogram/spectrum plotting.  
   *Reference Documentation:* [docs/ADJPEG_ANALYSIS.md](file:///d:/Project%20Resume/ForenSight/docs/ADJPEG_ANALYSIS.md)
3. **`NADJPEG` (v1.0.0)**: Non-aligned double-JPEG compression detector calculating inter-pixel boundary discontinuity gradients across all 64 candidate phase shifts $[0..7] \times [0..7]$ (Li 2008 / Bianchi 2011), candidate spatial shift $(\Delta r^*, \Delta c^*)$ extraction, and 64-cell energy matrix visualization.  
   *Reference Documentation:* [docs/NADJPEG_ANALYSIS.md](file:///d:/Project%20Resume/ForenSight/docs/NADJPEG_ANALYSIS.md)

---

## 12. Implemented V4 Forensic Engines (Phase 2C: Blocking Artifact Forensics)

The following production engine was implemented and verified in V4 Step 4 under `backend/app/engine_extensions/blocking/`:

1. **`BLOCKING-ARTIFACT` (v1.0.0)**: Genuine 8×8 DCT block boundary discontinuity analyzer (Wang 2002 / Fan & de Queiroz 2003 / Li 2009). Evaluates horizontal and vertical block boundary step excesses relative to local texture gradients, calculates global boundary-to-internal ratios and grid periodicity harmonic peaks, generates 2D spatial blocking maps (`blocking_artifact_map.png`), and detects deterministic candidate regions via spatial z-score clustering.  
   *Reference Documentation:* [docs/BLOCKING_ARTIFACT_ANALYSIS.md](file:///d:/Project%20Resume/ForenSight/docs/BLOCKING_ARTIFACT_ANALYSIS.md)

---

## 13. Implemented V4 Forensic Engines (Phase 2D: Distribution, Color & Frequency Forensics)

The following production engines were implemented and verified in V4 Step 5:

1. **`HISTOGRAM` (v1.0.0)**: Evaluates multi-channel tonal and chromatic distributions across Luminance, Red, Green, and Blue bands. Computes 256-bin counts, PDFs, CDFs, moments, percentiles, Shannon information entropy, dynamic range span, shadow/highlight clipping percentages, and comb-like zero-bin gaps characteristic of non-linear contrast stretching (Stamm & Liu 2010 / Gonzalez & Woods 2018).  
   *Location:* `backend/app/engine_extensions/distribution/`  
   *Reference Documentation:* [docs/HISTOGRAM_ANALYSIS.md](file:///d:/Project%20Resume/ForenSight/docs/HISTOGRAM_ANALYSIS.md)

2. **`COLOR-CHANNEL` (v1.0.0)**: Evaluates spatial inter-channel Pearson correlations ($\rho_{RG}, \rho_{RB}, \rho_{GB}$), absolute channel difference maps ($|R-G|, |R-B|, |G-B|$), and normalized chromaticity coordinates. Performs block-based spatial channel deviation and z-score mapping to cluster candidate anomaly regions with unusual inter-channel disparity (Ng et al. 2005 / Riess & Angelopoulou 2010 / Carvalho et al. 2013).  
   *Location:* `backend/app/engine_extensions/color/`  
   *Reference Documentation:* [docs/COLOR_CHANNEL_ANALYSIS.md](file:///d:/Project%20Resume/ForenSight/docs/COLOR_CHANNEL_ANALYSIS.md)

3. **`FOURIER` (v1.0.0)**: Computes zero-centered 2D Fast Fourier Transform (FFT) magnitude and power spectra on luminance float32 signals. Partitions radial frequency energy into low ($[0, 0.15]$), mid ($(0.15, 0.50]$), and high ($(0.50, 1.0]$) bands, calculates spectral entropy, and isolates discrete periodic harmonic spikes with $(u, v)$ coordinates, orientation angles, and prominence sigmas (Popescu & Farid 2005 / Gonzalez & Woods 2018).  
   *Location:* `backend/app/engine_extensions/frequency/`  
   *Reference Documentation:* [docs/FOURIER_ANALYSIS.md](file:///d:/Project%20Resume/ForenSight/docs/FOURIER_ANALYSIS.md)

---

## 14. Implemented V4 Forensic Engines (Phase 2E: Advanced Noise & Resampling Forensics)

The following two production engines were implemented and verified in V4 Step 6:

1. **`ADVANCED-NOISE` (v1.0.0)**: Extracts deterministic high-frequency noise residuals using Gaussian low-pass spatial subtraction with reflect border handling. Computes global residual moments, robust scale estimators ($\text{MAD}$ and $\hat{\sigma} = 1.4826 \cdot \text{MAD}$), Shannon entropy, and radial frequency band energy decomposition. Evaluates localized $32 \times 32$ block noise variance consistency, robust z-score deviation, and clusters candidate noise-inconsistency regions (Pan et al. 2012 / Mahdian & Saic 2009 / Lyu et al. 2014).  
   *Location:* `backend/app/engine_extensions/noise/`  
   *Reference Documentation:* [docs/ADVANCED_NOISE_ANALYSIS.md](file:///d:/Project%20Resume/ForenSight/docs/ADVANCED_NOISE_ANALYSIS.md)

2. **`RESAMPLING` (v1.0.0)**: Evaluates directional second-order spatial derivative spectra ($D_{xx}, D_{yy}$) to detect periodic interpolation dependencies resulting from image scaling, rotation, or affine manipulation. Computes 1D Fourier power spectra, peak-to-baseline strength ratios within configurable period search intervals $[1.5, 8.0]$, directional asymmetry, and local block-level curvature consistency mapping to cluster candidate resampling-consistent regions (Popescu & Farid 2005 / Mahdian & Saic 2008 / Gallagher & Chen 2008).  
   *Location:* `backend/app/engine_extensions/resampling/`  
   *Reference Documentation:* [docs/RESAMPLING_ANALYSIS.md](file:///d:/Project%20Resume/ForenSight/docs/RESAMPLING_ANALYSIS.md)

*Note:* Exactly 12 V4 forensic engines are now fully operational. The 6 remaining future engines remain strictly in `STATUS = PLANNED`. The V3 core under `backend/app/forensics/` remains cryptographically frozen.

