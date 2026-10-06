"""Create a portable, checksummed and Ed25519-signed case archive."""

import base64
import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Dict, Iterable, List, Tuple
from zipfile import ZIP_DEFLATED, ZipFile

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import (
    AnalystNote,
    Analysis,
    AnalysisJob,
    AuditEvent,
    Evidence,
    EvidenceAssessment,
    EvidenceIntakeContext,
    EvidenceLineageRelation,
    EvidenceObservation,
    EvidenceRelation,
    Finding,
    InvestigationCase,
    Report,
)


class SigningKeyUnavailable(RuntimeError):
    pass


def _json_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _row_data(row: Any) -> Dict[str, Any]:
    return {column.name: _json_value(getattr(row, column.name)) for column in row.__table__.columns}


def _canonical_json(payload: Dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _private_key_from_setting() -> Ed25519PrivateKey:
    configured = settings.CASE_EXPORT_SIGNING_PRIVATE_KEY.strip()
    if not configured:
        raise SigningKeyUnavailable("Case export signing is not configured")
    if configured.startswith("-----BEGIN"):
        key = serialization.load_pem_private_key(configured.encode("utf-8"), password=None)
        if not isinstance(key, Ed25519PrivateKey):
            raise SigningKeyUnavailable("Case export signing key must be Ed25519")
        return key
    try:
        raw = base64.b64decode(configured, validate=True)
        return Ed25519PrivateKey.from_private_bytes(raw)
    except Exception as exc:
        raise SigningKeyUnavailable("Case export signing key must be a base64-encoded 32-byte Ed25519 private key") from exc


def _artifact_paths(value: Any) -> Iterable[Tuple[str, str]]:
    if isinstance(value, dict):
        for key, item in value.items():
            if str(key).lower() in {"artifacts", "artifact"} and isinstance(item, dict):
                for artifact_id, path in item.items():
                    if isinstance(path, str):
                        yield str(artifact_id), path
            else:
                yield from _artifact_paths(item)
    elif isinstance(value, list):
        for item in value:
            yield from _artifact_paths(item)


class CaseExportService:
    @staticmethod
    def create_bundle(db: Session, case: InvestigationCase) -> Tuple[str, Dict[str, Any]]:
        private_key = _private_key_from_setting()
        storage_root = Path(settings.STORAGE_DIR).resolve()
        artifact_root = storage_root.parent
        export_dir = storage_root / "exports"
        export_dir.mkdir(parents=True, exist_ok=True)

        evidence = db.query(Evidence).filter(Evidence.case_id == case.id).order_by(Evidence.id.asc()).all()
        evidence_ids = [item.id for item in evidence]
        analyses = db.query(Analysis).filter(Analysis.evidence_id.in_(evidence_ids)).order_by(Analysis.id.asc()).all() if evidence_ids else []

        case_data = {
            "schema_version": "1.0",
            "case": _row_data(case),
            "case_intake_context": _row_data(case.intake_context) if case.intake_context else None,
            "evidence": [_row_data(item) for item in evidence],
            "evidence_intake_contexts": [_row_data(item.intake_context) for item in evidence if item.intake_context],
            "analyses": [_row_data(item) for item in analyses],
            "analysis_jobs": [_row_data(item) for item in db.query(AnalysisJob).filter(AnalysisJob.evidence_id.in_(evidence_ids)).order_by(AnalysisJob.id.asc()).all()] if evidence_ids else [],
            "observations": [_row_data(item) for item in db.query(EvidenceObservation).filter(EvidenceObservation.evidence_id.in_(evidence_ids)).order_by(EvidenceObservation.id.asc()).all()] if evidence_ids else [],
            "evidence_relations": [_row_data(item) for item in db.query(EvidenceRelation).filter(EvidenceRelation.evidence_id.in_(evidence_ids)).order_by(EvidenceRelation.id.asc()).all()] if evidence_ids else [],
            "assessments": [_row_data(item) for item in db.query(EvidenceAssessment).filter(EvidenceAssessment.evidence_id.in_(evidence_ids)).order_by(EvidenceAssessment.id.asc()).all()] if evidence_ids else [],
            "findings": [_row_data(item) for item in db.query(Finding).filter((Finding.case_id == case.case_identifier) | (Finding.case_id == str(case.id))).order_by(Finding.id.asc()).all()],
            "analyst_notes": [_row_data(item) for item in db.query(AnalystNote).filter((AnalystNote.case_id == case.case_identifier) | (AnalystNote.case_id == str(case.id))).order_by(AnalystNote.id.asc()).all()],
            "lineage_relations": [_row_data(item) for item in db.query(EvidenceLineageRelation).filter(EvidenceLineageRelation.case_id == case.id).order_by(EvidenceLineageRelation.id.asc()).all()],
            "audit_events": [_row_data(item) for item in db.query(AuditEvent).filter((AuditEvent.case_id == case.case_identifier) | (AuditEvent.case_id == str(case.id))).order_by(AuditEvent.id.asc()).all()],
            "reports": [_row_data(item) for item in db.query(Report).filter((Report.case_id == case.case_identifier) | (Report.case_id == str(case.id))).order_by(Report.id.asc()).all()],
        }

        fd, archive_path = tempfile.mkstemp(prefix=f"{case.case_identifier}-", suffix=".forensight", dir=export_dir)
        os.close(fd)
        entries: List[Dict[str, Any]] = []
        omitted_artifacts: List[str] = []
        artifact_archive_map: List[Dict[str, str]] = []
        report_archive_map: List[Dict[str, str]] = []
        evidence_rows = {row["id"]: row for row in case_data["evidence"]}
        analysis_rows = {row["id"]: row for row in case_data["analyses"]}

        try:
            with ZipFile(archive_path, "w", compression=ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
                for item in evidence:
                    source = Path(item.stored_path).resolve()
                    try:
                        source.relative_to(storage_root)
                    except ValueError as exc:
                        raise ValueError(f"Evidence {item.evidence_identifier} is stored outside the configured evidence root") from exc
                    if not source.is_file():
                        raise FileNotFoundError(f"Evidence bitstream is missing: {item.evidence_identifier}")
                    clean_name = PurePosixPath((item.original_filename or "evidence").replace("\\", "/")).name
                    member = f"evidence/{item.evidence_identifier}/{clean_name}"
                    evidence_entry = CaseExportService._add_file(archive, member, source)
                    if item.sha256_hash and evidence_entry["sha256"] != item.sha256_hash:
                        raise ValueError(f"Evidence integrity check failed for {item.evidence_identifier}")
                    entries.append(evidence_entry)
                    evidence_rows[item.id]["stored_path"] = member
                    evidence_rows[item.id]["export_member"] = member

                artifact_index = 0
                for analysis in analyses:
                    findings = analysis.structured_findings if isinstance(analysis.structured_findings, dict) else {}
                    for artifact_id, raw_path in dict.fromkeys(_artifact_paths(findings)):
                        analysis_row = analysis_rows[analysis.id]
                        exported_findings = analysis_row.get("structured_findings")
                        if not isinstance(exported_findings, dict):
                            exported_findings = {}
                            analysis_row["structured_findings"] = exported_findings
                        artifact_values = exported_findings.get("artifacts", {})
                        if not isinstance(artifact_values, dict):
                            artifact_values = {}
                            exported_findings["artifacts"] = artifact_values
                        if artifact_id in artifact_values:
                            artifact_values[artifact_id] = None
                        relative = raw_path.split("/api/artifacts/", 1)[-1].split("?", 1)[0].split("#", 1)[0]
                        candidate = Path(relative)
                        source = candidate.resolve() if candidate.is_absolute() else (storage_root / candidate).resolve()
                        try:
                            source.relative_to(artifact_root)
                        except ValueError:
                            omitted_artifacts.append(PurePosixPath(raw_path.replace("\\", "/")).name)
                            continue
                        if not source.is_file():
                            omitted_artifacts.append(PurePosixPath(raw_path.replace("\\", "/")).name)
                            continue
                        artifact_index += 1
                        suffix = source.suffix.lower()[:12]
                        member = f"artifacts/{analysis.analysis_identifier}/{artifact_index:04d}{suffix}"
                        entries.append(CaseExportService._add_file(archive, member, source))
                        artifact_archive_map.append({
                            "analysis_identifier": analysis.analysis_identifier,
                            "artifact_id": artifact_id,
                            "source_reference": source.relative_to(artifact_root).as_posix(),
                            "bundle_member": member,
                        })
                        artifact_values[artifact_id] = member

                report_index = 0
                for report in case_data["reports"]:
                    artifact_path = report.get("artifact_path")
                    if not artifact_path:
                        continue
                    report["artifact_path"] = None
                    source = Path(artifact_path).resolve()
                    try:
                        source.relative_to(artifact_root)
                    except ValueError:
                        omitted_artifacts.append(PurePosixPath(str(artifact_path).replace("\\", "/")).name)
                        continue
                    if source.is_file():
                        report_index += 1
                        member = f"reports/{report_index:04d}{source.suffix.lower()}"
                        entries.append(CaseExportService._add_file(archive, member, source))
                        report_archive_map.append({"report_identifier": report.get("report_identifier", ""), "bundle_member": member})
                        report["artifact_path"] = member
                    else:
                        omitted_artifacts.append(PurePosixPath(str(artifact_path).replace("\\", "/")).name)

                case_data["artifact_archive_map"] = artifact_archive_map
                case_data["report_archive_map"] = report_archive_map
                case_json = json.dumps(case_data, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")
                archive.writestr("case.json", case_json)
                entries.append({"path": "case.json", "size": len(case_json), "sha256": hashlib.sha256(case_json).hexdigest()})

                public_key = private_key.public_key().public_bytes(
                    encoding=serialization.Encoding.Raw,
                    format=serialization.PublicFormat.Raw,
                )
                manifest = {
                    "format": "ForenSight Case Bundle",
                    "schema_version": "1.0",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "case_identifier": case.case_identifier,
                    "signature_algorithm": "Ed25519",
                    "signer_public_key_base64": base64.b64encode(public_key).decode("ascii"),
                    "signer_key_fingerprint_sha256": hashlib.sha256(public_key).hexdigest(),
                    "entries": entries,
                    "omitted_artifact_references": omitted_artifacts,
                    "limitations": [
                        "The embedded public key verifies archive integrity; verify its fingerprint through a trusted channel to authenticate the exporter.",
                        "The archive contains a case-scoped JSON data export and original evidence bitstreams. It is not a live database backup or an automatic case importer.",
                    ],
                }
                manifest_bytes = _canonical_json(manifest)
                archive.writestr("manifest.json", manifest_bytes)
                archive.writestr("manifest.sig", private_key.sign(manifest_bytes))

            archive_hash = hashlib.sha256()
            with Path(archive_path).open("rb") as archive_stream:
                for chunk in iter(lambda: archive_stream.read(1024 * 1024), b""):
                    archive_hash.update(chunk)
            archive_digest = archive_hash.hexdigest()
            return archive_path, {
                "archive_sha256": archive_digest,
                "entry_count": len(entries),
                "omitted_artifact_count": len(omitted_artifacts),
                "signer_key_fingerprint_sha256": manifest["signer_key_fingerprint_sha256"],
            }
        except Exception:
            try:
                os.remove(archive_path)
            except OSError:
                pass
            raise

    @staticmethod
    def _add_file(archive: ZipFile, member: str, source: Path) -> Dict[str, Any]:
        digest = hashlib.sha256()
        size = 0
        with source.open("rb") as source_stream, archive.open(member, "w", force_zip64=True) as archive_stream:
            while chunk := source_stream.read(1024 * 1024):
                archive_stream.write(chunk)
                digest.update(chunk)
                size += len(chunk)
        return {"path": member, "size": size, "sha256": digest.hexdigest()}
