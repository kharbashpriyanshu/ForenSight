"""Verify and import a signed case bundle as a new locally owned case."""

import argparse
import hashlib
import json
import os
import shutil
import stat
import sys
import uuid
from datetime import datetime
from pathlib import Path, PurePosixPath
from zipfile import BadZipFile, ZipFile

from sqlalchemy import DateTime as SqlDateTime, text, func

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.db.database import SessionLocal
from app.models.domain import (
    AnalystNote, Analysis, AnalysisJob, AuditEvent, CaseIntakeContext, Evidence,
    EvidenceAssessment, EvidenceIntakeContext, EvidenceLineageRelation,
    EvidenceObservation, EvidenceRelation, Finding, InvestigationCase, Report, User,
)
from app.services.audit import GENESIS_HASH, AuditService
from verify_case_bundle import verify_bundle


MAX_ENTRIES = 50_000
MAX_CASE_JSON_BYTES = 100 * 1024 * 1024
DEFAULT_MAX_UNCOMPRESSED_BYTES = 10 * 1024 * 1024 * 1024


def _safe_member(member: str) -> PurePosixPath:
    path = PurePosixPath(member)
    if path.is_absolute() or ".." in path.parts or "\\" in member or ":" in member:
        raise ValueError(f"Unsafe archive member path: {member}")
    if not path.parts or any(part in {"", "."} for part in path.parts):
        raise ValueError(f"Invalid archive member path: {member}")
    return path


def _preflight(bundle_path: Path, max_uncompressed_bytes: int) -> None:
    with ZipFile(bundle_path, "r") as archive:
        infos = archive.infolist()
        if len(infos) > MAX_ENTRIES:
            raise ValueError(f"Bundle has too many entries (limit {MAX_ENTRIES})")
        names = [info.filename for info in infos]
        if len(names) != len(set(names)):
            raise ValueError("Archive contains duplicate member names")
        total = 0
        for info in infos:
            path = _safe_member(info.filename)
            if info.is_dir():
                raise ValueError("Explicit directory entries are not allowed")
            mode = (info.external_attr >> 16) & 0xFFFF
            file_type = stat.S_IFMT(mode)
            if file_type == stat.S_IFLNK or (file_type and file_type != stat.S_IFREG):
                raise ValueError(f"Non-regular archive entry is not allowed: {info.filename}")
            total += info.file_size
            if total > max_uncompressed_bytes:
                raise ValueError("Bundle exceeds the configured uncompressed-size limit")
            if info.filename == "manifest.json" and info.file_size > 10 * 1024 * 1024:
                raise ValueError("Bundle manifest exceeds 10 MiB")
            if info.filename == "case.json" and info.file_size > MAX_CASE_JSON_BYTES:
                raise ValueError("Bundle case data exceeds 100 MiB")
            if info.file_size > 10 * 1024 * 1024 and info.compress_size and info.file_size / info.compress_size > 10_000:
                raise ValueError(f"Suspicious compression ratio for {info.filename}")
            if info.filename not in {"manifest.json", "manifest.sig", "case.json"} and not info.filename.startswith(("evidence/", "artifacts/", "reports/")):
                raise ValueError(f"Unsupported bundle member: {info.filename}")
            if info.filename.startswith(("evidence/", "artifacts/", "reports/")) and len(path.parts) < 2:
                raise ValueError(f"Invalid bundle member path: {info.filename}")


def _parse_datetime(value):
    if not value or isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
        except ValueError:
            return value
    return value


def _values_for(model, raw: dict, excluded=(), overrides=None) -> dict:
    overrides = overrides or {}
    result = {}
    for column in model.__table__.columns:
        name = column.name
        if name == "id" or name in excluded:
            continue
        if name in overrides:
            result[name] = overrides[name]
        elif name in raw:
            value = raw[name]
            if isinstance(column.type, SqlDateTime):
                value = _parse_datetime(value)
            result[name] = value
    result.update(overrides)
    return result


