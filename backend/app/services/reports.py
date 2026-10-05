import os
import uuid
import json
import datetime
import html
from pathlib import Path
from sqlalchemy.orm import Session
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
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False


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

        report_dir = Path("storage/reports")
        report_dir.mkdir(parents=True, exist_ok=True)

        # 2. Always save JSON artifact
        json_path = report_dir / f"{report_identifier}.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(report_payload, f, indent=2)

        # 3. Generate PDF if requested and ReportLab is available
        actual_format = "JSON"
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
            leftMargin=40,
            rightMargin=40,
            topMargin=40,
            bottomMargin=40,
        )

        styles = getSampleStyleSheet()

        # Custom styles
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
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#0284c7"),
            spaceAfter=10,
        )
        h2_style = ParagraphStyle(
            "Heading2",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=16,
            textColor=colors.HexColor("#1e293b"),
            spaceBefore=12,
            spaceAfter=6,
        )
        body_style = ParagraphStyle(
            "Body",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11.5,
            textColor=colors.HexColor("#334155"),
        )
        body_bold = ParagraphStyle(
            "BodyBold",
            parent=body_style,
            fontName="Helvetica-Bold",
        )
        hash_style = ParagraphStyle(
            "HashStyle",
            parent=styles["Normal"],
            fontName="Courier",
            fontSize=7,
            leading=9,
            textColor=colors.HexColor("#047857"),
        )
        disclaimer_style = ParagraphStyle(
            "Disclaimer",
            parent=styles["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=7.5,
            leading=10,
            textColor=colors.HexColor("#64748b"),
        )

        story = []

        # Header Block
        story.append(Paragraph("FORENSIGHT", subtitle_style))
        story.append(Paragraph("DIGITAL IMAGE FORENSICS REPORT", title_style))
        story.append(Paragraph(f"REPORT IDENTIFIER: {data['report_identifier']} | CLASSIFICATION: CONFIDENTIAL INVESTIGATIVE MATERIAL", subtitle_style))
        story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0284c7"), spaceAfter=12))

        # Case Information Table
        case_info = data["case_information"]
        info_data = [
            [
                Paragraph("<b>Case Identifier:</b>", body_style),
                Paragraph(case_info["case_identifier"], body_bold),
                Paragraph("<b>Generated At:</b>", body_style),
                Paragraph(data["generated_at"], body_style),
            ],
            [
                Paragraph("<b>Case Title:</b>", body_style),
                Paragraph(case_info["title"], body_bold),
                Paragraph("<b>Investigator:</b>", body_style),
                Paragraph(data["author"], body_style),
            ],
            [
                Paragraph("<b>Case Status:</b>", body_style),
                Paragraph(case_info["status"], body_style),
                Paragraph("<b>Software Engine:</b>", body_style),
                Paragraph(f"{data['software_version']} (Rule {data['rule_version']})", body_style),
            ],
        ]
        t_info = Table(info_data, colWidths=[90, 175, 90, 175])
        t_info.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t_info)
        story.append(Spacer(1, 10))

        # Claim-first triage view: reported context is explicitly separated from measured observations.
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
        t_context = Table(context_rows, colWidths=[105, 425])
        t_context.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t_context)
        story.append(Paragraph("Reported context is supplied by the investigator and is not validated by image measurements.", disclaimer_style))
        story.append(Spacer(1, 8))

        triage = data.get("triage_summary") or {}
        story.append(Paragraph("TRIAGE SUMMARY & NEXT CHECKS", h2_style))
        triage_rows = [
            [Paragraph("<b>Observations summary</b>", body_style), Paragraph(html.escape(str(triage.get("what_was_found") or "No summary is available yet.")).replace("\n", "<br/>"), body_style)],
            [Paragraph("<b>Why it matters</b>", body_style), Paragraph(html.escape(str(triage.get("why_it_matters") or "Review the individual measurements and their limitations." )).replace("\n", "<br/>"), body_style)],
            [Paragraph("<b>Unreviewed findings</b>", body_style), Paragraph(str(triage.get("unreviewed_findings", 0)), body_style)],
        ]
        next_steps = triage.get("investigative_next_steps") or []
        if next_steps:
            step_text = "<br/>".join(f"• {html.escape(str(step.get('description') or step.get('action') or step))}" for step in next_steps[:5])
        else:
            step_text = "No automated next checks are pending."
        triage_rows.append([Paragraph("<b>Suggested next checks</b>", body_style), Paragraph(step_text, body_style)])
        t_triage = Table(triage_rows, colWidths=[105, 425])
        t_triage.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#eff6ff")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#bfdbfe")),
            ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#bfdbfe")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t_triage)
        story.append(Paragraph("This deterministic triage summary is decision support. It is not an authenticity verdict; analyst review and the detailed engine limitations remain part of the record.", disclaimer_style))
        story.append(Spacer(1, 10))

        # Evidence Registry
        story.append(Paragraph("1. EVIDENCE REGISTRY & TECHNICAL PROVENANCE", h2_style))
        ev_list = data["evidence"]

        if not ev_list:
            story.append(Paragraph("No evidence acquired for this case.", body_style))
        else:
            ev_headers = ["ID", "Original Filename", "Format", "Dimensions", "Size", "SHA-256 Signature"]
            ev_rows = [[Paragraph(f"<b>{h}</b>", body_style) for h in ev_headers]]
            for e in ev_list:
                ev_rows.append([
                    Paragraph(e["evidence_identifier"], body_bold),
                    Paragraph(html.escape(str(e["filename"])), body_style),
                    Paragraph(f"{e['image_format']} ({e['mime_type']})", body_style),
                    Paragraph(f"{e['width']}x{e['height']}", body_style),
                    Paragraph(f"{e['file_size']} B", body_style),
                    Paragraph(e["sha256"], hash_style),
                ])
            t_ev = Table(ev_rows, colWidths=[65, 110, 85, 60, 50, 160])
            t_ev.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.append(t_ev)

        story.append(Spacer(1, 10))

        # Forensic Analyses & Observations
        story.append(Paragraph("2. MULTI-MODALITY FORENSIC EXAMINATION", h2_style))
        for idx, e in enumerate(ev_list, 1):
            name = e.get("filename") or e.get("original_filename") or "Evidence Item"
            ev_ident = e.get("evidence_identifier") or ""
            story.append(Paragraph(f"<b>Evidence Item {idx}: {html.escape(str(name))} ({html.escape(str(ev_ident))})</b>", body_bold))
            story.append(Paragraph(f"Cryptographic SHA-256 Fingerprint: {e.get('sha256', '')}", hash_style))
            intake = e.get("intake_context") or {}
            if intake:
                acquisition_parts = [
                    f"Received via {intake.get('source_platform') or intake.get('acquisition_method') or 'unspecified method'}",
                    f"from {intake.get('received_from')}" if intake.get("received_from") else None,
                    f"received {intake.get('received_at')}" if intake.get("received_at") else None,
                    f"capture time reported as {intake.get('reported_capture_time')}" if intake.get("reported_capture_time") else None,
                ]
                acquisition_text = html.escape("; ".join(part for part in acquisition_parts if part))
                story.append(Paragraph(f"Acquisition record: {acquisition_text}", body_style))
                if intake.get("intake_notes"):
                    intake_notes_text = html.escape(str(intake["intake_notes"])).replace("\n", "<br/>")
                    story.append(Paragraph(f"Acquisition notes: {intake_notes_text}", body_style))
            story.append(Spacer(1, 4))

            analyses = e["analyses"]
            if not analyses:
                story.append(Paragraph("No forensic analyses executed on this item.", body_style))
            else:
                an_headers = ["Engine", "Status", "Completed", "Summary / Findings"]
                an_rows = [[Paragraph(f"<b>{h}</b>", body_style) for h in an_headers]]
                for a in analyses:
                    an_rows.append([
                        Paragraph(a["type"].upper(), body_bold),
                        Paragraph(a["status"], body_style),
                        Paragraph(a["completed_at"], body_style),
                        Paragraph(a["summary"], body_style),
                    ])
                t_an = Table(an_rows, colWidths=[75, 55, 95, 305])
                t_an.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]))
                story.append(t_an)

            # Evidence Assessments / Fusion
            assessments = e["assessments"]
            if assessments:
                story.append(Spacer(1, 6))
                for ass in assessments:
                    level_color = "#047857" if "LOW" in ass["level"] else "#b45309" if "MODERATE" in ass["level"] else "#b91c1c"
                    ass_box = [
                        [
                            Paragraph("<b>Evidence Fusion Assessment (Rule 7B-v1):</b>", body_style),
                            Paragraph(f"<font color='{level_color}'><b>{ass['level']}</b></font>", body_bold),
                        ],
                        [
                            Paragraph("<b>Assessment Summary:</b>", body_style),
                            Paragraph(ass["summary"], body_style),
                        ],
                    ]
                    t_ass = Table(ass_box, colWidths=[140, 390])
                    t_ass.setStyle(TableStyle([
                        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ]))
                    story.append(t_ass)

            story.append(Spacer(1, 8))

        # 3. Cross-Modality Correlated Findings (Phase 6)
        corr_findings = data.get("correlated_findings", [])
        story.append(Paragraph("3. CROSS-MODALITY CORRELATED FINDINGS & CONFLICT ANALYSIS", h2_style))
        if not corr_findings:
            story.append(Paragraph("No cross-modality correlation rules triggered for this case.", body_style))
        else:
            fnd_headers = ["Rule ID", "Finding Title", "Severity", "Lifecycle Status", "Analyst Review"]
            fnd_rows = [[Paragraph(f"<b>{h}</b>", body_style) for h in fnd_headers]]
            for f in corr_findings:
                rev_text = f"{f['decision']} by {f['reviewer']}" if f['reviewer'] != 'Unreviewed' else "Pending"
                fnd_rows.append([
                    Paragraph(f['rule_id'], body_bold),
                    Paragraph(f['title'], body_style),
                    Paragraph(f['severity_label'], body_style),
                    Paragraph(f['status'], body_style),
                    Paragraph(rev_text, body_style),
                ])
            t_fnd = Table(fnd_rows, colWidths=[80, 160, 95, 95, 100])
            t_fnd.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.append(t_fnd)

        story.append(Spacer(1, 10))

        # 4. Image version lineage and review decisions
        lineage = data.get("image_lineage_reviews", [])
        if lineage:
            story.append(Paragraph("4. IMAGE VERSION LINKS & ANALYST REVIEW", h2_style))
            lineage_rows = [[Paragraph("<b>Version pair</b>", body_style), Paragraph("<b>Candidate basis</b>", body_style), Paragraph("<b>Review / direction</b>", body_style)]]
            for relation in lineage[:30]:
                pair_text = f"{html.escape(relation['evidence_a_filename'])} ({html.escape(relation['evidence_a'])})<br/>↔ {html.escape(relation['evidence_b_filename'])} ({html.escape(relation['evidence_b'])})"
                basis = ", ".join(relation.get("matching_details", {}).get("methods", [])) or relation["relation_kind"]
                review_parts = [relation.get("review_status", "CANDIDATE")]
                if relation.get("parent_evidence"):
                    review_parts.append(f"Parent: {relation['parent_evidence']}")
                if relation.get("reviewer"):
                    review_parts.append(f"Reviewed by: {relation['reviewer']}")
                if relation.get("review_note"):
                    review_parts.append(relation["review_note"])
                review_text = "<br/>".join(html.escape(str(part)) for part in review_parts)
                lineage_rows.append([
                    Paragraph(pair_text, body_style),
                    Paragraph(html.escape(basis), body_style),
                    Paragraph(review_text, body_style),
                ])
            t_lineage = Table(lineage_rows, colWidths=[240, 110, 180])
            t_lineage.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.append(t_lineage)
            story.append(Paragraph("Similarity links are candidate relationships, not evidence of source chronology. Unreviewed candidates are not analyst conclusions.", disclaimer_style))
            story.append(Spacer(1, 10))

        # 5. Analyst Notes & Annotations (Phase 6)
        notes = data.get("analyst_notes", [])
        if notes:
            story.append(Paragraph("5. ANALYST CASE ANNOTATIONS & NOTES", h2_style))
            note_headers = ["Timestamp", "Author", "Target", "Note Content"]
            note_rows = [[Paragraph(f"<b>{h}</b>", body_style) for h in note_headers]]
            for n in notes[:10]:
                note_rows.append([
                    Paragraph(n['created_at'][:19], body_style),
                    Paragraph(n['author'], body_bold),
                    Paragraph(f"{n['target_type']} #{n['target_id']}", body_style),
                    Paragraph(n['content'], body_style),
                ])
            t_note = Table(note_rows, colWidths=[100, 80, 90, 260])
            t_note.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.append(t_note)
            story.append(Spacer(1, 10))

        # 6. Technical Integrity & Audit Trail
        story.append(Paragraph("6. TECHNICAL CHAIN OF CUSTODY & AUDIT RECORD", h2_style))
        audits = data["audit_trail_summary"]
        if audits:
            aud_headers = ["Timestamp (UTC)", "Actor", "Investigative Action"]
            aud_rows = [[Paragraph(f"<b>{h}</b>", body_style) for h in aud_headers]]
            for a in audits[:10]:
                aud_rows.append([
                    Paragraph(a["timestamp"], body_style),
                    Paragraph(a["actor"], body_style),
                    Paragraph(a["event_type"], body_style),
                ])
            t_aud = Table(aud_rows, colWidths=[120, 100, 310])
            t_aud.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]))
            story.append(t_aud)

        story.append(Spacer(1, 10))

        # 7. Scientific Limitations & Reproducibility Notice
        story.append(Paragraph("7. SCIENTIFIC LIMITATIONS & REPRODUCIBILITY", h2_style))
        disclaimer_box = [
            [Paragraph("<b>SCIENTIFIC LIMITATIONS NOTICE & DEFENSE STATEMENT:</b>", body_bold)],
            [Paragraph(data["disclaimer"], disclaimer_style)],
            [Paragraph(
                f"<b>Reproducibility Metadata:</b> Software: {data['software_version']} | Rule Engine: {data['rule_version']} | "
                f"Report ID: {data['report_identifier']} | Format: Native PDF",
                disclaimer_style,
            )],
        ]
        t_disc = Table(disclaimer_box, colWidths=[530])
        t_disc.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fef2f2")),
            ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#f87171")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(t_disc)

        doc.build(story)
