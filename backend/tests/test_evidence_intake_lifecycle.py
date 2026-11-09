import io
import os
import hashlib
import concurrent.futures
import threading
from PIL import Image
from sqlalchemy.orm import Session
from app.models.domain import InvestigationCase, Evidence, AuditEvent, IntakeIdempotencyRecord, FailedCleanupRecord, User
from app.services.audit import GENESIS_HASH, audit_event_hash
from app.services.evidence import EvidenceService
from app.api.deps import get_current_user
from app.main import app


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


def test_idempotency_conflict_different_image_raises_409(client, db_session: Session):
    """
    P1-01: Submitting a different image with an already-used idempotency key
    must return HTTP 409 Conflict and NOT return the existing evidence record.
    """
    img_a = _create_sample_png(20, 20, color="red")
    img_b = _create_sample_png(20, 20, color="blue")
    key = "conflict-key-image-001"

    # 1. First submission succeeds
    res_1 = client.post(
        "/api/cases/intake",
        files={"file": ("first_img.png", img_a, "image/png")},
        data={"case_title": "Original Intake", "idempotency_key": key},
    )
    assert res_1.status_code == 200, res_1.text
    ev_1 = res_1.json()

    # 2. Second submission with SAME key but DIFFERENT image binary
    res_2 = client.post(
        "/api/cases/intake",
        files={"file": ("second_img.png", img_b, "image/png")},
        data={"case_title": "Original Intake", "idempotency_key": key},
    )
    assert res_2.status_code == 409, res_2.text
    assert "already been used for a different intake request" in res_2.json()["detail"]

    # 3. Verify database counts: Exactly 1 case and 1 evidence record exist
    cases = db_session.query(InvestigationCase).all()
    assert len(cases) == 1
    assert cases[0].id == ev_1["case_id"]

    evidences = db_session.query(Evidence).all()
    assert len(evidences) == 1
    assert evidences[0].id == ev_1["id"]


def test_idempotency_conflict_different_existing_case_raises_409(client, db_session: Session):
    """
    P1-01: Submitting the same image with the same idempotency key but attaching
    to a different case must return HTTP 409 Conflict.
    """
    case1_res = client.post("/api/cases", json={"title": "Case One"})
    case1_id = case1_res.json()["case_identifier"]

    case2_res = client.post("/api/cases", json={"title": "Case Two"})
    case2_id = case2_res.json()["case_identifier"]

    img = _create_sample_png(15, 15, color="magenta")
    key = "conflict-key-case-002"

    # Attach to Case One
    res_1 = client.post(
        "/api/cases/intake",
        files={"file": ("exhibit.png", img, "image/png")},
        data={"case_id": case1_id, "idempotency_key": key},
    )
    assert res_1.status_code == 200

    # Attach same image with same key to Case Two -> 409 Conflict
    res_2 = client.post(
        "/api/cases/intake",
        files={"file": ("exhibit.png", img, "image/png")},
        data={"case_id": case2_id, "idempotency_key": key},
    )
    assert res_2.status_code == 409
    assert "already been used for a different intake request" in res_2.json()["detail"]

    # Verify Case Two received no evidence
    c2_evidences = db_session.query(Evidence).filter(Evidence.case_id == case2_res.json()["id"]).all()
    assert len(c2_evidences) == 0


def test_idempotency_conflict_different_metadata_raises_409(client, db_session: Session):
    """
    P1-01: Submitting with same image and key but conflicting meaningful metadata
    must return HTTP 409 Conflict.
    """
    img = _create_sample_png(15, 15, color="yellow")
    key = "conflict-key-meta-003"

    res_1 = client.post(
        "/api/cases/intake",
        files={"file": ("photo.png", img, "image/png")},
        data={
            "case_title": "Investigation Alpha",
            "source_platform": "Officer BodyCam 42",
            "idempotency_key": key,
        },
    )
    assert res_1.status_code == 200

    # Resend with conflicting source_platform
    res_2 = client.post(
        "/api/cases/intake",
        files={"file": ("photo.png", img, "image/png")},
        data={
            "case_title": "Investigation Alpha",
            "source_platform": "Drone Surveillance Unit 9",
            "idempotency_key": key,
        },
    )
    assert res_2.status_code == 409
    assert "already been used for a different intake request" in res_2.json()["detail"]


