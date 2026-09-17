import os
import requests
import json

BASE_URL = "http://127.0.0.1:8000/api"
AUTH_URL = "http://127.0.0.1:8000/api/auth/login"
TEST_IMG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test.jpg")

def main():
    print("\n--- E2E WORKFLOW SIMULATION ---")
    
    print("\n1. Authentication")
    r = requests.post(AUTH_URL, data={"username": "admin", "password": "forensight_admin"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f"   [SUCCESS] Logged in. Token obtained.")
    
    print("\n2. Case Creation")
    r = requests.post(f"{BASE_URL}/cases", json={"title": "E2E Automated Workflow", "description": "Full analysis pass"}, headers=headers)
    assert r.status_code == 200, f"Case creation failed: {r.text}"
    case = r.json()
    case_identifier = case["case_identifier"]
    print(f"   [SUCCESS] Case Created: {case_identifier}")
    
    print("\n3. Evidence Ingestion & Cryptographic Fingerprinting")
    with open(TEST_IMG, "rb") as f:
        r = requests.post(f"{BASE_URL}/cases/{case_identifier}/evidence", files={"file": ("test.jpg", f, "image/jpeg")}, headers=headers)
    assert r.status_code == 200, f"Upload failed: {r.text}"
    evidence = r.json()
    evidence_id = evidence["id"]
    print(f"   [SUCCESS] Evidence Uploaded: ID {evidence_id}")
    print(f"   [SUCCESS] SHA-256 Hash Locked: {evidence['sha256_hash']}")
    
    print("\n4. Triggering Forensic Engines")
    analyses = ["metadata", "ela", "noise", "jpeg-dct", "copy-move"]
    for engine in analyses:
        r = requests.post(f"{BASE_URL}/evidence/{evidence_id}/analysis/{engine}", headers=headers)
        assert r.status_code == 200, f"{engine} failed: {r.text}"
        print(f"   [SUCCESS] {engine.upper()} Engine executed")
    
    print("\n5. Evidence Fusion & Assessment")
    r = requests.post(f"{BASE_URL}/evidence/{evidence_id}/fusion/normalize", headers=headers)
    assert r.status_code == 200, f"Normalization failed: {r.text}"
    print(f"   [SUCCESS] Metrics Normalized")
    
    r = requests.post(f"{BASE_URL}/evidence/{evidence_id}/fusion/correlate", headers=headers)
    assert r.status_code == 200, f"Correlation failed: {r.text}"
    assessment = r.json()
    print(f"   [SUCCESS] Assessment Generated.")
    print(f"   -> Result Level: {assessment['assessment']['level']}")
    
    print("\n6. Audit Trail Extraction")
    r = requests.get(f"{BASE_URL}/cases/{case_identifier}/audit", headers=headers)
    assert r.status_code == 200, "Audit fetch failed"
    events = r.json()
    print(f"   [SUCCESS] Retrieved {len(events)} immutable audit records:")
    for e in events:
        print(f"      - {e['timestamp']}: {e['event_type']} (by {e['actor']})")
        
    print("\n7. Final Reporting")
    r = requests.post(f"{BASE_URL}/cases/{case_identifier}/reports", headers=headers)
    assert r.status_code == 200, f"Report generation failed: {r.text}"
    report = r.json()
    print(f"   [SUCCESS] Forensics Report Issued: {report['report_identifier']}")
    
    print("\n--- WORKFLOW COMPLETE ---\n")

if __name__ == "__main__":
    main()
