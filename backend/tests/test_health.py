from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from app.main import app
from app.api import health as health_api
from app.db.database import get_db

client = TestClient(app)


def _failing_redis(*_args, **_kwargs):
    raise ConnectionError("Redis unavailable")


def test_health_check_dev_eager_without_redis(monkeypatch):
    monkeypatch.setattr(health_api.settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(health_api.settings, "CELERY_TASK_ALWAYS_EAGER", True)
    monkeypatch.setattr(health_api.redis.Redis, "from_url", _failing_redis)

    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "forensight"
    assert data["api_gateway"] == "healthy"
    assert data["status"] == "healthy"
    assert data["platform_mode"] == "dev_eager_mode"
    assert data["background_execution"] == "eager_fallback"
    assert data["database"] == "healthy"
    assert data["storage"] == "healthy"
    assert data["redis"] == "unavailable"
    assert data["celery_worker"] == "eager_fallback"


def test_health_check_production_non_eager_without_redis_is_degraded(monkeypatch):
    monkeypatch.setattr(health_api.settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(health_api.settings, "CELERY_TASK_ALWAYS_EAGER", False)
    monkeypatch.setattr(health_api.redis.Redis, "from_url", _failing_redis)

    mock_inspect = MagicMock()
    mock_inspect.ping.return_value = None
    monkeypatch.setattr(health_api.celery_app.control, "inspect", lambda **_kw: mock_inspect)

    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["api_gateway"] == "healthy"
    assert data["status"] == "degraded"
    assert data["platform_mode"] == "degraded"
    assert data["background_execution"] == "unavailable"
    assert data["database"] == "healthy"
    assert data["storage"] == "healthy"
    assert data["redis"] == "unavailable"
    assert data["celery_worker"] == "unavailable"


def test_health_and_readiness_on_database_failure():
    failing_db = MagicMock()
    failing_db.execute.side_effect = RuntimeError("DB down")

    app.dependency_overrides[get_db] = lambda: failing_db
    try:
        health_res = client.get("/api/health")
        assert health_res.status_code == 200
        health_data = health_res.json()
        assert health_data["api_gateway"] == "healthy"
        assert health_data["database"] == "unhealthy"
        assert health_data["status"] == "unhealthy"
        assert health_data["platform_mode"] == "unhealthy"

        ready_res = client.get("/api/ready")
        assert ready_res.status_code == 503
        ready_data = ready_res.json()
        assert ready_data["status"] == "not_ready"
        assert ready_data["database"] == "unhealthy"
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_health_and_readiness_on_storage_failure(monkeypatch):
    monkeypatch.setattr(health_api.settings, "STORAGE_DIR", "/nonexistent_forbidden_storage_path_test")
    with patch("app.api.health.os.makedirs", side_effect=PermissionError("read-only storage")):
        health_res = client.get("/api/health")
        assert health_res.status_code == 200
        health_data = health_res.json()
        assert health_data["api_gateway"] == "healthy"
        assert health_data["storage"] == "unhealthy"
        assert health_data["status"] == "unhealthy"
        assert health_data["platform_mode"] == "unhealthy"

        ready_res = client.get("/api/ready")
        assert ready_res.status_code == 503
        ready_data = ready_res.json()
        assert ready_data["status"] == "not_ready"
        assert ready_data["storage"] == "unhealthy"
