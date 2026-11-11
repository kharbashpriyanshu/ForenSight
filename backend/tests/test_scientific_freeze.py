"""
Regression Test Suite for Scientific Core Freeze Invariant & Cross-Platform Normalization
(Stage 3 WS1 Freeze Reconciliation & Hardening)
"""

import os
import json
import hashlib
import tempfile
from pathlib import Path
import pytest

from scripts.verify_scientific_freeze import (
    EXPECTED_PROTECTED_FILES,
    HEX_SHA256_PATTERN,
    normalize_and_hash_bytes,
    calculate_file_hash,
    load_manifest_with_duplicate_check,
    verify_freeze_integrity,
    scan_forensics_directory,
    MANIFEST_FILE,
)


class TestNewlineNormalization:
    """Verifies that CRLF and LF produce identical hashes without altering other bytes."""

    def test_lf_and_crlf_produce_identical_hashes(self):
        sample_code_lf = b"def calculate():\n    x = 1\n    return x + 2\n"
        sample_code_crlf = b"def calculate():\r\n    x = 1\r\n    return x + 2\r\n"

        hash_lf = normalize_and_hash_bytes(sample_code_lf)
        hash_crlf = normalize_and_hash_bytes(sample_code_crlf)

        assert hash_lf == hash_crlf, "SHA-256 digest must be invariant to CRLF vs LF line endings"
        # Confirm that the digest matches direct SHA-256 of the pure LF byte string
        assert hash_lf == hashlib.sha256(sample_code_lf).hexdigest()

    def test_mixed_newlines_normalize_consistently(self):
        sample_mixed = b"line1\r\nline2\nline3\r\nline4\n"
        sample_pure_lf = b"line1\nline2\nline3\nline4\n"

        hash_mixed = normalize_and_hash_bytes(sample_mixed)
        hash_pure = normalize_and_hash_bytes(sample_pure_lf)

        assert hash_mixed == hash_pure, "Mixed CRLF and LF must normalize to the exact same hash as pure LF"

    def test_non_newline_bytes_preserved_exactly(self):
        # Bytes with non-ASCII UTF-8, binary tokens, and quotes
        payload = "def test():\n    msg = 'Forensight — 🔬 Forensics'\n".encode('utf-8')
        payload_crlf = payload.replace(b"\n", b"\r\n")

        hash_lf = normalize_and_hash_bytes(payload)
        hash_crlf = normalize_and_hash_bytes(payload_crlf)

        assert hash_lf == hash_crlf
        # Verify normalization does not corrupt UTF-8 multi-byte sequences
        normalized_bytes = payload_crlf.replace(b"\r\n", b"\n")
        assert normalized_bytes == payload


class TestSourceModificationDetection:
    """Verifies that genuine algorithmic and code modifications remain strictly detectable."""

    def test_changed_character_alters_hash(self):
        code_v1 = b"multiplier = 20.0\n"
        code_v2 = b"multiplier = 25.0\n"

        assert normalize_and_hash_bytes(code_v1) != normalize_and_hash_bytes(code_v2)

    def test_added_removed_content_alters_hash(self):
        code_base = b"def analyze():\n    return True\n"
        code_extended = b"def analyze():\n    logger.info('run')\n    return True\n"

        assert normalize_and_hash_bytes(code_base) != normalize_and_hash_bytes(code_extended)

    def test_meaningful_whitespace_detected(self):
        # Meaningful indentation differences
        indent_4 = b"def fn():\n    return 1\n"
        indent_2 = b"def fn():\n  return 1\n"
        assert normalize_and_hash_bytes(indent_4) != normalize_and_hash_bytes(indent_2)

        # Trailing spaces are not stripped
        trailing_space = b"def fn():    \n    return 1\n"
        no_trailing = b"def fn():\n    return 1\n"
        assert normalize_and_hash_bytes(trailing_space) != normalize_and_hash_bytes(no_trailing)


