import io
import os
import pytest
from datetime import timedelta
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.api.deps import get_current_user
from app.models.domain import (
    User,
    InvestigationCase,
    Evidence,
    Analysis,
    AnalysisJob,
    EvidenceObservation,
    Finding,
    AnalystNote,
    Report,
)
from app.core.security import create_access_token, get_password_hash

def _create_test_image_bytes(color=(200, 100, 50), size=(100, 100), fmt="JPEG"):
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=color)
    img.save(buf, format=fmt)
    buf.seek(0)
    return buf.read()

@pytest.fixture
def phase6_env(db_session):
    old_override = app.dependency_overrides.pop(get_current_user, None)

    user_a = User(username="inv_a_p6", hashed_password=get_password_hash("pass_a"), role="INVESTIGATOR")
    user_b = User(username="inv_b_p6", hashed_password=get_password_hash("pass_b"), role="INVESTIGATOR")
    admin = User(username="admin_p6", hashed_password=get_password_hash("admin_pass"), role="ADMIN")

    db_session.add_all([user_a, user_b, admin])
    db_session.commit()
    db_session.refresh(user_a)
    db_session.refresh(user_b)
    db_session.refresh(admin)

    token_a = create_access_token(user_a.username, expires_delta=timedelta(hours=1))
    token_b = create_access_token(user_b.username, expires_delta=timedelta(hours=1))
    token_admin = create_access_token(admin.username, expires_delta=timedelta(hours=1))

    # Case A owned by User A
    case_a = InvestigationCase(title="Operation Phase 6 Alpha", user_id=user_a.id)
    # Case B owned by User B
    case_b = InvestigationCase(title="Operation Phase 6 Beta", user_id=user_b.id)
    db_session.add_all([case_a, case_b])
    db_session.commit()
    db_session.refresh(case_a)
    db_session.refresh(case_b)

    # Ingest two evidence items into Case A (one JPEG with editing software metadata, one PNG for conflict test)
    img_bytes_jpg = _create_test_image_bytes(color=(255, 0, 0), size=(120, 80), fmt="JPEG")
    img_bytes_png = _create_test_image_bytes(color=(0, 255, 0), size=(200, 150), fmt="PNG")

    os.makedirs("storage/evidence", exist_ok=True)
    ev_path_1 = f"storage/evidence/ev_p6_1_{case_a.id}.jpg"
    ev_path_2 = f"storage/evidence/ev_p6_2_{case_a.id}.png"
    with open(ev_path_1, "wb") as f:
        f.write(img_bytes_jpg)
    with open(ev_path_2, "wb") as f:
        f.write(img_bytes_png)

    ev_1 = Evidence(
        case_id=case_a.id,
        original_filename="tampered_passport.jpg",
        stored_path=ev_path_1,
        sha256_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        file_size=len(img_bytes_jpg),
        mime_type="image/jpeg",
        image_format="JPEG",
        width=120,
        height=80,
    )
    ev_2 = Evidence(
        case_id=case_a.id,
        original_filename="lossless_graphic.png",
        stored_path=ev_path_2,
        sha256_hash="11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
        file_size=len(img_bytes_png),
        mime_type="image/png",
        image_format="PNG",
        width=200,
        height=150,
    )
    db_session.add_all([ev_1, ev_2])
    db_session.commit()
    db_session.refresh(ev_1)
    db_session.refresh(ev_2)

    # Analyses and observations for ev_1
    meta_anl = Analysis(
        evidence_id=ev_1.id,
        analysis_type="metadata",
        status="completed",
        summary="Metadata processed. Photoshop tags detected.",
        structured_findings={"exif": {"Software": "Adobe Photoshop 2024"}}
    )
    ela_anl = Analysis(
        evidence_id=ev_1.id,
        analysis_type="ela",
        status="completed",
        summary="ELA completed. Non-uniform block artifacts.",
        structured_findings={"mean_difference": 12.5, "elevated_regions": True, "artifacts": {"ela_map": "mock_ela.png"}}
    )
    noise_anl = Analysis(
        evidence_id=ev_1.id,
        analysis_type="noise",
        status="completed",
        summary="Noise residual mapped.",
        structured_findings={"artifacts": {"residual_map": "mock_noise.png"}}
    )
    clone_anl = Analysis(
        evidence_id=ev_1.id,
        analysis_type="copy-move",
        status="completed",
        summary="Copy-move keypoint clustering detected.",
        structured_findings={"match_count": 18, "matches": [{"pt1": [10, 10], "pt2": [50, 50]}]}
    )
    db_session.add_all([meta_anl, ela_anl, noise_anl, clone_anl])
    db_session.commit()
    db_session.refresh(meta_anl)
    db_session.refresh(ela_anl)
    db_session.refresh(noise_anl)
    db_session.refresh(clone_anl)

    obs_meta = EvidenceObservation(
        evidence_id=ev_1.id,
        analysis_id=meta_anl.id,
        modality="metadata",
        observation_type="SOFTWARE_HISTORY",
        metric_name="Software",
        raw_value="Adobe Photoshop 2024",
        technical_reliability="HIGH",
        interpretation="Editing software traces recorded in container."
    )
    obs_ela = EvidenceObservation(
        evidence_id=ev_1.id,
        analysis_id=ela_anl.id,
        modality="ela",
        observation_type="COMPRESSION_ERROR",
        metric_name="mean_difference",
        raw_value="12.5",
        technical_reliability="MODERATE",
        interpretation="Localized compression discrepancy."
    )
    db_session.add_all([obs_meta, obs_ela])
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

