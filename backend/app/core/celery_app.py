from celery import Celery
from app.core.config import settings
from datetime import timedelta

celery_app = Celery(
    "forensics_worker",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_always_eager=settings.CELERY_TASK_ALWAYS_EAGER
)

celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=settings.ANALYSIS_JOB_SOFT_TIME_LIMIT_SECONDS,
    task_time_limit=settings.ANALYSIS_JOB_TIME_LIMIT_SECONDS,
    beat_schedule={
        "dispatch-pending-analysis-jobs": {
            "task": "dispatch_pending_analysis_jobs",
            "schedule": timedelta(seconds=15),
        },
        "reconcile-stale-analysis-jobs": {
            "task": "reconcile_stale_analysis_jobs",
            "schedule": timedelta(minutes=1),
        },
    },
)

import app.workers.analysis_worker
