from contextlib import contextmanager
from contextvars import ContextVar
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Iterator, Optional
from urllib.parse import urlparse
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

_storage_dir_override: ContextVar[Optional[str]] = ContextVar("storage_dir_override", default=None)


@contextmanager
def storage_dir_override(path: str) -> Iterator[str]:
    """Temporarily override `settings.STORAGE_DIR` for the current execution context only."""
    token = _storage_dir_override.set(path)
    try:
        yield path
    finally:
        _storage_dir_override.reset(token)

class Settings(BaseSettings):
    PROJECT_NAME: str = "ForenSight"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = "sqlite:///./forensight.db"
    STORAGE_DIR: str = "storage/evidence"
    STORAGE_PATH: str = "storage/evidence"
    STORAGE_BACKEND: str = "local"
    ALLOW_EPHEMERAL_LOCAL_STORAGE: bool = False
    S3_BUCKET: str = ""
    S3_ENDPOINT_URL: str = ""
    S3_REGION: str = "auto"
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_KEY_PREFIX: str = ""
    S3_ADDRESSING_STYLE: str = "auto"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024
    MAX_IMAGE_PIXELS: int = 40_000_000
    BACKEND_CORS_ORIGINS: str = "http://localhost,http://localhost:5173"
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    CELERY_TASK_ALWAYS_EAGER: bool = True
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "development-only-secret-change-before-deployment"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    SESSION_REFRESH_EXPIRE_DAYS: int = 30
    ANALYSIS_JOB_STALE_AFTER_SECONDS: int = 900
    ANALYSIS_JOB_SOFT_TIME_LIMIT_SECONDS: int = 300
    ANALYSIS_JOB_TIME_LIMIT_SECONDS: int = 330
    CASE_EXPORT_SIGNING_PRIVATE_KEY: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def configured_storage_dir(self) -> str:
        """Return the underlying configured STORAGE_DIR ignoring any context-local override."""
        return super().__getattribute__("STORAGE_DIR")

    def __getattribute__(self, name: str):
        if name == "STORAGE_DIR":
            override = _storage_dir_override.get()
            if override is not None:
                return override
        return super().__getattribute__(name)

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

    for name, redis_url in (
        ("CELERY_BROKER_URL", settings.CELERY_BROKER_URL),
        ("CELERY_RESULT_BACKEND", settings.CELERY_RESULT_BACKEND),
        ("REDIS_URL", settings.REDIS_URL),
    ):
        parsed_redis = urlparse(redis_url)
        redis_password = parsed_redis.password or ""
        if parsed_redis.scheme not in {"redis", "rediss"} or not parsed_redis.hostname or len(redis_password) < 16:
            problems.append(f"{name} must use Redis with a unique password of at least 16 characters")
            break

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
    if settings.ACCESS_TOKEN_EXPIRE_MINUTES < 5 or settings.ACCESS_TOKEN_EXPIRE_MINUTES > 60:
        problems.append("ACCESS_TOKEN_EXPIRE_MINUTES must be between 5 and 60")
    if settings.SESSION_REFRESH_EXPIRE_DAYS < 1 or settings.SESSION_REFRESH_EXPIRE_DAYS > 90:
        problems.append("SESSION_REFRESH_EXPIRE_DAYS must be between 1 and 90")

    storage_backend = (settings.STORAGE_BACKEND or "").strip().lower()
    if storage_backend in {"", "local"}:
        if not settings.ALLOW_EPHEMERAL_LOCAL_STORAGE:
            problems.append(
                "STORAGE_BACKEND='local' is not permitted in production on ephemeral filesystems; "
                "configure STORAGE_BACKEND=s3 with S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY"
            )
    elif storage_backend in {"s3", "s3-compatible", "s3_compatible"}:
        if not settings.S3_BUCKET.strip():
            problems.append("S3_BUCKET must be configured when STORAGE_BACKEND=s3")
        if not settings.S3_ACCESS_KEY_ID.strip():
            problems.append("S3_ACCESS_KEY_ID must be configured when STORAGE_BACKEND=s3")
        if not settings.S3_SECRET_ACCESS_KEY.strip():
            problems.append("S3_SECRET_ACCESS_KEY must be configured when STORAGE_BACKEND=s3")
        endpoint = settings.S3_ENDPOINT_URL.strip()
        if endpoint:
            parsed_endpoint = urlparse(endpoint)
            if parsed_endpoint.scheme not in {"http", "https"} or not parsed_endpoint.netloc:
                problems.append("S3_ENDPOINT_URL must be a valid http:// or https:// URL")
        addressing = (settings.S3_ADDRESSING_STYLE or "auto").strip().lower()
        if addressing not in {"auto", "path", "virtual"}:
            problems.append("S3_ADDRESSING_STYLE must be one of: auto, path, virtual")
    else:
        problems.append(f"Unsupported STORAGE_BACKEND '{settings.STORAGE_BACKEND}' (expected 'local' or 's3')")

    if problems:
        raise RuntimeError("Invalid production configuration: " + "; ".join(problems))
