import io
import pytest
from PIL import Image

def test_ela_analysis_valid(client):
    # Create case
    case_res = client.post("/api/cases", json={"title": "Analysis Case ELA"})
    case_id = case_res.json()["id"]

    # Upload JPEG evidence
    img = Image.new('RGB', (10, 10), color = 'red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    files = {'file': ('test_ela.jpg', img_byte_arr.getvalue(), 'image/jpeg')}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    ev_id = ev_res.json()["id"]

    # Trigger analysis
    analysis_res = client.post(f"/api/evidence/{ev_id}/analysis/ela")
    assert analysis_res.status_code == 200
    data = analysis_res.json()
    assert data["analysis_type"] == "ELA"
    assert data["status"] == "completed"
    
    findings = data["structured_findings"]
    assert "ela_map" in findings["artifacts"]
    assert "mean_error" in findings

def test_ela_analysis_png_rejection(client):
    # Create case
    case_res = client.post("/api/cases", json={"title": "Analysis Case ELA PNG"})
    case_id = case_res.json()["id"]

    # Upload PNG evidence
    img = Image.new('RGB', (10, 10), color = 'red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    files = {'file': ('test_ela.png', img_byte_arr.getvalue(), 'image/png')}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    ev_id = ev_res.json()["id"]

    # Trigger analysis
    analysis_res = client.post(f"/api/evidence/{ev_id}/analysis/ela")
    # Should be 400 Bad Request because ELA rejects non-JPEG
    assert analysis_res.status_code == 400
    assert "JPEG evidence input" in analysis_res.json()["detail"]

def test_get_artifact_security(client):
    # Use URL encoding to bypass httpx path normalization
    res = client.get("/api/artifacts/..%2Fevidence%2Ftest.jpg")
    assert res.status_code == 403
