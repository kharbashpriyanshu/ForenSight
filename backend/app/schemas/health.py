from pydantic import BaseModel
from typing import Optional

class HealthResponse(BaseModel):
    status: str
    service: str
    database: Optional[str] = None
    redis: Optional[str] = None
    celery_worker: Optional[str] = None
    storage: Optional[str] = None
    environment: Optional[str] = None
