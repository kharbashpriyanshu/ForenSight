import io
import os
import pytest
from datetime import timedelta
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.api.deps import get_current_user
from app.models.domain import User, InvestigationCase, Evidence, Analysis, AnalysisJob, Report, AuditEvent
from app.core.security import create_access_token, get_password_hash

def _create_test_image_bytes(color=(200, 100, 50), size=(100, 100)):
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=color)
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf.read()

@pytest.fixture
def phase5_env(db_session):
    """
    Sets up isolated test users, cases, evidence, and tokens for Phase 5 tests.
    """
    old_override = app.dependency_overrides.pop(get_current_user, None)

    user_a = User(username="inv_a_p5", hashed_password=get_password_hash("pass_a"), role="INVESTIGATOR")
    user_b = User(username="inv_b_p5", hashed_password=get_password_hash("pass_b"), role="INVESTIGATOR")
    admin = User(username="admin_p5", hashed_password=get_password_hash("admin_pass"), role="ADMIN")

    db_session.add_all([user_a, user_b, admin])
    db_session.commit()
    db_session.refresh(user_a)
    db_session.refresh(user_b)
    db_session.refresh(admin)

    token_a = create_access_token(user_a.username, expires_delta=timedelta(hours=1))
    token_b = create_access_token(user_b.username, expires_delta=timedelta(hours=1))
    token_admin = create_access_token(admin.username, expires_delta=timedelta(hours=1))

    # Case A (owned by User A)
    case_a = InvestigationCase(title="Operation Phase 5 Alpha", user_id=user_a.id)
    # Case B (owned by User B)
    case_b = InvestigationCase(title="Operation Phase 5 Beta", user_id=user_b.id)
    db_session.add_all([case_a, case_b])
    db_session.commit()
    db_session.refresh(case_a)
    db_session.refresh(case_b)

    # Ingest two evidence items into Case A
    img_bytes_1 = _create_test_image_bytes(color=(255, 0, 0), size=(120, 80))
    img_bytes_2 = _create_test_image_bytes(color=(0, 255, 0), size=(200, 150))

    # Storage paths
    os.makedirs("storage/evidence", exist_ok=True)
    ev_path_1 = f"storage/evidence/ev_a1_{case_a.id}.jpg"
    ev_path_2 = f"storage/evidence/ev_a2_{case_a.id}.jpg"
    with open(ev_path_1, "wb") as f:
        f.write(img_bytes_1)
    with open(ev_path_2, "wb") as f:
        f.write(img_bytes_2)

    ev_1 = Evidence(
        case_id=case_a.id,
        original_filename="tampered_document.jpg",
        stored_path=ev_path_1,
        sha256_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        file_size=len(img_bytes_1),
        mime_type="image/jpeg",
        width=120,
        height=80,
    )
    ev_2 = Evidence(
        case_id=case_a.id,
        original_filename="reference_document.jpg",
        stored_path=ev_path_2,
        sha256_hash="11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
        file_size=len(img_bytes_2),
        mime_type="image/jpeg",
        width=200,
        height=150,
    )
    db_session.add_all([ev_1, ev_2])
    db_session.commit()
    db_session.refresh(ev_1)
    db_session.refresh(ev_2)

    # Add an analysis and audit events to Case A
    audit_ev = AuditEvent(
        case_id=case_a.case_identifier,
        evidence_id=ev_1.id,
        event_type="EVIDENCE_INGESTED",
        actor="inv_a_p5",
        safe_metadata='{"filename": "tampered_document.jpg"}',
    )
    audit_job = AuditEvent(
        case_id=case_a.case_identifier,
        evidence_id=ev_1.id,
        event_type="ANALYSIS_COMPLETED",
        actor="inv_a_p5",
        safe_metadata='{"engine": "ELA"}',
    )
    db_session.add_all([audit_ev, audit_job])
    db_session.commit()

    test_client = TestClient(app)

    yield {
        "client": test_client,
        "user_a": user_a,
        "user_b": user_b,
        "admin": admin,
        "token_a": token_a,
        "token_b": token_b,
        "token_admin": token_admin,
        "case_a": case_a,
        "case_b": case_b,
        "ev_1": ev_1,
        "ev_2": ev_2,
    }

    if old_override:
        app.dependency_overrides[get_current_user] = old_override

