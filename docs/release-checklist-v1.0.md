# ForenSight v1.0 Release Checklist

## Functionality
- [PASS] Case creation
- [PASS] Evidence upload
- [PASS] SHA-256
- [PASS] Metadata
- [PASS] ELA
- [PASS] Noise
- [PASS] JPEG/DCT
- [PASS] Copy-Move
- [PASS] Normalization
- [PASS] Correlation
- [PASS] Assessment

## Integrity
- [PASS] Source immutable: Evidence records strictly track source SHA-256, blocking any overwrites during analysis. The original SHA-256 establishes a baseline fingerprint for the acquired evidence. Recomputing the hash later and comparing it with the stored value can detect subsequent byte-level changes.
- [PASS] SHA-256 unchanged: Repeated API calls and tests confirm source bytes are untouched.
- [PASS] Artifact isolation: All derived files map strictly to `/storage/artifacts`.
- [PASS] Provenance: `EvidenceRelation` and `EvidenceAssessment` maintain strict foreign-key bindings back to `EvidenceObservation`.

## Security
- [PASS] Upload limits: `MAX_UPLOAD_SIZE` is enforced.
- [PASS] File validation: FastAPI rejects corrupted files at acquisition.
- [PASS] Path traversal: The `/api/artifacts/{path:path}` endpoint uses `pathlib.Path.resolve()` and `relative_to()` to strictly verify all artifact requests remain within the configured `STORAGE_DIR` boundary, mitigating directory breakout vulnerabilities.
- [PASS] Absolute path suppression: Error handlers strip system internal routes.
- [PASS] CORS: Production mode pulls domains cleanly from `.env`.
- [PASS] Security headers: Enforced `X-Frame-Options`, `X-Content-Type-Options`, and `X-XSS-Protection` (legacy/compatibility).
- [PASS] Secret management: Config relies completely on external `.env`.

## Reliability
- [PASS] Failure handling: SIFT and ELA failures return `400` leaving Evidence intact.
- [PASS] Idempotency: Correlation and Normalization pipelines safely drop old observations and recalculate reliably.
- [PASS] Persistence: SQLAlchemy persists all data cleanly to SQLite without orphaned artifacts.
- [PASS] Refresh: Dashboard relies entirely on REST fetching; a hard browser refresh accurately pulls backend state.
- [PASS] Case isolation: Analyses are segmented rigidly by `evidence_id` foreign keys.

## Frontend
- [PASS] TypeScript: V1.0 compiles perfectly via `tsc --noEmit`.
- [PASS] Production build: `vite build` completes successfully.
- [PASS] Responsive UI: Grid parameters respond smoothly to window scaling.
- [PASS] Loading states: All modules support asynchronous locks during flights.
- [PASS] Error states: HTTP rejections render human-readable messages in-app.
- [PASS] Accessibility: High contrast panels and strict semantic grid flow.

## Scientific integrity
- [PASS] No fake/real classifier: Banned completely.
- [PASS] No manipulation probability: No arbitrary 0-100% scores.
- [PASS] No arbitrary scoring: Qualitative assessments (`ELEVATED_FORENSIC_CONCERN`) are generated from discrete families.
- [PASS] No overclaiming: The term "confirmed manipulation" does not exist in the platform.
- [PASS] Missing ≠ negative: A missing Copy-Move analysis does not equate to "authentic".
- [PASS] Correlated evidence not double-counted: ELA and DCT successfully condense into one "Compression" contextual family.
