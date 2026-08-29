from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.domain import Evidence
from app.forensics.fusion.normalizer import EvidenceNormalizer
from app.forensics.fusion.schemas import EvidenceSet, CorrelationResult
from app.forensics.fusion.correlation.engine import CorrelationEngine
from app.forensics.fusion.assessment.engine import AssessmentEngine
from app.forensics.fusion.assessment.rules import determine_evidence_families
from app.models.domain import EvidenceObservation

router = APIRouter(tags=["fusion"])

@router.post("/evidence/{evidence_id}/fusion/normalize", response_model=EvidenceSet)
def normalize_evidence(evidence_id: int, db: Session = Depends(get_db)):
    evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
        
    try:
        evidence_set = EvidenceNormalizer.normalize_evidence(db, evidence_id)
        return evidence_set
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/evidence/{evidence_id}/fusion/correlate", response_model=CorrelationResult)
def correlate_evidence(evidence_id: int, db: Session = Depends(get_db)):
    evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
        
    try:
        # Get observations to determine families
        observations = db.query(EvidenceObservation).filter(EvidenceObservation.evidence_id == evidence_id).all()
        families = list(determine_evidence_families(observations))
        
        relations = CorrelationEngine.run_correlation(db, evidence_id)
        assessment = AssessmentEngine.run_assessment(db, evidence_id)
        
        return CorrelationResult(
            evidence_id=evidence_id,
            families=families,
            relations=relations,
            assessment=assessment
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
