import os
import datetime
import tempfile
from contextlib import nullcontext
from sqlalchemy.orm import Session
from app.models.domain import Analysis, Evidence
from app.core.config import settings
from app.services.storage import get_storage_backend
from .engine import JPEGDCTEngine
from .exceptions import UnsupportedFormatError

class JPEGDCTAnalyzer:
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
            analysis_type="JPEG_DCT",
            status="running"
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)

        try:
            if storage.is_remote:
                out_ctx = tempfile.TemporaryDirectory(prefix="forensight-jpeg-dct-")
                ev_ctx = storage.local_file_path(evidence.stored_path)
            else:
                out_ctx = nullcontext(os.path.join(settings.STORAGE_DIR, "analyses", "jpeg_dct"))
                ev_ctx = nullcontext(evidence.stored_path)

            with out_ctx as output_dir, ev_ctx as local_ev_path:
                res = JPEGDCTEngine.run(str(local_ev_path), output_dir)

                if storage.is_remote:
                    storage.sync_directory_to_storage(output_dir, "analyses/jpeg_dct")
                    map_relative = "analyses/jpeg_dct/" + os.path.relpath(res.visualization_artifact_path, start=output_dir).replace("\\", "/")
                else:
                    map_relative = os.path.relpath(res.visualization_artifact_path, start=settings.STORAGE_DIR).replace("\\", "/")

                analysis.status = "completed"
                analysis.summary = "JPEG/DCT Forensic Analysis completed successfully."

                analysis.structured_findings = {
                    "image_width": res.image_width,
                    "image_height": res.image_height,
                    "padded_width": res.padded_width,
                    "padded_height": res.padded_height,
                    "total_blocks": res.total_blocks,
                    "jpeg_format": res.jpeg_format,
                    "quantization_tables": [q.model_dump() if hasattr(q, 'model_dump') else q.dict() for q in res.quantization_tables],
                    "dc_statistics": res.dc_statistics.model_dump() if hasattr(res.dc_statistics, 'model_dump') else res.dc_statistics.dict(),
                    "ac_statistics": res.ac_statistics.model_dump() if hasattr(res.ac_statistics, 'model_dump') else res.ac_statistics.dict(),
                    "band_statistics": res.band_statistics.model_dump() if hasattr(res.band_statistics, 'model_dump') else res.band_statistics.dict(),
                    "artifacts": {
                        "dct_energy_map": map_relative
                    }
                }

                analysis.completed_at = datetime.datetime.utcnow()
            
            db.commit()
            db.refresh(analysis)
            return analysis
            
        except UnsupportedFormatError as e:
            analysis.status = "failed"
            analysis.summary = str(e)
            analysis.completed_at = datetime.datetime.utcnow()
            db.commit()
            db.refresh(analysis)
            raise ValueError(str(e))
        except Exception as e:
            analysis.status = "failed"
            analysis.summary = f"JPEG/DCT Analysis failed: {str(e)}"
            analysis.completed_at = datetime.datetime.utcnow()
            db.commit()
            db.refresh(analysis)
            raise ValueError(f"JPEG/DCT Analysis failed: {str(e)}")
