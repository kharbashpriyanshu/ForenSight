# Changelog

All notable changes to the ForenSight platform are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0] - 2026-11-13

### Added
- **Scientific Algorithm Freeze:** Cryptographic SHA-256 integrity manifest (`forensics_freeze_manifest.json`) verifying 38 forensic core files across CI and local execution with cross-platform LF normalization.
- **Enterprise Authentication & MFA:** RFC 6238-compliant TOTP multi-factor authentication with Fernet-encrypted secret storage and single-use hashed recovery codes.
- **Advanced Session Security:** HttpOnly, SameSite=Lax cookie sessions, rotating refresh tokens with automatic replay detection via previous token hashes, and double-submit CSRF protection.
- **Audit Ledger Chain:** Cryptographically chained append-only audit event log using SHA-256 state hashing and sequential numbering.
- **Reproducible Benchmark Suite:** Standardized dataset adapters (CASIA v2.0, Columbia, NIST OpenMFC), 3-run bit-for-bit determinism validation, and non-ranking evaluation safeguards.
- **Court-Admissible Reporting Engine:** Multi-page PDF dossier generation using ReportLab `NumberedCanvas` with two-pass total page numbering ("Page X of Y"), running headers, and compliance statements.
- **Dual-Theme Design System:** 30+ semantic CSS design tokens supporting Light and Dark modes with WCAG contrast compliance.
- **Asynchronous Task Architecture:** Celery and Redis workers with transparent in-process fallback and durable outbox pattern.
- **Comprehensive Test Suite:** 487 automated tests spanning unit, integration, security regressions, and live PostgreSQL/Redis services.

### Changed
- **Pydantic v2 Migration:** Migrated all schemas and settings to `model_config = ConfigDict(from_attributes=True)` and `SettingsConfigDict`.
- **FastAPI Lifespan Context:** Replaced deprecated `@app.on_event("startup")` with modern `@asynccontextmanager lifespan`.
- **Timezone Awareness:** Normalized all timestamp generation across backend models, services, and forensic analyzers to `datetime.now(timezone.utc)`.
- **Defensive Error Handling:** Replaced bare exception blocks with structured logging across normalizers and adapters.

### Fixed
- Fixed frontend proxy target port alignment in `vite.config.ts` with configurable `VITE_API_URL` environment override.
- Resolved benchmark suite null property access during initial cold-start reproduction evaluation.
- Corrected database migration state for multi-user MFA and session storage.
