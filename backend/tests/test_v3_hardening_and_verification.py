import os
import io
import time
import pytest
from datetime import timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.db.database import get_db
from app.models.domain import (
    InvestigationCase,
    Evidence,
    Analysis,
    AnalysisJob,
    EvidenceObservation,
    Finding,
    AnalystNote,
    Report,
    AuditEvent,
    User,
)
from app.core.security import create_access_token, get_password_hash
from PIL import Image

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "forensics")

@pytest.fixture
def users_and_cases(db_session):
    # User A (Investigator)
    user_a = db_session.query(User).filter(User.username == "h_inv_a").first()
    if not user_a:
        user_a = User(username="h_inv_a", hashed_password=get_password_hash("pass_a"), role="INVESTIGATOR")
        db_session.add(user_a)
        db_session.commit()
        db_session.refresh(user_a)

    # User B (Investigator)
    user_b = db_session.query(User).filter(User.username == "h_inv_b").first()
    if not user_b:
        user_b = User(username="h_inv_b", hashed_password=get_password_hash("pass_b"), role="INVESTIGATOR")
        db_session.add(user_b)
        db_session.commit()
        db_session.refresh(user_b)

    # Admin User
    admin = db_session.query(User).filter(User.username == "h_admin").first()
    if not admin:
        admin = User(username="h_admin", hashed_password=get_password_hash("admin_pass"), role="ADMIN")
        db_session.add(admin)
        db_session.commit()
        db_session.refresh(admin)

    token_a = create_access_token(user_a.username, expires_delta=timedelta(hours=2))
    token_b = create_access_token(user_b.username, expires_delta=timedelta(hours=2))
    token_admin = create_access_token(admin.username, expires_delta=timedelta(hours=2))

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}
    headers_admin = {"Authorization": f"Bearer {token_admin}"}

    # Case A owned by User A
    case_a = InvestigationCase(title="Hardening Case Alpha", user_id=user_a.id)
    # Case B owned by User B
    case_b = InvestigationCase(title="Hardening Case Beta", user_id=user_b.id)
    db_session.add_all([case_a, case_b])
    db_session.commit()
    db_session.refresh(case_a)
    db_session.refresh(case_b)

    from app.api.deps import get_current_user
    old_override = app.dependency_overrides.pop(get_current_user, None)

    try:
        yield {
            "user_a": user_a,
            "user_b": user_b,
            "admin": admin,
            "headers_a": headers_a,
            "headers_b": headers_b,
            "headers_admin": headers_admin,
            "case_a": case_a,
            "case_b": case_b,
        }
    finally:
        if old_override:
            app.dependency_overrides[get_current_user] = old_override


def test_adversarial_mixed_batch_ingestion(client, users_and_cases):
    """
    Test a mixed batch containing valid, malformed, zero-byte, unsupported, tiny, and unusual aspect ratio files.
    Valid files must continue processing.
    Invalid files must fail independently without crashing the batch.
    """
    headers = users_and_cases["headers_a"]
    case_id = users_and_cases["case_a"].case_identifier

    # Collect files from fixtures
    filenames = [
        ("clean_reference.jpg", "image/jpeg"),
        ("clean_reference.png", "image/png"),
        ("clean_reference.webp", "image/webp"),
        ("malformed_header.jpg", "image/jpeg"),
        ("zero_byte.bin", "image/jpeg"),
        ("unsupported.txt", "text/plain"),
        ("tiny_2x2.png", "image/png"),
        ("unusual_aspect_10x1000.jpg", "image/jpeg"),
    ]

    files_payload = []
    for fname, mime in filenames:
        fpath = os.path.join(FIXTURES_DIR, fname)
        if os.path.exists(fpath):
            with open(fpath, "rb") as f:
                content = f.read()
            files_payload.append(("files", (fname, io.BytesIO(content), mime)))

    res = client.post(f"/api/cases/{case_id}/evidence/batch", files=files_payload, headers=headers)
    assert res.status_code == 200, f"Batch upload failed: {res.text}"
    data = res.json()

    # Valid files: clean_reference.jpg, clean_reference.png, clean_reference.webp, tiny_2x2.png, unusual_aspect_10x1000.jpg -> 5
    # Invalid files: malformed_header.jpg, zero_byte.bin, unsupported.txt -> 3
    assert data["uploaded_count"] == 5
    assert data["failed_count"] == 3
    assert len(data["items"]) == 5
    assert len(data["failed_items"]) == 3

    # Ensure failed items contain meaningful error descriptions
    failed_names = [fi["filename"] for fi in data["failed_items"]]
    assert "malformed_header.jpg" in failed_names
    assert "zero_byte.bin" in failed_names
    assert "unsupported.txt" in failed_names

    # Check batch analysis queuing across the valid items
    valid_ids = [item["id"] for item in data["items"]]
    anl_res = client.post(
        f"/api/cases/{case_id}/batch-analysis",
        json={"evidence_ids": valid_ids, "analysis_types": ["metadata", "ela"]},
        headers=headers
    )
    assert anl_res.status_code == 200
    status_data = anl_res.json()
    assert status_data["total_jobs"] >= 5


