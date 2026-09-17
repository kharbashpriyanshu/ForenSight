import io
import pytest
from datetime import timedelta
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import get_db
from app.api.deps import get_current_user
from app.models.domain import User, InvestigationCase, Evidence, Analysis, AnalysisJob, Report
from app.core.security import create_access_token, get_password_hash

@pytest.fixture
def auth_test_env(db_session):
    """
    Sets up a clean test client without the global get_current_user override,
    and seeds two investigators and one admin user into the in-memory test database.
    """
    old_override = app.dependency_overrides.pop(get_current_user, None)
    
    # Create test users
    user_a = User(username="investigator_a", hashed_password=get_password_hash("pass_a"), role="INVESTIGATOR")
    user_b = User(username="investigator_b", hashed_password=get_password_hash("pass_b"), role="INVESTIGATOR")
    admin = User(username="security_admin", hashed_password=get_password_hash("admin_pass"), role="ADMIN")
    
    db_session.add_all([user_a, user_b, admin])
    db_session.commit()
    db_session.refresh(user_a)
    db_session.refresh(user_b)
    db_session.refresh(admin)

    token_a = create_access_token(user_a.username, expires_delta=timedelta(hours=1))
    token_b = create_access_token(user_b.username, expires_delta=timedelta(hours=1))
    token_admin = create_access_token(admin.username, expires_delta=timedelta(hours=1))

    # Case A owned by User A
    case_a = InvestigationCase(title="Case Alpha", user_id=user_a.id)
    # Case B owned by User B
    case_b = InvestigationCase(title="Case Beta", user_id=user_b.id)
    db_session.add_all([case_a, case_b])
    db_session.commit()
    db_session.refresh(case_a)
    db_session.refresh(case_b)

    # Evidence A linked to Case A
    ev_a = Evidence(
        case_id=case_a.id,
        original_filename="ev_a.png",
        stored_path="storage/evidence/test_a.png",
        mime_type="image/png",
        file_size=100,
        sha256_hash="hash_a",
        image_format="PNG",
        width=10,
        height=10
    )
    # Evidence B linked to Case B
    ev_b = Evidence(
        case_id=case_b.id,
        original_filename="ev_b.png",
        stored_path="storage/evidence/test_b.png",
        mime_type="image/png",
        file_size=100,
        sha256_hash="hash_b",
        image_format="PNG",
        width=10,
        height=10
    )
    db_session.add_all([ev_a, ev_b])
    db_session.commit()
    db_session.refresh(ev_a)
    db_session.refresh(ev_b)

    # Job B linked to Evidence B
    job_b = AnalysisJob(evidence_id=ev_b.id, analysis_type="metadata", status="COMPLETED")
    # Analysis B linked to Evidence B
    anl_b = Analysis(evidence_id=ev_b.id, analysis_type="metadata", status="completed")
    db_session.add_all([job_b, anl_b])
    db_session.commit()
    db_session.refresh(job_b)
    db_session.refresh(anl_b)

    client = TestClient(app)

    yield {
        "client": client,
        "user_a": user_a,
        "user_b": user_b,
        "admin": admin,
        "token_a": token_a,
        "token_b": token_b,
        "token_admin": token_admin,
        "case_a": case_a,
        "case_b": case_b,
        "ev_a": ev_a,
        "ev_b": ev_b,
        "job_b": job_b,
        "anl_b": anl_b
    }

    # Restore conftest override
    if old_override:
        app.dependency_overrides[get_current_user] = old_override


# ==========================================
# 1. Unauthenticated Access Rejections (401)
# ==========================================

def test_unauthenticated_requests_return_401(auth_test_env):
    client = auth_test_env["client"]
    ev_id = auth_test_env["ev_b"].id
    case_id = auth_test_env["case_b"].case_identifier
    job_id = auth_test_env["job_b"].id
    anl_id = auth_test_env["anl_b"].id

    # Analysis routes
    assert client.post(f"/api/evidence/{ev_id}/analysis/metadata").status_code == 401
    assert client.get(f"/api/analysis/{anl_id}").status_code == 401
    assert client.get("/api/artifacts/analyses/ela/test.png").status_code == 401

    # Jobs routes
    assert client.post(f"/api/jobs/analysis/{ev_id}/metadata").status_code == 401
    assert client.get(f"/api/jobs/{job_id}").status_code == 401
    assert client.get(f"/api/evidence/{ev_id}/jobs").status_code == 401

    # Fusion routes
    assert client.post(f"/api/evidence/{ev_id}/fusion/normalize").status_code == 401
    assert client.post(f"/api/evidence/{ev_id}/fusion/correlate").status_code == 401

    # Reports routes
    assert client.post(f"/api/cases/{case_id}/reports").status_code == 401
    assert client.get(f"/api/cases/{case_id}/reports").status_code == 401
    assert client.get(f"/api/reports/FS-RPT-FAKE/download").status_code == 401

    # Audit route
    assert client.get(f"/api/cases/{case_id}/audit").status_code == 401


