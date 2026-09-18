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

# Phase 6 Schemas: Findings, Notes, Graph, Provenance, and Search

class FindingResponse(BaseModel):
    id: int
    finding_identifier: str
    case_id: str
    evidence_id: Optional[int] = None
    finding_type: str
    severity_label: str
    title: str
    summary: str
    supporting_observations: Optional[Any] = None
    supporting_analysis_ids: Optional[Any] = None
    correlation_rule_id: Optional[str] = None
    correlation_rule_version: Optional[str] = None
    interpretation: Optional[str] = None
    limitations: Optional[str] = None
    status: str
    reviewer: Optional[str] = None
    review_timestamp: Optional[datetime] = None
    review_note: Optional[str] = None
    decision: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class FindingReviewRequest(BaseModel):
    status: str  # REVIEW_REQUIRED, ACKNOWLEDGED, CONFIRMED_BY_ANALYST, DISMISSED, INCONCLUSIVE
    review_note: Optional[str] = None
    decision: Optional[str] = None

class AnalystNoteResponse(BaseModel):
    id: int
    note_identifier: str
    case_id: str
    author: str
    target_type: str
    target_id: str
    content: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AnalystNoteCreateRequest(BaseModel):
    target_type: str  # EVIDENCE, ANALYSIS, FINDING, CASE
    target_id: str
    content: str

class GraphNode(BaseModel):
    id: str
    type: str  # CASE, EVIDENCE, ANALYSIS, OBSERVATION, FINDING, ARTIFACT, REPORT
    label: str
    metadata: Dict[str, Any] = {}

class GraphEdge(BaseModel):
    source: str
    target: str
    type: str  # CONTAINS, ANALYZED_BY, PRODUCED, SUPPORTS, CONTRADICTS, GENERATED, REFERENCES

class ObservationGraphResponse(BaseModel):
    case_id: str
    nodes: List[GraphNode]
    edges: List[GraphEdge]

class ProvenanceItem(BaseModel):
    id: str
    type: str
    label: str
    sha256: Optional[str] = None
    timestamp: Optional[str] = None
    details: Dict[str, Any] = {}
    children: List["ProvenanceItem"] = []

class ProvenanceResponse(BaseModel):
    case_id: str
    root_evidence: List[ProvenanceItem]

class InvestigationSearchHit(BaseModel):
    entity_type: str  # EVIDENCE, ANALYSIS, JOB, FINDING, NOTE, REPORT
    entity_id: str
    title: str
    snippet: str
    case_id: str
    metadata: Dict[str, Any] = {}

class InvestigationSearchResponse(BaseModel):
    query: str
    total_hits: int
    hits: List[InvestigationSearchHit]

