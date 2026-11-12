import os
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.schemas.health import HealthResponse
from app.db.database import get_db
import redis
from app.core.config import settings
from app.core.celery_app import celery_app
from app.services.storage import get_storage_backend

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    # 1. Database check
    db_status = "unhealthy"
    try:
        db.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception:
        pass
        
    # 2. Redis broker check
    redis_status = "unavailable"
    try:
        r = redis.Redis.from_url(settings.CELERY_BROKER_URL, socket_connect_timeout=1)
        if r.ping():
            redis_status = "healthy"
    except Exception:
        pass

    # 3. Celery worker check
    if settings.CELERY_TASK_ALWAYS_EAGER:
        celery_status = "eager_fallback"
    else:
        celery_status = "unavailable"
        try:
            inspector = celery_app.control.inspect(timeout=0.5)
            active = inspector.ping()
            if active:
                celery_status = "healthy"
        except Exception:
            pass

    # 4. Storage check
    storage_status = "unhealthy"
    try:
        if get_storage_backend().health_check(".healthcheck"):
            storage_status = "healthy"
    except Exception:
        pass

    # 5. Aggregate platform status & execution mode
    is_production = settings.ENVIRONMENT.strip().lower() in {"production", "prod"}
    is_eager_dev = bool(settings.CELERY_TASK_ALWAYS_EAGER) and not is_production

    if redis_status == "healthy" and celery_status == "healthy":
        background_execution = "async_worker"
    elif is_eager_dev:
        background_execution = "eager_fallback"
    elif redis_status == "healthy" or celery_status == "healthy":
        background_execution = "degraded"
    else:
        background_execution = "unavailable"

    if db_status != "healthy" or storage_status != "healthy":
        overall = "unhealthy"
        platform_mode = "unhealthy"
    elif redis_status == "healthy" and celery_status == "healthy":
        overall = "healthy"
        platform_mode = "operational"
    elif is_eager_dev:
        overall = "healthy"
        platform_mode = "dev_eager_mode"
    else:
        overall = "degraded"
        platform_mode = "degraded"

    return HealthResponse(
        status=overall,
        service="forensight",
        api_gateway="healthy",
        platform_mode=platform_mode,
        background_execution=background_execution,
        database=db_status,
        redis=redis_status,
        celery_worker=celery_status,
        storage=storage_status,
        environment=settings.ENVIRONMENT
    )


@router.get("/ready")
def readiness_check(db: Session = Depends(get_db)):
    """Readiness probe for container orchestration / load balancers."""
    from fastapi.responses import JSONResponse

    db_ready = False
    try:
        db.execute(text("SELECT 1"))
        db_ready = True
    except Exception:
        pass

    storage_ready = False
    try:
        storage_ready = bool(get_storage_backend().health_check(".readycheck"))
    except Exception:
        pass

    is_ready = db_ready and storage_ready
    status_code = 200 if is_ready else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if is_ready else "not_ready",
            "database": "healthy" if db_ready else "unhealthy",
            "storage": "healthy" if storage_ready else "unhealthy",
        },
    )
