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
            ela_map_relative = os.path.relpath(res.error_image_path, start=settings.STORAGE_DIR).replace("\\", "/")
            recomp_relative = os.path.relpath(res.recompressed_image_path, start=settings.STORAGE_DIR).replace("\\", "/")
            ela_map_dynamic_relative = os.path.relpath(res.dynamic_error_image_path, start=settings.STORAGE_DIR).replace("\\", "/") if res.dynamic_error_image_path else ela_map_relative
            ela_map_fixed20_relative = os.path.relpath(res.fixed_error_image_path, start=settings.STORAGE_DIR).replace("\\", "/") if res.fixed_error_image_path else ela_map_relative
            
            scale_modes_dict = {}
            if res.scale_modes:
                for k, v in res.scale_modes.items():
                    mode_copy = dict(v)
                    if "artifact_path" in mode_copy:
                        mode_copy["artifact_path"] = os.path.relpath(mode_copy["artifact_path"], start=settings.STORAGE_DIR).replace("\\", "/")
                    scale_modes_dict[k] = mode_copy

            analysis.structured_findings = {
                "jpeg_quality": res.jpeg_quality,
                "width": res.width,
                "height": res.height,
                "mean_error": res.statistics.mean_error,
                "median_error": res.statistics.median_error,
                "std_error": res.statistics.std_error,
                "max_error": res.statistics.max_error,
                "percentiles": res.statistics.percentiles,
                "scale_modes": scale_modes_dict,
                "artifacts": {
                    "ela_map": ela_map_relative,
                    "ela_map_dynamic": ela_map_dynamic_relative,
                    "ela_map_fixed20": ela_map_fixed20_relative,
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