class TestManifestIntegrity:
    """Verifies completeness, duplicate protection, and malformed hash detection."""

    @pytest.fixture
    def valid_manifest(self):
        return {file_path: "a" * 64 for file_path in EXPECTED_PROTECTED_FILES}

    def test_correct_manifest_passes(self, valid_manifest):
        discrepancies = verify_freeze_integrity(
            current_manifest=valid_manifest,
            committed_manifest=valid_manifest,
            expected_set=EXPECTED_PROTECTED_FILES,
        )
        assert len(discrepancies) == 0

    def test_missing_protected_entry_fails(self, valid_manifest):
        incomplete_manifest = dict(valid_manifest)
        removed_key = "app/forensics/ela/engine.py"
        del incomplete_manifest[removed_key]

        discrepancies = verify_freeze_integrity(
            current_manifest=valid_manifest,
            committed_manifest=incomplete_manifest,
            expected_set=EXPECTED_PROTECTED_FILES,
        )
        assert any("MANIFEST MISSING REQUIRED ENTRY" in d and removed_key in d for d in discrepancies)

    def test_unexpected_manifest_entry_fails(self, valid_manifest):
        bloated_manifest = dict(valid_manifest)
        bloated_manifest["app/forensics/unexpected/module.py"] = "b" * 64

        discrepancies = verify_freeze_integrity(
            current_manifest=valid_manifest,
            committed_manifest=bloated_manifest,
            expected_set=EXPECTED_PROTECTED_FILES,
        )
        assert any("MANIFEST UNEXPECTED ENTRY" in d for d in discrepancies)

    def test_missing_disk_file_fails(self, valid_manifest):
        missing_disk = dict(valid_manifest)
        del missing_disk["app/forensics/noise/engine.py"]

        discrepancies = verify_freeze_integrity(
            current_manifest=missing_disk,
            committed_manifest=valid_manifest,
            expected_set=EXPECTED_PROTECTED_FILES,
        )
        assert any("PROTECTED FILE MISSING ON DISK" in d and "noise/engine.py" in d for d in discrepancies)

    def test_malformed_hash_fails(self, valid_manifest):
        bad_hashes = [
            "short_hash",
            "g" * 64,  # 'g' is not hex
            "A" * 64,  # uppercase
            12345,
            "",
        ]
        for bad_h in bad_hashes:
            corrupted_manifest = dict(valid_manifest)
            corrupted_manifest["app/forensics/copy_move/engine.py"] = bad_h
            discrepancies = verify_freeze_integrity(
                current_manifest=valid_manifest,
                committed_manifest=corrupted_manifest,
                expected_set=EXPECTED_PROTECTED_FILES,
            )
            assert any("MALFORMED HASH" in d for d in discrepancies)

    def test_duplicate_manifest_paths_fails(self, tmp_path):
        duplicate_json = tmp_path / "dup_manifest.json"
        duplicate_json.write_text(
            '{\n  "app/forensics/ela/engine.py": "' + "a" * 64 + '",\n'
            '  "app/forensics/ela/engine.py": "' + "b" * 64 + '"\n}\n',
            encoding="utf-8"
        )
        with pytest.raises(ValueError, match="Duplicate path entry in manifest"):
            load_manifest_with_duplicate_check(duplicate_json)


class TestExistingFreezeInvariant:
    """Verifies that the repository's production manifest and files match 100%."""

    RECONCILED_EIGHT_FILES = {
        "app/forensics/copy_move/engine.py": "b87352ca9c4bb7a14b28ddfcbeb7bbe7efaa6d2b632862dd17619b017fb32ef2",
        "app/forensics/ela/analyzer.py": "29c625548e02f3f890fcf485cd40b60168b81dfbc1290bd86d12d566f3a79959",
        "app/forensics/ela/engine.py": "34b49d76076f648492f27c37f277cfada569986cb9eed8d1cb6de73877233baf",
        "app/forensics/ela/schemas.py": "19c8f6eefa3e5afe832d6600b5b7ec83e8d43c190e39595e6d4d9a7c15161f34",
        "app/forensics/jpeg_dct/engine.py": "282e2b6f97ecf0581b2f5fe04fff6f0a47be65a0a78037a95f768c593d4c09fe",
        "app/forensics/noise/analyzer.py": "a443bc13bdb98e9fdc49572870f2dbaed89754ca632accbf514ec813fcf1d8a9",
        "app/forensics/noise/engine.py": "5e96e55405cdb2641d9885c81154ee242966242bc21609c7a0fde7b8eacc2028",
        "app/forensics/noise/schemas.py": "f680e66ff38a732415a6f6bd7109f1687695c4b9d6b2499302b9e99eea2c1c5c",
    }

    def test_all_38_files_present_and_match(self):
        committed = load_manifest_with_duplicate_check(MANIFEST_FILE)
        current = scan_forensics_directory()

        assert len(committed) == 38, f"Expected 38 files in manifest, got {len(committed)}"
        assert len(current) == 38, f"Expected 38 files on disk, got {len(current)}"

        discrepancies = verify_freeze_integrity(current, committed, EXPECTED_PROTECTED_FILES)
        assert len(discrepancies) == 0, f"Expected zero discrepancies, got:\n" + "\n".join(discrepancies)

    def test_eight_reconciled_hashes_verified(self):
        committed = load_manifest_with_duplicate_check(MANIFEST_FILE)
        current = scan_forensics_directory()

        for path, expected_hash in self.RECONCILED_EIGHT_FILES.items():
            assert committed[path] == expected_hash, f"Manifest hash mismatch for reconciled {path}"
            assert current[path] == expected_hash, f"Current file hash mismatch for reconciled {path}"

    def test_thirty_unmodified_hashes_preserved(self):
        committed = load_manifest_with_duplicate_check(MANIFEST_FILE)
        current = scan_forensics_directory()

        unmodified_count = 0
        for path in EXPECTED_PROTECTED_FILES:
            if path in self.RECONCILED_EIGHT_FILES:
                continue
            assert committed[path] == current[path], f"Unmodified file {path} should match manifest"
            unmodified_count += 1

        assert unmodified_count == 30, f"Expected exactly 30 unmodified files, got {unmodified_count}"

    def test_unauthorized_modification_fails_verification(self):
        committed = load_manifest_with_duplicate_check(MANIFEST_FILE)
        current = scan_forensics_directory()

        # Simulate tampering with a file hash
        tampered_current = dict(current)
        tampered_current["app/forensics/copy_move/engine.py"] = "0" * 64

        discrepancies = verify_freeze_integrity(tampered_current, committed, EXPECTED_PROTECTED_FILES)
        assert len(discrepancies) == 1
        assert "MODIFIED: app/forensics/copy_move/engine.py" in discrepancies[0]
