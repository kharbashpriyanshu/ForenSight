from pydantic import BaseModel
from typing import List, Optional
import datetime

class EvidenceObservationResponse(BaseModel):
    id: int
    evidence_id: int
    analysis_id: int
    modality: str
    observation_type: str
    metric_name: str
    raw_value: str
    normalized_value: Optional[float]
    direction: str
    technical_reliability: str
    interpretation: str
    limitations: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class EvidenceSet(BaseModel):
    evidence_id: int
    normalization_version: str
    modalities_present: List[str]
    modalities_missing: List[str]
    observations: List[EvidenceObservationResponse]

class EvidenceRelationResponse(BaseModel):
    id: int
    evidence_id: int
    observation_a_id: int
    observation_b_id: int
    relation_type: str
    strength: str
    explanation: str
    limitations: str
    created_at: datetime.datetime

    class Config:
        from_attributes = True

class EvidenceAssessmentResponse(BaseModel):
    id: int
    evidence_id: int
    rule_version: str
    level: str
    summary: str
    contributing_observations: List[dict]
    contributing_relations: List[dict]
    limitations: List[str]
    generated_at: datetime.datetime

    class Config:
        from_attributes = True

class CorrelationResult(BaseModel):
    evidence_id: int
    families: List[str]
    relations: List[EvidenceRelationResponse]
    assessment: EvidenceAssessmentResponse
