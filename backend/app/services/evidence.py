import os
import uuid
import hashlib
import tempfile
import warnings
from typing import Optional, Dict, Any
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.models.domain import Evidence, EvidenceIntakeContext, InvestigationCase, IntakeIdempotencyRecord, User
from app.services.audit import AuditService
from app.core.config import settings
from PIL import Image, UnidentifiedImageError
from PIL.Image import DecompressionBombError, DecompressionBombWarning

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}

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
        storage_dir = os.path.abspath(settings.STORAGE_DIR)
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

            expected_mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}.get(image_format)
            if expected_mime is None or expected_mime != claimed_mime:
                raise HTTPException(status_code=400, detail="Image contents do not match the supported format and declared MIME type")
            expected_extensions = {"JPEG": {".jpg", ".jpeg"}, "PNG": {".png"}, "WEBP": {".webp"}}
            if ext not in expected_extensions[image_format]:
                raise HTTPException(status_code=400, detail="Image contents do not match the filename extension")

            safe_filename = f"{uuid.uuid4().hex}{ext}"
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
            for path in (staging_path, final_path if not committed else None):
                if path and os.path.exists(path):
                    try:
                        os.remove(path)
                    except OSError:
                        pass

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
        Enforces idempotency and prevents duplicate submissions.
        """
        clean_key = idempotency_key.strip() if idempotency_key and idempotency_key.strip() else None

        # 1. Idempotency replay check
        if clean_key:
            existing_rec = db.query(IntakeIdempotencyRecord).filter(
                IntakeIdempotencyRecord.idempotency_key == clean_key,
                IntakeIdempotencyRecord.user_id == current_user.id,
            ).first()
            if existing_rec:
                existing_ev = db.query(Evidence).filter(Evidence.id == existing_rec.evidence_id).first()
                if existing_ev:
                    return existing_ev

        # 2. Case verification if attaching to existing case
        target_case = None
        if case_id and str(case_id).strip():
            cid = str(case_id).strip()
            if cid.startswith("FS-CASE"):
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

        # 3. File validation & staging (performed BEFORE any new case is created)
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
        storage_dir = os.path.abspath(settings.STORAGE_DIR)
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

            expected_mime = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}.get(image_format)
            if expected_mime is None or expected_mime != claimed_mime:
                raise HTTPException(status_code=400, detail="Image contents do not match the supported format and declared MIME type")
            expected_extensions = {"JPEG": {".jpg", ".jpeg"}, "PNG": {".png"}, "WEBP": {".webp"}}
            if ext not in expected_extensions[image_format]:
                raise HTTPException(status_code=400, detail="Image contents do not match the filename extension")

            # Staging verified! Atomically rename to permanent path:
            safe_filename = f"{uuid.uuid4().hex}{ext}"
            final_path = os.path.join(storage_dir, safe_filename)
            os.replace(staging_path, final_path)
            staging_path = None

            # 4. Atomic Database registration:
            # If target_case is None, create new case now (guaranteed that file is valid)
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
                AuditService.log_event(db, target_case.case_identifier, "CASE_CREATED", actor=current_user.username)

            db_evidence = Evidence(
                case_id=target_case.id,
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

            AuditService.log_event(
                db, target_case.case_identifier, "EVIDENCE_UPLOADED", db_evidence.id,
                actor=current_user.username,
                metadata={"filename": original_filename, "sha256": db_evidence.sha256_hash, "source_platform_recorded": bool(safe_context.get("source_platform"))},
            )

            # Record idempotency token if supplied
            if clean_key:
                idemp_rec = IntakeIdempotencyRecord(
                    idempotency_key=clean_key,
                    user_id=current_user.id,
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

        except IntegrityError:
            db.rollback()
            # If concurrent submission with identical idempotency key, retrieve existing
            if clean_key:
                existing_rec = db.query(IntakeIdempotencyRecord).filter(
                    IntakeIdempotencyRecord.idempotency_key == clean_key,
                    IntakeIdempotencyRecord.user_id == current_user.id,
                ).first()
                if existing_rec:
                    ev = db.query(Evidence).filter(Evidence.id == existing_rec.evidence_id).first()
                    if ev:
                        return ev
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
            for path in (staging_path, final_path if not committed else None):
                if path and os.path.exists(path):
                    try:
                        os.remove(path)
                    except OSError:
                        pass

    @staticmethod
    def get_evidence(db: Session, evidence_id: int):
        return db.query(Evidence).filter(Evidence.id == evidence_id).first()
