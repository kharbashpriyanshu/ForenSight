# ForenSight V2.1 — Technical Chain of Custody & Auditability

This document details the audit trail architecture, cryptographic provenance guarantees, and compliance standards implemented in ForenSight V2.1.

---

## 1. Compliance & Evidentiary Standards

ForenSight V2.1 implements a technical chain of custody aligned with:
- **NIST SP 800-86:** Guide to Integrating Forensic Techniques into Incident Response.
- **NIST FIPS 180-4:** Secure Hash Standard (SHA-256).
- **SWGDE Guidelines:** Scientific Working Group on Digital Evidence Best Practices for Image Forensics.

---

## 2. Core Audit Architecture

Every state change, evidence acquisition, analysis job submission, finding creation, and report generation in ForenSight automatically writes an immutable event to the `audit_events` database table.

### Audit Event Schema
| Field | Type | Description |
|---|---|---|
| `id` | `Integer` | Monotonically increasing primary key |
| `case_id` | `String` | Case Identifier (`FS-CASE-XXXXXXXX`) |
| `evidence_id` | `Integer` (Optional) | Associated evidence item ID |
| `event_type` | `String` | Formal event classification |
| `timestamp` | `DateTime` | UTC timestamp of event generation |
| `actor` | `String` | Username of the investigator or system process |
| `safe_metadata` | `String` (JSON) | Sanitized contextual metadata |

---

## 3. Event Categories & Lifecycle

The audit system organizes events into five primary categories:

### 1. Evidence Operations (`EVIDENCE_*`)
- `EVIDENCE_INGESTED`: Recorded immediately upon file receipt and cryptographic hashing.
- `EVIDENCE_DELETED`: Recorded if evidence is removed (restricted by RBAC).

### 2. Analysis Operations (`ANALYSIS_*`, `JOB_*`)
- `ANALYSIS_QUEUED`: When an asynchronous workload is scheduled.
- `ANALYSIS_STARTED`: When a worker begins execution.
- `ANALYSIS_COMPLETED`: When an engine finishes and produces structured observations.
- `ANALYSIS_FAILED`: When an error occurs (contains sanitized safe error text).

### 3. Finding Operations (`FINDING_*`)
- `FINDING_RECORDED`: When a modality observation is normalized.
- `ASSESSMENT_GENERATED`: When Fusion 7B-v1 computes a case correlation level.

### 4. Case Management Operations (`CASE_*`)
- `CASE_CREATED`: When an investigator initializes a new investigation.
- `CASE_UPDATED`: When title or status changes.

### 5. Report Operations (`REPORT_*`)
- `REPORT_GENERATED`: When a PDF or JSON forensic report is compiled.
- `REPORT_DOWNLOADED`: When an authenticated user downloads a report artifact.

---

## 4. Cryptographic Provenance

- **Immediate Ingestion Hashing:** Images are hashed in memory upon receipt before disk persistence.
- **Read-Only Storage:** Uploaded files in `storage/evidence/` are treated as immutable isolates.
- **Continuous Integrity Check:** Evidence detail and comparison views display the full SHA-256 digest to detect accidental bit-rot or alteration.

---

## 5. Multi-User RBAC & Audit Trail Scoping

- **Investigator Scope:** Users with the `INVESTIGATOR` role can only view audit events associated with cases they own.
- **Admin Oversight:** Users with the `ADMIN` role can view audit trails for any case, as well as the global system audit stream (`GET /api/audit`).