def _add_row(db, model, raw, excluded=(), overrides=None):
    row = model(**_values_for(model, raw, excluded, overrides))
    db.add(row)
    db.flush()
    return row


def _map_id(mapping: dict, value):
    if value is None:
        return None
    key = str(value)
    if key not in mapping:
        raise ValueError(f"Bundle contains a dangling local reference: {value}")
    return mapping[key]


def _validate_case_data(case_data: object) -> dict:
    if not isinstance(case_data, dict):
        raise ValueError("Bundle case data must be a JSON object")
    list_fields = (
        "evidence", "evidence_intake_contexts", "analyses", "analysis_jobs", "observations",
        "evidence_relations", "assessments", "findings", "analyst_notes", "lineage_relations",
        "audit_events", "reports", "artifact_archive_map", "report_archive_map",
    )
    for field in list_fields:
        value = case_data.get(field, [])
        if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
            raise ValueError(f"Bundle field '{field}' must be a list of JSON objects")
    for field in ("case", "case_intake_context"):
        value = case_data.get(field)
        if value is not None and not isinstance(value, dict):
            raise ValueError(f"Bundle field '{field}' must be a JSON object")
    return case_data


def _remap_id_list(values, mapping: dict, label: str):
    if values is None:
        return None
    if not isinstance(values, list):
        raise ValueError(f"Invalid {label} reference list")
    return [_map_id(mapping, value) for value in values]


def _remap_contributors(values, mapping: dict, label: str):
    if values is None:
        return None
    if not isinstance(values, list):
        raise ValueError(f"Invalid {label} contributor list")
    result = []
    for item in values:
        if not isinstance(item, dict) or item.get("id") is None:
            result.append(item)
            continue
        copied = dict(item)
        copied["id"] = _map_id(mapping, copied["id"])
        result.append(copied)
    return result


def _verify_source_audit_chain(events: list[dict]) -> list[dict]:
    by_case = {}
    for row in events:
        case_id = row.get("case_id")
        by_case.setdefault(case_id, []).append(row)
    for case_id, rows in by_case.items():
        rows.sort(key=lambda row: (
            row.get("sequence_number") if isinstance(row.get("sequence_number"), int) else 0,
            row.get("id") if isinstance(row.get("id"), int) else 0,
        ))
        chain_fields = ("sequence_number", "previous_hash", "event_hash")
        chain_presence = [all(row.get(field) is not None for field in chain_fields) for row in rows]
        if not any(chain_presence):
            for row in rows:
                row["_source_chain_status"] = "NOT_PRESENT_IN_SOURCE_BUNDLE"
            continue
        if not all(chain_presence):
            raise ValueError(f"Source audit chain is only partially present for {case_id}")
        previous = GENESIS_HASH
        expected_sequence = 1
        for row in rows:
            sequence = row.get("sequence_number")
            if sequence != expected_sequence or row.get("previous_hash") != previous:
                raise ValueError(f"Source audit chain sequence/link failed for {case_id}")
            timestamp = row.get("timestamp") or ""
            payload = {
                "id": row.get("id"),
                "case_id": case_id,
                "evidence_id": row.get("evidence_id"),
                "event_type": row.get("event_type"),
                "timestamp": timestamp,
                "actor": row.get("actor"),
                "safe_metadata": row.get("safe_metadata"),
                "sequence_number": sequence,
                "previous_hash": previous,
            }
            digest = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")).hexdigest()
            if digest != row.get("event_hash"):
                raise ValueError(f"Source audit event hash failed for {case_id}, sequence {sequence}")
            row["_source_chain_status"] = "VERIFIED"
            previous = digest
            expected_sequence += 1
    return sorted(events, key=lambda row: (row.get("timestamp") or "", str(row.get("case_id")), row.get("sequence_number", 0)))


