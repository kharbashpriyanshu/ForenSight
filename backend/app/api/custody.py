from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.services.cases import CaseService
from app.services.custody import CustodyService
from app.api.deps import get_current_user, verify_evidence_access
from app.models.domain import User
from app.schemas.v3 import ChainOfCustodyResponse, CustodyVerificationResult

router = APIRouter()

@router.get("/cases/{case_id}/chain-of-custody", response_model=ChainOfCustodyResponse)
def get_case_chain_of_custody(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    return CustodyService.get_chain_of_custody(db=db, case=case)

@router.post("/evidence/{evidence_id}/verify-custody", response_model=CustodyVerificationResult)
def verify_single_evidence_custody(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    evidence = verify_evidence_access(db, evidence_id, current_user)
    return CustodyService.verify_evidence_integrity(db=db, evidence=evidence, verifier=current_user.username)
