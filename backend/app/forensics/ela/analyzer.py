import os
import datetime
import tempfile
from contextlib import nullcontext
from sqlalchemy.orm import Session
from app.models.domain import Analysis, Evidence
from app.core.config import settings
from app.services.storage import get_storage_backend
from .engine import ELAEngine

class ELAAnalyzer:
    @staticmethod
    def run_analysis(db: Session, evidence_id: int) -> Analysis:
        evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
        if not evidence:
            raise ValueError("Evidence not found")

        storage = get_storage_backend()
        if not storage.exists(evidence.stored_path):
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
            if storage.is_remote:
                out_ctx = tempfile.TemporaryDirectory(prefix="forensight-ela-")
                ev_ctx = storage.local_file_path(evidence.stored_path)
            else:
                out_ctx = nullcontext(os.path.join(settings.STORAGE_DIR, "analyses", "ela"))
                ev_ctx = nullcontext(evidence.stored_path)

            with out_ctx as ela_output_dir, ev_ctx as local_ev_path:
                res = ELAEngine.run(str(local_ev_path), ela_output_dir)

                if storage.is_remote:
                    storage.sync_directory_to_storage(ela_output_dir, "analyses/ela")
                    def _rel(p: str) -> str:
                        return "analyses/ela/" + os.path.relpath(p, start=ela_output_dir).replace("\\", "/")
                else:
                    def _rel(p: str) -> str:
                        return os.path.relpath(p, start=settings.STORAGE_DIR).replace("\\", "/")

                analysis.status = "completed"
                analysis.summary = "Error Level Analysis completed successfully."

                ela_map_relative = _rel(res.error_image_path)
                recomp_relative = _rel(res.recompressed_image_path)
                ela_map_dynamic_relative = _rel(res.dynamic_error_image_path) if res.dynamic_error_image_path else ela_map_relative
                ela_map_fixed20_relative = _rel(res.fixed_error_image_path) if res.fixed_error_image_path else ela_map_relative

                scale_modes_dict = {}
                if res.scale_modes:
                    for k, v in res.scale_modes.items():
                        mode_copy = dict(v)
                        if "artifact_path" in mode_copy:
                            mode_copy["artifact_path"] = _rel(mode_copy["artifact_path"])
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
