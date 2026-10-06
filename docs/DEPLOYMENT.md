# ForenSight V2.1 — Deployment Guide

This document outlines the deployment topologies, environment configurations, container orchestration, and operational procedures for the ForenSight platform.

---

## 1. Deployment Topologies

ForenSight supports two primary deployment topologies:

```
┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│        Development Topology          │       │        Production Topology           │
├──────────────────────────────────────┤       ├──────────────────────────────────────┤
│ • SQLite in-process database         │       │ • PostgreSQL 15 relational database  │
│ • Celery Eager Fallback (no broker)  │       │ • Redis 7 message broker & backend   │
│ • Uvicorn direct ASGI process        │       │ • Dedicated Celery worker containers │
│ • Vite HMR development server        │       │ • Gunicorn/Uvicorn worker pool       │
│ • Zero external daemons required     │       │ • Nginx reverse proxy / static asset │
└──────────────────────────────────────┘       └──────────────────────────────────────┘
```

---

## 2. Environment Variables Specification

The platform is configured entirely via environment variables (or `.env` file). The table below lists all supported configuration parameters:

| Variable | Type | Default | Purpose & Constraints |
|---|---|---|---|
| `PROJECT_NAME` | string | `ForenSight` | Application name in OpenAPI documentation |
| `ENVIRONMENT` | string | `development` | Deployment environment (`development` / `staging` / `production`) |
| `DATABASE_URL` | string | `sqlite:///./forensight.db` | SQLAlchemy connection URI (PostgreSQL or SQLite) |
| `SECRET_KEY` | string | development-only | JWT signing key; production requires a unique value of at least 32 characters |
| `ACCESS_TOKEN_EXPIRE_MINUTES`| int | `15` | Short-lived access-cookie lifetime |
| `SESSION_REFRESH_EXPIRE_DAYS` | int | `30` | Maximum refresh-session lifetime; refresh cookies rotate on use |
| `BACKUP_INTERVAL_SECONDS` | int | `86400` | Automatic PostgreSQL and evidence backup interval (minimum 60 seconds) |
| `BACKUP_RETENTION_DAYS` | int | `30` | Number of days automatic local backups are retained |
| `BACKEND_CORS_ORIGINS` | string | local development origins | Comma-delimited trusted origins; production requires explicit HTTPS origins |
| `CELERY_BROKER_URL` | string | `redis://localhost:6379/0` | Message broker connection URI for Celery tasks |
| `CELERY_RESULT_BACKEND` | string | `redis://localhost:6379/0` | Result backend URI for Celery task statuses |
| `REDIS_PASSWORD` | string | required by Compose | Unique URL-safe Redis password; at least 16 characters in production |
| `CELERY_TASK_ALWAYS_EAGER` | bool | `true` | When `true`, tasks execute synchronously in-process (no Redis) |
| `STORAGE_DIR` | string | `storage/evidence` | Physical directory for uploaded evidence and forensic artifacts |
| `MAX_UPLOAD_SIZE` | int | `10485760` (10 MB) | Maximum permitted HTTP multipart evidence payload in bytes |
| `MAX_IMAGE_PIXELS` | int | `40000000` | Maximum image dimensions accepted at intake |
| `CASE_EXPORT_SIGNING_PRIVATE_KEY` | string | empty | Base64-encoded 32-byte Ed25519 private key used to sign `.forensight` bundles |
| `ANALYSIS_JOB_STALE_AFTER_SECONDS` | int | `900` | Age after which Beat marks abandoned jobs as failed and retryable |

---

## 3. Local Development Setup (Zero-Daemon Fallback)

For environments without Docker, Redis, or PostgreSQL (e.g., local Windows developer workstations):

```bash
# 1. Backend Setup
cd backend
python -m venv venv
venv\Scripts\activate      # Windows (or source venv/bin/activate on Linux)
pip install -r requirements.txt

# 2. Database Initialization
alembic upgrade head
python scripts/seed_demo.py

# 3. Start API Server (Runs in Celery Eager mode by default)
uvicorn app.main:app --reload --port 8000

# 4. Frontend Setup (in separate terminal)
cd ../frontend
npm install
npm run dev
```

The application is available at `http://localhost:5173`.

---

## 4. Production Containerized Deployment (Docker Compose)

Production deployment bundles all required services into isolated containers orchestrated via Docker Compose:

```bash
# 1. Clone repository
git clone https://github.com/kharbashpriyanshu/ForenSight.git
cd ForenSight

# 2. Configure local values first; production mode rejects sample values.
cp .env.example .env
# Generate an export signing key and store its private value in CASE_EXPORT_SIGNING_PRIVATE_KEY.
cd backend
python scripts/generate_case_export_key.py
cd ..
# Set SECRET_KEY, POSTGRES_PASSWORD, REDIS_PASSWORD,
# BACKEND_CORS_ORIGINS=https://your-host.example, and ENVIRONMENT=production.
# Use URL-safe characters in both database and Redis passwords.

# 3. Build and Launch Containers
docker compose up -d --build

# 4. Apply Database Migrations (Automated in backend entrypoint)
# Or manually via:
docker compose exec backend alembic upgrade head

# Do not seed demo identities in production; the script intentionally refuses this environment.
```

---

