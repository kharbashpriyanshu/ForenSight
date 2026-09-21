# ForenSight V2.2 — Evidence Observation Graph & Provenance Tree

## 1. Traceability Architecture

Forensic credibility requires complete chain-of-custody and algorithmic traceability. In ForenSight V2.2, investigative entities form a directed observation graph:

```
[ Case ]
   |
   +---> [ Evidence Asset ] (File SHA-256, original format, dimensions)
            |
            +---> [ Analysis Job ] (Queue time, Celery worker ID, job state)
                     |
                     +---> [ Analysis Run ] (Modality, execution status, timestamp)
                              |
                              +---> [ Low-Level Observation ] (Normalized metric, physical units)
                                       |
                                       +---> [ Correlated Finding ] (Deterministic Rule, Severity)
                                                |
                                                +---> [ Analyst Review / Note ]
                                                         |
                                                         +---> [ Report Artifact ]
```

---

## 2. Graph Node Types & Edge Semantics

The Observation Graph endpoint (`GET /api/cases/{case_id}/graph`) outputs standard node-link structures compatible with visualization engines:

### Node Categories
- **`case`**: Investigation root containing title, status, and lead investigator.
- **`evidence`**: Raw digital media assets stamped with cryptographic SHA-256 checksums.
- **`job`**: Execution unit detailing task scheduling and queue lifecycle.
- **`analysis`**: Specific analytical modality execution (e.g., ELA, JPEG DCT, Noise, Copy-Move, Metadata).
- **`observation`**: Extracted empirical measurement (e.g., error level variance, DCT block energy, noise SNR).
- **`finding`**: Synthesized correlation rule output with judicial severity grading.
- **`report`**: Cryptographically verifiable export package (PDF/JSON).

### Edge Relationships
- `CASE_CONTAINS_EVIDENCE`: Case ownership of digital asset.
- `EVIDENCE_SPAWNED_JOB`: Dispatch of background analysis job for asset.
- `JOB_PRODUCED_ANALYSIS`: Successful completion of modality execution.
- `ANALYSIS_EXTRACTED_OBSERVATION`: Generation of discrete empirical metric.
- `OBSERVATION_SUPPORTS_FINDING`: Contribution of empirical metric to a deterministic correlation rule.
- `FINDING_INCLUDED_IN_REPORT`: Incorporation of audited finding into professional forensic investigation report.

---

## 3. Hierarchical Provenance Tree

For quick chronological inspections, `GET /api/cases/{case_id}/provenance` aggregates the lifecycle into a structured tree:
- **Case Summary**: Root identification, creation timestamp, and assigned analyst.
- **Evidence Nodes**: Cryptographic hashes, container format, pixel geometry, and ingest timestamp.
- **Modality Runs**: Forensic engine versions, execution timestamps, execution parameters.
- **Correlated Findings**: Linked correlation rules, status, and reviewer decisions.
- **Analyst Commentary**: Real-time analyst notes attached at case, evidence, or finding levels.

---

## 4. Integrity & Anti-Tampering

All graph nodes and provenance leaves are derived from relational foreign key constraints in the ForenSight database. Deleting or modifying an observation independently breaks graph consistency and triggers audit alerts in the system integrity verification suite.
