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
        from app.models.domain import Evidence, Analysis, EvidenceAssessment, AnalysisJob, EvidenceObservation, AuditEvent
        case = db.query(InvestigationCase).filter(InvestigationCase.id == case_id).first()
        if not case: return None
        
        evidence_ids = [e.id for e in case.evidence_items]
        analyses = db.query(Analysis).filter(Analysis.evidence_id.in_(evidence_ids)).all() if evidence_ids else []
        assessments = db.query(EvidenceAssessment).filter(EvidenceAssessment.evidence_id.in_(evidence_ids)).order_by(EvidenceAssessment.generated_at.desc()).all() if evidence_ids else []
        jobs = db.query(AnalysisJob).filter(AnalysisJob.evidence_id.in_(evidence_ids)).all() if evidence_ids else []
        findings_count = db.query(EvidenceObservation).filter(EvidenceObservation.evidence_id.in_(evidence_ids)).count() if evidence_ids else 0
        audit_events = db.query(AuditEvent).filter((AuditEvent.case_id == case.case_identifier) | (AuditEvent.case_id == str(case.id))).order_by(AuditEvent.timestamp.desc()).all()
        
        completed_analyses = [a for a in analyses if a.status.lower() == 'completed']
        failed_analyses = [a for a in analyses if a.status.lower() == 'failed']
        running_jobs = [j for j in jobs if j.status == 'RUNNING']
        pending_jobs = [j for j in jobs if j.status in ('QUEUED', 'PENDING')]
        
        latest_assessment = assessments[0] if assessments else None
        
        # Calculate last activity
        candidate_timestamps = [case.created_at]
        if case.updated_at:
            candidate_timestamps.append(case.updated_at)
        if audit_events:
            candidate_timestamps.append(audit_events[0].timestamp)
        for j in jobs:
            if j.completed_at: candidate_timestamps.append(j.completed_at)
            elif j.started_at: candidate_timestamps.append(j.started_at)
            elif j.queued_at: candidate_timestamps.append(j.queued_at)
        
        last_activity = max(candidate_timestamps) if candidate_timestamps else case.created_at

        return {
            'case_identifier': case.case_identifier,
            'title': case.title,
            'status': case.status,
            'created_at': case.created_at,
            'last_activity': last_activity,
            'evidence_count': len(evidence_ids),
            'analysis_count': len(analyses),
            'completed_analysis_count': len(completed_analyses),
            'failed_analysis_count': len(failed_analyses),
            'running_job_count': len(running_jobs),
            'pending_job_count': len(pending_jobs),
            'findings_count': findings_count,
            'audit_event_count': len(audit_events),
            'assessment_status': 'AVAILABLE' if latest_assessment else 'PENDING',
            'latest_assessment': latest_assessment.level if latest_assessment else None,
            'rule_version': latest_assessment.rule_version if latest_assessment else 'Fusion 7B-v1'
        }
