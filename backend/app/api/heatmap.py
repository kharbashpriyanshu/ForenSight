from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.services.heatmap import HeatmapService
from app.api.deps import get_current_user, verify_evidence_access
from app.models.domain import User
from app.schemas.v3 import MultiModalityHeatmapResponse

router = APIRouter()

@router.get("/evidence/{evidence_id}/heatmap", response_model=MultiModalityHeatmapResponse)
def get_evidence_heatmap(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    evidence = verify_evidence_access(db, evidence_id, current_user)
    return HeatmapService.generate_evidence_heatmap(db=db, evidence=evidence)
