"""Verify audit chains and create or verify signed external checkpoints."""

import argparse
import base64
import hashlib
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.database import SessionLocal
from app.models.domain import AuditEvent
from app.services.audit import GENESIS_HASH, audit_event_hash
from app.services.case_export import _private_key_from_setting


def _canonical(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def verify_database_chain() -> dict:
    db = SessionLocal()
    heads = {}
    count = 0
    try:
        rows = db.query(AuditEvent).order_by(AuditEvent.case_id.asc(), AuditEvent.sequence_number.asc()).all()
        for event in rows:
            case_id = event.case_id
            expected_previous, expected_sequence = heads.get(case_id, (GENESIS_HASH, 0))
            if event.sequence_number != expected_sequence + 1:
                raise ValueError(f"Audit sequence gap for case {case_id}")
            if event.previous_hash != expected_previous:
                raise ValueError(f"Previous hash mismatch for case {case_id}, sequence {event.sequence_number}")
            actual_hash = audit_event_hash(event)
            if event.event_hash != actual_hash:
                raise ValueError(f"Event hash mismatch for case {case_id}, sequence {event.sequence_number}")
            heads[case_id] = (event.event_hash, event.sequence_number)
            count += 1
    finally:
        db.close()
    return {
        "event_count": count,
        "case_heads": [
            {"case_id": case_id, "sequence_number": sequence, "event_hash": digest}
            for case_id, (digest, sequence) in sorted(heads.items(), key=lambda item: str(item[0]))
        ],
    }


def create_checkpoint(destination: Path) -> None:
    chain = verify_database_chain()
    private_key = _private_key_from_setting()
    public_key = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    payload = {
        "format": "ForenSight Audit Checkpoint",
        "schema_version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "signer_public_key_base64": base64.b64encode(public_key).decode("ascii"),
        "signer_key_fingerprint_sha256": hashlib.sha256(public_key).hexdigest(),
        **chain,
    }
    checkpoint_bytes = _canonical(payload)
    destination.parent.mkdir(parents=True, exist_ok=True)
    signature_path = destination.with_suffix(destination.suffix + ".sig")
    checkpoint_temp = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
    signature_temp = signature_path.with_name(f".{signature_path.name}.{uuid.uuid4().hex}.tmp")
    try:
        checkpoint_temp.write_bytes(checkpoint_bytes)
        signature_temp.write_bytes(private_key.sign(checkpoint_bytes))
        os.chmod(checkpoint_temp, 0o600)
        os.chmod(signature_temp, 0o600)
        os.replace(signature_temp, signature_path)
        os.replace(checkpoint_temp, destination)
    finally:
        checkpoint_temp.unlink(missing_ok=True)
        signature_temp.unlink(missing_ok=True)


def verify_checkpoint(checkpoint_path: Path, trusted_fingerprint: str) -> dict:
    if not trusted_fingerprint:
        raise ValueError("A trusted public-key fingerprint is required")
    payload_bytes = checkpoint_path.read_bytes()
    payload = json.loads(payload_bytes.decode("utf-8"))
    if payload.get("format") != "ForenSight Audit Checkpoint" or payload.get("schema_version") != "1.0":
        raise ValueError("Unsupported audit checkpoint format")
    public_bytes = base64.b64decode(payload["signer_public_key_base64"], validate=True)
    fingerprint = hashlib.sha256(public_bytes).hexdigest()
    if fingerprint != payload.get("signer_key_fingerprint_sha256") or fingerprint.lower() != trusted_fingerprint.lower():
        raise ValueError("Checkpoint signer fingerprint does not match the trusted fingerprint")
    public_key = Ed25519PublicKey.from_public_bytes(public_bytes)
    signature = checkpoint_path.with_suffix(checkpoint_path.suffix + ".sig").read_bytes()
    try:
        public_key.verify(signature, payload_bytes)
    except InvalidSignature as exc:
        raise ValueError("Checkpoint signature is invalid") from exc
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("verify-chain", help="verify all event hashes and sequence links in the configured database")
    checkpoint = subparsers.add_parser("checkpoint", help="write a signed audit-head checkpoint")
    checkpoint.add_argument("output", type=Path)
    verify = subparsers.add_parser("verify-checkpoint", help="verify a signed checkpoint with an out-of-band fingerprint")
    verify.add_argument("checkpoint", type=Path)
    verify.add_argument("--trusted-fingerprint", required=True)
    args = parser.parse_args()
    try:
        if args.command == "verify-chain":
            result = verify_database_chain()
        elif args.command == "checkpoint":
            create_checkpoint(args.output)
            result = {"checkpoint": str(args.output), "signature": str(args.output.with_suffix(args.output.suffix + ".sig"))}
        else:
            result = verify_checkpoint(args.checkpoint, args.trusted_fingerprint)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(f"INVALID: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
