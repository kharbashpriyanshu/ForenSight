# Stage 2, Batch 1.2: Implementation Report
## Idempotency Conflict Protection & Failure-Recovery Observability

**Date:** November 9, 2026  
**Repository:** `https://github.com/kharbashpriyanshu/ForenSight.git`  
**Working Directory:** `F:\Projects\ForenSight`  
**Base Commit:** `5b0d801d93ebca62d641ec43258c49fe052fec0a` (`5b0d801`)  
**Target Commit:** `fix(evidence): enforce idempotency conflicts and cleanup recovery`  
**Auditor/Implementer:** Antigravity Forensic Engineering  

---

## 1. Preflight Verification

| Preflight Parameter | Verified Value | Status |
|---|---|---|
| **Repository Root** | `F:\Projects\ForenSight` | **VERIFIED** |
| **Branch** | `main` | **VERIFIED** |
| **Starting HEAD** | `5b0d801` (`fix(evidence): harden intake lifecycle and integrity`) | **VERIFIED** |
| **Remote URL** | `https://github.com/kharbashpriyanshu/ForenSight.git` | **VERIFIED** |
| **Initial Working Tree** | Clean tracked files; 17 pre-existing untracked documentation files preserved | **VERIFIED** |
| **Historical Directory** | Avoided modifying Desktop/OneDrive paths | **VERIFIED** |

---

## 2. Findings Addressed

### Finding 1: P1-01 — Idempotency Key Replay Did Not Check Request Fingerprint

- **Original Problem:**  
  When an `idempotency_key` was reused, the service previously returned the cached result of the first request regardless of whether the incoming request payload (image binary, case assignment, or metadata) matched the original submission.
- **Root Cause:**  
  `EvidenceService.intake_evidence` queried `IntakeIdempotencyRecord` matching strictly on `(idempotency_key, user_id)` before reading the uploaded file bytes. It had no record of the original request's payload digest or metadata fingerprint.
- **Files Changed:**  
  - `backend/app/models/domain.py`: Added `request_fingerprint = Column(String(64), nullable=False, index=True)` to `IntakeIdempotencyRecord`.
  - `backend/app/services/evidence.py`: Implemented `compute_intake_fingerprint()`. Replaced premature key lookup with post-staging fingerprint evaluation. Added HTTP 409 Conflict rejection when an idempotency key is reused with mismatched payloads.
  - `frontend/src/pages/EvidenceIntake.tsx`: Added clear UI notification and action button (`Generate Fresh Submission Token`) when an HTTP 409 conflict is encountered.
- **Technical Correction:**  
  The request payload is now deterministically hashed. If a request supplies an already-used key:
  - If incoming `request_fingerprint == stored_fingerprint`: Returns cached evidence with HTTP 200.
  - If incoming `request_fingerprint != stored_fingerprint`: Returns HTTP 409 Conflict with detail `"Idempotency key has already been used for a different intake request. Please initiate a fresh submission with a new key."`
  In concurrent race conditions, loser requests catch `(IntegrityError, FlushError)`, rollback, inspect the winning record's fingerprint, and either return the winning record (if identical) or raise HTTP 409 (if conflicting).
- **Remaining Limitations:**  
  Idempotency records do not currently enforce an automatic TTL/expiration policy.

---

### Finding 2: P2-01 — Silent Suppression of Filesystem Cleanup Failures

- **Original Problem:**  
  Filesystem cleanup errors in `process_and_store_evidence` and `intake_evidence` were caught with `except OSError: pass`, silently hiding unlinked or locked temporary/aborted evidence files.
- **Root Cause:**  
  Defensive coding aimed to prevent cleanup errors from masking primary upload exceptions, but omitted structured logging and persistence.
- **Files Changed:**  
  - `backend/app/models/domain.py`: Added `FailedCleanupRecord` model tracking failed unlinks.
  - `backend/app/services/evidence.py`: Implemented `_perform_cleanup()` and `_record_failed_cleanup()` with structured diagnostic logging (`cleanup_stage`, `file_path`, `error_type`, `error_message`, `idempotency_key`, `user_id`). Implemented `recover_failed_cleanups()` with forensic safety checks.
  - `backend/app/api/cases.py`: Exposed `POST /api/evidence/cleanups/recover` and `GET /api/evidence/cleanups/pending` for administrator inspection and manual/scheduled cleanup retries.
