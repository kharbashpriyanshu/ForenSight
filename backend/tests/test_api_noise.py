import io
import pytest
from PIL import Image

def test_noise_analysis_valid(client):
    # Create case
    case_res = client.post("/api/cases", json={"title": "Analysis Case Noise"})
    case_id = case_res.json()["id"]

    # Upload evidence
    img = Image.new('RGB', (20, 20), color = 'blue')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    files = {'file': ('test_noise.jpg', img_byte_arr.getvalue(), 'image/jpeg')}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    ev_id = ev_res.json()["id"]

    # Trigger analysis
    analysis_res = client.post(f"/api/evidence/{ev_id}/analysis/noise")
    assert analysis_res.status_code == 200
    data = analysis_res.json()
    assert data["analysis_type"] == "NOISE"
    assert data["status"] == "completed"
    
    findings = data["structured_findings"]
    assert "noise_residual_map" in findings["artifacts"]
    assert "noise_local_map" in findings["artifacts"]
    assert "global_statistics" in findings
    assert "local_config" in findings

def test_noise_analysis_missing_evidence(client):
    # Trigger analysis on invalid ID
    analysis_res = client.post(f"/api/evidence/9999/analysis/noise")
    assert analysis_res.status_code == 404
