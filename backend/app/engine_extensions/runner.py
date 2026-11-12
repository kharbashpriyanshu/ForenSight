"""
ForenSight V4 — Forensic Engine Extension Runner

Dispatches execution to registered V4 forensic engines, integrates with the
database session, records Analysis lifecycle states, saves artifacts, and persists
NormalizedObservations as EvidenceObservation database records.
"""

import os
import datetime
import tempfile
from contextlib import nullcontext
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from app.models.domain import Analysis, Evidence, EvidenceObservation
from app.core.config import settings
from app.services.storage import get_storage_backend
from .registry import engine_registry
from .contract import ExecutionContext
from .status import EngineExecutionStatus


class V4EngineRunner:
    """
    Standardized orchestrator executing registered V4 forensic engines against database evidence.
    """

    @staticmethod
    def run_engine(
        db: Session,
        evidence_id: int,
        engine_id: str,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> Analysis:
        evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
        if not evidence:
            raise ValueError(f"Evidence {evidence_id} not found")

        engine = engine_registry.get_engine(engine_id)
        if not engine:
            raise ValueError(f"Forensic engine '{engine_id}' is not registered")

        analysis_type = engine_id.upper().replace("-", "_")

        analysis = Analysis(
            evidence_id=evidence.id,
            analysis_type=analysis_type,
            status="running",
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)

        try:
            slug = engine_id.lower().replace("-", "_")
            storage = get_storage_backend()
            if storage.is_remote:
                out_ctx = tempfile.TemporaryDirectory(prefix=f"forensight-{slug}-")
                ev_ctx = storage.local_file_path(evidence.stored_path)
            else:
                out_ctx = nullcontext(os.path.join(settings.STORAGE_DIR, "analyses", slug))
                ev_ctx = nullcontext(evidence.stored_path)

            with out_ctx as storage_output_dir, ev_ctx as local_evidence_path:
                context = ExecutionContext(
                    evidence_id=evidence.id,
                    analysis_id=analysis.id,
                    stored_path=str(local_evidence_path),
                    sha256_hash=evidence.sha256_hash or "",
                    mime_type=evidence.mime_type or "",
                    image_format=evidence.image_format or "",
                    width=evidence.width or 0,
                    height=evidence.height or 0,
                    parameters=parameters or {},
                    storage_output_dir=storage_output_dir,
                )

                result = engine.execute(context)

                if result.status == EngineExecutionStatus.NOT_APPLICABLE:
                    analysis.status = "not_applicable"
                    analysis.summary = result.summary
                    analysis.structured_findings = {
                        "not_applicable": True,
                        "reason": result.summary,
                        "guardrail": result.inapplicability_data,
                        "limitations": result.limitations,
                    }
                    analysis.completed_at = datetime.datetime.now(datetime.timezone.utc)
                    db.commit()
                    db.refresh(analysis)
                    return analysis

                elif result.status == EngineExecutionStatus.FAILED:
                    analysis.status = "failed"
                    analysis.summary = result.summary
                    analysis.structured_findings = result.structured_findings
                    analysis.completed_at = datetime.datetime.now(datetime.timezone.utc)
                    db.commit()
                    db.refresh(analysis)
                    raise ValueError(result.summary)

                if storage.is_remote:
                    storage.sync_directory_to_storage(storage_output_dir, f"analyses/{slug}")

                # Applied / Completed
                analysis.status = "completed"
                analysis.summary = result.summary

                # Collate legacy artifacts dictionary
                legacy_artifacts: Dict[str, str] = {}
                for art in result.artifacts:
                    for k, v in art.to_legacy_artifact_dict().items():
                        if storage.is_remote and v and os.path.isabs(v):
                            try:
                                rel = os.path.relpath(v, start=storage_output_dir).replace("\\", "/")
                                legacy_artifacts[k] = f"analyses/{slug}/{rel}"
                                continue
                            except ValueError:
                                pass
                        legacy_artifacts[k] = v

                findings = dict(result.structured_findings)
                findings["artifacts"] = legacy_artifacts
                analysis.structured_findings = findings
                analysis.completed_at = datetime.datetime.now(datetime.timezone.utc)

                # Persist observations
                for obs in result.observations:
                    obs.analysis_id = analysis.id
                    db_obs = obs.to_domain_observation()
                    db.add(db_obs)

                db.commit()
                db.refresh(analysis)
                return analysis

        except ValueError:
            raise
        except Exception as ex:
            analysis.status = "failed"
            analysis.summary = f"Engine execution failed: {str(ex)}"
            analysis.completed_at = datetime.datetime.now(datetime.timezone.utc)
            db.commit()
            db.refresh(analysis)
            raise ValueError(f"Engine execution failed: {str(ex)}")
