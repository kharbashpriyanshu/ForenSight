"""Focused regression tests for the Demo Investigation endpoint (/api/cases/demo-investigation)."""

import os
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.deps import get_current_user
from app.core.security import create_access_token, get_password_hash
from app.db.database import Base, get_db
from app.main import app
from app.models.domain import Evidence, InvestigationCase, User
from app.services.instructor_demo import (
    DEMO_CASE_IDENTIFIER,
    DEMO_USERNAME,
)

TEST_DB_URL = "sqlite:///./test_demo_endpoint.db"


def _make_session():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine, Session


def test_demo_investigation_endpoint_security_and_idempotency():
    engine, Session = _make_session()
    db = Session()
    try:
        # 1. Setup isolated user and cases
        regular_user = User(
            username="investigator_unauth",
            hashed_password=get_password_hash("Secret123!"),
            role="INVESTIGATOR",
        )
        db.add(regular_user)

        demo_user = User(
            username=DEMO_USERNAME,
            hashed_password=get_password_hash("forensight_demo_instructor"),
            role="INVESTIGATOR",
        )
        db.add(demo_user)

        admin_user = User(
            username="admin_user",
            hashed_password=get_password_hash("AdminPass123!"),
            role="ADMIN",
        )
        db.add(admin_user)
        db.commit()

        # Regular user case that must never be affected
        regular_case = InvestigationCase(
            title="Regular Isolated Case",
            user_id=regular_user.id,
            status="Open",
        )
        db.add(regular_case)
        db.commit()
        db.refresh(regular_case)
        regular_case_id = regular_case.id

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

            # 2. Unauthenticated calls are rejected
            r_unauth = client.post("/api/cases/demo-investigation")
            assert r_unauth.status_code == 401

            # 3. Regular non-demo investigator calls are forbidden (403)
            reg_token = create_access_token(regular_user.username)
            r_reg = client.post(
                "/api/cases/demo-investigation",
                headers={"Authorization": f"Bearer {reg_token}"},
            )
            assert r_reg.status_code == 403

            # 4. Status endpoint before seeding indicates exists=False
            demo_token = create_access_token(demo_user.username)
            demo_headers = {"Authorization": f"Bearer {demo_token}"}
            r_status_pre = client.get("/api/cases/demo-investigation", headers=demo_headers)
            assert r_status_pre.status_code == 200
            assert r_status_pre.json()["exists"] is False

            # 5. First call by demo user creates/provisions demo investigation
            r_create = client.post("/api/cases/demo-investigation", headers=demo_headers)
            assert r_create.status_code == 200
            data_create = r_create.json()
            assert data_create["case_identifier"] == DEMO_CASE_IDENTIFIER
            assert data_create["status"] in ("created", "already_exists")
            assert data_create["evidence_count"] >= 7
            assert data_create["route"] == f"/cases/{DEMO_CASE_IDENTIFIER}"

            case_count_1 = db.query(InvestigationCase).count()
            ev_count_1 = db.query(Evidence).count()

            # 6. Status endpoint now returns exists=True
            r_status_post = client.get("/api/cases/demo-investigation", headers=demo_headers)
            assert r_status_post.status_code == 200
            assert r_status_post.json()["exists"] is True
            assert r_status_post.json()["case_identifier"] == DEMO_CASE_IDENTIFIER

            # 7. Repeated clicks/calls return already_exists and NEVER duplicate or destroy data
            for _ in range(3):
                r_repeat = client.post("/api/cases/demo-investigation", headers=demo_headers)
                assert r_repeat.status_code == 200
                data_repeat = r_repeat.json()
                assert data_repeat["status"] == "already_exists"
                assert data_repeat["case_identifier"] == DEMO_CASE_IDENTIFIER

            # Counts must be completely unchanged (no duplicates)
            assert db.query(InvestigationCase).count() == case_count_1
            assert db.query(Evidence).count() == ev_count_1

            # 8. Existing regular case is completely untouched
            reg_case_check = db.query(InvestigationCase).filter_by(id=regular_case_id).first()
            assert reg_case_check is not None
            assert reg_case_check.title == "Regular Isolated Case"
            assert reg_case_check.user_id == regular_user.id

            # 9. Admin account can also access and query demo investigation safely
            admin_token = create_access_token(admin_user.username)
            admin_headers = {"Authorization": f"Bearer {admin_token}"}
            r_admin = client.post("/api/cases/demo-investigation", headers=admin_headers)
            assert r_admin.status_code == 200
            assert r_admin.json()["status"] == "already_exists"
            assert r_admin.json()["case_identifier"] == DEMO_CASE_IDENTIFIER
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
        if os.path.exists("test_demo_endpoint.db"):
            try:
                os.remove("test_demo_endpoint.db")
            except OSError:
                pass
