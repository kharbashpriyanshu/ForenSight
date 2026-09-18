from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.domain import User, Finding, AnalystNote
from app.api.deps import get_current_user, verify_case_access, verify_finding_access, verify_note_access
from app.schemas.domain import (
    FindingResponse,
    FindingReviewRequest,
    AnalystNoteResponse,
    AnalystNoteCreateRequest,
    ObservationGraphResponse,
    ProvenanceResponse,
    InvestigationSearchResponse,
)
from app.services.graph import GraphService
from app.services.correlation import CorrelationEngine
from app.services.findings import FindingService
from app.services.notes import NoteService
from app.services.search import SearchService

router = APIRouter()

# ------------------------------------------------------------------
# Observation & Provenance Graphs (6A, 6G)
# ------------------------------------------------------------------

@router.get("/cases/{case_id}/graph", response_model=ObservationGraphResponse)
def get_case_observation_graph(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    return GraphService.get_case_observation_graph(db, case)


@router.get("/cases/{case_id}/provenance", response_model=ProvenanceResponse)
def get_case_provenance(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    return GraphService.get_case_provenance(db, case)


# ------------------------------------------------------------------
# Cross-Modality Correlation Engine (6B, 6B.1, 6D)
# ------------------------------------------------------------------

@router.get("/cases/{case_id}/correlations")
def get_case_correlations(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    rules = CorrelationEngine.get_registered_rules()
    findings = FindingService.get_case_findings(db, case)
    return {
        "case_id": case.case_identifier,
        "registered_rules": rules,
        "correlated_findings_count": len(findings),
        "findings": findings
    }


@router.post("/cases/{case_id}/correlations/run", response_model=List[FindingResponse])
def run_case_correlations(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    findings = CorrelationEngine.evaluate_case(db, case, actor=current_user.username)
    return findings


# ------------------------------------------------------------------
# Finding Lifecycle & Review (6C, 6F)
# ------------------------------------------------------------------

@router.get("/cases/{case_id}/findings", response_model=List[FindingResponse])
def get_case_findings(
    case_id: str,
    status: Optional[str] = None,
    evidence_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    return FindingService.get_case_findings(db, case, status=status, evidence_id=evidence_id)


@router.post("/cases/{case_id}/findings/{finding_id}/review", response_model=FindingResponse)
def review_case_finding(
    case_id: str,
    finding_id: str,
    req: FindingReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    finding, _ = verify_finding_access(db, finding_id, current_user)

    updated_finding = FindingService.review_finding(
        db=db,
        finding=finding,
        new_status=req.status,
        reviewer_user=current_user,
        review_note=req.review_note,
        decision=req.decision,
    )
    return updated_finding


# ------------------------------------------------------------------
# Analyst Notes (6E)
# ------------------------------------------------------------------

@router.get("/cases/{case_id}/notes", response_model=List[AnalystNoteResponse])
def get_case_notes(
    case_id: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    return NoteService.get_case_notes(db, case, target_type=target_type, target_id=target_id)


@router.post("/cases/{case_id}/notes", response_model=AnalystNoteResponse)
def create_case_note(
    case_id: str,
    req: AnalystNoteCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    note = NoteService.create_note(
        db=db,
        case=case,
        target_type=req.target_type,
        target_id=req.target_id,
        content=req.content,
        author_user=current_user,
    )
    return note


@router.put("/notes/{note_id}", response_model=AnalystNoteResponse)
def update_analyst_note(
    note_id: int,
    content: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note, _ = verify_note_access(db, note_id, current_user)
    updated = NoteService.update_note(db, note_id, content, current_user)
    return updated


# ------------------------------------------------------------------
# Investigation Search (6H)
# ------------------------------------------------------------------

@router.get("/cases/{case_id}/search", response_model=InvestigationSearchResponse)
def search_case_entities(
    case_id: str,
    q: str = Query(..., min_length=1),
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    hits = SearchService.search_case(db, query_str=q, case=case, limit=limit)
    return {
        "query": q,
        "total_hits": len(hits),
        "hits": hits
    }


@router.get("/search", response_model=InvestigationSearchResponse)
def global_investigation_search(
    q: str = Query(..., min_length=1),
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required for global cross-case search"
        )
    hits = SearchService.search_case(db, query_str=q, case=None, limit=limit)
    return {
        "query": q,
        "total_hits": len(hits),
        "hits": hits
    }


# ------------------------------------------------------------------
# Forensic Validation Manifest & Replay (Phase 7N, 7O)
# ------------------------------------------------------------------

from app.services.manifest import ManifestService
from app.services.replay import InvestigationReplayService

@router.get("/cases/{case_id}/manifest")
def get_case_manifest(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    manifest = ManifestService.generate_case_manifest(db, case.case_identifier)
    return manifest


@router.post("/cases/{case_id}/replay-verify")
def verify_case_replay(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    result = InvestigationReplayService.verify_case_integrity(
        db, case.case_identifier, verifier_username=current_user.username
    )
    return result

