# ForenSight V2 Architecture

## Overview
ForenSight V2 has evolved from a monolithic forensic dashboard into a Recruiter-Level Explainable Digital Image Forensic Investigation Platform. The primary architectural shift focuses on handling long-running forensic workloads asynchronously, providing comprehensive audit trails, and enabling automated report generation.

## Migration: Monolithic to Async
In V1, forensic algorithms (Metadata, ELA, Noise, JPEG/DCT, Copy-Move) were executed synchronously within the FastAPI request lifecycle. This was sufficient for lightweight analysis but unsustainable for production workloads or concurrent users.

V2 introduces an **Asynchronous Job Orchestration Architecture**:
1. **API Node**: The FastAPI application now acts strictly as an API Gateway and orchestration layer. It handles routing, authentication (future), case management, evidence acquisition, and job queuing.
2. **Message Broker**: Redis serves as the message broker, facilitating communication between the API Node and the worker nodes.
3. **Analysis Worker**: Celery handles the actual execution of the heavy forensic algorithms. Workers consume jobs from the Redis queue, process the images, update the database with findings, and emit audit events upon completion or failure.

## Database Schema Evolution (Alembic)
V2 introduces formal database migrations using Alembic to manage schema changes in production securely.

### New Models
- **AnalysisJob**: Represents the state of an asynchronous task. Tracks `job_identifier`, `status` (QUEUED, RUNNING, COMPLETED, FAILED), `started_at`, `completed_at`, and `safe_error_message`.
- **AuditEvent**: An immutable ledger of significant actions performed within a case. Tracks `event_type` (e.g., CASE_CREATED, EVIDENCE_UPLOADED, ANALYSIS_QUEUED), `timestamp`, `actor`, and `safe_metadata`.
- **Report**: Represents a generated JSON/PDF report for a case, tracking its storage location and the `rule_version` used for assessment.

## Recruiter Package Highlights
- **System Engineering**: Transitioned from a single `app.py` script to a distributed architecture using Docker, Celery, Redis, and Postgres.
- **Observability**: Added `/api/health` and a System Health UI dashboard to monitor the status of the API, Database, and Worker nodes.
- **Workflow & Auditability**: Every action is logged in an immutable `AuditEvent` table, and visually represented in an investigation timeline UI.
- **Security & Boundaries**: Strictly adhered to scientific limitations. No arbitrary "probability" metrics or Deep Learning models were added. Findings remain explainable, focusing on "forensic concern" and "anomalies."