- **Technical Correction:**  
  1. Cleanup failures emit structured ERROR logs omitting sensitive image contents.
  2. `_record_failed_cleanup()` persists a `FailedCleanupRecord` using an independent database session (`Session(bind=db.get_bind())`) so it survives the parent transaction's rollback.
  3. `EvidenceService.recover_failed_cleanups(db)` iterates unresolved cleanup records and retries `os.remove()`.
  4. **Forensic Integrity Guard:** Before deleting any file, `recover_failed_cleanups` queries `Evidence.stored_path`. If any active committed evidence record references the path, deletion is refused and annotated with `"SAFETY GUARD: Referenced by committed evidence id=..."`.
- **Remaining Limitations:**  
  If the host filesystem permanently denies access to a path (e.g. disk corruption), the record remains unresolved until an administrator intervenes.

---

## 3. Idempotency Behavior Specification

### 3.1 Fingerprint Computation
`compute_intake_fingerprint` generates a deterministic SHA-256 digest covering:
- `file_sha256`: SHA-256 of the raw uploaded binary chunks.
- `case_id`: Target investigation dossier ID, if attaching to an existing case.
- `case_title`: New investigation dossier title, if creating a new case.
- `intake_context`: Normalized metadata dictionary (`source_platform`, `acquisition_method`, `received_from`, `received_at`, `reported_capture_time`, `source_reference_url`, `intake_notes`), sorted by key and stripped of null/empty values.

Unstable values (temporary paths, server timestamps, database auto-increment IDs, idempotency key itself) are excluded.

### 3.2 Behavior Matrix