def test_phase6_correlation_engine_rules(phase6_env):
    """
    Verifies deterministic correlation rules CORR-META-001, CORR-COMP-002, CORR-NOISE-003, CORR-CLONE-004.
    """
    client = phase6_env["client"]
    token_a = phase6_env["token_a"]
    case_a = phase6_env["case_a"]
    headers = {"Authorization": f"Bearer {token_a}"}

    # 1. Trigger correlation evaluation
    res = client.post(f"/api/cases/{case_a.id}/correlations/run", headers=headers)
    assert res.status_code == 200
    findings = res.json()
    assert len(findings) >= 4

    rule_ids = [f["correlation_rule_id"] for f in findings]
    assert "CORR-META-001" in rule_ids
    assert "CORR-COMP-002" in rule_ids
    assert "CORR-NOISE-003" in rule_ids
    assert "CORR-CLONE-004" in rule_ids

    # Verify no fake manipulation percentages exist
    for f in findings:
        text = (f["title"] + " " + f["summary"] + " " + (f["interpretation"] or "")).lower()
        assert "% manipulated" not in text
        assert "confidence: 9" not in text

def test_phase6_conflict_detection_and_negative_evidence(phase6_env):
    """
    Verifies CORR-CONFLICT-005: PNG source generates conflict notice distinguishing negative evidence from absence of evidence.
    """
    client = phase6_env["client"]
    token_a = phase6_env["token_a"]
    case_a = phase6_env["case_a"]
    headers = {"Authorization": f"Bearer {token_a}"}

    # Run correlations
    client.post(f"/api/cases/{case_a.id}/correlations/run", headers=headers)

    # Fetch findings filtered by CONFLICT_DETECTED
    res = client.get(f"/api/cases/{case_a.id}/findings", headers=headers)
    assert res.status_code == 200
    findings = res.json()

    conflict_findings = [f for f in findings if f["finding_type"] == "CONFLICT_DETECTED"]
    assert len(conflict_findings) >= 1
    
    png_conflict = [f for f in conflict_findings if "PNG" in f["title"]][0]
    assert png_conflict["correlation_rule_id"] == "CORR-CONFLICT-005"
    assert "NEGATIVE EVIDENCE" in png_conflict["interpretation"]
    assert "NOT be interpreted as NO EVIDENCE" in png_conflict["interpretation"]

