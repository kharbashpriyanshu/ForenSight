import uuid
import json
import datetime
from sqlalchemy.orm import Session
from app.models.domain import Report, InvestigationCase, Evidence, Analysis, EvidenceObservation, EvidenceRelation, EvidenceAssessment
from app.services.audit import AuditService
from pathlib import Path

class ReportService:
    @staticmethod
    def generate_case_report(db: Session, case_id: str):
        case = db.query(InvestigationCase).filter(InvestigationCase.case_identifier == case_id).first()
        if not case:
            raise ValueError("Case not found")

        report_identifier = f"FS-RPT-{uuid.uuid4().hex[:8].upper()}"
        
        # Build JSON report
        report_data = {
            "case_information": {
                "case_id": case.case_identifier,
                "title": case.title,
                "created_at": case.created_at.isoformat()
            },
            "evidence": [],
            "assessments": []
        }

        # Gather evidence
        evidence_list = db.query(Evidence).filter(Evidence.case_id == case.id).all()
        for ev in evidence_list:
            ev_data = {
                "evidence_id": ev.id,
                "filename": ev.original_filename,
                "sha256": ev.sha256_hash,
                "mime_type": ev.mime_type,
                "analyses": []
            }
            
            analyses = db.query(Analysis).filter(Analysis.evidence_id == ev.id).all()
            for an in analyses:
                ev_data["analyses"].append({
                    "type": an.analysis_type,
                    "status": an.status,
                    "summary": an.summary
                })
                
            report_data["evidence"].append(ev_data)
            
            # Gather assessments
            assessments = db.query(EvidenceAssessment).filter(EvidenceAssessment.evidence_id == ev.id).all()
            for ass in assessments:
                report_data["assessments"].append({
                    "evidence_id": ev.id,
                    "conclusion": ass.conclusion,
                    "explanation": ass.explanation,
                    "rule_version": ass.rule_version
                })

        # Save to file
        report_dir = Path("storage/reports")
        report_dir.mkdir(parents=True, exist_ok=True)
        report_path = report_dir / f"{report_identifier}.json"
        
        with open(report_path, "w") as f:
            json.dump(report_data, f, indent=2)

        # Record in DB
        report = Report(
            report_identifier=report_identifier,
            case_id=case.case_identifier,
            rule_version="7B-v1", # Hardcoded for now based on current engine
            report_type="JSON",
            status="COMPLETED",
            artifact_path=str(report_path)
        )
        db.add(report)
        db.commit()
        db.refresh(report)

        AuditService.log_event(db, case.case_identifier, "REPORT_GENERATED", metadata={"report_id": report_identifier})

        return report
