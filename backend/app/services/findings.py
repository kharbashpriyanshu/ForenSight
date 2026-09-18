import datetime
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.domain import Finding, InvestigationCase, AuditEvent, User
from app.services.audit import AuditService

VALID_STATUS_TRANSITIONS = {
    "GENERATED": ["REVIEW_REQUIRED", "ACKNOWLEDGED", "CONFIRMED_BY_ANALYST", "DISMISSED", "INCONCLUSIVE"],
    "REVIEW_REQUIRED": ["ACKNOWLEDGED", "CONFIRMED_BY_ANALYST", "DISMISSED", "INCONCLUSIVE"],
    "ACKNOWLEDGED": ["CONFIRMED_BY_ANALYST", "DISMISSED", "INCONCLUSIVE", "REVIEW_REQUIRED"],
    "CONFIRMED_BY_ANALYST": ["DISMISSED", "INCONCLUSIVE", "REVIEW_REQUIRED"],
    "DISMISSED": ["REVIEW_REQUIRED", "ACKNOWLEDGED", "CONFIRMED_BY_ANALYST"],
    "INCONCLUSIVE": ["REVIEW_REQUIRED", "ACKNOWLEDGED", "CONFIRMED_BY_ANALYST", "DISMISSED"]
}

class FindingService:
    @classmethod
    def get_case_findings(
        cls,
        db: Session,
        case: InvestigationCase,
        status: Optional[str] = None,
        evidence_id: Optional[int] = None,
    ) -> List[Finding]:
        query = db.query(Finding).filter(
            (Finding.case_id == case.case_identifier) | (Finding.case_id == str(case.id))
        )
        if status:
            query = query.filter(Finding.status == status.upper())
        if evidence_id:
            query = query.filter(Finding.evidence_id == evidence_id)
        
        return query.order_by(Finding.created_at.desc()).all()

    @classmethod
    def get_finding_by_id(cls, db: Session, finding_id: int) -> Optional[Finding]:
        return db.query(Finding).filter(Finding.id == finding_id).first()

    @classmethod
    def get_finding_by_identifier(cls, db: Session, identifier: str) -> Optional[Finding]:
        return db.query(Finding).filter(Finding.finding_identifier == identifier).first()

    @classmethod
    def review_finding(
        cls,
        db: Session,
        finding: Finding,
        new_status: str,
        reviewer_user: User,
        review_note: Optional[str] = None,
        decision: Optional[str] = None,
    ) -> Finding:
        status_upper = new_status.upper()
        if status_upper not in VALID_STATUS_TRANSITIONS.get(finding.status, []):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid finding status transition from '{finding.status}' to '{status_upper}'"
            )

        now = datetime.datetime.utcnow()
        old_status = finding.status
        finding.status = status_upper
        finding.reviewer = reviewer_user.username
        finding.review_timestamp = now
        finding.review_note = review_note or ""
        finding.decision = decision or status_upper
        finding.updated_at = now

        db.commit()
        db.refresh(finding)

        # Log audit trail
        audit_event_type = f"FINDING_{status_upper}" if status_upper in ("CONFIRMED_BY_ANALYST", "DISMISSED") else "FINDING_REVIEWED"
        AuditService.log_event(
            db=db,
            case_id=finding.case_id,
            evidence_id=finding.evidence_id,
            event_type=audit_event_type,
            actor=reviewer_user.username,
            metadata={
                "finding_id": finding.finding_identifier,
                "old_status": old_status,
                "new_status": status_upper,
                "decision": finding.decision,
                "review_note": review_note
            }
        )

        return finding
