# ForenSight V2 Recovery Log

## V1 Baseline
The previous version of ForenSight (V1) implemented a core set of forensic algorithms that remain scientifically sound and observable:
- Metadata analysis (exiftool-based)
- Error Level Analysis (ELA) for JPEG compression anomalies
- Noise Residual Analysis via high-pass filtering
- JPEG/DCT block structure and quantization table analysis
- Copy-Move candidate matching

These engines exist as distinct analyzers (e.g. `MetadataAnalyzer`, `ELAAnalyzer`) returning structured JSON output.

## Broken V2 Components
The V2 implementation introduced several structural additions that currently fail to execute:
1. **Backend Startup**: The backend is fundamentally broken due to incorrect model imports (`Case` vs `InvestigationCase` in `app.models.domain`).
2. **Async Job Architecture**: `analysis_worker.py` and `jobs.py` queue jobs, but `celery` and `redis` were omitted from `requirements.txt`, making execution impossible.
3. **Database Architecture**: PostgreSQL was claimed via `docker-compose.yml`, but `psycopg2-binary` is missing and Alembic is hardcoded to SQLite.
4. **Authentication & Case Isolation**: API routes (`cases.py`) contain no dependency injection for token verification, rendering RBAC and isolation nonexistent.
5. **Timeline and Reports Routes**: The frontend router lacks critical routes (`/cases/:caseId/timeline`, `/cases`, `/cases/:caseId/findings`).
6. **Docker and CI**: `docker-compose.yml` fails without proper dependencies, and GitHub Actions CI workflows are completely missing.

## Dependency Problems
- `celery` missing from `requirements.txt`
- `redis` missing from `requirements.txt`
- `psycopg2-binary` missing from `requirements.txt`
- `python-jose` / `passlib` / `bcrypt` missing for authentication

## Architecture Conflicts
- FastAPI application expects `Case` but `domain.py` defines `InvestigationCase`.
- `docker-compose.yml` expects a Postgres URL, but local development expects SQLite. The `env.py` and `alembic.ini` need dynamic configuration support.
- API expects asynchronous jobs for analysis, but the frontend polling relies on the backend and worker functioning correctly.

## Recovery Strategy
1. **Phase 1**: Fix all `Case` imports to `InvestigationCase`. Start the backend successfully.
2. **Phase 2**: Add `celery`, `redis`, `psycopg2-binary`, and Auth dependencies to `requirements.txt` and install.
3. **Phase 3**: Ensure the 49 backend tests pass locally with the fixed imports.
4. **Phases 4-7**: Hook up Celery and Redis properly in the worker and jobs API. Ensure job states update and frontend polling functions.
5. **Phases 8-10**: Repair frontend investigation workspace routes and components.
6. **Phases 11-13**: Polish Audit Trail, Reports, and System Health.
7. **Phases 14-15**: Repair Alembic migrations and add PostgreSQL support conditionally.
8. **Phases 16-18**: Implement JWT authentication, RBAC, and strict Case Isolation across all APIs.
9. **Phases 19-20**: Finalize Docker Compose and CI workflows.
10. **Phases 21-26**: Test security, verify scientific integrity, write documentation, and present finalized structure.