def test_phase6_observation_graph_and_provenance(phase6_env):
    """
    Verifies GET /cases/{case_id}/graph and GET /cases/{case_id}/provenance backed by real DB entities.
    """
    client = phase6_env["client"]
    token_a = phase6_env["token_a"]
    case_a = phase6_env["case_a"]
    headers = {"Authorization": f"Bearer {token_a}"}

    # First ensure correlations are populated
    client.post(f"/api/cases/{case_a.id}/correlations/run", headers=headers)

    # 1. Observation Graph
    res_g = client.get(f"/api/cases/{case_a.id}/graph", headers=headers)
    assert res_g.status_code == 200
    g_data = res_g.json()
    assert g_data["case_id"] == case_a.case_identifier
    node_types = {n["type"] for n in g_data["nodes"]}
    assert "CASE" in node_types
    assert "EVIDENCE" in node_types
    assert "ANALYSIS" in node_types
    assert "FINDING" in node_types

    edge_types = {e["type"] for e in g_data["edges"]}
    assert "CONTAINS" in edge_types
    assert "PRODUCED" in edge_types
    assert "SUPPORTS" in edge_types

    # 2. Provenance Tree
    res_p = client.get(f"/api/cases/{case_a.id}/provenance", headers=headers)
    assert res_p.status_code == 200
    p_data = res_p.json()
    assert p_data["case_id"] == case_a.case_identifier
    assert len(p_data["root_evidence"]) == 2
    ev1_node = p_data["root_evidence"][0]
    assert ev1_node["type"] == "EVIDENCE"
    assert any(c["type"] == "HASH_SIGNATURE" for c in ev1_node["children"])
    assert any(c["type"] == "ANALYSIS" for c in ev1_node["children"])

def test_phase6_finding_lifecycle_and_analyst_review(phase6_env):
    """
    Verifies finding lifecycle transitions and analyst review recording.
    """
    client = phase6_env["client"]
    token_a = phase6_env["token_a"]
    case_a = phase6_env["case_a"]
    headers = {"Authorization": f"Bearer {token_a}"}

    client.post(f"/api/cases/{case_a.id}/correlations/run", headers=headers)
    res_list = client.get(f"/api/cases/{case_a.id}/findings", headers=headers)
    finding = res_list.json()[0]
    fnd_id = finding["finding_identifier"]

    # 1. Review finding: Confirm review
    review_payload = {
        "status": "CONFIRMED_BY_ANALYST",
        "review_note": "Analyst reviewed compression variance. Consistent with external editing tool.",
        "decision": "CONFIRMED_BY_ANALYST"
    }
    res_rev = client.post(
        f"/api/cases/{case_a.id}/findings/{fnd_id}/review",
        json=review_payload,
        headers=headers
    )
    assert res_rev.status_code == 200
    updated = res_rev.json()
    assert updated["status"] == "CONFIRMED_BY_ANALYST"
    assert updated["reviewer"] == "inv_a_p6"
    assert "Analyst reviewed compression variance" in updated["review_note"]

    # 2. Invalid state transition rejected
    res_invalid = client.post(
        f"/api/cases/{case_a.id}/findings/{fnd_id}/review",
        json={"status": "INVALID_STATE_XYZ"},
        headers=headers
    )
    assert res_invalid.status_code == 400

def test_phase6_analyst_notes_and_auditing(phase6_env):
    """
    Verifies creating and listing case-scoped analyst notes.
    """
    client = phase6_env["client"]
    token_a = phase6_env["token_a"]
    case_a = phase6_env["case_a"]
    ev_1 = phase6_env["ev_1"]
    headers = {"Authorization": f"Bearer {token_a}"}

    # 1. Create note on evidence
    note_payload = {
        "target_type": "EVIDENCE",
        "target_id": str(ev_1.id),
        "content": "Suspect claim indicates document was scanned directly from flatbed scanner."
    }
    res_note = client.post(f"/api/cases/{case_a.id}/notes", json=note_payload, headers=headers)
    assert res_note.status_code == 200
    note_data = res_note.json()
    assert note_data["author"] == "inv_a_p6"
    assert note_data["target_type"] == "EVIDENCE"
    assert "flatbed scanner" in note_data["content"]

    # 2. List notes
    res_list = client.get(f"/api/cases/{case_a.id}/notes", headers=headers)
    assert res_list.status_code == 200
    notes = res_list.json()
    assert len(notes) >= 1
    assert notes[0]["target_id"] == str(ev_1.id)

