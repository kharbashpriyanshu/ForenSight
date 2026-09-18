import os
import io
import pytest
import httpx
from app.main import app
from app.api.deps import get_current_user
from app.models.domain import User, InvestigationCase, Evidence, AnalysisJob, Analysis, Finding, AnalystNote, Report
from app.core.security import get_password_hash, create_access_token
from app.core.config import settings
from datetime import timedelta

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "forensics")

@pytest.fixture
def auth_env(db_session, client):
    """Setup distinct multi-tenant test users and cases without global auth override."""
    old_override = app.dependency_overrides.pop(get_current_user, None)

    try:
        user_a = User(username="adv_user_a", hashed_password=get_password_hash("pass_a"), role="INVESTIGATOR")
        user_b = User(username="adv_user_b", hashed_password=get_password_hash("pass_b"), role="INVESTIGATOR")
        admin_u = User(username="adv_admin", hashed_password=get_password_hash("admin_pass"), role="ADMIN")
        db_session.add_all([user_a, user_b, admin_u])
        db_session.commit()
        db_session.refresh(user_a)
        db_session.refresh(user_b)
        db_session.refresh(admin_u)

        token_a = create_access_token(user_a.username, expires_delta=timedelta(hours=1))
        token_b = create_access_token(user_b.username, expires_delta=timedelta(hours=1))
        token_admin = create_access_token(admin_u.username, expires_delta=timedelta(hours=1))

        # Case A owned by User A
        case_a = InvestigationCase(case_identifier="FS-CASE-ADV-A", title="Adversarial Case A", user_id=user_a.id)
        # Case B owned by User B
        case_b = InvestigationCase(case_identifier="FS-CASE-ADV-B", title="Adversarial Case B", user_id=user_b.id)
        db_session.add_all([case_a, case_b])
        db_session.commit()
        db_session.refresh(case_a)
        db_session.refresh(case_b)

        yield {
            "client": client,
            "token_a": token_a,
            "token_b": token_b,
            "token_admin": token_admin,
            "user_a": user_a,
            "user_b": user_b,
            "case_a": case_a,
            "case_b": case_b
        }
    finally:
        if old_override:
            app.dependency_overrides[get_current_user] = old_override


def test_phase7_corrupted_input_rejections(auth_env):
    """
    PHASE 7H: Corrupted Input Testing.
    Verifies that malformed, empty, truncated, or spoofed files are safely rejected
    with standard HTTP 400 responses without uncaught tracebacks or crashes.
    """
    client = auth_env["client"]
    token_a = auth_env["token_a"]
    case_a = auth_env["case_a"]
    headers = {"Authorization": f"Bearer {token_a}"}

    # 1. Zero-byte file
    p_zero = os.path.join(FIXTURES_DIR, "zero_byte.bin")
    with open(p_zero, "rb") as f:
        res = client.post(f"/api/cases/{case_a.id}/evidence", files={"file": ("zero.jpg", f, "image/jpeg")}, headers=headers)
    assert res.status_code == 400
    assert "empty file" in res.json()["detail"].lower()

    # 2. Truncated JPEG
    p_trunc = os.path.join(FIXTURES_DIR, "truncated.jpg")
    with open(p_trunc, "rb") as f:
        res = client.post(f"/api/cases/{case_a.id}/evidence", files={"file": ("truncated.jpg", f, "image/jpeg")}, headers=headers)
    assert res.status_code == 400
    assert "corrupted image" in res.json()["detail"].lower()

    # 3. Malformed JPEG header
    p_bad_jpg = os.path.join(FIXTURES_DIR, "malformed_header.jpg")
    with open(p_bad_jpg, "rb") as f:
        res = client.post(f"/api/cases/{case_a.id}/evidence", files={"file": ("bad.jpg", f, "image/jpeg")}, headers=headers)
    assert res.status_code == 400
    assert "corrupted image" in res.json()["detail"].lower()

    # 4. Malformed PNG header
    p_bad_png = os.path.join(FIXTURES_DIR, "malformed_header.png")
    with open(p_bad_png, "rb") as f:
        res = client.post(f"/api/cases/{case_a.id}/evidence", files={"file": ("bad.png", f, "image/png")}, headers=headers)
    assert res.status_code == 400
    assert "corrupted image" in res.json()["detail"].lower()

    # 5. Unsupported file type (.txt extension)
    p_txt = os.path.join(FIXTURES_DIR, "unsupported.txt")
    with open(p_txt, "rb") as f:
        res = client.post(f"/api/cases/{case_a.id}/evidence", files={"file": ("notes.txt", f, "text/plain")}, headers=headers)
    assert res.status_code == 400
    assert "unsupported" in res.json()["detail"].lower()

    # 6. Spoofed MIME (text file renamed to image.jpg with image/jpeg MIME)
    fake_jpg = io.BytesIO(b"This is definitely not an image file.")
    res = client.post(f"/api/cases/{case_a.id}/evidence", files={"file": ("fake.jpg", fake_jpg, "image/jpeg")}, headers=headers)
    assert res.status_code == 400
    assert "corrupted image" in res.json()["detail"].lower()


