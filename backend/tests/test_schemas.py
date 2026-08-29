from app.schemas.health import HealthResponse

def test_health_response_schema():
    health = HealthResponse(status="healthy", service="forensight")
    assert health.status == "healthy"
    assert health.service == "forensight"
