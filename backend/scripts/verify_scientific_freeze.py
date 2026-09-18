#!/usr/bin/env python
"""
ForenSight Scientific Change Detection Script (Phase 7U)

Computes cryptographic SHA-256 digests of all source files in `backend/app/forensics/`.
Verifies that no algorithms or files within the frozen forensic core have been silently
modified without an explicit, documented freeze override.

Usage:
  python scripts/verify_scientific_freeze.py
  python scripts/verify_scientific_freeze.py --update
"""

import os
import sys
import json
import hashlib
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
FORENSICS_DIR = BASE_DIR / "app" / "forensics"
MANIFEST_FILE = BASE_DIR / "scripts" / "forensics_freeze_manifest.json"

def calculate_file_hash(filepath: Path) -> str:
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(8192):
            sha256.update(chunk)
    return sha256.hexdigest()

def scan_forensics_directory() -> dict:
    manifest = {}
    for root, _, files in os.walk(FORENSICS_DIR):
        for file in sorted(files):
            if file.endswith(".py"):
                full_path = Path(root) / file
                rel_path = full_path.relative_to(BASE_DIR).as_posix()
                manifest[rel_path] = calculate_file_hash(full_path)
    return manifest

def main():
    update_mode = "--update" in sys.argv
    current_manifest = scan_forensics_directory()

    if update_mode:
        with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
            json.dump(current_manifest, f, indent=2, sort_keys=True)
        print(f"[SCIENTIFIC FREEZE] Updated freeze manifest for {len(current_manifest)} forensic files at {MANIFEST_FILE}")
        sys.exit(0)

    if not MANIFEST_FILE.exists():
        with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
            json.dump(current_manifest, f, indent=2, sort_keys=True)
        print(f"[SCIENTIFIC FREEZE] Initialized freeze manifest for {len(current_manifest)} forensic files.")
        sys.exit(0)

    with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
        committed_manifest = json.load(f)

    discrepancies = []
    
    # Check for modified or deleted files
    for path, expected_hash in committed_manifest.items():
        if path not in current_manifest:
            discrepancies.append(f"DELETED: {path}")
        elif current_manifest[path] != expected_hash:
            discrepancies.append(f"MODIFIED: {path} (Expected {expected_hash[:8]}..., Found {current_manifest[path][:8]}...)")

    # Check for newly added files
    for path in current_manifest:
        if path not in committed_manifest:
            discrepancies.append(f"ADDED: {path}")

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
