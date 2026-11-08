# Stage 2, Batch 1.1: Evidence Intake Reliability & Integrity Report

**Date:** November 8, 2026  
**Repository:** `https://github.com/kharbashpriyanshu/ForenSight.git`  
**Working Directory:** `F:\Projects\ForenSight`  
**Base Commit:** `19f6699 feat(ui): simplify investigation entry and evidence intake`  
**Target Commit:** `fix(evidence): harden intake lifecycle and integrity`  

---

## 1. Problems Addressed

This batch resolves the six critical findings identified during the independent verification audit (`STAGE_2_BATCH_1_VERIFICATION_AUDIT.md`):
1. **Orphaned Investigation Records:** In the previous implementation, case creation and evidence upload were performed across two separate, uncoordinated HTTP requests (`POST /cases` followed by `POST /cases/{id}/evidence`). Any failure during file upload left an empty, orphaned case dossier in the database.
2. **Duplicate Creation on Retries / Replays:** Repeated clicks or network retries of the same intake attempt created duplicate case dossiers and duplicate evidence records.
3. **Closed Case Ingestion:** Closed investigations were not filtered out of the intake case selector and could accept new evidence.
4. **Misleading Confirmation Language:** The UI previously displayed `"Evidence Ingested & Verified"`, which conflated syntactic format decoding with forensic authenticity.
5. **Lack of Real Backend Integration Testing:** Previous E2E test suites relied exclusively on Puppeteer request interception (`page.setRequestInterception(true)`) with mocked API responses, leaving live FastAPI backend execution unexercised.
6. **Backend Test Suite Assertion Mismatch:** A string mismatch in `test_cases.py` and test runner process lifecycle issues caused test execution failures and orphaned background processes on Windows.

---

## 2. Original Failure Mechanisms

### A. The Two-Phase Boundary Flaw
- The frontend first issued `POST /cases` to allocate an investigation dossier.
- It then issued `POST /cases/{targetCaseIdentifier}/evidence`.
- If the second request failed (due to Pillow structure validation, decompression bomb protection, size exceeding 10 MB, or network timeouts), the database commit for the first request had already finalized.
- There was no transaction or saga rollback spanning the two separate HTTP calls, resulting in permanent orphaned case dossiers.

### B. Lack of Idempotency
- Neither the frontend nor the backend tracked intake attempt tokens.
- Clicking "Submit" multiple times or re-submitting after an ambiguous timeout spawned multiple independent cases and uploaded duplicate evidence files.

### C. Unconstrained Case Selector
- `GET /cases` lacked an `exclude_closed` filter parameter, allowing users to select closed investigations for evidence attachment. Furthermore, backend upload endpoints lacked guards verifying whether a target case was in `Closed` status.

---

## 3. Chosen Intake Lifecycle Architecture

To eliminate the two-phase failure boundary, a unified, coordinated server-side intake endpoint was implemented:

```
POST /api/cases/intake (multipart/form-data)
```

### Execution Flow:
1. **Idempotency Replay Check:** If an `idempotency_key` is provided and has already been recorded for the authenticated user, the backend immediately replays the cached `EvidenceResponse` with HTTP 200 without creating new records.
2. **Case Verification (Pathway B — Existing Case):** If a `case_id` is supplied, the backend verifies that the case exists, belongs to the user (or user is ADMIN), and is **not closed** (`status != "Closed"`).
3. **Pillow & Binary Validation (BEFORE Database Writes):**
   - File chunks are streamed to an isolated staging temporary file (`.ingest-*.part`).
   - Bitwise streaming SHA-256 hash is computed.
   - Decompression bomb check, dimension validation ($\le 40\text{ MP}$), and byte size ($\le 10\text{ MB}$) are enforced.
   - Pillow `Image.open(staging_path).verify()` validates structure.
   - Declared MIME and file extension are validated against the detected format.
   - **Crucial Rule:** If any validation fails, an `HTTPException` is raised immediately. Staging files are unlinked in `finally`. **Zero database records are touched.**
4. **Single-Transaction Commit:**
   - The staging file is atomically moved to permanent storage via `os.replace`.
   - If `case_id` was omitted (Pathway A — New Investigation), the `InvestigationCase` is instantiated and flushed.
   - The `Evidence` record is instantiated and flushed.
   - Optional provenance context (`EvidenceIntakeContext`) is instantiated.
   - The `IntakeIdempotencyRecord` is persisted.
   - Audit events (`CASE_CREATED` if new, and `EVIDENCE_UPLOADED`) are appended with hash chaining.
   - `db.commit()` finalizes the transaction atomically.

