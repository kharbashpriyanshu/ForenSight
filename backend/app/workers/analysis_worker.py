import datetime
from datetime import timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError, InterfaceError
from sqlalchemy import or_, and_
from celery.exceptions import Retry
from app.core.celery_app import celery_app
from app.db.database import SessionLocal
from app.models.domain import AnalysisJob, Evidence, Analysis, InvestigationCase
from app.services.audit import AuditService
from app.core.config import settings
from app.forensics.metadata.analyzer import MetadataAnalyzer
from app.forensics.ela.analyzer import ELAAnalyzer
from app.forensics.noise.analyzer import NoiseAnalyzer
from app.forensics.jpeg_dct.analyzer import JPEGDCTAnalyzer
from app.forensics.copy_move.analyzer import CopyMoveAnalyzer
import os
import re

@celery_app.task(
    bind=True,
    name="run_analysis",
    acks_late=True,
    reject_on_worker_lost=True,
    max_retries=2,
    soft_time_limit=settings.ANALYSIS_JOB_SOFT_TIME_LIMIT_SECONDS,
    time_limit=settings.ANALYSIS_JOB_TIME_LIMIT_SECONDS,
)
def run_analysis_task(self, job_id: int):
    from app.main import app
    from app.db.database import get_db
    
    if get_db in app.dependency_overrides:
        override = app.dependency_overrides[get_db]
        gen = override()
        db: Session = next(gen) if hasattr(gen, "__next__") else gen
    else:
        db = SessionLocal()

    try:
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).with_for_update().first()
        if not job:
            return {"status": "error", "message": "Job not found"}

        if job.status == "COMPLETED":
            return {"status": "success", "job_id": job.id, "duplicate_delivery": True}
        redelivered = bool((self.request.delivery_info or {}).get("redelivered"))
        if job.status == "RUNNING" and not redelivered and job.started_at:
            age = (datetime.datetime.now(timezone.utc).replace(tzinfo=None) - job.started_at).total_seconds()
            if age < settings.ANALYSIS_JOB_STALE_AFTER_SECONDS:
                return {"status": "already_running", "job_id": job.id, "duplicate_delivery": True}
        
        job.status = "RUNNING"
        job.started_at = datetime.datetime.now(timezone.utc).replace(tzinfo=None)
        job.attempt_count = (job.attempt_count or 0) + 1
        job.progress_percent = 5
        job.progress_message = "Preparing evidence and analysis engine"
        db.commit()

        evidence = db.query(Evidence).filter(Evidence.id == job.evidence_id).first()
        if not evidence:
            job.status = "FAILED"
            job.completed_at = datetime.datetime.now(timezone.utc).replace(tzinfo=None)
            job.progress_message = "Evidence record is missing"
            job.safe_error_message = "The evidence record for this analysis no longer exists."
            db.commit()
            return {"status": "failed", "job_id": job.id}
        case = db.query(InvestigationCase).filter(InvestigationCase.id == evidence.case_id).first()
        
        analysis_type = job.analysis_type.lower()
        canonical_type = analysis_type.upper().replace("-", "_")
        previous_result = (
            db.query(Analysis)
            .filter(
                Analysis.evidence_id == evidence.id,
                Analysis.analysis_type.ilike(canonical_type),
                Analysis.status == "completed",
                Analysis.created_at >= job.queued_at,
            )
            .order_by(Analysis.id.desc())
            .first()
        )
        if previous_result:
            job.analysis_id = previous_result.id
            job.status = "COMPLETED"
            job.completed_at = datetime.datetime.now(timezone.utc).replace(tzinfo=None)
            job.progress_percent = 100
            job.progress_message = "Analysis result recovered after worker retry"
            job.safe_error_message = None
            db.commit()
            return {"status": "success", "job_id": job.id, "recovered_existing_result": True}

        if case:
            AuditService.log_event(db, case.case_identifier, "ANALYSIS_STARTED", evidence.id, metadata={"analysis_type": analysis_type, "job_id": job.job_identifier})
        
        # Dispatch to engine
        try:
            job.progress_percent = 20
            job.progress_message = "Running forensic analysis"
            db.commit()
            analysis = None
            if analysis_type in ("metadata",):
                analysis = MetadataAnalyzer.run_analysis(db, evidence.id)
            elif analysis_type in ("ela",):
                analysis = ELAAnalyzer.run_analysis(db, evidence.id)
            elif analysis_type in ("noise",):
                analysis = NoiseAnalyzer.run_analysis(db, evidence.id)
            elif analysis_type in ("jpeg-dct", "jpeg_dct"):
                analysis = JPEGDCTAnalyzer.run_analysis(db, evidence.id)
            elif analysis_type in ("copy-move", "copy_move"):
                analysis = CopyMoveAnalyzer.run_analysis(db, evidence.id)
            elif analysis_type in ("jpeg-structure", "jpeg_structure"):
                from app.engine_extensions.runner import V4EngineRunner
                analysis = V4EngineRunner.run_engine(db, evidence.id, "JPEG-STRUCTURE", parameters=job.parameters or {})
            elif analysis_type in ("jpeg-qt", "jpeg_qt"):
                from app.engine_extensions.runner import V4EngineRunner
                analysis = V4EngineRunner.run_engine(db, evidence.id, "JPEG-QT", parameters=job.parameters or {})
            elif analysis_type in ("jpeg-huffman", "jpeg_huffman"):
                from app.engine_extensions.runner import V4EngineRunner
                analysis = V4EngineRunner.run_engine(db, evidence.id, "JPEG-HUFFMAN", parameters=job.parameters or {})
            elif analysis_type in ("jpeg-ghost", "jpeg_ghost"):
                from app.engine_extensions.runner import V4EngineRunner
                analysis = V4EngineRunner.run_engine(db, evidence.id, "JPEG-GHOST", parameters=job.parameters or {})
            elif analysis_type in ("adjpeg",):
                from app.engine_extensions.runner import V4EngineRunner
                analysis = V4EngineRunner.run_engine(db, evidence.id, "ADJPEG", parameters=job.parameters or {})
            elif analysis_type in ("nadjpeg",):
                from app.engine_extensions.runner import V4EngineRunner
                analysis = V4EngineRunner.run_engine(db, evidence.id, "NADJPEG", parameters=job.parameters or {})
            elif analysis_type in ("geometry-perspective", "geometry_perspective"):
                from app.engine_extensions.runner import V4EngineRunner
                analysis = V4EngineRunner.run_engine(db, evidence.id, "GEOMETRY-PERSPECTIVE", parameters=job.parameters or {})
            elif analysis_type in ("physics-lighting", "physics_lighting"):
                from app.engine_extensions.runner import V4EngineRunner
                analysis = V4EngineRunner.run_engine(db, evidence.id, "PHYSICS-LIGHTING", parameters=job.parameters or {})
            else:
                from app.engine_extensions.registry import engine_registry
                from app.engine_extensions.runner import V4EngineRunner
                hyp_engine_id = analysis_type.upper().replace("_", "-")
                if engine_registry.get_engine(hyp_engine_id):
                    analysis = V4EngineRunner.run_engine(db, evidence.id, hyp_engine_id, parameters=job.parameters or {})
                else:
                    raise ValueError(f"Unknown analysis type {analysis_type}")
                
            if analysis:
                job.analysis_id = analysis.id
            
            job.status = "COMPLETED"
            job.completed_at = datetime.datetime.now(timezone.utc).replace(tzinfo=None)
            job.progress_percent = 100
            job.progress_message = "Analysis completed"
            job.safe_error_message = None
            db.commit()
            if case:
                AuditService.log_event(db, case.case_identifier, "ANALYSIS_COMPLETED", evidence.id, metadata={"analysis_type": analysis_type, "job_id": job.job_identifier})
            return {"status": "success", "job_id": job.id}
        except (OperationalError, InterfaceError) as e:
            db.rollback()
            retry_job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
            if retry_job and self.request.retries < self.max_retries:
                retry_job.status = "RETRYING"
                retry_job.progress_message = "Temporary database or worker error; retry scheduled"
                retry_job.safe_error_message = "Temporary infrastructure error; retry scheduled"
                db.commit()
                raise self.retry(exc=e, countdown=2 ** (self.request.retries + 1))
            if retry_job:
                retry_job.status = "FAILED"
                retry_job.completed_at = datetime.datetime.now(timezone.utc).replace(tzinfo=None)
                retry_job.progress_message = "Infrastructure retries exhausted"
                retry_job.safe_error_message = "Analysis could not complete after temporary infrastructure retries"
                db.commit()
            return {"status": "failed", "job_id": job_id}
        except Exception as e:
            # Forensic failure (e.g. invalid format)
            # Sanitize error message: extract concise reason without stacktraces or internal paths
            raw_err = str(e).strip()
            clean_err = raw_err.split("failed:", 1)[-1].strip() if "failed:" in raw_err.lower() else raw_err
            for internal_path in (os.path.abspath(evidence.stored_path), os.path.abspath(settings.STORAGE_DIR), os.getcwd()):
                clean_err = clean_err.replace(internal_path, "[internal path]")
            clean_err = re.sub(r"[A-Za-z]:\\[^\s:]+", "[internal path]", clean_err)
            clean_err = clean_err[:500] or "The forensic engine reported an unspecified error."

            job.status = "FAILED"
            job.completed_at = datetime.datetime.now(timezone.utc).replace(tzinfo=None)
            job.progress_message = "Analysis failed"
            job.safe_error_message = clean_err
            
            # If an analysis was created and failed, associate it
            latest_analysis = (
                db.query(Analysis)
                .filter(Analysis.evidence_id == evidence.id, Analysis.analysis_type.ilike(analysis_type))
                .order_by(Analysis.id.desc())
                .first()
            )
            if latest_analysis and not job.analysis_id:
                job.analysis_id = latest_analysis.id

            db.commit()
            if case:
                AuditService.log_event(db, case.case_identifier, "ANALYSIS_FAILED", evidence.id, metadata={"analysis_type": analysis_type, "job_id": job.job_identifier, "error": clean_err})
            
            return {"status": "failed", "error": clean_err}

    except Retry:
        raise
    except (OperationalError, InterfaceError) as e:
        db.rollback()
        try:
            failed_or_retrying = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
            if failed_or_retrying and self.request.retries < self.max_retries:
                failed_or_retrying.status = "RETRYING"
                failed_or_retrying.progress_message = "Temporary database error; retry scheduled"
                failed_or_retrying.safe_error_message = "Temporary infrastructure error; retry scheduled"
                db.commit()
                raise self.retry(exc=e, countdown=2 ** (self.request.retries + 1))
            if failed_or_retrying:
                failed_or_retrying.status = "FAILED"
                failed_or_retrying.completed_at = datetime.datetime.now(timezone.utc).replace(tzinfo=None)
                failed_or_retrying.progress_message = "Infrastructure retries exhausted"
                failed_or_retrying.safe_error_message = "Analysis could not complete after temporary infrastructure retries"
                db.commit()
        except Retry:
            raise
        except Exception:
            db.rollback()
        return {"status": "failed", "job_id": job_id}
    except Exception as e:
        db.rollback()
        failed_job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        if failed_job:
            failed_job.status = "FAILED"
            failed_job.completed_at = datetime.datetime.now(timezone.utc).replace(tzinfo=None)
            failed_job.progress_message = "Analysis worker encountered an unexpected error"
            failed_job.safe_error_message = "An unexpected worker error occurred. Check system health and worker logs before retrying."
            db.commit()
        return {"status": "error", "job_id": job_id}
    finally:
        db.close()


