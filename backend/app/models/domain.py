import datetime
import uuid
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON, Float, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.database import Base

def generate_case_id():
    return f"FS-CASE-{uuid.uuid4().hex[:8].upper()}"

def generate_evidence_id():
    return f"FS-EVD-{uuid.uuid4().hex[:8].upper()}"

def generate_analysis_id():
    return f"FS-ANL-{uuid.uuid4().hex[:8].upper()}"

class InvestigationCase(Base):
    __tablename__ = "investigation_cases"

    id = Column(Integer, primary_key=True, index=True)
    case_identifier = Column(String, unique=True, index=True, default=generate_case_id)
    title = Column(String, index=True)
    status = Column(String, default="Open")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True) # made nullable for backwards compatibility
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    owner = relationship("User", backref="cases")

    evidence_items = relationship("Evidence", back_populates="case")
    intake_context = relationship("CaseIntakeContext", back_populates="case", uselist=False, cascade="all, delete-orphan")


class CaseIntakeContext(Base):
    __tablename__ = "case_intake_contexts"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("investigation_cases.id"), unique=True, nullable=False, index=True)
    claim_summary = Column(Text, nullable=True)
    reported_event_date = Column(String, nullable=True)
    reported_location = Column(Text, nullable=True)
    source_reference_url = Column(Text, nullable=True)
    intake_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    case = relationship("InvestigationCase", back_populates="intake_context")

class Evidence(Base):
    __tablename__ = "evidence"

    id = Column(Integer, primary_key=True, index=True)
    evidence_identifier = Column(String, unique=True, index=True, default=generate_evidence_id)
    case_id = Column(Integer, ForeignKey("investigation_cases.id"))
    original_filename = Column(String)
    stored_path = Column(String)
    mime_type = Column(String)
    file_size = Column(Integer)
    sha256_hash = Column(String, index=True)
    image_format = Column(String)
    width = Column(Integer)
    height = Column(Integer)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    case = relationship("InvestigationCase", back_populates="evidence_items")
    analyses = relationship("Analysis", back_populates="evidence")
    intake_context = relationship("EvidenceIntakeContext", back_populates="evidence", uselist=False, cascade="all, delete-orphan")


class EvidenceIntakeContext(Base):
    __tablename__ = "evidence_intake_contexts"

    id = Column(Integer, primary_key=True, index=True)
    evidence_id = Column(Integer, ForeignKey("evidence.id"), unique=True, nullable=False, index=True)
    source_platform = Column(String, nullable=True)
    acquisition_method = Column(String, nullable=True)
    received_from = Column(Text, nullable=True)
    received_at = Column(String, nullable=True)
    reported_capture_time = Column(String, nullable=True)
    source_reference_url = Column(Text, nullable=True)
    intake_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    evidence = relationship("Evidence", back_populates="intake_context")


class EvidenceLineageRelation(Base):
    __tablename__ = "evidence_lineage_relations"
    __table_args__ = (UniqueConstraint("evidence_a_id", "evidence_b_id", name="uq_lineage_evidence_pair"),)

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("investigation_cases.id"), nullable=False, index=True)
    evidence_a_id = Column(Integer, ForeignKey("evidence.id"), nullable=False, index=True)
    evidence_b_id = Column(Integer, ForeignKey("evidence.id"), nullable=False, index=True)
    relation_kind = Column(String, nullable=False)
    matching_details = Column(JSON, nullable=False, default=dict)
    review_status = Column(String, nullable=False, default="CANDIDATE")
    parent_evidence_id = Column(Integer, ForeignKey("evidence.id"), nullable=True)
    reviewer = Column(String, nullable=True)
    review_note = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class Analysis(Base):
    __tablename__ = "analyses"

    id = Column(Integer, primary_key=True, index=True)
    analysis_identifier = Column(String, unique=True, index=True, default=generate_analysis_id)
    evidence_id = Column(Integer, ForeignKey("evidence.id"))
    analysis_type = Column(String, index=True)
    status = Column(String, default="pending")
    summary = Column(String, nullable=True)
    structured_findings = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    evidence = relationship("Evidence", back_populates="analyses")

class EvidenceObservation(Base):
    __tablename__ = "evidence_observations"

    id = Column(Integer, primary_key=True, index=True)
    evidence_id = Column(Integer, ForeignKey("evidence.id"), index=True)
    analysis_id = Column(Integer, ForeignKey("analyses.id"), index=True)
    
    modality = Column(String, index=True)
    observation_type = Column(String)
    metric_name = Column(String)
    
    raw_value = Column(String)
    normalized_value = Column(Float, nullable=True)
    
    direction = Column(String)
    technical_reliability = Column(String)
    
    interpretation = Column(String)
    limitations = Column(String)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    evidence = relationship("Evidence", backref="observations")
    analysis = relationship("Analysis")

