import os
import uuid
import hashlib
from io import BytesIO
from fastapi import UploadFile, HTTPException
from sqlalchemy.orm import Session
from app.models.domain import Evidence, InvestigationCase
from app.core.config import settings
from PIL import Image, UnidentifiedImageError

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}

class EvidenceService:
    @staticmethod
    def process_and_store_evidence(db: Session, case_id: int, file: UploadFile) -> Evidence:
        case = db.query(InvestigationCase).filter(InvestigationCase.id == case_id).first()
        if not case:
            raise HTTPException(status_code=404, detail="Case not found")

        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)

        if file_size > settings.MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="File too large")
        if file_size == 0:
            raise HTTPException(status_code=400, detail="Empty file")

        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported file extension. Allowed: {ALLOWED_EXTENSIONS}")

        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported MIME type. Allowed: {ALLOWED_MIME_TYPES}")

        sha256_hash = hashlib.sha256()
        file_bytes = b""
        while chunk := file.file.read(8192):
            sha256_hash.update(chunk)
            file_bytes += chunk
        
        file_hash = sha256_hash.hexdigest()

        try:
            image = Image.open(BytesIO(file_bytes))
            image.verify()
            image = Image.open(BytesIO(file_bytes))
            width, height = image.size
            image_format = image.format
        except (UnidentifiedImageError, SyntaxError):
            raise HTTPException(status_code=400, detail="Invalid or corrupted image file")

        safe_filename = f"{uuid.uuid4().hex}{ext}"
        os.makedirs(settings.STORAGE_DIR, exist_ok=True)
        stored_path = os.path.join(settings.STORAGE_DIR, safe_filename)

        with open(stored_path, "wb") as f:
            f.write(file_bytes)

        db_evidence = Evidence(
            case_id=case_id,
            original_filename=os.path.basename(file.filename),
            stored_path=stored_path,
            mime_type=file.content_type,
            file_size=file_size,
            sha256_hash=file_hash,
            image_format=image_format,
            width=width,
            height=height
        )
        db.add(db_evidence)
        db.commit()
        db.refresh(db_evidence)

        return db_evidence

    @staticmethod
    def get_evidence(db: Session, evidence_id: int):
        return db.query(Evidence).filter(Evidence.id == evidence_id).first()
