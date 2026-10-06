from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, verify_evidence_access
from app.db.database import get_db
from app.models.domain import User
from app.services.processing_history import ProcessingHistoryService

router = APIRouter(tags=["Processing History"])


@router.get("/evidence/{evidence_id}/processing-history")
def get_processing_history(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    evidence = verify_evidence_access(db, evidence_id, current_user)
    return ProcessingHistoryService.build_for_evidence(db, evidence)