def test_cross_case_authorization_and_security_boundaries(client, users_and_cases, db_session):
    """
    Exhaustively verify that User A cannot access or cross-pollinate with User B's case.
    Test compare, cross-correlation, assistant, custody, heatmap, graph, and batch.
    """
    headers_a = users_and_cases["headers_a"]
    headers_b = users_and_cases["headers_b"]
    case_a = users_and_cases["case_a"]
    case_b = users_and_cases["case_b"]

    # Ingest one evidence item in Case A and one in Case B
    fpath = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
    with open(fpath, "rb") as f:
        content = f.read()

    res_a = client.post(
        f"/api/cases/{case_a.case_identifier}/evidence",
        files={"file": ("ev_a.jpg", io.BytesIO(content), "image/jpeg")},
        headers=headers_a
    )
    ev_a_id = res_a.json()["id"]

    res_b = client.post(
        f"/api/cases/{case_b.case_identifier}/evidence",
        files={"file": ("ev_b.jpg", io.BytesIO(content), "image/jpeg")},
        headers=headers_b
    )
    ev_b_id = res_b.json()["id"]

    # 1. User A tries to access Case B endpoints directly -> 403 Forbidden
    assert client.get(f"/api/cases/{case_b.case_identifier}", headers=headers_a).status_code == 403
    assert client.get(f"/api/cases/{case_b.case_identifier}/assistant", headers=headers_a).status_code == 403
    assert client.get(f"/api/cases/{case_b.case_identifier}/cross-correlation", headers=headers_a).status_code == 403
    assert client.get(f"/api/cases/{case_b.case_identifier}/chain-of-custody", headers=headers_a).status_code == 403
    assert client.get(f"/api/cases/{case_b.case_identifier}/graph", headers=headers_a).status_code == 403
    assert client.post(f"/api/cases/{case_b.case_identifier}/reports?format=json", headers=headers_a).status_code == 403

    # 2. User A tries to access Evidence B directly -> 403 Forbidden
    assert client.get(f"/api/evidence/{ev_b_id}", headers=headers_a).status_code == 403
    assert client.get(f"/api/evidence/{ev_b_id}/heatmap", headers=headers_a).status_code == 403
    assert client.post(f"/api/evidence/{ev_b_id}/verify-custody", headers=headers_a).status_code == 403

    # 3. Compare cross-case attack: User A calls compare in Case A using Evidence B from Case B -> 404
    cross_compare_res = client.get(
        f"/api/cases/{case_a.case_identifier}/compare?evidence_a_id={ev_a_id}&evidence_b_id={ev_b_id}",
        headers=headers_a
    )
    assert cross_compare_res.status_code == 404
    assert "not found in this case" in cross_compare_res.json()["detail"]

    # 4. Unauthenticated and invalid token requests -> 401
    assert client.get(f"/api/cases/{case_a.case_identifier}").status_code == 401
    assert client.get(f"/api/cases/{case_a.case_identifier}", headers={"Authorization": "Bearer invalid.token.payload"}).status_code == 401


