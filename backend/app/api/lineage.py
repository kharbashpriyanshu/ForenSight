from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, verify_case_access
from app.db.database import get_db
from app.models.domain import Evidence, EvidenceLineageRelation, User
from app.schemas.domain import LineageReviewRequest
from app.services.audit import AuditService
from app.services.lineage import LineageService


router = APIRouter(tags=["Image Version Lineage"])


@router.get("/cases/{case_id}/lineage")
def get_case_lineage(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    return {
        "case_id": case.case_identifier,
        "relations": LineageService.list_case_relations(db, case),
        "matching_is_calibrated": False,
        "disclaimer": "Similarity candidates do not establish source, chronology, authenticity, or truth. Analyst review is required.",
    }


@router.post("/cases/{case_id}/lineage/refresh")
def refresh_case_lineage(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    try:
        result = LineageService.refresh_case(db, case)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    AuditService.log_event(
        db, case.case_identifier, "IMAGE_LINEAGE_REFRESHED",
        actor=current_user.username,
        metadata={"candidate_pairs": result["candidate_pair_count"], "evidence_count": result["evidence_count"]},
    )
    return result


@router.patch("/cases/{case_id}/lineage/{relation_id}")
def review_lineage_relation(
    case_id: str,
    relation_id: int,
    request: LineageReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    relation = (
        db.query(EvidenceLineageRelation)
        .filter(EvidenceLineageRelation.id == relation_id, EvidenceLineageRelation.case_id == case.id)
        .first()
    )
    if not relation:
        raise HTTPException(status_code=404, detail="Lineage candidate not found")
    if request.review_status not in {"CONFIRMED_RELATION", "REJECTED", "INCONCLUSIVE"}:
        raise HTTPException(status_code=400, detail="Review status must be CONFIRMED_RELATION, REJECTED, or INCONCLUSIVE")
    if request.review_status == "CONFIRMED_RELATION":
        if request.parent_evidence_id is not None and request.parent_evidence_id not in {relation.evidence_a_id, relation.evidence_b_id}:
            raise HTTPException(status_code=400, detail="Parent must be one of the linked evidence items")
        if relation.relation_kind != "EXACT_BITSTREAM" and request.parent_evidence_id is None:
            raise HTTPException(status_code=400, detail="Choose one of the linked evidence items as the parent, or use INCONCLUSIVE when direction is unknown")
        relation.parent_evidence_id = request.parent_evidence_id
    else:
        relation.parent_evidence_id = None
    relation.review_status = request.review_status
    relation.reviewer = current_user.username
    relation.review_note = (request.review_note or "").strip() or None
    from datetime import datetime, timezone
    relation.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    AuditService.log_event(
        db, case.case_identifier, "IMAGE_LINEAGE_REVIEWED",
        actor=current_user.username,
        metadata={"relation_id": relation.id, "review_status": relation.review_status, "parent_evidence_id": relation.parent_evidence_id},
    )
    return {
        "case_id": case.case_identifier,
        "relations": LineageService.list_case_relations(db, case),
    }
