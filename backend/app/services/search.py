from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.domain import (
    InvestigationCase,
    Evidence,
    AnalysisJob,
    Analysis,
    Finding,
    AnalystNote,
    Report,
)

class SearchService:
    @classmethod
    def search_case(
        cls,
        db: Session,
        query_str: str,
        case: Optional[InvestigationCase] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Performs a case-scoped search across evidence, jobs, analyses, findings, notes, and reports.
        """
        hits: List[Dict[str, Any]] = []
        if not query_str or not query_str.strip():
            return hits

        term = f"%{query_str.strip()}%"
        case_filter_id = case.id if case else None
        case_ident = case.case_identifier if case else None

        # 1. Search Evidence
        ev_query = db.query(Evidence)
        if case_filter_id:
            ev_query = ev_query.filter(Evidence.case_id == case_filter_id)
        ev_query = ev_query.filter(
            (Evidence.original_filename.ilike(term)) |
            (Evidence.evidence_identifier.ilike(term)) |
            (Evidence.sha256_hash.ilike(term)) |
            (Evidence.mime_type.ilike(term))
        )
        for ev in ev_query.limit(limit).all():
            hits.append({
                "entity_type": "EVIDENCE",
                "entity_id": ev.evidence_identifier,
                "title": f"Evidence: {ev.original_filename}",
                "snippet": f"SHA-256: {ev.sha256_hash[:16]}... | MIME: {ev.mime_type} | {ev.width}x{ev.height}px",
                "case_id": case_ident or str(ev.case_id),
                "metadata": {"id": ev.id, "filename": ev.original_filename}
            })

        # 2. Search Analyses & Jobs
        if case_filter_id:
            evidence_ids = [e.id for e in case.evidence_items]
        else:
            evidence_ids = []

        if not case_filter_id or evidence_ids:
            anl_query = db.query(Analysis)
            if evidence_ids:
                anl_query = anl_query.filter(Analysis.evidence_id.in_(evidence_ids))
            anl_query = anl_query.filter(
                (Analysis.analysis_identifier.ilike(term)) |
                (Analysis.analysis_type.ilike(term)) |
                (Analysis.summary.ilike(term))
            )
            for a in anl_query.limit(limit).all():
                hits.append({
                    "entity_type": "ANALYSIS",
                    "entity_id": a.analysis_identifier,
                    "title": f"Analysis: {a.analysis_type.upper()}",
                    "snippet": a.summary or f"Status: {a.status}",
                    "case_id": case_ident or "N/A",
                    "metadata": {"analysis_id": a.id, "evidence_id": a.evidence_id}
                })

            job_query = db.query(AnalysisJob)
            if evidence_ids:
                job_query = job_query.filter(AnalysisJob.evidence_id.in_(evidence_ids))
            job_query = job_query.filter(
                (AnalysisJob.job_identifier.ilike(term)) |
                (AnalysisJob.analysis_type.ilike(term)) |
                (AnalysisJob.status.ilike(term))
            )
            for j in job_query.limit(limit).all():
                hits.append({
                    "entity_type": "JOB",
                    "entity_id": j.job_identifier,
                    "title": f"Job: {j.analysis_type} ({j.status})",
                    "snippet": f"Queued: {j.queued_at} | Status: {j.status}",
                    "case_id": case_ident or "N/A",
                    "metadata": {"job_id": j.id, "evidence_id": j.evidence_id}
                })

        # 3. Search Findings
        fnd_query = db.query(Finding)
        if case_ident:
            fnd_query = fnd_query.filter(
                (Finding.case_id == case_ident) | (Finding.case_id == str(case.id))
            )
        fnd_query = fnd_query.filter(
            (Finding.finding_identifier.ilike(term)) |
            (Finding.title.ilike(term)) |
            (Finding.summary.ilike(term)) |
            (Finding.interpretation.ilike(term)) |
            (Finding.correlation_rule_id.ilike(term))
        )
        for f in fnd_query.limit(limit).all():
            hits.append({
                "entity_type": "FINDING",
                "entity_id": f.finding_identifier,
                "title": f"Finding: {f.title}",
                "snippet": f"[{f.severity_label}] {f.summary}",
                "case_id": f.case_id,
                "metadata": {"finding_id": f.id, "status": f.status, "rule_id": f.correlation_rule_id}
            })

        # 4. Search Analyst Notes
        note_query = db.query(AnalystNote)
        if case_ident:
            note_query = note_query.filter(
                (AnalystNote.case_id == case_ident) | (AnalystNote.case_id == str(case.id))
            )
        note_query = note_query.filter(
            (AnalystNote.note_identifier.ilike(term)) |
            (AnalystNote.content.ilike(term)) |
            (AnalystNote.author.ilike(term))
        )
        for n in note_query.limit(limit).all():
            hits.append({
                "entity_type": "NOTE",
                "entity_id": n.note_identifier,
                "title": f"Note by {n.author} on {n.target_type}",
                "snippet": n.content[:120] + ("..." if len(n.content) > 120 else ""),
                "case_id": n.case_id,
                "metadata": {"note_id": n.id, "target_type": n.target_type, "target_id": n.target_id}
            })

        # 5. Search Reports
        rpt_query = db.query(Report)
        if case_ident:
            rpt_query = rpt_query.filter(
                (Report.case_id == case_ident) | (Report.case_id == str(case.id))
            )
        rpt_query = rpt_query.filter(Report.report_identifier.ilike(term))
        for r in rpt_query.limit(limit).all():
            hits.append({
                "entity_type": "REPORT",
                "entity_id": r.report_identifier,
                "title": f"Report: {r.report_identifier}",
                "snippet": f"Generated: {r.generated_at} | Format: {r.report_type}",
                "case_id": r.case_id,
                "metadata": {"report_id": r.id, "status": r.status}
            })

        return hits[:limit]
