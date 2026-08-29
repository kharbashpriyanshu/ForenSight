import json
from sqlalchemy.orm import Session
from app.models.domain import AuditEvent

class AuditService:
    @staticmethod
    def log_event(db: Session, case_id: str, event_type: str, evidence_id: int = None, actor: str = "system", metadata: dict = None):
        safe_meta = json.dumps(metadata) if metadata else None
        
        event = AuditEvent(
            case_id=case_id,
            evidence_id=evidence_id,
            event_type=event_type,
            actor=actor,
            safe_metadata=safe_meta
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return event