class EvidenceRelation(Base):
    __tablename__ = "evidence_relations"

    id = Column(Integer, primary_key=True, index=True)
    evidence_id = Column(Integer, ForeignKey("evidence.id"), index=True)
    observation_a_id = Column(Integer, ForeignKey("evidence_observations.id"), index=True)
    observation_b_id = Column(Integer, ForeignKey("evidence_observations.id"), index=True)
    
    relation_type = Column(String)  # SUPPORTING, CONTEXTUAL, CONTRASTING, INDEPENDENT, UNRELATED
    strength = Column(String)       # LOW, MODERATE, HIGH (strength of relationship, not manipulation)
    explanation = Column(String)
    limitations = Column(String)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    evidence = relationship("Evidence", backref="relations")
    observation_a = relationship("EvidenceObservation", foreign_keys=[observation_a_id])
    observation_b = relationship("EvidenceObservation", foreign_keys=[observation_b_id])

class EvidenceAssessment(Base):
    __tablename__ = "evidence_assessments"

    id = Column(Integer, primary_key=True, index=True)
    evidence_id = Column(Integer, ForeignKey("evidence.id"), index=True)
    
    rule_version = Column(String)
    level = Column(String)  # INSUFFICIENT_EVIDENCE, LOW_FORENSIC_CONCERN, MODERATE_FORENSIC_CONCERN, ELEVATED_FORENSIC_CONCERN
    summary = Column(String)
    
    contributing_observations = Column(JSON)
    contributing_relations = Column(JSON)
    limitations = Column(JSON)
    
    generated_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    evidence = relationship("Evidence", backref="assessments")

def generate_job_id():
    return f"FS-JOB-{uuid.uuid4().hex[:8].upper()}"

class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_identifier = Column(String, unique=True, index=True, default=generate_job_id)
    evidence_id = Column(Integer, ForeignKey("evidence.id"), index=True)
    analysis_id = Column(Integer, ForeignKey("analyses.id"), nullable=True)
    analysis_type = Column(String, index=True)
    
    status = Column(String, default="QUEUED")
    
    queued_at = Column(DateTime, default=datetime.datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    error_code = Column(String, nullable=True)
    safe_error_message = Column(String, nullable=True)
    
    evidence = relationship("Evidence", backref="jobs")

class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(String, index=True)
    evidence_id = Column(Integer, nullable=True)
    event_type = Column(String, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    actor = Column(String, nullable=True)
    safe_metadata = Column(String, nullable=True)

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    report_identifier = Column(String, unique=True, index=True)
    case_id = Column(String, index=True)
    generated_at = Column(DateTime, default=datetime.datetime.utcnow)
    rule_version = Column(String, nullable=True)
    report_type = Column(String, default="JSON")
    status = Column(String, default="COMPLETED")
    artifact_path = Column(String, nullable=True)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="INVESTIGATOR")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

def generate_finding_id():
    return f"FS-FND-{uuid.uuid4().hex[:8].upper()}"

def generate_note_id():
    return f"FS-NOTE-{uuid.uuid4().hex[:8].upper()}"

class Finding(Base):
    __tablename__ = "findings"

    id = Column(Integer, primary_key=True, index=True)
    finding_identifier = Column(String, unique=True, index=True, default=generate_finding_id)
    case_id = Column(String, index=True)
    evidence_id = Column(Integer, ForeignKey("evidence.id"), nullable=True, index=True)
    
    finding_type = Column(String, index=True, default="CORRELATED_OBSERVATION")
    severity_label = Column(String, default="OBSERVATION")
    title = Column(String)
    summary = Column(String)
    
    supporting_observations = Column(JSON, nullable=True)
    supporting_analysis_ids = Column(JSON, nullable=True)
    correlation_rule_id = Column(String, nullable=True, index=True)
    correlation_rule_version = Column(String, nullable=True)
    
    interpretation = Column(String, nullable=True)
    limitations = Column(String, nullable=True)
    
    status = Column(String, default="GENERATED", index=True)
    reviewer = Column(String, nullable=True)
    review_timestamp = Column(DateTime, nullable=True)
    review_note = Column(String, nullable=True)
    decision = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    evidence = relationship("Evidence", backref="findings")

class AnalystNote(Base):
    __tablename__ = "analyst_notes"

    id = Column(Integer, primary_key=True, index=True)
    note_identifier = Column(String, unique=True, index=True, default=generate_note_id)
    case_id = Column(String, index=True)
    author = Column(String, index=True)
    target_type = Column(String, index=True)  # EVIDENCE, ANALYSIS, FINDING, CASE
    target_id = Column(String, index=True)
    content = Column(String)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

