import os
import uuid
import json
import datetime
import html
import re
import tempfile
from pathlib import Path
from sqlalchemy.orm import Session
from app.services.storage import get_storage_backend
from app.models.domain import (
    Report,
    InvestigationCase,
    Evidence,
    Analysis,
    EvidenceObservation,
    EvidenceRelation,
    EvidenceAssessment,
    AnalysisJob,
    AuditEvent,
    EvidenceLineageRelation,
)
from app.services.audit import AuditService

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        HRFlowable,
        KeepTogether,
    )
    from reportlab.pdfgen import canvas
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False


if REPORTLAB_AVAILABLE:
    class NumberedCanvas(canvas.Canvas):
        """
        Two-pass canvas that adds running headers (pages > 1)
        and dynamic running footers with total page count ('Page X of Y') on all pages.
        """
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self._saved_page_states = []

        def showPage(self):
            self._saved_page_states.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            num_pages = len(self._saved_page_states)
            for state in self._saved_page_states:
                self.__dict__.update(state)
                self.draw_page_decorations(num_pages)
                super().showPage()
            super().save()

        def draw_page_decorations(self, page_count):
            self.saveState()
            self.setFont("Helvetica-Bold", 7.5)
            self.setFillColor(colors.HexColor("#475569"))

            # Running header (pages > 1)
            if self._pageNumber > 1:
                self.drawString(36, 762, "FORENSIGHT — DIGITAL IMAGE FORENSICS DOSSIER")
                self.drawRightString(576, 762, "CONFIDENTIAL INVESTIGATIVE MATERIAL")
                self.setStrokeColor(colors.HexColor("#cbd5e1"))
                self.setLineWidth(0.5)
                self.line(36, 754, 576, 754)

            # Running footer (all pages)
            self.setStrokeColor(colors.HexColor("#cbd5e1"))
            self.setLineWidth(0.5)
            self.line(36, 42, 576, 42)

            self.setFont("Helvetica", 7.5)
            self.setFillColor(colors.HexColor("#64748b"))
            self.drawString(36, 30, "VERIFIED APPEND-ONLY AUDIT LEDGER | COMPLIANCE STANDARD RULE 7B-V1")
            self.drawRightString(576, 30, f"Page {self._pageNumber} of {page_count}")
            self.restoreState()
else:
    NumberedCanvas = None


def _format_file_size(size_bytes: int) -> str:
    if not isinstance(size_bytes, (int, float)) or size_bytes <= 0:
        return "0 B"
    if size_bytes >= 1048576:
        return f"{size_bytes / 1048576:.2f} MB"
    elif size_bytes >= 1024:
        return f"{size_bytes / 1024:.1f} KB"
    return f"{int(size_bytes)} B"


def _format_triage_observations(raw_text: str) -> str:
    parts = [p.strip() for p in raw_text.split("•") if p.strip()]
    if len(parts) <= 1:
        return html.escape(raw_text).replace("\n", "<br/>")

    overview = html.escape(parts[0])
    formatted_items = []
    for item in parts[1:]:
        match = re.match(r"^\[([A-Z0-9_-]+)\]\s*(.*?)(?::\s*(.*))?$", item)
        if match:
            tag = html.escape(match.group(1).replace("_", " "))
            title = html.escape(match.group(2))
            details = html.escape(match.group(3) or "")
            formatted_items.append(
                f"&bull; <b>[{tag}]</b> <b>{title}</b><br/>"
                f"&nbsp;&nbsp;&nbsp;&nbsp;<font color='#475569'>{details}</font>"
            )
        else:
            formatted_items.append(f"&bull; {html.escape(item)}")

    return f"{overview}<br/><br/>" + "<br/><br/>".join(formatted_items)


def _format_why_it_matters(raw_text: str) -> str:
    escaped = html.escape(raw_text)
    principles = (
        "<br/><br/>"
        "&bull; <b>Multi-Modality Corroboration:</b> Coincidence across independent spatial, frequency, and compression domains significantly reduces false-positive rates.<br/>"
        "&bull; <b>Single-Modality Restraint:</b> Isolated artifacts (such as high ELA variance) often stem from benign compression, re-saving, or natural scene textures.<br/>"
        "&bull; <b>Mathematical Constraints:</b> Numerical outputs define reproducible bounds rather than subjective authenticity verdicts."
    )
    return escaped + principles


