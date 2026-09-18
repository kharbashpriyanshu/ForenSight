# ForenSight V2.2 — Evidence Integrity & Chain of Custody

## 1. Chain of Custody Invariant

In digital forensics, evidence integrity must be verifiable from the instant of ingest through archival storage. ForenSight adheres to the **Federal Rules of Evidence Rule 901(b)(9)** for electronic process authenticity:

$$\text{Hash}_{\text{Upload}} = \text{Hash}_{\text{Storage}} = \text{Hash}_{\text{Post-Analysis}} = \text{Hash}_{\text{Report}}$$

---

## 2. Evidence Lifecycle & Hash Verification

```
[ Ingest (Upload) ]
  |
  +---> 1. Stream file bytes; compute SHA-256 in memory.
  |
  +---> 2. Verify image decodability (Pillow load check).
  |
  +---> 3. Generate secure UUID filename; commit to storage directory.
  |
  +---> 4. Commit DB Evidence record (SHA-256, original filename, dimensions).
  |
  +---> 5. Immutable Audit Event: EVIDENCE_UPLOADED.

[ Execution Pipeline ]
  |
  +---> 1. Worker opens evidence in READ-ONLY mode.
  |
  +---> 2. Derived artifacts (heatmaps, extracted EXIF, residual maps) 
  |        are written to isolated storage/artifacts/ or storage/reports/.
  |
  +---> 3. Source file bytes are NEVER modified in place.

[ Case Replay Verification ]
  |
  +---> 1. Read on-disk evidence bytes.
  |
  +---> 2. Recalculate SHA-256.
  |
  +---> 3. Compare with DB record. Any delta triggers INTEGRITY_VIOLATION.
```

---

## 3. Storage Security & Defensive Invariants

1. **Randomized Filenames**: Files are saved on disk as `{uuid4}.{ext}`, preventing arbitrary file overwrite and nullifying path injection through upload filenames.
2. **Read-Only Engine Access**: All analytical engines accept filepaths and load imagery in read-only memory buffers. No engine writes back to the input path.
3. **Artifact Isolation**: Heatmaps and derived visual representations are partitioned into separate artifact directories (`storage/artifacts/`).
4. **Relational Foreign Key Constraints**: All database records (analyses, jobs, findings, notes) reference parent evidence IDs and case IDs with foreign keys. Automated tests verify zero orphaned records.
