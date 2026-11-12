import hashlib
import io
import json
import os
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings, validate_runtime_settings
from app.core.security import create_access_token, get_password_hash
from app.db.database import Base, get_db
from app.forensics.ela.analyzer import ELAAnalyzer
from app.forensics.metadata.analyzer import MetadataAnalyzer
from app.main import app
from app.models.domain import InvestigationCase, User
from app.services.case_export import CaseExportService
from app.services.custody import CustodyService
from app.services.reports import ReportService
from app.services.storage import (
    LocalStorageBackend,
    S3StorageBackend,
    StorageObjectNotFound,
    get_storage_backend,
    reset_storage_backend_cache,
)


class _FakeS3Body:
    def __init__(self, data: bytes):
        self._buf = io.BytesIO(data)
        self.closed = False

    def read(self, amt: int = -1) -> bytes:
        return self._buf.read(amt)

    def iter_chunks(self, chunk_size: int = 1024 * 1024):
        while True:
            chunk = self._buf.read(chunk_size)
            if not chunk:
                break
            yield chunk

    def close(self) -> None:
        self.closed = True
        self._buf.close()


class _FakeClientError(Exception):
    def __init__(self, code: str, status_code: int = 404):
        super().__init__(code)
        self.response = {
            "Error": {"Code": code, "Message": code},
            "ResponseMetadata": {"HTTPStatusCode": status_code},
        }


class FakeS3Client:
    """In-memory S3-compatible client simulating boto3's S3 client surface."""

    def __init__(self):
        self.objects: dict[tuple[str, str], dict] = {}
        self.fail_writes = False

    def put_object(self, Bucket: str, Key: str, Body: bytes, ContentType: str | None = None):
        if self.fail_writes:
            raise RuntimeError("Simulated S3 outage")
        data = bytes(Body)
        # Deliberately set a non-SHA256 ETag (MD5-like) to verify SHA-256 never trusts ETag
        self.objects[(Bucket, Key)] = {
            "data": data,
            "ContentType": ContentType,
            "ETag": f'"{hashlib.md5(data).hexdigest()}"',
        }
        return {"ETag": self.objects[(Bucket, Key)]["ETag"]}

    def upload_file(self, Filename: str, Bucket: str, Key: str, ExtraArgs: dict | None = None):
        data = Path(Filename).read_bytes()
        content_type = (ExtraArgs or {}).get("ContentType")
        self.put_object(Bucket=Bucket, Key=Key, Body=data, ContentType=content_type)

    def get_object(self, Bucket: str, Key: str):
        entry = self.objects.get((Bucket, Key))
        if entry is None:
            raise _FakeClientError("NoSuchKey", 404)
        return {"Body": _FakeS3Body(entry["data"]), "ETag": entry["ETag"]}

    def head_object(self, Bucket: str, Key: str):
        entry = self.objects.get((Bucket, Key))
        if entry is None:
            raise _FakeClientError("404", 404)
        return {"ContentLength": len(entry["data"]), "ETag": entry["ETag"]}

    def delete_object(self, Bucket: str, Key: str):
        self.objects.pop((Bucket, Key), None)
        return {}


def _make_jpeg_bytes(color=(180, 90, 40), size=(64, 64)) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=color)
    img.save(buf, format="JPEG", quality=92)
    return buf.getvalue()


def test_local_storage_backend_crud_and_traversal(tmp_path: Path):
    backend = LocalStorageBackend(root_dir=tmp_path / "evidence")
    payload = b"forensic-local-bytes"
    stored_ref = backend.put_bytes("evidence/sample.bin", payload)
    assert Path(stored_ref).exists()
    assert backend.exists("evidence/sample.bin")
    assert backend.get_bytes("evidence/sample.bin") == payload
    assert b"".join(backend.open_stream("evidence/sample.bin", chunk_size=5)) == payload
    assert backend.compute_sha256("evidence/sample.bin") == hashlib.sha256(payload).hexdigest()

    downloaded = backend.download_to_file("evidence/sample.bin", tmp_path / "out.bin")
    assert downloaded.read_bytes() == payload

    with backend.local_file_path("evidence/sample.bin") as local_path:
        assert local_path.read_bytes() == payload

    assert backend.health_check(".testhealth") is True
    assert backend.delete("evidence/sample.bin") is True
    assert not backend.exists("evidence/sample.bin")

    with pytest.raises(StorageObjectNotFound):
        backend.get_bytes("evidence/missing.bin")

    with pytest.raises(ValueError):
        backend.put_bytes("../escape.bin", b"bad")


