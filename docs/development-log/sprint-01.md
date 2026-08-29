# Sprint 1 Development Log: Secure Evidence Acquisition

## 1. What was implemented
Implemented the initial evidence acquisition and case management subsystem. Users can create Investigation Cases, select them, and securely upload digital images (PNG, JPEG, WEBP) as Evidence. The system validates the content, securely stores the file on disk, generates a SHA-256 hash for integrity, and persists metadata in a relational database. A basic React UI was developed to interact with this pipeline.

## 2. Why evidence acquisition is necessary
Before any forensic analysis can take place, the digital evidence must be safely ingested, validated, and chained to an investigation case. Evidence acquisition ensures we are working with untampered, fully documented source material.

## 3. Why SHA-256 is used
SHA-256 provides a cryptographically secure, deterministic identifier for the exact byte sequence of the uploaded file. The original SHA-256 establishes a baseline fingerprint for the acquired evidence. Recomputing the hash later and comparing it with the stored value can detect subsequent byte-level changes.

## 4. Why SQLite is used initially
SQLite provides a zero-configuration, reliable relational database that minimizes infrastructure overhead during early development. It allows rapid prototyping of the ORM layer.

## 5. Why SQLAlchemy is used
SQLAlchemy abstracts the underlying SQL dialect, making it trivial to migrate from SQLite to a robust PostgreSQL cluster in future sprints when concurrency and performance demands increase.

## 6. Why Pillow/content validation is used
Relying solely on file extensions or client-provided MIME types is insecure. Pillow is used to genuinely decode the file headers and verify that the content is a readable, uncorrupted image.

## 7. How uploaded files are secured
- **Size Validation:** Checked stream size to prevent DoS.
- **MIME/Extension Check:** Enforced strict allowlists.
- **Content Verification:** Decoded via Pillow to ensure validity.
- **Sanitization:** Discarded the user's original path and generated a `UUID4.ext` safe filename.
- **Isolation:** Stored outside the web root and source code (`storage/evidence/`).

## 8. How the case/evidence relationship works
A one-to-many relational structure is established: One `InvestigationCase` can contain many `Evidence` items. They are linked via standard SQL foreign keys, and surfaced through SQLAlchemy `relationship()` properties.

## 9. API endpoints
- `POST /api/cases`: Create case.
- `GET /api/cases`: List cases.
- `GET /api/cases/{case_id}`: Retrieve case details.
- `POST /api/cases/{case_id}/evidence`: Upload evidence.
- `GET /api/evidence/{evidence_id}`: Retrieve evidence metadata.

## 10. Testing strategy
Comprehensive testing with Pytest and FastAPI `TestClient`, utilizing an isolated in-memory SQLite database (`StaticPool`). Tested valid uploads, corrupted uploads, oversized files, case creation, and endpoint health.

## 11. Known limitations
- Currently lacks user authentication.
- Does not automatically deduplicate storage if the same hash is uploaded (preserves individual evidence records instead).

## 12. Future migration path toward forensic analysis
With secure evidence acquisition established, the next sprint will build upon this foundation by reading the securely stored files to extract EXIF/XMP metadata and perform initial visual analysis (e.g., Error Level Analysis).
