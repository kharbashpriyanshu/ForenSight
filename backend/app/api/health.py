from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.schemas.health import HealthResponse
from app.db.database import get_db
import redis
from app.core.config import settings

router = APIRouter()

@router.get("/health", response_model=HealthResponse)
def health_check(db: Session = Depends(get_db)):
    db_status = "unhealthy"
    try:
        db.execute(text("SELECT 1"))
        db_status = "healthy"
    except Exception:
        pass
        
    redis_status = "unhealthy"
    try:
        r = redis.Redis.from_url(settings.CELERY_BROKER_URL, socket_connect_timeout=1)
        if r.ping():
            redis_status = "healthy"
    except Exception:
        pass

    overall = "healthy" if db_status == "healthy" and redis_status == "healthy" else "degraded"
    if db_status == "unhealthy" and redis_status == "unhealthy":
        overall = "unhealthy"

    return HealthResponse(
        status=overall,
        service="forensight",
        database=db_status,
        redis=redis_status
    )
