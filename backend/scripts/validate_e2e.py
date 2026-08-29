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
    
    # 2. Create Case
    r = requests.post(f"{BASE_URL}/cases", json={"title": "E2E Validation Case", "description": "Testing"})
    assert r.status_code == 201, f"Case creation failed: {r.text}"
    case_id = r.json()["id"]
    print(f"Case Created: {case_id}")
    
    # 3. Upload valid JPEG
    initial_hash = hash_file(TEST_IMG)
    with open(TEST_IMG, "rb") as f:
        r = requests.post(f"{BASE_URL}/cases/{case_id}/evidence", files={"file": ("test.jpg", f, "image/jpeg")})
    assert r.status_code == 201, f"Upload failed: {r.text}"
    evidence = r.json()
    evidence_id = evidence["id"]
    assert evidence["sha256_hash"] == initial_hash, "Hash mismatch!"
    print(f"Upload: OK, Evidence ID: {evidence_id}, Hash: {initial_hash}")
    
    # 4. Metadata
    r = requests.post(f"{BASE_URL}/evidence/{evidence_id}/analysis/metadata")
    assert r.status_code == 200
    print("Metadata: OK")
    
    # 5. ELA
    r = requests.post(f"{BASE_URL}/evidence/{evidence_id}/analysis/ela")
    assert r.status_code == 200
    print("ELA: OK")
    
    # 6. Noise
    r = requests.post(f"{BASE_URL}/evidence/{evidence_id}/analysis/noise")
    assert r.status_code == 200
    print("Noise: OK")
    
    # 7. JPEG/DCT
    r = requests.post(f"{BASE_URL}/evidence/{evidence_id}/analysis/jpeg-dct")
    assert r.status_code == 200
    print("JPEG/DCT: OK")
    
    # 8. Copy-Move
    r = requests.post(f"{BASE_URL}/evidence/{evidence_id}/analysis/copy-move")
    assert r.status_code == 200
    print("Copy-Move: OK")
    
    # 9. Normalization (run twice to check duplication)
    r = requests.post(f"{BASE_URL}/evidence/{evidence_id}/fusion/normalize")
    assert r.status_code == 200
    r = requests.post(f"{BASE_URL}/evidence/{evidence_id}/fusion/normalize")
    assert r.status_code == 200
    print("Normalization: OK")
    
    # 10. Correlation
    r = requests.post(f"{BASE_URL}/evidence/{evidence_id}/fusion/correlate")
    assert r.status_code == 200
    assessment = r.json()
    assert "assessment_level" in assessment
    assert assessment["rule_version"] == "7B-v1"
    print("Correlation: OK, Level:", assessment["assessment_level"])
    
    # 12. Artifact Validation
    # Let's get the ELA artifact path
    r = requests.get(f"{BASE_URL}/evidence/{evidence_id}/analysis")
    analyses = r.json()
    ela_analysis = next(a for a in analyses if a["analysis_type"] == "ela")
    artifact_path = ela_analysis["results"]["ela_map_url"]
    
    # The URL from the backend might be relative to the artifacts endpoint
    if artifact_path.startswith("/api/"):
        artifact_path = artifact_path[5:] # remove /api/
        
    r = requests.get(f"{BASE_URL}/{artifact_path}")
    assert r.status_code == 200
    print("Artifact Access: OK")
    
    # Traversal test
    r = requests.get(f"{BASE_URL}/artifacts/../main.py")
    assert r.status_code in [400, 404, 403, 422]
    print("Artifact Traversal Rejection: OK")
    
    # 13. Source Integrity
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT file_path FROM evidence WHERE id = ?", (evidence_id,))
    file_path = c.fetchone()[0]
    final_hash = hash_file(file_path)
    assert initial_hash == final_hash
    print(f"Source Integrity: OK ({initial_hash} == {final_hash})")
    
    # 14. Case Isolation
    r = requests.post(f"{BASE_URL}/cases", json={"title": "Case 2"})
    case2_id = r.json()["id"]
    r = requests.get(f"{BASE_URL}/cases/{case2_id}/evidence")
    assert len(r.json()) == 0
    print("Case Isolation: OK")
    
    # 15. PNG Workflow
    import cv2
    import numpy as np
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    png_path = "test.png"
    cv2.imwrite(png_path, img)
    
    with open(png_path, "rb") as f:
        r = requests.post(f"{BASE_URL}/cases/{case_id}/evidence", files={"file": ("test.png", f, "image/png")})
    assert r.status_code == 201
    png_ev_id = r.json()["id"]
    
    # JPEG specific should fail gracefully
    r = requests.post(f"{BASE_URL}/evidence/{png_ev_id}/analysis/ela")
    assert r.status_code == 400
    r = requests.post(f"{BASE_URL}/evidence/{png_ev_id}/analysis/jpeg-dct")
    assert r.status_code == 400
    # General should pass
    r = requests.post(f"{BASE_URL}/evidence/{png_ev_id}/analysis/noise")
    assert r.status_code == 200
    print("PNG Workflow: OK")
    
    # 16. Corrupted file
    bad_path = "bad.jpg"
    with open(bad_path, "wb") as f:
        f.write(b"not an image data here")
    with open(bad_path, "rb") as f:
        r = requests.post(f"{BASE_URL}/cases/{case_id}/evidence", files={"file": ("bad.jpg", f, "image/jpeg")})
    assert r.status_code == 400
    print("Corrupted Upload Rejection: OK")
    
    print("ALL TESTS PASSED")

if __name__ == "__main__":
    main()