def _replace_bundle_members(value, artifact_paths: dict):
    if isinstance(value, dict):
        return {key: _replace_bundle_members(item, artifact_paths) for key, item in value.items()}
    if isinstance(value, list):
        return [_replace_bundle_members(item, artifact_paths) for item in value]
    if isinstance(value, str) and value in artifact_paths:
        return artifact_paths[value]
    return value


def _extract_verified_members(archive: ZipFile, entries: list[dict], staging: Path) -> dict:
    member_entries = {entry["path"]: entry for entry in entries}
    extracted = {}
    for member in member_entries:
        if member == "case.json":
            continue
        path = _safe_member(member)
        destination = staging.joinpath(*path.parts)
        resolved = destination.resolve()
        resolved.relative_to(staging.resolve())
        parent = staging
        for part in path.parts[:-1]:
            parent = parent / part
            parent.mkdir(mode=0o700, exist_ok=True)
            os.chmod(parent, 0o700)
        digest = hashlib.sha256()
        size = 0
        with archive.open(member, "r") as source, destination.open("xb") as target:
            while chunk := source.read(1024 * 1024):
                size += len(chunk)
                if size > member_entries[member].get("size", -1):
                    raise ValueError(f"Entry exceeds its signed size: {member}")
                target.write(chunk)
                digest.update(chunk)
        os.chmod(destination, 0o600)
        declared = member_entries[member]
        if size != declared.get("size") or digest.hexdigest() != declared.get("sha256"):
            raise ValueError(f"Checksum failed while staging {member}")
        extracted[member] = destination
    return extracted


