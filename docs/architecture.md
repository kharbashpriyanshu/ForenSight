# ForenSight Architecture

## System Architecture

ForenSight follows a modern decoupled architecture, separating the client-side presentation from the server-side processing and analysis engine.

1. **Frontend**: A Single Page Application (SPA) built with React, TypeScript, and Vite.
2. **Backend**: A RESTful API built with Python and FastAPI.

## Backend/Frontend Separation

The system maintains a strict separation of concerns:
- **Frontend** handles the user interface, case management views, interactive evidence visualization (heatmaps, zooming), and report presentation.
- **Backend** is strictly responsible for data processing, database interactions, classical DIP algorithms, and machine learning inference.

They communicate exclusively via a defined REST API over HTTP.

## Database Architecture

ForenSight utilizes SQLAlchemy ORM with a SQLite backend (for development).
The schema is designed for future PostgreSQL migration.

- **InvestigationCase**: Represents a primary investigation. Stores a unique identifier (`FS-CASE-XXX`), title, and status.
- **Evidence**: Represents a piece of digital media. Stores a unique identifier (`FS-EVD-XXX`), original filename, physical storage path, MIME type, dimensions, format, and the SHA-256 hash. Linked to an `InvestigationCase` via a foreign key.

## Future Forensic Pipeline

The architecture is designed to support the following data flow in future sprints:

1. **Image Upload**: Initial ingestion of digital media.
2. **Evidence Validation**: Basic checks for file integrity and format.
5. **Classical DIP Forensic Analysis**: Execution of ELA, Noise Analysis, JPEG/DCT, Copy-Move detection.
6. **Evidence Fusion**: Aggregation of individual analysis scores.
7. **Forensic Assessment**: Final confidence calculation.
10. **Visualization & Report Generation**: Creating human-readable outputs.

## Module Responsibilities

### Backend Modules
- `app/api`: FastAPI route handlers and controllers.
- `app/core`: Configuration, security, and application-wide settings.
- `app/schemas`: Pydantic models for data validation and serialization.
- `app/models`: Database ORM models (future).
- `app/services`: Business logic and external integrations.
- `app/forensics`: Classical Digital Image Processing algorithms.
- `app/ml`: Machine learning models and inference logic.

### Frontend Modules
- `src/components`: Reusable UI components (buttons, cards, layout).
- `src/pages`: Top-level route views (Dashboard, Case Management).
- `src/features`: Domain-specific components (e.g., ImageUploader, ForensicHeatmap).
- `src/services`: API client and data fetching logic.
- `src/hooks`: Custom React hooks for state and side effects.
- `src/types`: TypeScript interfaces and type definitions.

## Major Architectural Decisions

- **Python for Backend**: Chosen for its unparalleled ecosystem in Data Science, Digital Image Processing (OpenCV, scikit-image), and Machine Learning (PyTorch).
- **FastAPI**: Provides high performance, automatic OpenAPI documentation, and native async support for long-running forensic tasks.
- **React + Vite**: Delivers a fast, modern developer experience and a highly responsive client application capable of handling complex visual data.
- **Sprint 0 Principle**: Establishing a clean, modular foundation without prematurely implementing "mock" forensic capabilities.
