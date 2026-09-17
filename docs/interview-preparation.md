# ForenSight Interview Preparation

This document contains technically meaningful questions and answers related to the implementation of ForenSight V2.1.

## ARCHITECTURE & FASTAPI
**Q: Why did you choose FastAPI for the backend instead of Django or Flask?**
A: FastAPI was chosen for its native async support, which is critical when orchestrating multiple long-running forensic workloads. Its integration with Pydantic V2 provides automatic payload validation (e.g., rejecting invalid MIME types) and generates OpenAPI documentation automatically, which sped up frontend React integration.

**Q: How does ForenSight handle long-running computer vision tasks without blocking the event loop?**
A: Heavy tasks like SIFT-based Copy-Move detection are decoupled from the FastAPI worker threads. FastAPI simply enqueues a job payload to a Redis broker and returns a 202 Accepted. Background Celery workers consume these jobs, perform the CPU-bound OpenCV/NumPy operations, and update the database upon completion.

## SECURITY, JWT & RBAC
**Q: How is Case Isolation enforced at the API level?**
A: Case isolation is enforced using FastAPI's dependency injection system. When a route is accessed, a dependency verifies the JWT, extracts the `user_id`, and queries the database. If the requested case does not belong to the user (and the user is not an ADMIN), an HTTP 403 Forbidden is raised before the route logic even executes.

**Q: How did you prevent directory traversal attacks during evidence upload?**
A: Uploaded files are renamed using UUID4s rather than user-supplied filenames. When retrieving files, `pathlib.Path.relative_to(STORAGE_DIR)` is used to strictly ensure the resolved absolute path does not break out of the designated storage directory.

## FORENSIC METHODOLOGY
**Q: Why doesn't ForenSight provide a "Manipulation Probability" percentage?**
A: Providing a 0-100% "Fake Score" is mathematically indefensible for unstructured image forensics. A high ELA error indicates recompression, not necessarily malicious tampering (e.g., uploading an authentic photo to Twitter). ForenSight uses deterministic rule engines to produce a "Qualitative Assessment Level" (e.g., MODERATE concern) which indicates the need for further human investigation, preserving scientific rigor.

**Q: Why are ELA and JPEG/DCT grouped together during Evidence Fusion?**
A: Both ELA (Error Level Analysis) and DCT analyze quantization and compression artifacts. If an image is saved in a different software, both engines will flag anomalies. Grouping them into a single "Compression Artifacts" family prevents statistically double-counting a single processing event, which would artificially inflate the final assessment level.

## ASYNC SYSTEMS, CELERY & REDIS
**Q: What happens if a Celery worker crashes in the middle of an ELA analysis?**
A: The job state in the database remains 'RUNNING' or transitions to 'FAILED' if the worker exception is caught. In a production deployment, Celery's `acks_late=True` can be configured so the task is re-queued if the worker dies unexpectedly before acknowledging completion. ForenSight's API allows the frontend to surface the 'FAILED' state and provide the user with the safe error message.

## DATABASE, SQLALCHEMY & ALEMBIC
**Q: How did you handle schema changes during the transition from V1 to V2?**
A: Alembic was used to manage database migrations. When adding the `Job` and `AuditLog` tables for V2, Alembic auto-generated revision scripts comparing the SQLAlchemy Base metadata against the current SQLite/PostgreSQL schema, ensuring zero data loss during the migration.

## REACT & TYPESCRIPT
**Q: How does the React frontend know when a background forensic job is finished?**
A: The frontend utilizes an asynchronous polling mechanism. When an investigation is open, it periodically fetches the job states from the FastAPI `/api/jobs` endpoint. Once a job transitions from `RUNNING` to `COMPLETED`, the UI updates the evidence detail view and fetches the newly generated artifacts without requiring a full page refresh.

## DOCKER & DEPLOYMENT
**Q: Describe your containerization strategy for ForenSight.**
A: ForenSight uses Docker Compose to orchestrate multiple services: the FastAPI web container, the Celery worker container, the Redis broker, the PostgreSQL database, and the React/Vite frontend. This ensures absolute environment parity between local development and production, specifically isolating the heavy Python dependencies (OpenCV, NumPy) from the host machine.
