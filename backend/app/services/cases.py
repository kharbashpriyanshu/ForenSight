from sqlalchemy.orm import Session
from app.models.domain import InvestigationCase
from app.schemas.domain import InvestigationCaseCreate

class CaseService:
    @staticmethod
    def create_case(db: Session, case: InvestigationCaseCreate) -> InvestigationCase:
        db_case = InvestigationCase(title=case.title)
        db.add(db_case)
        db.commit()
        db.refresh(db_case)
        return db_case

    @staticmethod
    def get_cases(db: Session, skip: int = 0, limit: int = 100):
        return db.query(InvestigationCase).offset(skip).limit(limit).all()

    @staticmethod
    def get_case(db: Session, case_id: int):
        return db.query(InvestigationCase).filter(InvestigationCase.id == case_id).first()

    @staticmethod
    def get_case_by_identifier(db: Session, case_identifier: str):
        return db.query(InvestigationCase).filter(InvestigationCase.case_identifier == case_identifier).first()



    @staticmethod
    def get_case_overview(db: Session, case_id: int):
        from app.models.domain import Evidence, Analysis, EvidenceAssessment
        case = db.query(InvestigationCase).filter(InvestigationCase.id == case_id).first()
        if not case: return None
        
        evidence_ids = [e.id for e in case.evidence_items]
        analyses = db.query(Analysis).filter(Analysis.evidence_id.in_(evidence_ids)).all() if evidence_ids else []
        assessments = db.query(EvidenceAssessment).filter(EvidenceAssessment.evidence_id.in_(evidence_ids)).order_by(EvidenceAssessment.generated_at.desc()).all() if evidence_ids else []
        
        completed_analyses = [a for a in analyses if a.status.lower() == 'completed']
        failed_analyses = [a for a in analyses if a.status.lower() == 'failed']
        
        latest_assessment = assessments[0] if assessments else None
        
        return {
            'case_identifier': case.case_identifier,
            'title': case.title,
            'status': case.status,
            'created_at': case.created_at,
            'evidence_count': len(evidence_ids),
            'analysis_count': len(analyses),
            'completed_analysis_count': len(completed_analyses),
            'failed_analysis_count': len(failed_analyses),
            'assessment_status': 'AVAILABLE' if latest_assessment else 'PENDING',
            'latest_assessment': latest_assessment.level if latest_assessment else None,
            'rule_version': latest_assessment.rule_version if latest_assessment else None
        }
