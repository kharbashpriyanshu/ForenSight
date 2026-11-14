from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.core.config import settings, validate_runtime_settings
from fastapi.middleware.cors import CORSMiddleware
from app.api.health import router as health_router
from app.api.cases import router as cases_router
from app.api.analysis import router as analysis_router
from app.api.jobs import router as jobs_router
from app.api.audit import router as audit_router
from app.api.reports import router as reports_router
from app.api.fusion import router as fusion_router
from app.api.correlation import router as correlation_router
from app.api.auth import router as auth_router
from app.api.batch import router as batch_router
from app.api.cross_correlation import router as cross_correlation_router
from app.api.heatmap import router as heatmap_router
from app.api.assistant import router as assistant_router
from app.api.custody import router as custody_router
from app.api.engines import router as engines_router
from app.api.benchmark import router as benchmark_router
from app.api.lineage import router as lineage_router
from app.api.provenance import router as provenance_router
from app.api.processing_history import router as processing_history_router
from app.api.case_exports import router as case_exports_router
from app.db.database import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_runtime_settings()
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

_cors_origins = [o.strip() for o in settings.BACKEND_CORS_ORIGINS.split(",") if o.strip()]
_is_prod = settings.ENVIRONMENT.strip().lower() in {"production", "prod"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins if _cors_origins else ["*"],
    allow_origin_regex=r"^https://[a-zA-Z0-9-]+\.onrender\.com$" if _is_prod else r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
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
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' data: https://fonts.gstatic.com; "
        "img-src 'self' data: blob:; "
        "connect-src 'self' http://localhost:* http://127.0.0.1:*; "
        "frame-ancestors 'none';"
    )
    return response

app.include_router(health_router, prefix="/api")
app.include_router(cases_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(jobs_router, prefix="/api")
app.include_router(audit_router, prefix="/api")
app.include_router(reports_router, prefix="/api")
app.include_router(fusion_router, prefix="/api")
app.include_router(correlation_router, prefix="/api")
app.include_router(batch_router, prefix="/api")
app.include_router(cross_correlation_router, prefix="/api")
app.include_router(heatmap_router, prefix="/api")
app.include_router(assistant_router, prefix="/api")
app.include_router(custody_router, prefix="/api")
app.include_router(engines_router, prefix="/api")
app.include_router(benchmark_router, prefix="/api")
app.include_router(lineage_router, prefix="/api")
app.include_router(provenance_router, prefix="/api")
app.include_router(processing_history_router, prefix="/api")
app.include_router(case_exports_router, prefix="/api")
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
