from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.services.cases import CaseService
from app.services.cross_correlation import CrossCorrelationService
from app.api.deps import get_current_user
from app.models.domain import User
from app.schemas.v3 import CrossImageCorrelationResponse

router = APIRouter()

def _get_authorized_case(case_id: str, db: Session, current_user: User):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")
    return case

@router.get("/cases/{case_id}/cross-correlation", response_model=CrossImageCorrelationResponse)
def get_cross_image_correlation(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = _get_authorized_case(case_id, db, current_user)
    return CrossCorrelationService.evaluate_case(db=db, case=case, actor=current_user.username)

@router.post("/cases/{case_id}/cross-correlation/evaluate", response_model=CrossImageCorrelationResponse)
def trigger_cross_image_correlation(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = _get_authorized_case(case_id, db, current_user)
    return CrossCorrelationService.evaluate_case(db=db, case=case, actor=current_user.username)
