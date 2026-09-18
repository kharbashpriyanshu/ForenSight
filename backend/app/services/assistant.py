from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.domain import (
    InvestigationCase,
    Evidence,
    Analysis,
    Finding,
)
from app.schemas.v3 import (
    InvestigationAssistantResponse,
    InvestigativeNextStep,
    CounterHypothesis,
    ForensicCompletenessMetric,
)

CORE_MODALITIES = ["metadata", "ela", "noise", "jpeg-dct", "copy-move"]

class AssistantService:
    @classmethod
    def generate_case_decision_support(cls, db: Session, case: InvestigationCase) -> InvestigationAssistantResponse:
        evidence_items = db.query(Evidence).filter(Evidence.case_id == case.id).all()
        total_ev = len(evidence_items)

        if total_ev == 0:
            return InvestigationAssistantResponse(
                case_identifier=case.case_identifier,
                title=case.title,
                evidence_count=0,
                what_was_found_summary="No evidence items have been registered to this case yet.",
                why_it_matters_summary="Forensic analysis cannot commence without ingested digital evidence.",
                investigative_next_steps=[
                    InvestigativeNextStep(
                        priority="HIGH",
                        action="Ingest digital image evidence via single or batch upload.",
                        rationale="Establishes cryptographic SHA-256 acquisition records and chain of custody."
                    )
                ],
                counter_hypotheses=[],
                forensic_completeness=[],
                overall_completeness_percentage=0.0,
                pending_analyst_reviews_count=0,
            )

        ev_ids = [e.id for e in evidence_items]

        # Query all analyses
        analyses = db.query(Analysis).filter(Analysis.evidence_id.in_(ev_ids)).all()
        analyses_by_ev: Dict[int, Dict[str, Analysis]] = {}
        for a in analyses:
            analyses_by_ev.setdefault(a.evidence_id, {})[a.analysis_type.lower()] = a

        # Query all findings
        case_id_str = case.case_identifier
        findings = (
            db.query(Finding)
            .filter((Finding.case_id == case_id_str) | (Finding.case_id == str(case.id)))
            .all()
        )

        unreviewed_findings = [f for f in findings if f.status in ("GENERATED", "REVIEW_REQUIRED")]

        # -------------------------------------------------------------
        # 1. Forensic Completeness Audit
        # -------------------------------------------------------------
        completeness_metrics: List[ForensicCompletenessMetric] = []
        total_applicable_slots = 0
        total_completed_slots = 0

        for mod in CORE_MODALITIES:
            applicable_count = 0
            completed_count = 0

            for ev in evidence_items:
                is_png = "png" in (ev.mime_type or "").lower() or (ev.image_format or "").upper() == "PNG"
                if mod == "jpeg-dct" and is_png:
                    continue  # Inapplicable for PNG

                applicable_count += 1
                ev_anls = analyses_by_ev.get(ev.id, {})
                anl = ev_anls.get(mod)
                if anl and anl.status == "completed":
                    completed_count += 1

            total_applicable_slots += applicable_count
            total_completed_slots += completed_count

            pct = 100.0 if applicable_count == 0 else round((completed_count / applicable_count) * 100.0, 1)
            completeness_metrics.append(ForensicCompletenessMetric(
                modality=mod,
                total_applicable=applicable_count,
                completed=completed_count,
                pending=applicable_count - completed_count,
                percentage=pct
            ))

        overall_pct = 100.0 if total_applicable_slots == 0 else round((total_completed_slots / total_applicable_slots) * 100.0, 1)

        # -------------------------------------------------------------
        # 2. Synthesizing What Was Found & Why It Matters
        # -------------------------------------------------------------
        findings_summary_parts = []
        if len(findings) == 0:
            findings_summary_parts.append("No correlated findings or anomalies registered yet.")
        else:
            findings_summary_parts.append(
                f"Generated {len(findings)} deterministic findings across {total_ev} evidence items ({len(unreviewed_findings)} awaiting analyst review)."
            )
            for f in findings[:3]:
                findings_summary_parts.append(f"• [{f.finding_type}] {f.title}: {f.summary}")

        what_found = (
            f"Case contains {total_ev} registered evidence files with {total_completed_slots} completed forensic modality analyses "
            f"out of {total_applicable_slots} applicable ({overall_pct}% complete). " + " ".join(findings_summary_parts)
        )

        why_matters = (
            "Cross-referencing multiple independent physical modalities (compression quantization, high-frequency ELA variance, "
            "sensor noise residuals, and invariant keypoints) provides mathematically bounded observation sets. "
            "Coincidence across multiple modalities strengthens investigative confidence, while single-modality anomalies require careful scrutiny."
        )

        # -------------------------------------------------------------
        # 3. Actionable Next Steps
        # -------------------------------------------------------------
        next_steps: List[InvestigativeNextStep] = []

        # Check for unreviewed findings
        if unreviewed_findings:
            next_steps.append(InvestigativeNextStep(
                priority="HIGH",
                action=f"Review and sign off on {len(unreviewed_findings)} pending correlated findings in Analyst Workspace.",
                rationale="Forensic integrity requires explicit human analyst judgment on all algorithmically generated observations."
            ))

        # Check for incomplete core modalities
        for metric in completeness_metrics:
            if metric.pending > 0:
                next_steps.append(InvestigativeNextStep(
                    priority="MEDIUM" if metric.percentage > 50 else "HIGH",
                    action=f"Execute batch {metric.modality.upper()} analysis across {metric.pending} remaining applicable evidence items.",
                    rationale=f"Completes the {metric.modality} modality baseline across the entire case corpus."
                ))

        # Check if cross-image correlation has been executed
        has_cross_findings = any(f.finding_type == "CROSS_IMAGE_CORRELATION" for f in findings)
        if total_ev >= 2 and not has_cross_findings:
            next_steps.append(InvestigativeNextStep(
                priority="MEDIUM",
                action="Execute Cross-Image Correlation to identify shared hardware fingerprints and temporal capture sequences.",
                rationale="Evaluates multi-evidence case cohesion and identifies common source devices."
            ))

        # General forensic best practice
        next_steps.append(InvestigativeNextStep(
            priority="LOW",
            action="Perform on-demand cryptographic Chain of Custody re-verification on physical storage.",
            rationale="Confirms zero bit-rot or storage tampering across all acquired evidence files."
        ))

        # -------------------------------------------------------------
        # 4. Counter-Hypotheses & Alternative Explanations
        # -------------------------------------------------------------
        counter_hypotheses: List[CounterHypothesis] = [
            CounterHypothesis(
                phenomenon="Elevated Error Level Analysis (ELA) error variance",
                alternative_benign_explanation=(
                    "Natural high-contrast luminance boundaries (e.g. dark tree branches against bright sky, bold text on white background) "
                    "naturally yield high error residuals during JPEG recompression without manual splicing."
                ),
                testing_recommendation="Examine the image in Multi-Modality Heatmap mode to verify if elevated ELA matches natural scene edges."
            ),
            CounterHypothesis(
                phenomenon="Sensor Noise Residual (PRNU) SNR discrepancies",
                alternative_benign_explanation=(
                    "In-camera dynamic range optimization, local tone mapping, high ISO photon noise, and uneven scene illumination "
                    "produce localized SNR variations in unedited authentic camera captures."
                ),
                testing_recommendation="Compare noise variance against flat uniform regions (blue sky or plain surfaces) rather than complex textures."
            ),
            CounterHypothesis(
                phenomenon="Absence of EXIF / XMP Metadata tags",
                alternative_benign_explanation=(
                    "Virtually all major social media platforms and messaging applications (WhatsApp, Twitter/X, Instagram, iMessage) "
                    "routinely strip all EXIF metadata upon upload to protect user privacy."
                ),
                testing_recommendation="Inquire whether the evidence was exported from a messaging service, and request original camera storage."
            ),
            CounterHypothesis(
                phenomenon="Absence of Copy-Move keypoint matches",
                alternative_benign_explanation=(
                    "Absence of detectable clone matches only indicates no duplicated regions exceeding threshold were found. "
                    "It does NOT prove the image is authentic (ABSENCE OF EVIDENCE != EVIDENCE OF ABSENCE)."
                ),
                testing_recommendation="Rely on corroborating compression and noise residual modalities rather than negative clone results alone."
            )
        ]

        return InvestigationAssistantResponse(
            case_identifier=case.case_identifier,
            title=case.title,
            evidence_count=total_ev,
            what_was_found_summary=what_found,
            why_it_matters_summary=why_matters,
            investigative_next_steps=next_steps,
            counter_hypotheses=counter_hypotheses,
            forensic_completeness=completeness_metrics,
            overall_completeness_percentage=overall_pct,
            pending_analyst_reviews_count=len(unreviewed_findings),
        )
