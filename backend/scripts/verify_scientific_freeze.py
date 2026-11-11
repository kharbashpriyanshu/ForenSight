#!/usr/bin/env python
"""
ForenSight Scientific Change Detection Script (Phase 7U / Stage 3 WS1)

Computes cryptographic SHA-256 digests of all source files in `backend/app/forensics/`.
Verifies that no algorithms or files within the frozen forensic core have been silently
modified without an explicit, documented freeze override.

Cross-Platform Normalization:
  Normalizes CRLF (\\r\\n) line endings to LF (\\n) prior to computing SHA-256 digests.
  This ensures identical hash values across Windows, Linux, and macOS checkouts
  without altering any other bytes or ignoring whitespace changes.

Usage:
  python scripts/verify_scientific_freeze.py
  python scripts/verify_scientific_freeze.py --update
"""

import os
import sys
import json
import re
import hashlib
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
FORENSICS_DIR = BASE_DIR / "app" / "forensics"
MANIFEST_FILE = BASE_DIR / "scripts" / "forensics_freeze_manifest.json"

HEX_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")

# Deliberate, reviewable canonical source of truth for the protected forensic core (38 files)
EXPECTED_PROTECTED_FILES = frozenset([
    "app/forensics/copy_move/__init__.py",
    "app/forensics/copy_move/analyzer.py",
    "app/forensics/copy_move/engine.py",
    "app/forensics/copy_move/exceptions.py",
    "app/forensics/copy_move/schemas.py",
    "app/forensics/ela/__init__.py",
    "app/forensics/ela/analyzer.py",
    "app/forensics/ela/engine.py",
    "app/forensics/ela/exceptions.py",
    "app/forensics/ela/schemas.py",
    "app/forensics/fusion/adapters/__init__.py",
    "app/forensics/fusion/adapters/base.py",
    "app/forensics/fusion/adapters/copy_move.py",
    "app/forensics/fusion/adapters/ela.py",
    "app/forensics/fusion/adapters/jpeg_dct.py",
    "app/forensics/fusion/adapters/metadata.py",
    "app/forensics/fusion/adapters/noise.py",
    "app/forensics/fusion/assessment/engine.py",
    "app/forensics/fusion/assessment/rules.py",
    "app/forensics/fusion/correlation/engine.py",
    "app/forensics/fusion/correlation/rules.py",
    "app/forensics/fusion/normalizer.py",
    "app/forensics/fusion/schemas.py",
    "app/forensics/jpeg_dct/__init__.py",
    "app/forensics/jpeg_dct/analyzer.py",
    "app/forensics/jpeg_dct/engine.py",
    "app/forensics/jpeg_dct/exceptions.py",
    "app/forensics/jpeg_dct/jpeg_parser.py",
    "app/forensics/jpeg_dct/schemas.py",
    "app/forensics/metadata/__init__.py",
    "app/forensics/metadata/analyzer.py",
    "app/forensics/metadata/extractor.py",
    "app/forensics/metadata/schemas.py",
    "app/forensics/noise/__init__.py",
    "app/forensics/noise/analyzer.py",
    "app/forensics/noise/engine.py",
    "app/forensics/noise/exceptions.py",
    "app/forensics/noise/schemas.py",
])


def normalize_and_hash_bytes(raw_bytes: bytes) -> str:
    """Normalizes CRLF (\\r\\n) to LF (\\n) and computes SHA-256 digest."""
    normalized = raw_bytes.replace(b"\r\n", b"\n")
    return hashlib.sha256(normalized).hexdigest()


def calculate_file_hash(filepath: Path) -> str:
    """Reads file bytes, normalizes line endings to LF, and returns SHA-256 hex digest."""
    with open(filepath, "rb") as f:
        raw = f.read()
    return normalize_and_hash_bytes(raw)


def load_manifest_with_duplicate_check(manifest_path: Path) -> dict:
    """Loads manifest JSON while strictly detecting duplicate keys."""
    def check_duplicates(pairs):
        seen = set()
        result = {}
        for key, val in pairs:
            if key in seen:
                raise ValueError(f"Duplicate path entry in manifest: '{key}'")
            seen.add(key)
            result[key] = val
        return result

    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f, object_pairs_hook=check_duplicates)


