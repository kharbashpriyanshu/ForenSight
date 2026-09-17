from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.db.database import get_db
from app.schemas.domain import InvestigationCaseCreate, InvestigationCaseResponse, EvidenceResponse
from app.services.cases import CaseService
from app.services.evidence import EvidenceService
from app.services.audit import AuditService
from app.api.deps import get_current_user
from app.models.domain import User

router = APIRouter()

@router.post("/cases", response_model=InvestigationCaseResponse)
def create_case(case: InvestigationCaseCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    new_case = CaseService.create_case(db=db, case=case)
    new_case.user_id = current_user.id
    db.commit()
    db.refresh(new_case)
    AuditService.log_event(db, new_case.case_identifier, "CASE_CREATED", actor=current_user.username)
    return new_case

@router.get("/cases", response_model=List[InvestigationCaseResponse])
def read_cases(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cases = CaseService.get_cases(db, skip=0, limit=1000)
    if current_user.role != "ADMIN":
        cases = [c for c in cases if c.user_id == current_user.id]
    return cases[skip:skip+limit]

@router.get("/cases/{case_id}", response_model=InvestigationCaseResponse)
def read_case(case_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")
    AuditService.log_event(db, case.case_identifier, "CASE_SELECTED", actor=current_user.username)
    return case

@router.post("/cases/{case_id}/evidence", response_model=EvidenceResponse)
def upload_evidence(case_id: str, file: UploadFile = File(...), db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")
        
    evidence = EvidenceService.process_and_store_evidence(db, case.id, file)
    AuditService.log_event(db, case.case_identifier, "EVIDENCE_UPLOADED", evidence.id, actor=current_user.username, metadata={"filename": file.filename})
    return evidence

@router.get("/evidence/{evidence_id}", response_model=EvidenceResponse)
def read_evidence(evidence_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    evidence = EvidenceService.get_evidence(db, evidence_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
    case = evidence.case
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this evidence")
    return evidence

from app.schemas.domain import CaseOverviewStats

@router.get("/cases/{case_id}/overview", response_model=CaseOverviewStats)
def read_case_overview(case_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")
    stats = CaseService.get_case_overview(db, case.id)
    return stats


from typing import Optional
from app.models.domain import Evidence, Analysis, EvidenceObservation
from app.schemas.domain import EvidenceComparisonResponse, EvidenceComparisonItem

@router.get("/cases/{case_id}/evidence")
def list_case_evidence(
    case_id: str,
    search: Optional[str] = None,
    q: Optional[str] = None,
    mime_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    query = db.query(Evidence).filter(Evidence.case_id == case.id)
    if mime_type:
        query = query.filter(Evidence.mime_type.ilike(f"%{mime_type}%"))
    
    search_term = q or search
    if search_term:
        query = query.filter(
            (Evidence.original_filename.ilike(f"%{search_term}%")) |
            (Evidence.sha256_hash.ilike(f"%{search_term}%")) |
            (Evidence.evidence_identifier.ilike(f"%{search_term}%"))
        )

    evidence_items = query.order_by(Evidence.created_at.desc()).all()
    results = []
    for ev in evidence_items:
        analyses = db.query(Analysis).filter(Analysis.evidence_id == ev.id).all()
        completed_types = [a.analysis_type for a in analyses if a.status.lower() == "completed"]
        has_artifacts = any(bool(a.structured_findings and a.structured_findings.get("artifacts")) for a in analyses)
        results.append({
            "id": ev.id,
            "evidence_identifier": ev.evidence_identifier,
            "original_filename": ev.original_filename,
            "mime_type": ev.mime_type,
            "file_size": ev.file_size,
            "sha256_hash": ev.sha256_hash,
            "image_format": ev.image_format,
            "width": ev.width,
            "height": ev.height,
            "created_at": ev.created_at,
            "completed_analyses": completed_types,
            "has_artifacts": has_artifacts,
        })
    return results


@router.get("/cases/{case_id}/compare", response_model=EvidenceComparisonResponse)
def compare_evidence(
    case_id: str,
    evidence_a: Optional[int] = None,
    evidence_b: Optional[int] = None,
    evidence_a_id: Optional[int] = None,
    evidence_b_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = CaseService.get_case_by_identifier(db, case_id) if case_id.startswith("FS-CASE") else CaseService.get_case(db, int(case_id))
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    id_a = evidence_a_id if evidence_a_id is not None else evidence_a
    id_b = evidence_b_id if evidence_b_id is not None else evidence_b

    if id_a is None or id_b is None:
        raise HTTPException(status_code=400, detail="Two evidence IDs (evidence_a and evidence_b) are required")

    ev_a = db.query(Evidence).filter(Evidence.id == id_a, Evidence.case_id == case.id).first()
    ev_b = db.query(Evidence).filter(Evidence.id == id_b, Evidence.case_id == case.id).first()
    if not ev_a or not ev_b:
        raise HTTPException(status_code=404, detail="One or both evidence items not found in this case")

    def build_item(ev: Evidence):
        analyses = db.query(Analysis).filter(Analysis.evidence_id == ev.id).all()
        analyses_dict = {}
        artifacts_dict = {}
        for a in analyses:
            analyses_dict[a.analysis_type] = {
                "status": a.status,
                "summary": a.summary,
                "findings": a.structured_findings or {}
            }
            if a.structured_findings and "artifacts" in a.structured_findings:
                for k, v in a.structured_findings["artifacts"].items():
                    if v:
                        artifacts_dict[f"{a.analysis_type}_{k}"] = f"/api/artifacts/{v}"
        
        obs_records = db.query(EvidenceObservation).filter(EvidenceObservation.evidence_id == ev.id).all()
        obs_list = [{"family": o.family, "description": o.description, "level": o.level} for o in obs_records]

        return EvidenceComparisonItem(
            id=ev.id,
            evidence_identifier=ev.evidence_identifier,
            original_filename=ev.original_filename,
            mime_type=ev.mime_type,
            file_size=ev.file_size,
            sha256_hash=ev.sha256_hash,
            image_format=ev.image_format or "UNKNOWN",
            width=ev.width,
            height=ev.height,
            created_at=ev.created_at,
            analyses=analyses_dict,
            artifacts=artifacts_dict,
            observations=obs_list,
        )

    item_a = build_item(ev_a)
    item_b = build_item(ev_b)

    differences = {
        "dimensions_identical": (ev_a.width == ev_b.width and ev_a.height == ev_b.height),
        "dimensions_diff": f"A: {ev_a.width}x{ev_a.height} vs B: {ev_b.width}x{ev_b.height}",
        "mime_identical": (ev_a.mime_type == ev_b.mime_type),
        "mime_diff": f"A: {ev_a.mime_type} vs B: {ev_b.mime_type}",
        "size_diff_bytes": abs(ev_a.file_size - ev_b.file_size),
        "hash_identical": (ev_a.sha256_hash == ev_b.sha256_hash),
    }

    return EvidenceComparisonResponse(
        case_identifier=case.case_identifier,
        evidence_a=item_a,
        evidence_b=item_b,
        differences=differences,
    )