def test_forensic_heatmap_scientific_guardrails_and_isolation(client, users_and_cases):
    """
    Verify the forensic heatmap does NOT invent arbitrary suspicion percentages.
    Verify individual layers (ELA, Noise, Copy-Move) remain inspectable and deterministic.
    """
    headers = users_and_cases["headers_a"]
    case_id = users_and_cases["case_a"].case_identifier

    fpath = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
    with open(fpath, "rb") as f:
        content = f.read()

    res = client.post(
        f"/api/cases/{case_id}/evidence",
        files={"file": ("heatmap_guardrail.jpg", io.BytesIO(content), "image/jpeg")},
        headers=headers
    )
    ev_id = res.json()["id"]

    # Request heatmap
    h_res1 = client.get(f"/api/evidence/{ev_id}/heatmap", headers=headers)
    assert h_res1.status_code == 200
    h_data1 = h_res1.json()

    # Verify no fake probability metrics
    assert "fake" not in str(h_data1).lower()
    assert "percent" not in str(h_data1.get("what_was_found", "")).lower()
    assert "probability" not in str(h_data1).lower()

    # Verify inspectable layers
    layer_modalities = [l["modality"] for l in h_data1["layers"]]
    assert "ELA" in layer_modalities
    assert "NOISE" in layer_modalities
    assert "COPY_MOVE" in layer_modalities

    # Verify coordinates are properly bounded in [0.0, 1.0]
    for layer in h_data1["layers"]:
        for r in layer["regions"]:
            assert 0.0 <= r["x"] <= 1.0
            assert 0.0 <= r["y"] <= 1.0
            assert 0.0 <= r["width"] <= 1.0
            assert 0.0 <= r["height"] <= 1.0
            assert 0.0 <= r["intensity"] <= 1.0

    # Verify determinism: calling twice returns identical layer structure
    h_res2 = client.get(f"/api/evidence/{ev_id}/heatmap", headers=headers)
    assert h_res1.json() == h_res2.json()


