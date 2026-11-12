from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
from abc import ABC, abstractmethod
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

from app.core.config import settings, storage_dir_override


class StorageObjectNotFound(FileNotFoundError):
    """Raised when a requested object key does not exist in the configured storage backend."""


class StorageConfigurationError(RuntimeError):
    """Raised when the storage backend is misconfigured or missing required dependencies."""


def normalize_storage_key(raw_key: str) -> str:
    """Validate and normalize a logical storage key to POSIX form without traversal."""
    if not raw_key or "\0" in raw_key:
        raise ValueError("Invalid storage key")
    cleaned = raw_key.replace("\\", "/").strip()
    parts = [part for part in cleaned.split("/") if part and part != "."]
    if not parts or any(part == ".." for part in parts):
        raise ValueError(f"Unsafe storage key: {raw_key}")
    return "/".join(parts)


def is_s3_backend_name(name: Optional[str] = None) -> bool:
    backend = (name if name is not None else settings.STORAGE_BACKEND or "local").strip().lower()
    return backend in {"s3", "s3-compatible", "s3_compatible"}


class StorageBackend(ABC):
    """Abstract persistent storage backend for evidence, analysis artifacts, and reports."""

    backend_name: str = "base"
    is_remote: bool = False

    @abstractmethod
    def put_bytes(self, key: str, data: bytes, content_type: Optional[str] = None) -> str:
        """Store raw bytes under `key` and return the canonical storage reference."""

    @abstractmethod
    def put_file(self, key: str, local_path: str | Path, content_type: Optional[str] = None) -> str:
        """Store an existing local file under `key` and return the canonical storage reference."""

    @abstractmethod
    def get_bytes(self, key: str) -> bytes:
        """Read and return the complete byte contents for `key`."""

    @abstractmethod
    def open_stream(self, key: str, chunk_size: int = 1024 * 1024) -> Iterator[bytes]:
        """Yield chunks of bytes for `key` without buffering the whole object in memory."""

    @abstractmethod
    def download_to_file(self, key: str, dest_path: str | Path) -> Path:
        """Write the contents of `key` to `dest_path` and return `Path(dest_path)`."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        """Return True if `key` exists in storage."""

    @abstractmethod
    def delete(self, key: str) -> bool:
        """Delete `key` if present. Return True if an object was removed or did not exist."""

    @abstractmethod
    def health_check(self, probe_name: str = ".healthcheck") -> bool:
        """Verify read/write/delete connectivity against the storage backend."""

    def compute_sha256(self, key: str) -> str:
        """Compute cryptographic SHA-256 over the actual stored byte stream (never provider ETags)."""
        digest = hashlib.sha256()
        for chunk in self.open_stream(key):
            digest.update(chunk)
        return digest.hexdigest()

    @abstractmethod
    @contextmanager
    def local_file_path(self, key: str, suffix: str = "") -> Iterator[Path]:
        """Yield a readable local filesystem Path for `key`, cleaning up any temp download on exit."""

    def sync_directory_to_storage(self, local_dir: str | Path, key_prefix: str) -> None:
        """Upload all files in `local_dir` under `key_prefix` when using a remote backend."""
        if not self.is_remote:
            return
        base = Path(local_dir)
        if not base.exists():
            return
        prefix = normalize_storage_key(key_prefix)
        for path in base.rglob("*"):
            if path.is_file():
                rel = path.relative_to(base).as_posix()
                self.put_file(f"{prefix}/{rel}", path)


class LocalStorageBackend(StorageBackend):
    """Local filesystem storage backend for development and testing."""

    backend_name = "local"
    is_remote = False

    def __init__(self, root_dir: str | Path | None = None):
        self.root_dir = Path(root_dir if root_dir is not None else settings.STORAGE_DIR).resolve()

    def _resolve_target(self, key: str) -> Path:
        raw = str(key or "").strip()
        if not raw or "\0" in raw:
            raise ValueError("Invalid storage key")

        candidate_raw = Path(raw)
        if candidate_raw.is_absolute():
            resolved = candidate_raw.resolve()
            return resolved

        norm = normalize_storage_key(raw)
        if norm.startswith("evidence/"):
            return (self.root_dir / norm[len("evidence/") :]).resolve()
        if norm.startswith("reports/"):
            return (self.root_dir.parent / norm).resolve()
        return (self.root_dir / norm).resolve()

    def _resolve_existing(self, key: str) -> Optional[Path]:
        raw = str(key or "").strip()
        if not raw or "\0" in raw:
            return None

        # Check direct path (absolute or relative to CWD) for legacy DB records
        direct = Path(raw)
        if direct.is_file():
            return direct.resolve()

        try:
            mapped = self._resolve_target(raw)
            if mapped.is_file():
                return mapped
        except ValueError:
            return None

        # Fallback: basename inside root_dir for legacy evidence records
        try:
            norm = normalize_storage_key(raw)
        except ValueError:
            return None
        fallback = (self.root_dir / Path(norm).name).resolve()
        if fallback.is_file():
            return fallback
        return None

    def put_bytes(self, key: str, data: bytes, content_type: Optional[str] = None) -> str:
        target = self._resolve_target(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=target.parent, prefix=".tmp-", suffix=".part", delete=False
        ) as staged:
            staged_path = Path(staged.name)
            staged.write(data)
            staged.flush()
            os.fsync(staged.fileno())
        os.replace(staged_path, target)
        return str(target)

    def put_file(self, key: str, local_path: str | Path, content_type: Optional[str] = None) -> str:
        src = Path(local_path)
        if not src.is_file():
            raise StorageObjectNotFound(f"Source file not found: {local_path}")
        target = self._resolve_target(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        if src.resolve() != target.resolve():
            with tempfile.NamedTemporaryFile(
                mode="wb", dir=target.parent, prefix=".tmp-", suffix=".part", delete=False
            ) as staged:
                staged_path = Path(staged.name)
            shutil.copyfile(src, staged_path)
            os.replace(staged_path, target)
        return str(target)

    def get_bytes(self, key: str) -> bytes:
        path = self._resolve_existing(key)
        if not path:
            raise StorageObjectNotFound(f"Object not found in local storage: {key}")
        return path.read_bytes()

    def open_stream(self, key: str, chunk_size: int = 1024 * 1024) -> Iterator[bytes]:
        path = self._resolve_existing(key)
        if not path:
            raise StorageObjectNotFound(f"Object not found in local storage: {key}")
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    def download_to_file(self, key: str, dest_path: str | Path) -> Path:
        path = self._resolve_existing(key)
        if not path:
            raise StorageObjectNotFound(f"Object not found in local storage: {key}")
        dest = Path(dest_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if path.resolve() != dest.resolve():
            shutil.copyfile(path, dest)
        return dest

    def exists(self, key: str) -> bool:
        return self._resolve_existing(key) is not None

    def delete(self, key: str) -> bool:
        path = self._resolve_existing(key)
        if path is None:
            return True
        path.unlink(missing_ok=True)
        return True

    def health_check(self, probe_name: str = ".healthcheck") -> bool:
        self.root_dir.mkdir(parents=True, exist_ok=True)
        probe_path = self.root_dir / probe_name
        probe_path.write_text("ok", encoding="utf-8")
        try:
            return probe_path.is_file() and probe_path.read_text(encoding="utf-8") == "ok"
        finally:
            probe_path.unlink(missing_ok=True)

    @contextmanager
    def local_file_path(self, key: str, suffix: str = "") -> Iterator[Path]:
        path = self._resolve_existing(key)
        if not path:
            raise StorageObjectNotFound(f"Object not found in local storage: {key}")
        yield path


class S3StorageBackend(StorageBackend):
    """S3-compatible object storage backend (AWS S3, Cloudflare R2, Backblaze B2, MinIO)."""

    backend_name = "s3"
    is_remote = True

    def __init__(
        self,
        bucket: str,
        access_key_id: str = "",
        secret_access_key: str = "",
        endpoint_url: str = "",
        region: str = "auto",
        key_prefix: str = "",
        addressing_style: str = "auto",
        client: Any = None,
    ):
        self.bucket = bucket.strip()
        if not self.bucket:
            raise StorageConfigurationError("S3_BUCKET must be configured for S3 storage backend")
        self.key_prefix = key_prefix.strip().strip("/")
        self._client = client
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._endpoint_url = endpoint_url.strip() or None
        self._region = (region or "auto").strip()
        self._addressing_style = (addressing_style or "auto").strip().lower()

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        try:
            import boto3
            from botocore.config import Config as BotoConfig
        except ImportError as exc:
            raise StorageConfigurationError(
                "boto3 is required when STORAGE_BACKEND=s3. Install boto3 from backend/requirements.txt."
            ) from exc

        s3_cfg_kwargs: dict[str, Any] = {}
        if self._addressing_style in {"path", "virtual"}:
            s3_cfg_kwargs["s3"] = {"addressing_style": self._addressing_style}

        boto_config = BotoConfig(
            signature_version="s3v4",
            retries={"max_attempts": 3, "mode": "standard"},
            **s3_cfg_kwargs,
        )
        kwargs: dict[str, Any] = {
            "service_name": "s3",
            "aws_access_key_id": self._access_key_id,
            "aws_secret_access_key": self._secret_access_key,
            "region_name": self._region,
            "config": boto_config,
        }
        if self._endpoint_url:
            kwargs["endpoint_url"] = self._endpoint_url
        self._client = boto3.client(**kwargs)
        return self._client

    def _object_key(self, key: str) -> str:
        norm = normalize_storage_key(key)
        if self.key_prefix:
            return f"{self.key_prefix}/{norm}"
        return norm

    @staticmethod
    def _is_not_found_error(exc: Exception) -> bool:
        if isinstance(exc, FileNotFoundError):
            return True
        response = getattr(exc, "response", None)
        if isinstance(response, dict):
            code = str(response.get("Error", {}).get("Code", "")).strip()
            status_code = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
            if code in {"404", "NoSuchKey", "NotFound"} or status_code == 404:
                return True
        return False

    def put_bytes(self, key: str, data: bytes, content_type: Optional[str] = None) -> str:
        norm_key = normalize_storage_key(key)
        object_key = self._object_key(norm_key)
        extra: dict[str, Any] = {"Bucket": self.bucket, "Key": object_key, "Body": data}
        if content_type:
            extra["ContentType"] = content_type
        self._get_client().put_object(**extra)
        return norm_key

    def put_file(self, key: str, local_path: str | Path, content_type: Optional[str] = None) -> str:
        src = Path(local_path)
        if not src.is_file():
            raise StorageObjectNotFound(f"Source file not found: {local_path}")
        norm_key = normalize_storage_key(key)
        object_key = self._object_key(norm_key)
        extra_args = {"ContentType": content_type} if content_type else None
        client = self._get_client()
        if hasattr(client, "upload_file"):
            if extra_args:
                client.upload_file(str(src), self.bucket, object_key, ExtraArgs=extra_args)
            else:
                client.upload_file(str(src), self.bucket, object_key)
        else:
            self.put_bytes(norm_key, src.read_bytes(), content_type=content_type)
        return norm_key

    def get_bytes(self, key: str) -> bytes:
        object_key = self._object_key(key)
        try:
            resp = self._get_client().get_object(Bucket=self.bucket, Key=object_key)
        except Exception as exc:
            if self._is_not_found_error(exc):
                raise StorageObjectNotFound(f"Object not found in S3 storage: {key}") from exc
            raise
        body = resp["Body"]
        try:
            return body.read()
        finally:
            if hasattr(body, "close"):
                body.close()

    def open_stream(self, key: str, chunk_size: int = 1024 * 1024) -> Iterator[bytes]:
        object_key = self._object_key(key)
        try:
            resp = self._get_client().get_object(Bucket=self.bucket, Key=object_key)
        except Exception as exc:
            if self._is_not_found_error(exc):
                raise StorageObjectNotFound(f"Object not found in S3 storage: {key}") from exc
            raise
        body = resp["Body"]
        try:
            if hasattr(body, "iter_chunks"):
                for chunk in body.iter_chunks(chunk_size=chunk_size):
                    if chunk:
                        yield chunk
            else:
                while True:
                    chunk = body.read(chunk_size)
                    if not chunk:
                        break
                    yield chunk
        finally:
            if hasattr(body, "close"):
                body.close()

    def download_to_file(self, key: str, dest_path: str | Path) -> Path:
        dest = Path(dest_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("wb") as handle:
            for chunk in self.open_stream(key):
                handle.write(chunk)
        return dest

    def exists(self, key: str) -> bool:
        try:
            object_key = self._object_key(key)
        except ValueError:
            return False
        try:
            self._get_client().head_object(Bucket=self.bucket, Key=object_key)
            return True
        except Exception as exc:
            if self._is_not_found_error(exc):
                return False
            raise

    def delete(self, key: str) -> bool:
        object_key = self._object_key(key)
        self._get_client().delete_object(Bucket=self.bucket, Key=object_key)
        return True

    def health_check(self, probe_name: str = ".healthcheck") -> bool:
        probe_key = f"_health/{probe_name.lstrip('.')}"
        self.put_bytes(probe_key, b"ok", content_type="text/plain")
        try:
            return self.get_bytes(probe_key) == b"ok"
        finally:
            try:
                self.delete(probe_key)
            except Exception:
                pass

    @contextmanager
    def local_file_path(self, key: str, suffix: str = "") -> Iterator[Path]:
        norm = normalize_storage_key(key)
        inferred_suffix = suffix or Path(norm).suffix
        fd, tmp_name = tempfile.mkstemp(prefix="forensight-obj-", suffix=inferred_suffix)
        os.close(fd)
        tmp_path = Path(tmp_name)
        try:
            self.download_to_file(norm, tmp_path)
            yield tmp_path
        finally:
            tmp_path.unlink(missing_ok=True)


_cached_backend: Optional[StorageBackend] = None
_cached_signature: Optional[tuple] = None


def _settings_signature() -> tuple:
    return (
        (settings.STORAGE_BACKEND or "local").strip().lower(),
        settings.configured_storage_dir(),
        settings.S3_BUCKET,
        settings.S3_ENDPOINT_URL,
        settings.S3_REGION,
        settings.S3_ACCESS_KEY_ID,
        settings.S3_SECRET_ACCESS_KEY,
        settings.S3_KEY_PREFIX,
        settings.S3_ADDRESSING_STYLE,
    )


def reset_storage_backend_cache() -> None:
    """Clear the cached storage backend singleton (primarily for tests)."""
    global _cached_backend, _cached_signature
    _cached_backend = None
    _cached_signature = None


def get_storage_backend() -> StorageBackend:
    """Return the configured StorageBackend, recreating it if settings changed."""
    global _cached_backend, _cached_signature
    sig = _settings_signature()
    if _cached_backend is not None and _cached_signature == sig:
        return _cached_backend

    if is_s3_backend_name(settings.STORAGE_BACKEND):
        backend: StorageBackend = S3StorageBackend(
            bucket=settings.S3_BUCKET,
            access_key_id=settings.S3_ACCESS_KEY_ID,
            secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            endpoint_url=settings.S3_ENDPOINT_URL,
            region=settings.S3_REGION,
            key_prefix=settings.S3_KEY_PREFIX,
            addressing_style=settings.S3_ADDRESSING_STYLE,
        )
    else:
        backend = LocalStorageBackend(root_dir=settings.configured_storage_dir())

    _cached_backend = backend
    _cached_signature = sig
    return backend


class _LocalEvidenceProxy:
    """Read-only Evidence proxy overriding stored_path to a materialized local file."""

    def __init__(self, evidence: Any, local_path: str):
        self._evidence = evidence
        self.stored_path = local_path

    def __getattr__(self, name: str) -> Any:
        return getattr(self._evidence, name)


class _LegacyEvidenceQueryProxy:
    def __init__(self, query: Any, local_path: str):
        self._query = query
        self._local_path = local_path

    def filter(self, *args: Any, **kwargs: Any) -> "_LegacyEvidenceQueryProxy":
        return _LegacyEvidenceQueryProxy(self._query.filter(*args, **kwargs), self._local_path)

    def first(self) -> Any:
        ev = self._query.first()
        if ev is None:
            return None
        return _LocalEvidenceProxy(ev, self._local_path)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._query, name)


class _LegacySessionProxy:
    """Session proxy that provides materialized local Evidence paths without dirtying ORM rows."""

    def __init__(self, db: Any, evidence_model: Any, local_path: str):
        self._db = db
        self._evidence_model = evidence_model
        self._local_path = local_path

    def query(self, *entities: Any, **kwargs: Any) -> Any:
        q = self._db.query(*entities, **kwargs)
        if len(entities) == 1 and entities[0] is self._evidence_model:
            return _LegacyEvidenceQueryProxy(q, self._local_path)
        return q

    def __getattr__(self, name: str) -> Any:
        return getattr(self._db, name)


def run_legacy_analyzer_with_storage(
    db: Any,
    evidence_id: int,
    analyzer_cls: Any,
    slug: str,
    **kwargs: Any,
) -> Any:
    """
    Execute a frozen legacy analyzer (`MetadataAnalyzer`, `ELAAnalyzer`, `NoiseAnalyzer`,
    `JPEGDCTAnalyzer`, `CopyMoveAnalyzer`) seamlessly against either local or remote storage
    without modifying the frozen analyzer source files.
    """
    storage = get_storage_backend()
    if not storage.is_remote:
        return analyzer_cls.run_analysis(db, evidence_id, **kwargs)

    from app.models.domain import Evidence

    evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not evidence:
        raise ValueError("Evidence not found")
    if not evidence.stored_path or not storage.exists(evidence.stored_path):
        raise ValueError("Evidence file is missing on disk")

    with storage.local_file_path(evidence.stored_path) as local_ev_path:
        with tempfile.TemporaryDirectory(prefix=f"forensight-{slug}-") as tmp_dir:
            session_proxy = _LegacySessionProxy(db, Evidence, str(local_ev_path))
            with storage_dir_override(tmp_dir):
                analysis = analyzer_cls.run_analysis(session_proxy, evidence_id, **kwargs)

            if slug != "metadata":
                out_subdir = os.path.join(tmp_dir, "analyses", slug)
                storage.sync_directory_to_storage(out_subdir, f"analyses/{slug}")
            return analysis

