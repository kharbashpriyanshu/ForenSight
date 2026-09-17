import os
import pathlib
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.domain import Report, User
from app.services.reports import ReportService
from app.api.deps import get_current_user, verify_case_access, verify_report_access
from pydantic import BaseModel
from typing import List
from datetime import datetime

router = APIRouter()

class ReportResponse(BaseModel):
    id: int
    report_identifier: str
    case_id: str
    generated_at: datetime
    rule_version: str
    report_type: str
    status: str
    
    class Config:
        from_attributes = True

@router.post("/cases/{case_id}/reports", response_model=ReportResponse)
def generate_report(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = verify_case_access(db, case_id, current_user)
    try:
        report = ReportService.generate_case_report(db, case.case_identifier)
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    report = verify_report_access(db, report_id, current_user)
    if not report.artifact_path or not os.path.exists(report.artifact_path):
        raise HTTPException(status_code=404, detail="Report artifact file not found")
        
    return FileResponse(
        report.artifact_path,
        media_type="application/json",
        filename=f"{report.report_identifier}.json",
    )