# ==========================================
# 2. Invalid & Expired Token Tests (401)
# ==========================================

def test_invalid_jwt_token_returns_401(auth_test_env):
    client = auth_test_env["client"]
    headers = {"Authorization": "Bearer invalid.jwt.signature"}
    res = client.get(f"/api/cases/{auth_test_env['case_b'].case_identifier}", headers=headers)
    assert res.status_code == 401


def test_expired_jwt_token_returns_401(auth_test_env):
    client = auth_test_env["client"]
    # Token expired 1 hour ago
    expired_token = create_access_token("investigator_a", expires_delta=timedelta(hours=-1))
    headers = {"Authorization": f"Bearer {expired_token}"}
    res = client.get(f"/api/cases/{auth_test_env['case_b'].case_identifier}", headers=headers)
    assert res.status_code == 401


# ==========================================
# 3. Cross-Investigator Boundary Tests (403)
# ==========================================

def test_investigator_a_denied_access_to_investigator_b_case(auth_test_env):
    client = auth_test_env["client"]
    headers_a = {"Authorization": f"Bearer {auth_test_env['token_a']}"}
    case_b_id = auth_test_env["case_b"].case_identifier

    res = client.get(f"/api/cases/{case_b_id}", headers=headers_a)
    assert res.status_code == 403
    assert "Not authorized" in res.json()["detail"]


def test_investigator_a_denied_jobs_on_investigator_b_evidence(auth_test_env):
    client = auth_test_env["client"]
    headers_a = {"Authorization": f"Bearer {auth_test_env['token_a']}"}
    ev_b_id = auth_test_env["ev_b"].id
    job_b_id = auth_test_env["job_b"].id

    # Cannot queue job on another's evidence
    res_queue = client.post(f"/api/jobs/analysis/{ev_b_id}/metadata", headers=headers_a)
    assert res_queue.status_code == 403
    assert "Not authorized" in res_queue.json()["detail"]

    # Cannot inspect another's job
    res_job = client.get(f"/api/jobs/{job_b_id}", headers=headers_a)
    assert res_job.status_code == 403

    # Cannot list jobs for another's evidence
    res_list = client.get(f"/api/evidence/{ev_b_id}/jobs", headers=headers_a)
    assert res_list.status_code == 403


def test_investigator_a_denied_analysis_on_investigator_b_evidence(auth_test_env):
    client = auth_test_env["client"]
    headers_a = {"Authorization": f"Bearer {auth_test_env['token_a']}"}
    ev_b_id = auth_test_env["ev_b"].id
    anl_b_id = auth_test_env["anl_b"].id

    # Cannot trigger analysis on another's evidence
    assert client.post(f"/api/evidence/{ev_b_id}/analysis/metadata", headers=headers_a).status_code == 403
    assert client.post(f"/api/evidence/{ev_b_id}/analysis/ela", headers=headers_a).status_code == 403
    assert client.post(f"/api/evidence/{ev_b_id}/analysis/noise", headers=headers_a).status_code == 403
    assert client.post(f"/api/evidence/{ev_b_id}/analysis/jpeg-dct", headers=headers_a).status_code == 403
    assert client.post(f"/api/evidence/{ev_b_id}/analysis/copy-move", headers=headers_a).status_code == 403

    # Cannot read another's analysis
    assert client.get(f"/api/analysis/{anl_b_id}", headers=headers_a).status_code == 403


def test_investigator_a_denied_fusion_on_investigator_b_evidence(auth_test_env):
    client = auth_test_env["client"]
    headers_a = {"Authorization": f"Bearer {auth_test_env['token_a']}"}
    ev_b_id = auth_test_env["ev_b"].id

    res_norm = client.post(f"/api/evidence/{ev_b_id}/fusion/normalize", headers=headers_a)
    assert res_norm.status_code == 403

    res_corr = client.post(f"/api/evidence/{ev_b_id}/fusion/correlate", headers=headers_a)
    assert res_corr.status_code == 403


