import pytest
from fastapi.testclient import TestClient
from app.main import app
import os
import io
from PIL import Image

def create_valid_image(fmt="JPEG"):
    file = io.BytesIO()
    image = Image.new("RGB", (100, 100), color="red")
    image.save(file, format=fmt)
    file.seek(0)
    return file.read()

def test_png_workflow(client):
    # 1. Create case
    case_res = client.post("/api/cases", json={"title": "PNG Audit Case"})
    assert case_res.status_code == 200
    case_id = case_res.json()["id"]

    # 2. Upload PNG
    files = {'file': ('test.png', create_valid_image("PNG"), 'image/png')}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    assert ev_res.status_code == 200
    ev_id = ev_res.json()["id"]
    assert ev_res.json()["mime_type"] == "image/png"

    # 3. Test Metadata (should work)
    meta_res = client.post(f"/api/evidence/{ev_id}/analysis/metadata")
    assert meta_res.status_code == 200

    # 4. Test ELA (should fail - requires JPEG)
    ela_res = client.post(f"/api/evidence/{ev_id}/analysis/ela")
    assert ela_res.status_code == 400
    assert "JPEG" in ela_res.json()["detail"]

    # 5. Test DCT (should fail - requires JPEG)
    dct_res = client.post(f"/api/evidence/{ev_id}/analysis/jpeg-dct")
    assert dct_res.status_code == 400
    assert "JPEG" in dct_res.json()["detail"]

def test_corrupted_image(client):
    case_res = client.post("/api/cases", json={"title": "Corrupt Case"})
    case_id = case_res.json()["id"]

    # Upload corrupt data
    files = {'file': ('bad.jpg', b'Not a real image', 'image/jpeg')}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    assert ev_res.status_code == 400
    assert "image" in ev_res.json()["detail"].lower()

def test_path_traversal(client):
    # Attempt to traverse static files
    # Static files is mounted at /api/artifacts
    res = client.get("/api/artifacts/../main.py")
    # FastAPI StaticFiles prevents path traversal by design, should return 404
    assert res.status_code == 404

def test_cors_headers(client):
    res = client.options("/api/cases", headers={
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "GET"
    })
    # Since CORS is *, it should allow
    assert res.status_code == 200
    assert "access-control-allow-origin" in res.headers

def test_security_headers(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
