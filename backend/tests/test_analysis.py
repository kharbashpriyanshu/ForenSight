import io
from PIL import Image

def test_metadata_analysis_no_exif(client):
    # Create case
    case_res = client.post("/api/cases", json={"title": "Analysis Case 1"})
    case_id = case_res.json()["id"]

    # Upload evidence without EXIF
    img = Image.new('RGB', (10, 10), color = 'red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    files = {'file': ('test.jpg', img_byte_arr.getvalue(), 'image/jpeg')}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    ev_id = ev_res.json()["id"]

    # Trigger analysis
    analysis_res = client.post(f"/api/evidence/{ev_id}/analysis/metadata")
    assert analysis_res.status_code == 200
    data = analysis_res.json()
    assert data["analysis_type"] == "METADATA"
    assert data["status"] == "completed"
    
    findings = data["structured_findings"]["findings"]
    assert "NO_EXIF_METADATA" in findings["indicators"]
    assert not findings["has_gps"]

def test_metadata_analysis_missing_evidence(client):
    res = client.post(f"/api/evidence/9999/analysis/metadata")
    assert res.status_code == 404

def test_get_analysis(client):
    case_res = client.post("/api/cases", json={"title": "Analysis Case 3"})
    case_id = case_res.json()["id"]

    img = Image.new('RGB', (10, 10), color = 'red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    files = {'file': ('test.jpg', img_byte_arr.getvalue(), 'image/jpeg')}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    ev_id = ev_res.json()["id"]

    analysis_res = client.post(f"/api/evidence/{ev_id}/analysis/metadata")
    an_id = analysis_res.json()["id"]

    get_res = client.get(f"/api/analysis/{an_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == an_id