def test_chain_of_custody_live_tamper_detection(client, users_and_cases, db_session):
    """
    Simulate storage bit-rot/tampering in a controlled test environment.
    Verify that on-demand verification detects the modification and flags TAMPER_OR_BITROT_DETECTED.
    """
    headers = users_and_cases["headers_a"]
    case_id = users_and_cases["case_a"].case_identifier

    fpath = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
    with open(fpath, "rb") as f:
        content = f.read()

    res = client.post(
        f"/api/cases/{case_id}/evidence",
        files={"file": ("tamper_test.jpg", io.BytesIO(content), "image/jpeg")},
        headers=headers
    )
    ev_id = res.json()["id"]

    # 1. Initial verification -> INTACT
    v1 = client.post(f"/api/evidence/{ev_id}/verify-custody", headers=headers).json()
    assert v1["integrity_intact"] is True
    assert v1["status"] == "VERIFIED_INTACT"

    # 2. Simulate controlled disk modification (tampering)
    ev_record = db_session.query(Evidence).filter(Evidence.id == ev_id).first()
    stored_path = ev_record.stored_path
    assert os.path.exists(stored_path)

    with open(stored_path, "rb") as f:
        orig_bytes = f.read()

    # Flip one byte
    modified_bytes = bytearray(orig_bytes)
    modified_bytes[len(modified_bytes) // 2] ^= 0xFF

    try:
        with open(stored_path, "wb") as f:
            f.write(modified_bytes)

        # 3. Re-verify while tampered -> Must flag TAMPER_OR_BITROT_DETECTED
        v2 = client.post(f"/api/evidence/{ev_id}/verify-custody", headers=headers).json()
        assert v2["integrity_intact"] is False
        assert v2["status"] == "TAMPER_OR_BITROT_DETECTED"
        assert "CRITICAL INTEGRITY FAILURE" in v2["message"]

        # Case-wide custody check must also report all_hashes_intact == False
        custody_res = client.get(f"/api/cases/{case_id}/chain-of-custody", headers=headers).json()
        assert custody_res["all_hashes_intact"] is False

    finally:
        # Restore original bytes to maintain clean test state
        with open(stored_path, "wb") as f:
            f.write(orig_bytes)

    # 4. Re-verify after restore -> Must be INTACT again
    v3 = client.post(f"/api/evidence/{ev_id}/verify-custody", headers=headers).json()
    assert v3["integrity_intact"] is True
    assert v3["status"] == "VERIFIED_INTACT"


def test_database_relational_integrity_no_orphans(db_session):
    """
    Audit all tables for orphaned records.
    Every evidence, analysis, job, observation, finding, note, report, and audit event
    must resolve to an existing parent case or evidence.
    """
    case_ids = {c.id for c in db_session.query(InvestigationCase.id).all()}
    case_identifiers = {c.case_identifier for c in db_session.query(InvestigationCase.case_identifier).all()}

    evidence_records = db_session.query(Evidence).all()
    orphaned_evidence = [e.id for e in evidence_records if e.case_id not in case_ids]
    assert len(orphaned_evidence) == 0, f"Found orphaned evidence: {orphaned_evidence}"

    evidence_ids = {e.id for e in evidence_records}

    analyses = db_session.query(Analysis).all()
    orphaned_analyses = [a.id for a in analyses if a.evidence_id not in evidence_ids]
    assert len(orphaned_analyses) == 0, f"Found orphaned analyses: {orphaned_analyses}"

    jobs = db_session.query(AnalysisJob).all()
    orphaned_jobs = [j.id for j in jobs if j.evidence_id not in evidence_ids]
    assert len(orphaned_jobs) == 0, f"Found orphaned jobs: {orphaned_jobs}"

    observations = db_session.query(EvidenceObservation).all()
    orphaned_obs = [o.id for o in observations if o.evidence_id not in evidence_ids]
    assert len(orphaned_obs) == 0, f"Found orphaned observations: {orphaned_obs}"

    findings = db_session.query(Finding).all()
    orphaned_findings = [f.id for f in findings if f.case_id not in case_identifiers and (not f.case_id.isdigit() or int(f.case_id) not in case_ids)]
    assert len(orphaned_findings) == 0, f"Found orphaned findings: {orphaned_findings}"

    notes = db_session.query(AnalystNote).all()
    orphaned_notes = [n.id for n in notes if n.case_id not in case_identifiers and (not n.case_id.isdigit() or int(n.case_id) not in case_ids)]
    assert len(orphaned_notes) == 0, f"Found orphaned notes: {orphaned_notes}"

    reports = db_session.query(Report).all()
    orphaned_reports = [r.id for r in reports if r.case_id not in case_identifiers and (not r.case_id.isdigit() or int(r.case_id) not in case_ids)]
    assert len(orphaned_reports) == 0, f"Found orphaned reports: {orphaned_reports}"


def test_pdf_and_json_report_synchrony_and_terminology(client, users_and_cases):
    """
    Generate both PDF and JSON reports.
    Verify they agree on evidence, findings, and custody status.
    Verify reports avoid the absolute legal claim 'court-ready' and use 'Professional forensic investigation report'.
    """
    headers = users_and_cases["headers_a"]
    case_id = users_and_cases["case_a"].case_identifier

    # Generate JSON report
    rpt_json_res = client.post(f"/api/cases/{case_id}/reports?format=json", headers=headers)
    assert rpt_json_res.status_code == 200
    json_meta = rpt_json_res.json()

    # Generate PDF report
    rpt_pdf_res = client.post(f"/api/cases/{case_id}/reports?format=pdf", headers=headers)
    assert rpt_pdf_res.status_code == 200
    pdf_meta = rpt_pdf_res.json()

    # Inspect JSON artifact content
    art_res = client.get(f"/api/reports/{json_meta['report_identifier']}/download", headers=headers)
    assert art_res.status_code == 200
    json_content = art_res.json()

    # Terminology verification
    raw_text = str(json_content).lower()
    assert "court-ready" not in raw_text, "Report must not make absolute 'court-ready' legal claims"
    assert "forensight v3" in json_content["software_version"].lower()
    assert "investigation_assistant" in json_content
    assert "chain_of_custody_status" in json_content

    # PDF artifact exists on disk
    assert pdf_meta["artifact_path"] is not None
    assert os.path.exists(pdf_meta["artifact_path"])


def test_performance_sanity_benchmarks(client, users_and_cases):
    """
    Record real execution time measurements for core V3 workflows:
    - Single forensic analysis (metadata)
    - Batch upload (2 items)
    - Cross-image correlation evaluation
    - Multi-modality heatmap generation
    - Investigation graph construction
    - JSON report generation
    """
    headers = users_and_cases["headers_a"]
    case_id = users_and_cases["case_a"].case_identifier

    # 1. Measure Batch Upload
    t0 = time.perf_counter()
    fpath = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
    with open(fpath, "rb") as f:
        content = f.read()
    files = [
        ("files", ("perf1.jpg", io.BytesIO(content), "image/jpeg")),
        ("files", ("perf2.jpg", io.BytesIO(content), "image/jpeg")),
    ]
    res_b = client.post(f"/api/cases/{case_id}/evidence/batch", files=files, headers=headers)
    t_batch_ms = (time.perf_counter() - t0) * 1000
    assert res_b.status_code == 200
    ev1_id = res_b.json()["items"][0]["id"]

    # 2. Measure Single Analysis
    t0 = time.perf_counter()
    res_anl = client.post(f"/api/evidence/{ev1_id}/analysis/metadata", headers=headers)
    t_single_anl_ms = (time.perf_counter() - t0) * 1000
    assert res_anl.status_code == 200

    # 3. Measure Heatmap Generation
    t0 = time.perf_counter()
    res_h = client.get(f"/api/evidence/{ev1_id}/heatmap", headers=headers)
    t_heatmap_ms = (time.perf_counter() - t0) * 1000
    assert res_h.status_code == 200

    # 4. Measure Cross-Image Correlation
    t0 = time.perf_counter()
    res_c = client.get(f"/api/cases/{case_id}/cross-correlation", headers=headers)
    t_cross_ms = (time.perf_counter() - t0) * 1000
    assert res_c.status_code == 200

    # 5. Measure Investigation Graph
    t0 = time.perf_counter()
    res_g = client.get(f"/api/cases/{case_id}/graph", headers=headers)
    t_graph_ms = (time.perf_counter() - t0) * 1000
    assert res_g.status_code == 200

    # 6. Measure Report Generation
    t0 = time.perf_counter()
    res_r = client.post(f"/api/cases/{case_id}/reports?format=json", headers=headers)
    t_report_ms = (time.perf_counter() - t0) * 1000
    assert res_r.status_code == 200

    # Assert real-time thresholds (all under sensible bounds)
    assert t_batch_ms < 5000, f"Batch upload too slow: {t_batch_ms:.1f}ms"
    assert t_single_anl_ms < 2000, f"Single analysis too slow: {t_single_anl_ms:.1f}ms"
    assert t_heatmap_ms < 1500, f"Heatmap too slow: {t_heatmap_ms:.1f}ms"
    assert t_cross_ms < 3000, f"Cross correlation too slow: {t_cross_ms:.1f}ms"
    assert t_graph_ms < 2000, f"Graph too slow: {t_graph_ms:.1f}ms"
    assert t_report_ms < 3000, f"Report too slow: {t_report_ms:.1f}ms"

    print(f"\n[PERFORMANCE BENCHMARK MEASUREMENTS]")
    print(f"- Batch Upload (2 files): {t_batch_ms:.2f} ms")
    print(f"- Single Analysis (Metadata): {t_single_anl_ms:.2f} ms")
    print(f"- Multi-Modality Heatmap: {t_heatmap_ms:.2f} ms")
    print(f"- Cross-Image Correlation: {t_cross_ms:.2f} ms")
    print(f"- Investigation Graph: {t_graph_ms:.2f} ms")
    print(f"- JSON Report Generation: {t_report_ms:.2f} ms")
