from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.domain import AnalysisJob, Evidence, Analysis, generate_job_id, InvestigationCase
from app.services.audit import AuditService
from app.schemas.domain import AnalysisJobResponse
from app.workers.analysis_worker import run_analysis_task
from typing import List

router = APIRouter()

@router.post("/jobs/analysis/{evidence_id}/{analysis_type}", response_model=AnalysisJobResponse, status_code=202)
def queue_analysis_job(evidence_id: int, analysis_type: str, db: Session = Depends(get_db)):
    evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")

    # Prevent duplicates if already queued or completed successfully
    existing_job = db.query(AnalysisJob).filter(
        AnalysisJob.evidence_id == evidence_id,
        AnalysisJob.analysis_type == analysis_type,
        AnalysisJob.status.in_(["QUEUED", "RUNNING", "COMPLETED"])
    ).first()
    
    if existing_job and existing_job.status == "COMPLETED":
        return existing_job # Already done
        
    if existing_job:
        return existing_job # Already queued/running

    # Create the base Analysis record which the worker will update
    analysis = Analysis(evidence_id=evidence_id, analysis_type=analysis_type)
    db.add(analysis)
    db.flush() # Get analysis.id

    # Create the Job record
    job = AnalysisJob(
        evidence_id=evidence_id,
        analysis_id=analysis.id,
        analysis_type=analysis_type,
        status="QUEUED"
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    
    # Audit log
    case = db.query(InvestigationCase).filter(InvestigationCase.id == evidence.case_id).first()
    if case:
        AuditService.log_event(db, case.case_identifier, "ANALYSIS_QUEUED", evidence.id, metadata={"analysis_type": analysis_type, "job_id": job.job_identifier})

    # Dispatch to Celery
    try:
        run_analysis_task.delay(job.id)
    except Exception as e:
        # Fallback if celery is completely unreachable, mark failed
        job.status = "FAILED"
        job.safe_error_message = "Analysis worker unavailable"
        db.commit()

    return job

@router.get("/jobs/{job_id}", response_model=AnalysisJobResponse)
def get_job_status(job_id: int, db: Session = Depends(get_db)):
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.get("/evidence/{evidence_id}/jobs", response_model=List[AnalysisJobResponse])
def get_evidence_jobs(evidence_id: int, db: Session = Depends(get_db)):
    jobs = db.query(AnalysisJob).filter(AnalysisJob.evidence_id == evidence_id).all()
    return jobs
