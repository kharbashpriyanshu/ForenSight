# ForenSight Current Implementation Status

**Snapshot date:** 2026-10-06
**Repository revision:** `ef55158` plus the upgrade work in this working tree
**Verification:** Frontend production build and mocked browser workflow passed. Backend source compilation passed. The backend pytest suite could not start because the active Python installation is missing `_pytest.cacheprovider`.

This file is the current implementation snapshot. Dated audit reports elsewhere in the repository preserve historical findings and should not be used as current test or engine counts.

## Upgrade work in this snapshot

| Area | Current implementation |
|---|---|
| Production configuration | Production startup rejects development JWT keys, weak/sample PostgreSQL passwords, SQLite, non-HTTPS or wildcard CORS origins, and a missing Ed25519 export key. Compose host ports bind to loopback and the frontend proxies `/api/` over the private container network. |
| Evidence intake | Streams bytes to a staging file while calculating SHA-256; enforces byte and pixel limits; checks decoded image format against extension and MIME; atomically stores accepted source bitstreams. |
| Case listing | Investigator ownership filtering, search, ordering, and pagination execute in SQL. The UI can load subsequent pages. |
| Analysis jobs | Records engine version, attempt count, and stage progress; retries transient database errors; enforces task time limits; Celery Beat marks abandoned jobs retryable. Progress is stage-level, not a scientific measure of work completed. |
| Frontend | Routes and evidence viewers load on demand. CI has a mocked Puppeteer workflow for login, case creation, intake, one analysis, and report generation. |
| Processing history | API and UI present unranked compression/resampling sequence possibilities with source analyses and explicit uncertainty. They do not claim to reconstruct a unique history. |
| Case handoff | Exports case-scoped JSON, source bitstreams, available artifacts, and a SHA-256 manifest with an Ed25519 signature. A CLI validates integrity without extracting files. Automatic import is not implemented. |

## Scientific validation status

The checked-in controlled benchmark artifact records 11 images and 22 evaluations across Advanced Noise and Resampling. The benchmark runner supports localization metrics when an evaluation supplies suitable ground-truth masks and spatial predictions. That artifact is not broad real-world validation.

External benchmark adapters and protocols are in the repository, but public dataset binaries and licenses are not included. No external-dataset results are claimed in this snapshot. To complete real-world validation, acquire data under its license, register its manifest and hashes, run a held-out evaluation, and preserve the dataset version, engine version, environment, and results together.

## Deployment requirements

For `ENVIRONMENT=production`, configure a unique `SECRET_KEY`, a PostgreSQL URL with a strong URL-safe password, trusted HTTPS `BACKEND_CORS_ORIGINS`, and `CASE_EXPORT_SIGNING_PRIVATE_KEY`. Terminate HTTPS at a trusted reverse proxy. Keep signing private keys out of Git and verify exporter fingerprints through a separate trusted channel.

See [deployment instructions](docs/DEPLOYMENT.md), [security controls](docs/SECURITY.md), and the [case bundle guide](docs/CASE_BUNDLE.md).
