# ForenSight V2.1 — Security Architecture & Policy

This document outlines the security policies, authentication mechanisms, authorization controls, and cryptographic safeguards enforced across the ForenSight platform.

---

## 1. Threat Model & Security Objectives

ForenSight operates on sensitive digital evidence. The security architecture guarantees three core invariants:
1. **Evidence Authenticity & Provenance**: Evidence files are immutable from the moment of ingestion; integrity is continuously verifiable via cryptographic SHA-256 hashes.
2. **Strict Multi-Tenant / Investigator Case Isolation**: Investigators can only inspect, process, or download evidence, jobs, analysis results, artifacts, and audit trails belonging to their assigned cases. Cross-case data leakage is strictly prohibited.
3. **Defense Against Untrusted Input**: File uploads, path parameters, and image decoding operations are guarded against directory traversal, remote code execution (RCE), format exploitation, and memory starvation.

Production settings reject the development JWT key, wildcard or non-HTTPS CORS origins, weak/sample PostgreSQL passwords, SQLite, and a missing case-export signing key. Compose host ports bind to loopback; deploy behind a TLS reverse proxy.

The demo seeder provisions known demonstration passwords and exits without running in production. Create production investigator accounts through a separately controlled provisioning process.

---

## 2. Authentication & Credential Management

- **Cryptographic Password Hashing**: Passwords are never stored in plaintext. They are hashed using `bcrypt` via `passlib[bcrypt]`.
- **Browser sessions**:
  - The browser receives a 15-minute HS256 access JWT in an `HttpOnly`, `SameSite=Lax` cookie and a rotating, opaque refresh token in a second `HttpOnly` cookie. Refresh-token hashes are stored per session; logout, expiry, and session revocation take effect on the next request.
  - Unsafe cookie-authenticated requests require a double-submit CSRF token that is also bound by hash to the session. Requests carrying a browser `Origin` must match the configured CORS origins.
  - Use HTTPS in production; production cookies are `Secure`. The application UI and API should be served on the same site behind the documented reverse proxy.
  - Legacy bearer JWTs remain accepted for migration until their embedded expiry, but the login endpoint no longer issues bearer tokens. Stateless legacy tokens cannot be revoked individually; new browser authentication uses revocable cookie sessions.
- **Optional TOTP multi-factor authentication**:
  - Accounts can enroll an RFC 6238 authenticator with password confirmation, then verify the first code before enabling it.
  - TOTP seeds are encrypted using a key derived from `SECRET_KEY`; rotating that key requires MFA recovery/re-enrollment planning. Ten one-time recovery codes are returned only once and stored as hashes.
  - Ten consecutive password or MFA failures lock the account for 15 minutes. TOTP steps and recovery codes cannot be reused.
  - Endpoints: `POST /api/auth/mfa/setup`, `/api/auth/mfa/enable`, and `/api/auth/mfa/disable`. Setup and disable require the current password; enable and disable require a fresh authenticator code.
- **Secret keys**: `SECRET_KEY` must be a high-entropy value. Keep it stable and backed up securely; it signs access/challenge tokens and protects stored MFA seeds.

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
- **Authentication**: Requires a valid cookie session or bearer JWT. Unauthenticated requests return `401 Unauthorized`.
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

---

## 8. Adversarial Validation & Fuzzing Resilience (Phase 7)

In Phase 7, the platform underwent rigorous adversarial testing:
- **Corrupted Input Fuzzing**: Validated that truncated byte streams, zero-byte uploads, malformed PNG/JPEG headers, and spoofed MIME types fail safely with `HTTP 400 Bad Request` without process crashes or stack trace leakage.
- **Directory Traversal Fuzzing**: Path traversal attacks against `/api/artifacts/{path}` using `../`, `%2e%2e%2f`, Windows absolute paths, UNC shares, and null bytes are rejected with `HTTP 403 Forbidden`.
- **Adversarial Case Isolation Matrix**: Audited across 17 distinct API surfaces, ensuring complete multi-tenant boundary enforcement.
- **Investigation Replay & Tampering Detection**: An automated replay service recalculates on-disk SHA-256 hashes against original database assertions, immediately triggering an `INTEGRITY_VIOLATION` if any byte on disk has been altered.

## 9. Upload Resource Limits

- Ingestion streams uploaded bytes to a staging file while computing SHA-256 and enforcing `MAX_UPLOAD_SIZE`.
- The decoder-reported format must agree with the filename extension and declared MIME type.
- Pillow decompression-bomb warnings are treated as failures, and images above `MAX_IMAGE_PIXELS` are rejected before pixel decoding.
- The staged bitstream is atomically moved into evidence storage only after validation. A database failure removes the staged evidence file.

## 10. Signed Case Bundles

- `.forensight` archives include case-scoped JSON records, original bitstreams, available artifacts, a signed manifest, and member hashes.
- Ed25519 keys are deployment-specific. The embedded public key is not a trust anchor by itself; verify its fingerprint out of band.
- `backend/scripts/verify_case_bundle.py` validates the signature and content hashes without extracting archive paths.
- Bundle signing is disabled until `CASE_EXPORT_SIGNING_PRIVATE_KEY` is configured. Never commit that private key.