def import_bundle(bundle_path: Path, trusted_fingerprint: str, owner_username: str, max_uncompressed_bytes: int = DEFAULT_MAX_UNCOMPRESSED_BYTES) -> dict:
    _preflight(bundle_path, max_uncompressed_bytes)
    verification = verify_bundle(str(bundle_path), trusted_fingerprint)
    storage_root = Path(settings.STORAGE_DIR).resolve()
    import_root = storage_root / "imported"
    import_root.mkdir(parents=True, exist_ok=True)
    staging = import_root / f".staging-{uuid.uuid4().hex}"
    staging.mkdir(mode=0o700)
    final_root = None
    db = SessionLocal()
    try:
        with ZipFile(bundle_path, "r") as archive:
            manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
            case_chunks = []
            case_size = 0
            with archive.open("case.json", "r") as case_stream:
                while chunk := case_stream.read(1024 * 1024):
                    case_size += len(chunk)
                    if case_size > MAX_CASE_JSON_BYTES:
                        raise ValueError("Bundle case data exceeds 100 MiB")
                    case_chunks.append(chunk)
            case_bytes = b"".join(case_chunks)
            case_data = _validate_case_data(json.loads(case_bytes.decode("utf-8")))
            if case_data.get("schema_version") != "1.0":
                raise ValueError("Unsupported case data schema")
            extracted = _extract_verified_members(archive, manifest.get("entries", []), staging)

        owner = db.query(User).filter(User.username == owner_username).first()
        if not owner:
            raise ValueError(f"Destination user does not exist: {owner_username}")
        source_case = case_data.get("case")
        if not isinstance(source_case, dict):
            raise ValueError("Bundle is missing its case record")
        source_case_identifier = str(source_case.get("case_identifier") or verification.get("case_identifier") or "unknown")
        if verification.get("case_identifier") != source_case_identifier:
            raise ValueError("Manifest and case record identify different source cases")

        new_case = _add_row(
            db, InvestigationCase, source_case,
            excluded=("case_identifier",),
            overrides={"user_id": owner.id, "title": f"Imported: {source_case.get('title') or source_case_identifier}"},
        )
        case_id = new_case.id
        new_case_identifier = new_case.case_identifier
        final_root = import_root / new_case_identifier
        if final_root.exists():
            raise ValueError("Generated import directory already exists")

        id_maps = {name: {} for name in ("evidence", "analysis", "observation", "relation", "finding", "report", "note")}
        identifier_maps = {}
        evidence_records = case_data.get("evidence", [])
        for raw in evidence_records:
            member = raw.get("export_member") or raw.get("stored_path")
            if not isinstance(member, str) or member not in extracted or not member.startswith("evidence/"):
                raise ValueError(f"Evidence bitstream is absent from the signed bundle: {raw.get('evidence_identifier')}")
            source_digest = raw.get("sha256_hash")
            entry_digest = next((entry.get("sha256") for entry in manifest.get("entries", []) if entry.get("path") == member), None)
            if source_digest and source_digest.lower() != (entry_digest or "").lower():
                raise ValueError(f"Evidence hash does not match its signed archive entry: {raw.get('evidence_identifier')}")
            destination = staging / member
            raw_member = PurePosixPath(member)
            final_evidence_path = final_root.joinpath(*raw_member.parts)
            new_row = _add_row(db, Evidence, raw, excluded=("evidence_identifier",), overrides={"case_id": case_id, "stored_path": str(final_evidence_path)})
            id_maps["evidence"][str(raw.get("id"))] = new_row.id
            identifier_maps[str(raw.get("evidence_identifier"))] = new_row.evidence_identifier
        case_context = case_data.get("case_intake_context")
        if case_context:
            _add_row(db, CaseIntakeContext, case_context, excluded=("id",), overrides={"case_id": case_id})

        for raw in case_data.get("evidence_intake_contexts", []):
            new_row = _add_row(db, EvidenceIntakeContext, raw, overrides={"evidence_id": _map_id(id_maps["evidence"], raw.get("evidence_id"))})

        analysis_member_map = {}
        archive_artifact_map = case_data.get("artifact_archive_map", [])
        for item in archive_artifact_map:
            member = item.get("bundle_member")
            if member in extracted:
                analysis_member_map[member] = f"imported/{new_case_identifier}/{member}"
        artifact_paths = dict(analysis_member_map)

        analysis_records = case_data.get("analyses", [])
        for raw in analysis_records:
            overrides = {"evidence_id": _map_id(id_maps["evidence"], raw.get("evidence_id"))}
            overrides["structured_findings"] = _replace_bundle_members(raw.get("structured_findings"), artifact_paths)
            new_row = _add_row(db, Analysis, raw, excluded=("analysis_identifier",), overrides=overrides)
            id_maps["analysis"][str(raw.get("id"))] = new_row.id
            identifier_maps[str(raw.get("analysis_identifier"))] = new_row.analysis_identifier

        for raw in case_data.get("analysis_jobs", []):
            prior_status = str(raw.get("status") or "").upper()
            status_value = prior_status if prior_status in {"COMPLETED", "FAILED"} else "FAILED"
            source_request = str(raw.get("request_hash") or raw.get("job_identifier") or uuid.uuid4().hex)
            request_hash = hashlib.sha256(f"import:{new_case_identifier}:{source_request}:{raw.get('id')}".encode()).hexdigest()
            overrides = {
                "evidence_id": _map_id(id_maps["evidence"], raw.get("evidence_id")),
                "analysis_id": _map_id(id_maps["analysis"], raw.get("analysis_id")) if raw.get("analysis_id") is not None else None,
                "request_hash": request_hash,
                "status": status_value,
            }
            if status_value == "FAILED" and prior_status not in {"COMPLETED", "FAILED"}:
                overrides.update({"safe_error_message": "Imported historical job; it is a record only and will not be resumed.", "error_code": "IMPORTED_SNAPSHOT", "progress_message": "Imported historical job snapshot"})
            _add_row(db, AnalysisJob, raw, excluded=("job_identifier",), overrides=overrides)

        observation_records = case_data.get("observations", [])
        for raw in observation_records:
            new_row = _add_row(db, EvidenceObservation, raw, overrides={"evidence_id": _map_id(id_maps["evidence"], raw.get("evidence_id")), "analysis_id": _map_id(id_maps["analysis"], raw.get("analysis_id")) if raw.get("analysis_id") is not None else None})
            id_maps["observation"][str(raw.get("id"))] = new_row.id
        for raw in case_data.get("evidence_relations", []):
            new_row = _add_row(db, EvidenceRelation, raw, overrides={
                "evidence_id": _map_id(id_maps["evidence"], raw.get("evidence_id")),
                "observation_a_id": _map_id(id_maps["observation"], raw.get("observation_a_id")),
                "observation_b_id": _map_id(id_maps["observation"], raw.get("observation_b_id")),
            })
            id_maps["relation"][str(raw.get("id"))] = new_row.id
        for raw in case_data.get("assessments", []):
            _add_row(db, EvidenceAssessment, raw, overrides={
                "evidence_id": _map_id(id_maps["evidence"], raw.get("evidence_id")),
                "contributing_observations": _remap_contributors(raw.get("contributing_observations"), id_maps["observation"], "observation"),
                "contributing_relations": _remap_contributors(raw.get("contributing_relations"), id_maps["relation"], "relation"),
            })

        for raw in case_data.get("findings", []):
            overrides = {
                "case_id": new_case_identifier,
                "evidence_id": _map_id(id_maps["evidence"], raw.get("evidence_id")) if raw.get("evidence_id") is not None else None,
                "supporting_observations": _remap_id_list(raw.get("supporting_observations"), id_maps["observation"], "supporting_observations"),
                "supporting_analysis_ids": _remap_id_list(raw.get("supporting_analysis_ids"), id_maps["analysis"], "supporting_analysis_ids"),
            }
            new_row = _add_row(db, Finding, raw, excluded=("finding_identifier",), overrides={
                **overrides,
            })
            id_maps["finding"][str(raw.get("id"))] = new_row.id
            identifier_maps[str(raw.get("finding_identifier"))] = new_row.finding_identifier

        for raw in case_data.get("analyst_notes", []):
            source_target = str(raw.get("target_id") or "")
            target_id = identifier_maps.get(source_target, source_target)
            target_kind = str(raw.get("target_type") or "").upper()
            kind_map = {"EVIDENCE": "evidence", "ANALYSIS": "analysis", "FINDING": "finding"}.get(target_kind)
            if kind_map and source_target in id_maps[kind_map]:
                target_id = str(id_maps[kind_map][source_target])
            elif target_kind == "CASE" and source_target in {str(source_case.get("id")), source_case_identifier}:
                target_id = new_case_identifier
            new_row = _add_row(db, AnalystNote, raw, excluded=("note_identifier",), overrides={"case_id": new_case_identifier, "target_id": target_id})
            id_maps["note"][str(raw.get("id"))] = new_row.id
            identifier_maps[str(raw.get("note_identifier"))] = new_row.note_identifier

        for raw in case_data.get("lineage_relations", []):
            _add_row(db, EvidenceLineageRelation, raw, overrides={
                "case_id": case_id,
                "evidence_a_id": _map_id(id_maps["evidence"], raw.get("evidence_a_id")),
                "evidence_b_id": _map_id(id_maps["evidence"], raw.get("evidence_b_id")),
                "parent_evidence_id": _map_id(id_maps["evidence"], raw.get("parent_evidence_id")) if raw.get("parent_evidence_id") is not None else None,
            })

        report_members = {item.get("report_identifier"): item.get("bundle_member") for item in case_data.get("report_archive_map", [])}
        for raw in case_data.get("reports", []):
            member = report_members.get(raw.get("report_identifier"))
            artifact_path = str(final_root / member) if member in extracted else None
            report_identifier = f"FS-IMP-RPT-{uuid.uuid4().hex[:12].upper()}"
            new_row = _add_row(db, Report, raw, excluded=("report_identifier",), overrides={"case_id": new_case_identifier, "report_identifier": report_identifier, "artifact_path": artifact_path})
            id_maps["report"][str(raw.get("id"))] = new_row.id
            identifier_maps[str(raw.get("report_identifier"))] = new_row.report_identifier

        # Revalidate each source chain, then retain its hashes as metadata while
        # constructing a new valid chain under this station's generated case ID.
        source_events = _verify_source_audit_chain(case_data.get("audit_events", []))
        previous_hash = GENESIS_HASH
        imported_event_count = 0
        if db.get_bind().dialect.name == "postgresql":
            next_event_id = None
        else:
            next_event_id = int(db.query(func.max(AuditEvent.id)).scalar() or 0) + 1
        for source_event in source_events:
            source_metadata = source_event.get("safe_metadata")
            try:
                source_metadata = json.loads(source_metadata) if source_metadata else None
            except (TypeError, json.JSONDecodeError):
                pass
            imported_metadata = {
                "source_case_identifier": source_event.get("case_id"),
                "source_sequence_number": source_event.get("sequence_number"),
                "source_event_hash": source_event.get("event_hash"),
                "source_previous_hash": source_event.get("previous_hash"),
                "source_event_type": source_event.get("event_type"),
                "source_actor": source_event.get("actor"),
                "source_metadata": source_metadata,
                "source_chain_status": source_event.get("_source_chain_status", "NOT_PRESENT_IN_SOURCE_BUNDLE"),
            }
            if next_event_id is None:
                event_id = db.execute(text("SELECT nextval(pg_get_serial_sequence('audit_events', 'id'))")).scalar_one()
            else:
                event_id = next_event_id
                next_event_id += 1
            event = AuditEvent(
                id=event_id,
                case_id=new_case_identifier,
                evidence_id=_map_id(id_maps["evidence"], source_event.get("evidence_id")) if source_event.get("evidence_id") is not None else None,
                event_type="IMPORTED_HISTORY",
                timestamp=_parse_datetime(source_event.get("timestamp")),
                actor=source_event.get("actor"),
                safe_metadata=json.dumps(imported_metadata, sort_keys=True, separators=(",", ":"), ensure_ascii=False),
                sequence_number=imported_event_count + 1,
                previous_hash=previous_hash,
                event_hash="",
            )
            from app.services.audit import audit_event_hash
            event.event_hash = audit_event_hash(event)
            previous_hash = event.event_hash
            db.add(event)
            imported_event_count += 1
        db.flush()

        final_root.parent.mkdir(parents=True, exist_ok=True)
        os.replace(staging, final_root)
        AuditService.log_event(
            db, new_case_identifier, "CASE_BUNDLE_IMPORTED", actor=owner.username,
            metadata={"source_case_identifier": source_case_identifier, "source_signer_fingerprint": verification["signer_fingerprint"], "imported_evidence_count": len(evidence_records)},
        )
        return {
            "imported": True,
            "case_identifier": new_case_identifier,
            "source_case_identifier": source_case_identifier,
            "owner_username": owner.username,
            "evidence_count": len(evidence_records),
            "analysis_count": len(analysis_records),
            "signer_fingerprint": verification["signer_fingerprint"],
        }
    except Exception:
        db.rollback()
        if final_root and final_root.exists():
            shutil.rmtree(final_root, ignore_errors=True)
        raise
    finally:
        db.close()
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--trusted-fingerprint", required=True, help="Trusted SHA-256 fingerprint for the exporter's Ed25519 public key")
    parser.add_argument("--owner-username", required=True, help="Existing local user who will own the newly imported case")
    parser.add_argument("--max-uncompressed-bytes", type=int, default=DEFAULT_MAX_UNCOMPRESSED_BYTES)
    args = parser.parse_args()
    try:
        if args.max_uncompressed_bytes <= 0:
            raise ValueError("--max-uncompressed-bytes must be positive")
        result = import_bundle(args.bundle, args.trusted_fingerprint, args.owner_username, args.max_uncompressed_bytes)
    except (OSError, BadZipFile, KeyError, ValueError, json.JSONDecodeError) as exc:
        print(f"IMPORT FAILED: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
