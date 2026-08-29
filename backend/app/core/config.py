from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "ForenSight"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = "sqlite:///./forensight.db"
    STORAGE_DIR: str = "storage/evidence"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024
    BACKEND_CORS_ORIGINS: str = "*"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    SECRET_KEY: str = "a_very_secret_key_for_jwt_auth_replace_in_prod"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
