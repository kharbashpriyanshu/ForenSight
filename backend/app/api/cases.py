from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.schemas.domain import InvestigationCaseCreate, InvestigationCaseResponse, EvidenceResponse
from app.services.cases import CaseService
from app.services.evidence import EvidenceService
from app.services.audit import AuditService
from app.api.deps import get_current_user
from app.models.domain import User

router = APIRouter()

@router.post("/cases", response_model=InvestigationCaseResponse)
def create_case(case: InvestigationCaseCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_case = CaseService.create_case(db=db, case=case)
    new_case.user_id = current_user.id
    db.commit()
    db.refresh(new_case)
    AuditService.log_event(db, new_case.case_identifier, "CASE_CREATED", actor=current_user.username)
    return new_case

@router.get("/cases", response_model=List[InvestigationCaseResponse])
def read_cases(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cases = CaseService.get_cases(db, skip=0, limit=1000)
    if current_user.role != "ADMIN":
        cases = [c for c in cases if c.user_id == current_user.id]
    return cases[skip:skip+limit]

@router.get("/cases/{case_id}", response_model=InvestigationCaseResponse)
def read_case(case_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")
    AuditService.log_event(db, case.case_identifier, "CASE_SELECTED", actor=current_user.username)
    return case

@router.post("/cases/{case_id}/evidence", response_model=EvidenceResponse)
def upload_evidence(case_id: str, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")
        
    evidence = EvidenceService.process_and_store_evidence(db, case.id, file)
    AuditService.log_event(db, case.case_identifier, "EVIDENCE_UPLOADED", evidence.id, actor=current_user.username, metadata={"filename": file.filename})
    return evidence

@router.get("/evidence/{evidence_id}", response_model=EvidenceResponse)
def read_evidence(evidence_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    evidence = EvidenceService.get_evidence(db, evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    case = evidence.case
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this evidence")
    return evidence

from app.schemas.domain import CaseOverviewStats

@router.get("/cases/{case_id}/overview", response_model=CaseOverviewStats)
def read_case_overview(case_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")
    stats = CaseService.get_case_overview(db, case.id)
    return stats