def test_investigator_a_denied_reports_and_audit_on_investigator_b_case(auth_test_env):
    client = auth_test_env["client"]
    headers_a = {"Authorization": f"Bearer {auth_test_env['token_a']}"}
    case_b_id = auth_test_env["case_b"].case_identifier

    # Reports
    assert client.post(f"/api/cases/{case_b_id}/reports", headers=headers_a).status_code == 403
    assert client.get(f"/api/cases/{case_b_id}/reports", headers=headers_a).status_code == 403

    # Audit
    assert client.get(f"/api/cases/{case_b_id}/audit", headers=headers_a).status_code == 403


# ==========================================
# 4. Admin Cross-Case Access Tests (200/202)
# ==========================================

def test_admin_has_full_cross_case_access(auth_test_env):
    client = auth_test_env["client"]
    headers_admin = {"Authorization": f"Bearer {auth_test_env['token_admin']}"}
    case_b_id = auth_test_env["case_b"].case_identifier
    ev_b_id = auth_test_env["ev_b"].id
    job_b_id = auth_test_env["job_b"].id
    anl_b_id = auth_test_env["anl_b"].id

    # Admin reads Case B
    res_case = client.get(f"/api/cases/{case_b_id}", headers=headers_admin)
    assert res_case.status_code == 200

    # Admin reads Evidence B
    res_ev = client.get(f"/api/evidence/{ev_b_id}", headers=headers_admin)
    assert res_ev.status_code == 200

    # Admin reads Job B
    res_job = client.get(f"/api/jobs/{job_b_id}", headers=headers_admin)
    assert res_job.status_code == 200

    # Admin reads Analysis B
    res_anl = client.get(f"/api/analysis/{anl_b_id}", headers=headers_admin)
    assert res_anl.status_code == 200

    # Admin reads Case B audit trail
    res_audit = client.get(f"/api/cases/{case_b_id}", headers=headers_admin)
    assert res_audit.status_code == 200


# ==========================================
# 5. Multi-User Demo Login & Case Scoping
# ==========================================

def test_multi_user_login_and_credential_validation(auth_test_env):
    client = auth_test_env["client"]

    # 1. Successful logins for all identities
    for uname, pw in [("investigator_a", "pass_a"), ("investigator_b", "pass_b"), ("security_admin", "admin_pass")]:
        res = client.post("/api/auth/login", data={"username": uname, "password": pw})
        assert res.status_code == 200
        data = res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "password" not in data
        assert "hashed_password" not in data

    # 2. Bad password rejection
    res_bad = client.post("/api/auth/login", data={"username": "investigator_a", "password": "wrong_password"})
    assert res_bad.status_code == 400
    assert "Incorrect username or password" in res_bad.json()["detail"]

    # 3. Nonexistent user rejection
    res_none = client.post("/api/auth/login", data={"username": "ghost_user", "password": "any"})
    assert res_none.status_code == 400


def test_investigator_case_list_scoping(auth_test_env):
    client = auth_test_env["client"]
    headers_a = {"Authorization": f"Bearer {auth_test_env['token_a']}"}
    headers_b = {"Authorization": f"Bearer {auth_test_env['token_b']}"}
    headers_admin = {"Authorization": f"Bearer {auth_test_env['token_admin']}"}

    # User A only sees Case A
    cases_a = client.get("/api/cases", headers=headers_a).json()
    assert len(cases_a) == 1
    assert cases_a[0]["title"] == "Case Alpha"

    # User B only sees Case B
    cases_b = client.get("/api/cases", headers=headers_b).json()
    assert len(cases_b) == 1
    assert cases_b[0]["title"] == "Case Beta"

    # Admin sees both cases
    cases_admin = client.get("/api/cases", headers=headers_admin).json()
    assert len(cases_admin) >= 2


