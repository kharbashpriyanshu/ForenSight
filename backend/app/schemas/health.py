from pydantic import BaseModel
from typing import Optional

class HealthResponse(BaseModel):
    status: str
    service: str
    api_gateway: str = "healthy"
    platform_mode: Optional[str] = None
    background_execution: Optional[str] = None
    database: Optional[str] = None
    redis: Optional[str] = None
    celery_worker: Optional[str] = None
    storage: Optional[str] = None
    environment: Optional[str] = None
