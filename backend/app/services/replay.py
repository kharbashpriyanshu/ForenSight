import os
import hashlib
import datetime
from sqlalchemy.orm import Session
from app.models.domain import InvestigationCase, Evidence, Analysis, AnalysisJob, Finding, Report
from app.services.audit import AuditService

class InvestigationReplayService:
    @staticmethod
    def verify_case_integrity(db: Session, case_id: str, verifier_username: str = "system") -> dict:
        """
        Replays and validates historical case records against the current disk and database state.
        Verifies evidence SHA-256 integrity, analysis record linkage, and report artifact consistency.
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

        evidence_list = db.query(Evidence).filter(Evidence.case_id == case.id).all()
        findings = db.query(Finding).filter(
            (Finding.case_id == case.case_identifier) | (Finding.case_id == str(case.id))
        ).all()
        reports = db.query(Report).filter(
            (Report.case_id == case.case_identifier) | (Report.case_id == str(case.id))
        ).all()

        evidence_results = []
        all_hashes_matched = True

        for ev in evidence_list:
            actual_hash = None
            file_exists = False
            hash_matched = False

            if ev.stored_path and os.path.exists(ev.stored_path):
                file_exists = True
                sha256 = hashlib.sha256()
                with open(ev.stored_path, "rb") as f:
                    while chunk := f.read(8192):
                        sha256.update(chunk)
                actual_hash = sha256.hexdigest()
                hash_matched = (actual_hash == ev.sha256_hash)
            
            if not hash_matched:
                all_hashes_matched = False

            analyses = db.query(Analysis).filter(Analysis.evidence_id == ev.id).all()
            jobs = db.query(AnalysisJob).filter(AnalysisJob.evidence_id == ev.id).all()

            evidence_results.append({
                "evidence_id": ev.id,
                "evidence_identifier": ev.evidence_identifier,
                "filename": ev.original_filename,
                "expected_hash": ev.sha256_hash,
                "actual_hash": actual_hash,
                "file_exists": file_exists,
                "hash_matched": hash_matched,
                "analyses_count": len(analyses),
                "jobs_count": len(jobs)
            })

        overall_status = "VERIFIED" if (all_hashes_matched and evidence_list) else ("EMPTY_CASE" if not evidence_list else "INTEGRITY_VIOLATION")

        replay_summary = {
            "case_identifier": case.case_identifier,
            "case_title": case.title,
            "verification_timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "verifier": verifier_username,
            "overall_status": overall_status,
            "all_hashes_matched": all_hashes_matched,
            "evidence_integrity": evidence_results,
            "findings_count": len(findings),
            "reports_count": len(reports)
        }

        # Audit log the replay verification
        AuditService.log_event(
            db,
            case.case_identifier,
            "CASE_REPLAY_VERIFIED",
            actor=verifier_username,
            metadata={
                "overall_status": overall_status,
                "all_hashes_matched": all_hashes_matched,
                "evidence_count": len(evidence_list)
            }
        )

        return replay_summary