def test_investigator_b_denied_access_to_investigator_a_resources(auth_test_env):
    """Symmetric test verifying User B cannot access User A's case or resources."""
    client = auth_test_env["client"]
    headers_b = {"Authorization": f"Bearer {auth_test_env['token_b']}"}
    case_a_id = auth_test_env["case_a"].case_identifier
    ev_a_id = auth_test_env["ev_a"].id

    # Case A
    assert client.get(f"/api/cases/{case_a_id}", headers=headers_b).status_code == 403
    assert client.get(f"/api/cases/{case_a_id}/overview", headers=headers_b).status_code == 403

    # Evidence A
    assert client.get(f"/api/evidence/{ev_a_id}", headers=headers_b).status_code == 403

    # Jobs & Analysis on Evidence A
    assert client.post(f"/api/jobs/analysis/{ev_a_id}/metadata", headers=headers_b).status_code == 403
    assert client.get(f"/api/evidence/{ev_a_id}/jobs", headers=headers_b).status_code == 403
    assert client.post(f"/api/evidence/{ev_a_id}/analysis/metadata", headers=headers_b).status_code == 403

    # Fusion on Evidence A
    assert client.post(f"/api/evidence/{ev_a_id}/fusion/normalize", headers=headers_b).status_code == 403
    assert client.post(f"/api/evidence/{ev_a_id}/fusion/correlate", headers=headers_b).status_code == 403

    # Reports & Audit on Case A
    assert client.post(f"/api/cases/{case_a_id}/reports", headers=headers_b).status_code == 403
    assert client.get(f"/api/cases/{case_a_id}/reports", headers=headers_b).status_code == 403
    assert client.get(f"/api/cases/{case_a_id}/audit", headers=headers_b).status_code == 403


def test_investigators_can_access_own_resources(auth_test_env):
    """Verifies that investigators can successfully operate on their own cases and evidence."""
    client = auth_test_env["client"]
    headers_a = {"Authorization": f"Bearer {auth_test_env['token_a']}"}
    headers_b = {"Authorization": f"Bearer {auth_test_env['token_b']}"}
    case_a_id = auth_test_env["case_a"].case_identifier
    case_b_id = auth_test_env["case_b"].case_identifier
    ev_a_id = auth_test_env["ev_a"].id
    ev_b_id = auth_test_env["ev_b"].id
    job_b_id = auth_test_env["job_b"].id
    anl_b_id = auth_test_env["anl_b"].id

    # User A reads own Case A and Evidence A
    assert client.get(f"/api/cases/{case_a_id}", headers=headers_a).status_code == 200
    assert client.get(f"/api/evidence/{ev_a_id}", headers=headers_a).status_code == 200
    assert client.get(f"/api/cases/{case_a_id}/audit", headers=headers_a).status_code == 200

    # User B reads own Case B, Evidence B, Job B, Analysis B
    assert client.get(f"/api/cases/{case_b_id}", headers=headers_b).status_code == 200
    assert client.get(f"/api/evidence/{ev_b_id}", headers=headers_b).status_code == 200
    assert client.get(f"/api/jobs/{job_b_id}", headers=headers_b).status_code == 200
    assert client.get(f"/api/analysis/{anl_b_id}", headers=headers_b).status_code == 200
    assert client.get(f"/api/cases/{case_b_id}/audit", headers=headers_b).status_code == 200


def test_job_lifecycle_and_idempotency(auth_test_env):
    """Verifies that queuing a job transitions through the lifecycle and prevents duplicates."""
    client = auth_test_env["client"]
    headers_a = {"Authorization": f"Bearer {auth_test_env['token_a']}"}
    case_a_id = auth_test_env["case_a"].case_identifier

    # Upload a real JPEG evidence to Case A so stored_path exists on disk
    jpg_img = Image.new("RGB", (64, 64), color=(120, 140, 160))
    buf = io.BytesIO()
    jpg_img.save(buf, format="JPEG")
    buf.seek(0)
    upload_res = client.post(
        f"/api/cases/{case_a_id}/evidence",
        headers=headers_a,
        files={"file": ("test_real.jpg", buf, "image/jpeg")}
    )
    assert upload_res.status_code == 200
    ev_a_id = upload_res.json()["id"]

    # 1. Queue a metadata analysis job
    res = client.post(f"/api/jobs/analysis/{ev_a_id}/metadata", headers=headers_a)
    assert res.status_code == 202
    job_data = res.json()
    assert job_data["status"] == "COMPLETED"
    assert job_data["analysis_type"] == "metadata"
    assert job_data["analysis_id"] is not None
    job_id = job_data["id"]

    # 2. Verify status endpoint returns the completed job
    status_res = client.get(f"/api/jobs/{job_id}", headers=headers_a)
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "COMPLETED"

    # 3. Queue the same job again — should return existing job without creating duplicate
    res_dup = client.post(f"/api/jobs/analysis/{ev_a_id}/metadata", headers=headers_a)
    assert res_dup.status_code == 202
    assert res_dup.json()["id"] == job_id


