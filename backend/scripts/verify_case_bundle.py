"""Verify a .forensight bundle without extracting untrusted archive paths."""

import argparse
import base64
import hashlib
import json
import sys
import stat
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


MAX_TOTAL_UNCOMPRESSED_BYTES = 10 * 1024 * 1024 * 1024
MAX_MANIFEST_BYTES = 10 * 1024 * 1024


def _read_limited(archive: ZipFile, member: str, limit: int) -> bytes:
    chunks = []
    size = 0
    with archive.open(member, "r") as stream:
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                raise ValueError(f"Archive member exceeds its size limit: {member}")
            chunks.append(chunk)
    return b"".join(chunks)


def verify_bundle(bundle_path: str, trusted_fingerprint: str = "") -> dict:
    with ZipFile(bundle_path, "r") as archive:
        infos = archive.infolist()
        if len(infos) > 50_000:
            raise ValueError("Archive contains too many members")
        if sum(info.file_size for info in infos) > MAX_TOTAL_UNCOMPRESSED_BYTES:
            raise ValueError("Archive exceeds the 10 GiB uncompressed-size limit")
        names = [info.filename for info in infos]
        if len(names) != len(set(names)):
            raise ValueError("Archive contains duplicate member names")
        by_name = {info.filename: info for info in infos}
        if any(info.is_dir() for info in infos):
            raise ValueError("Explicit directory entries are not allowed")
        if "manifest.json" not in names or "manifest.sig" not in names:
            raise ValueError("Bundle is missing its signed manifest")
        if by_name["manifest.json"].file_size > MAX_MANIFEST_BYTES:
            raise ValueError("Bundle manifest exceeds 10 MiB")

        manifest_bytes = _read_limited(archive, "manifest.json", MAX_MANIFEST_BYTES)
        manifest = json.loads(manifest_bytes.decode("utf-8"))
        if not isinstance(manifest, dict):
            raise ValueError("Bundle manifest must be a JSON object")
        if manifest.get("format") != "ForenSight Case Bundle" or manifest.get("signature_algorithm") != "Ed25519":
            raise ValueError("Unsupported bundle format or signature algorithm")

        public_bytes = base64.b64decode(manifest["signer_public_key_base64"], validate=True)
        fingerprint = hashlib.sha256(public_bytes).hexdigest()
        if fingerprint != manifest.get("signer_key_fingerprint_sha256"):
            raise ValueError("Signer public-key fingerprint does not match the manifest")
        if trusted_fingerprint and fingerprint.lower() != trusted_fingerprint.lower():
            raise ValueError("Signer fingerprint does not match the trusted fingerprint supplied")

        public_key = Ed25519PublicKey.from_public_bytes(public_bytes)
        try:
            signature = _read_limited(archive, "manifest.sig", 1024)
            public_key.verify(signature, manifest_bytes)
        except InvalidSignature as exc:
            raise ValueError("Manifest signature is invalid") from exc

        entry_list = manifest.get("entries", [])
        if not isinstance(entry_list, list) or len(entry_list) > 50_000:
            raise ValueError("Manifest entry list is invalid or too large")
        if any(not isinstance(entry, dict) or not isinstance(entry.get("path"), str) for entry in entry_list):
            raise ValueError("Manifest contains a malformed file entry")
        declared = {entry["path"]: entry for entry in entry_list}
        if len(declared) != len(entry_list):
            raise ValueError("Manifest contains duplicate entry paths")
        allowed = set(declared) | {"manifest.json", "manifest.sig"}
        if set(names) != allowed:
            raise ValueError("Archive members do not match the signed manifest")

        actual_total = len(manifest_bytes) + by_name["manifest.sig"].file_size
        for member, entry in declared.items():
            path = PurePosixPath(member)
            if path.is_absolute() or ".." in path.parts or "\\" in member:
                raise ValueError(f"Unsafe archive member path: {member}")
            if member not in by_name:
                raise ValueError(f"Manifest member is missing from archive: {member}")
            mode = (by_name[member].external_attr >> 16) & 0xFFFF
            file_type = stat.S_IFMT(mode)
            if file_type == stat.S_IFLNK or (file_type and file_type not in {stat.S_IFREG, stat.S_IFDIR}):
                raise ValueError(f"Non-regular archive member is not allowed: {member}")
            if not isinstance(entry.get("size"), int) or entry["size"] < 0 or not isinstance(entry.get("sha256"), str):
                raise ValueError(f"Invalid size or digest for {member}")
            digest = hashlib.sha256()
            size = 0
            with archive.open(member, "r") as stream:
                while chunk := stream.read(1024 * 1024):
                    digest.update(chunk)
                    size += len(chunk)
                    actual_total += len(chunk)
                    if size > entry["size"] or actual_total > MAX_TOTAL_UNCOMPRESSED_BYTES:
                        raise ValueError("Archive exceeds a declared member or total uncompressed-size limit")
            if size != entry.get("size") or digest.hexdigest() != entry.get("sha256"):
                raise ValueError(f"Content checksum failed for {member}")

    return {
        "case_identifier": manifest.get("case_identifier"),
        "entry_count": len(declared),
        "signer_fingerprint": fingerprint,
        "signer_trusted": bool(trusted_fingerprint),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", help="Path to a .forensight bundle")
    parser.add_argument("--trusted-fingerprint", default="", help="Expected SHA-256 fingerprint of the exporter's Ed25519 public key")
    args = parser.parse_args()
    try:
        result = verify_bundle(args.bundle, args.trusted_fingerprint)
    except (OSError, BadZipFile, KeyError, ValueError, json.JSONDecodeError) as exc:
        print(f"INVALID: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({"signature_valid": True, **result}, indent=2))
    if not result["signer_trusted"]:
        print("Signer identity is unverified; compare the fingerprint through a trusted channel.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
