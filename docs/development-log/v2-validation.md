# ForenSight V2 Validation Audit Log

## Current Architecture
- **Frontend**: React, Vite, TailwindCSS, React Router V6.
- **Backend**: FastAPI, Pydantic V2, SQLAlchemy 2.0.
- **Database**: SQLite (local) / PostgreSQL (production), managed via Alembic.
- **Worker**: Celery processing background forensic tasks.
- **Broker**: Redis acting as message broker for Celery.
- **Authentication**: JWT via python-jose, passwords hashed with bcrypt 3.2.0 via passlib.
- **Infrastructure**: Docker Compose, GitHub Actions CI.

## Database Models
- User
- InvestigationCase
- Evidence
- Analysis
- EvidenceObservation
- EvidenceRelation
- EvidenceAssessment
- AnalysisJob
- AuditEvent
- Report

## API Routes
- `GET /api/health`
- `POST /api/auth/token`
- `GET /api/cases`
- `POST /api/cases`
- `GET /api/cases/{case_id}`
- `GET /api/cases/{case_id}/overview`
- `POST /api/cases/{case_id}/evidence`
- `GET /api/evidence/{evidence_id}`
- `POST /api/evidence/{evidence_id}/analysis/{modality}`
- `GET /api/jobs/{job_id}`
- `GET /api/artifacts/{path}`
- `POST /api/evidence/{evidence_id}/fusion/assess`
- `GET /api/cases/{case_id}/timeline`
- `POST /api/cases/{case_id}/reports`

## Frontend Routes
- `/login` (TBD, may need validation)
- `/cases`
- `/cases/:caseId` (Dashboard)
- `/cases/:caseId/library` (Evidence Library)
- `/cases/:caseId/evidence/:evidenceId` (Evidence Detail)
- `/cases/:caseId/timeline` (Audit Trail)
- `/cases/:caseId/findings` (Reports)

## Deviations from V2 Plan
- None strictly identified yet. Needs full runtime verification.
