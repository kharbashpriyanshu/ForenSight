from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.domain import (
    InvestigationCase,
    Evidence,
    Analysis,
    AnalysisJob,
    EvidenceObservation,
    Finding,
    Report,
)

class GraphService:
    """
    Generates normalized observation and provenance graphs using real database records.
    """

    @classmethod
    def get_case_observation_graph(cls, db: Session, case: InvestigationCase) -> Dict[str, Any]:
        """
        Builds the complete investigation-level observation graph:
        CASE -> EVIDENCE -> ANALYSIS JOB -> ANALYSIS -> OBSERVATION -> FINDING -> REPORT
        """
        nodes: List[Dict[str, Any]] = []
        edges: List[Dict[str, Any]] = []
        seen_node_ids = set()

        def add_node(node_id: str, node_type: str, label: str, metadata: Dict[str, Any] = None):
            if node_id not in seen_node_ids:
                seen_node_ids.add(node_id)
                nodes.append({
                    "id": node_id,
                    "type": node_type,
                    "label": label,
                    "metadata": metadata or {}
                })

        def add_edge(source: str, target: str, edge_type: str):
            edges.append({
                "source": source,
                "target": target,
                "type": edge_type
            })

        case_node_id = f"case:{case.case_identifier}"
        add_node(
            case_node_id,
            "CASE",
            case.title,
            {"identifier": case.case_identifier, "status": case.status, "created_at": str(case.created_at)}
        )

        evidence_items = db.query(Evidence).filter(Evidence.case_id == case.id).all()
        for ev in evidence_items:
            ev_node_id = f"ev:{ev.id}"
            add_node(
                ev_node_id,
                "EVIDENCE",
                ev.original_filename,
                {
                    "identifier": ev.evidence_identifier,
                    "sha256": ev.sha256_hash,
                    "mime_type": ev.mime_type,
                    "dimensions": f"{ev.width}x{ev.height}",
                    "file_size": ev.file_size,
                }
            )
            add_edge(case_node_id, ev_node_id, "CONTAINS")

            # Link Jobs
            jobs = db.query(AnalysisJob).filter(AnalysisJob.evidence_id == ev.id).all()
            for j in jobs:
                job_node_id = f"job:{j.id}"
                add_node(
                    job_node_id,
                    "ANALYSIS_JOB",
                    f"Job: {j.analysis_type} ({j.status})",
                    {"job_identifier": j.job_identifier, "status": j.status, "analysis_type": j.analysis_type}
                )
                add_edge(ev_node_id, job_node_id, "ANALYZED_BY")

            # Link Analyses
            analyses = db.query(Analysis).filter(Analysis.evidence_id == ev.id).all()
            for a in analyses:
                anl_node_id = f"anl:{a.id}"
                add_node(
                    anl_node_id,
                    "ANALYSIS",
                    f"{a.analysis_type.upper()} Analysis",
                    {"identifier": a.analysis_identifier, "status": a.status, "summary": a.summary}
                )
                add_edge(ev_node_id, anl_node_id, "PRODUCED")

                # Artifact nodes if present
                if a.structured_findings and "artifacts" in a.structured_findings:
                    for art_name, art_path in a.structured_findings["artifacts"].items():
                        if art_path:
                            art_node_id = f"art:{a.id}:{art_name}"
                            add_node(
                                art_node_id,
                                "ARTIFACT",
                                f"Artifact: {art_name}",
                                {"analysis_type": a.analysis_type, "artifact_path": art_path}
                            )
                            add_edge(anl_node_id, art_node_id, "GENERATED")

                # Link Observations
                obs_items = db.query(EvidenceObservation).filter(EvidenceObservation.analysis_id == a.id).all()
                for o in obs_items:
                    obs_node_id = f"obs:{o.id}"
                    add_node(
                        obs_node_id,
                        "OBSERVATION",
                        f"Obs: {o.modality} ({o.observation_type})",
                        {
                            "metric": o.metric_name,
                            "technical_reliability": o.technical_reliability,
                            "direction": o.direction,
                            "interpretation": o.interpretation
                        }
                    )
                    add_edge(anl_node_id, obs_node_id, "PRODUCED")

            # Link Findings
            findings = db.query(Finding).filter(Finding.evidence_id == ev.id).all()
            for f in findings:
                fnd_node_id = f"fnd:{f.id}"
                add_node(
                    fnd_node_id,
                    "FINDING",
                    f.title,
                    {
                        "identifier": f.finding_identifier,
                        "finding_type": f.finding_type,
                        "severity_label": f.severity_label,
                        "status": f.status,
                        "correlation_rule_id": f.correlation_rule_id
                    }
                )
                add_edge(ev_node_id, fnd_node_id, "SUPPORTS")

                # If finding has supporting analyses
                if f.supporting_analysis_ids:
                    for aid in f.supporting_analysis_ids:
                        target_anl = f"anl:{aid}"
                        if target_anl in seen_node_ids:
                            add_edge(target_anl, fnd_node_id, "SUPPORTS")

        # Link Reports
        reports = db.query(Report).filter(
            (Report.case_id == case.case_identifier) | (Report.case_id == str(case.id))
        ).all()
        for r in reports:
            rpt_node_id = f"rpt:{r.id}"
            add_node(
                rpt_node_id,
                "REPORT",
                f"Report {r.report_identifier}",
                {"identifier": r.report_identifier, "status": r.status, "generated_at": str(r.generated_at)}
            )
            add_edge(case_node_id, rpt_node_id, "GENERATED")

        return {
            "case_id": case.case_identifier,
            "nodes": nodes,
            "edges": edges
        }

    @classmethod
    def get_case_provenance(cls, db: Session, case: InvestigationCase) -> Dict[str, Any]:
        """
        Builds the hierarchical provenance tree (Objective 6G):
        Evidence -> SHA-256 -> Analyses -> Observations / Artifacts -> Findings
        """
        evidence_items = db.query(Evidence).filter(Evidence.case_id == case.id).all()
        root_evidence = []

        for ev in evidence_items:
            ev_item = {
                "id": f"ev-{ev.id}",
                "type": "EVIDENCE",
                "label": ev.original_filename,
                "sha256": ev.sha256_hash,
                "timestamp": str(ev.created_at),
                "details": {
                    "identifier": ev.evidence_identifier,
                    "mime_type": ev.mime_type,
                    "dimensions": f"{ev.width}x{ev.height}",
                    "file_size": ev.file_size,
                },
                "children": []
            }

            # Add SHA-256 node
            hash_node = {
                "id": f"hash-{ev.id}",
                "type": "HASH_SIGNATURE",
                "label": f"SHA-256: {ev.sha256_hash[:12]}...",
                "sha256": ev.sha256_hash,
                "timestamp": str(ev.created_at),
                "details": {"algorithm": "SHA-256 (NIST FIPS 180-4)", "status": "Bitstream Verified"},
                "children": []
            }
            ev_item["children"].append(hash_node)

            # Add Analyses
            analyses = db.query(Analysis).filter(Analysis.evidence_id == ev.id).all()
            for a in analyses:
                anl_node = {
                    "id": f"anl-{a.id}",
                    "type": "ANALYSIS",
                    "label": f"{a.analysis_type.upper()} Engine",
                    "timestamp": str(a.completed_at or a.created_at),
                    "details": {
                        "analysis_id": a.analysis_identifier,
                        "status": a.status,
                        "summary": a.summary or "Executed"
                    },
                    "children": []
                }

                # Add Observations as children of Analysis
                obs_records = db.query(EvidenceObservation).filter(EvidenceObservation.analysis_id == a.id).all()
                for o in obs_records:
                    anl_node["children"].append({
                        "id": f"obs-{o.id}",
                        "type": "OBSERVATION",
                        "label": f"{o.modality}: {o.observation_type}",
                        "timestamp": str(o.created_at),
                        "details": {
                            "reliability": o.technical_reliability,
                            "interpretation": o.interpretation,
                            "limitations": o.limitations
                        },
                        "children": []
                    })

                # Add Visual Artifacts as children of Analysis
                if a.structured_findings and "artifacts" in a.structured_findings:
                    for art_name, art_path in a.structured_findings["artifacts"].items():
                        if art_path:
                            anl_node["children"].append({
                                "id": f"art-{a.id}-{art_name}",
                                "type": "ARTIFACT",
                                "label": f"Map: {art_name}",
                                "timestamp": str(a.completed_at or a.created_at),
                                "details": {"path": art_path},
                                "children": []
                            })

                ev_item["children"].append(anl_node)

            # Add Findings linked to this Evidence
            findings = db.query(Finding).filter(Finding.evidence_id == ev.id).all()
            for f in findings:
                fnd_node = {
                    "id": f"fnd-{f.id}",
                    "type": "FINDING",
                    "label": f"Finding: {f.title}",
                    "timestamp": str(f.created_at),
                    "details": {
                        "identifier": f.finding_identifier,
                        "rule_id": f.correlation_rule_id,
                        "severity": f.severity_label,
                        "status": f.status,
                        "summary": f.summary,
                    },
                    "children": []
                }
                ev_item["children"].append(fnd_node)

            root_evidence.append(ev_item)

        return {
            "case_id": case.case_identifier,
            "root_evidence": root_evidence
        }
