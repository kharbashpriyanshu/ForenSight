# ADR-001: Cryptographic Scientific Core Freeze

## Status
Accepted

## Context
Digital forensics software utilized in criminal investigations and civil litigation is subjected to rigorous legal scrutiny under standards such as the Daubert Standard and ISO/IEC 27037 (Guidelines for identification, collection, acquisition, and preservation of digital evidence). 

A foundational requirement is that forensic analysis algorithms must operate deterministically and verifiably:
1. An investigator analyzing evidence at Time $T_1$ must obtain mathematically reproducible results when re-analyzing at Time $T_2$.
2. Silent algorithmic changes (e.g., unintended regressions introduced during dependency upgrades or bug fixes in unrelated application layers) can compromise evidentiary admissibility in court.

## Decision
We enforce a **Cryptographic Scientific Core Freeze** across all primary forensic analytical engines under `backend/app/forensics/` (38 Python source files):

1. **Manifest of Truth:** A canonical manifest (`backend/scripts/forensics_freeze_manifest.json`) records the SHA-256 digest of each protected forensic source file.
2. **Cross-Platform Normalization:** Line endings are normalized ($\text{CRLF} \to \text{LF}$) before hashing to ensure identical cryptographic digests regardless of operating system (Windows, Linux, macOS).
3. **CI/CD Gating:** The verification script (`verify_scientific_freeze.py`) executes as the first step of the CI pipeline. Any unauthorized discrepancy immediately terminates the build with an explicit failure notice.
4. **Deliberate Override:** Algorithmic modifications can only be accepted when accompanied by an intentional `--update` flag run by an authorized forensic maintainer, producing a reviewable git diff on the manifest itself.

## Consequences
- **Positive:** Guarantees court-admissible software determinism and tamper-evident algorithm integrity.
- **Positive:** Defends against accidental regression in core mathematical engines during general platform development.
- **Positive:** Provides investigators with cryptographic proof of analytical consistency.
- **Trade-off:** Legitimate defect fixes in frozen modules require an extra step (`python scripts/verify_scientific_freeze.py --update`) to commit updated digests.
