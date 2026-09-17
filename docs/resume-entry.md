# Resume Entry

**ForenSight — Explainable Digital Image Forensic Investigation Platform**
*Python, FastAPI, React, TypeScript, Celery, Redis, PostgreSQL, OpenCV*

- Designed and implemented an explainable digital image forensic platform that orchestrates heavy computer vision workloads (Copy-Move, ELA) via a Redis/Celery asynchronous queue, preventing API thread blocking.
- Enforced strict evidence provenance by cryptographically fingerprinting uploads with SHA-256 and isolating storage via UUIDs, securing the chain of custody.
- Architected a deterministic Evidence Fusion rule engine that evaluates multi-modality signals into explainable qualitative assessments, actively avoiding mathematically indefensible machine-learning black boxes.
- Secured the platform via JWT-based authentication and route-level Role-Based Access Control (RBAC), preventing directory traversal and enforcing strict cross-tenant case isolation.
- Built a responsive React/TypeScript investigation dashboard that asynchronously polls job states and visualizes complex forensic data without blocking the user workspace.
