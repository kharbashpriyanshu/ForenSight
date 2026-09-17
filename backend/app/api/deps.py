from typing import Union
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.domain import User, InvestigationCase, Evidence, Analysis, AnalysisJob, Report
from app.services.cases import CaseService
from app.core.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

def get_current_user(
    db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=["HS256"]
        )
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user


def verify_case_access(
    db: Session, case_id: Union[str, int], current_user: User
) -> InvestigationCase:
    case_str = str(case_id)
    if case_str.startswith("FS-CASE-"):
        case = CaseService.get_case_by_identifier(db, case_str)
    else:
        try:
            case = CaseService.get_case(db, int(case_str))
        except (ValueError, TypeError):
            case = None
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this case"
        )
    return case


def verify_evidence_access(
    db: Session, evidence_id: int, current_user: User
) -> Evidence:
    evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
    if not evidence:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence not found")
    case = evidence.case
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this evidence"
        )
    return evidence


def verify_analysis_access(
    db: Session, analysis_id: int, current_user: User
) -> Analysis:
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    evidence = analysis.evidence
    if not evidence or not evidence.case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence not found")
    if current_user.role != "ADMIN" and evidence.case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this analysis"
        )
    return analysis


def verify_job_access(
    db: Session, job_id: int, current_user: User
) -> AnalysisJob:
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    evidence = job.evidence
    if not evidence or not evidence.case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Evidence not found")
    if current_user.role != "ADMIN" and evidence.case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this job"
        )
    return job


def verify_report_access(
    db: Session, report_id: str, current_user: User
) -> Report:
    report = db.query(Report).filter(Report.report_identifier == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    case = CaseService.get_case_by_identifier(db, report.case_id) if report.case_id.startswith("FS-CASE") else CaseService.get_case(db, int(report.case_id))
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this report"
        )
    return report

