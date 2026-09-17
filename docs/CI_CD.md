# ForenSight V2.1 — CI/CD Pipeline Reference

This document outlines the Continuous Integration and Continuous Delivery (CI/CD) architecture implemented for the ForenSight platform.

---

## 1. Pipeline Overview

The CI pipeline runs automatically on every `push` and `pull_request` to the `main` branch via GitHub Actions (`.github/workflows/ci.yml`).

```
GitHub Push / Pull Request
    ├── Job 1: Backend Tests & Security Regression (Python 3.12, Pytest, Auth/RBAC)
    ├── Job 2: Frontend TypeScript & Production Build (Node 20, tsc --noEmit, Vite)
    ├── Job 3: Docker Compose Validation (Syntax validation, Image builds)
    └── Job 4: Live PostgreSQL & Redis Celery Integration (Service containers, Alembic, Celery)
```

---

## 2. Quality Gates & Failure Conditions

The CI workflow fails immediately and blocks merging if any of the following quality gates fail:

1. **Backend Test Failure**: Any failure in the 66+ Pytest test suite.
2. **Security Regression**: Any regression in JWT token verification, RBAC authorization, case isolation, path traversal mitigation, or error sanitization.
3. **TypeScript Errors**: Any strict type-check error reported by `npx tsc --noEmit`.
4. **Build Errors**: Any bundle packaging failure during `npm run build`.
5. **Docker Compose Syntax**: Invalid YAML syntax or undefined service keys caught by `docker compose config`.
6. **Database Migration Failures**: Any error executing `alembic upgrade head` against live PostgreSQL.
7. **Distributed Worker Failures**: Any task failure when running real Celery workers against live Redis.

---

## 3. Detailed Job Specifications

### Job 1: `backend-quality-and-tests`
- **Runner**: `ubuntu-latest`
- **Python Version**: `3.12`
- **Caching**: `pip` cache keyed on `backend/requirements.txt`.
- **System Dependencies**: `libgl1`, `libglib2.0-0` (required for headless OpenCV and Pillow C-extensions).
- **Execution**:
  - `pytest tests/ -v`: Runs unit tests across all classical image processing engines, API endpoints, schema validations, and audit logs.
  - `pytest tests/test_security_auth.py -v`: Runs dedicated security regression tests verifying 401 unauthenticated, 403 cross-case isolation, and path traversal blocking.

### Job 2: `frontend-quality-and-build`
- **Runner**: `ubuntu-latest`
- **Node.js Version**: `20`
- **Caching**: `npm` cache keyed on `frontend/package-lock.json`.
- **Execution**:
  - `npm ci`: Deterministic, clean dependency installation.
  - `npx tsc --noEmit`: Type safety validation with zero permitted errors.
  - `npm run build`: Production client-side bundle generation.

### Job 3: `docker-compose-validation`
- **Runner**: `ubuntu-latest`
- **Execution**:
  - `docker compose config`: Validates the complete multi-container orchestration definition, environment interpolation, and volume bindings.
  - `docker compose build`: Builds images for `backend`, `frontend`, and `worker` to ensure all `Dockerfile` configurations build successfully.

### Job 4: `postgres-redis-integration`
- **Runner**: `ubuntu-latest`
- **Service Containers**:
  - `postgres:15`: Live PostgreSQL instance with native health check (`pg_isready`).
  - `redis:7`: Live Redis broker with native health check (`redis-cli ping`).
- **Execution**:
  - Applies database migrations against live PostgreSQL (`alembic upgrade head`).
  - Seeds demonstration identities idempotently (`python scripts/seed_demo.py`).
  - Starts a real background Celery worker process consuming tasks from Redis (`CELERY_TASK_ALWAYS_EAGER=false`).
  - Executes the full test suite against live PostgreSQL and Redis.
