import os
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.schemas.health import HealthResponse
from app.db.database import get_db
import redis
from app.core.config import settings
from app.core.celery_app import celery_app

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
    storage_status = "degraded"
    try:
        os.makedirs(settings.STORAGE_DIR, exist_ok=True)
        test_file = os.path.join(settings.STORAGE_DIR, ".healthcheck")
        with open(test_file, "w") as f:
            f.write("ok")
        if os.path.exists(test_file):
            os.remove(test_file)
            storage_status = "healthy"
    except Exception:
        pass

    # 5. Overall platform status
    if db_status == "healthy" and storage_status == "healthy":
        overall = "healthy" if redis_status == "healthy" and celery_status == "healthy" else "degraded"
    else:
        overall = "unhealthy"

    return HealthResponse(
        status=overall,
        service="forensight",
        database=db_status,
        redis=redis_status,
        celery_worker=celery_status,
        storage=storage_status,
        environment=settings.ENVIRONMENT
    )
