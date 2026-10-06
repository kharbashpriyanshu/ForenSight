"""Append-only, per-case hash-chained audit events."""

import hashlib
import json
import threading
from datetime import datetime, timezone

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.domain import AuditEvent


_sqlite_append_lock = threading.RLock()
GENESIS_HASH = "0" * 64


def audit_payload(event: AuditEvent) -> dict:
    return {
        "id": event.id,
        "case_id": event.case_id,
        "evidence_id": event.evidence_id,
        "event_type": event.event_type,
        "timestamp": event.timestamp.isoformat() if event.timestamp else "",
        "actor": event.actor,
        "safe_metadata": event.safe_metadata,
        "sequence_number": event.sequence_number,
        "previous_hash": event.previous_hash,
    }


def audit_event_hash(event: AuditEvent) -> str:
    canonical = json.dumps(audit_payload(event), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class AuditService:
    @staticmethod
    def log_event(db: Session, case_id: str, event_type: str, evidence_id: int = None, actor: str = "system", metadata: dict = None):
        dialect = db.get_bind().dialect.name
        if dialect == "postgresql":
            db.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
                {"key": f"forensight-audit:{case_id}"},
            )
        else:
            _sqlite_append_lock.acquire()

        try:
            latest_query = db.query(AuditEvent)
            latest_query = latest_query.filter(AuditEvent.case_id == case_id) if case_id is not None else latest_query.filter(AuditEvent.case_id.is_(None))
            latest = latest_query.order_by(AuditEvent.sequence_number.desc()).first()
            sequence_number = (latest.sequence_number if latest else 0) + 1
            previous_hash = latest.event_hash if latest else GENESIS_HASH
            if dialect == "postgresql":
                event_id = db.execute(text("SELECT nextval(pg_get_serial_sequence('audit_events', 'id'))")).scalar_one()
            else:
                event_id = int(db.query(func.max(AuditEvent.id)).scalar() or 0) + 1
            event = AuditEvent(
                id=event_id,
                case_id=case_id,
                evidence_id=evidence_id,
                event_type=event_type,
                actor=actor,
                safe_metadata=json.dumps(metadata, sort_keys=True, separators=(",", ":"), ensure_ascii=False) if metadata else None,
                timestamp=datetime.now(timezone.utc).replace(tzinfo=None),
                sequence_number=sequence_number,
                previous_hash=previous_hash,
                event_hash="",
            )
            event.event_hash = audit_event_hash(event)
            db.add(event)
            db.commit()
            db.refresh(event)
            return event
        except Exception:
            db.rollback()
            raise
        finally:
            if dialect != "postgresql":
                _sqlite_append_lock.release()