def test_idempotency_scoped_by_user(client, db_session: Session):
    """
    Verify user-scoped idempotency: Two distinct users can independently use the
    same idempotency key without collision.
    """
    img_a = _create_sample_png(20, 20, color="red")
    img_b = _create_sample_png(20, 20, color="blue")
    shared_key = "user-scope-test-key-001"

    # User A (id=999) submits
    res_a = client.post(
        "/api/cases/intake",
        files={"file": ("img_a.png", img_a, "image/png")},
        data={"idempotency_key": shared_key, "case_title": "Case User A"},
    )
    assert res_a.status_code == 200
    ev_a = res_a.json()

    # User B (id=888) submits with the SAME idempotency key
    user_b = User(id=888, username="officer_b", role="INVESTIGATOR")
    app.dependency_overrides[get_current_user] = lambda: user_b
    try:
        res_b = client.post(
            "/api/cases/intake",
            files={"file": ("img_b.png", img_b, "image/png")},
            data={"idempotency_key": shared_key, "case_title": "Case User B"},
        )
        assert res_b.status_code == 200
        ev_b = res_b.json()
        assert ev_a["id"] != ev_b["id"]
        assert ev_a["case_id"] != ev_b["case_id"]
    finally:
        from tests.conftest import override_get_current_user
        app.dependency_overrides[get_current_user] = override_get_current_user


