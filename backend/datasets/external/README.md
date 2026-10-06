# External validation datasets

Dataset binaries are intentionally not checked into this repository. Obtain each dataset directly from its publisher under the applicable access terms, record the terms and rights review, and keep the acquisition package and any access approval in the lab's controlled storage.

Start from `manifest.template.json`, create a dataset-specific `manifest.json`, and add one image record per image. Use the publisher's original split and annotation files where available. Record a split policy that keeps related images, source devices, and manipulation families together; do not randomly split near-duplicates across development and held-out cohorts. The manifest and every referenced bitstream are included in the registration snapshot.

Register and verify from `backend/`:

```bash
python -m app.benchmark register-dataset --dataset-dir datasets/external/<dataset-id>
python -m app.benchmark verify-dataset --dataset-dir datasets/external/<dataset-id>
python -m app.benchmark run-external --dataset-dir datasets/external/<dataset-id> --output datasets/benchmark/external/<dataset-id>
python -m app.benchmark reproduce --run-dir datasets/benchmark/external/<dataset-id>
```

External registration now rejects missing provenance, per-image source-license labels, empty manifests, duplicate image IDs, and invalid SHA-256 values. Presence checks do not determine whether a license or rights review is legally sufficient; the lab must review publisher terms before acquisition, use, or redistribution. Never put restricted images or access credentials in Git.

No licensed external dataset is bundled here, so this repository makes no external-dataset accuracy claim. Record completed runs and limitations in the generated reports; do not describe a pending protocol as empirical validation.
