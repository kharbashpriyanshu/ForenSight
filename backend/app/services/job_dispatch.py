"""Publish durable analysis outbox entries to Celery with retryable dispatch."""

import datetime
import uuid

from app.db.database import SessionLocal
from app.models.domain import AnalysisJobOutbox


def publish_pending_analysis_jobs(limit: int = 100, outbox_id: int = None) -> dict:
    from app.workers.analysis_worker import run_analysis_task

    db = SessionLocal()
    published = 0
    deferred = 0
    try:
        now = datetime.datetime.utcnow()
        query = db.query(AnalysisJobOutbox).filter(
            AnalysisJobOutbox.dispatched_at.is_(None),
            AnalysisJobOutbox.next_attempt_at <= now,
        )
        if outbox_id is not None:
            query = query.filter(AnalysisJobOutbox.id == outbox_id)
        rows = query.order_by(AnalysisJobOutbox.id.asc()).limit(limit).with_for_update(skip_locked=True).all()

        for row in rows:
            row.attempt_count += 1
            attempt = row.attempt_count
            row.next_attempt_at = now + datetime.timedelta(seconds=min(300, 2 ** min(attempt, 8)))
            db.commit()

            try:
                run_analysis_task.apply_async(
                    args=[row.job_id],
                    task_id=f"analysis-job-{row.job_id}-{uuid.uuid4().hex[:12]}",
                    retry=False,
                )
                row = db.query(AnalysisJobOutbox).filter(AnalysisJobOutbox.id == row.id).first()
                if row:
                    row.dispatched_at = datetime.datetime.utcnow()
                    row.last_error = None
                    db.commit()
                published += 1
            except Exception as exc:
                db.rollback()
                row = db.query(AnalysisJobOutbox).filter(AnalysisJobOutbox.id == row.id).first()
                if row:
                    row.last_error = f"{type(exc).__name__}: dispatch failed"[:300]
                    db.commit()
                deferred += 1
        return {"published": published, "deferred": deferred}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
