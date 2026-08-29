import os
import datetime
from sqlalchemy.orm import Session
from app.models.domain import Analysis, Evidence
from app.core.config import settings
from .engine import ELAEngine

class ELAAnalyzer:
    @staticmethod
    def run_analysis(db: Session, evidence_id: int) -> Analysis:
        evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
        if not evidence:
            raise ValueError("Evidence not found")
        
        if not os.path.exists(evidence.stored_path):
            raise ValueError("Evidence file is missing on disk")
            
        analysis = Analysis(
            evidence_id=evidence.id,
            analysis_type="ELA",
            status="running"
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)

        try:
            ela_output_dir = os.path.join(settings.STORAGE_DIR, "analyses", "ela")
            
            res = ELAEngine.run(evidence.stored_path, ela_output_dir)
            
            analysis.status = "completed"
            analysis.summary = "Error Level Analysis completed successfully."
            
            # Generate relative paths for secure exposure
            ela_map_relative = os.path.relpath(res.error_image_path, start=settings.STORAGE_DIR)
            recomp_relative = os.path.relpath(res.recompressed_image_path, start=settings.STORAGE_DIR)
            
            # Normalize path separators for URL safety
            ela_map_relative = ela_map_relative.replace("\\", "/")
            recomp_relative = recomp_relative.replace("\\", "/")
            
            analysis.structured_findings = {
                "jpeg_quality": res.jpeg_quality,
                "width": res.width,
                "height": res.height,
                "mean_error": res.statistics.mean_error,
                "median_error": res.statistics.median_error,
                "std_error": res.statistics.std_error,
                "max_error": res.statistics.max_error,
                "percentiles": res.statistics.percentiles,
                "artifacts": {
                    "ela_map": ela_map_relative,
                    "recompressed": recomp_relative
                }
            }
            analysis.completed_at = datetime.datetime.utcnow()
            
            db.commit()
            db.refresh(analysis)
            return analysis
            
        except Exception as e:
            analysis.status = "failed"
            analysis.summary = f"ELA Analysis failed: {str(e)}"
            analysis.completed_at = datetime.datetime.utcnow()
            db.commit()
            db.refresh(analysis)
            raise ValueError(f"ELA Analysis failed: {str(e)}")