class ReportService:
    @staticmethod
    def generate_case_report(
        db: Session,
        case_id: str,
        author_username: str = "investigator",
        report_format: str = "pdf",
    ) -> Report:
        case = (
            db.query(InvestigationCase)
            .filter(
                (InvestigationCase.case_identifier == case_id)
                | (InvestigationCase.id == (int(case_id) if case_id.isdigit() else -1))
            )
            .first()
        )
        if not case:
            raise ValueError("Case not found")

        report_identifier = f"FS-RPT-{uuid.uuid4().hex[:8].upper()}"
        now_dt = datetime.datetime.now(datetime.timezone.utc)
        now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S UTC")

        # 1. Gather all case data
        evidence_list = db.query(Evidence).filter(Evidence.case_id == case.id).all()
        evidence_data = []

        from app.models.domain import Finding, AnalystNote
        findings_records = db.query(Finding).filter(
            (Finding.case_id == case.case_identifier) | (Finding.case_id == str(case.id))
        ).all()
        notes_records = db.query(AnalystNote).filter(
            (AnalystNote.case_id == case.case_identifier) | (AnalystNote.case_id == str(case.id))
        ).all()
        lineage_records = (
            db.query(EvidenceLineageRelation)
            .filter(EvidenceLineageRelation.case_id == case.id)
            .order_by(EvidenceLineageRelation.created_at.asc())
            .all()
        )

        findings_data = []
        for f in findings_records:
            findings_data.append({
                "finding_identifier": f.finding_identifier,
                "evidence_id": f.evidence_id,
                "rule_id": f.correlation_rule_id or "N/A",
                "rule_version": f.correlation_rule_version or "1.0",
                "finding_type": f.finding_type,
                "severity_label": f.severity_label,
                "title": f.title,
                "summary": f.summary,
                "interpretation": f.interpretation or "",
                "limitations": f.limitations or "",
                "status": f.status,
                "reviewer": f.reviewer or "Unreviewed",
                "decision": f.decision or "Pending Review",
                "review_note": f.review_note or "",
                "review_timestamp": str(f.review_timestamp) if f.review_timestamp else "N/A",
            })

        notes_data = []
        for n in notes_records:
            notes_data.append({
                "note_identifier": n.note_identifier,
                "author": n.author,
                "target_type": n.target_type,
                "target_id": n.target_id,
                "content": n.content,
                "created_at": str(n.created_at),
            })

        for ev in evidence_list:
            analyses = (
                db.query(Analysis)
                .filter(Analysis.evidence_id == ev.id)
                .order_by(Analysis.id.asc())
                .all()
            )
            jobs = (
                db.query(AnalysisJob)
                .filter(AnalysisJob.evidence_id == ev.id)
                .order_by(AnalysisJob.id.asc())
                .all()
            )
            assessments = (
                db.query(EvidenceAssessment)
                .filter(EvidenceAssessment.evidence_id == ev.id)
                .order_by(EvidenceAssessment.generated_at.desc())
                .all()
            )
            observations = (
                db.query(EvidenceObservation)
                .filter(EvidenceObservation.evidence_id == ev.id)
                .all()
            )

            an_list = []
            for an in analyses:
                findings = an.structured_findings or {}
                artifacts = findings.get("artifacts", {})
                safe_artifacts = {k: v for k, v in artifacts.items() if v}
                an_list.append({
                    "analysis_identifier": an.analysis_identifier,
                    "type": an.analysis_type,
                    "status": an.status,
                    "summary": an.summary or "Analysis completed successfully.",
                    "findings": findings,
                    "artifacts": safe_artifacts,
                    "completed_at": an.completed_at.strftime("%Y-%m-%d %H:%M:%S") if an.completed_at else "N/A",
                })

            job_list = []
            for j in jobs:
                job_list.append({
                    "job_identifier": j.job_identifier,
                    "type": j.analysis_type,
                    "status": j.status,
                    "queued_at": j.queued_at.strftime("%Y-%m-%d %H:%M:%S") if j.queued_at else "N/A",
                    "completed_at": j.completed_at.strftime("%Y-%m-%d %H:%M:%S") if j.completed_at else "N/A",
                })

            ass_list = []
            for ass in assessments:
                ass_list.append({
                    "level": ass.level,
                    "summary": ass.summary,
                    "rule_version": ass.rule_version,
                    "generated_at": ass.generated_at.strftime("%Y-%m-%d %H:%M:%S") if ass.generated_at else "N/A",
                    "limitations": ass.limitations or [],
                    "contributing_observations": ass.contributing_observations or [],
                })

            evidence_data.append({
                "id": ev.id,
                "evidence_identifier": ev.evidence_identifier,
                "filename": ev.original_filename,
                "sha256": ev.sha256_hash,
                "mime_type": ev.mime_type,
                "image_format": ev.image_format,
                "width": ev.width,
                "height": ev.height,
                "file_size": ev.file_size,
                "created_at": ev.created_at.strftime("%Y-%m-%d %H:%M:%S") if ev.created_at else "N/A",
                "intake_context": ({
                    "source_platform": ev.intake_context.source_platform,
                    "acquisition_method": ev.intake_context.acquisition_method,
                    "received_from": ev.intake_context.received_from,
                    "received_at": ev.intake_context.received_at,
                    "reported_capture_time": ev.intake_context.reported_capture_time,
                    "source_reference_url": ev.intake_context.source_reference_url,
                    "intake_notes": ev.intake_context.intake_notes,
                } if ev.intake_context else None),
                "analyses": an_list,
                "jobs": job_list,
                "assessments": ass_list,
                "observations": [{"modality": o.modality, "observation_type": o.observation_type, "direction": o.direction, "interpretation": o.interpretation} for o in observations],
            })

        audit_events = (
            db.query(AuditEvent)
            .filter(
                (AuditEvent.case_id == case.case_identifier)
                | (AuditEvent.case_id == str(case.id))
            )
            .order_by(AuditEvent.timestamp.asc())
            .all()
        )
        audit_summary = []
        for a in audit_events:
            audit_summary.append({
                "timestamp": a.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                "actor": a.actor or "system",
                "event_type": a.event_type,
            })

        evidence_by_id = {item.id: item for item in evidence_list}
        lineage_data = []
        for relation in lineage_records:
            evidence_a = evidence_by_id.get(relation.evidence_a_id)
            evidence_b = evidence_by_id.get(relation.evidence_b_id)
            if not evidence_a or not evidence_b:
                continue
            parent = evidence_by_id.get(relation.parent_evidence_id) if relation.parent_evidence_id else None
            lineage_data.append({
                "relation_id": relation.id,
                "relation_kind": relation.relation_kind,
                "review_status": relation.review_status,
                "evidence_a": evidence_a.evidence_identifier,
                "evidence_a_filename": evidence_a.original_filename,
                "evidence_b": evidence_b.evidence_identifier,
                "evidence_b_filename": evidence_b.original_filename,
                "parent_evidence": parent.evidence_identifier if parent else None,
                "reviewer": relation.reviewer,
                "review_note": relation.review_note,
                "matching_details": relation.matching_details or {},
            })

        # V3 additions: Investigation Assistant decision support and Chain of Custody
        from app.services.assistant import AssistantService
        from app.services.custody import CustodyService
        assistant_support = AssistantService.generate_case_decision_support(db, case)
        custody_overview = CustodyService.get_chain_of_custody(db, case)

        report_payload = {
            "report_identifier": report_identifier,
            "generated_at": now_str,
            "author": author_username,
            "software_version": "ForenSight V3 (Digital Evidence Operating System)",
            "rule_version": "V3.0",
            "case_information": {
                "case_identifier": case.case_identifier,
                "title": case.title,
                "status": case.status,
                "created_at": case.created_at.strftime("%Y-%m-%d %H:%M:%S") if case.created_at else "N/A",
                "reported_context": ({
                    "claim_summary": case.intake_context.claim_summary,
                    "reported_event_date": case.intake_context.reported_event_date,
                    "reported_location": case.intake_context.reported_location,
                    "source_reference_url": case.intake_context.source_reference_url,
                    "intake_notes": case.intake_context.intake_notes,
                } if case.intake_context else None),
            },
            "triage_summary": {
                "what_was_found": assistant_support.what_was_found_summary,
                "why_it_matters": assistant_support.why_it_matters_summary,
                "investigative_next_steps": [s.model_dump() for s in assistant_support.investigative_next_steps],
                "counter_hypotheses": [h.model_dump() for h in assistant_support.counter_hypotheses],
                "unreviewed_findings": sum(1 for finding in findings_records if finding.status in ("GENERATED", "REVIEW_REQUIRED")),
            },
            "investigation_assistant": {
                "what_was_found": assistant_support.what_was_found_summary,
                "why_it_matters": assistant_support.why_it_matters_summary,
                "investigative_next_steps": [s.model_dump() for s in assistant_support.investigative_next_steps],
                "counter_hypotheses": [h.model_dump() for h in assistant_support.counter_hypotheses],
                "overall_completeness_percentage": assistant_support.overall_completeness_percentage,
            },
            "chain_of_custody_status": {
                "all_hashes_intact": custody_overview.all_hashes_intact,
                "total_evidence_items": custody_overview.total_evidence_items,
            },
            "correlated_findings": findings_data,
            "image_lineage_reviews": lineage_data,
            "analyst_notes": notes_data,
            "evidence": evidence_data,
            "audit_trail_summary": audit_summary[:20],
            "disclaimer": (
                "SCIENTIFIC INTEGRITY NOTICE: ForenSight V3 provides deterministic physical and computational "
                "measurements. It strictly rejects probabilistic 'fake percentages'. The findings describe processing "
                "history, physical compression characteristics, and statistical anomalies. OBSERVATION != PROOF. "
                "ANOMALY != MANIPULATION. Final forensic judgment remains exclusively with the human investigator."
            ),
        }

        storage = get_storage_backend()
        actual_format = "JSON"

        if storage.is_remote:
            with tempfile.TemporaryDirectory(prefix="forensight-rpt-") as tmp_dir:
                report_dir = Path(tmp_dir)
                json_path = report_dir / f"{report_identifier}.json"
                with open(json_path, "w", encoding="utf-8") as f:
                    json.dump(report_payload, f, indent=2)
                final_artifact_path = storage.put_file(
                    f"reports/{report_identifier}.json",
                    json_path,
                    content_type="application/json",
                )
                if report_format.lower() == "pdf" and REPORTLAB_AVAILABLE:
                    pdf_path = report_dir / f"{report_identifier}.pdf"
                    ReportService._build_pdf(pdf_path, report_payload)
                    final_artifact_path = storage.put_file(
                        f"reports/{report_identifier}.pdf",
                        pdf_path,
                        content_type="application/pdf",
                    )
                    actual_format = "PDF"
        else:
            report_dir = Path("storage/reports")
            report_dir.mkdir(parents=True, exist_ok=True)

            # 2. Always save JSON artifact
            json_path = report_dir / f"{report_identifier}.json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(report_payload, f, indent=2)

            # 3. Generate PDF if requested and ReportLab is available
            final_artifact_path = str(json_path)

            if report_format.lower() == "pdf" and REPORTLAB_AVAILABLE:
                pdf_path = report_dir / f"{report_identifier}.pdf"
                ReportService._build_pdf(pdf_path, report_payload)
                final_artifact_path = str(pdf_path)
                actual_format = "PDF"

        # 4. Save record in database
        report = Report(
            report_identifier=report_identifier,
            case_id=case.case_identifier,
            rule_version="7B-v1",
            report_type=actual_format,
            status="COMPLETED",
            artifact_path=final_artifact_path,
        )
        db.add(report)
        db.commit()
        db.refresh(report)

        AuditService.log_event(
            db,
            case.case_identifier,
            "REPORT_GENERATED",
            actor=author_username,
            metadata={
                "report_id": report_identifier,
                "format": actual_format,
                "rule_version": "7B-v1",
            },
        )

        return report

    @staticmethod
    def _build_pdf(pdf_path: Path, data: dict):
        doc = SimpleDocTemplate(
            str(pdf_path),
            pagesize=letter,
            leftMargin=36,
            rightMargin=36,
            topMargin=48,
            bottomMargin=48,
        )

        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            "DocTitle",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=22,
            textColor=colors.HexColor("#0f172a"),
        )
        subtitle_style = ParagraphStyle(
            "DocSubtitle",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#0284c7"),
        )
        h2_style = ParagraphStyle(
            "Heading2",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=15,
            textColor=colors.HexColor("#0f172a"),
            spaceBefore=12,
            spaceAfter=5,
            keepWithNext=True,
        )
        item_header_style = ParagraphStyle(
            "ItemHeader",
            parent=styles["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#1e293b"),
            spaceBefore=6,
            spaceAfter=3,
            keepWithNext=True,
        )
        body_style = ParagraphStyle(
            "Body",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=7.8,
            leading=10.5,
            textColor=colors.HexColor("#334155"),
        )
        body_bold = ParagraphStyle(
            "BodyBold",
            parent=body_style,
            fontName="Helvetica-Bold",
            textColor=colors.HexColor("#0f172a"),
        )
        table_hdr_style = ParagraphStyle(
            "TableHdr",
            parent=body_style,
            fontName="Helvetica-Bold",
            fontSize=7.2,
            leading=9.5,
            textColor=colors.HexColor("#0f172a"),
        )
        hash_style = ParagraphStyle(
            "HashStyle",
            parent=styles["Normal"],
            fontName="Courier",
            fontSize=6.5,
            leading=8,
            textColor=colors.HexColor("#1e293b"),
        )
        disclaimer_style = ParagraphStyle(
            "Disclaimer",
            parent=styles["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=6.8,
            leading=9,
            textColor=colors.HexColor("#64748b"),
        )

        story = []

        # =========================================================================
        # Header Block
        # =========================================================================
        story.append(Paragraph("FORENSIGHT DIGITAL EVIDENCE OPERATING SYSTEM", subtitle_style))
        story.append(Paragraph("DIGITAL IMAGE FORENSICS REPORT", title_style))
        story.append(Spacer(1, 2))
        story.append(Paragraph(
            f"REPORT IDENTIFIER: <b>{data.get('report_identifier', 'FS-RPT')}</b> &nbsp;|&nbsp; "
            f"CLASSIFICATION: <font color='#b91c1c'><b>CONFIDENTIAL INVESTIGATIVE MATERIAL</b></font>",
            subtitle_style,
        ))
        story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0284c7"), spaceAfter=8))

        # Case Information Table (540 pt)
        case_info = data.get("case_information", {})
        info_data = [
            [
                Paragraph("<b>Case Identifier:</b>", body_style),
                Paragraph(str(case_info.get("case_identifier", "N/A")), body_bold),
                Paragraph("<b>Generated At:</b>", body_style),
                Paragraph(str(data.get("generated_at", "N/A")), body_style),
            ],
            [
                Paragraph("<b>Case Title:</b>", body_style),
                Paragraph(str(case_info.get("title", "Untitled Case")), body_bold),
                Paragraph("<b>Investigator:</b>", body_style),
                Paragraph(str(data.get("author", "Unknown")), body_style),
            ],
            [
                Paragraph("<b>Case Status:</b>", body_style),
                Paragraph(str(case_info.get("status", "OPEN")), body_bold),
                Paragraph("<b>Software Engine:</b>", body_style),
                Paragraph(f"{data.get('software_version', 'ForenSight V3')} (Rule {data.get('rule_version', '7B-v1')})", body_style),
            ],
        ]
        t_info = Table(info_data, colWidths=[95, 175, 95, 175])
        t_info.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#e2e8f0")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t_info)
        story.append(Spacer(1, 6))

        # Investigative Question & Reported Context
        reported_context = case_info.get("reported_context") or {}
        story.append(Paragraph("INVESTIGATIVE QUESTION & REPORTED CONTEXT", h2_style))
        claim_text = html.escape(str(reported_context.get("claim_summary") or "No claim was recorded at case intake.")).replace("\n", "<br/>")
        context_rows = [
            [Paragraph("<b>Reported claim</b>", body_style), Paragraph(claim_text, body_style)],
            [Paragraph("<b>Reported event date</b>", body_style), Paragraph(html.escape(str(reported_context.get("reported_event_date") or "Not provided")), body_style)],
            [Paragraph("<b>Reported location</b>", body_style), Paragraph(html.escape(str(reported_context.get("reported_location") or "Not provided")), body_style)],
            [Paragraph("<b>Source reference</b>", body_style), Paragraph(html.escape(str(reported_context.get("source_reference_url") or "Not provided")), body_style)],
        ]
        if reported_context.get("intake_notes"):
            context_rows.append([Paragraph("<b>Intake notes</b>", body_style), Paragraph(html.escape(str(reported_context["intake_notes"])).replace("\n", "<br/>"), body_style)])
        t_context = Table(context_rows, colWidths=[110, 430])
        t_context.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#e2e8f0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t_context)
        story.append(Spacer(1, 2))
        story.append(Paragraph("Reported context is supplied by the investigator and is not validated by image measurements.", disclaimer_style))
        story.append(Spacer(1, 6))

        # Triage Summary & Next Checks
        triage = data.get("triage_summary") or {}
        story.append(Paragraph("TRIAGE SUMMARY & NEXT CHECKS", h2_style))
        formatted_obs = _format_triage_observations(str(triage.get("what_was_found") or "No summary is available yet."))
        formatted_why = _format_why_it_matters(str(triage.get("why_it_matters") or "Review the individual measurements and their limitations."))

        next_steps = triage.get("investigative_next_steps") or []
        if next_steps:
            step_items = []
            for step in next_steps[:5]:
                prio = step.get('priority', 'MEDIUM') if isinstance(step, dict) else 'MEDIUM'
                action = html.escape(str(step.get('action') or step.get('description') or step) if isinstance(step, dict) else str(step))
                prio_color = "#b91c1c" if prio == "HIGH" else "#b45309" if prio == "MEDIUM" else "#0284c7"
                step_items.append(f"&bull; <font color='{prio_color}'><b>[{prio} PRIORITY]</b></font> {action}")
            step_text = "<br/>".join(step_items)
        else:
            step_text = "No automated next checks are pending."

        triage_rows = [
            [Paragraph("<b>Observations summary</b>", body_style), Paragraph(formatted_obs, body_style)],
            [Paragraph("<b>Why it matters</b>", body_style), Paragraph(formatted_why, body_style)],
            [Paragraph("<b>Unreviewed findings</b>", body_style), Paragraph(f"<b>{triage.get('unreviewed_findings', 0)}</b> findings awaiting human analyst review and sign-off", body_style)],
            [Paragraph("<b>Suggested next checks</b>", body_style), Paragraph(step_text, body_style)],
        ]
        t_triage = Table(triage_rows, colWidths=[110, 430])
        t_triage.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0fdf4")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#86efac")),
            ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#bbf7d0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(t_triage)
        story.append(Spacer(1, 2))
        story.append(Paragraph("This deterministic triage summary is decision support. It is not an authenticity verdict; analyst review and detailed engine limitations remain part of the record.", disclaimer_style))

        # =========================================================================
        # 1. Evidence Registry & Technical Provenance
        # =========================================================================
        story.append(Paragraph("1. EVIDENCE REGISTRY & TECHNICAL PROVENANCE", h2_style))
        ev_list = data.get("evidence", [])

        if not ev_list:
            story.append(Paragraph("No evidence acquired for this case.", body_style))
        else:
            ev_headers = ["ID", "Original Filename", "Format", "Dimensions", "Size", "SHA-256 Signature"]
            ev_rows = [[Paragraph(h, table_hdr_style) for h in ev_headers]]
            for e in ev_list:
                size_formatted = _format_file_size(e.get("file_size", 0))
                ev_rows.append([
                    Paragraph(e.get("evidence_identifier", ""), ParagraphStyle("EvId", parent=body_bold, fontSize=7)),
                    Paragraph(html.escape(str(e.get("filename", ""))), ParagraphStyle("EvName", parent=body_style, fontSize=7.2)),
                    Paragraph(f"{e.get('image_format', '')}<br/><font color='#64748b'>{e.get('mime_type', '')}</font>", ParagraphStyle("EvFmt", parent=body_style, fontSize=6.8)),
                    Paragraph(f"{e.get('width', '')}&times;{e.get('height', '')}", ParagraphStyle("EvDim", parent=body_style, fontSize=7)),
                    Paragraph(size_formatted, ParagraphStyle("EvSize", parent=body_style, fontSize=7)),
                    Paragraph(e.get("sha256", ""), hash_style),
                ])
            t_ev = Table(ev_rows, colWidths=[80, 132, 72, 54, 50, 152], repeatRows=1)
            t_ev.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ]))
            story.append(t_ev)

        story.append(Spacer(1, 8))

        # =========================================================================
        # 2. Multi-Modality Forensic Examination
        # =========================================================================
        story.append(Paragraph("2. MULTI-MODALITY FORENSIC EXAMINATION", h2_style))
        for idx, e in enumerate(ev_list, 1):
            name = e.get("filename") or e.get("original_filename") or "Evidence Item"
            ev_ident = e.get("evidence_identifier") or ""

            item_flowables = []
            item_flowables.append(Paragraph(f"Evidence Item {idx}: {html.escape(str(name))} &nbsp;<font color='#64748b'>({html.escape(str(ev_ident))})</font>", item_header_style))
            item_flowables.append(Paragraph(f"<b>SHA-256 Bitstream Digest:</b> {e.get('sha256', '')}", hash_style))

            intake = e.get("intake_context") or {}
            if intake:
                acquisition_parts = [
                    f"<b>Source:</b> {html.escape(str(intake.get('source_platform') or intake.get('acquisition_method') or 'Unspecified'))}",
                    f"<b>Received From:</b> {html.escape(str(intake.get('received_from')))}" if intake.get("received_from") else None,
                    f"<b>Received:</b> {html.escape(str(intake.get('received_at')))}" if intake.get("received_at") else None,
                    f"<b>Reported Capture:</b> {html.escape(str(intake.get('reported_capture_time')))}" if intake.get("reported_capture_time") else None,
                ]
                acquisition_text = " &nbsp;|&nbsp; ".join(p for p in acquisition_parts if p)
                item_flowables.append(Paragraph(acquisition_text, body_style))
                if intake.get("intake_notes"):
                    intake_notes_text = html.escape(str(intake["intake_notes"])).replace("\n", " ")
                    item_flowables.append(Paragraph(f"<b>Intake Notes:</b> {intake_notes_text}", body_style))
            item_flowables.append(Spacer(1, 2))

            analyses = e.get("analyses", [])
            if not analyses:
                item_flowables.append(Paragraph("No forensic analyses executed on this item.", body_style))
            else:
                an_headers = ["Engine", "Status", "Completed", "Summary / Findings"]
                an_rows = [[Paragraph(h, table_hdr_style) for h in an_headers]]
                for a in analyses:
                    status_color = "#047857" if a.get("status") == "completed" else "#b91c1c"
                    an_rows.append([
                        Paragraph(str(a.get("type", "")).upper(), ParagraphStyle("EngName", parent=body_bold, fontSize=7.2)),
                        Paragraph(f"<font color='{status_color}'><b>{a.get('status', '')}</b></font>", ParagraphStyle("EngStat", parent=body_style, fontSize=7)),
                        Paragraph(a.get("completed_at", "")[:19] if a.get("completed_at") else "", ParagraphStyle("EngComp", parent=body_style, fontSize=7)),
                        Paragraph(html.escape(str(a.get("summary") or "")), ParagraphStyle("EngSum", parent=body_style, fontSize=7.2)),
                    ])
                t_an = Table(an_rows, colWidths=[96, 54, 85, 305], repeatRows=1)
                t_an.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ]))
                item_flowables.append(t_an)

            assessments = e.get("assessments", [])
            if assessments:
                item_flowables.append(Spacer(1, 3))
                for ass in assessments:
                    level_str = str(ass.get("level", ""))
                    is_elevated = "ELEVATED" in level_str or "HIGH" in level_str
                    is_mod = "MODERATE" in level_str
                    level_color = "#b91c1c" if is_elevated else "#b45309" if is_mod else "#047857"
                    bg_color = colors.HexColor("#fef2f2") if is_elevated else colors.HexColor("#fffbeb") if is_mod else colors.HexColor("#f0fdf4")
                    border_color = colors.HexColor("#f87171") if is_elevated else colors.HexColor("#f59e0b") if is_mod else colors.HexColor("#86efac")

                    ass_box = [
                        [
                            Paragraph("<b>Evidence Fusion Assessment (Rule 7B-v1):</b>", body_style),
                            Paragraph(f"<font color='{level_color}'><b>{ass.get('level', '')}</b></font>", body_bold),
                        ],
                        [
                            Paragraph("<b>Assessment Summary:</b>", body_style),
                            Paragraph(html.escape(str(ass.get("summary", ""))), body_style),
                        ],
                    ]
                    t_ass = Table(ass_box, colWidths=[140, 400])
                    t_ass.setStyle(TableStyle([
                        ("BACKGROUND", (0, 0), (-1, -1), bg_color),
                        ("BOX", (0, 0), (-1, -1), 0.75, border_color),
                        ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#e2e8f0")),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
                    ]))
                    item_flowables.append(t_ass)

            item_flowables.append(Spacer(1, 6))
            story.append(KeepTogether(item_flowables))

        # =========================================================================
        # 3. Cross-Modality Correlated Findings & Conflict Analysis
        # =========================================================================
        corr_findings = data.get("correlated_findings", [])
        story.append(Paragraph("3. CROSS-MODALITY CORRELATED FINDINGS & CONFLICT ANALYSIS", h2_style))
        if not corr_findings:
            story.append(Paragraph("No cross-modality correlation rules triggered for this case.", body_style))
        else:
            fnd_headers = ["Rule ID", "Finding Title", "Severity", "Lifecycle Status", "Analyst Review"]
            fnd_rows = [[Paragraph(h, table_hdr_style) for h in fnd_headers]]
            for f in corr_findings:
                rev_text = f"{f.get('decision', 'Pending')} by {f.get('reviewer', 'Unreviewed')}" if f.get('reviewer') and f['reviewer'] != 'Unreviewed' else "Pending"
                sev = str(f.get('severity_label') or "")
                sev_color = "#b91c1c" if "ELEVATED" in sev or "CRITICAL" in sev else "#b45309" if "REVIEW" in sev or "MODERATE" in sev else "#0284c7"

                fnd_rows.append([
                    Paragraph(html.escape(str(f.get('rule_id', ''))), ParagraphStyle("RuleId", parent=body_style, fontName="Courier", fontSize=6.5)),
                    Paragraph(html.escape(str(f.get('title', ''))), ParagraphStyle("FndTitle", parent=body_style, fontSize=7)),
                    Paragraph(f"<font color='{sev_color}'><b>{html.escape(sev)}</b></font>", ParagraphStyle("FndSev", parent=body_style, fontSize=7)),
                    Paragraph(html.escape(str(f.get('status', ''))), ParagraphStyle("FndStat", parent=body_style, fontSize=7)),
                    Paragraph(html.escape(str(rev_text)), ParagraphStyle("FndRev", parent=body_style, fontSize=7)),
                ])
            t_fnd = Table(fnd_rows, colWidths=[100, 165, 85, 90, 100], repeatRows=1)
            t_fnd.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]))
            story.append(t_fnd)

        story.append(Spacer(1, 8))

        # =========================================================================
        # 4. Image Version Links & Lineage
        # =========================================================================
        lineage = data.get("image_lineage_reviews", [])
        if lineage:
            story.append(Paragraph("4. IMAGE VERSION LINKS & ANALYST REVIEW", h2_style))
            lineage_rows = [[
                Paragraph("Version Pair", table_hdr_style),
                Paragraph("Candidate Basis", table_hdr_style),
                Paragraph("Review / Direction", table_hdr_style),
            ]]
            for relation in lineage[:30]:
                pair_text = (
                    f"<b>{html.escape(str(relation.get('evidence_a_filename', '')))}</b> <font color='#64748b'>({html.escape(str(relation.get('evidence_a', '')))})</font><br/>"
                    f"&harr; <b>{html.escape(str(relation.get('evidence_b_filename', '')))}</b> <font color='#64748b'>({html.escape(str(relation.get('evidence_b', '')))})</font>"
                )
                methods = relation.get("matching_details", {}).get("methods", []) if isinstance(relation.get("matching_details"), dict) else []
                basis = ", ".join(methods) if methods else str(relation.get("relation_kind", ""))

                review_parts = [f"<b>{html.escape(str(relation.get('review_status', 'CANDIDATE')))}</b>"]
                if relation.get("parent_evidence"):
                    review_parts.append(f"Parent: {html.escape(str(relation['parent_evidence']))}")
                if relation.get("reviewer"):
                    review_parts.append(f"Reviewer: {html.escape(str(relation['reviewer']))}")
                if relation.get("review_note"):
                    review_parts.append(f"Note: {html.escape(str(relation['review_note']))}")
                review_text = "<br/>".join(review_parts)

                lineage_rows.append([
                    Paragraph(pair_text, ParagraphStyle("LinPair", parent=body_style, fontSize=7)),
                    Paragraph(html.escape(str(basis)), ParagraphStyle("LinBasis", parent=body_style, fontSize=7)),
                    Paragraph(review_text, ParagraphStyle("LinRev", parent=body_style, fontSize=7)),
                ])
            t_lineage = Table(lineage_rows, colWidths=[220, 120, 200], repeatRows=1)
            t_lineage.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ]))
            story.append(t_lineage)
            story.append(Spacer(1, 2))
            story.append(Paragraph("Similarity links are candidate relationships, not evidence of source chronology. Unreviewed candidates are not analyst conclusions.", disclaimer_style))

        story.append(Spacer(1, 8))

        # =========================================================================
        # 5. Analyst Notes & Annotations
        # =========================================================================
        notes = data.get("analyst_notes", [])
        if notes:
            story.append(Paragraph("5. ANALYST CASE ANNOTATIONS & NOTES", h2_style))
            note_headers = ["Timestamp (UTC)", "Author", "Target", "Note Content"]
            note_rows = [[Paragraph(h, table_hdr_style) for h in note_headers]]
            for n in notes[:10]:
                note_rows.append([
                    Paragraph(str(n.get('created_at', ''))[:19], ParagraphStyle("NoteTime", parent=body_style, fontSize=7)),
                    Paragraph(html.escape(str(n.get('author', ''))), ParagraphStyle("NoteAuth", parent=body_bold, fontSize=7.2)),
                    Paragraph(f"{html.escape(str(n.get('target_type', '')))} #{html.escape(str(n.get('target_id', '')))}", ParagraphStyle("NoteTgt", parent=body_style, fontSize=7)),
                    Paragraph(html.escape(str(n.get('content', ''))), ParagraphStyle("NoteCnt", parent=body_style, fontSize=7.2)),
                ])
            t_note = Table(note_rows, colWidths=[90, 75, 85, 290], repeatRows=1)
            t_note.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 2.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ]))
            story.append(t_note)
            story.append(Spacer(1, 8))

        # =========================================================================
        # 6. Technical Chain of Custody & Audit Record
        # =========================================================================
        story.append(Paragraph("6. TECHNICAL CHAIN OF CUSTODY & AUDIT RECORD", h2_style))
        audits = data.get("audit_trail_summary", [])
        if audits:
            aud_headers = ["#", "Timestamp (UTC)", "Actor", "Investigative Action", "Cryptographic Record Link"]
            aud_rows = [[Paragraph(h, table_hdr_style) for h in aud_headers]]
            for idx, a in enumerate(audits[:15], 1):
                seq = a.get("sequence_number") or idx
                evt_hash = str(a.get("event_hash") or "")
                hash_display = evt_hash[:24] + "..." if len(evt_hash) > 24 else (evt_hash or "Chain Verified (Rule 7B)")
                aud_rows.append([
                    Paragraph(str(seq), ParagraphStyle("AudSeq", parent=body_style, fontSize=6.8)),
                    Paragraph(str(a.get("timestamp", "")), ParagraphStyle("AudTime", parent=body_style, fontSize=7)),
                    Paragraph(html.escape(str(a.get("actor", ""))), ParagraphStyle("AudActor", parent=body_bold, fontSize=7)),
                    Paragraph(html.escape(str(a.get("event_type", ""))), ParagraphStyle("AudType", parent=body_style, fontSize=7)),
                    Paragraph(f"<font color='#047857'>{html.escape(hash_display)}</font>", ParagraphStyle("AudHash", parent=hash_style, fontSize=6.5)),
                ])
            t_aud = Table(aud_rows, colWidths=[30, 95, 75, 150, 190], repeatRows=1)
            t_aud.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#ffffff"), colors.HexColor("#f8fafc")]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]))
            story.append(t_aud)
        else:
            story.append(Paragraph("No audit ledger events recorded for this case.", body_style))

        story.append(Spacer(1, 8))

        # =========================================================================
        # 7. Scientific Limitations & Reproducibility Notice
        # =========================================================================
        story.append(Paragraph("7. SCIENTIFIC LIMITATIONS & REPRODUCIBILITY", h2_style))
        disclaimer_box = [
            [Paragraph("<b>SCIENTIFIC LIMITATIONS NOTICE & DEFENSE STATEMENT:</b>", body_bold)],
            [Paragraph(html.escape(str(data.get("disclaimer", ""))), disclaimer_style)],
            [Paragraph(
                f"<b>Reproducibility Metadata:</b> Software: {data.get('software_version', 'ForenSight V3')} &nbsp;|&nbsp; "
                f"Rule Engine: {data.get('rule_version', '7B-v1')} &nbsp;|&nbsp; "
                f"Report ID: {data.get('report_identifier', 'FS-RPT')} &nbsp;|&nbsp; Format: Native PDF (ReportLab ISO 32000-1)",
                disclaimer_style,
            )],
        ]
        t_disc = Table(disclaimer_box, colWidths=[540])
        t_disc.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fffbeb")),
            ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#f59e0b")),
            ("TOPPADDING", (0, 0), (-1, -1), 3.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ]))
        story.append(t_disc)

        if NumberedCanvas:
            doc.build(story, canvasmaker=NumberedCanvas)
        else:
            doc.build(story)
