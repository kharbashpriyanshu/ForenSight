import io
import os
from PIL import Image

def test_create_case(client):
    response = client.post("/api/cases", json={"title": "Test Investigation"})
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Test Investigation"
    assert "FS-CASE-" in data["case_identifier"]
    assert "id" in data

def test_get_cases(client):
    client.post("/api/cases", json={"title": "Test Case 1"})
    response = client.get("/api/cases")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["title"] == "Test Case 1"

def test_upload_valid_evidence(client):
    # First create a case
    response = client.post("/api/cases", json={"title": "Case for Upload"})
    case_id = response.json()["id"]

    # Generate a valid tiny PNG in memory
    img = Image.new('RGB', (10, 10), color = 'red')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')
    img_byte_arr = img_byte_arr.getvalue()

    files = {'file': ('test.png', img_byte_arr, 'image/png')}
    response = client.post(f"/api/cases/{case_id}/evidence", files=files)
    
    assert response.status_code == 200
    data = response.json()
    assert data["original_filename"] == "test.png"
    assert data["mime_type"] == "image/png"
    assert "FS-EVD-" in data["evidence_identifier"]
    assert data["width"] == 10
    assert data["height"] == 10
    assert data["image_format"] == "PNG"

def test_upload_invalid_evidence(client):
    response = client.post("/api/cases", json={"title": "Case for Invalid Upload"})
    case_id = response.json()["id"]

    # Try uploading a non-image file
    files = {'file': ('test.txt', b'this is not an image', 'text/plain')}
    response = client.post(f"/api/cases/{case_id}/evidence", files=files)
    
    assert response.status_code == 400
    assert "Unsupported file extension" in response.json()["detail"] or "Unsupported MIME type" in response.json()["detail"]

    # Try uploading invalid image (valid extension/MIME but invalid content)
    files = {'file': ('invalid.png', b'this is not an image', 'image/png')}
    response = client.post(f"/api/cases/{case_id}/evidence", files=files)
    
    assert response.status_code == 400
    assert "Invalid or corrupted image" in response.json()["detail"]

def test_upload_large_file(client):
    response = client.post("/api/cases", json={"title": "Case for Large Upload"})
    case_id = response.json()["id"]

    # Create a 11MB file to exceed max size (10MB)
    large_bytes = b'0' * (11 * 1024 * 1024)
    files = {'file': ('large.png', large_bytes, 'image/png')}
    response = client.post(f"/api/cases/{case_id}/evidence", files=files)
    
    assert response.status_code == 413
    assert "File too large" in response.json()["detail"]

def test_upload_empty_file(client):
    response = client.post("/api/cases", json={"title": "Case for Empty Upload"})
    case_id = response.json()["id"]

    files = {'file': ('empty.png', b'', 'image/png')}
    response = client.post(f"/api/cases/{case_id}/evidence", files=files)
    
    assert response.status_code == 400
    assert "Empty file" in response.json()["detail"]
