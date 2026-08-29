# Sprint 7B Development Log: Evidence Correlation & Explainable Assessment

## 1. Architecture
We introduced a deterministic Rules Engine sitting above the Normalization layer. It evaluates `EvidenceObservation` instances and generates `EvidenceRelation` and `EvidenceAssessment` records.

## 2. Database Design
Added two new models to `domain.py`:
- `EvidenceRelation`: Links two observations with a relationship type (e.g., CONTEXTUAL) and an explanation.
- `EvidenceAssessment`: A top-level summary providing a qualitative level (e.g., ELEVATED_FORENSIC_CONCERN) and serializing the contributing observations and relations as JSON for fast frontend retrieval.

## 3. Correlation Rules
`app/forensics/fusion/correlation/rules.py` implements specific logic connecting modalities. Notably, it links ELA and DCT into a Contextual relationship because both stem from JPEG compression artifacts, preventing the system from falsely amplifying the threat level.

## 4. Assessment Engine
`app/forensics/fusion/assessment/rules.py` implements the Evidence Family strategy. It tracks the "diversity" of anomalies. 
- 0 families = LOW/INSUFFICIENT
- 1 family = MODERATE (or LOW if it's just metadata)
- 2+ distinct families = ELEVATED.
This deterministic approach ensures the system is entirely explainable and never acts as a black box.

## 5. API & Idempotency
Created `POST /api/evidence/{evidence_id}/fusion/correlate`. Similar to 7A, it safely deletes existing relations and assessments for that evidence before inserting the newly computed results. 

## 6. Frontend
Added the Correlation panel to the React Dashboard. It prominently displays the Evidence Families detected, the relational links between modalities, and the Final Qualitative Assessment Level. It strictly avoids any probabilistic "Fake Score" visualization and explicitly lists scientific limitations.

## 7. Testing
Verified through deterministic synthetic JSON fixtures that ELA and DCT are correctly classified as a single family and do not independently trigger an `ELEVATED` assessment. Validated the Idempotency workflow. All tests pass.