def scan_forensics_directory() -> dict:
    """Scans `app/forensics/` for all `.py` files and computes normalized SHA-256 hashes."""
    manifest = {}
    for root, _, files in os.walk(FORENSICS_DIR):
        for file in sorted(files):
            if file.endswith(".py"):
                full_path = Path(root) / file
                rel_path = full_path.relative_to(BASE_DIR).as_posix()
                manifest[rel_path] = calculate_file_hash(full_path)
    return manifest


def verify_freeze_integrity(
    current_manifest: dict,
    committed_manifest: dict,
    expected_set: frozenset = EXPECTED_PROTECTED_FILES
) -> list:
    """Performs exhaustive integrity and completeness checks on the forensic freeze."""
    discrepancies = []

    # 1. Manifest completeness against expected canonical set
    manifest_keys = set(committed_manifest.keys())
    for missing_expected in sorted(expected_set - manifest_keys):
        discrepancies.append(f"MANIFEST MISSING REQUIRED ENTRY: {missing_expected} is in EXPECTED_PROTECTED_FILES but absent from manifest")
    for unexpected_entry in sorted(manifest_keys - expected_set):
        discrepancies.append(f"MANIFEST UNEXPECTED ENTRY: {unexpected_entry} is in manifest but not in EXPECTED_PROTECTED_FILES")

    # 2. Disk scan completeness against expected canonical set
    disk_keys = set(current_manifest.keys())
    for missing_disk in sorted(expected_set - disk_keys):
        discrepancies.append(f"PROTECTED FILE MISSING ON DISK: {missing_disk} is expected but does not exist on disk")
    for unexpected_disk in sorted(disk_keys - expected_set):
        discrepancies.append(f"UNTRACKED PROTECTED FILE ON DISK: {unexpected_disk} exists in app/forensics/ but is not in EXPECTED_PROTECTED_FILES")

    # 3. Hash format validation
    for path, h in committed_manifest.items():
        if not isinstance(h, str) or not HEX_SHA256_PATTERN.match(h):
            discrepancies.append(f"MALFORMED HASH: Manifest entry for '{path}' has invalid SHA-256 format: {h!r}")

    # 4. Content Hash Verification
    for path, expected_hash in committed_manifest.items():
        if path in current_manifest:
            if current_manifest[path] != expected_hash:
                discrepancies.append(f"MODIFIED: {path} (Expected {str(expected_hash)[:8]}..., Found {str(current_manifest[path])[:8]}...)")

    return discrepancies


def main():
    update_mode = "--update" in sys.argv
    current_manifest = scan_forensics_directory()

    if update_mode:
        # Validate that current scanned files match expected set before writing
        scanned_keys = set(current_manifest.keys())
        if scanned_keys != EXPECTED_PROTECTED_FILES:
            missing = EXPECTED_PROTECTED_FILES - scanned_keys
            extra = scanned_keys - EXPECTED_PROTECTED_FILES
            print("[SCIENTIFIC FREEZE ERROR] Cannot update manifest: disk files do not match EXPECTED_PROTECTED_FILES.")
            if missing:
                print(f"  Missing files: {sorted(missing)}")
            if extra:
                print(f"  Extra files: {sorted(extra)}")
            sys.exit(1)

        with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
            json.dump(current_manifest, f, indent=2, sort_keys=True)
            f.write("\n")
        print(f"[SCIENTIFIC FREEZE] Updated freeze manifest for {len(current_manifest)} forensic files at {MANIFEST_FILE}")
        sys.exit(0)

    if not MANIFEST_FILE.exists():
        print(f"[SCIENTIFIC FREEZE ERROR] Manifest file not found: {MANIFEST_FILE}")
        sys.exit(1)

    try:
        committed_manifest = load_manifest_with_duplicate_check(MANIFEST_FILE)
    except ValueError as e:
        print(f"[SCIENTIFIC FREEZE VIOLATION] Manifest JSON integrity error: {e}")
        sys.exit(1)

    discrepancies = verify_freeze_integrity(current_manifest, committed_manifest, EXPECTED_PROTECTED_FILES)

    if discrepancies:
        print("[SCIENTIFIC FREEZE VIOLATION] Unauthorized modification of frozen forensic core!")
        for disc in discrepancies:
            print(f"  - {disc}")
        print("\nForensic algorithms under backend/app/forensics/ are FROZEN.")
        print("To update the manifest following an approved defect fix, run with --update.")
        sys.exit(1)

    print(f"[SCIENTIFIC FREEZE VERIFIED] All {len(current_manifest)} forensic source files match frozen integrity manifest.")
    sys.exit(0)


if __name__ == "__main__":
    main()
