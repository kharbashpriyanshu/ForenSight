import io
import os
import hashlib
from PIL import Image
from sqlalchemy.orm import Session
from app.models.domain import InvestigationCase, Evidence, AuditEvent, IntakeIdempotencyRecord
from app.services.audit import GENESIS_HASH, audit_event_hash


def _create_sample_png(width=20, height=20, color="blue") -> bytes:
    img = Image.new("RGB", (width, height), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_coordinated_intake_success_creates_case_and_evidence(client):
    """
    Pathway A: User submits an image without an existing case.
    The backend atomically creates the investigation case and evidence record together.
    Verifies disk storage, bit-for-bit SHA-256 match, and audit logging.
    """
    img_bytes = _create_sample_png(30, 30, color="green")
    expected_sha256 = hashlib.sha256(img_bytes).hexdigest()

    files = {"file": ("crime_scene_photo.png", img_bytes, "image/png")}
    data = {
        "case_title": "Operation Emerald Target",
        "idempotency_key": "idemp-test-emerald-001",
        "source_platform": "Secure Camera SD Card",
        "acquisition_method": "ORIGINAL_FILE",
        "received_from": "Officer Miller #442",
        "intake_notes": "Recovered from camera slot 1 intact.",
    }

    res = client.post("/api/cases/intake", files=files, data=data)
    assert res.status_code == 200, res.text
    ev = res.json()

    # 1. Verify response structure
    assert ev["original_filename"] == "crime_scene_photo.png"
    assert ev["mime_type"] == "image/png"
    assert ev["image_format"] == "PNG"
    assert ev["width"] == 30
    assert ev["height"] == 30
    assert ev["file_size"] == len(img_bytes)
    assert ev["sha256_hash"] == expected_sha256
    assert "FS-EVD-" in ev["evidence_identifier"]
    assert "FS-CASE-" in ev["case_identifier"]

    # 2. Verify case was created and matches title
    case_res = client.get(f"/api/cases/{ev['case_identifier']}")
    assert case_res.status_code == 200
    case_data = case_res.json()
    assert case_data["title"] == "Operation Emerald Target"
    assert case_data["status"] == "Open"

    # 3. Verify physical bitstream on disk
    raw_res = client.get(f"/api/evidence/{ev['id']}/raw")
    assert raw_res.status_code == 200
    assert hashlib.sha256(raw_res.content).hexdigest() == expected_sha256


def test_coordinated_intake_attach_to_existing_case(client):
    """
    Pathway B: User selects an existing open case to attach evidence.
    Verifies that the evidence attaches to the specified case without creating a new case.
    """
    case_res = client.post("/api/cases", json={"title": "Pre-existing Investigation"})
    assert case_res.status_code == 200
    target_case_id = case_res.json()["case_identifier"]

    img_bytes = _create_sample_png(15, 15, color="red")
    files = {"file": ("exhibit_b.png", img_bytes, "image/png")}
    data = {
        "case_id": target_case_id,
        "idempotency_key": "idemp-attach-test-002",
    }

    res = client.post("/api/cases/intake", files=files, data=data)
    assert res.status_code == 200
    ev = res.json()
    assert ev["case_identifier"] == target_case_id

    # Verify no new cases were generated
    all_cases = client.get("/api/cases").json()
    assert len(all_cases) == 1


def test_intake_invalid_image_leaves_no_orphaned_case(client):
    """
    Integrity test: A file with a valid image extension (.png) but corrupt bytes.
    Must be rejected with 400.
    CRITICAL: Must NOT create an investigation case in the database.
    """
    initial_cases = client.get("/api/cases").json()
    initial_count = len(initial_cases)

    corrupt_bytes = b"NOT_A_VALID_PNG_HEADER_OR_STRUCTURE_AT_ALL_CORRUPTED"
    files = {"file": ("corrupt_file.png", corrupt_bytes, "image/png")}
    data = {
        "case_title": "Should Not Exist Case",
        "idempotency_key": "idemp-fail-corrupt-003",
    }

    res = client.post("/api/cases/intake", files=files, data=data)
    assert res.status_code == 400
    assert "Invalid or corrupted image" in res.json()["detail"] or "corrupted" in res.json()["detail"]

    # Verify ZERO orphaned cases were created
    after_cases = client.get("/api/cases").json()
    assert len(after_cases) == initial_count


def test_intake_unsupported_extension_leaves_no_orphaned_case(client):
    """
    Integrity test: Submitting an invalid extension (.exe, .pdf, .txt) must fail
    without leaving an orphaned case.
    """
    initial_count = len(client.get("/api/cases").json())

    files = {"file": ("payload.exe", b"\x4d\x5a\x90\x00", "application/x-msdownload")}
    data = {"case_title": "Malicious Upload Attempt"}

    res = client.post("/api/cases/intake", files=files, data=data)
    assert res.status_code == 400
    assert "Unsupported file extension" in res.json()["detail"]

    after_count = len(client.get("/api/cases").json())
    assert after_count == initial_count


def test_intake_oversized_file_leaves_no_orphaned_case(client):
    """
    Integrity test: Submitting an 11MB file (exceeding 10MB limit) must return 413
    without leaving an orphaned case or stored file.
    """
    initial_count = len(client.get("/api/cases").json())

    oversized_bytes = b"0" * (11 * 1024 * 1024)
    files = {"file": ("too_large.png", oversized_bytes, "image/png")}
    data = {"case_title": "Oversized Intake Attempt"}

    res = client.post("/api/cases/intake", files=files, data=data)
    assert res.status_code == 413
    assert "File too large" in res.json()["detail"]

    after_count = len(client.get("/api/cases").json())
    assert after_count == initial_count


def test_intake_idempotency_replay_prevents_duplicate_case_and_evidence(client):
    """
    Batch B: Submitting an intake request twice with the same idempotency key
    must return the existing result and prevent duplicate case and evidence creation.
    """
    img_bytes = _create_sample_png(25, 25, color="yellow")
    idemp_key = "idemp-replay-unique-998877"

    files_1 = {"file": ("idemp_sample.png", img_bytes, "image/png")}
    data_1 = {"case_title": "Idempotent Case Alpha", "idempotency_key": idemp_key}

    res_1 = client.post("/api/cases/intake", files=files_1, data=data_1)
    assert res_1.status_code == 200
    ev_1 = res_1.json()

    # Re-send the exact same intake request with the same idempotency key
    files_2 = {"file": ("idemp_sample.png", img_bytes, "image/png")}
    data_2 = {"case_title": "Idempotent Case Alpha", "idempotency_key": idemp_key}

    res_2 = client.post("/api/cases/intake", files=files_2, data=data_2)
    assert res_2.status_code == 200
    ev_2 = res_2.json()

    # Verify identical evidence and case identifiers are returned
    assert ev_1["id"] == ev_2["id"]
    assert ev_1["evidence_identifier"] == ev_2["evidence_identifier"]
    assert ev_1["case_id"] == ev_2["case_id"]
    assert ev_1["sha256_hash"] == ev_2["sha256_hash"]

    # Verify that only ONE case exists
    cases = client.get("/api/cases").json()
    assert len(cases) == 1
    assert cases[0]["title"] == "Idempotent Case Alpha"


def test_intake_legitimate_reuse_of_identical_image(client):
    """
    Important distinction: Content deduplication vs Request Idempotency.
    Uploading the same image bytes in two separate intake operations (with distinct
    idempotency keys) must legitimately succeed and associate with separate dossiers.
    """
    img_bytes = _create_sample_png(12, 12, color="purple")

    # Submission 1: Case A
    files_1 = {"file": ("photo.png", img_bytes, "image/png")}
    data_1 = {"case_title": "Investigation Agency North", "idempotency_key": "key-north-001"}
    res_1 = client.post("/api/cases/intake", files=files_1, data=data_1)
    assert res_1.status_code == 200
    ev_1 = res_1.json()

    # Submission 2: Case B (different investigation legitimately examining same evidence file)
    files_2 = {"file": ("photo.png", img_bytes, "image/png")}
    data_2 = {"case_title": "Investigation Agency South", "idempotency_key": "key-south-002"}
    res_2 = client.post("/api/cases/intake", files=files_2, data=data_2)
    assert res_2.status_code == 200
    ev_2 = res_2.json()

    # Both succeeded legitimately with distinct IDs but identical image SHA-256
    assert ev_1["id"] != ev_2["id"]
    assert ev_1["case_id"] != ev_2["case_id"]
    assert ev_1["sha256_hash"] == ev_2["sha256_hash"]

    cases = client.get("/api/cases").json()
    assert len(cases) == 2


def test_closed_case_rejection_on_intake(client, db_session: Session):
    """
    Batch C: Closed investigations must NOT receive new evidence.
    Both /cases/intake and /cases/{case_id}/evidence must return 400.
    """
    # 1. Create a case and close it
    case_res = client.post("/api/cases", json={"title": "Archived Case 2025"})
    case_id = case_res.json()["case_identifier"]

    # Update case status directly to Closed
    case = db_session.query(InvestigationCase).filter(InvestigationCase.case_identifier == case_id).first()
    case.status = "Closed"
    db_session.commit()

    img_bytes = _create_sample_png(10, 10, color="black")

    # 2. Try coordinated intake to closed case
    files = {"file": ("late_evidence.png", img_bytes, "image/png")}
    res_intake = client.post("/api/cases/intake", files=files, data={"case_id": case_id})
    assert res_intake.status_code == 400
    assert "closed investigation" in res_intake.json()["detail"].lower()

    # 3. Try direct evidence upload to closed case
    files2 = {"file": ("late_evidence2.png", img_bytes, "image/png")}
    res_direct = client.post(f"/api/cases/{case_id}/evidence", files=files2)
    assert res_direct.status_code == 400
    assert "closed investigation" in res_direct.json()["detail"].lower()


def test_cases_exclude_closed_filter(client, db_session: Session):
    """
    Batch C: GET /api/cases?exclude_closed=true must filter out closed cases.
    """
    # Create two cases
    res1 = client.post("/api/cases", json={"title": "Active Case 1"})
    res2 = client.post("/api/cases", json={"title": "Finished Case 2"})

    # Mark second case Closed
    case2_id = res2.json()["case_identifier"]
    case2 = db_session.query(InvestigationCase).filter(InvestigationCase.case_identifier == case2_id).first()
    case2.status = "Closed"
    db_session.commit()

    # GET /api/cases without filter returns both
    all_cases = client.get("/api/cases").json()
    assert len(all_cases) == 2

    # GET /api/cases?exclude_closed=true returns only Active Case 1
    open_cases = client.get("/api/cases?exclude_closed=true").json()
    assert len(open_cases) == 1
    assert open_cases[0]["title"] == "Active Case 1"


def test_audit_chain_integrity_after_intake(client, db_session: Session):
    """
    Verifies that audit event hash-chaining remains mathematically valid and unbroken
    across case creation and evidence intake.
    """
    img_bytes = _create_sample_png(20, 20, color="orange")
    files = {"file": ("audit_sample.png", img_bytes, "image/png")}
    res = client.post("/api/cases/intake", files=files, data={"case_title": "Audit Chain Test Case"})
    assert res.status_code == 200
    case_identifier = res.json()["case_identifier"]

    # Query all audit events for this case in sequence order
    events = (
        db_session.query(AuditEvent)
        .filter(AuditEvent.case_id == case_identifier)
        .order_by(AuditEvent.sequence_number.asc())
        .all()
    )
    assert len(events) >= 2  # CASE_CREATED and EVIDENCE_UPLOADED

    previous_hash = GENESIS_HASH
    for expected_seq, event in enumerate(events, start=1):
        assert event.sequence_number == expected_seq
        assert event.previous_hash == previous_hash
        actual_hash = audit_event_hash(event)
        assert event.event_hash == actual_hash
        previous_hash = event.event_hash