def test_s3_storage_backend_crud_prefix_and_sha256_uses_bytes(tmp_path: Path):
    fake_client = FakeS3Client()
    backend = S3StorageBackend(
        bucket="forensight-prod",
        key_prefix="tenant-a",
        client=fake_client,
    )

    payload = b"forensic-s3-bitstream"
    ref = backend.put_bytes("evidence/item1.jpg", payload, content_type="image/jpeg")
    assert ref == "evidence/item1.jpg"
    assert ("forensight-prod", "tenant-a/evidence/item1.jpg") in fake_client.objects
    assert backend.exists("evidence/item1.jpg")
    assert backend.get_bytes("evidence/item1.jpg") == payload
    assert b"".join(backend.open_stream("evidence/item1.jpg", chunk_size=4)) == payload

    # Must match SHA-256 of actual bytes, NOT provider ETag (MD5)
    expected_sha256 = hashlib.sha256(payload).hexdigest()
    assert backend.compute_sha256("evidence/item1.jpg") == expected_sha256
    assert fake_client.objects[("forensight-prod", "tenant-a/evidence/item1.jpg")]["ETag"] != expected_sha256

    src_file = tmp_path / "upload.png"
    src_file.write_bytes(b"png-bytes")
    backend.put_file("analyses/ela/map.png", src_file, content_type="image/png")
    assert backend.get_bytes("analyses/ela/map.png") == b"png-bytes"

    with backend.local_file_path("evidence/item1.jpg") as materialized:
        assert materialized.exists()
        assert materialized.read_bytes() == payload
    assert not materialized.exists()

    assert backend.health_check(".probe") is True
    assert backend.delete("evidence/item1.jpg") is True
    assert not backend.exists("evidence/item1.jpg")

    with pytest.raises(StorageObjectNotFound):
        backend.get_bytes("evidence/does-not-exist.jpg")


def test_production_config_rejects_ephemeral_local_and_incomplete_s3(monkeypatch):
    # Valid baseline production settings
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", "x" * 64)
    monkeypatch.setattr(settings, "BACKEND_CORS_ORIGINS", "https://forensight.vercel.app")
    monkeypatch.setattr(settings, "DATABASE_URL", "postgresql://user:super_secret_db_987654@db.internal:5432/forensight")
    monkeypatch.setattr(settings, "CELERY_BROKER_URL", "rediss://:super_secret_redis_987654@redis.internal:6379/0")
    monkeypatch.setattr(settings, "CELERY_RESULT_BACKEND", "rediss://:super_secret_redis_987654@redis.internal:6379/0")
    monkeypatch.setattr(settings, "REDIS_URL", "rediss://:super_secret_redis_987654@redis.internal:6379/0")
    monkeypatch.setattr(settings, "ACCESS_TOKEN_EXPIRE_MINUTES", 15)
    monkeypatch.setattr(settings, "CASE_EXPORT_SIGNING_PRIVATE_KEY", "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=")
    monkeypatch.setattr(settings, "ALLOW_EPHEMERAL_LOCAL_STORAGE", False)

    # 1. Local storage must fail in production by default
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "local")
    with pytest.raises(RuntimeError, match="STORAGE_BACKEND='local' is not permitted in production"):
        validate_runtime_settings()

    # 2. Incomplete S3 config must fail clearly
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "s3")
    monkeypatch.setattr(settings, "S3_BUCKET", "")
    monkeypatch.setattr(settings, "S3_ACCESS_KEY_ID", "")
    monkeypatch.setattr(settings, "S3_SECRET_ACCESS_KEY", "")
    with pytest.raises(RuntimeError, match="S3_BUCKET must be configured"):
        validate_runtime_settings()

    # 3. Invalid endpoint URL must fail clearly
    monkeypatch.setattr(settings, "S3_BUCKET", "forensight-bucket")
    monkeypatch.setattr(settings, "S3_ACCESS_KEY_ID", "access-key")
    monkeypatch.setattr(settings, "S3_SECRET_ACCESS_KEY", "secret-key")
    monkeypatch.setattr(settings, "S3_ENDPOINT_URL", "ftp://invalid-endpoint")
    with pytest.raises(RuntimeError, match="S3_ENDPOINT_URL must be a valid"):
        validate_runtime_settings()

    # 4. Complete S3 config passes production validation
    monkeypatch.setattr(settings, "S3_ENDPOINT_URL", "https://r2.example.cloudflarestorage.com")
    validate_runtime_settings()


