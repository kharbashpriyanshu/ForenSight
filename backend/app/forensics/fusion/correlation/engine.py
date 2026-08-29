from sqlalchemy.orm import Session
from typing import List
from app.models.domain import EvidenceObservation, EvidenceRelation
from .rules import evaluate_relations

class CorrelationEngine:
    @staticmethod
    def run_correlation(db: Session, evidence_id: int) -> List[EvidenceRelation]:
        observations = db.query(EvidenceObservation).filter(EvidenceObservation.evidence_id == evidence_id).all()
        
        # Idempotency: Delete existing relations for this evidence
        db.query(EvidenceRelation).filter(EvidenceRelation.evidence_id == evidence_id).delete()
        
        if not observations:
            return []
            
        relation_dicts = evaluate_relations(observations)
        db_relations = []
        
        for r_dict in relation_dicts:
            rel = EvidenceRelation(
                evidence_id=evidence_id,
                **r_dict
            )
            db_relations.append(rel)
            
        if db_relations:
            db.add_all(db_relations)
            db.commit()
            
            for rel in db_relations:
                db.refresh(rel)
                
        return db_relations