def test_phase7_resource_boundaries_and_safe_limits(auth_env):
    """
    PHASE 7I: Resource / DoS Resilience.
    Verifies that payloads exceeding maximum upload size are rejected with HTTP 413.
    """
    client = auth_env["client"]
    token_a = auth_env["token_a"]
    case_a = auth_env["case_a"]
    headers = {"Authorization": f"Bearer {token_a}"}

    huge_size = settings.MAX_UPLOAD_SIZE + 1024
    huge_file = io.BytesIO(b"X" * huge_size)
    res = client.post(
        f"/api/cases/{case_a.id}/evidence",
        files={"file": ("oversized.jpg", huge_file, "image/jpeg")},
        headers=headers
    )
    assert res.status_code == 413
    assert "too large" in res.json()["detail"].lower()


def test_phase7_adversarial_case_isolation(auth_env, db_session):
    """
    PHASE 7J: Case Isolation Adversarial Testing.
    User B attempts cross-tenant access to User A's case across ALL endpoints:
    case, evidence, jobs, analyses, graph, provenance, correlations, findings,
    notes, search, manifest, replay, reports.
    Asserts zero data leakage (consistent 403/404).
    """
    client = auth_env["client"]
    token_b = auth_env["token_b"]
    case_a = auth_env["case_a"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Seed User A resources with valid model attributes
    ev_a = Evidence(
        case_id=case_a.id,
        evidence_identifier="FS-EV-ADV-A",
        original_filename="secret_a.jpg",
        stored_path="storage/secret_a.jpg",
        sha256_hash="deadbeef1234",
        mime_type="image/jpeg",
        file_size=1024,
        image_format="JPEG",
        width=100,
        height=100
    )
    db_session.add(ev_a)
    db_session.commit()
    db_session.refresh(ev_a)

    job_a = AnalysisJob(evidence_id=ev_a.id, analysis_type="ELA", status="COMPLETED")
    finding_a = Finding(
        finding_identifier="FS-FND-ADV-A",
        case_id=case_a.case_identifier,
        evidence_id=ev_a.id,
        finding_type="TEST",
        severity_label="HIGH",
        title="Secret Finding",
        summary="Classified"
    )
    note_a = AnalystNote(
        note_identifier="FS-NOT-ADV-A",
        case_id=case_a.case_identifier,
        author="adv_user_a",
        target_type="CASE",
        target_id=case_a.case_identifier,
        content="Confidential note"
    )
    report_a = Report(
        report_identifier="FS-RPT-ADV-A",
        case_id=case_a.case_identifier,
        rule_version="1.0",
        report_type="PDF",
        status="COMPLETED"
    )
    db_session.add_all([job_a, finding_a, note_a, report_a])
    db_session.commit()
    db_session.refresh(job_a)
    db_session.refresh(finding_a)
    db_session.refresh(note_a)
    db_session.refresh(report_a)

    # 1. Access Case A
    assert client.get(f"/api/cases/{case_a.id}", headers=headers_b).status_code == 403
    assert client.get(f"/api/cases/{case_a.case_identifier}", headers=headers_b).status_code == 403
    assert client.get(f"/api/cases/{case_a.id}/overview", headers=headers_b).status_code == 403

    # 2. Access Evidence A
    assert client.get(f"/api/evidence/{ev_a.id}", headers=headers_b).status_code == 403
    assert client.post(f"/api/jobs/analysis/{ev_a.id}/ela", headers=headers_b).status_code == 403

    # 3. Access Job A
    assert client.get(f"/api/jobs/{job_a.id}", headers=headers_b).status_code == 403

    # 4. Graph & Provenance
    assert client.get(f"/api/cases/{case_a.id}/graph", headers=headers_b).status_code == 403
    assert client.get(f"/api/cases/{case_a.id}/provenance", headers=headers_b).status_code == 403

    # 5. Correlations & Findings
    assert client.get(f"/api/cases/{case_a.id}/correlations", headers=headers_b).status_code == 403
    assert client.post(f"/api/cases/{case_a.id}/correlations/run", headers=headers_b).status_code == 403
    assert client.get(f"/api/cases/{case_a.id}/findings", headers=headers_b).status_code == 403
    assert client.post(f"/api/cases/{case_a.id}/findings/{finding_a.id}/review", json={"status": "CONFIRMED_BY_ANALYST", "decision": "CONFIRMED", "review_note": "Hacked"}, headers=headers_b).status_code == 403

    # 6. Notes & Search
    assert client.get(f"/api/cases/{case_a.id}/notes", headers=headers_b).status_code == 403
    assert client.post(f"/api/cases/{case_a.id}/notes", json={"target_type": "CASE", "target_id": case_a.case_identifier, "content": "Tamper"}, headers=headers_b).status_code == 403
    assert client.get(f"/api/cases/{case_a.id}/search?q=Secret", headers=headers_b).status_code == 403

    # 7. Manifest & Replay
    assert client.get(f"/api/cases/{case_a.id}/manifest", headers=headers_b).status_code == 403
    assert client.post(f"/api/cases/{case_a.id}/replay-verify", headers=headers_b).status_code == 403

    # 8. Reports
    assert client.get(f"/api/cases/{case_a.id}/reports", headers=headers_b).status_code == 403
    assert client.get(f"/api/reports/{report_a.report_identifier}/download", headers=headers_b).status_code == 403


def test_phase7_jwt_adversarial_security(auth_env):
    """
    PHASE 7K: JWT / Auth Adversarial Testing.
    Tests missing, malformed, expired, forged, and unauthorized JWT tokens.
    """
    from jose import jwt
    client = auth_env["client"]

    # 1. Missing token
    assert client.get("/api/cases").status_code == 401

    # 2. Malformed token string
    assert client.get("/api/cases", headers={"Authorization": "Bearer not-a-valid-token"}).status_code == 401

    # 3. Expired token
    expired_token = create_access_token("adv_user_a", expires_delta=timedelta(seconds=-3600))
    assert client.get("/api/cases", headers={"Authorization": f"Bearer {expired_token}"}).status_code == 401

    # 4. Wrong secret signature forgery
    forged_token = jwt.encode({"sub": "adv_user_a"}, "WRONG_SECRET_KEY_12345", algorithm="HS256")
    assert client.get("/api/cases", headers={"Authorization": f"Bearer {forged_token}"}).status_code == 401

    # 5. Non-existent user identity
    ghost_token = create_access_token("non_existent_ghost_user")
    assert client.get("/api/cases", headers={"Authorization": f"Bearer {ghost_token}"}).status_code == 401

    # 6. Investigator attempting Admin-only endpoint
    inv_token = create_access_token("adv_user_a")
    assert client.get("/api/search?q=test", headers={"Authorization": f"Bearer {inv_token}"}).status_code == 403


def test_phase7_artifact_security_fuzzing(auth_env):
    """
    PHASE 7L: Artifact Security Fuzzing.
    Fuzzes the artifact download endpoint against path traversal attacks:
    ../, encoded %2e%2e, absolute paths, Windows paths, null bytes.
    Verifies that requests outside storage root are blocked with HTTP 403.
    """
    client = auth_env["client"]
    token_a = auth_env["token_a"]
    headers = {"Authorization": f"Bearer {token_a}"}

    fuzz_payloads = [
        "../app/core/config.py",
        "../../forensight.db",
        "../../../etc/passwd",
        "..%2f..%2fconfig.py",
        "%2e%2e%2fetc%2fpasswd",
        "C:\\Windows\\System32\\cmd.exe",
        "\\\\127.0.0.1\\c$\\windows",
        "/etc/shadow",
        "nested/../../../../secret.key"
    ]

    for payload in fuzz_payloads:
        res = client.get(f"/api/artifacts/{payload}", headers=headers)
        assert res.status_code in (403, 404), f"Traversal attack not blocked for payload: {payload}"

    # Null byte test: httpx rejects raw control characters in URLs with InvalidURL
    with pytest.raises(httpx.InvalidURL):
        client.get("/api/artifacts/artifact.png\x00.jpg", headers=headers)
