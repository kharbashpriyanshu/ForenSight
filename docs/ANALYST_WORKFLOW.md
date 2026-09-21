# ForenSight V2.2 — Forensic Analyst Workflow

## 1. Introduction

The Analyst Workflow provides investigators with a centralized environment for reviewing cross-modality correlations, managing investigative findings, recording contemporaneous notes, and navigating evidence provenance.

Access the workspace via the frontend at `/cases/:caseId/analyst` or by clicking **"Analyst Workspace"** in the case navigation sidebar.

---

## 2. Core Operational Modules

### A. Correlated Findings Hub
- **Deterministic Synthesis**: Automatically consolidates signals across Metadata, ELA, JPEG DCT, Noise, and Copy-Move engines.
- **Rule Transparency**: Every finding displays its exact rule identifier (e.g., `CORR-COMP-002`), rule version, empirical reasoning, and scientific limitations.
- **Interactive Review Drawer**:
  - Triage findings from `REVIEW_REQUIRED` to `CONFIRMED_BY_ANALYST`, `DISMISSED`, or `INCONCLUSIVE`.
  - Input structured review justifications required for evidentiary reports.
  - View reviewer identity and review timestamp history.

### B. Observation Graph & Provenance Tree
- **Visual Graph Navigator**: Interactive SVG rendered directly in the browser, showing connections from Case &rarr; Evidence &rarr; Job &rarr; Analysis &rarr; Finding.
- **Node Inspector**: Clicking any graph node highlights its detailed attributes (SHA-256 hash, analysis duration, parameters, rule trigger).
- **Hierarchical Provenance Tree**: Chronological breakdown detailing the lineage of every asset from upload to report generation.

### C. Case-Scoped Analyst Notes Stream
- **Contemporaneous Documentation**: Record observations, hypothesis tests, and investigative thoughts in real-time.
- **Target Tagging**: Notes can be bound to specific targets:
  - `CASE` level (general case strategy).
  - `EVIDENCE` level (notes on specific media files).
  - `ANALYSIS` level (comments on specific algorithm runs).
  - `FINDING` level (justifications or dissenting opinions on correlation findings).
- **Audit Logging**: Every note creation and edit generates an immutable `NOTE_CREATED` or `NOTE_UPDATED` audit record.

### D. Investigation Search
- **Full-Text Matching**: Query across evidence filenames, hashes, analysis summaries, finding titles, analyst notes, and generated reports.
- **Multi-Tenant Security**: Strict case isolation prevents investigators from querying or viewing results outside their authorized cases. Admins have access to global search across the entire forensic repository.

---

## 3. Standard Operating Procedure (SOP) for Investigations

1. **Ingest Evidence**: Upload target digital imagery into the active case; verify SHA-256 hashes against original transfer logs.
2. **Execute Multi-Modal Analysis**: Run the 5 core forensic engines (Metadata, ELA, JPEG DCT, Noise Residual, Copy-Move).
3. **Trigger Correlation Engine**: Navigate to the Analyst Workspace and click **"Run Correlation Engine"** to synthesize cross-modality observations.
4. **Triage & Review Findings**:
   - Inspect findings marked `REVIEW_REQUIRED`.
   - Evaluate empirical metrics, heatmaps, and limitations.
   - Record formal review decisions (`CONFIRMED`, `DISMISSED`, or `INCONCLUSIVE`) with detailed justifications.
5. **Add Contemporaneous Notes**: Document any supplementary investigative context or external intelligence.
6. **Generate Final Forensic Report**: Export the comprehensive professional forensic investigation PDF or JSON report containing findings, review decisions, analyst notes, and complete provenance trees.
