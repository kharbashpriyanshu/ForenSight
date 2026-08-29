from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.domain import AuditEvent
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
def get_case_audit_trail(case_id: str, db: Session = Depends(get_db)):
    events = db.query(AuditEvent).filter(AuditEvent.case_id == case_id).order_by(AuditEvent.timestamp.desc()).all()
    return events