@pytest.fixture
def s3_e2e_env(tmp_path: Path, monkeypatch):
    fake_client = FakeS3Client()
    s3_backend = S3StorageBackend(
        bucket="forensight-test-bucket",
        key_prefix="e2e",
        client=fake_client,
    )

    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "s3")
    monkeypatch.setattr(settings, "STORAGE_DIR", str(tmp_path / "ephemeral_unused"))
    monkeypatch.setattr(settings, "S3_BUCKET", "forensight-test-bucket")
    monkeypatch.setattr(settings, "S3_ACCESS_KEY_ID", "test-key")
    monkeypatch.setattr(settings, "S3_SECRET_ACCESS_KEY", "test-secret")
    monkeypatch.setattr(settings, "CASE_EXPORT_SIGNING_PRIVATE_KEY", "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=")

    reset_storage_backend_cache()
    import app.services.storage as storage_mod
    monkeypatch.setattr(storage_mod, "get_storage_backend", lambda: s3_backend)
    monkeypatch.setattr("app.services.evidence.get_storage_backend", lambda: s3_backend)
    monkeypatch.setattr("app.api.cases.get_storage_backend", lambda: s3_backend)
    monkeypatch.setattr("app.services.custody.get_storage_backend", lambda: s3_backend)
    monkeypatch.setattr("app.api.health.get_storage_backend", lambda: s3_backend)
    monkeypatch.setattr("app.services.reports.get_storage_backend", lambda: s3_backend)
    monkeypatch.setattr("app.api.reports.get_storage_backend", lambda: s3_backend)
    monkeypatch.setattr("app.api.analysis.get_storage_backend", lambda: s3_backend)
    monkeypatch.setattr("app.services.case_export.get_storage_backend", lambda: s3_backend)
    monkeypatch.setattr("app.services.lineage.get_storage_backend", lambda: s3_backend)
    monkeypatch.setattr("app.services.c2pa_provenance.get_storage_backend", lambda: s3_backend)
    monkeypatch.setattr("app.services.cross_correlation.get_storage_backend", lambda: s3_backend)

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def _override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    db = TestingSessionLocal()
    user = User(
        username="s3_investigator",
        hashed_password=get_password_hash("StrongPassword!123"),
        role="INVESTIGATOR",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.username, "role": user.role, "uid": user.id})
    client = TestClient(app)
    client.cookies.set("fs_access", token)
    client.cookies.set("fs_csrf", "csrf-token-123")
    headers = {"X-CSRF-Token": "csrf-token-123"}

    try:
        yield {
            "client": client,
            "headers": headers,
            "db": db,
            "user": user,
            "s3_client": fake_client,
            "s3_backend": s3_backend,
            "ephemeral_dir": tmp_path / "ephemeral_unused",
        }
    finally:
        db.close()
        app.dependency_overrides.clear()
        reset_storage_backend_cache()


