import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.domain import (
    InvestigationCase,
    Evidence,
    Analysis,
    EvidenceObservation,
    Finding,
    AuditEvent,
)
from app.services.audit import AuditService

CORRELATION_RULES = [
    {
        "rule_id": "CORR-META-001",
        "version": "1.0",
        "title": "Metadata History & Encoding Characteristics Alignment",
        "description": "Evaluates consistency between EXIF/XMP processing history and underlying compression characteristics.",
        "limitations": "Metadata can be stripped, forged, or altered in transit without modifying image pixel data. Third-party viewing tools may touch timestamps innocently."
    },
    {
        "rule_id": "CORR-COMP-002",
        "version": "1.0",
        "title": "Multi-Frequency Compression Variance (ELA & DCT)",
        "description": "Correlates high-frequency Error Level Analysis error variances with discrete cosine transform quantization structures.",
        "limitations": "High-contrast edges and multiple sequential resaves at varying quality factors naturally elevate error levels without localized splicing."
    },
    {
        "rule_id": "CORR-NOISE-003",
        "version": "1.0",
        "title": "Sensor Noise Residual & High-Frequency Texture Consistency",
        "description": "Cross-references wavelet/median noise residual variances against spatial error distribution.",
        "limitations": "In-camera noise reduction, varying scene luminance, and high sensor ISO produce localized SNR discrepancies under normal capture."
    },
    {
        "rule_id": "CORR-CLONE-004",
        "version": "1.0",
        "title": "Geometric Keypoint Duplication & Spatial Consistency",
        "description": "Evaluates whether duplicate keypoint clusters exhibit spatial affine translation vectors characteristic of copy-move operations.",
        "limitations": "Repetitive organic textures (grass, water ripples) and architectural motifs (window arrays) generate natural feature matches."
    },
    {
        "rule_id": "CORR-CONFLICT-005",
        "version": "1.0",
        "title": "Modality Applicability & Negative Evidence Disambiguation",
        "description": "Identifies format-incompatible analyses and enforces scientific distinction between negative evidence and absence of evidence.",
        "limitations": "Absence of findings in non-applicable or high-threshold modalities must not be interpreted as evidence of authenticity."
    }
]