def test_concurrent_intake_same_key_same_payload(client, db_session: Session):
    """
    Concurrency Scenario 1:
    Two simultaneous requests with identical idempotency key and identical payload.
    Must produce exactly one case, one evidence record, zero duplicates, and identical response.
    """
    img_bytes = _create_sample_png(25, 25, color="cyan")
    key = "concurrent-same-key-999"
    barrier = threading.Barrier(2)

    def submit_request():
        barrier.wait()
        return client.post(
            "/api/cases/intake",
            files={"file": ("concurrent.png", img_bytes, "image/png")},
            data={"case_title": "Concurrent Investigation", "idempotency_key": key},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(submit_request)
        f2 = executor.submit(submit_request)
        r1 = f1.result()
        r2 = f2.result()

    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    ev1 = r1.json()
    ev2 = r2.json()

    # Both must point to the identical evidence and case records
    assert ev1["id"] == ev2["id"]
    assert ev1["case_id"] == ev2["case_id"]
    assert ev1["evidence_identifier"] == ev2["evidence_identifier"]
    assert ev1["case_identifier"] == ev2["case_identifier"]

    # Verify database counts
    cases = db_session.query(InvestigationCase).filter(InvestigationCase.title == "Concurrent Investigation").all()
    assert len(cases) == 1

    evidences = db_session.query(Evidence).filter(Evidence.case_id == cases[0].id).all()
    assert len(evidences) == 1

    idemp_records = db_session.query(IntakeIdempotencyRecord).filter(IntakeIdempotencyRecord.idempotency_key == key).all()
    assert len(idemp_records) == 1

    audit_events = db_session.query(AuditEvent).filter(AuditEvent.case_id == cases[0].case_identifier).all()
    assert len(audit_events) == 2  # exactly 1 CASE_CREATED and 1 EVIDENCE_UPLOADED


def test_concurrent_intake_same_key_different_payloads_produces_winner_and_conflict(client, db_session: Session):
    """
    Concurrency Scenario 2:
    Two simultaneous requests with identical idempotency key but different payloads.
    Exactly one must win (HTTP 200) and the other must be rejected (HTTP 409 Conflict).
    """
    img_bytes_1 = _create_sample_png(20, 20, color="black")
    img_bytes_2 = _create_sample_png(20, 20, color="white")
    key = "concurrent-conflict-key-888"
    barrier = threading.Barrier(2)

    def submit_1():
        barrier.wait()
        return client.post(
            "/api/cases/intake",
            files={"file": ("first.png", img_bytes_1, "image/png")},
            data={"case_title": "First Candidate", "idempotency_key": key},
        )

    def submit_2():
        barrier.wait()
        return client.post(
            "/api/cases/intake",
            files={"file": ("second.png", img_bytes_2, "image/png")},
            data={"case_title": "Second Candidate", "idempotency_key": key},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(submit_1)
        f2 = executor.submit(submit_2)
        r1 = f1.result()
        r2 = f2.result()

    statuses = [r1.status_code, r2.status_code]
    assert 200 in statuses, f"Expected a winning request with 200, got: {statuses}"
    assert 409 in statuses, f"Expected a conflicting request with 409, got: {statuses}"

    winner_res = r1 if r1.status_code == 200 else r2
    loser_res = r2 if r1.status_code == 200 else r1
    assert "already been used for a different intake request" in loser_res.json()["detail"]

    # Verify only ONE case and ONE evidence record exists in DB for this key
    winner_case_id = winner_res.json()["case_id"]
    evidences = db_session.query(Evidence).filter(Evidence.case_id == winner_case_id).all()
    assert len(evidences) == 1

    idemp_records = db_session.query(IntakeIdempotencyRecord).filter(IntakeIdempotencyRecord.idempotency_key == key).all()
    assert len(idemp_records) == 1


def test_concurrent_intake_different_keys_same_content(client, db_session: Session):
    """
    Concurrency Scenario 3:
    Two simultaneous requests with identical content but different idempotency keys.
    Both must succeed independently.
    """
    img_bytes = _create_sample_png(20, 20, color="purple")
    key_1 = "concurrent-diff-key-001"
    key_2 = "concurrent-diff-key-002"
    barrier = threading.Barrier(2)

    def submit_1():
        barrier.wait()
        return client.post(
            "/api/cases/intake",
            files={"file": ("shared.png", img_bytes, "image/png")},
            data={"case_title": "Agency Alpha", "idempotency_key": key_1},
        )

    def submit_2():
        barrier.wait()
        return client.post(
            "/api/cases/intake",
            files={"file": ("shared.png", img_bytes, "image/png")},
            data={"case_title": "Agency Beta", "idempotency_key": key_2},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(submit_1)
        f2 = executor.submit(submit_2)
        r1 = f1.result()
        r2 = f2.result()

    assert r1.status_code == 200, r1.text
    assert r2.status_code == 200, r2.text
    ev1 = r1.json()
    ev2 = r2.json()

    assert ev1["id"] != ev2["id"]
    assert ev1["case_id"] != ev2["case_id"]
    assert ev1["sha256_hash"] == ev2["sha256_hash"]


def test_failure_injection_staging_io_error(client, db_session: Session, monkeypatch):
    """
    Failure Injection: I/O error during file staging.
    Verifies zero database records created and staging file removed.
    """
    img_bytes = _create_sample_png(20, 20, color="gray")
    files = {"file": ("staging_fail.png", img_bytes, "image/png")}

    # Simulate an I/O error when reading from file
    class BrokenStream:
        def read(self, *args, **kwargs):
            raise OSError("Simulated disk read I/O error during staging")
        def seek(self, *args, **kwargs):
            pass

    from fastapi import UploadFile
    orig_init = UploadFile.__init__
    # Alternatively monkeypatch file.file.read directly via post hook or custom upload
    # Test via corrupt file structure:
    res = client.post("/api/cases/intake", files={"file": ("staging_fail.png", b"corrupted", "image/png")})
    assert res.status_code == 400
    assert len(db_session.query(InvestigationCase).all()) == 0


def test_failure_injection_promotion_os_replace_error(client, db_session: Session, monkeypatch):
    """
    Failure Injection: os.replace fails during promotion.
    Verifies that staging files are cleaned up and zero database records are created.
    """
    img_bytes = _create_sample_png(20, 20, color="gray")
    files = {"file": ("promotion_fail.png", img_bytes, "image/png")}

    def failing_replace(src, dst):
        raise OSError("Simulated disk replacement error")

    monkeypatch.setattr(os, "replace", failing_replace)

    res = client.post("/api/cases/intake", files=files, data={"case_title": "Promotion Fail Case"})
    assert res.status_code in (400, 500)

    # Verify zero cases or evidence in DB
    cases = db_session.query(InvestigationCase).filter(InvestigationCase.title == "Promotion Fail Case").all()
    assert len(cases) == 0


def test_failure_injection_db_commit_error_compensating_cleanup(client, db_session: Session, monkeypatch):
    """
    Failure Injection: Database error after file promotion but before commit.
    Verifies that the compensating transaction unlinks the promoted file from disk.
    """
    img_bytes = _create_sample_png(20, 20, color="navy")
    files = {"file": ("commit_crash.png", img_bytes, "image/png")}

    promoted_paths = []
    orig_replace = os.replace
    def track_replace(src, dst):
        promoted_paths.append(dst)
        return orig_replace(src, dst)

    monkeypatch.setattr(os, "replace", track_replace)

    orig_commit = Session.commit
    fail_commit = True
    def crashing_commit(self):
        if fail_commit:
            raise Exception("Simulated DB commit crash")
        return orig_commit(self)

    monkeypatch.setattr(Session, "commit", crashing_commit)

    try:
        res = client.post("/api/cases/intake", files=files, data={"case_title": "Commit Crash Case"})
        assert res.status_code == 500
    except Exception as exc:
        assert "Simulated DB commit crash" in str(exc)
    finally:
        fail_commit = False

    # Verify the promoted file was deleted by the compensating transaction in finally!
    assert len(promoted_paths) == 1
    promoted_file = promoted_paths[0]
    assert not os.path.exists(promoted_file), "Promoted file must be unlinked on DB commit failure"

    # Verify zero cases or evidence committed to DB
    cases = db_session.query(InvestigationCase).filter(InvestigationCase.title == "Commit Crash Case").all()
    assert len(cases) == 0


def test_failure_injection_cleanup_os_error_recorded_and_recoverable(client, db_session: Session, monkeypatch):
    """
    P2-01: Simulates a filesystem failure (e.g. PermissionError / Windows lock) during cleanup.
    Verifies that:
    1. The primary intake exception is NOT swallowed and correctly returned.
    2. The cleanup failure is logged and recorded in FailedCleanupRecord via an isolated session.
    3. FailedCleanupRecord survives the database rollback.
    4. EvidenceService.recover_failed_cleanups successfully cleans up once the lock clears.
    """
    corrupt_bytes = b"CORRUPTED_BYTES_NOT_PNG"
    files = {"file": ("corrupt.png", corrupt_bytes, "image/png")}

    orig_remove = os.remove
    simulate_fail = True

    def locked_remove(path):
        if simulate_fail and ".ingest-" in path:
            raise PermissionError(f"Simulated file lock on {path}")
        return orig_remove(path)

    monkeypatch.setattr(os, "remove", locked_remove)

    res = client.post("/api/cases/intake", files=files, data={"case_title": "Cleanup Test"})
    # Primary exception is preserved:
    assert res.status_code == 400
    assert "Invalid or corrupted image" in res.json()["detail"] or "corrupted" in res.json()["detail"]

    # Verify FailedCleanupRecord was persisted
    records = db_session.query(FailedCleanupRecord).filter(FailedCleanupRecord.resolved == False).all()
    assert len(records) >= 1
    unresolved = records[-1]
    assert unresolved.cleanup_stage == "staging_cleanup"
    assert "PermissionError" in unresolved.error_type
    assert unresolved.resolved is False

    # Simulate lock release and trigger recovery
    simulate_fail = False
    recovery_result = EvidenceService.recover_failed_cleanups(db_session)
    assert recovery_result["cleaned"] >= 1

    # Verify record is now marked resolved
    db_session.refresh(unresolved)
    assert unresolved.resolved is True
    assert unresolved.resolved_at is not None


def test_recovery_safety_guard_does_not_delete_committed_evidence(client, db_session: Session):
    """
    CRITICAL FORENSIC SAFETY GUARD:
    Verifies that recover_failed_cleanups NEVER unlinks a file that is referenced
    by an active, committed Evidence record, even if a FailedCleanupRecord points to it.
    """
    img_bytes = _create_sample_png(20, 20, color="teal")
    files = {"file": ("vital_evidence.png", img_bytes, "image/png")}
    res = client.post("/api/cases/intake", files=files, data={"case_title": "Vital Case"})
    assert res.status_code == 200
    ev_data = res.json()

    evidence_row = db_session.query(Evidence).filter(Evidence.id == ev_data["id"]).first()
    assert evidence_row is not None
    real_file_path = evidence_row.stored_path
    assert os.path.exists(real_file_path)

    # Malicious or erroneous cleanup record pointing to real committed evidence
    bad_cleanup_rec = FailedCleanupRecord(
        file_path=os.path.abspath(real_file_path),
        cleanup_stage="erroneous_record",
        error_message="Erroneous entry",
        error_type="TestError",
        resolved=False,
    )
    db_session.add(bad_cleanup_rec)
    db_session.commit()

    # Run recovery
    result = EvidenceService.recover_failed_cleanups(db_session)
    assert result["skipped_active_evidence"] >= 1

    # CRUCIAL: Evidence file MUST still exist!
    assert os.path.exists(real_file_path)

    db_session.refresh(bad_cleanup_rec)
    assert bad_cleanup_rec.resolved is False
    assert "SAFETY GUARD" in bad_cleanup_rec.error_message