def test_phase5_case_overview_enriched_metrics(phase5_env):
    """
    Verifies that CaseOverviewStats computes all real investigation dashboard metrics.
    """
    client = phase5_env["client"]
    token_a = phase5_env["token_a"]
    case_a = phase5_env["case_a"]

    headers = {"Authorization": f"Bearer {token_a}"}
    res = client.get(f"/api/cases/{case_a.id}/overview", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["case_identifier"] == case_a.case_identifier
    assert data["evidence_count"] == 2
    assert "pending_job_count" in data
    assert "running_job_count" in data
    assert "findings_count" in data
    assert "audit_event_count" in data
    assert data["audit_event_count"] >= 2
    assert data["rule_version"] == "Fusion 7B-v1"

def test_phase5_evidence_list_and_filtering(phase5_env):
    """
    Verifies GET /cases/{case_id}/evidence with search query and MIME filter.
    """
    client = phase5_env["client"]
    token_a = phase5_env["token_a"]
    case_a = phase5_env["case_a"]

    headers = {"Authorization": f"Bearer {token_a}"}
    
    # 1. Fetch all evidence
    res = client.get(f"/api/cases/{case_a.id}/evidence", headers=headers)
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 2
    assert "completed_analyses" in items[0]
    assert "has_artifacts" in items[0]

    # 2. Search query filter
    res_q = client.get(f"/api/cases/{case_a.id}/evidence?q=tampered", headers=headers)
    assert res_q.status_code == 200
    q_items = res_q.json()
    assert len(q_items) == 1
    assert q_items[0]["original_filename"] == "tampered_document.jpg"

    # 3. MIME filter match
    res_mime = client.get(f"/api/cases/{case_a.id}/evidence?mime_type=image/jpeg", headers=headers)
    assert res_mime.status_code == 200
    assert len(res_mime.json()) == 2

    # 4. MIME filter no match
    res_png = client.get(f"/api/cases/{case_a.id}/evidence?mime_type=image/png", headers=headers)
    assert res_png.status_code == 200
    assert len(res_png.json()) == 0

def test_phase5_evidence_comparison(phase5_env):
    """
    Verifies GET /cases/{case_id}/compare side-by-side comparison without fake manipulation scores.
    """
    client = phase5_env["client"]
    token_a = phase5_env["token_a"]
    token_b = phase5_env["token_b"]
    case_a = phase5_env["case_a"]
    ev_1 = phase5_env["ev_1"]
    ev_2 = phase5_env["ev_2"]

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 1. Valid comparison by owner
    res = client.get(
        f"/api/cases/{case_a.id}/compare?evidence_a_id={ev_1.id}&evidence_b_id={ev_2.id}",
        headers=headers_a
    )
    assert res.status_code == 200
    data = res.json()
    assert data["case_identifier"] == case_a.case_identifier
    assert data["evidence_a"]["id"] == ev_1.id
    assert data["evidence_b"]["id"] == ev_2.id
    assert len(data["differences"]) >= 2
    # Verify differences note hash and dimensions
    diffs_text = " ".join(data["differences"]).lower()
    assert "hash" in diffs_text
    assert "dimensions" in diffs_text

    # 2. Cross-user isolation: User B cannot compare items in Case A
    res_forbidden = client.get(
        f"/api/cases/{case_a.id}/compare?evidence_a_id={ev_1.id}&evidence_b_id={ev_2.id}",
        headers=headers_b
    )
    assert res_forbidden.status_code == 403

def test_phase5_pdf_report_generation_and_download(phase5_env):
    """
    Verifies ReportLab PDF generation, content validation, and authenticated download.
    """
    client = phase5_env["client"]
    token_a = phase5_env["token_a"]
    token_b = phase5_env["token_b"]
    token_admin = phase5_env["token_admin"]
    case_a = phase5_env["case_a"]

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    headers_admin = {"Authorization": f"Bearer {token_admin}"}

    # 1. Generate PDF Report
    res_gen = client.post(
        f"/api/cases/{case_a.id}/reports?format=pdf",
        headers=headers_a
    )
    assert res_gen.status_code == 200
    report_data = res_gen.json()
    report_id = report_data["report_identifier"]
    assert report_data["status"] in ("COMPLETED", "Generated")
    assert report_data["rule_version"] in ("7B-v1", "Fusion 7B-v1")
    assert report_data["artifact_path"].endswith(".pdf")

    # Verify PDF file exists and starts with %PDF
    assert os.path.exists(report_data["artifact_path"])
    with open(report_data["artifact_path"], "rb") as f:
        header = f.read(5)
        assert header == b"%PDF-"

    # Also check JSON file was saved alongside it
    json_path = report_data["artifact_path"][:-4] + ".json"
    assert os.path.exists(json_path)

    # 2. Download PDF as Owner
    res_dl = client.get(f"/api/reports/{report_id}/download?format=pdf", headers=headers_a)
    assert res_dl.status_code == 200
    assert res_dl.headers["content-type"] == "application/pdf"
    assert "attachment; filename=" in res_dl.headers.get("content-disposition", "")
    assert res_dl.content.startswith(b"%PDF-")

    # 3. Download JSON as Owner
    res_dl_json = client.get(f"/api/reports/{report_id}/download?format=json", headers=headers_a)
    assert res_dl_json.status_code == 200
    assert "application/json" in res_dl_json.headers["content-type"]

    # 4. Cross-user isolation: User B gets 403 on download
    res_dl_unauth = client.get(f"/api/reports/{report_id}/download?format=pdf", headers=headers_b)
    assert res_dl_unauth.status_code == 403

    # 5. Admin access: Admin can download report
    res_dl_admin = client.get(f"/api/reports/{report_id}/download?format=pdf", headers=headers_admin)
    assert res_dl_admin.status_code == 200
    assert res_dl_admin.headers["content-type"] == "application/pdf"

def test_phase5_audit_trail_categories_and_admin_global(phase5_env):
    """
    Verifies category filtering on case audit trail and ADMIN global audit view.
    """
    client = phase5_env["client"]
    token_a = phase5_env["token_a"]
    token_b = phase5_env["token_b"]
    token_admin = phase5_env["token_admin"]
    case_a = phase5_env["case_a"]

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    headers_admin = {"Authorization": f"Bearer {token_admin}"}

    # 1. Filter case audit trail by EVIDENCE category
    res_ev = client.get(f"/api/cases/{case_a.id}/audit?category=EVIDENCE", headers=headers_a)
    assert res_ev.status_code == 200
    ev_events = res_ev.json()
    assert len(ev_events) >= 1
    assert all(e["event_type"].startswith("EVIDENCE") for e in ev_events)

    # 2. Filter case audit trail by ANALYSIS category
    res_an = client.get(f"/api/cases/{case_a.id}/audit?category=ANALYSIS", headers=headers_a)
    assert res_an.status_code == 200
    an_events = res_an.json()
    assert len(an_events) >= 1
    assert all("ANALYSIS" in e["event_type"] or "JOB" in e["event_type"] for e in an_events)

    # 3. Global audit trail: Admin can fetch all events across system
    res_global = client.get("/api/audit", headers=headers_admin)
    assert res_global.status_code == 200
    assert len(res_global.json()) >= 2

    # 4. Global audit trail: Non-admin Investigator gets 403
    res_global_forbidden = client.get("/api/audit", headers=headers_b)
    assert res_global_forbidden.status_code == 403
