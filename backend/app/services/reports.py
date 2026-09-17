import os
import uuid
import json
import datetime
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
                "analyses": an_list,
                "jobs": job_list,
                "assessments": ass_list,
                "observations": [{"family": o.family, "description": o.description, "level": o.level} for o in observations],
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

        report_payload = {
            "report_identifier": report_identifier,
            "generated_at": now_str,
            "author": author_username,
            "software_version": "ForenSight v2.1 (V1 Frozen Core)",
            "rule_version": "7B-v1",
            "case_information": {
                "case_identifier": case.case_identifier,
                "title": case.title,
                "status": case.status,
                "created_at": case.created_at.strftime("%Y-%m-%d %H:%M:%S") if case.created_at else "N/A",
            },
            "evidence": evidence_data,
            "audit_trail_summary": audit_summary[:20],
            "disclaimer": (
                "SCIENTIFIC INTEGRITY NOTICE: ForenSight provides deterministic physical and computational "
                "measurements. It strictly rejects probabilistic 'fake percentages'. The findings describe processing "
                "history and statistical anomalies, which must be interpreted in context by a qualified human forensic analyst."
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
                    Paragraph(e["filename"], body_style),
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
            story.append(Paragraph(f"<b>Evidence Item {idx}: {name} ({ev_ident})</b>", body_bold))
            story.append(Paragraph(f"Cryptographic SHA-256 Fingerprint: {e.get('sha256', '')}", hash_style))
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

        # Technical Integrity & Audit Trail
        story.append(Paragraph("3. TECHNICAL CHAIN OF CUSTODY & AUDIT RECORD", h2_style))
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

        # Scientific Limitations & Legal Notice
        story.append(Paragraph("4. SCIENTIFIC LIMITATIONS & REPRODUCIBILITY", h2_style))
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
