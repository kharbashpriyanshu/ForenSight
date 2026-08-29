from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "ForenSight"
    API_V1_STR: str = "/api/v1"
    DATABASE_URL: str = "sqlite:///./forensight.db"
    STORAGE_DIR: str = "storage/evidence"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024
    BACKEND_CORS_ORIGINS: str = "*"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
