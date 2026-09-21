# ForenSight V2.1 Demo Workflow

This document outlines a 3–5 minute demonstration workflow designed to highlight the engineering architecture, asynchronous processing, multi-user role-based access control (RBAC), and scientific integrity of the ForenSight platform.

## Pre-requisites
1. Application is running (Backend API, Celery Worker, Redis, and React Frontend).
2. The database is seeded using `python scripts/seed_demo.py`.
3. Have a sample image ready (e.g., a known manipulated image with copy-move elements or high recompression).

---

## Development Demonstration Identities (DEVELOPMENT / DEMO ONLY)

> [!WARNING]
> The following credentials are for local development and demonstration environments only. They MUST NEVER be used in production environments.

| Username | Role | Password | Scope & Visibility |
|---|---|---|---|
| `admin` | `ADMIN` | `forensight_admin` | Global administrative visibility. Can view, manage, and audit all cases across the system. |
| `user_a` | `INVESTIGATOR` | `forensight_user_a` | Strict investigator case isolation. Can only view and operate on cases, evidence, analyses, fusion, reports, and audit logs owned by User A. |
| `user_b` | `INVESTIGATOR` | `forensight_user_b` | Strict investigator case isolation. Can only view and operate on cases, evidence, analyses, fusion, reports, and audit logs owned by User B. |

---

## 00:00 - Login & Multi-User Authentication
- Navigate to the login screen (`http://localhost:5173/login`).
- **Talking Point:** Explain that access is secured via JWT authentication. Passwords are cryptographically hashed using standard bcrypt (`passlib`).
- Log in using `admin` / `forensight_admin` to demonstrate administrative oversight, or log in as `user_a` / `forensight_user_a` to demonstrate investigator isolation.

## 00:20 - Open Investigation Case & RBAC
- The dashboard loads the Case Management view.
- **Talking Point:** Emphasize Case Isolation. The API enforces Role-Based Access Control (RBAC). Investigators can only see cases they own or are assigned to, preventing cross-tenant data leakage.
- Create a new case or open an existing demo case.

## 00:40 - Open Evidence Library & Upload
- Navigate to the Evidence Library for the case.
- Upload the sample image.
- **Talking Point:** Mention that uploads are validated (MIME type, size) and stored using UUIDs to prevent directory traversal attacks.

## 01:00 - Open Evidence Detail & Integrity
- Click into the newly uploaded evidence.
- Point out the "SOURCE EVIDENCE INTEGRITY" panel.
- **Talking Point (01:15):** Highlight the **SHA-256 Hash Signature**. Explain that this guarantees immutable evidence provenance and chain of custody from the moment of ingestion.

## 01:30 - Submit Forensic Jobs (Async Architecture)
- Scroll down to the Analysis Job panel.
- Click "Queue Analysis" for Error Level Analysis (ELA) and Copy-Move.
- **Talking Point (01:45):** Explain the Async Job Architecture. Instead of blocking the FastAPI thread—which would cause timeouts for computationally expensive OpenCV tasks—the API submits a job payload to a Redis broker. The frontend immediately reflects the `QUEUED` and `RUNNING` states.
- Point out the asynchronous polling in the UI that updates the status to `COMPLETED` when the Celery worker finishes.

## 02:00 - Show Forensic Observations
- Review the generated visual artifacts (e.g., ELA map, Copy-Move map).
- **Talking Point:** Emphasize that these are deterministic measurements. ELA measures recompression error; Copy-Move uses SIFT/RANSAC for spatial correspondence. Neither explicitly proves "tampering" in a vacuum.

## 02:30 - Show Evidence Fusion & Assessment
- Trigger Evidence Fusion (Normalize & Correlate).
- **Talking Point (03:00):** Explain the Evidence Fusion Rule Engine (Rule 7B-v1). Explain that ForenSight *explicitly rejects* black-box machine learning classifiers that spit out a "98% Fake" probability. Instead, it groups observations into families (e.g., compression anomalies vs. geometric anomalies) and generates a **Qualitative Assessment Level** (e.g., MODERATE concern) which indicates the need for human follow-up.

## 03:20 - Show Audit Timeline
- Navigate to the Audit Trail / Timeline.
- **Talking Point:** Show that every action—upload, job execution, fusion, and assessment—is immutably logged chronologically, preserving the chain of custody.

## 03:40 - Generate Report
- Generate the final PDF/JSON report.
- **Talking Point:** Show how the report encapsulates the original SHA-256 hash, all generated artifacts, the fusion logic, and the final assessment, creating comprehensive, audit-verified forensic documentation.

## 04:10 - Show System Health
- Navigate to the System Health dashboard (if available) or explain the infrastructure.
- **Talking Point:** Mention that the platform is deployed via Docker Compose, cleanly separating the web gateway, database (PostgreSQL), message broker (Redis), and background workers (Celery).

## 04:30 - Conclusion & Scientific Limitations
- **Closing Point:** Reiterate that ForenSight is an *explainable* tool. It provides deterministic measurements, unassailable provenance, and scalable async architecture rather than unscientific manipulation probabilities.
