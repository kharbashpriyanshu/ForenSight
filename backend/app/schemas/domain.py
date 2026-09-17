from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from datetime import datetime
from pydantic import ConfigDict

class EvidenceBase(BaseModel):
    original_filename: str
    mime_type: str
    file_size: int
    sha256_hash: str
    image_format: str
    width: int
    height: int

class EvidenceCreate(EvidenceBase):
    stored_path: str
    case_id: int

class EvidenceResponse(EvidenceBase):
    id: int
    evidence_identifier: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class InvestigationCaseBase(BaseModel):
    title: str

class InvestigationCaseCreate(InvestigationCaseBase):
    pass

class InvestigationCaseResponse(InvestigationCaseBase):
    id: int
    case_identifier: str
    status: str
    created_at: datetime
    updated_at: datetime
    evidence_items: List[EvidenceResponse] = []

    model_config = ConfigDict(from_attributes=True)

class AnalysisBase(BaseModel):
    analysis_type: str
    status: str
    summary: Optional[str] = None
    structured_findings: Optional[Dict[str, Any]] = None

class AnalysisResponse(AnalysisBase):
    id: int
    analysis_identifier: str
    evidence_id: int
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class CaseOverviewStats(BaseModel):
    case_identifier: str
    title: str
    status: str
    created_at: datetime
    last_activity: Optional[datetime] = None
    evidence_count: int
    analysis_count: int
    completed_analysis_count: int
    failed_analysis_count: int
    running_job_count: int = 0
    pending_job_count: int = 0
    findings_count: int = 0
    audit_event_count: int = 0
    assessment_status: str
    latest_assessment: Optional[str] = None
    rule_version: Optional[str] = None
    safe_error_message: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)

class EvidenceComparisonItem(BaseModel):
    id: int
    evidence_identifier: str
    original_filename: str
    mime_type: str
    file_size: int
    sha256_hash: str
    image_format: Optional[str] = "UNKNOWN"
    width: int
    height: int
    created_at: datetime
    analyses: Dict[str, Any] = {}
    artifacts: Dict[str, str] = {}
    observations: List[Dict[str, Any]] = []

class EvidenceComparisonResponse(BaseModel):
    case_identifier: str
    evidence_a: EvidenceComparisonItem
    evidence_b: EvidenceComparisonItem
    differences: Dict[str, Any] = {}
    disclaimer: str = "Comparison reflects physical, digital, and compression processing differences. It does not compute an automated manipulation score."

class AnalysisJobResponse(BaseModel):
    id: int
    job_identifier: str
    evidence_id: int
    analysis_id: Optional[int] = None
    analysis_type: str
    status: str
    queued_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_code: Optional[str] = None
    safe_error_message: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)
