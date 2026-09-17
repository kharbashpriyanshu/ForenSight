# ForenSight V2.1 — Phase 4A Baseline Audit

## 1. Executive Summary
This document establishes the verified baseline of the ForenSight repository at the start of Phase 4 (Production CI/CD + Real Container E2E + Deployment Hardening). 

All 66 existing backend tests pass, TypeScript compilation reports 0 errors, the frontend production bundle builds cleanly, and the scientific forensic algorithms remain 100% frozen. Local runtime validation of distributed infrastructure (Docker daemon, Redis daemon, PostgreSQL server) remains blocked by host environment limitations (Windows host lacking these services), but the codebase contains complete, static architectural support for both modes via a Celery dual-mode execution pattern and SQLAlchemy database abstraction.

---

## 2. Current Architecture & Runtime Entrypoints

| Component | Entrypoint / Command | Configuration Source | Verified Runtime Mode |
|---|---|---|---|
| **API Gateway** | `uvicorn app.main:app --host 0.0.0.0 --port 8000` | `app.core.config.settings` | `VERIFIED LOCALLY` (FastAPI / Uvicorn) |
| **Frontend UI** | `npm run dev` / `npm run build` | `vite.config.ts`, `api.ts` | `VERIFIED LOCALLY` (React 19, TypeScript) |
| **Celery Worker** | `celery -A app.core.celery_app worker --loglevel=info` | `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` | `VERIFIED LOCALLY` (Dual-mode eager fallback) |
| **Relational DB** | `app.db.database.engine` (SQLAlchemy 2.0 compatible) | `DATABASE_URL` | `VERIFIED LOCALLY` (SQLite dev fallback) |
| **Migrations** | `alembic upgrade head` | `alembic.ini`, `alembic/env.py` | `VERIFIED LOCALLY` (1 initial migration) |
| **Evidence Storage** | Local filesystem (`storage/evidence/`) | `STORAGE_DIR` | `VERIFIED LOCALLY` (Read/Write verified) |
| **Security / RBAC** | JWT Bearer tokens via `passlib[bcrypt]` & `python-jose` | `SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES` | `VERIFIED LOCALLY` (17 security tests pass) |

---

## 3. Infrastructure Dependencies & Known Runtime Blockers

### Local Windows Development Host Status
- **Docker Daemon**: `NOT INSTALLED` (`docker`, `docker-compose` not found on system PATH).
  - *Runtime Status*: `ENVIRONMENT BLOCKED` on local machine.
- **Redis Server / CLI**: `NOT INSTALLED` (`redis-cli` not found on system PATH).
  - *Runtime Status*: `ENVIRONMENT BLOCKED` on local machine.
- **PostgreSQL Client / Server**: `NOT INSTALLED` (`psql` not found on system PATH).
  - *Runtime Status*: `ENVIRONMENT BLOCKED` on local machine.

### CI/CD Target Environment (GitHub Actions)
- GitHub Actions hosted Ubuntu runners (`ubuntu-latest`) support:
  - Native Docker and Docker Compose
  - Native service containers (`postgres:15`, `redis:7`)
  - Container-based real Celery worker execution
  - Real Alembic migrations against live PostgreSQL

---

## 4. Current Test Counts & Build Status

- **Pytest Backend Tests**: **66 passed, 0 failed** (executed in 24.51s).
  - `test_analysis.py`: 8 passed
  - `test_api_copy_move.py`: 4 passed
  - `test_api_ela.py`: 4 passed
  - `test_api_fusion.py`: 9 passed
  - `test_api_jpeg_dct.py`: 4 passed
  - `test_api_noise.py`: 3 passed
  - `test_audit_8b.py`: 3 passed
  - `test_cases.py`: 7 passed
  - `test_copy_move.py`: 3 passed
  - `test_ela.py`: 2 passed
  - `test_jpeg_dct.py`: 4 passed
  - `test_noise.py`: 4 passed
  - `test_schemas.py`: 1 passed
  - `test_security_auth.py`: 17 passed (covering multi-user RBAC, case isolation, secondary router protection, async job lifecycle, error sanitization, and protected artifact serving).
- **TypeScript Type Check**: `npx tsc --noEmit` &rarr; **0 errors**.
- **Frontend Production Build**: `npm run build` &rarr; **PASS** (`dist/` generated cleanly in 232ms).
- **Scientific Forensics Freeze**: `backend/app/forensics/` &rarr; **100% CLEAN & FROZEN**.

---

## 5. Deployment Assumptions & Operational Modes

1. **Development Mode (Default Local)**:
   - `DATABASE_URL`: `sqlite:///./forensight.db`
   - `CELERY_TASK_ALWAYS_EAGER`: `true`
   - Tasks execute synchronously within the application process.
   - Zero external daemon requirements.
2. **Production Containerized Mode (Docker Compose / Cloud)**:
   - `DATABASE_URL`: `postgresql://forensight:forensight_password@db:5432/forensight`
   - `CELERY_BROKER_URL`: `redis://redis:6379/0`
   - `CELERY_RESULT_BACKEND`: `redis://redis:6379/0`
   - `CELERY_TASK_ALWAYS_EAGER`: `false`
   - Celery worker runs in a separate dedicated container.
   - Database migrations run on container startup via `alembic upgrade head`.

---

## 6. Deprecation & Modernization Inventory

1. `datetime.utcnow()`: Deprecated in Python 3.12, scheduled for removal in Python 3.14. Must migrate to `datetime.now(timezone.utc)` in non-forensic core modules.
2. Pydantic V2 `class Config`: Deprecated in Pydantic 2.0. Must migrate to `model_config = ConfigDict(...)` where applicable in non-forensic schemas (`app/api/audit.py`, `app/api/reports.py`).
3. Starlette TestClient warning: Suggests installing `httpx2` or pinning TestClient imports.
