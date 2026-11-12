import os
import datetime
import tempfile
from contextlib import nullcontext
from sqlalchemy.orm import Session
from app.models.domain import Analysis, Evidence
from app.core.config import settings
from app.services.storage import get_storage_backend
from .engine import NoiseEngine

class NoiseAnalyzer:
    @staticmethod
    def run_analysis(db: Session, evidence_id: int, filter_method: str = "Gaussian", kernel_size: int = 5) -> Analysis:
        evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
        if not evidence:
            raise ValueError("Evidence not found")

        storage = get_storage_backend()
        if not storage.exists(evidence.stored_path):
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
            if storage.is_remote:
                out_ctx = tempfile.TemporaryDirectory(prefix="forensight-noise-")
                ev_ctx = storage.local_file_path(evidence.stored_path)
            else:
                out_ctx = nullcontext(os.path.join(settings.STORAGE_DIR, "analyses", "noise"))
                ev_ctx = nullcontext(evidence.stored_path)

            with out_ctx as noise_output_dir, ev_ctx as local_ev_path:
                res = NoiseEngine.run(str(local_ev_path), noise_output_dir, filter_method=filter_method, kernel_size=kernel_size)

                if storage.is_remote:
                    storage.sync_directory_to_storage(noise_output_dir, "analyses/noise")
                    def _rel(p: str) -> str:
                        return "analyses/noise/" + os.path.relpath(p, start=noise_output_dir).replace("\\", "/")
                else:
                    def _rel(p: str) -> str:
                        return os.path.relpath(p, start=settings.STORAGE_DIR).replace("\\", "/")

                analysis.status = "completed"
                analysis.summary = "Noise Residual Analysis completed successfully."

                global_map_relative = _rel(res.residual_image_path)
                local_map_relative = _rel(res.local_map_image_path)

                artifacts_dict = {
                    "noise_residual_map": global_map_relative,
                    "noise_local_map": local_map_relative
                }

                comparative_dict = {}
                if res.comparative_methods:
                    for k, v in res.comparative_methods.items():
                        c_copy = dict(v)
                        if "artifact_path" in c_copy and c_copy["artifact_path"]:
                            rel_p = _rel(c_copy["artifact_path"])
                            c_copy["artifact_path"] = rel_p
                            if k == "gaussian":
                                artifacts_dict["noise_residual_gaussian"] = rel_p
                            elif k == "median":
                                artifacts_dict["noise_residual_median"] = rel_p
                        comparative_dict[k] = c_copy

                if res.comparison_local_map_image_path:
                    comp_loc_rel = _rel(res.comparison_local_map_image_path)
                    comp_m = (res.comparison_filter_config.method if res.comparison_filter_config else "comparison").lower()
                    artifacts_dict[f"noise_local_{comp_m}"] = comp_loc_rel

                analysis.structured_findings = {
                    "width": res.width,
                    "height": res.height,
                    "filter_config": res.filter_config.dict(),
                    "global_statistics": res.global_statistics.dict(),
                    "local_config": res.local_config.dict(),
                    "local_statistics": res.local_statistics.dict(),
                    "comparative_methods": comparative_dict,
                    "artifacts": artifacts_dict
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
