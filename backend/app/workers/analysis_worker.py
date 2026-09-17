import datetime
from sqlalchemy.orm import Session
from app.core.celery_app import celery_app
from app.db.database import SessionLocal
from app.models.domain import AnalysisJob, Evidence, Analysis, InvestigationCase
from app.services.audit import AuditService
from app.forensics.metadata.analyzer import MetadataAnalyzer
from app.forensics.ela.analyzer import ELAAnalyzer
from app.forensics.noise.analyzer import NoiseAnalyzer
from app.forensics.jpeg_dct.analyzer import JPEGDCTAnalyzer
from app.forensics.copy_move.analyzer import CopyMoveAnalyzer
import traceback

@celery_app.task(bind=True, name="run_analysis")
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
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        if not job:
            return {"status": "error", "message": "Job not found"}
        
        job.status = "RUNNING"
        job.started_at = datetime.datetime.utcnow()
        db.commit()

        evidence = db.query(Evidence).filter(Evidence.id == job.evidence_id).first()
        case = db.query(InvestigationCase).filter(InvestigationCase.id == evidence.case_id).first()
        
        analysis_type = job.analysis_type.lower()
        if case:
            AuditService.log_event(db, case.case_identifier, "ANALYSIS_STARTED", evidence.id, metadata={"analysis_type": analysis_type, "job_id": job.job_identifier})
        
        # Dispatch to engine
        try:
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
            else:
                raise ValueError(f"Unknown analysis type {analysis_type}")
                
            if analysis:
                job.analysis_id = analysis.id
            
            job.status = "COMPLETED"
            job.completed_at = datetime.datetime.utcnow()
            job.safe_error_message = None
            db.commit()
            if case:
                AuditService.log_event(db, case.case_identifier, "ANALYSIS_COMPLETED", evidence.id, metadata={"analysis_type": analysis_type, "job_id": job.job_identifier})
            return {"status": "success", "job_id": job.id}
            
        except Exception as e:
            # Forensic failure (e.g. invalid format)
            # Sanitize error message: extract concise reason without stacktraces or internal paths
            raw_err = str(e).strip()
            clean_err = raw_err.split("failed:", 1)[-1].strip() if "failed:" in raw_err.lower() else raw_err

            job.status = "FAILED"
            job.completed_at = datetime.datetime.utcnow()
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

    except Exception as e:
        db.rollback()
        return {"status": "error", "error": str(e)}
    finally:
        db.close()
