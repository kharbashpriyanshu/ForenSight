"""Publish durable analysis outbox entries to Celery with retryable dispatch."""

import datetime
from datetime import timezone
import uuid

from typing import Optional
from sqlalchemy.orm import Session
from app.db.database import SessionLocal
from app.models.domain import AnalysisJobOutbox


def publish_pending_analysis_jobs(limit: int = 100, outbox_id: int = None, db: Optional[Session] = None) -> dict:
    from app.workers.analysis_worker import run_analysis_task

    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    published = 0
    deferred = 0
    try:
        now = datetime.datetime.now(timezone.utc)
        query = db.query(AnalysisJobOutbox).filter(
            AnalysisJobOutbox.dispatched_at.is_(None),
            AnalysisJobOutbox.next_attempt_at <= now,
        )
        if outbox_id is not None:
            query = query.filter(AnalysisJobOutbox.id == outbox_id)
        if db.get_bind().dialect.name == "postgresql":
            query = query.with_for_update(skip_locked=True)
        rows = query.order_by(AnalysisJobOutbox.id.asc()).limit(limit).all()

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
                    row.dispatched_at = datetime.datetime.now(timezone.utc)
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
        if close_db:
            db.close()
