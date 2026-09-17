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
| `SECRET_KEY` | string | (Placeholder) | 256-bit cryptographic secret for signing JWT access tokens |
| `ACCESS_TOKEN_EXPIRE_MINUTES`| int | `10080` (7 days) | Session duration for authenticated investigators |
| `BACKEND_CORS_ORIGINS` | string | `*` | Comma-delimited list of permitted CORS frontend origins |
| `CELERY_BROKER_URL` | string | `redis://localhost:6379/0` | Message broker connection URI for Celery tasks |
| `CELERY_RESULT_BACKEND` | string | `redis://localhost:6379/0` | Result backend URI for Celery task statuses |
| `CELERY_TASK_ALWAYS_EAGER` | bool | `true` | When `true`, tasks execute synchronously in-process (no Redis) |
| `STORAGE_DIR` | string | `storage/evidence` | Physical directory for uploaded evidence and forensic artifacts |
| `MAX_UPLOAD_SIZE` | int | `10485760` (10 MB) | Maximum permitted HTTP multipart evidence payload in bytes |

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

# 2. Configure Production Secrets
cp .env.example .env
# Edit .env to supply strong SECRET_KEY, database passwords, and CORS origins

# 3. Build and Launch Containers
docker compose up -d --build

# 4. Apply Database Migrations (Automated in backend entrypoint)
# Or manually via:
docker compose exec backend alembic upgrade head

# 5. Seed Demonstration Identities (Optional)
docker compose exec backend python scripts/seed_demo.py
```

---

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
- **Backup Procedure**:
  ```bash
  # Database dump
  docker compose exec -T db pg_dump -U forensight forensight > backup_$(date +%Y%m%d).sql
  
  # Storage archive
  tar -czf storage_backup_$(date +%Y%m%d).tar.gz backend/storage/
  ```
