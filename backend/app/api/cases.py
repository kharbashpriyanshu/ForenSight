from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.schemas.domain import InvestigationCaseCreate, InvestigationCaseResponse, EvidenceResponse
from app.services.cases import CaseService
from app.services.evidence import EvidenceService
from app.services.audit import AuditService

router = APIRouter()

@router.post("/cases", response_model=InvestigationCaseResponse)
def create_case(case: InvestigationCaseCreate, db: Session = Depends(get_db)):
    new_case = CaseService.create_case(db=db, case=case)
    AuditService.log_event(db, new_case.case_identifier, "CASE_CREATED")
    return new_case

@router.get("/cases", response_model=List[InvestigationCaseResponse])
def read_cases(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return CaseService.get_cases(db, skip=skip, limit=limit)

@router.get("/cases/{case_id}", response_model=InvestigationCaseResponse)
def read_case(case_id: str, db: Session = Depends(get_db)):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    AuditService.log_event(db, case.case_identifier, "CASE_SELECTED")
    return case

@router.post("/cases/{case_id}/evidence", response_model=EvidenceResponse)
def upload_evidence(case_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    evidence = EvidenceService.process_and_store_evidence(db, case.id, file)
    AuditService.log_event(db, case.case_identifier, "EVIDENCE_UPLOADED", evidence.id, metadata={"filename": file.filename})
    return evidence

@router.get("/evidence/{evidence_id}", response_model=EvidenceResponse)
def read_evidence(evidence_id: int, db: Session = Depends(get_db)):
    evidence = EvidenceService.get_evidence(db, evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    return evidence

from app.schemas.domain import CaseOverviewStats

@router.get("/cases/{case_id}/overview", response_model=CaseOverviewStats)
def read_case_overview(case_id: str, db: Session = Depends(get_db)):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    stats = CaseService.get_case_overview(db, case.id)
    return stats
