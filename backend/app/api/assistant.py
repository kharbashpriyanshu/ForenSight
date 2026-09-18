from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.services.cases import CaseService
from app.services.assistant import AssistantService
from app.api.deps import get_current_user
from app.models.domain import User
from app.schemas.v3 import InvestigationAssistantResponse

router = APIRouter()

@router.get("/cases/{case_id}/assistant", response_model=InvestigationAssistantResponse)
def get_investigation_assistant(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    return AssistantService.generate_case_decision_support(db=db, case=case)
