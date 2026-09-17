# ForenSight V2.1 — Security Architecture & Policy

This document outlines the security policies, authentication mechanisms, authorization controls, and cryptographic safeguards enforced across the ForenSight platform.

---

## 1. Threat Model & Security Objectives

ForenSight operates on sensitive digital evidence. The security architecture guarantees three core invariants:
1. **Evidence Authenticity & Provenance**: Evidence files are immutable from the moment of ingestion; integrity is continuously verifiable via cryptographic SHA-256 hashes.
2. **Strict Multi-Tenant / Investigator Case Isolation**: Investigators can only inspect, process, or download evidence, jobs, analysis results, artifacts, and audit trails belonging to their assigned cases. Cross-case data leakage is strictly prohibited.
3. **Defense Against Untrusted Input**: File uploads, path parameters, and image decoding operations are guarded against directory traversal, remote code execution (RCE), format exploitation, and memory starvation.

---

## 2. Authentication & Credential Management

- **Cryptographic Password Hashing**: Passwords are never stored in plaintext. They are hashed using `bcrypt` via `passlib[bcrypt]`.
- **JWT Session Tokens**:
  - Signed using symmetric HMAC-SHA256 (`HS256`).
  - Claims encode user identity (`sub`), expiration (`exp`), and role.
  - Secret keys are provided via the `SECRET_KEY` environment variable. Production environments must inject a high-entropy 256-bit secret.
  - Token validation is enforced via the centralized FastAPI dependency `get_current_user`. Unauthenticated requests immediately yield HTTP 401 Unauthorized.

---

## 3. Role-Based Access Control (RBAC) & Case Isolation

The platform defines two canonical roles:

| Role | Scope & Permissions |
|---|---|
| `ADMIN` | Global administrative visibility. Can view, create, manage, and audit all investigation cases, evidence records, and forensic reports across the entire platform. |
| `INVESTIGATOR` | Scoped investigator access. Strictly restricted to cases owned by or assigned to that investigator. Accessing cases, evidence, analyses, jobs, fusion records, or audit trails belonging to another investigator is rejected with `403 Forbidden`. |

### Enforcement Architecture
Authorization is enforced at the route level through centralized dependency functions in `backend/app/api/deps.py`:
- `verify_case_access(db, case_identifier, current_user)`
- `verify_evidence_access(db, evidence_id, current_user)`
- `verify_job_access(db, job_id, current_user)`
- `verify_analysis_access(db, analysis_id, current_user)`
- `verify_report_access(db, report_id, current_user)`

---

## 4. Protected Forensic Artifact Delivery

Forensic artifacts (such as ELA error maps and Copy-Move correspondence visualizations) are sensitive derivatives of case evidence. They are **never** served via unauthenticated static web server directories.

- **Protected Endpoint**: `GET /api/artifacts/{artifact_path:path}`
- **Authentication**: Requires valid Bearer JWT. Unauthenticated requests return `401 Unauthorized`.
- **Case Ownership Verification**: The endpoint maps the requested artifact back to its parent Evidence and Case, rejecting cross-case access attempts with `403 Forbidden`.
- **Path Traversal Mitigation**:
  - Rejects null-byte injections (`%00`) with `403 Forbidden`.
  - Normalizes paths using `pathlib.Path.resolve()`.
  - Enforces `resolved_path.relative_to(storage_root)`. Any path escaping the designated storage boundary is blocked with `403 Forbidden`.
- **Accurate MIME Headers**: Detected dynamically (`image/jpeg`, `image/png`, `image/webp`, `application/json`) to prevent MIME confusion attacks.

---

## 5. Failure Handling & Information Leakage Prevention

- **Error Sanitization**: When a forensic engine encounters an unhandled exception or unsupported image format, the asynchronous job transitions to `FAILED` with a human-readable `safe_error_message`.
- **Suppression of Internal Details**: Stack traces, tracebacks, database queries, and filesystem directory paths (`C:\...`, `/home/...`) are scrubbed before storage and never returned in API payloads.

---

## 6. HTTP Security Headers

Every HTTP response emitted by the FastAPI backend includes defensive security headers:
- `X-Content-Type-Options: nosniff` (prevents MIME sniffing)
- `X-Frame-Options: DENY` (prevents clickjacking attacks)
- `X-XSS-Protection: 1; mode=block` (legacy browser XSS filter)
- `Referrer-Policy: strict-origin-when-cross-origin` (prevents token or path leakage in Referer headers)

---

## 7. Audit Logging & Non-Repudiation

Every investigative action is logged to the immutable `audit_events` table:
- Case creation and updates
- Evidence upload and cryptographic hash verification
- Analysis job dispatch and completion
- Evidence fusion correlation
- Forensic report generation and download
- Audit records include timestamps, actor identity, action type, and sanitized metadata without sensitive payload storage.
