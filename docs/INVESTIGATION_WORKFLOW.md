# ForenSight V2.1 — End-to-End Investigation Workflow

This document specifies the standard operational procedure for conducting digital image forensic investigations within ForenSight V2.1.

---

## Workflow Overview

The ForenSight platform enforces a structured, scientifically reproducible, and auditable methodology for forensic examinations:

```
+-------------------------------------------------------------+
| 1. Authentication & Case Initialization                     |
|    - Investigator authenticates via JWT                     |
|    - Case created with unique identifier (FS-CASE-XXXXXXXX) |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 2. Evidence Acquisition & Custody Registration              |
|    - File uploaded into immutable read-only isolate         |
|    - SHA-256 cryptographic digest computed (FIPS 180-4)     |
|    - Format, MIME, and geometric dimensions extracted       |
|    - EVIDENCE_INGESTED audit trail record generated         |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 3. Multi-Modality Forensic Examination                      |
|    - Asynchronous job execution (Celery / Redis / Inline)   |
|    - Metadata Analysis (EXIF / XMP / TIFF headers)          |
|    - Error Level Analysis (ELA compression variance)        |
|    - Noise Residual Analysis (sensor / PRNU filtering)      |
|    - JPEG / DCT Analysis (double compression / grids)       |
|    - Copy-Move Detection (SIFT / Keypoint matching)         |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 4. Rule-Based Fusion & Assessment (Fusion 7B-v1)            |
|    - Phase 1: Observation Normalization                     |
|    - Phase 2: Spatial & Semantic Correlation Assessment     |
|    - Scientifically frozen rule-based scoring (No ML/Halluc)|
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 5. Comparative Analysis (Optional Side-by-Side)             |
|    - Cross-reference multiple items within case             |
|    - Compare hashes, geometry, and modality observations    |
|    - Identify factual discrepancies without synthetic bias  |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| 6. Forensic Report Generation & Chain of Custody Export     |
|    - Court-admissible PDF generated via ReportLab           |
|    - Machine-readable JSON export for reproducibility       |
|    - Immutable audit trail attached to record               |
+-------------------------------------------------------------+
```

---

## Detailed Step-by-Step Procedure

### 1. Authentication & Case Initialization
- Navigate to `/login` and authenticate with assigned investigator credentials (`investigator_a` or `investigator_b`).
- Upon successful authentication, navigate to `/cases` to select an existing investigation or register a new case.
- ForenSight enforces strict RBAC and Case Isolation: Investigators can only view, access, and analyze cases they own. Admin users maintain oversight over all cases.

### 2. Evidence Ingestion & Cryptographic Verification
- Enter the investigation workspace at `/cases/:caseId/evidence`.
- Click **Acquire New Evidence** and select the source image file (`image/jpeg`, `image/png`, `image/webp`, `image/tiff`).
- ForenSight computes a SHA-256 cryptographic hash immediately upon receipt, before any storage write.
- The evidence item is persisted into `storage/evidence/` as a read-only isolate.
- An immutable `EVIDENCE_INGESTED` event is appended to the case audit trail.

### 3. Multi-Modality Forensic Analysis Execution
- Open the evidence detail page at `/cases/:caseId/evidence/:evidenceId`.
- Queue independent forensic engines:
  - **Metadata Engine:** Extracts camera model, timestamps, software history, and GPS tags.
  - **Error Level Analysis (ELA):** Detects differential JPEG compression errors indicative of localized resaving.
  - **Noise Analysis:** Measures high-frequency residuals and sensor PRNU irregularities.
  - **JPEG / DCT Engine:** Examines discrete cosine transform coefficients for double-compression traces.
  - **Copy-Move Engine:** Uses keypoint descriptors (SIFT/ORB) to detect duplicated regions within the frame.
- Visual artifacts and structured findings are rendered alongside explicit scientific limitations.

### 4. Correlation & Assessment (Fusion 7B-v1)
- Once individual engines complete, click **1. Normalize Observations** to map measurements into standard evidence observations.
- Click **2. Correlate & Assess** to run the scientifically frozen Fusion 7B-v1 engine.
- The engine computes an explainable correlation level (e.g., `CONFIRMED_ANOMALY`, `INCONSISTENT_TRACES`, `BENIGN_CONSISTENT`) based on deterministic multi-modality alignment.

### 5. Comparative Analysis (Side-by-Side)
- When evaluating suspected source vs. manipulated variants, select both items in the Evidence Library.
- Navigate to `/cases/:caseId/compare?a={id1}&b={id2}`.
- Review cryptographic hash matches, dimensional variances, file size differences, and modality observations side-by-side.

### 6. Forensic Report Export
- Navigate to `/cases/:caseId/reports`.
- Select **Formal PDF Report** or **Raw Data Export (JSON)**.
- Click **Generate New Report**.
- Download the authenticated artifact using Bearer token verification.
- The resulting document is court-admissible and compliant with NIST SP 800-86 forensic standards.
