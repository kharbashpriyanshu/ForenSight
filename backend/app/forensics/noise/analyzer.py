import os
import datetime
from sqlalchemy.orm import Session
from app.models.domain import Analysis, Evidence
from app.core.config import settings
from .engine import NoiseEngine

class NoiseAnalyzer:
    @staticmethod
    def run_analysis(db: Session, evidence_id: int) -> Analysis:
        evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
        if not evidence:
            raise ValueError("Evidence not found")
        
        if not os.path.exists(evidence.stored_path):
            raise ValueError("Evidence file is missing on disk")
            
        analysis = Analysis(
            evidence_id=evidence.id,
            analysis_type="NOISE",
            status="running"
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)

        try:
            noise_output_dir = os.path.join(settings.STORAGE_DIR, "analyses", "noise")
            
            res = NoiseEngine.run(evidence.stored_path, noise_output_dir)
            
            analysis.status = "completed"
            analysis.summary = "Noise Residual Analysis completed successfully."
            
            global_map_relative = os.path.relpath(res.residual_image_path, start=settings.STORAGE_DIR).replace("\\", "/")
            local_map_relative = os.path.relpath(res.local_map_image_path, start=settings.STORAGE_DIR).replace("\\", "/")
            
            analysis.structured_findings = {
                "width": res.width,
                "height": res.height,
                "filter_config": res.filter_config.dict(),
                "global_statistics": res.global_statistics.dict(),
                "local_config": res.local_config.dict(),
                "local_statistics": res.local_statistics.dict(),
                "artifacts": {
                    "noise_residual_map": global_map_relative,
                    "noise_local_map": local_map_relative
                }
            }
            analysis.completed_at = datetime.datetime.utcnow()
            
            db.commit()
            db.refresh(analysis)
            return analysis
            
        except Exception as e:
            analysis.status = "failed"
            analysis.summary = f"Noise Analysis failed: {str(e)}"
            analysis.completed_at = datetime.datetime.utcnow()
            db.commit()
            db.refresh(analysis)
            raise ValueError(f"Noise Analysis failed: {str(e)}")