def test_s3_end_to_end_evidence_custody_analysis_report_export_and_health(s3_e2e_env):
    client: TestClient = s3_e2e_env["client"]
    headers = s3_e2e_env["headers"]
    db = s3_e2e_env["db"]
    fake_client: FakeS3Client = s3_e2e_env["s3_client"]

    # 1. Health & readiness check S3
    health_resp = client.get("/api/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["storage"] == "healthy"
    assert client.get("/api/ready").status_code == 200

    # Outage should surface unhealthy / 503
    fake_client.fail_writes = True
    assert client.get("/api/health").json()["storage"] == "unhealthy"
    assert client.get("/api/ready").status_code == 503
    fake_client.fail_writes = False

    # 2. Upload evidence -> stored in S3, NOT local STORAGE_DIR
    jpg_bytes = _make_jpeg_bytes()
    expected_sha = hashlib.sha256(jpg_bytes).hexdigest()
    intake_resp = client.post(
        "/api/cases/intake",
        files={"file": ("suspect_photo.jpg", jpg_bytes, "image/jpeg")},
        data={"case_title": "S3 Cloud Case"},
        headers=headers,
    )
    assert intake_resp.status_code == 200, intake_resp.text
    ev_data = intake_resp.json()
    from app.models.domain import Evidence
    ev_row = db.query(Evidence).filter(Evidence.id == ev_data["id"]).first()
    assert ev_row is not None
    assert ev_row.stored_path.startswith("evidence/")
    assert ev_data["sha256_hash"] == expected_sha
    assert not s3_e2e_env["ephemeral_dir"].exists()

    # 3. Raw evidence download streams exact bytes from S3
    raw_resp = client.get(f"/api/evidence/{ev_data['id']}/raw")
    assert raw_resp.status_code == 200
    assert raw_resp.content == jpg_bytes

    # 4. Chain of custody verifies SHA-256 over S3 bytes
    custody_ok = CustodyService.verify_evidence_integrity(db, ev_row, verifier="s3_investigator")
    assert custody_ok.integrity_intact is True
    assert custody_ok.status == "VERIFIED_INTACT"
    assert custody_ok.current_disk_sha256_hash == expected_sha

    # 5. Run Metadata & ELA analysis via API against S3 evidence, serve ELA artifact from S3
    meta_resp = client.post(f"/api/evidence/{ev_row.id}/analysis/metadata", headers=headers)
    assert meta_resp.status_code == 200, meta_resp.text
    assert meta_resp.json()["status"] == "completed"
    ela_resp = client.post(f"/api/evidence/{ev_row.id}/analysis/ela", headers=headers)
    assert ela_resp.status_code == 200, ela_resp.text
    ela_data = ela_resp.json()
    assert ela_data["status"] == "completed"
    ela_art_key = ela_data["structured_findings"]["artifacts"]["ela_map"]
    assert ela_art_key.startswith("analyses/ela/")
    art_resp = client.get(f"/api/artifacts/{ela_art_key}")
    assert art_resp.status_code == 200
    assert art_resp.headers["content-type"].startswith("image/")
    assert len(art_resp.content) > 0

    # 5b. Lineage, C2PA provenance, and Cross-Correlation work with S3-backed evidence
    from app.services.lineage import LineageService
    from app.services.c2pa_provenance import inspect_c2pa
    from app.services.cross_correlation import CrossCorrelationService
    case_row = db.query(InvestigationCase).filter(InvestigationCase.id == ev_row.case_id).first()
    lineage_summary = LineageService.refresh_case(db, case_row)
    assert lineage_summary["evidence_count"] == 1
    c2pa_res = inspect_c2pa(ev_row)
    # C2PA inspection returns ABSENT when the SDK successfully scans an asset with no embedded
    # credentials, or SDK_UNAVAILABLE when the optional C2PA binary library is not installed.
    assert c2pa_res["credential_status"] in {"ABSENT", "SDK_UNAVAILABLE"}
    corr_res = CrossCorrelationService.evaluate_case(db, case_row)
    assert corr_res.case_identifier == case_row.case_identifier

    # 6. Generate JSON report -> stored in S3 & downloadable via /api/reports/{id}/download
    report = ReportService.generate_case_report(db, case_row.case_identifier, report_format="json", author_username="s3_investigator")
    assert report.artifact_path.startswith("reports/")
    dl_resp = client.get(f"/api/reports/{report.report_identifier}/download")
    assert dl_resp.status_code == 200
    parsed_report = json.loads(dl_resp.content.decode("utf-8"))
    assert parsed_report["report_identifier"] == report.report_identifier

    # 7. Export .forensight archive pulling evidence, artifacts, and reports from S3
    archive_path, details = CaseExportService.create_bundle(db, case_row)
    try:
        assert details["entry_count"] >= 4  # evidence + artifacts + report + case.json
        assert details["omitted_artifact_count"] == 0
        with zipfile.ZipFile(archive_path, "r") as zf:
            names = set(zf.namelist())
            assert "case.json" in names
            assert "manifest.json" in names
            assert "manifest.sig" in names
            assert any(n.startswith("evidence/") for n in names)
            assert any(n.startswith("artifacts/") for n in names)
            assert any(n.startswith("reports/") for n in names)
    finally:
        if os.path.exists(archive_path):
            os.remove(archive_path)

    # 8. Tamper with S3 object bytes -> Custody check MUST detect tamper
    s3_key = f"e2e/{ev_row.stored_path}"
    fake_client.objects[("forensight-test-bucket", s3_key)]["data"] = jpg_bytes + b"tamper"
    custody_tamper = CustodyService.verify_evidence_integrity(db, ev_row, verifier="s3_investigator")
    assert custody_tamper.integrity_intact is False
    assert custody_tamper.status == "TAMPER_OR_BITROT_DETECTED"


def test_storage_dir_override_isolation_nesting_exceptions_and_cancellation(tmp_path: Path):
    import asyncio
    import contextvars
    import threading
    from app.core.config import storage_dir_override

    original = settings.STORAGE_DIR
    dir_a = str(tmp_path / "ctx_a")
    dir_b = str(tmp_path / "ctx_b")

    # 1. Override changes settings.STORAGE_DIR only inside its context
    assert settings.STORAGE_DIR == original
    with storage_dir_override(dir_a):
        assert settings.STORAGE_DIR == dir_a
        assert settings.configured_storage_dir() == original

        # 4. Nested overrides restore the correct previous value
        with storage_dir_override(dir_b):
            assert settings.STORAGE_DIR == dir_b
        assert settings.STORAGE_DIR == dir_a
    assert settings.STORAGE_DIR == original

    # 5. Exceptions restore the context correctly
    with pytest.raises(RuntimeError, match="boom"):
        with storage_dir_override(dir_a):
            assert settings.STORAGE_DIR == dir_a
            raise RuntimeError("boom")
    assert settings.STORAGE_DIR == original

    # 6. Cancellation (BaseException) does not leak the override
    with pytest.raises(asyncio.CancelledError):
        with storage_dir_override(dir_a):
            assert settings.STORAGE_DIR == dir_a
            raise asyncio.CancelledError()
    assert settings.STORAGE_DIR == original

    # 2 & 7. Independent thread sees original; explicit copy_context() propagates override
    entered = threading.Event()
    release = threading.Event()
    observed_independent = []
    observed_propagated = []

    def _independent_reader():
        entered.wait(timeout=5)
        observed_independent.append(settings.STORAGE_DIR)
        release.set()

    with storage_dir_override(dir_a):
        t_indep = threading.Thread(target=_independent_reader)
        t_indep.start()
        entered.set()
        release.wait(timeout=5)
        t_indep.join(timeout=5)

        ctx = contextvars.copy_context()
        t_prop = threading.Thread(target=ctx.run, args=(lambda: observed_propagated.append(settings.STORAGE_DIR),))
        t_prop.start()
        t_prop.join(timeout=5)

    assert observed_independent == [original]
    assert observed_propagated == [dir_a]
    assert settings.STORAGE_DIR == original


def test_storage_backend_caching_unaffected_by_override(tmp_path: Path, monkeypatch):
    from app.core.config import storage_dir_override

    monkeypatch.setattr(settings, "STORAGE_BACKEND", "local")
    monkeypatch.setattr(settings, "STORAGE_DIR", str(tmp_path / "configured_root"))
    reset_storage_backend_cache()
    try:
        baseline_backend = get_storage_backend()
        with storage_dir_override(str(tmp_path / "temp_override")):
            assert settings.STORAGE_DIR == str(tmp_path / "temp_override")
            during_backend = get_storage_backend()
            assert during_backend is baseline_backend
        after_backend = get_storage_backend()
        assert after_backend is baseline_backend
    finally:
        reset_storage_backend_cache()


def test_concurrent_legacy_analyzers_use_distinct_temp_dirs_without_global_lock(tmp_path: Path, monkeypatch):
    import threading
    from types import SimpleNamespace
    from app.services.storage import run_legacy_analyzer_with_storage
    import app.services.storage as storage_mod

    fake_client = FakeS3Client()
    s3_backend = S3StorageBackend(bucket="concurrent-bucket", client=fake_client)
    s3_backend.put_bytes("evidence/a.jpg", _make_jpeg_bytes(color=(10, 20, 30)), content_type="image/jpeg")
    s3_backend.put_bytes("evidence/b.jpg", _make_jpeg_bytes(color=(40, 50, 60)), content_type="image/jpeg")

    monkeypatch.setattr(settings, "STORAGE_BACKEND", "s3")
    monkeypatch.setattr(settings, "STORAGE_DIR", str(tmp_path / "configured_root"))
    monkeypatch.setattr(storage_mod, "get_storage_backend", lambda: s3_backend)

    # Barrier(2) proves both legacy analyzers run concurrently in parallel (no global lock)
    both_entered = threading.Barrier(2, timeout=5)
    observed_dirs: dict[int, str] = {}
    observed_paths: dict[int, str] = {}

    class _MockAnalyzer:
        @staticmethod
        def run_analysis(db_proxy, evidence_id: int):
            ev = db_proxy.query(Evidence).filter(Evidence.id == evidence_id).first()
            observed_paths[evidence_id] = ev.stored_path
            observed_dirs[evidence_id] = settings.STORAGE_DIR
            out_dir = Path(settings.STORAGE_DIR) / "analyses" / "ela"
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / f"map_{evidence_id}.png").write_bytes(b"png")
            both_entered.wait()
            return SimpleNamespace(id=evidence_id, status="completed")

    from app.models.domain import Evidence

    class _FakeQuery:
        def __init__(self, row):
            self._row = row

        def filter(self, *args, **kwargs):
            return self

        def first(self):
            return self._row

    class _FakeDB:
        def __init__(self, ev_id: int, stored_path: str):
            self._row = SimpleNamespace(id=ev_id, stored_path=stored_path)

        def query(self, model):
            assert model is Evidence
            return _FakeQuery(self._row)

    results = {}
    errors = []

    def _worker(ev_id: int, key: str):
        try:
            results[ev_id] = run_legacy_analyzer_with_storage(_FakeDB(ev_id, key), ev_id, _MockAnalyzer, "ela")
        except Exception as exc:
            errors.append(exc)

    t1 = threading.Thread(target=_worker, args=(1, "evidence/a.jpg"))
    t2 = threading.Thread(target=_worker, args=(2, "evidence/b.jpg"))
    t1.start()
    t2.start()
    t1.join(timeout=10)
    t2.join(timeout=10)

    assert not errors
    assert len(results) == 2
    assert observed_dirs[1] != observed_dirs[2]
    assert observed_dirs[1] != str(tmp_path / "configured_root")
    assert observed_paths[1] != observed_paths[2]
    assert settings.STORAGE_DIR == str(tmp_path / "configured_root")
    assert s3_backend.exists("analyses/ela/map_1.png")
    assert s3_backend.exists("analyses/ela/map_2.png")


