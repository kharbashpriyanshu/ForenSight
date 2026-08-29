import pytest
import io
import cv2
import numpy as np
from app.models.domain import Analysis, EvidenceObservation
from app.forensics.fusion.normalizer import EvidenceNormalizer

def create_valid_image():
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    _, buffer = cv2.imencode(".jpg", img)
    return io.BytesIO(buffer)

def test_evidence_normalization_api(client, db_session):
    # Create Case and Evidence
    case_res = client.post("/api/cases", json={"title": "Fusion Case"})
    case_id = case_res.json()["id"]

    # Upload valid image
    files = {'file': ('test.jpg', create_valid_image(), 'image/jpeg')}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    ev_id = ev_res.json()["id"]

    # Inject mock analyses
    an1 = Analysis(
        evidence_id=ev_id, analysis_type="COPY_MOVE", status="completed",
        structured_findings={"matching_statistics": {"geometric_inliers": 24, "spatially_filtered_matches": 28}}
    )
    an2 = Analysis(
        evidence_id=ev_id, analysis_type="METADATA", status="completed",
        structured_findings={"metadata": {"Software": "Adobe Photoshop"}}
    )
    an3 = Analysis(
        evidence_id=ev_id, analysis_type="ELA", status="completed",
        structured_findings={"statistics": {"mean": 6.21}}
    )
    db_session.add_all([an1, an2, an3])
    db_session.commit()

    # Hit normalization endpoint
    norm_res = client.post(f"/api/evidence/{ev_id}/fusion/normalize")
    assert norm_res.status_code == 200
    data = norm_res.json()
    
    assert "METADATA" in data["modalities_present"]
    assert "COPY_MOVE" in data["modalities_present"]
    assert "ELA" in data["modalities_present"]
    assert "NOISE" in data["modalities_missing"]
    assert "JPEG_DCT" in data["modalities_missing"]
    
    observations = data["observations"]
    assert len(observations) == 3
    
    cm_obs = next(o for o in observations if o["modality"] == "COPY_MOVE")
    assert cm_obs["raw_value"] == "24"
    assert cm_obs["normalized_value"] == 24 / 28
    assert cm_obs["direction"] == "candidate"
    
    meta_obs = next(o for o in observations if o["modality"] == "METADATA")
    assert meta_obs["raw_value"] == "Adobe Photoshop"
    assert meta_obs["direction"] == "present"
    
    ela_obs = next(o for o in observations if o["modality"] == "ELA")
    assert ela_obs["raw_value"] == "6.2100"
    assert ela_obs["normalized_value"] is None
    
    # Test idempotency
    norm_res2 = client.post(f"/api/evidence/{ev_id}/fusion/normalize")
    assert norm_res2.status_code == 200
    assert len(norm_res2.json()["observations"]) == 3
    
    # Test scientific no-verdict (make sure no 'manipulation' probability is in observations)
    for obs in data["observations"]:
        assert "probability" not in obs["interpretation"].lower()
        assert "fake" not in obs["interpretation"].lower()
        
    # --- Sprint 7B Tests ---
    
    # 1. Run correlation
    corr_res = client.post(f"/api/evidence/{ev_id}/fusion/correlate")
    assert corr_res.status_code == 200
    c_data = corr_res.json()
    
    # Families check
    assert "Compression" in c_data["families"]
    assert "Spatial Correspondence" in c_data["families"]
    assert "File Context" in c_data["families"]
    
    # Relations check
    rels = c_data["relations"]
    assert len(rels) > 0
    assert rels[0]["relation_type"] == "CONTEXTUAL"
    
    # Let's assert the assessment
    assmt = c_data["assessment"]
    assert assmt["level"] in ["MODERATE_FORENSIC_CONCERN", "ELEVATED_FORENSIC_CONCERN"] # Meta(Context) + CM(candidate) = 2 active families -> ELEVATED
    assert assmt["rule_version"] == "7B-v1"
    
def test_correlation_specific_rules(client, db_session):
    case_res = client.post("/api/cases", json={"title": "Fusion Case 2"})
    case_id = case_res.json()["id"]

    files = {'file': ('test.jpg', create_valid_image(), 'image/jpeg')}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    ev_id = ev_res.json()["id"]
    
    # ELA (Elevated) + DCT (Suppressed)
    an1 = Analysis(
        evidence_id=ev_id, analysis_type="ELA", status="completed",
        structured_findings={"statistics": {"mean": 6.5}}
    )
    an2 = Analysis(
        evidence_id=ev_id, analysis_type="JPEG_DCT", status="completed",
        structured_findings={"frequency_bands": {"high_freq_energy": 5.0}}
    )
    db_session.add_all([an1, an2])
    db_session.commit()
    
    client.post(f"/api/evidence/{ev_id}/fusion/normalize")
    corr_res = client.post(f"/api/evidence/{ev_id}/fusion/correlate")
    c_data = corr_res.json()
    
    assert "Compression" in c_data["families"]
    assert len(c_data["families"]) == 1 # ELA and DCT are both Compression
    
    rels = c_data["relations"]
    assert len(rels) == 1
    assert rels[0]["relation_type"] == "CONTEXTUAL" # They don't count as two independent invalid scores
    
    assmt = c_data["assessment"]
    assert assmt["level"] == "MODERATE_FORENSIC_CONCERN" # 1 family (Compression)

