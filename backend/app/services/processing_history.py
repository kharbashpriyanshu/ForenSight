"""Build an explainable, deliberately non-probabilistic processing-history view."""

from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.models.domain import Analysis, Evidence, EvidenceObservation


ENGINE_OPERATION = {
    "ADJPEG": "JPEG_REENCODING",
    "NADJPEG": "JPEG_REENCODING",
    "JPEG_GHOST": "JPEG_REENCODING",
    "JPEG_QT": "JPEG_REENCODING",
    "JPEG_STRUCTURE": "JPEG_REENCODING",
    "JPEG_HUFFMAN": "JPEG_REENCODING",
    "JPEG_DCT": "JPEG_REENCODING",
    "ELA": "RECOMPRESSION_DIFFERENCE",
    "RESAMPLING": "RESIZING_OR_RESAMPLING",
    "BLOCKING_ARTIFACT": "BLOCK_BOUNDARY_PATTERN",
}

BASE_LIMITATIONS = [
    "These signals describe properties of the received file; they do not establish intent or prove manipulation.",
    "The available classical methods do not reliably recover a unique chronological sequence of image operations.",
    "Alternative benign causes include export, resizing, rotation, screenshots, and platform recompression.",
    "Candidate sequences are unranked and require analyst review against acquisition context and source material.",
]


class ProcessingHistoryService:
    @staticmethod
    def build_for_evidence(db: Session, evidence: Evidence) -> Dict[str, Any]:
        analyses = (
            db.query(Analysis)
            .filter(Analysis.evidence_id == evidence.id)
            .order_by(Analysis.created_at.asc(), Analysis.id.asc())
            .all()
        )
        analysis_ids = [analysis.id for analysis in analyses]
        observations = (
            db.query(EvidenceObservation)
            .filter(EvidenceObservation.analysis_id.in_(analysis_ids))
            .order_by(EvidenceObservation.id.asc())
            .all()
            if analysis_ids else []
        )
        observations_by_analysis: Dict[int, List[EvidenceObservation]] = {}
        for observation in observations:
            observations_by_analysis.setdefault(observation.analysis_id, []).append(observation)

        signals: List[Dict[str, Any]] = []
        operations = set()
        for analysis in analyses:
            if (analysis.status or "").lower() not in {"completed", "complete"}:
                continue
            engine_id = analysis.analysis_type.upper().replace("-", "_")
            operation = ENGINE_OPERATION.get(engine_id)
            if not operation:
                continue
            findings = analysis.structured_findings if isinstance(analysis.structured_findings, dict) else {}
            analysis_observations = observations_by_analysis.get(analysis.id, [])
            limitations = findings.get("limitations", [])
            if isinstance(limitations, str):
                limitations = [limitations]
            elif not isinstance(limitations, list):
                limitations = []
            if not limitations:
                limitations = list(dict.fromkeys(
                    item.limitations for item in analysis_observations if item.limitations
                ))
            elevated_directions = {"anomalous", "elevated", "high", "positive", "inconsistent"}
            direction_signal = any((item.direction or "").strip().lower() in elevated_directions for item in analysis_observations)
            explicit_signal = any(
                value is True
                for key, value in findings.items()
                if key.lower().startswith(("has_", "is_")) and isinstance(value, bool)
            )
            if operation == "RESIZING_OR_RESAMPLING":
                explicit_signal = explicit_signal or bool(findings.get("candidate_regions")) or bool(findings.get("candidate_region_count"))
            indicator_state = "CANDIDATE_INDICATOR" if direction_signal or explicit_signal else "NO_ELEVATED_INDICATOR_RECORDED"
            if indicator_state == "CANDIDATE_INDICATOR" and operation in {"JPEG_REENCODING", "RESIZING_OR_RESAMPLING"}:
                operations.add(operation)
            signals.append({
                "analysis_id": analysis.id,
                "analysis_identifier": analysis.analysis_identifier,
                "engine_id": engine_id,
                "operation_class": operation,
                "indicator_state": indicator_state,
                "summary": analysis.summary or "No summary recorded.",
                "completed_at": analysis.completed_at.isoformat() if analysis.completed_at else None,
                "observations": [
                    {
                        "metric_name": item.metric_name,
                        "raw_value": item.raw_value,
                        "direction": item.direction,
                        "interpretation": item.interpretation,
                        "limitations": item.limitations,
                    }
                    for item in analysis_observations
                ],
                "engine_limitations": limitations,
            })

        candidate_sequences = []
        has_compression = "JPEG_REENCODING" in operations
        has_resampling = "RESIZING_OR_RESAMPLING" in operations
        if has_compression and has_resampling:
            candidate_sequences = [
                {
                    "label": "Resizing or resampling, followed by JPEG re-encoding",
                    "steps": ["RESIZING_OR_RESAMPLING", "JPEG_REENCODING"],
                    "ordering_status": "POSSIBLE_NOT_ESTABLISHED",
                },
                {
                    "label": "JPEG re-encoding, followed by resizing or resampling",
                    "steps": ["JPEG_REENCODING", "RESIZING_OR_RESAMPLING"],
                    "ordering_status": "POSSIBLE_NOT_ESTABLISHED",
                },
            ]
        elif has_compression:
            candidate_sequences = [{
                "label": "JPEG re-encoding is indicated; preceding operations are unknown",
                "steps": ["UNOBSERVED_PRIOR_HISTORY", "JPEG_REENCODING"],
                "ordering_status": "PARTIAL_HISTORY_ONLY",
            }]
        elif has_resampling:
            candidate_sequences = [{
                "label": "Resizing or resampling is indicated; preceding and subsequent operations are unknown",
                "steps": ["UNOBSERVED_PRIOR_HISTORY", "RESIZING_OR_RESAMPLING", "UNOBSERVED_LATER_HISTORY"],
                "ordering_status": "PARTIAL_HISTORY_ONLY",
            }]

        return {
            "evidence_id": evidence.id,
            "evidence_identifier": evidence.evidence_identifier,
            "source_sha256": evidence.sha256_hash,
            "signals": signals,
            "candidate_sequences": candidate_sequences,
            "sequence_ranking": "NONE",
            "limitations": BASE_LIMITATIONS,
            "disclaimer": "This view organizes recorded engine observations into reviewable possibilities. It does not infer a manipulation probability or establish the actual order of operations.",
        }
