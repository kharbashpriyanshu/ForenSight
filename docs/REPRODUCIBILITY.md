# ForenSight V2.2 — Forensic Reproducibility & Investigation Replay

## 1. Principles of Forensic Reproducibility

Forensic conclusions are legally admissible only when independent third-party analysts can verify or reconstruct the investigative trajectory from primary evidence to final report.

In ForenSight V2.2, reproducibility is guaranteed by three pillars:
1. **Source Evidence Immutability**: The primary digital asset is cryptographically fingerprinted (SHA-256) at ingest and remains untouched throughout execution.
2. **Investigation Replay Service**: Automated replay verification compares historical database assertions against current disk files and analytical rules.
3. **Machine-Readable Manifests**: Complete, deterministic metadata structures map the exact state of an investigation.

---

## 2. Investigation Replay Workflow

The replay workflow can be invoked via `POST /api/cases/{case_id}/replay-verify` or programmatically via `InvestigationReplayService.verify_case_integrity`:

```
+-----------------------------------------------------------+
|                   Case Replay Verification                |
+-----------------------------------------------------------+
                              |
       +----------------------+----------------------+
       |                                             |
       v                                             v
[ Database Evidence Record ]                [ Physical Evidence File ]
- Expected SHA-256                          - Current On-Disk Path
- Dimensions, Format                        - Calculate Actual SHA-256
       |                                             |
       +----------------------+----------------------+
                              |
                              v
                 [ Cryptographic Comparison ]
                 Expected Hash == Actual Hash?
                              |
              +---------------+---------------+
              |                               |
              v (MATCH)                       v (MISMATCH)
       [ Status: VERIFIED ]        [ Status: INTEGRITY_VIOLATION ]
              |                               |
              +---------------+---------------+
                              |
                              v
              [ Immutable Audit Trail Record ]
              - Event: CASE_REPLAY_VERIFIED
              - Verifier Username
              - Pass/Fail Status & Evidence Count
```

---

## 3. Forensic Validation Manifest Schema

Every case export includes a deterministic, machine-readable manifest (`GET /api/cases/{case_id}/manifest`):

```json
{
  "case_id": "FS-CASE-ALPHA",
  "case_title": "Primary Investigation",
  "evidence": [
    {
      "evidence_id": "FS-EV-98B2",
      "sha256": "15612a05ccdd5c1df1cb98a922a06dc7eebfba3a9bf0bfb994fd39db1c35a0d8",
      "mime_type": "image/jpeg",
      "size": 2074
    }
  ],
  "analyses": [
    {
      "analysis_id": "FS-AN-102",
      "type": "METADATA",
      "job_id": "FS-JOB-501",
      "status": "completed"
    }
  ],
  "correlations": [
    {
      "rule_id": "CORR-META-001",
      "version": "1.0"
    }
  ],
  "findings": [
    {
      "finding_id": "FS-FND-881",
      "rule_id": "CORR-META-001",
      "status": "CONFIRMED_BY_ANALYST",
      "severity": "SUSPICIOUS",
      "decision": "CONFIRMED"
    }
  ],
  "reports": [
    {
      "report_id": "FS-RPT-770",
      "generated_at": "2026-09-18T00:30:00Z",
      "format": "PDF"
    }
  ]
}
```

---

## 4. Bit-Level Tampering Detection

To validate that the replay service detects tampering:
1. An evidence asset was registered and analyzed.
2. A single byte in the stored file on disk was flipped.
3. Replay verification was executed.
4. The system returned `overall_status: "INTEGRITY_VIOLATION"`, flagged `hash_matched: false`, and logged the violation in the audit trail.
