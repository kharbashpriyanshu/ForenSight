# ForenSight V2.1 - Recruiter Talking Points

## 30-Second Elevator Pitch
"ForenSight is an explainable digital image forensic investigation platform. Instead of treating image forensics as a single classifier, it preserves the original evidence, fingerprints it with SHA-256, executes multiple independent forensic analyses, normalizes their measurements, correlates them through deterministic rules, and produces an auditable qualitative assessment."

## 60-Second Technical Overview
"ForenSight is built on a production-ready engineering architecture designed for investigative environments. It utilizes a FastAPI backend and a React/TypeScript frontend. To prevent blocking the main API thread during heavy computer vision tasks—like SIFT-based Copy-Move detection—it offloads analysis workloads asynchronously to Celery workers via a Redis broker. The system enforces strict Role-Based Access Control and case isolation using JWTs, ensuring that evidence is immutably tracked from ingestion to final reporting."

## 2-Minute Architecture Deep Dive
"The architecture of ForenSight is structured to guarantee both performance and scientific integrity. At the ingestion layer, uploaded evidence is immediately fingerprinted with a SHA-256 hash and stored using UUIDs to prevent directory traversal and cross-tenant leakage. The API Gateway (FastAPI) manages state and authorization, delegating heavy workloads like Error Level Analysis (ELA) and DCT quantization extraction to distributed Celery workers. Rather than feeding this data into a black-box machine learning model that spits out an indefensible 'fake percentage', ForenSight uses deterministic rule engines (like Rule 7B-v1). This engine correlates the asynchronous observations—for example, treating ELA and DCT anomalies as a single compression family rather than double-counting them—to generate a qualitative assessment that can be explained in a court of law. Everything is persisted via SQLAlchemy in PostgreSQL, with full database migration support through Alembic."

## Engineering Decisions & Trade-offs

### Architecture & Security
**Why SQLite locally?**
SQLite is used for local development because it provides a zero-configuration, lightweight relational database that requires no external daemon, making the project instantly runnable for developers and reviewers without installing a database server.

**Why PostgreSQL for production?**
PostgreSQL provides concurrent write capability, JSONB data types (which we use for structured findings), robust transactional integrity, and better scaling for multiple simultaneous forensic investigation jobs.

**Security Explanation**
The platform implements strict Role-Based Access Control (RBAC) via JWTs. Evidence storage is isolated using UUIDs to prevent path traversal, and route-level dependencies ensure that users cannot access cases or evidence belonging to other tenants.

### Asynchronous Architecture
**Why Celery?**
Forensic operations (like running SIFT over a 24MP image) are CPU-bound and take several seconds. Running them synchronously would block the FastAPI event loop, causing API timeouts and unresponsive frontends. Celery distributes these tasks to background workers.

**Why Redis?**
Redis acts as a high-performance, in-memory message broker and result backend for Celery, ensuring jobs are durably queued and states can be rapidly polled by the frontend.

### Forensic Methodology & Science
**Forensic methodology explanation**
ForenSight operates on the principle of *explainable deterministic observation*. It measures specific physical or mathematical properties of an image (compression, noise, geometry) and provides context, rather than jumping to a binary "fake/real" conclusion.

**Fusion explanation**
The Evidence Fusion engine groups individual observations into logical "Families" (e.g., Compression, Geometry, Noise). This prevents double-counting anomalies (e.g., ELA and DCT are both compression-based) and generates a defensible Qualitative Assessment Level (e.g., MODERATE concern).

**Why SIFT & RANSAC?**
SIFT (Scale-Invariant Feature Transform) identifies robust keypoints in an image that survive rotation and scaling. RANSAC (Random Sample Consensus) mathematically filters these keypoints to find a geometrically consistent affine transformation, which is necessary to definitively prove that a region was copied and pasted (cloned) elsewhere in the same image.

**Why DCT?**
Discrete Cosine Transform (DCT) analysis extracts the specific 8x8 quantization tables used to compress a JPEG. Since different software (Photoshop vs. an iPhone camera) uses different standard tables, DCT provides a forensic signature of the image's processing history.

**Why ELA?**
Error Level Analysis (ELA) measures the difference between an image and a re-compressed version of itself. Areas that have been recently spliced or edited will often show higher error rates (recompression artifacts) compared to the background.

**Why not machine learning or a fake/real classifier?**
Generating an arbitrary 0-100% "Fake Score" using black-box machine learning is mathematically indefensible in a legal context because it cannot be deterministically explained. ML models often flag authentic images as "fake" simply because they were re-saved or have unusual noise profiles. ForenSight strictly avoids pseudo-science, providing transparent measurements and qualitative concern levels instead.
