from sqlalchemy.orm import Session
from app.models.domain import EvidenceObservation, EvidenceRelation, EvidenceAssessment
from .rules import determine_evidence_families, determine_assessment

class AssessmentEngine:
    @staticmethod
    def run_assessment(db: Session, evidence_id: int) -> EvidenceAssessment:
        observations = db.query(EvidenceObservation).filter(EvidenceObservation.evidence_id == evidence_id).all()
        relations = db.query(EvidenceRelation).filter(EvidenceRelation.evidence_id == evidence_id).all()
        
        # Idempotency
        db.query(EvidenceAssessment).filter(EvidenceAssessment.evidence_id == evidence_id).delete()
        
        families = determine_evidence_families(observations)
        ass_dict = determine_assessment(families, observations, relations)
        
        # Serialize contributors
        contributing_observations = [
            {"id": o.id, "modality": o.modality, "metric": o.metric_name, "raw_value": o.raw_value, "direction": o.direction}
            for o in observations if o.direction in ["elevated", "suppressed", "present", "candidate"]
        ]
        
        contributing_relations = [
            {"id": r.id, "type": r.relation_type, "strength": r.strength, "explanation": r.explanation}
            for r in relations
        ]
        
        db_assessment = EvidenceAssessment(
            evidence_id=evidence_id,
            rule_version=ass_dict["rule_version"],
            level=ass_dict["level"],
            summary=ass_dict["summary"],
            limitations=ass_dict["limitations"],
            contributing_observations=contributing_observations,
            contributing_relations=contributing_relations
        )
        
        db.add(db_assessment)
        db.commit()
        db.refresh(db_assessment)
        
        return db_assessment
