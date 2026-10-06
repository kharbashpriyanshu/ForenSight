import os
import uuid
import hashlib
import tempfile
import warnings
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session
from app.models.domain import Evidence, EvidenceIntakeContext, InvestigationCase
from app.core.config import settings
from PIL import Image, UnidentifiedImageError, DecompressionBombError, DecompressionBombWarning

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}

class EvidenceService:
    @staticmethod
    def process_and_store_evidence(db: Session, case_id: int, file: UploadFile, intake_context: dict = None) -> Evidence:
        case = db.query(InvestigationCase).filter(InvestigationCase.id == case_id).first()
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")

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
            raise HTTPException(status_code=400, detail="Invalid, corrupted, or unsafe image file") from None
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
