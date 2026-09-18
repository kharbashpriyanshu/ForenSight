import datetime
from sqlalchemy.orm import Session
from app.models.domain import InvestigationCase, Evidence, Analysis, AnalysisJob, Finding, Report

class ManifestService:
    @staticmethod
    def generate_case_manifest(db: Session, case_id: str) -> dict:
        """
        Generates a deterministic, machine-readable validation manifest of all forensic artifacts
        and records within an investigation case.
        """
        case = (
            db.query(InvestigationCase)
            .filter(
                (InvestigationCase.case_identifier == case_id)
                | (InvestigationCase.id == (int(case_id) if case_id.isdigit() else -1))
            )
            .first()
        )
        if not case:
            raise ValueError("Case not found")

        evidence_list = db.query(Evidence).filter(Evidence.case_id == case.id).order_by(Evidence.id.asc()).all()
        findings = db.query(Finding).filter(
            (Finding.case_id == case.case_identifier) | (Finding.case_id == str(case.id))
        ).order_by(Finding.id.asc()).all()
        reports = db.query(Report).filter(
            (Report.case_id == case.case_identifier) | (Report.case_id == str(case.id))
        ).order_by(Report.id.asc()).all()

        manifest_evidence = []
        manifest_analyses = []

        for ev in evidence_list:
            manifest_evidence.append({
                "evidence_id": ev.evidence_identifier,
                "sha256": ev.sha256_hash,
                "mime_type": ev.mime_type,
                "size": ev.file_size
            })

            analyses = db.query(Analysis).filter(Analysis.evidence_id == ev.id).order_by(Analysis.id.asc()).all()
            for a in analyses:
                job = db.query(AnalysisJob).filter(AnalysisJob.analysis_id == a.id).first()
                manifest_analyses.append({
                    "analysis_id": a.analysis_identifier,
                    "type": a.analysis_type,
                    "job_id": job.job_identifier if job else "N/A",
                    "status": a.status
                })

        manifest_correlations = []
        seen_rules = set()
        for f in findings:
            if f.correlation_rule_id and f.correlation_rule_id not in seen_rules:
                seen_rules.add(f.correlation_rule_id)
                manifest_correlations.append({
                    "rule_id": f.correlation_rule_id,
                    "version": f.correlation_rule_version or "1.0"
                })

        manifest_findings = []
        for f in findings:
            manifest_findings.append({
                "finding_id": f.finding_identifier,
                "rule_id": f.correlation_rule_id,
                "status": f.status,
                "severity": f.severity_label,
                "decision": f.decision or "UNREVIEWED"
            })

        manifest_reports = []
        for r in reports:
            manifest_reports.append({
                "report_id": r.report_identifier,
                "generated_at": r.generated_at.isoformat() if r.generated_at else "N/A",
                "format": r.report_type
            })

        return {
            "case_id": case.case_identifier,
            "case_title": case.title,
            "evidence": manifest_evidence,
            "analyses": manifest_analyses,
            "correlations": manifest_correlations,
            "findings": manifest_findings,
            "reports": manifest_reports
        }
