import tempfile
import os
import atexit
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool
from app.db.database import Base, get_db, SessionLocal
from app.models.domain import InvestigationCase, Evidence
from app.main import app

PYTEST_TMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".pytest-tmp"))
os.makedirs(PYTEST_TMP_DIR, exist_ok=True)
TEST_DB_PATH = os.path.join(PYTEST_TMP_DIR, f"forensight_test_{os.getpid()}.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{TEST_DB_PATH.replace(os.sep, '/')}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False, "timeout": 30},
    poolclass=QueuePool,
)

# Rebind SessionLocal to test engine for background workers and dispatch services in tests
SessionLocal.configure(bind=engine)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=15000")
    cursor.close()

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def cleanup_test_db():
    engine.dispose()
    for ext in ("", "-wal", "-shm"):
        f = f"{TEST_DB_PATH}{ext}"
        if os.path.exists(f):
            try:
                os.remove(f)
            except OSError:
                pass

atexit.register(cleanup_test_db)

Base.metadata.create_all(bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

from app.api.deps import get_current_user
from app.models.domain import User

def override_get_current_user():
    return User(id=999, username="test_admin", role="ADMIN")

app.dependency_overrides[get_current_user] = override_get_current_user
@pytest.fixture
def db_session():
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)

from fastapi.testclient import TestClient

@pytest.fixture(autouse=True)
def client():
    # We yield so the DB is reset between tests
    app.dependency_overrides[get_current_user] = override_get_current_user
    Base.metadata.create_all(bind=engine)
    yield TestClient(app)
    Base.metadata.drop_all(bind=engine)
