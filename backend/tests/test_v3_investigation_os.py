import os
import io
import pytest
from datetime import timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import get_db
from app.models.domain import InvestigationCase, Evidence, Analysis, User
from app.core.security import create_access_token, get_password_hash
from PIL import Image

@pytest.fixture
def test_image_bytes():
    buf = io.BytesIO()
    img = Image.new("RGB", (100, 100), color=(120, 150, 180))
    img.save(buf, format="JPEG")
    return buf.getvalue()

@pytest.fixture
def test_png_bytes():
    buf = io.BytesIO()
    img = Image.new("RGB", (80, 80), color=(50, 100, 150))
    img.save(buf, format="PNG")
    return buf.getvalue()

@pytest.fixture
def auth_context(db_session):
    user = db_session.query(User).filter(User.username == "v3_investigator").first()
    if not user:
        user = User(
            username="v3_investigator",
            hashed_password=get_password_hash("v3_password"),
            role="INVESTIGATOR"
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

    token = create_access_token(user.username, expires_delta=timedelta(hours=2))
    headers = {"Authorization": f"Bearer {token}"}
    return {"user": user, "headers": headers}

def test_v3_batch_upload_and_analysis_queue(db_session, auth_context, client, test_image_bytes, test_png_bytes):
    headers = auth_context["headers"]

    # 1. Create case
    case_res = client.post("/api/cases", json={"title": "V3 Batch Test Case"}, headers=headers)
    assert case_res.status_code == 200
    case_data = case_res.json()
    case_id = case_data["case_identifier"]

    # 2. Batch upload 2 files
    files = [
        ("files", ("image1.jpg", io.BytesIO(test_image_bytes), "image/jpeg")),
        ("files", ("image2.png", io.BytesIO(test_png_bytes), "image/png")),
    ]
    batch_upload_res = client.post(f"/api/cases/{case_id}/evidence/batch", files=files, headers=headers)
    assert batch_upload_res.status_code == 200
    batch_data = batch_upload_res.json()
    assert batch_data["uploaded_count"] == 2
    assert len(batch_data["items"]) == 2
    ev1_id = batch_data["items"][0]["id"]
    ev2_id = batch_data["items"][1]["id"]

    # 3. Queue batch analysis
    batch_anl_res = client.post(
        f"/api/cases/{case_id}/batch-analysis",
        json={"evidence_ids": [ev1_id, ev2_id], "analysis_types": ["metadata", "ela"]},
        headers=headers
    )
    assert batch_anl_res.status_code == 200
    status_data = batch_anl_res.json()
    assert status_data["total_jobs"] >= 2
    assert "progress_percentage" in status_data

    # 4. Check batch jobs endpoint
    jobs_res = client.get(f"/api/cases/{case_id}/batch-jobs", headers=headers)
    assert jobs_res.status_code == 200
    jobs_data = jobs_res.json()
    assert len(jobs_data["jobs"]) >= 2

def test_v3_multi_modality_heatmap(db_session, auth_context, client, test_image_bytes):
    headers = auth_context["headers"]

    case_res = client.post("/api/cases", json={"title": "V3 Heatmap Case"}, headers=headers)
    case_id = case_res.json()["case_identifier"]

    upload_res = client.post(
        f"/api/cases/{case_id}/evidence",
        files={"file": ("heatmap_test.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
        headers=headers
    )
    ev_id = upload_res.json()["id"]

    # Request heatmap
    heatmap_res = client.get(f"/api/evidence/{ev_id}/heatmap", headers=headers)
    assert heatmap_res.status_code == 200
    h_data = heatmap_res.json()
    assert h_data["evidence_id"] == ev_id
    assert len(h_data["layers"]) == 3  # ELA, NOISE, COPY_MOVE
    assert "what_was_found" in h_data
    assert "why_it_matters" in h_data
    assert "recommended_next_steps" in h_data
    assert "limitations" in h_data

def test_v3_cross_image_correlation(db_session, auth_context, client, test_image_bytes):
    headers = auth_context["headers"]

    case_res = client.post("/api/cases", json={"title": "V3 Cross-Correlation Case"}, headers=headers)
    case_id = case_res.json()["case_identifier"]

    # Upload two images
    files = [
        ("files", ("cam_a.jpg", io.BytesIO(test_image_bytes), "image/jpeg")),
        ("files", ("cam_b.jpg", io.BytesIO(test_image_bytes), "image/jpeg")),
    ]
    client.post(f"/api/cases/{case_id}/evidence/batch", files=files, headers=headers)

    # Evaluate cross correlation
    corr_res = client.get(f"/api/cases/{case_id}/cross-correlation", headers=headers)
    assert corr_res.status_code == 200
    corr_data = corr_res.json()
    assert corr_data["total_evidence_evaluated"] == 2
    assert "temporal_sequence" in corr_data
    assert "camera_clusters" in corr_data
    assert "cross_image_matches" in corr_data
    assert "disclaimer" in corr_data

def test_v3_investigation_assistant(db_session, auth_context, client, test_image_bytes):
    headers = auth_context["headers"]

    case_res = client.post("/api/cases", json={"title": "V3 Assistant Case"}, headers=headers)
    case_id = case_res.json()["case_identifier"]

    client.post(
        f"/api/cases/{case_id}/evidence",
        files={"file": ("assistant_test.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
        headers=headers
    )

    asst_res = client.get(f"/api/cases/{case_id}/assistant", headers=headers)
    assert asst_res.status_code == 200
    asst_data = asst_res.json()
    assert asst_data["evidence_count"] == 1
    assert len(asst_data["investigative_next_steps"]) > 0
    assert len(asst_data["counter_hypotheses"]) >= 3
    assert len(asst_data["forensic_completeness"]) == 5  # 5 modalities
    assert "what_was_found_summary" in asst_data
    assert "why_it_matters_summary" in asst_data
    assert "scientific_disclaimer" in asst_data

def test_v3_chain_of_custody_and_verification(db_session, auth_context, client, test_image_bytes):
    headers = auth_context["headers"]

    case_res = client.post("/api/cases", json={"title": "V3 Custody Case"}, headers=headers)
    case_id = case_res.json()["case_identifier"]

    upload_res = client.post(
        f"/api/cases/{case_id}/evidence",
        files={"file": ("custody_test.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
        headers=headers
    )
    ev_id = upload_res.json()["id"]

    # 1. On-demand single evidence verify
    verify_res = client.post(f"/api/evidence/{ev_id}/verify-custody", headers=headers)
    assert verify_res.status_code == 200
    v_data = verify_res.json()
    assert v_data["evidence_id"] == ev_id
    assert v_data["integrity_intact"] is True
    assert v_data["status"] == "VERIFIED_INTACT"

    # 2. Case-wide chain of custody ledger
    custody_res = client.get(f"/api/cases/{case_id}/chain-of-custody", headers=headers)
    assert custody_res.status_code == 200
    c_data = custody_res.json()
    assert c_data["all_hashes_intact"] is True
    assert len(c_data["evidence_summaries"]) == 1
    assert len(c_data["custody_timeline"]) >= 2  # EVIDENCE_UPLOADED and CUSTODY_VERIFIED

def test_v3_report_generation_includes_v3_elements(db_session, auth_context, client, test_image_bytes):
    headers = auth_context["headers"]

    case_res = client.post("/api/cases", json={"title": "V3 Report Case"}, headers=headers)
    case_id = case_res.json()["case_identifier"]

    client.post(
        f"/api/cases/{case_id}/evidence",
        files={"file": ("report_test.jpg", io.BytesIO(test_image_bytes), "image/jpeg")},
        headers=headers
    )

    # Generate JSON report
    rpt_res = client.post(f"/api/cases/{case_id}/reports?format=json", headers=headers)
    assert rpt_res.status_code == 200
    rpt_data = rpt_res.json()
    assert "report_identifier" in rpt_data

    # Download report artifact
    rpt_id = rpt_data["report_identifier"]
    art_res = client.get(f"/api/reports/{rpt_id}/download", headers=headers)
    assert art_res.status_code == 200
    content = art_res.json()
    assert "investigation_assistant" in content
    assert "chain_of_custody_status" in content
    assert "ForenSight V3" in content["software_version"]
