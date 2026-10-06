"""Verify a .forensight bundle without extracting untrusted archive paths."""

import argparse
import base64
import hashlib
import json
import sys
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


def verify_bundle(bundle_path: str, trusted_fingerprint: str = "") -> dict:
    with ZipFile(bundle_path, "r") as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Archive contains duplicate member names")
        if "manifest.json" not in names or "manifest.sig" not in names:
            raise ValueError("Bundle is missing its signed manifest")

        manifest_bytes = archive.read("manifest.json")
        manifest = json.loads(manifest_bytes.decode("utf-8"))
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
            public_key.verify(archive.read("manifest.sig"), manifest_bytes)
        except InvalidSignature as exc:
            raise ValueError("Manifest signature is invalid") from exc

        declared = {entry["path"]: entry for entry in manifest.get("entries", [])}
        allowed = set(declared) | {"manifest.json", "manifest.sig"}
        if set(names) != allowed:
            raise ValueError("Archive members do not match the signed manifest")

        for member, entry in declared.items():
            path = PurePosixPath(member)
            if path.is_absolute() or ".." in path.parts or "\\" in member:
                raise ValueError(f"Unsafe archive member path: {member}")
            digest = hashlib.sha256()
            size = 0
            with archive.open(member, "r") as stream:
                while chunk := stream.read(1024 * 1024):
                    digest.update(chunk)
                    size += len(chunk)
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
