from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.domain import AuditEvent, User
from app.api.deps import get_current_user, verify_case_access
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class AuditEventResponse(BaseModel):
    id: int
    case_id: str
    evidence_id: Optional[int] = None
    event_type: str
    timestamp: datetime
    actor: Optional[str] = None
    safe_metadata: Optional[str] = None
    
    class Config:
        from_attributes = True

@router.get("/cases/{case_id}/audit", response_model=List[AuditEventResponse])
def get_case_audit_trail(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    events = (
        db.query(AuditEvent)
        .filter((AuditEvent.case_id == case.case_identifier) | (AuditEvent.case_id == str(case.id)))
        .order_by(AuditEvent.timestamp.desc())
        .all()
    )
    return events

