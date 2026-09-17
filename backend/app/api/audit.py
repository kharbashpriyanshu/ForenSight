from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.domain import AuditEvent, User
from app.api.deps import get_current_user, verify_case_access
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from datetime import datetime

router = APIRouter()

class AuditEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_id: str
    evidence_id: Optional[int] = None
    event_type: str
    timestamp: datetime
    actor: Optional[str] = None
    safe_metadata: Optional[str] = None

@router.get("/cases/{case_id}/audit", response_model=List[AuditEventResponse])
def get_case_audit_trail(
    case_id: str,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    query = (
        db.query(AuditEvent)
        .filter((AuditEvent.case_id == case.case_identifier) | (AuditEvent.case_id == str(case.id)))
    )
    if category:
        cat_upper = category.upper()
        if cat_upper == "EVIDENCE":
            query = query.filter(AuditEvent.event_type.like("EVIDENCE_%"))
        elif cat_upper == "ANALYSIS":
            query = query.filter((AuditEvent.event_type.like("ANALYSIS_%")) | (AuditEvent.event_type.like("JOB_%")))
        elif cat_upper == "FINDING":
            query = query.filter(AuditEvent.event_type.like("FINDING_%"))
        elif cat_upper == "CASE":
            query = query.filter(AuditEvent.event_type.like("CASE_%"))
        elif cat_upper == "REPORT":
            query = query.filter(AuditEvent.event_type.like("REPORT_%"))
        else:
            query = query.filter(AuditEvent.event_type.ilike(f"%{category}%"))

    events = query.order_by(AuditEvent.timestamp.desc()).all()
    return events

@router.get("/audit", response_model=List[AuditEventResponse])
def get_global_audit_trail(
    category: Optional[str] = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin role required for global audit trail")

    query = db.query(AuditEvent)
    if category:
        cat_upper = category.upper()
        if cat_upper == "EVIDENCE":
            query = query.filter(AuditEvent.event_type.like("EVIDENCE_%"))
        elif cat_upper == "ANALYSIS":
            query = query.filter((AuditEvent.event_type.like("ANALYSIS_%")) | (AuditEvent.event_type.like("JOB_%")))
        elif cat_upper == "FINDING":
            query = query.filter(AuditEvent.event_type.like("FINDING_%"))
        elif cat_upper == "CASE":
            query = query.filter(AuditEvent.event_type.like("CASE_%"))
        elif cat_upper == "REPORT":
            query = query.filter(AuditEvent.event_type.like("REPORT_%"))
        else:
            query = query.filter(AuditEvent.event_type.ilike(f"%{category}%"))

    events = query.order_by(AuditEvent.timestamp.desc()).limit(limit).all()
    return events