---

## 4. Case Creation and Evidence Registration Behavior

| Scenario | Execution Path | Database Outcome | Disk Outcome |
|---|---|---|---|
| **Valid Image (New Case)** | `POST /cases/intake` (no `case_id`) | Case and Evidence created in single transaction | File atomically moved to permanent UUID path |
| **Valid Image (Existing Case)** | `POST /cases/intake` (with `case_id`) | Evidence created and attached to existing case | File atomically moved to permanent UUID path |
| **Corrupt Image** | `POST /cases/intake` | **0 cases created**, **0 evidence created** | Staging temp file unlinked in `finally` |
| **Oversized Image (>10MB)** | `POST /cases/intake` | **0 cases created**, **0 evidence created** | Staging temp file unlinked in `finally` |
| **Invalid Extension** | `POST /cases/intake` | **0 cases created**, **0 evidence created** | Staging temp file unlinked in `finally` |
| **Attempted Upload to Closed Case** | `POST /cases/intake` or `POST /cases/{id}/evidence` | HTTP 400 rejection; no records modified | Staging temp file unlinked in `finally` |

---

## 5. Idempotency Implementation

### Model: `IntakeIdempotencyRecord`
Added to [`backend/app/models/domain.py`](file:///F:/Projects/ForenSight/backend/app/models/domain.py):
- `idempotency_key`: `String(128)`, indexed
- `user_id`: `ForeignKey("users.id")`, indexed
- `case_id`: `ForeignKey("investigation_cases.id")`
- `case_identifier`: `String`
- `evidence_id`: `ForeignKey("evidence.id")`
- `response_payload`: `JSON`
- `__table_args__ = (UniqueConstraint("idempotency_key", "user_id", name="uq_intake_idempotency_user_key"),)`

### Frontend Integration:
- In [`frontend/src/pages/EvidenceIntake.tsx`](file:///F:/Projects/ForenSight/frontend/src/pages/EvidenceIntake.tsx), an `idempotencyKey` is generated upon component mount or when selecting a new image.
- When submitting, `idempotency_key` is transmitted in form data and headers.
- If a submission encounters an error or network retry, the **same** key is reused.
- When ingesting another image via "+ Ingest Another Image", a fresh key is generated.

---

## 6. Duplicate Handling Distinction

- **Request Idempotency:** Submitting the same request with the same `idempotency_key` returns the existing result rather than creating duplicate cases or evidence items.
- **Content Deduplication (Legitimate Reuse):** Two independent investigations may legitimately examine the same evidence file (e.g. comparing how a shared exhibit behaves across different case files). ForenSight does **not** block uploads solely based on matching file hashes. Separate intake attempts (with distinct idempotency keys) succeed legitimately and generate independent evidence records.

---

## 7. Closed-Case Eligibility Enforcement

1. **Backend Filtering:**
   In [`backend/app/api/cases.py`](file:///F:/Projects/ForenSight/backend/app/api/cases.py), `read_cases` now accepts `exclude_closed: Optional[bool] = Query(default=False)`. When set to `true`, the SQL query filters `InvestigationCase.status != "Closed"`.
2. **Backend Mutation Rejection:**
   Both `POST /api/cases/intake` and `POST /api/cases/{case_id}/evidence` now verify case status:
   ```python
   if target_case.status and target_case.status.strip().lower() == "closed":
       raise HTTPException(
           status_code=400,
           detail="Cannot attach evidence to a closed investigation. Reopen the investigation dossier first."
       )
   ```
3. **Frontend Selector:**
   In [`EvidenceIntake.tsx`](file:///F:/Projects/ForenSight/frontend/src/pages/EvidenceIntake.tsx), the case list query is updated to `/cases?limit=100&exclude_closed=true`, preventing closed investigations from appearing in the dropdown.

---

## 8. Evidence Confirmation Wording Changes

The user interface terminology was updated across [`EvidenceIntake.tsx`](file:///F:/Projects/ForenSight/frontend/src/pages/EvidenceIntake.tsx):

| Context | Previous Terminology | Corrected Terminology | Rationale |
|---|---|---|---|
| **Primary Ingestion Header** | `Intake Complete: Evidence #{id}` | **Evidence Successfully Ingested** | Conveys successful acquisition without premature authenticity claims |
| **Top Badge** | `Verified for Ingest` | **File Structure Validated** | Accurately describes Pillow syntactic validation |
| **Description** | `An immutable cryptographic SHA-256 digest was computed...` | `A cryptographic SHA-256 fingerprint was generated, file structure was validated...` | Avoids overstating immutability; emphasizes fingerprinting |
| **Footer Assurance** | `Evidence integrity verified via bitwise streaming SHA-256` | `File structure validated • Bitwise streaming SHA-256 generated on ingest` | Clarifies the distinction between ingest fingerprinting and forensic examination |

---

## 9. Test Concurrency Diagnosis & Windows Cleanup Correction

### A. Assertion Detail Mismatch
`backend/tests/test_cases.py` line 60 asserted `'Invalid or corrupted image' in response.json()['detail']`. `EvidenceService` previously returned `'Invalid, corrupted, or unsafe image file'`. Reconciling the message string to `'Invalid or corrupted image file (unidentified, corrupted, or unsafe structure)'` resolved the test failure.

### B. Windows Process Cleanup
In `test-stage2-batch1.cjs`, `test.cjs`, and `test-batch2.cjs`, `process.exit(process.exitCode || 0)` was added to the `.finally()` handlers to ensure that child processes and Node event loops exit cleanly on Windows without lingering in background task tables.

---

## 10. Real Backend Integration Test Architecture

Created dedicated test suite: [`backend/tests/test_evidence_intake_lifecycle.py`](file:///F:/Projects/ForenSight/backend/tests/test_evidence_intake_lifecycle.py).

This suite tests the real FastAPI application, SQLite database persistence, Pillow image decoding, and disk storage without mocking API responses:

| Test Name | Scenario Tested | Result |
|---|---|---|
| `test_coordinated_intake_success_creates_case_and_evidence` | Atomic creation of case and evidence, bitstream SHA-256 match on disk | **PASSED** |
| `test_coordinated_intake_attach_to_existing_case` | Attachment of evidence to open case without creating additional case | **PASSED** |
| `test_intake_invalid_image_leaves_no_orphaned_case` | Corrupt image rejected with 400; confirms 0 cases created | **PASSED** |
| `test_intake_unsupported_extension_leaves_no_orphaned_case` | Unsupported `.exe` rejected with 400; confirms 0 cases created | **PASSED** |
| `test_intake_oversized_file_leaves_no_orphaned_case` | 11MB file rejected with 413; confirms 0 cases created | **PASSED** |
| `test_intake_idempotency_replay_prevents_duplicate_case_and_evidence` | Replayed request returns same evidence ID; confirms exactly 1 case exists | **PASSED** |
| `test_intake_legitimate_reuse_of_identical_image` | Identical image bytes submitted under 2 distinct requests creates 2 legitimate cases | **PASSED** |
| `test_closed_case_rejection_on_intake` | Intake and direct upload to closed cases rejected with HTTP 400 | **PASSED** |
| `test_cases_exclude_closed_filter` | `GET /cases?exclude_closed=true` filters out closed cases | **PASSED** |
| `test_audit_chain_integrity_after_intake` | Mathematical validation of SHA-256 sequence and hash links | **PASSED** |

---

## 11. Test Execution Results

```
============================= test session starts =============================
platform win32 -- Python 3.13.7, pytest-9.1.1, pluggy-1.6.0
rootdir: F:\Projects\ForenSight\backend
collected 16 items

backend\tests\test_cases.py::test_create_case PASSED                     [  6%]
backend\tests\test_cases.py::test_get_cases PASSED                       [ 12%]
backend\tests\test_cases.py::test_upload_valid_evidence PASSED           [ 18%]
backend\tests\test_cases.py::test_upload_invalid_evidence PASSED         [ 25%]
backend\tests\test_cases.py::test_upload_large_file PASSED               [ 31%]
backend\tests\test_cases.py::test_upload_empty_file PASSED               [ 37%]
backend\tests\test_evidence_intake_lifecycle.py::test_coordinated_intake_success_creates_case_and_evidence PASSED [ 43%]
backend\tests\test_evidence_intake_lifecycle.py::test_coordinated_intake_attach_to_existing_case PASSED [ 50%]
backend\tests\test_evidence_intake_lifecycle.py::test_intake_invalid_image_leaves_no_orphaned_case PASSED [ 56%]
backend\tests\test_evidence_intake_lifecycle.py::test_intake_unsupported_extension_leaves_no_orphaned_case PASSED [ 62%]
backend\tests\test_evidence_intake_lifecycle.py::test_intake_oversized_file_leaves_no_orphaned_case PASSED [ 68%]
backend\tests\test_evidence_intake_lifecycle.py::test_intake_idempotency_replay_prevents_duplicate_case_and_evidence PASSED [ 75%]
backend\tests\test_evidence_intake_lifecycle.py::test_intake_legitimate_reuse_of_identical_image PASSED [ 81%]
backend\tests\test_evidence_intake_lifecycle.py::test_closed_case_rejection_on_intake PASSED [ 87%]
backend\tests\test_evidence_intake_lifecycle.py::test_cases_exclude_closed_filter PASSED [ 93%]
backend\tests\test_evidence_intake_lifecycle.py::test_audit_chain_integrity_after_intake PASSED [100%]

======================= 16 passed, 61 warnings in 0.90s =======================
```

- **Frontend Production Build (`npm --prefix frontend run build`):** Succeeded in 750ms with 0 errors.
- **Stage 2 Batch 1 UI Test Suite (`node frontend/test-stage2-batch1.cjs`):** ALL PASSED (exit code 0).
- **Full Frontend E2E Regression Suite (`node frontend/test.cjs`):** ALL PASSED (exit code 0).
- **Batch 2 Shell Regression Suite (`node frontend/test-batch2.cjs`):** ALL PASSED (exit code 0).
- **Live Database Audit Chain (`audit_integrity.py verify-chain`):** ALL 5 EVENTS VERIFIED with 0 gaps and 0 mismatches.

---

## 12. Original Evidence Preservation & SHA-256 Verification

In `test_coordinated_intake_success_creates_case_and_evidence`:
- An image was generated in memory (`img_bytes`).
- The expected SHA-256 was computed directly from the source bytes: `hashlib.sha256(img_bytes).hexdigest()`.
- The file was uploaded to `/api/cases/intake`.
- The physical bitstream was retrieved via `GET /api/evidence/{id}/raw`.
- The raw disk bytes were re-hashed: `hashlib.sha256(raw_res.content).hexdigest()`.
- Result: **The stored bytes on disk are 100% byte-for-byte identical to the uploaded input.**

---

## 13. Audit Chain Integrity Verification

Executed `backend/scripts/audit_integrity.py verify-chain` against the development database:
```json
{
  "event_count": 5,
  "case_heads": [
    {
      "case_id": "FS-CASE-046A7789",
      "sequence_number": 5,
      "event_hash": "77eae3e10f3f1519b4ecc631a56d53a38cf9b6d94d46c5a54a0e2b33c3d28c74"
    }
  ]
}
```
All sequence numbers are contiguous and previous hash links match mathematical SHA-256 digests.

---

## 14. Files Created and Modified

### Created:
1. `backend/tests/test_evidence_intake_lifecycle.py` (Real backend integration test suite)
2. `STAGE_2_BATCH_1_1_RELIABILITY_REPORT.md` (This report)

### Modified:
1. `backend/app/models/domain.py` (Added `case_identifier` property to `Evidence`, added `IntakeIdempotencyRecord` model)
2. `backend/app/schemas/domain.py` (Added `case_identifier` to `EvidenceResponse`)
3. `backend/app/services/evidence.py` (Added `intake_evidence` method, closed case check, and reconciled detail string)
4. `backend/app/api/cases.py` (Added `/cases/intake` endpoint, closed-case checks, and `exclude_closed` query param)
5. `frontend/src/pages/EvidenceIntake.tsx` (Single coordinated intake call, idempotency key generation, retry persistence, terminology correction)
6. `frontend/test-stage2-batch1.cjs` (Updated mock for `/cases/intake`, updated badge assertion, added process exit)
7. `frontend/test.cjs` (Updated mock for `/cases/intake`, added process exit)
8. `frontend/test-batch2.cjs` (Added process exit)

---

## 15. Known Limitations & Residual Risk

- **Database-Level Idempotency Window:** In high-concurrency environments, if multiple concurrent requests submit with the same idempotency key simultaneously before the first transaction commits, both may stream the file before one commits and the second catches `IntegrityError`. The secondary request gracefully recovers and returns the primary record, but temporary staging space is briefly allocated.
- **Client Clock Discrepancies:** Pre-intake timestamp fields (`reported_capture_time`, `received_at`) remain unvalidated strings as reported by claimants. This is standard digital forensic practice to avoid corrupting reported timestamps.

---

## 16. Scope Confirmation

**Confirmation:** Stage 2, Batch 2 (*Forensic Engine Interface & Visual Inspection Workbench*) has **NOT** been started. All work performed in this batch is strictly confined to reliability corrections, idempotency, case lifecycle coordination, and test verification of evidence intake.
