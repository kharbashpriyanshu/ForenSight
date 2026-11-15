import os
import sys
import time
import requests
import sqlite3
import hashlib
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000/api"
DB_PATH = "d:/Project Resume/ForenSight/backend/forensight.db"
TEST_IMG = "d:/Project Resume/ForenSight/backend/test.jpg"

def hash_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            h.update(chunk)
    return h.hexdigest()

def check_db():
    return sqlite3.connect(DB_PATH)

def main():
    print("=== STARTING E2E VALIDATION ===")
    
    # 1. Health
    r = requests.get(f"{BASE_URL}/health")
    assert r.status_code == 200, "Health check failed"
    print("Health: OK", r.json())
    
    # Authenticate Session
    session = requests.Session()
    login_res = session.post(
        f"{BASE_URL}/auth/login",
        data={"username": "admin", "password": "forensight_admin"},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    auth_data = login_res.json()
    csrf_token = auth_data.get("csrf_token")
    if csrf_token:
        session.headers.update({"X-CSRF-Token": csrf_token})
    print("Authentication: OK (Signed in as admin)")

    # 2. Create Case
    r = session.post(f"{BASE_URL}/cases", json={"title": "E2E Validation Case", "description": "Testing"})
    assert r.status_code in [200, 201], f"Case creation failed: {r.text}"
    case_id = r.json()["id"]
    print(f"Case Created: {case_id}")
    
    # 3. Upload valid JPEG
    initial_hash = hash_file(TEST_IMG)
    with open(TEST_IMG, "rb") as f:
        r = session.post(f"{BASE_URL}/cases/{case_id}/evidence", files={"file": ("test.jpg", f, "image/jpeg")})
    assert r.status_code in [200, 201], f"Upload failed: {r.text}"
    evidence = r.json()
    evidence_id = evidence["id"]
    assert evidence["sha256_hash"] == initial_hash, "Hash mismatch!"
    print(f"Upload: OK, Evidence ID: {evidence_id}, Hash: {initial_hash}")
    
    # 4. Metadata
    r = session.post(f"{BASE_URL}/evidence/{evidence_id}/analysis/metadata")
    assert r.status_code == 200
    print("Metadata: OK")
    
    # 5. ELA
    r = session.post(f"{BASE_URL}/evidence/{evidence_id}/analysis/ela")
    assert r.status_code == 200
    print("ELA: OK")
    
    # 6. Noise
    r = session.post(f"{BASE_URL}/evidence/{evidence_id}/analysis/noise")
    assert r.status_code == 200
    print("Noise: OK")
    
    # 7. JPEG/DCT
    r = session.post(f"{BASE_URL}/evidence/{evidence_id}/analysis/jpeg-dct")
    assert r.status_code == 200
    print("JPEG/DCT: OK")
    
    # 8. Copy-Move
    r = session.post(f"{BASE_URL}/evidence/{evidence_id}/analysis/copy-move")
    assert r.status_code == 200
    print("Copy-Move: OK")
    
    # 9. Normalization (run twice to check duplication)
    r = session.post(f"{BASE_URL}/evidence/{evidence_id}/fusion/normalize")
    assert r.status_code == 200
    r = session.post(f"{BASE_URL}/evidence/{evidence_id}/fusion/normalize")
    assert r.status_code == 200
    print("Normalization: OK")
    
    # 10. Correlation
    r = session.post(f"{BASE_URL}/evidence/{evidence_id}/fusion/correlate")
    assert r.status_code == 200
    data = r.json()
    assessment = data.get("assessment", data)
    level = assessment.get("level") or assessment.get("assessment_level")
    assert level is not None, f"No level in assessment: {assessment}"
    assert assessment.get("rule_version") == "7B-v1"
    print("Correlation: OK, Level:", level)
    
    # 12. Artifact Validation
    # Let's get the ELA artifact path
    r = session.get(f"{BASE_URL}/evidence/{evidence_id}/analyses")
    analyses = r.json()
    ela_analysis = next(a for a in analyses if a.get("analysis_type", "").upper() == "ELA")
    findings = ela_analysis.get("structured_findings") or ela_analysis.get("results", {})
    artifacts = findings.get("artifacts", {})
    artifact_path = artifacts.get("ela_map") or findings.get("ela_map_url") or list(artifacts.values())[0]
    
    # The URL from the backend might be relative to the artifacts endpoint
    if artifact_path.startswith("/api/"):
        artifact_path = artifact_path[5:] # remove /api/
    elif artifact_path.startswith("api/"):
        artifact_path = artifact_path[4:]
    if not artifact_path.startswith("artifacts/"):
        artifact_path = f"artifacts/{artifact_path}"
        
    r = session.get(f"{BASE_URL}/{artifact_path}")
    assert r.status_code == 200, f"Artifact fetch failed: {r.status_code} {r.text}"
    print("Artifact Access: OK")
    
    # Traversal test
    r = session.get(f"{BASE_URL}/artifacts/../main.py")
    assert r.status_code in [400, 404, 403, 422]
    print("Artifact Traversal Rejection: OK")
    
    # 13. Source Integrity
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT stored_path FROM evidence WHERE id = ?", (evidence_id,))
    stored_path = c.fetchone()[0]
    final_hash = hash_file(stored_path)
    assert initial_hash == final_hash
    print(f"Source Integrity: OK ({initial_hash} == {final_hash})")
    
    # 14. Case Isolation
    r = session.post(f"{BASE_URL}/cases", json={"title": "Case 2"})
    case2_id = r.json()["id"]
    r = session.get(f"{BASE_URL}/cases/{case2_id}/evidence")
    assert len(r.json()) == 0
    print("Case Isolation: OK")
    
    # 15. PNG Workflow
    import cv2
    import numpy as np
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    png_path = "test.png"
    cv2.imwrite(png_path, img)
    
    with open(png_path, "rb") as f:
        r = session.post(f"{BASE_URL}/cases/{case_id}/evidence", files={"file": ("test.png", f, "image/png")})
    assert r.status_code in [200, 201]
    png_ev_id = r.json()["id"]
    
    # JPEG specific should fail gracefully
    r = session.post(f"{BASE_URL}/evidence/{png_ev_id}/analysis/ela")
    assert r.status_code == 400
    r = session.post(f"{BASE_URL}/evidence/{png_ev_id}/analysis/jpeg-dct")
    assert r.status_code == 400
    # General should pass
    r = session.post(f"{BASE_URL}/evidence/{png_ev_id}/analysis/noise")
    assert r.status_code == 200
    print("PNG Workflow: OK")
    
    # 16. Corrupted file
    bad_path = "bad.jpg"
    with open(bad_path, "wb") as f:
        f.write(b"not an image data here")
    with open(bad_path, "rb") as f:
        r = session.post(f"{BASE_URL}/cases/{case_id}/evidence", files={"file": ("bad.jpg", f, "image/jpeg")})
    assert r.status_code == 400
    print("Corrupted Upload Rejection: OK")
    
    # Cleanup temp files
    try:
        if os.path.exists(png_path): os.remove(png_path)
        if os.path.exists(bad_path): os.remove(bad_path)
    except Exception:
        pass
    
    print("ALL TESTS PASSED")

if __name__ == "__main__":
    main()