| Situation | Stored Record | Incoming Request | Outcome | Database State | Storage State |
|---|---|---|---|---|---|
| **Same User + Same Key + Identical Payload** | Key $K$, FP $F_1$ | Key $K$, FP $F_1$ | **HTTP 200** (Cached evidence returned) | 0 new rows | Staged `.part` unlinked |
| **Same User + Same Key + Different Image** | Key $K$, FP $F_1$ | Key $K$, FP $F_2$ | **HTTP 409 Conflict** | 0 new rows | Staged `.part` unlinked |
| **Same User + Same Key + Different Case** | Key $K$, FP $F_1$ | Key $K$, FP $F_3$ | **HTTP 409 Conflict** | 0 new rows | Staged `.part` unlinked |
| **Same User + Same Key + Different Metadata** | Key $K$, FP $F_1$ | Key $K$, FP $F_4$ | **HTTP 409 Conflict** | 0 new rows | Staged `.part` unlinked |
| **Different Users + Same Key** | User A, Key $K$ | User B, Key $K$ | **HTTP 200** (Legitimate independent intake) | New case/evidence created for User B | Staged `.part` promoted to UUID |
| **Same Image + Different Key** | Key $K_1$, Image $A$ | Key $K_2$, Image $A$ | **HTTP 200** (Legitimate content reuse) | New case/evidence created | Staged `.part` promoted to UUID |
| **Concurrent Race: Same Key, Same Payload** | Simultaneous | Key $K$, FP $F_1$ | Winner: **200**, Loser: **200** (Winner's evidence returned) | Exactly 1 case, 1 evidence, 1 idempotency record | Winner promoted; loser unlinked |
| **Concurrent Race: Same Key, Conflicting Payload** | Simultaneous | Winner: $F_1$, Loser: $F_2$ | Winner: **200**, Loser: **409 Conflict** | Winner's case/evidence only | Winner promoted; loser unlinked |

---

## 4. Cleanup and Recovery Architecture

```
[Intake Failure / Validation Error / DB Abort]
                    │
                    ▼
          [finally cleanup block]
                    │
         ┌──────────┴──────────┐
         │ os.remove(path)     │
         └──────────┬──────────┘
                    │
         ┌──────────┴──────────┐
      Success               OSError
         │                     │
      [Done]                   ▼
                    [Structured Error Log]
                               │
                               ▼
               [_record_failed_cleanup]
               (Independent Session Commit)
                               │
                               ▼
                 [FailedCleanupRecord in DB]
                               │
                               ▼ (Admin / Scheduled)
                 [recover_failed_cleanups]
                               │
                 ┌─────────────┴─────────────┐
        Is Referenced by Committed?          No
                     │                        │
                    Yes                  os.remove()
                     │                        │
           [Skip Deletion + Log]       [Mark Resolved]
```

---

## 5. Test Execution Evidence

All 28 backend tests executed against Python 3.13:

```powershell
$env:PYTHONPATH="F:\Projects\ForenSight\backend"; backend\venv\Scripts\python.exe -m pytest backend/tests/test_evidence_intake_lifecycle.py backend/tests/test_cases.py -v
```

### 5.1 Test Results Table

| Test Identifier | Category | Expected Outcome | Actual Outcome | Exit Code | Status |
|---|---|---|---|---|---|
| `test_coordinated_intake_success_creates_case_and_evidence` | Lifecycle | HTTP 200, atomic case & evidence | HTTP 200, SHA-256 matched | 0 | **PASS** |
| `test_coordinated_intake_attach_to_existing_case` | Lifecycle | HTTP 200, attach to open case | HTTP 200, attached to case | 0 | **PASS** |
| `test_intake_invalid_image_leaves_no_orphaned_case` | Failure | HTTP 400, 0 cases in DB | HTTP 400, 0 cases in DB | 0 | **PASS** |
| `test_intake_unsupported_extension_leaves_no_orphaned_case` | Failure | HTTP 400, 0 cases in DB | HTTP 400, 0 cases in DB | 0 | **PASS** |
| `test_intake_oversized_file_leaves_no_orphaned_case` | Failure | HTTP 413, 0 cases in DB | HTTP 413, 0 cases in DB | 0 | **PASS** |
| `test_intake_idempotency_replay_prevents_duplicate_case_and_evidence` | Idempotency | HTTP 200, same identifiers returned | Identical IDs, 1 case in DB | 0 | **PASS** |
| `test_intake_legitimate_reuse_of_identical_image` | Idempotency | HTTP 200, separate records created | Separate cases & evidence | 0 | **PASS** |
| `test_closed_case_rejection_on_intake` | Security | HTTP 400 rejection on closed cases | HTTP 400 rejection | 0 | **PASS** |
| `test_cases_exclude_closed_filter` | Filter | Exclude closed dossiers from list | Only active cases returned | 0 | **PASS** |
| `test_audit_chain_integrity_after_intake` | Audit | Hash chain unbroken, 0 gaps | Hash chain unbroken, 0 gaps | 0 | **PASS** |
| `test_idempotency_conflict_different_image_raises_409` | **P1-01** | **HTTP 409 Conflict** | **HTTP 409 Conflict** | 0 | **PASS** |
| `test_idempotency_conflict_different_existing_case_raises_409` | **P1-01** | **HTTP 409 Conflict** | **HTTP 409 Conflict** | 0 | **PASS** |
| `test_idempotency_conflict_different_metadata_raises_409` | **P1-01** | **HTTP 409 Conflict** | **HTTP 409 Conflict** | 0 | **PASS** |
| `test_idempotency_scoped_by_user` | **P1-01** | Independent intake across users | Independent cases created | 0 | **PASS** |
| `test_concurrent_intake_same_key_same_payload` | **Concurrency** | 1 case, 1 evidence, both 200 | Exactly 1 case, 1 evidence | 0 | **PASS** |
| `test_concurrent_intake_same_key_different_payloads_produces_winner_and_conflict` | **Concurrency** | 1 winner (200), 1 conflict (409) | 1 winner (200), 1 loser (409) | 0 | **PASS** |
| `test_concurrent_intake_different_keys_same_content` | **Concurrency** | 2 independent intakes (200) | Both succeeded (200) | 0 | **PASS** |
| `test_failure_injection_staging_io_error` | **Failure** | 0 cases in DB on staging failure | 0 cases in DB | 0 | **PASS** |
| `test_failure_injection_promotion_os_replace_error` | **Failure** | 0 cases in DB on promotion error | 0 cases in DB | 0 | **PASS** |
| `test_failure_injection_db_commit_error_compensating_cleanup` | **Failure** | Promoted file deleted in finally | Promoted file deleted | 0 | **PASS** |
| `test_failure_injection_cleanup_os_error_recorded_and_recoverable` | **P2-01** | Record logged, saved, recoverable | FailedCleanupRecord resolved | 0 | **PASS** |
| `test_recovery_safety_guard_does_not_delete_committed_evidence` | **P2-01** | Refuses deleting committed file | File preserved, safety logged | 0 | **PASS** |
| `test_create_case` | Regression | Case created | Case created | 0 | **PASS** |
| `test_get_cases` | Regression | Cases list returned | Cases list returned | 0 | **PASS** |
| `test_upload_valid_evidence` | Regression | Evidence uploaded | Evidence uploaded | 0 | **PASS** |
| `test_upload_invalid_evidence` | Regression | Format validation | Format validation rejected | 0 | **PASS** |
| `test_upload_large_file` | Regression | File size limit | Rejected with 413 | 0 | **PASS** |
| `test_upload_empty_file` | Regression | Empty file rejected | Rejected with 400 | 0 | **PASS** |

**Summary: 28 passed, 0 failed, 0 skipped in 10.34s.**

---

## 6. Regression Verification

1. **Audit Chain Verification Script:**
   ```powershell
   backend\venv\Scripts\python.exe backend/scripts/audit_integrity.py verify-chain
   ```
   **Output:** 5 events, 0 sequence gaps, 0 previous_hash mismatches, 0 event_hash mismatches.
2. **Frontend Typecheck and Build:**
   ```powershell
   cd frontend; npm run build
   ```
   **Output:** Built in 576ms with 0 errors.
3. **Frontend E2E Puppeteer Suites:**
   - `node frontend/test-stage2-batch1.cjs`: **ALL PASS** (10 steps)
   - `node frontend/test.cjs`: **PASS** (login $\to$ case intake $\to$ evidence $\to$ analysis $\to$ report)
   - `node frontend/test-batch2.cjs`: **ALL PASS** (shell navigation, 3 phases, redirects, theme toggle)

---

## 7. Diagnosis of Test-Execution Discrepancy

The audit noted discrepancies between earlier failing commands and later passes:

1. **Environment / Virtualenv Discrepancy:**  
   Running `pytest` without activating `backend/venv` or without `$env:PYTHONPATH="F:\Projects\ForenSight\backend"` caused `ModuleNotFoundError: No module named 'app'` or `No module named 'redis'`. Executing strictly with `backend\venv\Scripts\python.exe` and `PYTHONPATH="backend"` resolves this.
2. **SQLite StaticPool Lock vs Concurrent Execution:**  
   In `backend/tests/conftest.py`, `sqlite:///:memory:` with `StaticPool` forced all sessions to share a single in-memory connection. When one transaction rolled back, it reset the shared connection for all threads. Adjusting `conftest.py` to use a temporary SQLite file with WAL mode (`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=15000; poolclass=QueuePool`) grants each thread an isolated connection with non-blocking reads and serialized writes, allowing concurrent test execution without table locks.
3. **Audit Event Commits Breaking Atomic Rollbacks:**  
   `AuditService.log_event` previously called `db.commit()` unconditionally. In multi-step transactions, committing `CASE_CREATED` prematurely persisted the case before `IntakeIdempotencyRecord` was evaluated. Adding `auto_commit: bool = True` (with `auto_commit=False` used during coordinated intake) ensures that the entire intake operation is committed as one atomic unit, allowing complete rollback on conflict.
4. **AnyIO Socket Loopback Sandbox Block:**  
   Starlette's synchronous `TestClient` uses `anyio` thread worker portals with loopback TCP sockets. Inside restricted sandboxes that block loopback sockets, tests hung. Running test commands with loopback permissions allowed instant execution.

---

## 8. Final Git State

- **Files Changed:**
  - `backend/app/models/domain.py`
  - `backend/app/services/evidence.py`
  - `backend/app/services/audit.py`
  - `backend/app/api/cases.py`
  - `backend/tests/conftest.py`
  - `backend/tests/test_evidence_intake_lifecycle.py`
  - `frontend/src/pages/EvidenceIntake.tsx`
  - `STAGE_2_BATCH_1_2_IMPLEMENTATION_REPORT.md`
- **Target Commit Message:** `fix(evidence): enforce idempotency conflicts and cleanup recovery`
