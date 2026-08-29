# Sprint 7A Development Log: Evidence Normalization & Fusion Foundation

## 1. Architecture
We established the Evidence Normalization & Fusion Foundation to bridge the gap between mathematically heterogeneous analysis modules (ELA, DCT, Noise, Copy-Move, Metadata) and a future correlation system. 

## 2. Data Model
Added `EvidenceObservation` to `app/models/domain.py`. This flat schema absorbs multi-dimensional analytical vectors into a standard structure featuring `raw_value`, `normalized_value`, `direction`, and `technical_reliability`.

## 3. Modality Adapters
Implemented the Adapter Pattern in `app/forensics/fusion/adapters/`.
- `metadata.py`: Extracts exact software signatures or notes their explicit absence.
- `ela.py`: Extracts raw mean absolute error. Declines arbitrary normalization mapping.
- `noise.py`: Extracts raw global mean residual.
- `jpeg_dct.py`: Extracts high-frequency coefficient suppression.
- `copy_move.py`: Extracts inliers. Generates an inlier ratio where mathematically justified.

## 4. Normalization Rules
Normalization is heavily restricted. Only values with mathematical ceilings (like match ratios) are converted to `[0,1]`. Arbitrary thresholds are forbidden to maintain scientific integrity.

## 5. Provenance
Every inserted `EvidenceObservation` inherently points to `analysis_id`. This creates a perfect audit trail from the frontend dashboard back to the originating mathematical engine.

## 6. Technical Reliability
Each adapter assigns a reliability metric to the measurement itself. ELA and DCT are inherently "MEDIUM" because they are subject to extreme variance based on natural image geometry. Metadata software parsing is "HIGH" because it is a deterministic byte search.

## 7. API and Missing Modalities
Created `POST /api/evidence/{evidence_id}/fusion/normalize`. 
The `EvidenceSet` tracks `modalities_missing`. We do not conflate "module not executed" with "image is genuine." 

## 8. Idempotency
The normalizer explicitly drops existing `EvidenceObservation` rows mapped to the `evidence_id` before inserting a fresh set. This ensures repeatable, deterministic states during re-analysis.

## 9. Testing and Limitations
Tests successfully injected synthetic `Analysis` JSON columns and proved the adapters cleanly parsed them. 
A critical limitation/feature: The system produces *no risk scores*. The dashboard explicitly renders "Multiple forensic observations were recorded and are available for contextual correlation. These normalized facts represent measurements, not probabilistic verdicts."

## 10. Design Decisions
We rejected creating 5 different observation tables. By normalizing to a canonical `EvidenceObservation`, the future correlation layer can dynamically query across modalities efficiently.
