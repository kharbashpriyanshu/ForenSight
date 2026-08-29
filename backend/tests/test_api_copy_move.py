import io
import pytest
from PIL import Image
import numpy as np
import cv2

def create_synthetic_bytes():
    img = np.zeros((400, 400, 3), dtype=np.uint8)
    for i in range(400):
        img[i, :, :] = i % 255
    patch = np.zeros((100, 100, 3), dtype=np.uint8)
    np.random.seed(42)
    for _ in range(5):
        cx, cy = np.random.randint(20, 80, 2)
        cv2.circle(patch, (cx, cy), 15, (255, 255, 255), -1)
        cv2.rectangle(patch, (cx-10, cy-10), (cx+10, cy+10), (100, 100, 100), -1)
    img[50:150, 50:150] = patch
    img[200:300, 200:300] = patch
    is_success, buffer = cv2.imencode(".jpg", img)
    return io.BytesIO(buffer)

def create_negative_bytes():
    img = np.zeros((400, 400, 3), dtype=np.uint8)
    is_success, buffer = cv2.imencode(".jpg", img)
    return io.BytesIO(buffer)

def test_copymove_analysis_positive(client):
    case_res = client.post("/api/cases", json={"title": "Analysis Case CM POS"})
    case_id = case_res.json()["id"]

    files = {'file': ('test_cm_pos.jpg', create_synthetic_bytes(), 'image/jpeg')}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    ev_id = ev_res.json()["id"]

    analysis_res = client.post(f"/api/evidence/{ev_id}/analysis/copy-move")
    assert analysis_res.status_code == 200
    data = analysis_res.json()
    assert data["analysis_type"] == "COPY_MOVE"
    assert data["status"] == "completed"
    
    findings = data["structured_findings"]
    assert "copymove_map" in findings["artifacts"]
    assert findings["matching_statistics"]["geometric_inliers"] >= 4
    assert findings["geometry"]["displacement"] is not None
    assert findings["candidate_regions"]["supporting_matches"] >= 4

def test_copymove_analysis_negative_no_candidate(client):
    case_res = client.post("/api/cases", json={"title": "Analysis Case CM NEG"})
    case_id = case_res.json()["id"]

    files = {'file': ('test_cm_neg.jpg', create_negative_bytes(), 'image/jpeg')}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    ev_id = ev_res.json()["id"]

    # The API should return 200 OK even if 0 matches are found!
    analysis_res = client.post(f"/api/evidence/{ev_id}/analysis/copy-move")
    assert analysis_res.status_code == 200
    data = analysis_res.json()
    
    findings = data["structured_findings"]
    # We expect 0 inliers, but it must be a successful analysis.
    assert findings["matching_statistics"]["geometric_inliers"] == 0
    assert findings["geometry"]["displacement"] is None

def test_copymove_analysis_missing_evidence(client):
    analysis_res = client.post(f"/api/evidence/9999/analysis/copy-move")
    assert analysis_res.status_code == 404
