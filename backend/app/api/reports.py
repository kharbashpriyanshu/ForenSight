import os
import pathlib
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.domain import Report, User
from app.services.reports import ReportService
from app.services.storage import get_storage_backend
from app.api.deps import get_current_user, verify_case_access, verify_report_access
from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

router = APIRouter()

class ReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    report_identifier: str
    case_id: str
    generated_at: datetime
    rule_version: str
    report_type: str
    status: str
    artifact_path: Optional[str] = None

@router.post("/cases/{case_id}/reports", response_model=ReportResponse)
def generate_report(
    case_id: str,
    format: str = "pdf",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    try:
        report = ReportService.generate_case_report(
            db, 
            case.case_identifier,
            author_username=current_user.username,
            report_format=format
        )
        return report
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/cases/{case_id}/reports", response_model=List[ReportResponse])
def get_reports(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    reports = (
        db.query(Report)
        .filter((Report.case_id == case.case_identifier) | (Report.case_id == str(case.id)))
        .order_by(Report.generated_at.desc())
        .all()
    )
    return reports

@router.get("/reports/{report_id}/download")
def download_report(
    report_id: str,
    format: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = verify_report_access(db, report_id, current_user)
    desired_format = (format or (report.report_type or "pdf")).lower()
    if desired_format not in ("pdf", "json"):
        desired_format = "pdf"

    try:
        target_path = ReportService.ensure_report_artifacts(db, report, desired_format=desired_format)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to prepare report artifact: {str(e)}")

    storage = get_storage_backend()
    is_pdf = desired_format == "pdf"
    media_type = "application/pdf" if is_pdf else "application/json"
    filename = f"{report.report_identifier}.pdf" if is_pdf else f"{report.report_identifier}.json"

    if storage.is_remote:
        if not storage.exists(target_path):
            raise HTTPException(status_code=404, detail=f"Report file not found: {os.path.basename(target_path)}")

        return StreamingResponse(
            storage.open_stream(target_path),
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    if not os.path.exists(target_path):
        raise HTTPException(status_code=404, detail=f"Report file not found: {os.path.basename(target_path)}")

    return FileResponse(
        target_path,
        media_type=media_type,
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

