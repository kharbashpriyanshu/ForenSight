# ForenSight V4 — Dataset Cryptographic Integrity & Snapshot Architecture

## 1. Overview
Evaluating forensic algorithms against external datasets requires strict cryptographic provenance to ensure that evaluation data is authentic, uncorrupted, and bit-for-bit reproducible over time.

---

## 2. Path Traversal & File Safety
All dataset adapters and evaluation runners enforce safe path resolution via `validate_safe_relative_path`:
- Path components with parent directory tokens (`..`) are strictly rejected.
- Absolute path injections (leading `/` or Windows drive specifiers) are rejected.
- Paths are resolved against `os.path.realpath(dataset_root)`; any target pointing outside this root raises an immediate `ValueError`.

---

## 3. Cryptographic Snapshots (`dataset_snapshot.json`)
Before executing a benchmark on an external dataset, the dataset is registered and snapshotted:
```json
{
  "snapshot_id": "c1f7a012-...",
  "dataset_id": "casia2",
  "dataset_version": "2.0.0",
  "created_at_utc": "2026-09-22T12:00:00Z",
  "total_images": 7491,
  "total_masks": 5123,
  "file_hashes": {
    "authentic/Au_ani_00001.jpg": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "tampered/Tp_D_CND_M_N_ani00018_sec00096_00130.tif": "4a5f..."
  },
  "duplicate_hashes": []
}
```

### Snapshot Creation (`create_dataset_snapshot`)
Iterates through all images and ground-truth masks declared in the manifest, checks on-disk presence, computes individual SHA-256 hashes, detects duplicated hashes, and writes the snapshot.

### Snapshot Verification (`verify_dataset_snapshot`)
Re-reads the snapshot file and verifies all listed files against the current on-disk filesystem:
- Confirms all files are present.
- Recalculates SHA-256 hashes to guarantee no bit rot, transcoding, or modification has occurred.
- Reports status: `VALID` or `INVALID` with precise discrepancy lists.

---

## 4. Pre-Execution Validation
During benchmark runs (`run_external_benchmark`), each image's SHA-256 is verified prior to engine execution. If a hash mismatch is detected, the image is quarantined and marked with an integrity failure rather than being evaluated.