def test_phase6_investigation_search_and_rbac(phase6_env):
    """
    Verifies investigation search across entities and strict case isolation.
    """
    client = phase6_env["client"]
    token_a = phase6_env["token_a"]
    token_b = phase6_env["token_b"]
    token_admin = phase6_env["token_admin"]
    case_a = phase6_env["case_a"]

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    headers_admin = {"Authorization": f"Bearer {token_admin}"}

    # Create note to search for
    client.post(
        f"/api/cases/{case_a.id}/notes",
        json={"target_type": "CASE", "target_id": case_a.case_identifier, "content": "Critical suspect interview noted."},
        headers=headers_a
    )

    # 1. Search by filename in Case A
    res_search_fn = client.get(f"/api/cases/{case_a.id}/search?q=tampered", headers=headers_a)
    assert res_search_fn.status_code == 200
    hits = res_search_fn.json()["hits"]
    assert len(hits) >= 1
    assert any(h["entity_type"] == "EVIDENCE" for h in hits)

    # 2. Search by note content in Case A
    res_search_note = client.get(f"/api/cases/{case_a.id}/search?q=interview", headers=headers_a)
    assert res_search_note.status_code == 200
    note_hits = res_search_note.json()["hits"]
    assert len(note_hits) >= 1
    assert note_hits[0]["entity_type"] == "NOTE"

    # 3. User B cannot search Case A (Forbidden 403)
    res_forbidden = client.get(f"/api/cases/{case_a.id}/search?q=tampered", headers=headers_b)
    assert res_forbidden.status_code == 403

    # 4. Admin global search
    res_global = client.get("/api/search?q=tampered", headers=headers_admin)
    assert res_global.status_code == 200
    assert len(res_global.json()["hits"]) >= 1

    # 5. Non-admin Investigator cannot use global search
    res_global_forbidden = client.get("/api/search?q=tampered", headers=headers_b)
    assert res_global_forbidden.status_code == 403

def test_phase6_report_integration_includes_correlations_and_notes(phase6_env):
    """
    Verifies that PDF and JSON reports embed correlated findings and analyst notes.
    """
    client = phase6_env["client"]
    token_a = phase6_env["token_a"]
    case_a = phase6_env["case_a"]
    headers = {"Authorization": f"Bearer {token_a}"}

    # Run correlations and post note
    client.post(f"/api/cases/{case_a.id}/correlations/run", headers=headers)
    client.post(
        f"/api/cases/{case_a.id}/notes",
        json={"target_type": "CASE", "target_id": case_a.case_identifier, "content": "Forensic defense audit note."},
        headers=headers
    )

    # Generate PDF Report
    res_rpt = client.post(f"/api/cases/{case_a.id}/reports?format=pdf", headers=headers)
    assert res_rpt.status_code == 200
    rpt_info = res_rpt.json()
    rpt_id = rpt_info["report_identifier"]

    # Download JSON export to verify payload structure
    res_json = client.get(f"/api/reports/{rpt_id}/download?format=json", headers=headers)
    assert res_json.status_code == 200
    data = res_json.json()
    assert "correlated_findings" in data
    assert len(data["correlated_findings"]) >= 1
    assert "analyst_notes" in data
    assert len(data["analyst_notes"]) >= 1

    # Download PDF artifact and verify magic bytes
    res_pdf = client.get(f"/api/reports/{rpt_id}/download?format=pdf", headers=headers)
    assert res_pdf.status_code == 200
    assert res_pdf.content.startswith(b"%PDF-")