Compose binds web, API, and database host ports to `127.0.0.1`. Redis has no published host port, requires authentication, and persists broker data in a named volume. The frontend Nginx container proxies `/api/` to the backend over the private Compose network. The API and workers run as an unprivileged user with a read-only root filesystem and dropped Linux capabilities. On Linux hosts, grant UID/GID `10001` write access to the mounted evidence directory before startup: `sudo chown -R 10001:10001 backend/storage`. Terminate HTTPS at a trusted reverse proxy and point it at the loopback web port. Production startup fails when secrets, CORS origins, token lifetimes, or the export signing key use unsafe settings. A dedicated Celery Beat service retries durable analysis outbox entries and reconciles abandoned jobs.

## 5. Health & Readiness Probes

The API exposes standard liveness and readiness endpoints for container orchestrators (Docker, Kubernetes, AWS ECS):

- **Liveness Probe**: `GET /api/health`
  - Returns HTTP 200 with JSON payload reporting the operational health of:
    - API Gateway (`healthy`)
    - Database connection (`healthy` / `unhealthy`)
    - Redis message broker (`healthy` / `unavailable`)
    - Celery worker status (`healthy` / `eager_fallback` / `unavailable`)
    - Evidence storage volume read/write permissions (`healthy` / `degraded`)
- **Readiness Probe**: `GET /api/ready`
  - Returns HTTP 200 (`status: "ready"`) when both Database and Storage are functional.
  - Returns HTTP 503 (`status: "not_ready"`) if the database or filesystem is inaccessible.

---

## 6. Backup & Evidence Persistence

- **Database Volume**: PostgreSQL stores all persistent records in the named volume `pgdata` (`/var/lib/postgresql/data`).
- **Evidence & Artifact Volume**: All binary image uploads and generated forensic visual maps are stored in the host-mounted volume `./backend/storage` (`/app/storage`).
- **Automatic backup service**: Compose starts a dedicated service after the API is healthy. It immediately creates a PostgreSQL custom-format dump and a tar archive of `backend/storage`, verifies both archives and their SHA-256 checksums, then writes a `VERIFIED` marker. It repeats at `BACKUP_INTERVAL_SECONDS` and prunes only its own dated backup directories older than `BACKUP_RETENTION_DAYS`. The named volume is `backupdata`.
- **Off-host copy**: `backupdata` is on the same host and is not disaster recovery by itself. Copy each completed dated directory to a separately administered, encrypted off-host destination with access controls and retention; keep encryption keys separately. Do not treat a checksum as encryption or proof against a host administrator.
- **Inspect a backup**:
  ```bash
  docker compose exec backup sh -c 'ls -la "$BACKUP_ROOT"'
  docker compose exec backup sh -c 'cd "$BACKUP_ROOT/<UTC-stamp>" && sha256sum -c SHA256SUMS && pg_restore --list database.dump >/dev/null && tar -tzf evidence.tar.gz >/dev/null && test -f VERIFIED'
  ```
- **Restore drill**: Use a separate, isolated PostgreSQL instance and an empty temporary storage directory. Copy one completed backup directory there, verify `SHA256SUMS`, then run `pg_restore --clean --if-exists --no-owner --no-acl --dbname "$DRILL_DATABASE_URL" database.dump` and extract `evidence.tar.gz` into the temporary storage root. Check that the restored database has the expected cases/evidence and that every restored evidence file matches its recorded SHA-256. Never point a restore drill at the live database or evidence directory. Record the restore date, backup stamp, elapsed time, and any missing files, then discard the isolated drill environment.

Backups are not enabled for any host-side path outside `backend/storage`; if operators change `STORAGE_DIR` or externalize evidence storage, update and separately validate the backup mount before deployment.

## Signed case handoff

The Reports workspace provides **Export signed case bundle**. It includes case-scoped records, original evidence files, and available analysis/report artifacts. Every included member is SHA-256 hashed; the manifest is signed with Ed25519. Verify a bundle before importing it into a separate station:

Verify without extracting the archive:

```bash
cd backend
python scripts/verify_case_bundle.py ../case.forensight --trusted-fingerprint <known-public-key-sha256>
python scripts/import_case_bundle.py ../case.forensight --trusted-fingerprint <known-public-key-sha256> --owner-username <destination-user>
```

The importer makes a new case owned by the selected local user, rewrites local identifiers, restores checked evidence and artifact files, and records the original audit hashes as imported history. It validates source audit chains when the bundle contains them; older pre-chain bundles are explicitly marked as having no source-chain data. The embedded public key proves internal archive integrity; compare its fingerprint with the exporter through a separate trusted channel to authenticate the signer. Imports are additions and do not merge into an existing case.

## 7. Audit integrity checkpoints

Audit events are linked by per-case SHA-256 chains, with database triggers rejecting ordinary update/delete operations. A database administrator can still rewrite a chain, so periodically store signed checkpoints away from the application host:

```bash
cd backend
python scripts/audit_integrity.py verify-chain
python scripts/audit_integrity.py checkpoint ../audit-checkpoints/audit-$(date -u +%Y%m%dT%H%M%SZ).json
python scripts/audit_integrity.py verify-checkpoint ../audit-checkpoints/<checkpoint>.json --trusted-fingerprint <known-public-key-sha256>
```

Protect the checkpoint directory with separate write credentials or immutable retention. The verifier checks checkpoint signature and trusted signer fingerprint; chain-head comparison across time is an operator procedure.
