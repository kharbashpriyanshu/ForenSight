import os
import datetime
from sqlalchemy.orm import Session
from app.models.domain import Analysis, Evidence
from app.core.config import settings
from .engine import CopyMoveEngine
from .exceptions import ImageProcessingError

class CopyMoveAnalyzer:
    @staticmethod
    def run_analysis(db: Session, evidence_id: int) -> Analysis:
        evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
        if not evidence:
            raise ValueError("Evidence not found")
        
        if not os.path.exists(evidence.stored_path):
            raise ValueError("Evidence file is missing on disk")
            
        analysis = Analysis(
            evidence_id=evidence.id,
            analysis_type="COPY_MOVE",
            status="running"
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)

        try:
            output_dir = os.path.join(settings.STORAGE_DIR, "analyses", "copy_move")
            
            res = CopyMoveEngine.run(evidence.stored_path, output_dir)
            
            analysis.status = "completed"
            analysis.summary = "Classical Copy-Move Analysis completed successfully."
            
            map_relative = os.path.relpath(res.visualization_artifact_path, start=settings.STORAGE_DIR).replace("\\", "/")
            
            analysis.structured_findings = {
                "config": res.config.model_dump() if hasattr(res.config, 'model_dump') else res.config.dict(),
                "image_info": res.image_info.model_dump() if hasattr(res.image_info, 'model_dump') else res.image_info.dict(),
                "feature_statistics": res.feature_statistics.model_dump() if hasattr(res.feature_statistics, 'model_dump') else res.feature_statistics.dict(),
                "matching_statistics": res.matching_statistics.model_dump() if hasattr(res.matching_statistics, 'model_dump') else res.matching_statistics.dict(),
                "geometry": res.geometry.model_dump() if hasattr(res.geometry, 'model_dump') else res.geometry.dict(),
                "candidate_regions": res.candidate_regions.model_dump() if hasattr(res.candidate_regions, 'model_dump') else res.candidate_regions.dict(),
                "artifacts": {
                    "copymove_map": map_relative
                }
            }
            
            analysis.completed_at = datetime.datetime.utcnow()
            
            db.commit()
            db.refresh(analysis)
            return analysis
            
        except ImageProcessingError as e:
            analysis.status = "failed"
            analysis.summary = str(e)
            analysis.completed_at = datetime.datetime.utcnow()
            db.commit()
            db.refresh(analysis)
            raise ValueError(str(e))
        except Exception as e:
            analysis.status = "failed"
            analysis.summary = f"Copy-Move Analysis failed: {str(e)}"
            analysis.completed_at = datetime.datetime.utcnow()
            db.commit()
            db.refresh(analysis)
            raise ValueError(f"Copy-Move Analysis failed: {str(e)}")
