from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime

# =====================================================================
# Batch Processing Schemas
# =====================================================================

class BatchUploadItemResult(BaseModel):
    id: int
    evidence_identifier: str
    original_filename: str
    mime_type: str
    file_size: int
    sha256_hash: str
    image_format: str
    width: int
    height: int
    created_at: datetime
    status: str = "INGESTED"

    model_config = ConfigDict(from_attributes=True)

class BatchUploadResponse(BaseModel):
    case_identifier: str
    uploaded_count: int
    total_size_bytes: int
    items: List[BatchUploadItemResult]
    failed_count: int = 0
    failed_items: List[Dict[str, str]] = []
    ingest_timestamp: datetime
    message: str

class BatchAnalysisRequest(BaseModel):
    evidence_ids: Optional[List[int]] = None  # None means all evidence in the case
    analysis_types: Optional[List[str]] = None  # None means all 5 core modalities: ela, noise, jpeg-dct, metadata, copy-move

class BatchJobItemStatus(BaseModel):
    job_id: int
    job_identifier: str
    evidence_id: int
    evidence_filename: str
    analysis_type: str
    status: str  # QUEUED, RUNNING, COMPLETED, FAILED
    error_message: Optional[str] = None

class BatchAnalysisStatusResponse(BaseModel):
    case_identifier: str
    total_jobs: int
    queued_count: int
    running_count: int
    completed_count: int
    failed_count: int
    progress_percentage: float
    jobs: List[BatchJobItemStatus]

# =====================================================================
# Cross-Image Correlation Schemas
# =====================================================================

class SharedCameraCluster(BaseModel):
    cluster_id: str
    make: Optional[str] = None
    model: Optional[str] = None
    software: Optional[str] = None
    serial_number: Optional[str] = None
    evidence_ids: List[int]
    filenames: List[str]
    forensic_significance: str

class TemporalSequenceItem(BaseModel):
    evidence_id: int
    filename: str
    timestamp_utc: Optional[str] = None
    timestamp_delta_seconds: Optional[float] = None
    source_tag: str  # EXIF DateTimeOriginal, DateTimeDigitized, or Ingestion Time

class CrossImageMatchPair(BaseModel):
    evidence_a_id: int
    evidence_a_filename: str
    evidence_b_id: int
    evidence_b_filename: str
    shared_keypoint_count: int
    confidence_label: str
    forensic_explanation: str
    limitations: str

class CrossImageCorrelationResponse(BaseModel):
    case_identifier: str
    total_evidence_evaluated: int
    camera_clusters: List[SharedCameraCluster]
    temporal_sequence: List[TemporalSequenceItem]
    cross_image_matches: List[CrossImageMatchPair]
    findings_generated: int
    evaluation_timestamp: datetime
    disclaimer: str = (
        "Cross-image correlations indicate common hardware signatures, temporal sequence proximity, or feature similarity. "
        "Observation != Proof; camera clustering does not prove who operated the device."
    )

# =====================================================================
# Multi-Modality Heatmap Schemas
# =====================================================================

class HeatmapRegion(BaseModel):
    modality: str  # ELA, NOISE, COPY_MOVE, DCT
    x: float  # normalized 0.0 to 1.0
    y: float  # normalized 0.0 to 1.0
    width: float  # normalized 0.0 to 1.0
    height: float  # normalized 0.0 to 1.0
    intensity: float  # normalized 0.0 to 1.0
    description: str

class ModalityHeatmapLayer(BaseModel):
    modality: str
    label: str
    status: str  # AVAILABLE, NOT_RUN, INAPPLICABLE
    weight: float
    regions: List[HeatmapRegion]
    summary: str
    limitations: str

class MultiModalityHeatmapResponse(BaseModel):
    evidence_id: int
    evidence_identifier: str
    filename: str
    width: int
    height: int
    layers: List[ModalityHeatmapLayer]
    composite_regions_count: int
    what_was_found: str
    why_it_matters: str
    recommended_next_steps: List[str]
    limitations: str

# =====================================================================
# Investigation Assistant Schemas
# =====================================================================

class InvestigativeNextStep(BaseModel):
    priority: str  # HIGH, MEDIUM, LOW
    action: str
    rationale: str
    target_evidence_id: Optional[int] = None
    target_filename: Optional[str] = None

class CounterHypothesis(BaseModel):
    phenomenon: str
    alternative_benign_explanation: str
    testing_recommendation: str

class ForensicCompletenessMetric(BaseModel):
    modality: str
    total_applicable: int
    completed: int
    pending: int
    percentage: float

class InvestigationAssistantResponse(BaseModel):
    case_identifier: str
    title: str
    evidence_count: int
    what_was_found_summary: str
    why_it_matters_summary: str
    investigative_next_steps: List[InvestigativeNextStep]
    counter_hypotheses: List[CounterHypothesis]
    forensic_completeness: List[ForensicCompletenessMetric]
    overall_completeness_percentage: float
    pending_analyst_reviews_count: int
    scientific_disclaimer: str = (
        "INVESTIGATION ASSISTANT DECISION SUPPORT: This summary provides algorithmic observations, "
        "correlation guidance, and counter-hypotheses. It does not replace human forensic judgment."
    )

# =====================================================================
# Chain of Custody & Verification Schemas
# =====================================================================

class CustodyVerificationResult(BaseModel):
    evidence_id: int
    evidence_identifier: str
    filename: str
    stored_path: str
    ingest_sha256_hash: str
    current_disk_sha256_hash: str
    integrity_intact: bool
    verified_at: datetime
    verifier: str
    status: str  # VERIFIED_INTACT, TAMPER_OR_BITROT_DETECTED, FILE_MISSING
    message: str

class CustodyTimelineEvent(BaseModel):
    id: int
    timestamp: datetime
    event_type: str
    actor: str
    evidence_id: Optional[int] = None
    evidence_filename: Optional[str] = None
    details: Dict[str, Any]

class ChainOfCustodyResponse(BaseModel):
    case_identifier: str
    case_created_at: datetime
    total_evidence_items: int
    all_hashes_intact: bool
    evidence_summaries: List[CustodyVerificationResult]
    custody_timeline: List[CustodyTimelineEvent]
