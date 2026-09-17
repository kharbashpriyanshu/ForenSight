# ForenSight Architecture (V2.1)

## System Architecture

ForenSight follows a modern decoupled architecture, separating the client-side presentation from the server-side processing, async worker pipelines, and forensic analysis engines.

1. **Frontend**: A Single Page Application (SPA) built with React 19, TypeScript, and Vite. Features authenticated image fetching (`AuthenticatedImage`) for binary forensic artifacts.
2. **Backend**: A RESTful API built with Python 3.12 and FastAPI, enforcing strict JWT-based Role-Based Access Control (RBAC) and resource authorization.
3. **Async Task Execution**: Celery task queue with dual-mode runtime execution:
   - **Production Mode**: Asynchronous background workers consuming from a Redis message broker.
   - **Local Development Fallback**: Eager in-process task execution (`CELERY_TASK_ALWAYS_EAGER=true`) when Redis broker is absent.
4. **Database**: SQLAlchemy ORM with support for PostgreSQL (production containerized) and SQLite (local development).

## Backend/Frontend Separation

The system maintains a strict separation of concerns:
- **Frontend** handles user interface, multi-user authentication state, case management views, interactive evidence visualization, asynchronous job polling, authenticated artifact rendering, and report presentation.
- **Backend** is strictly responsible for data processing, database interactions, centralized RBAC authorization, classical DIP algorithms, evidence fusion (Rule 7B-v1), and audit logging.

They communicate exclusively via a defined REST API over HTTP with Bearer JWT tokens.

## Asynchronous Worker Architecture & Celery Dual-Mode

Synchronous execution of computer vision tasks (e.g., SIFT feature extraction, RANSAC matching, DCT quantization parsing) blocks web server worker threads. ForenSight employs an asynchronous worker model:

1. **API Job Submission**: Client submits job (`POST /api/jobs/analysis/{evidence_id}/{analysis_type}`).
2. **State Transition**: Job is recorded as `QUEUED`, and dispatched via Celery.
3. **Task Execution**:
   - `CELERY_TASK_ALWAYS_EAGER=false` (Production/Docker): Pushed to Redis broker (`redis://redis:6379/0`), picked up by Celery worker container.
   - `CELERY_TASK_ALWAYS_EAGER=true` (Local Fallback): Executed immediately in-process, allowing development without active Redis/Docker daemons.
4. **Lifecycle States**: Deterministically moves: `QUEUED` → `RUNNING` → `COMPLETED` or `FAILED`.
5. **Sanitized Failure Handling**: If an engine encounters unhandled errors or invalid formats, the job transitions to `FAILED` with a human-readable, safe error message. Stack traces, file system paths, and internal exceptions are strictly stripped.

## Protected Forensic Artifact Architecture

Forensic artifacts (such as ELA difference maps and Copy-Move match visualizations) are sensitive investigative materials:

- **Authenticated Route**: Stored artifacts are accessed via `GET /api/artifacts/{artifact_path:path}`.
- **Authorization Scoping**: Requires a valid Bearer JWT. Enforces case ownership: Investigators can only view artifacts from their own cases; cross-case requests receive `403 Forbidden`; Admins have global visibility.
- **Traversal Mitigation**: Path parameters are resolved against the absolute storage directory, strictly rejecting `..` directory traversal and null byte injections.
- **Frontend `AuthenticatedImage`**: React component fetches binary blobs via `fetch()` with `Authorization: Bearer <token>`, converts to object URLs with `URL.createObjectURL`, and frees memory on unmount with `URL.revokeObjectURL`. If an engine produces structured findings without an image artifact (e.g., Metadata analysis), the UI displays an informative fallback notice.

## Database Architecture & ORM Schema

ForenSight utilizes SQLAlchemy ORM with a domain model designed for investigative integrity:

- **User**: Authentication credentials (`username`, `hashed_password` via bcrypt, `role` [ADMIN / INVESTIGATOR]).
- **InvestigationCase**: Primary container for an investigation (`case_identifier`, `title`, `user_id` owner).
- **Evidence**: Digital media asset (`case_id`, `original_filename`, `stored_path`, `sha256_hash`, `mime_type`, dimensions).
- **AnalysisJob**: Asynchronous worker execution record (`job_id`, `evidence_id`, `analysis_type`, `status`, `safe_error_message`).
- **Analysis**: Structured forensic findings and references to generated visual artifacts (`evidence_id`, `analysis_type`, `structured_findings`, `artifacts`).
- **EvidenceObservation / Relation / Assessment**: Normalized evidence fusion model (Rule 7B-v1).
- **AuditEvent**: Append-only immutable log of every case, evidence, job, and report action.

## System Health & Observability

The `GET /api/health` endpoint provides detailed component observability:
- **API Gateway**: Running status and API version.
- **Database**: Active database connection check.
- **Redis Broker**: Connection check with `redis.ping()` or fallback notification.
- **Celery Worker**: Active worker ping check or `eager_fallback` status.
- **Storage**: Read/write access validation on evidence storage volume.

## Verification Status Summary

| Subsystem | Local Environment (Windows Host) | Containerized Environment |
|---|---|---|
| **FastAPI Backend** | `VERIFIED LOCALLY` (Python 3.12, 66/66 pytest passing) | Configured in `docker-compose.yml` |
| **React Frontend** | `VERIFIED LOCALLY` (TypeScript 0 errors, Vite build PASS) | Configured in `docker-compose.yml` |
| **Celery Worker** | `VERIFIED LOCALLY` (Dual-mode eager fallback verified) | Configured in `docker-compose.yml` |
| **Protected Artifacts** | `VERIFIED LOCALLY` (Auth, MIME, Traversal, Isolation verified) | Configured in `docker-compose.yml` |
| **Redis Broker** | `NOT VERIFIED — ENVIRONMENT BLOCKED` (Redis not installed on host) | Static config validated |
| **PostgreSQL DB** | `NOT VERIFIED — ENVIRONMENT BLOCKED` (psql not installed on host) | Static config validated |
| **Docker Daemon** | `NOT VERIFIED — ENVIRONMENT BLOCKED` (Docker not installed on host) | Compose file syntax validated |

- **Sprint 0 Principle**: Establishing a clean, modular foundation without prematurely implementing "mock" forensic capabilities.
