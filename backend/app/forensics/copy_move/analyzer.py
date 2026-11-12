import os
import datetime
import tempfile
from contextlib import nullcontext
from sqlalchemy.orm import Session
from app.models.domain import Analysis, Evidence
from app.core.config import settings
from app.services.storage import get_storage_backend
from .engine import CopyMoveEngine
from .exceptions import ImageProcessingError

class CopyMoveAnalyzer:
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
            analysis_type="COPY_MOVE",
            status="running"
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)

        try:
            if storage.is_remote:
                out_ctx = tempfile.TemporaryDirectory(prefix="forensight-copy-move-")
                ev_ctx = storage.local_file_path(evidence.stored_path)
            else:
                out_ctx = nullcontext(os.path.join(settings.STORAGE_DIR, "analyses", "copy_move"))
                ev_ctx = nullcontext(evidence.stored_path)

            with out_ctx as output_dir, ev_ctx as local_ev_path:
                res = CopyMoveEngine.run(str(local_ev_path), output_dir)

                if storage.is_remote:
                    storage.sync_directory_to_storage(output_dir, "analyses/copy_move")
                    def _rel(p: str) -> str:
                        return "analyses/copy_move/" + os.path.relpath(p, start=output_dir).replace("\\", "/")
                else:
                    def _rel(p: str) -> str:
                        return os.path.relpath(p, start=settings.STORAGE_DIR).replace("\\", "/")

                analysis.status = "completed"
                analysis.summary = "Classical Copy-Move Analysis completed successfully."

                map_relative = _rel(res.visualization_artifact_path)
                sbs_relative = (
                    _rel(res.side_by_side_artifact_path)
                    if res.side_by_side_artifact_path and os.path.exists(res.side_by_side_artifact_path)
                    else None
                )

                artifacts_payload = {"copymove_map": map_relative}
                if sbs_relative:
                    artifacts_payload["side_by_side_map"] = sbs_relative

                analysis.structured_findings = {
                    "config": res.config.model_dump() if hasattr(res.config, 'model_dump') else res.config.dict(),
                    "image_info": res.image_info.model_dump() if hasattr(res.image_info, 'model_dump') else res.image_info.dict(),
                    "feature_statistics": res.feature_statistics.model_dump() if hasattr(res.feature_statistics, 'model_dump') else res.feature_statistics.dict(),
                    "matching_statistics": res.matching_statistics.model_dump() if hasattr(res.matching_statistics, 'model_dump') else res.matching_statistics.dict(),
                    "geometry": res.geometry.model_dump() if hasattr(res.geometry, 'model_dump') else res.geometry.dict(),
                    "candidate_regions": res.candidate_regions.model_dump() if hasattr(res.candidate_regions, 'model_dump') else res.candidate_regions.dict(),
                    "artifacts": artifacts_payload
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
