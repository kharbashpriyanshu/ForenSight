import io
import pytest
from PIL import Image

def test_jpeg_dct_analysis_valid(client):
    case_res = client.post("/api/cases", json={"title": "Analysis Case DCT"})
    case_id = case_res.json()["id"]

    # Upload JPEG evidence
    img = Image.new('RGB', (16, 16), color='blue')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    files = {'file': ('test_dct.jpg', img_byte_arr.getvalue(), 'image/jpeg')}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    ev_id = ev_res.json()["id"]

    analysis_res = client.post(f"/api/evidence/{ev_id}/analysis/jpeg-dct")
    assert analysis_res.status_code == 200
    data = analysis_res.json()
    assert data["analysis_type"] == "JPEG_DCT"
    assert data["status"] == "completed"
    
    findings = data["structured_findings"]
    assert "dct_energy_map" in findings["artifacts"]
    assert "dc_statistics" in findings
    assert "ac_statistics" in findings
    assert "band_statistics" in findings
    assert "quantization_tables" in findings

def test_jpeg_dct_analysis_png_rejection(client):
    case_res = client.post("/api/cases", json={"title": "Analysis Case DCT PNG"})
    case_id = case_res.json()["id"]

    # Upload PNG evidence
    img = Image.new('RGB', (16, 16), color='red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    files = {'file': ('test_dct.png', img_byte_arr.getvalue(), 'image/png')}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    ev_id = ev_res.json()["id"]

    analysis_res = client.post(f"/api/evidence/{ev_id}/analysis/jpeg-dct")
    assert analysis_res.status_code == 400
    assert "native JPEG evidence" in analysis_res.json()["detail"]

def test_jpeg_dct_analysis_missing_evidence(client):
    analysis_res = client.post(f"/api/evidence/9999/analysis/jpeg-dct")
    assert analysis_res.status_code == 404
