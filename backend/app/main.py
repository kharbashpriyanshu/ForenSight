from fastapi import FastAPI
from app.core.config import settings
from fastapi.middleware.cors import CORSMiddleware
from app.api.health import router as health_router
from app.api.cases import router as cases_router
from app.api.analysis import router as analysis_router
from app.api.jobs import router as jobs_router
from app.api.audit import router as audit_router
from app.api.reports import router as reports_router
from app.api.fusion import router as fusion_router
from app.api.auth import router as auth_router
from app.db.database import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS.split(",") if settings.BACKEND_CORS_ORIGINS else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block" # Legacy/compatibility defense
    return response

app.include_router(health_router, prefix="/api")
app.include_router(cases_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(audit_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(fusion_router, prefix="/api")
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
