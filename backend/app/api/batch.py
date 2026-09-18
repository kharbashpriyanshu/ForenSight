from typing import List
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.services.cases import CaseService
from app.services.batch import BatchService
from app.api.deps import get_current_user
from app.models.domain import User
from app.schemas.v3 import (
    BatchUploadResponse,
    BatchAnalysisRequest,
    BatchAnalysisStatusResponse,
)

router = APIRouter()

def _get_authorized_case(case_id: str, db: Session, current_user: User):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")
    return case

@router.post("/cases/{case_id}/evidence/batch", response_model=BatchUploadResponse)
def batch_upload_evidence(
    case_id: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = _get_authorized_case(case_id, db, current_user)
    if not files:
        raise HTTPException(status_code=400, detail="No files provided for batch ingestion")
    return BatchService.process_batch_upload(db=db, case=case, files=files, actor=current_user.username)

@router.post("/cases/{case_id}/batch-analysis", response_model=BatchAnalysisStatusResponse)
def trigger_batch_analysis(
    case_id: str,
    req: BatchAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = _get_authorized_case(case_id, db, current_user)
    return BatchService.queue_batch_analysis(
        db=db,
        case=case,
        evidence_ids=req.evidence_ids,
        analysis_types=req.analysis_types,
        actor=current_user.username
    )

@router.get("/cases/{case_id}/batch-jobs", response_model=BatchAnalysisStatusResponse)
def get_batch_jobs_status(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = _get_authorized_case(case_id, db, current_user)
    return BatchService.get_batch_status(db=db, case=case)
