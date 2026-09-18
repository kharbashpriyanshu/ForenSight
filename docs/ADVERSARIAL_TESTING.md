# ForenSight V2.2 — Adversarial QA & Security Resilience

## 1. Adversarial Testing Scope

Forensic investigation systems are high-value targets subject to adversarial manipulation:
1. Malicious actors may upload corrupted, truncated, or hostile byte streams to trigger buffer overflows, worker crashes, or DoS.
2. Compromised user accounts may attempt cross-tenant privilege escalation or unauthorized discovery across isolated cases.
3. Attackers may attempt directory traversal fuzzing to download unauthorized files from the server host.

Phase 7 subjected ForenSight to comprehensive adversarial test suites under `backend/tests/test_phase7_adversarial_qa.py`.

---

## 2. Corrupted Input Handling & Boundary Testing

The evidence ingest pipeline (`app/services/evidence.py`) applies defensive validation before writing bytes to disk or database records:

| Attack Vector | Input Test Payload | Expected Response | Observed Response | Status |
| :--- | :--- | :--- | :--- | :--- |
| Empty File | `zero_byte.bin` (0 bytes) | `HTTP 400 Empty file` | `HTTP 400 Bad Request` | PASS |
| Truncated JPEG | `truncated.jpg` (scan cut off) | `HTTP 400 Invalid or corrupted image` | `HTTP 400 Bad Request` | PASS |
| Corrupted Header | `malformed_header.jpg` | `HTTP 400 Invalid or corrupted image` | `HTTP 400 Bad Request` | PASS |
| Corrupted Header | `malformed_header.png` | `HTTP 400 Invalid or corrupted image` | `HTTP 400 Bad Request` | PASS |
| Unsupported Extension | `unsupported.txt` | `HTTP 400 Unsupported file extension` | `HTTP 400 Bad Request` | PASS |
| Spoofed MIME / Extension | Text file named `fake.jpg` | `HTTP 400 Invalid or corrupted image` | `HTTP 400 Bad Request` | PASS |
| Oversized Upload | Payload > 25MB (`MAX_UPLOAD_SIZE`) | `HTTP 413 File too large` | `HTTP 413 Payload Too Large` | PASS |

---

## 3. Case Isolation Adversarial Matrix

Multi-tenant security was audited across 17 distinct API surfaces. An unauthorized investigator (`adv_user_b`) attempted to query, mutate, or download resources belonging to `adv_user_a`'s case:

| Endpoint Tested | Attempted Action | Auth Token Used | Expected HTTP | Result |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/cases/{case_a.id}` | View Case Details | User B | `403 Forbidden` | PASS |
| `GET /api/cases/{case_a.case_identifier}` | View Case by Identifier | User B | `403 Forbidden` | PASS |
| `GET /api/cases/{case_a.id}/overview` | View Case Overview Stats | User B | `403 Forbidden` | PASS |
| `GET /api/evidence/{ev_a.id}` | Read Evidence Record | User B | `403 Forbidden` | PASS |
| `POST /api/jobs/analysis/{ev_a.id}/ela` | Queue Analysis on Evidence | User B | `403 Forbidden` | PASS |
| `GET /api/jobs/{job_a.id}` | Read Job Status | User B | `403 Forbidden` | PASS |
| `GET /api/cases/{case_a.id}/graph` | Inspect Observation Graph | User B | `403 Forbidden` | PASS |
| `GET /api/cases/{case_a.id}/provenance` | Inspect Provenance Tree | User B | `403 Forbidden` | PASS |
| `GET /api/cases/{case_a.id}/correlations` | Read Correlated Findings | User B | `403 Forbidden` | PASS |
| `POST /api/cases/{case_a.id}/correlations/run` | Execute Correlations | User B | `403 Forbidden` | PASS |
| `GET /api/cases/{case_a.id}/findings` | Read Finding Records | User B | `403 Forbidden` | PASS |
| `POST /api/cases/{case_a.id}/findings/{id}/review` | Tamper Finding Review | User B | `403 Forbidden` | PASS |
| `GET /api/cases/{case_a.id}/notes` | Read Case Notes | User B | `403 Forbidden` | PASS |
| `POST /api/cases/{case_a.id}/notes` | Inject Case Note | User B | `403 Forbidden` | PASS |
| `GET /api/cases/{case_a.id}/search` | Search Case Entities | User B | `403 Forbidden` | PASS |
| `GET /api/cases/{case_a.id}/manifest` | Download Validation Manifest | User B | `403 Forbidden` | PASS |
| `POST /api/cases/{case_a.id}/replay-verify` | Trigger Case Replay | User B | `403 Forbidden` | PASS |
| `GET /api/cases/{case_a.id}/reports` | List Case Reports | User B | `403 Forbidden` | PASS |
| `GET /api/reports/{id}/download` | Download PDF/JSON Report | User B | `403 Forbidden` | PASS |

---

## 4. JWT & Authentication Adversarial Testing

- **Missing Header**: Unauthenticated requests to protected endpoints return `401 Unauthorized`.
- **Malformed Token**: Garbage strings return `401 Unauthorized`.
- **Expired Token**: Expired timestamps return `401 Unauthorized`.
- **Signature Forgery**: Tokens signed with an incorrect secret key return `401 Unauthorized`.
- **Non-Existent User**: Tokens referencing deleted or nonexistent identities return `401 Unauthorized`.
- **Role Elevation**: Non-admin users attempting global admin search (`/api/search`) receive `403 Forbidden`.

---

## 5. Artifact Directory Traversal Fuzzing

The artifact serving handler (`app/api/analysis.py`) resolves paths against `settings.STORAGE_DIR` and enforces strict ownership validation:
- Directory traversal sequences (`../`, `../../`, `../../../`) return `403 Invalid artifact path`.
- URL-encoded traversal (`%2e%2e%2f`) return `403 Invalid artifact path`.
- Windows absolute paths (`C:\...`) and UNC paths (`\\...`) return `403 Invalid artifact path`.
- Control characters (null bytes `\x00`) are rejected at the transport layer by HTTP parsers.