def test_repeated_celery_style_tasks_do_not_leak_storage_context(tmp_path: Path, monkeypatch):
    from types import SimpleNamespace
    from app.services.storage import run_legacy_analyzer_with_storage
    import app.services.storage as storage_mod

    fake_client = FakeS3Client()
    s3_backend = S3StorageBackend(bucket="celery-bucket", client=fake_client)
    s3_backend.put_bytes("evidence/t1.jpg", _make_jpeg_bytes(), content_type="image/jpeg")

    configured = str(tmp_path / "configured_root")
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "s3")
    monkeypatch.setattr(settings, "STORAGE_DIR", configured)
    monkeypatch.setattr(storage_mod, "get_storage_backend", lambda: s3_backend)

    from app.models.domain import Evidence

    class _FakeDB:
        def query(self, model):
            return SimpleNamespace(
                filter=lambda *a, **k: SimpleNamespace(
                    first=lambda: SimpleNamespace(id=1, stored_path="evidence/t1.jpg")
                )
            )

    class _FailingAnalyzer:
        @staticmethod
        def run_analysis(db_proxy, evidence_id: int):
            assert settings.STORAGE_DIR != configured
            raise RuntimeError("task 1 failed")

    with pytest.raises(RuntimeError, match="task 1 failed"):
        run_legacy_analyzer_with_storage(_FakeDB(), 1, _FailingAnalyzer, "ela")

    # Task 2 must see the clean configured directory
    assert settings.STORAGE_DIR == configured