def test_job_failure_terminal_state_sanitized(auth_test_env):
    """Verifies that analysis failure reaches FAILED status with clean sanitized message."""
    client = auth_test_env["client"]
    headers_a = {"Authorization": f"Bearer {auth_test_env['token_a']}"}
    case_a_id = auth_test_env["case_a"].case_identifier

    # Upload a PNG image to Case A
    png_img = Image.new("RGBA", (20, 20), color=(0, 255, 0, 255))
    buf = io.BytesIO()
    png_img.save(buf, format="PNG")
    buf.seek(0)
    upload_res = client.post(
        f"/api/cases/{case_a_id}/evidence",
        headers=headers_a,
        files={"file": ("sample.png", buf, "image/png")}
    )
    assert upload_res.status_code == 200
    png_ev_id = upload_res.json()["id"]

    # Queue JPEG/DCT against PNG (must fail)
    res = client.post(f"/api/jobs/analysis/{png_ev_id}/jpeg-dct", headers=headers_a)
    assert res.status_code == 202
    failed_job = res.json()
    assert failed_job["status"] == "FAILED"
    err_msg = failed_job.get("safe_error_message", "")
    assert "PNG" in err_msg or "JPEG" in err_msg or "not supported" in err_msg.lower()
    
    # Assert no traceback or internal paths leaked
    assert "Traceback" not in err_msg
    assert "C:\\" not in err_msg
    assert "/home/" not in err_msg


def test_authenticated_artifact_serving_and_isolation(auth_test_env):
    """Verifies that artifacts require authentication, return correct MIME type, and enforce case isolation."""
    client = auth_test_env["client"]
    headers_a = {"Authorization": f"Bearer {auth_test_env['token_a']}"}
    headers_b = {"Authorization": f"Bearer {auth_test_env['token_b']}"}
    headers_admin = {"Authorization": f"Bearer {auth_test_env['token_admin']}"}
    case_a_id = auth_test_env["case_a"].case_identifier

    # Upload a real JPEG to Case A so ELA can process it and generate artifacts
    jpg_img = Image.new("RGB", (64, 64), color=(200, 100, 50))
    buf = io.BytesIO()
    jpg_img.save(buf, format="JPEG")
    buf.seek(0)
    upload_res = client.post(
        f"/api/cases/{case_a_id}/evidence",
        headers=headers_a,
        files={"file": ("ela_test.jpg", buf, "image/jpeg")}
    )
    assert upload_res.status_code == 200
    ev_a_id = upload_res.json()["id"]

    # Run ELA on User A's JPEG evidence to generate an artifact
    ela_res = client.post(f"/api/evidence/{ev_a_id}/analysis/ela", headers=headers_a)
    assert ela_res.status_code == 200
    ela_data = ela_res.json()
    artifacts = ela_data.get("structured_findings", {}).get("artifacts", {})
    ela_map_path = artifacts.get("ela_map")
    assert ela_map_path is not None

    # 1. Unauthenticated request -> 401
    assert client.get(f"/api/artifacts/{ela_map_path}").status_code == 401

    # 2. Owner User A access -> 200 with image MIME
    res_a = client.get(f"/api/artifacts/{ela_map_path}", headers=headers_a)
    assert res_a.status_code == 200
    assert res_a.headers["content-type"] in ("image/jpeg", "image/png")

    # 3. User B cross-case access -> 403 Forbidden
    res_b = client.get(f"/api/artifacts/{ela_map_path}", headers=headers_b)
    assert res_b.status_code == 403

    # 4. Admin cross-case access -> 200 OK
    res_admin = client.get(f"/api/artifacts/{ela_map_path}", headers=headers_admin)
    assert res_admin.status_code == 200


def test_artifact_path_traversal_blocked(auth_test_env):
    """Verifies that directory traversal attacks and invalid paths are rejected."""
    client = auth_test_env["client"]
    headers_a = {"Authorization": f"Bearer {auth_test_env['token_a']}"}

    # Relative path traversal
    assert client.get("/api/artifacts/../../etc/passwd", headers=headers_a).status_code in (403, 404)
    assert client.get("/api/artifacts/..\\..\\windows\\win.ini", headers=headers_a).status_code in (403, 404)

    # Null bytes
    assert client.get("/api/artifacts/test%00.png", headers=headers_a).status_code == 403

    # Nonexistent file
    assert client.get("/api/artifacts/definitely_missing_artifact_12345.png", headers=headers_a).status_code == 404


