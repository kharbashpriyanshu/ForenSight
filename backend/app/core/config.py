from pydantic_settings import BaseSettings, SettingsConfigDict
from urllib.parse import urlparse
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

class Settings(BaseSettings):
    PROJECT_NAME: str = "ForenSight"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = "sqlite:///./forensight.db"
    STORAGE_DIR: str = "storage/evidence"
    STORAGE_PATH: str = "storage/evidence"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024
    MAX_IMAGE_PIXELS: int = 40_000_000
    BACKEND_CORS_ORIGINS: str = "http://localhost,http://localhost:5173"
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    CELERY_TASK_ALWAYS_EAGER: bool = True
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "development-only-secret-change-before-deployment"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    ANALYSIS_JOB_STALE_AFTER_SECONDS: int = 900
    ANALYSIS_JOB_SOFT_TIME_LIMIT_SECONDS: int = 300
    ANALYSIS_JOB_TIME_LIMIT_SECONDS: int = 330
    CASE_EXPORT_SIGNING_PRIVATE_KEY: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()


def validate_runtime_settings() -> None:
    """Reject unsafe defaults when the service is configured for production."""
    if settings.ENVIRONMENT.strip().lower() not in {"production", "prod"}:
        return

    problems = []
    secret = settings.SECRET_KEY.strip()
    if len(secret) < 32 or any(marker in secret.lower() for marker in ("development-only", "local-development", "change-before-deployment", "replace-me")):
        problems.append("SECRET_KEY must be a unique value of at least 32 characters")

    origins = [origin.strip() for origin in settings.BACKEND_CORS_ORIGINS.split(",") if origin.strip()]
    parsed_origins = [urlparse(origin) for origin in origins]
    if not origins or "*" in origins or any(
        parsed.scheme != "https" or not parsed.netloc or parsed.path not in ("", "/")
        for parsed in parsed_origins
    ):
        problems.append("BACKEND_CORS_ORIGINS must list explicit HTTPS origins for production")

    try:
        database_password = urlparse(settings.DATABASE_URL).password or ""
    except ValueError:
        database_password = ""
    if not settings.DATABASE_URL.lower().startswith(("postgresql://", "postgresql+psycopg2://")):
        problems.append("Production DATABASE_URL must use PostgreSQL")
    if len(database_password) < 16 or any(marker in database_password.lower() for marker in ("forensight_password", "password", "change-me", "local-dev")):
        problems.append("DATABASE_URL must use a unique password of at least 16 characters")

    export_key = settings.CASE_EXPORT_SIGNING_PRIVATE_KEY.strip()
    if not export_key:
        problems.append("CASE_EXPORT_SIGNING_PRIVATE_KEY must be configured for signed case exports")
    else:
        try:
            if export_key.startswith("-----BEGIN"):
                parsed_key = serialization.load_pem_private_key(export_key.encode("utf-8"), password=None)
                if not isinstance(parsed_key, Ed25519PrivateKey):
                    raise ValueError("Expected an Ed25519 key")
            else:
                raw_key = base64.b64decode(export_key, validate=True)
                Ed25519PrivateKey.from_private_bytes(raw_key)
        except Exception:
            problems.append("CASE_EXPORT_SIGNING_PRIVATE_KEY must be a valid Ed25519 key")

    if settings.MAX_UPLOAD_SIZE <= 0 or settings.MAX_IMAGE_PIXELS <= 0:
        problems.append("Upload and image pixel limits must be positive")

    if problems:
        raise RuntimeError("Invalid production configuration: " + "; ".join(problems))
