# ForenSight V2.1 — Forensic Reporting Architecture & Specifications

This document outlines the architecture, schemas, visual standards, and reproducibility criteria for ForenSight V2.1 forensic investigation reports.

---

## 1. Overview & Forensic Admissibility Standards

ForenSight produces forensic reports intended to satisfy standard legal and evidentiary standards for digital image analysis (including NIST SP 800-86 and SWGDE recommendations).

Key principles:
1. **Scientific Determinism:** Reports are generated from verifiable, classical algorithms and deterministic rule-based correlation (Fusion 7B-v1). No LLM-generated hallucinated text or synthetic manipulation probabilities are ever inserted.
2. **Dual-Format Delivery:**
   - **PDF Report:** A publication-quality, styled document generated natively via `reportlab` with exact margins, tables, header blocks, and legal disclaimers.
   - **JSON Export:** A raw, machine-readable JSON representation of every measurement, parameter, and hash signature for external auditing and reproducibility.
3. **Chain of Custody Integration:** Every report embeds the complete chronological audit trail of all custody events, job executions, and user actions.

---

## 2. Report Document Structure

Every ForenSight PDF report contains the following mandatory sections:

### Section 1: Title Header & Case Identification Block
- **Title Block:** ForenSight Digital Image Forensics Report
- **Report Identifier:** Unique tracking identifier (`FS-RPT-XXXXXXXX`)
- **Classification:** Investigative Material / Confidential
- **Case Identification:** Case Identifier, Case Title, Case Status, Ingestion Date
- **Investigator Attribution:** Username of investigator requesting report
- **Software Version:** ForenSight V2.1, Rule Engine: Fusion 7B-v1

### Section 2: Ingested Evidence Registry
A tabular catalog of all evidence items associated with the case:
- Evidence Identifier (`FS-EVD-XXXXXXXX`)
- Original Filename
- File Format & MIME Type
- Geometric Resolution (Width x Height)
- File Size (Bytes)
- Cryptographic SHA-256 Digest (NIST FIPS 180-4)

### Section 3: Multi-Modality Forensic Examination
For each evidence item, a structured breakdown of each classical engine executed:
- **Metadata Analysis:** Camera make/model, software history, timestamps, GPS coordinates.
- **Error Level Analysis (ELA):** Compression error patterns across 8x8 quantization blocks.
- **Noise Residual Analysis:** Signal-to-noise ratio, sensor noise variance, PRNU distribution.
- **JPEG / DCT Analysis:** Quantization tables, luminance/chrominance coefficients, double-compression traces.
- **Copy-Move Detection:** Keypoint matching count, spatial cluster vectors.

### Section 4: Fusion 7B-v1 Assessment
The synthesis of multi-modality observations:
- **Assessment Level:** (e.g. `CONFIRMED_ANOMALY`, `INCONSISTENT_TRACES`, `BENIGN_CONSISTENT`, `INCONCLUSIVE`)
- **Correlation Rationale:** Deterministic justification citing specific intersecting anomalies.
- **Rule Engine Version:** Fusion 7B-v1 (Scientifically Frozen)

### Section 5: Technical Chain of Custody & Audit Trail
Chronological log of case events:
- Timestamp (UTC)
- Actor (Investigator / System)
- Event Category (`EVIDENCE_INGESTED`, `ANALYSIS_COMPLETED`, etc.)
- Metadata Details

### Section 6: Explicit Scientific Limitations & Legal Disclaimers
Mandatory scientific qualifications:
- Single-modality observations do not constitute definitive proof of intent or origin.
- ELA is sensitive to recompression quality factors and natural high-contrast edges.
- Noise analysis may be affected by post-processing filters, high ISO settings, or denoising algorithms.
- Metadata is easily manipulated or stripped in transit across web services.
- Multi-modality correlation provides technical consistency assessment only; final interpretation requires human investigative context.

---

## 3. PDF Generator Implementation (`backend/app/services/reports.py`)

Reports are built using ReportLab flowables:
```python
doc = SimpleDocTemplate(
    pdf_path,
    pagesize=letter,
    leftMargin=0.5 * inch,
    rightMargin=0.5 * inch,
    topMargin=0.5 * inch,
    bottomMargin=0.5 * inch,
)
```

Styles adhere to a professional forensic color palette:
- Navy (`#0f172a`): Headers and primary titles
- Cobalt (`#0284c7`): Section accents and dividers
- Emerald (`#047857`): SHA-256 cryptographic hashes
- Slate (`#334155`): Body text
- Amber (`#f59e0b`): Warning and limitation blocks

---

## 4. API Endpoints

- `POST /api/cases/{case_id}/reports?format={pdf|json}`: Generates a new case report.
- `GET /api/cases/{case_id}/reports`: Lists all generated reports for a case.
- `GET /api/reports/{report_id}/download?format={pdf|json}`: Downloads the report file with authenticated Bearer token and proper MIME headers (`application/pdf` or `application/json`).
