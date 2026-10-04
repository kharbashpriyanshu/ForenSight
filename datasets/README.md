# ForenSight Dataset & Scientific Benchmarking Repository

Welcome to the ForenSight scientific evaluation and benchmark dataset architecture.

ForenSight adheres to strict reproducible evaluation standards. This directory tree hosts dataset manifests, schemas, acquisition protocols, and generated controlled fixtures.

---

## 1. Directory Structure

```text
datasets/
├── README.md                      # This document (Architecture & Policy)
├── manifests/                     # JSON manifests describing image collections & ground truth
│   ├── controlled_v1_manifest.json
│   ├── casia_template.json
│   ├── columbia_template.json
│   └── nist_openmfc_template.json
├── controlled/                    # Deterministic synthetic & controlled laboratory fixtures
│   └── (generated via python -m app.benchmark generate)
├── external/                      # External dataset symlinks or local imports
│   ├── casia/                     # CASIA v1 / v2 import location
│   ├── columbia/                  # Columbia Uncompressed Image Splicing dataset
│   └── nist_openmfc/              # NIST OpenMFC evaluation collection
└── benchmark/                     # Evaluation output artifacts & run summaries
    ├── benchmark_results.json
    ├── benchmark_report.html
    └── benchmark_report.md
```

---

## 2. Policy on External / Copyrighted Datasets

> [!IMPORTANT]
> **No Large Binary Datasets in Git**: To preserve repository performance and respect institutional licenses, ForenSight does NOT commit large public or third-party datasets directly into the Git repository.

Instead, ForenSight provides:
1. **Standardized Manifest Formats** ([`DATASET_MANIFEST.md`](../docs/DATASET_MANIFEST.md)).
2. **Deterministic Controlled Fixture Generators** ([`CONTROLLED_DATASET.md`](../docs/CONTROLLED_DATASET.md)).
3. **Pluggable Dataset Adapters** that read locally mounted dataset folders and validate their checksums against known manifest entries.

---

## 3. Supported External Datasets

### A. CASIA Image Tampering Detection Dataset (v1.0 & v2.0)
- **Origin**: Institute of Automation, Chinese Academy of Sciences (CASIA).
- **Format**: JPEG & uncompressed TIFF. Splicing and copy-move manipulations with crop boundaries.
- **Acquisition**: Request access from CASIA Research Lab. Place extracted files under `datasets/external/casia/`.
- **Manifest Template**: See [`datasets/manifests/casia_template.json`](./manifests/casia_template.json).

### B. Columbia Uncompressed Image Splicing Dataset
- **Origin**: Columbia University ADVENT Lab (Hsu and Chang, 2006).
- **Format**: 4CSF format, uncompressed TIFF bitmap pairs (authentic vs. spliced) captured with calibrated Canon and Nikon cameras.
- **Acquisition**: Download from Columbia ADVENT Group archives. Place under `datasets/external/columbia/`.
- **Manifest Template**: See [`datasets/manifests/columbia_template.json`](./manifests/columbia_template.json).

### C. NIST OpenMFC / MFC (Media Forensics Challenge)
- **Origin**: National Institute of Standards and Technology (NIST).
- **Format**: Multi-camera RAW, JPEG, PNG evaluation corpora with spatial masks and provenance graphs.
- **Acquisition**: Available to participants of NIST MFC evaluation cycles. Place under `datasets/external/nist_openmfc/`.
- **Manifest Template**: See [`datasets/manifests/nist_openmfc_template.json`](./manifests/nist_openmfc_template.json).

---

## 4. Controlled Dataset Generation

To generate the standard ForenSight Controlled Evaluation Suite:
```bash
python -m app.benchmark generate --output datasets/controlled/v1 --seed 42
```
This produces bit-for-bit reproducible controlled variants (Compression, Resampling, Noise, Splicing, Copy-Move, and False-Positive textures) accompanied by pixel-accurate binary masks and transformation metadata.
