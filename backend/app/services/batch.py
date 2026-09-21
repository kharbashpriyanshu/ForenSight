import datetime
from typing import List, Optional, Dict, Any
from fastapi import UploadFile
from sqlalchemy.orm import Session
from app.models.domain import InvestigationCase, Evidence, AnalysisJob
from app.services.evidence import EvidenceService
from app.services.audit import AuditService
from app.schemas.v3 import (
    BatchUploadResponse,
    BatchUploadItemResult,
    BatchAnalysisStatusResponse,
    BatchJobItemStatus,
)
from app.workers.analysis_worker import run_analysis_task

CORE_MODALITIES = ["metadata", "ela", "noise", "jpeg-dct", "copy-move"]

class BatchService:
    @staticmethod
    def process_batch_upload(
        db: Session,
        case: InvestigationCase,
        files: List[UploadFile],
        actor: str = "System"
    ) -> BatchUploadResponse:
        results = []
        failed_items = []
        total_bytes = 0

        for file in files:
            try:
                evidence = EvidenceService.process_and_store_evidence(db, case.id, file)
                total_bytes += (evidence.file_size or 0)
                AuditService.log_event(
                    db=db,
                    case_id=case.case_identifier,
                    event_type="EVIDENCE_UPLOADED",
                    evidence_id=evidence.id,
                    actor=actor,
                    metadata={"filename": file.filename, "file_size": evidence.file_size}
                )
                results.append(BatchUploadItemResult(
                    id=evidence.id,
                    evidence_identifier=evidence.evidence_identifier,
                    original_filename=evidence.original_filename,
                    mime_type=evidence.mime_type,
                    file_size=evidence.file_size,
                    sha256_hash=evidence.sha256_hash,
                    image_format=evidence.image_format or "UNKNOWN",
                    width=evidence.width,
                    height=evidence.height,
                    created_at=evidence.created_at,
                    status="INGESTED"
                ))
            except Exception as e:
                err_msg = getattr(e, "detail", str(e)) if hasattr(e, "detail") else "Invalid or unsupported evidence file"
                failed_items.append({
                    "filename": file.filename or "unknown",
                    "error": str(err_msg)
                })
                AuditService.log_event(
                    db=db,
                    case_id=case.case_identifier,
                    event_type="EVIDENCE_INGESTION_FAILED",
                    actor=actor,
                    metadata={"filename": file.filename, "error": str(err_msg)}
                )

        if len(results) > 0:
            AuditService.log_event(
                db=db,
                case_id=case.case_identifier,
                event_type="BATCH_EVIDENCE_INGESTED",
                actor=actor,
                metadata={"file_count": len(results), "failed_count": len(failed_items), "total_bytes": total_bytes}
            )

        msg = f"Batch ingestion complete: {len(results)} succeeded, {len(failed_items)} failed."
        return BatchUploadResponse(
            case_identifier=case.case_identifier,
            uploaded_count=len(results),
            total_size_bytes=total_bytes,
            items=results,
            failed_count=len(failed_items),
            failed_items=failed_items,
            ingest_timestamp=datetime.datetime.now(datetime.timezone.utc),
            message=msg
        )

    @staticmethod
    def queue_batch_analysis(
        db: Session,
        case: InvestigationCase,
        evidence_ids: Optional[List[int]] = None,
        analysis_types: Optional[List[str]] = None,
        actor: str = "System"
    ) -> BatchAnalysisStatusResponse:
        target_modalities = analysis_types if analysis_types else CORE_MODALITIES
        target_modalities = [m.lower().strip() for m in target_modalities if m.lower().strip() in CORE_MODALITIES]

        query = db.query(Evidence).filter(Evidence.case_id == case.id)
        if evidence_ids:
            query = query.filter(Evidence.id.in_(evidence_ids))
        evidence_items = query.all()

        for ev in evidence_items:
            for atype in target_modalities:
                # Check existing jobs
                existing_job = db.query(AnalysisJob).filter(
                    AnalysisJob.evidence_id == ev.id,
                    AnalysisJob.analysis_type == atype,
                    AnalysisJob.status.in_(["QUEUED", "RUNNING", "COMPLETED"])
                ).first()

                if existing_job:
                    continue

                job = AnalysisJob(
                    evidence_id=ev.id,
                    analysis_type=atype,
                    status="QUEUED"
                )
                db.add(job)
                db.commit()
                db.refresh(job)

                AuditService.log_event(
                    db=db,
                    case_id=case.case_identifier,
                    event_type="ANALYSIS_QUEUED",
                    evidence_id=ev.id,
                    actor=actor,
                    metadata={"analysis_type": atype, "job_id": job.job_identifier}
                )

                try:
                    run_analysis_task.delay(job.id)
                except Exception:
                    job.status = "FAILED"
                    job.safe_error_message = "Analysis worker unavailable"
                    db.commit()

        return BatchService.get_batch_status(db, case)

    @staticmethod
    def get_batch_status(db: Session, case: InvestigationCase) -> BatchAnalysisStatusResponse:
        evidence_items = db.query(Evidence).filter(Evidence.case_id == case.id).all()
        ev_ids = [e.id for e in evidence_items]
        ev_name_map = {e.id: e.original_filename for e in evidence_items}

        if not ev_ids:
            return BatchAnalysisStatusResponse(
                case_identifier=case.case_identifier,
                total_jobs=0,
                queued_count=0,
                running_count=0,
                completed_count=0,
                failed_count=0,
                progress_percentage=100.0,
                jobs=[]
            )

        jobs = db.query(AnalysisJob).filter(AnalysisJob.evidence_id.in_(ev_ids)).order_by(AnalysisJob.queued_at.desc()).all()

        job_statuses = []
        queued_count = 0
        running_count = 0
        completed_count = 0
        failed_count = 0

        for j in jobs:
            st = (j.status or "QUEUED").upper()
            if st == "QUEUED": queued_count += 1
            elif st == "RUNNING": running_count += 1
            elif st == "COMPLETED": completed_count += 1
            elif st == "FAILED": failed_count += 1

            job_statuses.append(BatchJobItemStatus(
                job_id=j.id,
                job_identifier=j.job_identifier,
                evidence_id=j.evidence_id,
                evidence_filename=ev_name_map.get(j.evidence_id, "Unknown"),
                analysis_type=j.analysis_type,
                status=st,
                error_message=j.safe_error_message
            ))

        total_jobs = len(jobs)
        progress = 100.0 if total_jobs == 0 else round(((completed_count + failed_count) / total_jobs) * 100.0, 1)

        return BatchAnalysisStatusResponse(
            case_identifier=case.case_identifier,
            total_jobs=total_jobs,
            queued_count=queued_count,
            running_count=running_count,
            completed_count=completed_count,
            failed_count=failed_count,
            progress_percentage=progress,
            jobs=job_statuses
        )
