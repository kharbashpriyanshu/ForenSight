# Evidence Correlation & Explainable Assessment

## Overview
ForenSight approaches forensic evaluation holistically by acknowledging that multiple forensic modules often measure symptoms of the exact same underlying cause (e.g., JPEG compression). 
Sprint 7B implements a Deterministic Rules Engine to establish the **Relationships** between distinct evidence artifacts and to formulate an **Explainable Assessment**.

## Evidence Families
To prevent "double-counting" evidence, analytical modalities are grouped into contextual families:
- **Compression Family:** ELA, JPEG/DCT
- **Residual Family:** Noise
- **Spatial Correspondence Family:** Copy-Move
- **File Context Family:** Metadata

If a file triggers *both* an ELA anomaly and a DCT anomaly, it does not mean there are "two independent proofs of manipulation." It means there is one strong signature within the Compression Family. 

## Relationships
The Correlation Engine explicitly establishes relational nodes between normalized observations:
- **CONTEXTUAL:** e.g., Metadata software signature + elevated ELA. The software naturally explains the recompression.
- **INDEPENDENT:** e.g., Copy-Move geometric inliers vs Metadata. 

## Assessment Architecture
Instead of generating an unscientific "Manipulation Probability" (e.g., 87% Fake), the engine produces a Qualitative Assessment Level based on the diversity of Evidence Families:
- `INSUFFICIENT_EVIDENCE`
- `LOW_FORENSIC_CONCERN`
- `MODERATE_FORENSIC_CONCERN`
- `ELEVATED_FORENSIC_CONCERN`

An `ELEVATED` assessment generally requires active, anomalous observations across *multiple distinct* evidence families. A single family (e.g., just Compression) typically tops out at `MODERATE`, reflecting the scientific limitation that compression alone cannot prove malicious intent.

## Rule Versioning
Forensic heuristics evolve. The assessment engine tags every generated output with a `rule_version` (e.g., `7B-v1`). This guarantees long-term provenance and reproducibility.

## Scientific Limitations
Assessments represent the degree of *investigative follow-up* warranted. They do not independently prove authenticity or tampering. Machine learning classifiers and definitive "verdicts" are explicitly rejected by this architecture to maintain scientific rigor.