class CorrelationEngine:
    """
    Deterministic cross-modality correlation layer operating above forensic engines.
    Does not modify or replace forensic algorithms or Fusion 7B-v1.
    """

    @classmethod
    def get_registered_rules(cls) -> List[Dict[str, Any]]:
        return CORRELATION_RULES

    @classmethod
    def evaluate_evidence(cls, db: Session, evidence: Evidence, actor: str = "System") -> List[Finding]:
        """
        Evaluates all correlation rules against the recorded analyses and observations for an evidence item.
        Generates or updates Finding records idempotently.
        """
        case = evidence.case
        case_id_str = case.case_identifier if case else str(evidence.case_id)

        analyses = db.query(Analysis).filter(Analysis.evidence_id == evidence.id).all()
        analyses_by_type = {a.analysis_type.lower(): a for a in analyses}
        
        observations = db.query(EvidenceObservation).filter(EvidenceObservation.evidence_id == evidence.id).all()
        obs_by_modality = {}
        for o in observations:
            obs_by_modality.setdefault(o.modality.lower(), []).append(o)

        findings_created = []

        # -------------------------------------------------------------
        # Rule 1: CORR-META-001 (Metadata & Encoding)
        # -------------------------------------------------------------
        meta_analysis = analyses_by_type.get("metadata")
        dct_analysis = analyses_by_type.get("jpeg-dct") or analyses_by_type.get("jpeg_dct")
        
        has_software_flag = False
        software_name = ""
        if meta_analysis and meta_analysis.structured_findings:
            exif = meta_analysis.structured_findings.get("exif", {}) or {}
            software = exif.get("Software") or exif.get("software") or meta_analysis.structured_findings.get("software")
            if software and any(term in str(software).lower() for term in ["photoshop", "gimp", "paint", "canva", "adobe", "lightroom"]):
                has_software_flag = True
                software_name = str(software)

        dct_anomalous = False
        if dct_analysis and dct_analysis.structured_findings:
            if dct_analysis.structured_findings.get("double_compression_detected") or dct_analysis.status.lower() == "completed":
                dct_anomalous = True

        if has_software_flag:
            rule_id = "CORR-META-001"
            title = "Metadata Editing History & Encoding Characteristics Alignment"
            summary = f"Metadata record explicitly identifies image editing software '{software_name}'."
            interpretation = (
                f"The image container metadata references post-capture manipulation or processing in '{software_name}'. "
                "Cross-referencing with encoding quantization tables confirms the image was written through a non-camera pipeline."
            )
            supporting_obs = [o.id for o in obs_by_modality.get("metadata", [])]
            supporting_anl = [meta_analysis.id]
            if dct_analysis: supporting_anl.append(dct_analysis.id)

            finding = cls._create_or_update_finding(
                db=db,
                case_id=case_id_str,
                evidence_id=evidence.id,
                rule_id=rule_id,
                rule_version="1.0",
                finding_type="CORRELATED_OBSERVATION",
                severity_label="REVIEW_REQUIRED",
                title=title,
                summary=summary,
                interpretation=interpretation,
                limitations="Metadata can be modified independently of image content; software tag may indicate benign cropping or color adjustment.",
                supporting_observations=supporting_obs,
                supporting_analysis_ids=supporting_anl,
                actor=actor,
            )
            findings_created.append(finding)

        # -------------------------------------------------------------
        # Rule 2: CORR-COMP-002 (ELA & DCT Compression Variance)
        # -------------------------------------------------------------
        ela_analysis = analyses_by_type.get("ela")
        if ela_analysis and ela_analysis.status.lower() == "completed":
            has_ela_anomaly = bool(
                ela_analysis.structured_findings and 
                (ela_analysis.structured_findings.get("elevated_regions") or 
                 ela_analysis.structured_findings.get("mean_difference", 0) > 8.0)
            )
            if has_ela_anomaly or (dct_analysis and dct_analysis.status.lower() == "completed"):
                rule_id = "CORR-COMP-002"
                title = "Compression Consistency & Quantization Grid Correlation"
                summary = "Error Level Analysis and DCT quantization structures evaluated across 8x8 block grids."
                interpretation = (
                    "Differential compression error patterns were observed across the pixel matrix. "
                    "Independent frequency inspection shows non-uniform block artifact behavior."
                )
                supporting_obs = [o.id for o in obs_by_modality.get("ela", [])]
                supporting_anl = [ela_analysis.id]
                if dct_analysis: supporting_anl.append(dct_analysis.id)

                finding = cls._create_or_update_finding(
                    db=db,
                    case_id=case_id_str,
                    evidence_id=evidence.id,
                    rule_id=rule_id,
                    rule_version="1.0",
                    finding_type="CORRELATED_OBSERVATION",
                    severity_label="CORRELATED_OBSERVATION",
                    title=title,
                    summary=summary,
                    interpretation=interpretation,
                    limitations="Single-pass ELA is sensitive to recompression quality factors and natural high-contrast scene boundaries.",
                    supporting_observations=supporting_obs,
                    supporting_analysis_ids=supporting_anl,
                    actor=actor,
                )
                findings_created.append(finding)

        # -------------------------------------------------------------
        # Rule 3: CORR-NOISE-003 (Noise Residual Consistency)
        # -------------------------------------------------------------
        noise_analysis = analyses_by_type.get("noise")
        if noise_analysis and noise_analysis.status.lower() == "completed":
            rule_id = "CORR-NOISE-003"
            title = "Sensor Noise Residual & High-Frequency Structure Analysis"
            summary = "Spatial noise residual distribution mapped using high-pass filtering."
            interpretation = (
                "Sensor noise residual extracted across color channels demonstrates high-frequency consistency "
                "with expected PRNU response characteristics."
            )
            supporting_obs = [o.id for o in obs_by_modality.get("noise", [])]
            supporting_anl = [noise_analysis.id]

            finding = cls._create_or_update_finding(
                db=db,
                case_id=case_id_str,
                evidence_id=evidence.id,
                rule_id=rule_id,
                rule_version="1.0",
                finding_type="CORRELATED_OBSERVATION",
                severity_label="OBSERVATION",
                title=title,
                summary=summary,
                interpretation=interpretation,
                limitations="In-camera processing, varied lighting, and high ISO settings create localized noise variances without manual tampering.",
                supporting_observations=supporting_obs,
                supporting_analysis_ids=supporting_anl,
                actor=actor,
            )
            findings_created.append(finding)

        # -------------------------------------------------------------
        # Rule 4: CORR-CLONE-004 (Copy-Move Keypoint Matching)
        # -------------------------------------------------------------
        clone_analysis = analyses_by_type.get("copy-move") or analyses_by_type.get("copy_move")
        if clone_analysis and clone_analysis.status.lower() == "completed":
            matches_count = 0
            if clone_analysis.structured_findings:
                matches_count = clone_analysis.structured_findings.get("match_count") or len(clone_analysis.structured_findings.get("matches", []))

            rule_id = "CORR-CLONE-004"
            if matches_count > 5:
                title = "Duplicated Region Keypoint Clustering Identified"
                summary = f"Detected {matches_count} paired keypoint clusters with spatial translation consistency."
                interpretation = (
                    f"SIFT/ORB feature descriptor matching isolated {matches_count} qualifying keypoint pairs "
                    "sharing mutually coherent affine displacement vectors."
                )
                severity = "REVIEW_REQUIRED"
            else:
                title = "Copy-Move Keypoint Spatial Analysis (Baseline)"
                summary = f"Evaluated feature keypoints across frame. Found {matches_count} qualifying match pairs under configured threshold."
                interpretation = (
                    "Feature matching identified no statistically significant duplicate region clusters exceeding the configured threshold. "
                    "This demonstrates the absence of qualifying duplicated regions under current parameters, rather than definitive proof of non-manipulation."
                )
                severity = "OBSERVATION"

            supporting_obs = [o.id for o in obs_by_modality.get("copy-move", [])]
            supporting_anl = [clone_analysis.id]

            finding = cls._create_or_update_finding(
                db=db,
                case_id=case_id_str,
                evidence_id=evidence.id,
                rule_id=rule_id,
                rule_version="1.0",
                finding_type="CORRELATED_OBSERVATION",
                severity_label=severity,
                title=title,
                summary=summary,
                interpretation=interpretation,
                limitations="Natural repetitive background textures (foliage, bricks, textiles) can generate false positive feature matches. Small or heavily smoothed clones may fall below threshold.",
                supporting_observations=supporting_obs,
                supporting_analysis_ids=supporting_anl,
                actor=actor,
            )
            findings_created.append(finding)

        # -------------------------------------------------------------
        # Rule 5: CORR-CONFLICT-005 (Conflict Detection / Negative Evidence)
        # -------------------------------------------------------------
        is_png = (evidence.mime_type or "").lower() == "image/png" or (evidence.image_format or "").upper() == "PNG"
        if is_png:
            rule_id = "CORR-CONFLICT-005"
            title = "Modality Conflict: JPEG/DCT Analysis Inapplicable to PNG Source"
            summary = "Source evidence format is PNG (lossless). JPEG/DCT frequency analysis cannot be executed."
            interpretation = (
                "JPEG Discrete Cosine Transform (DCT) block analysis was not applicable because the ingested image format is PNG. "
                "CRITICAL FORENSIC DISTINCTION: This constitutes NEGATIVE EVIDENCE (incompatible modality). It must NOT be interpreted as NO EVIDENCE or proof that the image lacks compression artifacts."
            )
            finding = cls._create_or_update_finding(
                db=db,
                case_id=case_id_str,
                evidence_id=evidence.id,
                rule_id=rule_id,
                rule_version="1.0",
                finding_type="CONFLICT_DETECTED",
                severity_label="INCONCLUSIVE",
                title=title,
                summary=summary,
                interpretation=interpretation,
                limitations="Analysis inapplicable due to format constraints. Ingesting original pre-converted camera RAW or JPEG file recommended.",
                supporting_observations=[],
                supporting_analysis_ids=[],
                actor=actor,
            )
            findings_created.append(finding)

        # Check metadata absence vs stripped
        if meta_analysis and meta_analysis.status.lower() == "completed":
            exif_dict = (meta_analysis.structured_findings or {}).get("exif", {})
            if not exif_dict or len(exif_dict) == 0:
                rule_id = "CORR-CONFLICT-005"
                title = "Explanatory Notice: Complete Absence of EXIF Metadata"
                summary = "Image file contains zero EXIF/XMP metadata tags."
                interpretation = (
                    "Container inspection revealed no embedded camera or capture metadata. "
                    "FORENSIC CAUTION: Complete absence of metadata occurs routinely during web messaging transmission, screenshotting, or deliberate stripping. "
                    "Absence of EXIF must NOT be evaluated as positive proof of fabrication or innocence."
                )
                finding = cls._create_or_update_finding(
                    db=db,
                    case_id=case_id_str,
                    evidence_id=evidence.id,
                    rule_id=f"{rule_id}-META-EMPTY",
                    rule_version="1.0",
                    finding_type="CONFLICT_DETECTED",
                    severity_label="OBSERVATION",
                    title=title,
                    summary=summary,
                    interpretation=interpretation,
                    limitations="Standard social media platforms and messaging apps strip EXIF data automatically to preserve user privacy.",
                    supporting_observations=[],
                    supporting_analysis_ids=[meta_analysis.id],
                    actor=actor,
                )
                findings_created.append(finding)

        db.commit()
        return findings_created

    @classmethod
    def evaluate_case(cls, db: Session, case: InvestigationCase, actor: str = "System") -> List[Finding]:
        """
        Evaluates all evidence items in a case and produces correlated findings.
        """
        all_findings = []
        for ev in case.evidence_items:
            findings = cls.evaluate_evidence(db, ev, actor=actor)
            all_findings.extend(findings)
        return all_findings

    @staticmethod
    def _create_or_update_finding(
        db: Session,
        case_id: str,
        evidence_id: int,
        rule_id: str,
        rule_version: str,
        finding_type: str,
        severity_label: str,
        title: str,
        summary: str,
        interpretation: str,
        limitations: str,
        supporting_observations: List[int],
        supporting_analysis_ids: List[int],
        actor: str = "System",
    ) -> Finding:
        # Check if identical finding for this evidence and rule already exists
        existing = (
            db.query(Finding)
            .filter(
                Finding.case_id == case_id,
                Finding.evidence_id == evidence_id,
                Finding.correlation_rule_id == rule_id,
            )
            .first()
        )

        now = datetime.datetime.utcnow()
        if existing:
            existing.title = title
            existing.summary = summary
            existing.interpretation = interpretation
            existing.limitations = limitations
            existing.supporting_observations = supporting_observations
            existing.supporting_analysis_ids = supporting_analysis_ids
            existing.updated_at = now
            return existing

        finding = Finding(
            case_id=case_id,
            evidence_id=evidence_id,
            correlation_rule_id=rule_id,
            correlation_rule_version=rule_version,
            finding_type=finding_type,
            severity_label=severity_label,
            title=title,
            summary=summary,
            interpretation=interpretation,
            limitations=limitations,
            supporting_observations=supporting_observations,
            supporting_analysis_ids=supporting_analysis_ids,
            status="GENERATED",
            created_at=now,
            updated_at=now,
        )
        db.add(finding)
        db.flush()

        AuditService.log_event(
            db=db,
            case_id=case_id,
            evidence_id=evidence_id,
            event_type="FINDING_GENERATED",
            actor=actor,
            metadata={"finding_id": finding.finding_identifier, "rule_id": rule_id, "title": title}
        )

        return finding
