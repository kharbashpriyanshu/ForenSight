import os
import uuid
import hashlib
import json
import logging
import datetime
import tempfile
import warnings
from typing import Optional, Dict, Any
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import FlushError
from app.models.domain import Evidence, EvidenceIntakeContext, InvestigationCase, IntakeIdempotencyRecord, FailedCleanupRecord, User
from app.db.database import SessionLocal
from app.services.audit import AuditService
from app.services.storage import get_storage_backend
from app.core.config import settings
from PIL import Image, UnidentifiedImageError
from PIL.Image import DecompressionBombError, DecompressionBombWarning

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


def compute_intake_fingerprint(
    file_sha256: str,
    case_id: Optional[str] = None,
    case_title: Optional[str] = None,
    intake_context: Optional[dict] = None,
) -> str:
    """
    Computes a deterministic SHA-256 fingerprint representing the logical intake request.
    Canonicalizes all meaningful request fields while excluding unstable values
    (e.g., timestamps, temporary filenames, database auto-increment IDs, or the idempotency key itself).
    """
    normalized_context = {}
    if intake_context:
        for k in sorted(intake_context.keys()):
            val = intake_context[k]
            if val is not None:
                cleaned = str(val).strip()
                if cleaned:
                    normalized_context[k] = cleaned

    canonical_payload = {
        "file_sha256": file_sha256.lower().strip(),
        "case_id": str(case_id).strip() if case_id and str(case_id).strip() else None,
        "case_title": str(case_title).strip() if case_title and str(case_title).strip() else None,
        "intake_context": normalized_context,
    }
    canonical_bytes = json.dumps(
        canonical_payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(canonical_bytes).hexdigest()


def _perform_cleanup(
    path: Optional[str],
    stage: str,
    db: Optional[Session] = None,
    idempotency_key: Optional[str] = None,
    user_id: Optional[int] = None,
) -> bool:
    """
    Safely unlinks a temporary or aborted evidence file.
    If an OSError occurs:
    1. Emits structured warning/error logs with diagnostic context (omitting sensitive file contents).
    2. Records a FailedCleanupRecord in an isolated session that survives parent rollback.
    Returns True if removed or non-existent, False if unlinking failed.
    """
    if not path:
        return True
    storage = get_storage_backend()
    if os.path.exists(path):
        try:
            os.remove(path)
            return True
        except OSError as exc:
            logger.error(
                f"Filesystem cleanup failed at stage '{stage}' for path '{path}': {type(exc).__name__}: {exc} "
                f"[idempotency_key={idempotency_key}, user_id={user_id}]",
                extra={
                    "cleanup_stage": stage,
                    "file_path": path,
                    "error_type": type(exc).__name__,
                    "error_message": str(exc),
                    "idempotency_key": idempotency_key,
                    "user_id": user_id,
                },
            )
            _record_failed_cleanup(path=path, stage=stage, exc=exc, db=db)
            return False

    if storage.is_remote and not os.path.isabs(path):
        try:
            storage.delete(path)
            return True
        except Exception as exc:
            logger.error(
                f"Remote object cleanup failed at stage '{stage}' for key '{path}': {type(exc).__name__}: {exc} "
                f"[idempotency_key={idempotency_key}, user_id={user_id}]",
            )
            _record_failed_cleanup(path=path, stage=stage, exc=exc, db=db)
            return False

    return True


def _record_failed_cleanup(path: str, stage: str, exc: Exception, db: Optional[Session] = None) -> None:
    """
    Persists a FailedCleanupRecord in an isolated session so it survives any parent rollback.
    Uses the engine bound to the current session or the default SessionLocal.
    """
    try:
        bind = db.get_bind() if db is not None else None
        if bind is not None:
            recovery_session = Session(bind=bind)
        else:
            recovery_session = SessionLocal()

        with recovery_session:
            record = FailedCleanupRecord(
                file_path=os.path.abspath(path),
                cleanup_stage=stage,
                error_message=str(exc)[:500],
                error_type=type(exc).__name__,
                resolved=False,
                retry_count=0,
            )
            recovery_session.add(record)
            recovery_session.commit()
    except Exception as log_err:
        logger.error(f"Failed to persist FailedCleanupRecord for {path}: {log_err}")

class EvidenceService:
    @staticmethod
    def process_and_store_evidence(db: Session, case_id: int, file: UploadFile, intake_context: dict = None) -> Evidence:
        case = db.query(InvestigationCase).filter(InvestigationCase.id == case_id).first()
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")
        if case.status and case.status.strip().lower() == "closed":
            raise HTTPException(status_code=400, detail="Cannot attach evidence to a closed investigation. Reopen the investigation dossier first.")

        original_filename = (file.filename or "evidence").replace("\\", "/").rsplit("/", 1)[-1]
        ext = os.path.splitext(original_filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Unsupported file extension. Allowed: .jpg, .jpeg, .png, .webp")

        claimed_mime = (file.content_type or "").split(";", 1)[0].strip().lower()
        if claimed_mime not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=400, detail="Unsupported MIME type. Allowed: image/jpeg, image/png, image/webp")

        sha256_hash = hashlib.sha256()
        file_size = 0
        try:
            file.file.seek(0)
        except (AttributeError, OSError):
            pass
        storage = get_storage_backend()
        storage_dir = tempfile.gettempdir() if storage.is_remote else os.path.abspath(settings.STORAGE_DIR)
        os.makedirs(storage_dir, exist_ok=True)
        staging_path = None
        final_path = None
        committed = False
        try:
            with tempfile.NamedTemporaryFile(mode="wb", dir=storage_dir, prefix=".ingest-", suffix=".part", delete=False) as staged:
                staging_path = staged.name
                while True:
                    chunk = file.file.read(1024 * 1024)
                    if not chunk:
                        break
                    file_size += len(chunk)
                    if file_size > settings.MAX_UPLOAD_SIZE:
                        raise HTTPException(status_code=413, detail="File too large")
                    sha256_hash.update(chunk)
                    staged.write(chunk)
                staged.flush()
                os.fsync(staged.fileno())

            if file_size == 0:
                raise HTTPException(status_code=400, detail="Empty file")

            with warnings.catch_warnings():
                warnings.simplefilter("error", DecompressionBombWarning)
                with Image.open(staging_path) as image:
                    width, height = image.size
                    image_format = (image.format or "").upper()
                    if width <= 0 or height <= 0 or width * height > settings.MAX_IMAGE_PIXELS:
                        raise HTTPException(status_code=413, detail="Image dimensions exceed the configured pixel limit")
                    image.verify()
                with Image.open(staging_path) as image:
                    image.load()

            expected_mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}.get(image_format)
            if expected_mime is None or expected_mime != claimed_mime:
                raise HTTPException(status_code=400, detail="Image contents do not match the supported format and declared MIME type")
            expected_extensions = {"JPEG": {".jpg", ".jpeg"}, "PNG": {".png"}, "WEBP": {".webp"}}
            if ext not in expected_extensions[image_format]:
                raise HTTPException(status_code=400, detail="Image contents do not match the filename extension")

            safe_filename = f"{uuid.uuid4().hex}{ext}"
            if storage.is_remote:
                final_path = storage.put_file(f"evidence/{safe_filename}", staging_path, content_type=expected_mime)
            else:
                final_path = os.path.join(storage_dir, safe_filename)
                os.replace(staging_path, final_path)
                staging_path = None

            db_evidence = Evidence(
                case_id=case_id,
                original_filename=original_filename,
                stored_path=final_path,
                mime_type=expected_mime,
                file_size=file_size,
                sha256_hash=sha256_hash.hexdigest(),
                image_format=image_format,
                width=width,
                height=height,
            )
            db.add(db_evidence)
            db.flush()
            safe_context = intake_context or {}
            if any(value and str(value).strip() for value in safe_context.values()):
                db.add(EvidenceIntakeContext(evidence_id=db_evidence.id, **safe_context))
            db.commit()
            committed = True
            db.refresh(db_evidence)
            return db_evidence
        except HTTPException:
            db.rollback()
            raise
        except (UnidentifiedImageError, SyntaxError, OSError, DecompressionBombError, DecompressionBombWarning):
            db.rollback()
            raise HTTPException(status_code=400, detail="Invalid or corrupted image file (unidentified, corrupted, or unsafe structure)") from None
        except Exception:
            db.rollback()
            raise
        finally:
            _perform_cleanup(staging_path, "staging_cleanup", db=db)
            if not committed:
                _perform_cleanup(final_path, "aborted_promotion_cleanup", db=db)

    @staticmethod
    def intake_evidence(
        db: Session,
        file: UploadFile,
        current_user: User,
        case_id: Optional[str] = None,
        case_title: Optional[str] = None,
        intake_context: Optional[dict] = None,
        idempotency_key: Optional[str] = None,
    ) -> Evidence:
        """
        Coordinated evidence intake lifecycle.
        Validates the evidence binary before creating any database record.
        Creates investigation case and evidence atomically if case_id is omitted.
        Guarantees that no empty/orphaned investigation case is left behind on upload failures.
        Enforces idempotency, detects conflicting submissions with HTTP 409, and records observable cleanups.
        """
        clean_key = idempotency_key.strip() if idempotency_key and idempotency_key.strip() else None

        # 1. Fast path extension & MIME pre-check
        original_filename = (file.filename or "evidence").replace("\\", "/").rsplit("/", 1)[-1]
        ext = os.path.splitext(original_filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Unsupported file extension. Allowed: .jpg, .jpeg, .png, .webp")

        claimed_mime = (file.content_type or "").split(";", 1)[0].strip().lower()
        if claimed_mime not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=400, detail="Unsupported MIME type. Allowed: image/jpeg, image/png, image/webp")

        # 2. Case verification if attaching to existing case
        target_case = None
        if case_id and str(case_id).strip():
            cid = str(case_id).strip()
            if not cid.isdigit():
                target_case = db.query(InvestigationCase).filter(InvestigationCase.case_identifier == cid).first()
            else:
                try:
                    target_case = db.query(InvestigationCase).filter(InvestigationCase.id == int(cid)).first()
                except ValueError:
                    target_case = None
            if not target_case:
                raise HTTPException(status_code=404, detail="Case not found")
            if current_user.role != "ADMIN" and target_case.user_id != current_user.id:
                raise HTTPException(status_code=403, detail="Not authorized to access this case")
            if target_case.status and target_case.status.strip().lower() == "closed":
                raise HTTPException(status_code=400, detail="Cannot attach evidence to a closed investigation. Reopen the investigation dossier first.")

        # 3. File staging & hashing (performed BEFORE any case is created)
        sha256_hash = hashlib.sha256()
        file_size = 0
        try:
            file.file.seek(0)
        except (AttributeError, OSError):
            pass
        storage = get_storage_backend()
        storage_dir = tempfile.gettempdir() if storage.is_remote else os.path.abspath(settings.STORAGE_DIR)
        os.makedirs(storage_dir, exist_ok=True)
        staging_path = None
        final_path = None
        committed = False
        request_fingerprint = None
        try:
            with tempfile.NamedTemporaryFile(mode="wb", dir=storage_dir, prefix=".ingest-", suffix=".part", delete=False) as staged:
                staging_path = staged.name
                while True:
                    chunk = file.file.read(1024 * 1024)
                    if not chunk:
                        break
                    file_size += len(chunk)
                    if file_size > settings.MAX_UPLOAD_SIZE:
                        raise HTTPException(status_code=413, detail="File too large")
                    sha256_hash.update(chunk)
                    staged.write(chunk)
                staged.flush()
                os.fsync(staged.fileno())

            if file_size == 0:
                raise HTTPException(status_code=400, detail="Empty file")

            file_sha256 = sha256_hash.hexdigest()

            # 4. Compute deterministic request fingerprint
            request_fingerprint = compute_intake_fingerprint(
                file_sha256=file_sha256,
                case_id=case_id,
                case_title=case_title,
                intake_context=intake_context,
            )

            # 5. Idempotency replay & conflict check
            if clean_key:
                existing_rec = db.query(IntakeIdempotencyRecord).filter(
                    IntakeIdempotencyRecord.idempotency_key == clean_key,
                    IntakeIdempotencyRecord.user_id == current_user.id,
                ).first()
                if existing_rec:
                    if existing_rec.request_fingerprint == request_fingerprint:
                        existing_ev = db.query(Evidence).filter(Evidence.id == existing_rec.evidence_id).first()
                        if existing_ev:
                            # Replay match: returns original evidence. staging_path is cleaned up in finally.
                            return existing_ev
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail="Idempotency key has already been used for a different intake request. Please initiate a fresh submission with a new key.",
                        )

            # 6. Pillow structural verification (read-only)
            with warnings.catch_warnings():
                warnings.simplefilter("error", DecompressionBombWarning)
                with Image.open(staging_path) as image:
                    width, height = image.size
                    image_format = (image.format or "").upper()
                    if width <= 0 or height <= 0 or width * height > settings.MAX_IMAGE_PIXELS:
                        raise HTTPException(status_code=413, detail="Image dimensions exceed the configured pixel limit")
                    image.verify()
                with Image.open(staging_path) as image:
                    image.load()

            expected_mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}.get(image_format)
            if expected_mime is None or expected_mime != claimed_mime:
                raise HTTPException(status_code=400, detail="Image contents do not match the supported format and declared MIME type")
            expected_extensions = {"JPEG": {".jpg", ".jpeg"}, "PNG": {".png"}, "WEBP": {".webp"}}
            if ext not in expected_extensions[image_format]:
                raise HTTPException(status_code=400, detail="Image contents do not match the filename extension")

            # Staging verified! Atomically rename to permanent path:
            safe_filename = f"{uuid.uuid4().hex}{ext}"
            if storage.is_remote:
                final_path = storage.put_file(f"evidence/{safe_filename}", staging_path, content_type=expected_mime)
            else:
                final_path = os.path.join(storage_dir, safe_filename)
                os.replace(staging_path, final_path)
                staging_path = None

            # 7. Atomic Database registration:
            if target_case is None:
                clean_name = os.path.splitext(original_filename)[0]
                assigned_title = case_title.strip() if case_title and case_title.strip() else f"Investigation: {clean_name}"
                target_case = InvestigationCase(
                    title=assigned_title,
                    user_id=current_user.id,
                    status="Open"
                )
                db.add(target_case)
                db.flush()
                AuditService.log_event(db, target_case.case_identifier, "CASE_CREATED", actor=current_user.username, auto_commit=False)

            db_evidence = Evidence(
                case_id=target_case.id,
                original_filename=original_filename,
                stored_path=final_path,
                mime_type=expected_mime,
                file_size=file_size,
                sha256_hash=file_sha256,
                image_format=image_format,
                width=width,
                height=height,
            )
            db.add(db_evidence)
            db.flush()

            safe_context = intake_context or {}
            if any(value and str(value).strip() for value in safe_context.values()):
                db.add(EvidenceIntakeContext(evidence_id=db_evidence.id, **safe_context))

            AuditService.log_event(
                db, target_case.case_identifier, "EVIDENCE_UPLOADED", db_evidence.id,
                actor=current_user.username,
                metadata={"filename": original_filename, "sha256": db_evidence.sha256_hash, "source_platform_recorded": bool(safe_context.get("source_platform"))},
                auto_commit=False,
            )

            # Record idempotency token and fingerprint if supplied
            if clean_key:
                idemp_rec = IntakeIdempotencyRecord(
                    idempotency_key=clean_key,
                    user_id=current_user.id,
                    request_fingerprint=request_fingerprint,
                    case_id=target_case.id,
                    case_identifier=target_case.case_identifier,
                    evidence_id=db_evidence.id,
                    response_payload={
                        "id": db_evidence.id,
                        "evidence_identifier": db_evidence.evidence_identifier,
                        "case_id": target_case.id,
                        "case_identifier": target_case.case_identifier,
                        "sha256_hash": db_evidence.sha256_hash,
                        "original_filename": original_filename,
                        "image_format": image_format,
                        "mime_type": expected_mime,
                        "file_size": file_size,
                        "width": width,
                        "height": height,
                    }
                )
                db.add(idemp_rec)

            db.commit()
            committed = True
            db.refresh(db_evidence)
            return db_evidence

        except (IntegrityError, FlushError):
            db.rollback()
            # If concurrent submission with identical idempotency key, retrieve existing and verify fingerprint
            if clean_key:
                existing_rec = db.query(IntakeIdempotencyRecord).filter(
                    IntakeIdempotencyRecord.idempotency_key == clean_key,
                    IntakeIdempotencyRecord.user_id == current_user.id,
                ).first()
                if existing_rec:
                    if request_fingerprint and existing_rec.request_fingerprint == request_fingerprint:
                        ev = db.query(Evidence).filter(Evidence.id == existing_rec.evidence_id).first()
                        if ev:
                            return ev
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail="Idempotency key has already been used for a different intake request. Please initiate a fresh submission with a new key.",
                        )
            raise
        except HTTPException:
            db.rollback()
            raise
        except (UnidentifiedImageError, SyntaxError, OSError, DecompressionBombError, DecompressionBombWarning):
            db.rollback()
            raise HTTPException(status_code=400, detail="Invalid or corrupted image file (unidentified, corrupted, or unsafe structure)") from None
        except Exception:
            db.rollback()
            raise
        finally:
            _perform_cleanup(staging_path, "staging_cleanup", db=db, idempotency_key=clean_key, user_id=current_user.id)
            if not committed:
                _perform_cleanup(final_path, "aborted_promotion_cleanup", db=db, idempotency_key=clean_key, user_id=current_user.id)

    @staticmethod
    def recover_failed_cleanups(db: Session) -> Dict[str, Any]:
        """
        Retries unlinking uncommitted files recorded in failed_cleanup_records.
        CRITICAL FORENSIC SAFETY GUARANTEE:
        Before removing any file, verifies against the database that the file path
        is NOT referenced by any active, committed Evidence record (stored_path).
        """
        records = db.query(FailedCleanupRecord).filter(FailedCleanupRecord.resolved == False).all()
        cleaned = 0
        skipped_active = 0
        failed = 0

        storage = get_storage_backend()
        for rec in records:
            rec.retry_count += 1
            target_path = rec.file_path
            is_remote_key = storage.is_remote and not os.path.isabs(target_path) and not os.path.exists(target_path)

            # 1. If file already gone from storage, mark resolved
            exists = storage.exists(target_path) if is_remote_key else os.path.exists(target_path)
            if not exists:
                rec.resolved = True
                rec.resolved_at = datetime.datetime.utcnow()
                cleaned += 1
                continue

            # 2. Forensic integrity guard: Verify file is NOT referenced by any committed Evidence
            norm_path = target_path if is_remote_key else os.path.abspath(target_path)
            committed_evidence = db.query(Evidence).filter(
                func.lower(Evidence.stored_path) == func.lower(norm_path)
            ).first()

            if committed_evidence:
                logger.warning(
                    f"Recovery safety guard: File '{target_path}' is referenced by active Evidence "
                    f"id={committed_evidence.id} ({committed_evidence.evidence_identifier}). Refusing to delete."
                )
                rec.error_message = f"SAFETY GUARD: Referenced by committed evidence id={committed_evidence.id}"
                skipped_active += 1
                continue

            # 3. Attempt unlinking
            try:
                if is_remote_key:
                    storage.delete(target_path)
                else:
                    os.remove(target_path)
                rec.resolved = True
                rec.resolved_at = datetime.datetime.utcnow()
                cleaned += 1
                logger.info(f"Successfully recovered and deleted orphaned file: {target_path}")
            except Exception as e:
                rec.error_message = f"Retry {rec.retry_count} failed: {type(e).__name__}: {e}"
                failed += 1
                logger.error(f"Recovery attempt failed for '{target_path}': {e}")

        db.commit()
        return {
            "processed": len(records),
            "cleaned": cleaned,
            "skipped_active_evidence": skipped_active,
            "failed": failed,
        }

    @staticmethod
    def get_evidence(db: Session, evidence_id: int):
        return db.query(Evidence).filter(Evidence.id == evidence_id).first()
