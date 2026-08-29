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
    db: Session = SessionLocal()
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
        result_data = None
        
        try:
            if analysis_type == "metadata":
                analyzer = MetadataAnalyzer()
                result_data = analyzer.analyze(evidence.stored_path)
            elif analysis_type == "ela":
                analyzer = ELAAnalyzer()
                result_data = analyzer.analyze(evidence.stored_path)
            elif analysis_type == "noise":
                analyzer = NoiseAnalyzer()
                result_data = analyzer.analyze(evidence.stored_path)
            elif analysis_type == "jpeg-dct":
                analyzer = JPEGDCTAnalyzer()
                result_data = analyzer.analyze(evidence.stored_path)
            elif analysis_type == "copy-move":
                analyzer = CopyMoveAnalyzer()
                result_data = analyzer.analyze(evidence.stored_path)
            else:
                raise ValueError(f"Unknown analysis type {analysis_type}")
                
            # Analysis successful
            analysis = db.query(Analysis).filter(Analysis.id == job.analysis_id).first()
            if analysis:
                analysis.status = "completed"
                analysis.completed_at = datetime.datetime.utcnow()
                analysis.structured_findings = result_data.get("findings", {})
                analysis.summary = result_data.get("summary", "")
            
            job.status = "COMPLETED"
            job.completed_at = datetime.datetime.utcnow()
            db.commit()
            if case:
                AuditService.log_event(db, case.case_identifier, "ANALYSIS_COMPLETED", evidence.id, metadata={"analysis_type": analysis_type, "job_id": job.job_identifier})
            return {"status": "success", "job_id": job.id}
            
        except Exception as e:
            # Forensic failure (e.g. invalid format)
            job.status = "FAILED"
            job.completed_at = datetime.datetime.utcnow()
            job.safe_error_message = str(e)
            if case:
                AuditService.log_event(db, case.case_identifier, "ANALYSIS_FAILED", evidence.id, metadata={"analysis_type": analysis_type, "job_id": job.job_identifier, "error": str(e)})
            
            analysis = db.query(Analysis).filter(Analysis.id == job.analysis_id).first()
            if analysis:
                analysis.status = "failed"
                analysis.completed_at = datetime.datetime.utcnow()
                analysis.summary = str(e)
                
            db.commit()
            return {"status": "failed", "error": str(e)}

    except Exception as e:
        db.rollback()
        return {"status": "error", "error": str(e)}
    finally:
        db.close()
