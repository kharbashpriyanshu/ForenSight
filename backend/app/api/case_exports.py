import os
from starlette.background import BackgroundTask
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, verify_case_access
from app.db.database import get_db
from app.models.domain import User
from app.services.audit import AuditService
from app.services.case_export import CaseExportService, SigningKeyUnavailable

router = APIRouter(tags=["Case Export"])


@router.get("/cases/{case_id}/export")
def export_case_bundle(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    try:
        archive_path, details = CaseExportService.create_bundle(db, case)
    except SigningKeyUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    try:
        AuditService.log_event(
            db,
            case.case_identifier,
            "CASE_BUNDLE_EXPORTED",
            actor=current_user.username,
            metadata=details,
        )
    except Exception:
        try:
            os.remove(archive_path)
        except OSError:
            pass
        raise
    return FileResponse(
        archive_path,
        media_type="application/vnd.forensight.case+zip",
        filename=f"{case.case_identifier}.forensight",
        background=BackgroundTask(lambda: os.path.exists(archive_path) and os.remove(archive_path)),
    )
