import hashlib
import json
import uuid
import datetime

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from app.db.database import get_db
from app.models.domain import AnalysisJob, AnalysisJobOutbox, InvestigationCase, User
from app.services.audit import AuditService
from app.schemas.domain import AnalysisJobCreate, AnalysisJobResponse
from app.services.job_dispatch import publish_pending_analysis_jobs
from app.engine_extensions.registry import engine_registry
from app.api.deps import get_current_user, verify_evidence_access, verify_job_access
from typing import List, Optional

router = APIRouter()


def _engine_version(analysis_type: str) -> str:
    if analysis_type.lower() in {"metadata", "ela", "noise", "jpeg-dct", "jpeg_dct", "copy-move", "copy_move"}:
        return "V3.0.0"
    engine_id = analysis_type.upper().replace("_", "-")
    engine = engine_registry.get_engine(engine_id)
    return getattr(engine, "engine_version", "V3.0.0") if engine else "V3.0.0"

@router.post("/jobs/analysis/{evidence_id}/{analysis_type}", response_model=AnalysisJobResponse, status_code=202)
def queue_analysis_job(
    evidence_id: int,
    analysis_type: str,
    request: Optional[AnalysisJobCreate] = Body(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    evidence = verify_evidence_access(db, evidence_id, current_user)
    request = request or AnalysisJobCreate()
    analysis_type = analysis_type.strip().lower().replace("-", "_")
    engine_version = _engine_version(analysis_type)
    parameters = request.parameters or {}
    legacy_types = {"metadata", "ela", "noise", "jpeg_dct", "copy_move"}
    if parameters and analysis_type in legacy_types:
        raise HTTPException(status_code=422, detail="This analysis engine does not accept parameters")
    canonical_request = {
        "evidence_id": evidence_id,
        "analysis_type": analysis_type,
        "engine_version": engine_version,
        "parameters": parameters,
    }
    if request.force_rerun:
        canonical_request["rerun_nonce"] = uuid.uuid4().hex
    request_hash = hashlib.sha256(
        json.dumps(canonical_request, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()

    if db.get_bind().dialect.name == "postgresql":
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
            {"key": f"analysis-job:{evidence_id}:{request_hash}"},
        )

    existing_job = None if request.force_rerun else db.query(AnalysisJob).filter(AnalysisJob.request_hash == request_hash).first()
    if existing_job is None and not request.force_rerun and not parameters:
        existing_job = (
            db.query(AnalysisJob)
            .filter(
                AnalysisJob.evidence_id == evidence_id,
                AnalysisJob.analysis_type.in_([analysis_type, analysis_type.replace("_", "-")]),
                AnalysisJob.engine_version == engine_version,
            )
            .order_by(AnalysisJob.id.desc())
            .first()
        )
        if existing_job:
            existing_job.request_hash = request_hash
            db.flush()

    if existing_job:
        if existing_job.status == "FAILED":
            existing_job.status = "QUEUED"
            existing_job.queued_at = datetime.datetime.utcnow()
            existing_job.started_at = None
            existing_job.completed_at = None
            existing_job.analysis_id = None
            existing_job.progress_percent = 0
            existing_job.progress_message = "Queued for retry"
            existing_job.error_code = None
            existing_job.safe_error_message = None
            outbox = db.query(AnalysisJobOutbox).filter(AnalysisJobOutbox.job_id == existing_job.id).first()
            if outbox is None:
                outbox = AnalysisJobOutbox(job_id=existing_job.id)
                db.add(outbox)
            else:
                outbox.dispatched_at = None
                outbox.next_attempt_at = datetime.datetime.utcnow()
                outbox.last_error = None
            db.commit()
            db.refresh(existing_job)
            publish_pending_analysis_jobs(outbox_id=outbox.id)
            return existing_job
        return existing_job

    job = AnalysisJob(
        evidence_id=evidence_id,
        analysis_type=analysis_type,
        engine_version=engine_version,
        request_hash=request_hash,
        parameters=parameters,
        status="QUEUED",
        progress_message="Waiting for dispatch",
    )
    db.add(job)
    try:
        db.flush()
        outbox = AnalysisJobOutbox(job_id=job.id)
        db.add(outbox)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing_job = db.query(AnalysisJob).filter(AnalysisJob.request_hash == request_hash).first()
        if existing_job:
            return existing_job
        raise
    db.refresh(job)

    case = db.query(InvestigationCase).filter(InvestigationCase.id == evidence.case_id).first()
    if case:
        AuditService.log_event(db, case.case_identifier, "ANALYSIS_QUEUED", evidence.id, actor=current_user.username, metadata={"analysis_type": analysis_type, "engine_version": engine_version, "request_hash": request_hash, "job_id": job.job_identifier})
    publish_pending_analysis_jobs(outbox_id=outbox.id)

    return job

@router.get("/jobs/{job_id}", response_model=AnalysisJobResponse)
def get_job_status(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = verify_job_access(db, job_id, current_user)
    return job

@router.get("/evidence/{evidence_id}/jobs", response_model=List[AnalysisJobResponse])
def get_evidence_jobs(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    jobs = db.query(AnalysisJob).filter(AnalysisJob.evidence_id == evidence_id).all()
    return jobs

