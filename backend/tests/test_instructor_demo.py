"""Regression tests for the FS-DEMO-001 instructor demonstration dataset and seed."""

import hashlib
import json
import os
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.db.database import Base, get_db
from app.main import app
from app.models.domain import (
    Analysis,
    AnalysisJob,
    AuditEvent,
    Evidence,
    EvidenceLineageRelation,
    EvidenceObservation,
    Finding,
    InvestigationCase,
    Report,
    User,
)
from app.services.case_export import CaseExportService, SigningKeyUnavailable
from app.services.custody import CustodyService
from app.services.graph import GraphService
from app.services.instructor_demo import (
    DEMO_CASE_IDENTIFIER,
    DEMO_PASSWORD,
    DEMO_USERNAME,
    reset_instructor_demo,
    seed_instructor_demo,
)

TEST_DB_URL = "sqlite:///./test_instructor_demo.db"


def _make_session():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine, Session


def test_instructor_demo_lifecycle_idempotency_isolation_and_reset():
    engine, Session = _make_session()
    db = Session()
    try:
        # Pre-existing unrelated user & case that must never be touched or exposed
        user_a = User(username="isolated_user_a", hashed_password=get_password_hash("UserASecret!"), role="INVESTIGATOR")
        db.add(user_a)
        db.commit()
        db.refresh(user_a)

        other_case = InvestigationCase(title="Unrelated User A Case", user_id=user_a.id, status="Open")
        db.add(other_case)
        db.commit()
        db.refresh(other_case)

        # 1. Seed creates FS-DEMO-001
        res1 = seed_instructor_demo(db)
        assert res1["status"] == "seeded"
        assert res1["case_identifier"] == DEMO_CASE_IDENTIFIER
        assert res1["evidence_count"] == 7

        case = db.query(InvestigationCase).filter_by(case_identifier=DEMO_CASE_IDENTIFIER).first()
        assert case is not None
        assert case.status == "IN_REVIEW"

        # 2. Idempotent rerun
        ev_count_1 = db.query(Evidence).filter_by(case_id=case.id).count()
        audit_count_1 = db.query(AuditEvent).filter_by(case_id=DEMO_CASE_IDENTIFIER).count()
        res2 = seed_instructor_demo(db)
        assert res2["status"] == "already_seeded"
        assert db.query(Evidence).filter_by(case_id=case.id).count() == ev_count_1
        assert db.query(AuditEvent).filter_by(case_id=DEMO_CASE_IDENTIFIER).count() == audit_count_1

        # 3. Evidence files exist & hashes/dimensions match actual bytes
        evidences = db.query(Evidence).filter_by(case_id=case.id).all()
        assert len(evidences) == 7
        for ev in evidences:
            assert os.path.isfile(ev.stored_path)
            raw = Path(ev.stored_path).read_bytes()
            assert len(raw) == ev.file_size
            assert hashlib.sha256(raw).hexdigest() == ev.sha256_hash
            with Image.open(ev.stored_path) as im:
                assert im.size == (ev.width, ev.height)

        # Ground-truth splice mask matches composite splice dimensions
        mask_path = Path(settings.STORAGE_DIR).resolve().parent / "demo_ground_truth" / "campaign_composite_splice_mask.png"
        assert mask_path.is_file()
        splice_ev = next(e for e in evidences if e.original_filename == "campaign_composite_splice.jpg")
        with Image.open(mask_path) as mask_im:
            assert mask_im.size == (splice_ev.width, splice_ev.height)

        # 4. Real analysis jobs, observations, findings, lineage
        jobs = db.query(AnalysisJob).join(Evidence).filter(Evidence.case_id == case.id).all()
        assert len(jobs) >= 20
        assert all(j.status == "COMPLETED" and j.analysis_id is not None for j in jobs)
        assert db.query(EvidenceObservation).join(Evidence).filter(Evidence.case_id == case.id).count() >= 10
        assert db.query(Finding).filter_by(case_id=DEMO_CASE_IDENTIFIER).count() >= 3
        assert db.query(EvidenceLineageRelation).filter_by(case_id=case.id).count() >= 5

        # 5. Graph integrity (valid endpoints, no duplicates, no cross-case)
        graph = GraphService.get_case_observation_graph(db, case)
        node_ids = {n["id"] for n in graph["nodes"]}
        assert len(node_ids) >= 15
        seen_edges = set()
        for e in graph["edges"]:
            assert e["source"] in node_ids
            assert e["target"] in node_ids
            key = (e["source"], e["target"], e["type"])
            assert key not in seen_edges
            seen_edges.add(key)

        # 6. Audit timeline chronological & custody intact
        audits = db.query(AuditEvent).filter_by(case_id=DEMO_CASE_IDENTIFIER).order_by(AuditEvent.sequence_number.asc()).all()
        assert len(audits) >= 15
        for i in range(1, len(audits)):
            assert audits[i].sequence_number == audits[i - 1].sequence_number + 1
            assert audits[i].previous_hash == audits[i - 1].event_hash
        custody = CustodyService.get_chain_of_custody(db, case)
        assert custody.all_hashes_intact is True

        # 7. Report exists on disk; signed archive requires signing key
        report = db.query(Report).filter_by(case_id=DEMO_CASE_IDENTIFIER).first()
        assert report is not None
        assert report.artifact_path and os.path.isfile(report.artifact_path)
        payload = json.loads(Path(report.artifact_path).read_text(encoding="utf-8"))
        assert payload["case_information"]["case_identifier"] == DEMO_CASE_IDENTIFIER
        assert len(payload["evidence"]) == 7

        prev_key = settings.CASE_EXPORT_SIGNING_PRIVATE_KEY
        settings.CASE_EXPORT_SIGNING_PRIVATE_KEY = ""
        try:
            try:
                CaseExportService.create_bundle(db, case)
                assert False, "Expected SigningKeyUnavailable when no signing key is configured"
            except SigningKeyUnavailable:
                pass
        finally:
            settings.CASE_EXPORT_SIGNING_PRIVATE_KEY = prev_key

        # 8. Cross-case isolation & demo login
        def _override_db():
            s = Session()
            try:
                yield s
            finally:
                s.close()

        prev_override = app.dependency_overrides.get(get_db)
        prev_user_override = app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides[get_db] = _override_db
        try:
            client = TestClient(app)
            r_login = client.post("/api/auth/login", data={"username": DEMO_USERNAME, "password": DEMO_PASSWORD})
            assert r_login.status_code == 200
            assert r_login.json()["role"] == "INVESTIGATOR"

            demo_headers = {"Authorization": f"Bearer {create_access_token(DEMO_USERNAME)}"}
            user_a_headers = {"Authorization": f"Bearer {create_access_token(user_a.username)}"}

            assert client.get(f"/api/cases/{DEMO_CASE_IDENTIFIER}", headers=demo_headers).status_code == 200
            assert client.get(f"/api/cases/{other_case.case_identifier}", headers=demo_headers).status_code == 403
            assert client.get(f"/api/cases/{DEMO_CASE_IDENTIFIER}", headers=user_a_headers).status_code == 403

            # 9. Partial seed recovery
            db.query(Report).filter_by(case_id=DEMO_CASE_IDENTIFIER).delete()
            db.commit()
            res_recover = seed_instructor_demo(db)
            assert res_recover["status"] == "seeded"
            assert db.query(Report).filter_by(case_id=DEMO_CASE_IDENTIFIER).count() >= 1

            # 10. Reset removes ONLY FS-DEMO-001 and preserves user_a's case
            reset_res = reset_instructor_demo(db)
            assert reset_res["removed"] is True
            assert db.query(InvestigationCase).filter_by(case_identifier=DEMO_CASE_IDENTIFIER).first() is None
            assert db.query(InvestigationCase).filter_by(id=other_case.id).first() is not None
        finally:
            if prev_override is not None:
                app.dependency_overrides[get_db] = prev_override
            else:
                app.dependency_overrides.pop(get_db, None)
            if prev_user_override is not None:
                app.dependency_overrides[get_current_user] = prev_user_override
    finally:
        db.close()
        engine.dispose()
        if os.path.exists("test_instructor_demo.db"):
            try:
                os.remove("test_instructor_demo.db")
            except OSError:
                pass