@celery_app.task(name="reconcile_stale_analysis_jobs")
def reconcile_stale_analysis_jobs():
    """Mark jobs abandoned beyond the configured worker time limit as recoverable failures."""
    db: Session = SessionLocal()
    cutoff = datetime.datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=settings.ANALYSIS_JOB_STALE_AFTER_SECONDS)
    reconciled = 0
    try:
        stale_jobs = (
            db.query(AnalysisJob)
            .filter(or_(
                and_(AnalysisJob.status.in_(["RUNNING", "RETRYING"]), AnalysisJob.started_at < cutoff),
                and_(AnalysisJob.status == "QUEUED", AnalysisJob.queued_at < cutoff),
            ))
            .all()
        )
        for job in stale_jobs:
            job.status = "FAILED"
            job.completed_at = datetime.datetime.now(timezone.utc).replace(tzinfo=None)
            job.progress_message = "Worker lease expired; submit a new run to retry"
            job.safe_error_message = "The analysis worker stopped before completing this job. You can queue it again."
            case = (
                db.query(InvestigationCase)
                .join(Evidence, Evidence.case_id == InvestigationCase.id)
                .filter(Evidence.id == job.evidence_id)
                .first()
            )
            if case:
                AuditService.log_event(
                    db, case.case_identifier, "ANALYSIS_WORKER_TIMEOUT", job.evidence_id,
                    metadata={"analysis_type": job.analysis_type, "job_id": job.job_identifier},
                )
            reconciled += 1
        db.commit()
        return {"reconciled": reconciled}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


@celery_app.task(name="dispatch_pending_analysis_jobs")
def dispatch_pending_analysis_jobs():
    """Retry durable job messages whose previous publish attempt did not reach Redis."""
    from app.services.job_dispatch import publish_pending_analysis_jobs

    return publish_pending_analysis_jobs(limit=100)
