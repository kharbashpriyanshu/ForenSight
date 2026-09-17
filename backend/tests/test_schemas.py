from fastapi.testclient import TestClient
from app.main import app
from app.schemas.health import HealthResponse

client = TestClient(app)

def test_health_response_schema():
    health = HealthResponse(status="healthy", service="forensight")
    assert health.status == "healthy"
    assert health.service == "forensight"

def test_health_and_readiness_endpoints():
    health_res = client.get("/api/health")
    assert health_res.status_code == 200
    health_data = health_res.json()
    assert health_data["service"] == "forensight"
    assert health_data["database"] in ("healthy", "connected")

    ready_res = client.get("/api/ready")
    assert ready_res.status_code == 200
    ready_data = ready_res.json()
    assert ready_data["status"] == "ready"
    assert ready_data["database"] == "healthy"
    assert ready_data["storage"] == "healthy"
