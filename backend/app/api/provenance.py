from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, verify_evidence_access
from app.db.database import get_db
from app.models.domain import Analysis, User
from app.services.audit import AuditService
from app.services.c2pa_provenance import inspect_c2pa


router = APIRouter(tags=["Content Credentials"])


@router.post("/evidence/{evidence_id}/c2pa/inspect")
def inspect_evidence_c2pa(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    evidence = verify_evidence_access(db, evidence_id, current_user)
    findings = inspect_c2pa(evidence)
    analysis = Analysis(
        evidence_id=evidence.id,
        analysis_type="C2PA_PROVENANCE",
        status="COMPLETED" if findings["credential_status"] != "INSPECTION_ERROR" else "FAILED",
        summary=findings["summary"],
        structured_findings=findings,
    )
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    AuditService.log_event(
        db, evidence.case.case_identifier, "C2PA_CREDENTIAL_INSPECTED", evidence.id,
        actor=current_user.username,
        metadata={"credential_status": findings["credential_status"], "analysis_id": analysis.id},
    )
    return {"analysis_id": analysis.id, **findings}


@router.get("/evidence/{evidence_id}/c2pa/latest")
def latest_evidence_c2pa(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    evidence = verify_evidence_access(db, evidence_id, current_user)
    result = (
        db.query(Analysis)
        .filter(Analysis.evidence_id == evidence.id, Analysis.analysis_type == "C2PA_PROVENANCE")
        .order_by(Analysis.id.desc())
        .first()
    )
    if not result:
        return {"credential_status": "NOT_CHECKED", "summary": "Content Credentials have not been checked for this evidence item."}
    return {"analysis_id": result.id, **(result.structured_findings or {})}
