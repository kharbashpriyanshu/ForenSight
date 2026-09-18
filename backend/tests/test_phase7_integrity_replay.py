import os
import json
import pytest
from app.models.domain import User, InvestigationCase, Evidence, AnalysisJob, Analysis, Finding, AnalystNote, AuditEvent, Report
from app.core.security import get_password_hash, create_access_token

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "forensics")

@pytest.fixture
def replay_env(db_session, client):
    from app.main import app
    from app.api.deps import get_current_user
    old_override = app.dependency_overrides.pop(get_current_user, None)
    try:
        user = User(username="replay_investigator", hashed_password=get_password_hash("pass"), role="INVESTIGATOR")
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        token = create_access_token(user.username)
        case = InvestigationCase(case_identifier="FS-CASE-REPLAY", title="Replay Case", user_id=user.id)
        db_session.add(case)
        db_session.commit()
        db_session.refresh(case)

        yield {
            "client": client,
            "token": token,
            "user": user,
            "case": case
        }
    finally:
        if old_override:
            app.dependency_overrides[get_current_user] = old_override


def test_phase7_investigation_replay_and_integrity_verification(replay_env, db_session):
    """
    PHASE 7N: Complete Investigation Replay & Verification.
    Verifies that ReplayService successfully validates evidence hashes, analysis records,
    and reports, producing a clean VERIFIED status and an immutable audit log.
    """
    client = replay_env["client"]
    token = replay_env["token"]
    case = replay_env["case"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Upload valid reference fixture
    p_clean = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
    with open(p_clean, "rb") as f:
        res_e = client.post(f"/api/cases/{case.id}/evidence", files={"file": ("clean.jpg", f, "image/jpeg")}, headers=headers)
    assert res_e.status_code == 200
    ev_id = res_e.json()["id"]

    # 2. Run analysis
    res_j = client.post(f"/api/jobs/analysis/{ev_id}/metadata", headers=headers)
    assert res_j.status_code == 202

    # 3. Generate correlations and report
    client.post(f"/api/cases/{case.id}/correlations/run", headers=headers)
    res_r = client.post(f"/api/cases/{case.id}/reports?format=json", headers=headers)
    assert res_r.status_code == 200

    # 4. Trigger Replay Verification
    res_replay = client.post(f"/api/cases/{case.id}/replay-verify", headers=headers)
    assert res_replay.status_code == 200
    rep_data = res_replay.json()

    assert rep_data["overall_status"] == "VERIFIED"
    assert rep_data["all_hashes_matched"] is True
    assert len(rep_data["evidence_integrity"]) == 1
    assert rep_data["evidence_integrity"][0]["hash_matched"] is True

    # 5. Check Audit Record
    audit_evt = (
        db_session.query(AuditEvent)
        .filter(AuditEvent.case_id == case.case_identifier, AuditEvent.event_type == "CASE_REPLAY_VERIFIED")
        .first()
    )
    assert audit_evt is not None
    assert audit_evt.actor == "replay_investigator"


def test_phase7_tampered_evidence_detection_in_replay(replay_env, db_session):
    """
    PHASE 7M / 7N: Tampered Evidence Detection.
    Verifies that altering a single byte in stored evidence on disk triggers
    an INTEGRITY_VIOLATION during replay verification.
    """
    client = replay_env["client"]
    token = replay_env["token"]
    case = replay_env["case"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upload evidence
    p_clean = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
    with open(p_clean, "rb") as f:
        res_e = client.post(f"/api/cases/{case.id}/evidence", files={"file": ("clean2.jpg", f, "image/jpeg")}, headers=headers)
    assert res_e.status_code == 200
    ev_id = res_e.json()["id"]

    # Locate evidence on disk and mutate its bytes
    ev_db = db_session.query(Evidence).filter(Evidence.id == ev_id).first()
    assert os.path.exists(ev_db.stored_path)

    with open(ev_db.stored_path, "r+b") as f:
        f.seek(10)
        orig_byte = f.read(1)
        f.seek(10)
        # Flip bit
        tampered_byte = bytes([(orig_byte[0] ^ 0xFF)])
        f.write(tampered_byte)

    # Replay verify must detect the corruption
    res_replay = client.post(f"/api/cases/{case.id}/replay-verify", headers=headers)
    assert res_replay.status_code == 200
    rep_data = res_replay.json()

    assert rep_data["overall_status"] == "INTEGRITY_VIOLATION"
    assert rep_data["all_hashes_matched"] is False
    assert rep_data["evidence_integrity"][0]["hash_matched"] is False
    assert rep_data["evidence_integrity"][0]["expected_hash"] != rep_data["evidence_integrity"][0]["actual_hash"]


def test_phase7_forensic_validation_manifest_structure(replay_env):
    """
    PHASE 7O: Forensic Validation Manifest.
    Verifies that the machine-readable manifest returns deterministic structure
    containing case, evidence, analyses, correlations, findings, and reports.
    """
    client = replay_env["client"]
    token = replay_env["token"]
    case = replay_env["case"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upload clean reference
    p_clean = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
    with open(p_clean, "rb") as f:
        res_e = client.post(f"/api/cases/{case.id}/evidence", files={"file": ("manifest_test.jpg", f, "image/jpeg")}, headers=headers)
    ev_id = res_e.json()["id"]

    client.post(f"/api/jobs/analysis/{ev_id}/metadata", headers=headers)
    client.post(f"/api/cases/{case.id}/correlations/run", headers=headers)
    client.post(f"/api/cases/{case.id}/reports?format=json", headers=headers)

    res_m = client.get(f"/api/cases/{case.id}/manifest", headers=headers)
    assert res_m.status_code == 200
    m_data = res_m.json()

    assert m_data["case_id"] == case.case_identifier
    assert "evidence" in m_data and len(m_data["evidence"]) >= 1
    assert "analyses" in m_data and len(m_data["analyses"]) >= 1
    assert "correlations" in m_data
    assert "findings" in m_data
    assert "reports" in m_data and len(m_data["reports"]) >= 1

    ev_item = m_data["evidence"][0]
    assert "evidence_id" in ev_item
    assert "sha256" in ev_item
    assert "mime_type" in ev_item
    assert "size" in ev_item


def test_phase7_database_consistency_no_orphans(db_session):
    """
    PHASE 7S: Database Consistency & Integrity.
    Verifies foreign key integrity, ensuring zero orphaned jobs, analyses,
    findings, or notes in the relational database.
    """
    from app.models.domain import Evidence, AnalysisJob, Analysis, Finding, AnalystNote, InvestigationCase

    # 1. Check jobs without valid evidence
    valid_ev_ids = [e.id for e in db_session.query(Evidence.id).all()]
    orphaned_jobs = db_session.query(AnalysisJob).filter(~AnalysisJob.evidence_id.in_(valid_ev_ids)).count()
    assert orphaned_jobs == 0, f"Found {orphaned_jobs} orphaned analysis jobs!"

    # 2. Check analyses without valid evidence
    orphaned_analyses = db_session.query(Analysis).filter(~Analysis.evidence_id.in_(valid_ev_ids)).count()
    assert orphaned_analyses == 0, f"Found {orphaned_analyses} orphaned analyses!"

    # 3. Check findings without valid case
    valid_case_identifiers = [c.case_identifier for c in db_session.query(InvestigationCase.case_identifier).all()]
    valid_case_ids_str = [str(c.id) for c in db_session.query(InvestigationCase.id).all()]
    all_case_refs = set(valid_case_identifiers + valid_case_ids_str)
    
    findings = db_session.query(Finding).all()
    orphaned_findings = sum(1 for f in findings if f.case_id not in all_case_refs)
    assert orphaned_findings == 0, f"Found {orphaned_findings} orphaned findings!"

    # 4. Check notes without valid case
    notes = db_session.query(AnalystNote).all()
    orphaned_notes = sum(1 for n in notes if n.case_id not in all_case_refs)
    assert orphaned_notes == 0, f"Found {orphaned_notes} orphaned notes!"
