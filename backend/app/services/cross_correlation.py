import os
import cv2
import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.domain import InvestigationCase, Evidence, Analysis, Finding
from app.services.audit import AuditService
from app.schemas.v3 import (
    CrossImageCorrelationResponse,
    SharedCameraCluster,
    TemporalSequenceItem,
    CrossImageMatchPair,
)

class CrossCorrelationService:
    """
    Evaluates multi-evidence relationships within a case:
    1. Shared Camera Hardware Fingerprints (Make, Model, Lens, Software)
    2. Temporal Sequence Reconstruction & Proximity Detection
    3. Cross-Image Feature Descriptor Matching (Cross-Image Clone/Splicing Candidates)
    """

    @classmethod
    def evaluate_case(
        cls,
        db: Session,
        case: InvestigationCase,
        actor: str = "System"
    ) -> CrossImageCorrelationResponse:
        evidence_items = db.query(Evidence).filter(Evidence.case_id == case.id).all()
        total_ev = len(evidence_items)

        if total_ev < 2:
            return CrossImageCorrelationResponse(
                case_identifier=case.case_identifier,
                total_evidence_evaluated=total_ev,
                camera_clusters=[],
                temporal_sequence=[],
                cross_image_matches=[],
                findings_generated=0,
                evaluation_timestamp=datetime.datetime.now(datetime.timezone.utc),
            )

        # 1. Fetch metadata analyses
        meta_analyses = (
            db.query(Analysis)
            .filter(
                Analysis.evidence_id.in_([e.id for e in evidence_items]),
                Analysis.analysis_type == "metadata",
                Analysis.status == "completed"
            )
            .all()
        )
        meta_by_ev_id = {a.evidence_id: (a.structured_findings or {}) for a in meta_analyses}

        # 2. Camera Clusters
        camera_clusters = cls._build_camera_clusters(evidence_items, meta_by_ev_id)

        # 3. Temporal Sequence
        temporal_seq = cls._build_temporal_sequence(evidence_items, meta_by_ev_id)

        # 4. Cross-Image Keypoint Matching
        cross_matches = cls._match_cross_image_keypoints(evidence_items)

        # 5. Generate / Update Deterministic Findings
        findings_count = cls._generate_cross_findings(
            db=db,
            case=case,
            clusters=camera_clusters,
            temporal_seq=temporal_seq,
            cross_matches=cross_matches,
            actor=actor
        )

        return CrossImageCorrelationResponse(
            case_identifier=case.case_identifier,
            total_evidence_evaluated=total_ev,
            camera_clusters=camera_clusters,
            temporal_sequence=temporal_seq,
            cross_image_matches=cross_matches,
            findings_generated=findings_count,
            evaluation_timestamp=datetime.datetime.now(datetime.timezone.utc),
        )

    @classmethod
    def _build_camera_clusters(
        cls,
        evidence_items: List[Evidence],
        meta_map: Dict[int, Dict[str, Any]]
    ) -> List[SharedCameraCluster]:
        cluster_buckets: Dict[str, List[Evidence]] = {}
        cluster_info: Dict[str, Dict[str, Optional[str]]] = {}

        for ev in evidence_items:
            m = meta_map.get(ev.id, {})
            exif = m.get("exif", {}) or {}

            make = str(exif.get("Make") or "").strip()
            model = str(exif.get("Model") or "").strip()
            software = str(exif.get("Software") or m.get("software") or "").strip()
            serial = str(exif.get("BodySerialNumber") or exif.get("SerialNumber") or "").strip()

            if make or model or software:
                key = f"{make}|{model}|{software}|{serial}"
                cluster_buckets.setdefault(key, []).append(ev)
                if key not in cluster_info:
                    cluster_info[key] = {
                        "make": make or None,
                        "model": model or None,
                        "software": software or None,
                        "serial": serial or None,
                    }

        clusters: List[SharedCameraCluster] = []
        cluster_idx = 1

        for key, ev_list in cluster_buckets.items():
            if len(ev_list) >= 2:
                info = cluster_info[key]
                desc_parts = []
                if info["make"]: desc_parts.append(f"Make: {info['make']}")
                if info["model"]: desc_parts.append(f"Model: {info['model']}")
                if info["software"]: desc_parts.append(f"Software: {info['software']}")
                if info["serial"]: desc_parts.append(f"Serial: {info['serial']}")

                significance = (
                    f"Evidence items share capture container fingerprints ({', '.join(desc_parts)}). "
                    "This establishes consistent hardware origin or post-processing pipeline alignment across multiple items."
                )

                clusters.append(SharedCameraCluster(
                    cluster_id=f"CAM-CLUSTER-{cluster_idx:03d}",
                    make=info["make"],
                    model=info["model"],
                    software=info["software"],
                    serial_number=info["serial"],
                    evidence_ids=[e.id for e in ev_list],
                    filenames=[e.original_filename for e in ev_list],
                    forensic_significance=significance
                ))
                cluster_idx += 1

        return clusters

    @classmethod
    def _build_temporal_sequence(
        cls,
        evidence_items: List[Evidence],
        meta_map: Dict[int, Dict[str, Any]]
    ) -> List[TemporalSequenceItem]:
        parsed_items = []

        for ev in evidence_items:
            m = meta_map.get(ev.id, {})
            exif = m.get("exif", {}) or {}

            dt_str = exif.get("DateTimeOriginal") or exif.get("DateTimeDigitized") or exif.get("DateTime")
            source_tag = "EXIF DateTimeOriginal" if dt_str else "Evidence Ingest Time"
            
            dt_obj = None
            if dt_str:
                for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S"):
                    try:
                        dt_obj = datetime.datetime.strptime(str(dt_str).strip(), fmt)
                        break
                    except ValueError:
                        continue

            if not dt_obj:
                dt_obj = ev.created_at

            parsed_items.append({
                "evidence_id": ev.id,
                "filename": ev.original_filename,
                "dt_obj": dt_obj,
                "dt_str": dt_obj.strftime("%Y-%m-%d %H:%M:%S UTC") if dt_obj else None,
                "source_tag": source_tag
            })

        parsed_items.sort(key=lambda x: x["dt_obj"] or datetime.datetime.min)

        sequence: List[TemporalSequenceItem] = []
        for i, item in enumerate(parsed_items):
            delta = None
            if i > 0 and parsed_items[i-1]["dt_obj"] and item["dt_obj"]:
                delta = (item["dt_obj"] - parsed_items[i-1]["dt_obj"]).total_seconds()

            sequence.append(TemporalSequenceItem(
                evidence_id=item["evidence_id"],
                filename=item["filename"],
                timestamp_utc=item["dt_str"],
                timestamp_delta_seconds=round(delta, 2) if delta is not None else None,
                source_tag=item["source_tag"]
            ))

        return sequence

    @classmethod
    def _match_cross_image_keypoints(
        cls,
        evidence_items: List[Evidence],
        max_pairs: int = 15
    ) -> List[CrossImageMatchPair]:
        matches: List[CrossImageMatchPair] = []
        detector = cv2.ORB_create(nfeatures=500)
        matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

        # Precompute descriptors
        descriptors_map: Dict[int, Any] = {}
        for ev in evidence_items:
            if ev.stored_path and os.path.exists(ev.stored_path):
                img = cv2.imread(ev.stored_path, cv2.IMREAD_GRAYSCALE)
                if img is not None:
                    # Resize to manageable dimension for efficient comparison
                    h, w = img.shape[:2]
                    scale = min(1.0, 800.0 / max(h, w))
                    if scale < 1.0:
                        img = cv2.resize(img, (int(w * scale), int(h * scale)))
                    _, des = detector.detectAndCompute(img, None)
                    descriptors_map[ev.id] = des

        # Compare pairs
        pair_count = 0
        for i in range(len(evidence_items)):
            for j in range(i + 1, len(evidence_items)):
                if pair_count >= max_pairs:
                    break
                ev_a = evidence_items[i]
                ev_b = evidence_items[j]

                des_a = descriptors_map.get(ev_a.id)
                des_b = descriptors_map.get(ev_b.id)

                if des_a is not None and des_b is not None and len(des_a) >= 20 and len(des_b) >= 20:
                    try:
                        raw_matches = matcher.match(des_a, des_b)
                        # Filter by Hamming distance threshold
                        good = [m for m in raw_matches if m.distance < 45.0]
                        match_count = len(good)

                        if match_count > 15:
                            confidence = "ELEVATED" if match_count > 40 else "MODERATE"
                            matches.append(CrossImageMatchPair(
                                evidence_a_id=ev_a.id,
                                evidence_a_filename=ev_a.original_filename,
                                evidence_b_id=ev_b.id,
                                evidence_b_filename=ev_b.original_filename,
                                shared_keypoint_count=match_count,
                                confidence_label=confidence,
                                forensic_explanation=(
                                    f"Detected {match_count} shared invariant feature keypoints between "
                                    f"'{ev_a.original_filename}' and '{ev_b.original_filename}'. "
                                    "This observation warrants analyst review for common scene origin, near-duplicate capture, or spliced source material."
                                ),
                                limitations=(
                                    "Natural repetitive environmental features (foliage, masonry arrays, architectural grids) "
                                    "can produce accidental descriptor matches. Analyst manual verification of keypoint spatial layout is required."
                                )
                            ))
                            pair_count += 1
                    except Exception:
                        continue

        return matches

    @classmethod
    def _generate_cross_findings(
        cls,
        db: Session,
        case: InvestigationCase,
        clusters: List[SharedCameraCluster],
        temporal_seq: List[TemporalSequenceItem],
        cross_matches: List[CrossImageMatchPair],
        actor: str = "System"
    ) -> int:
        now = datetime.datetime.now(datetime.timezone.utc)
        created_count = 0

        # Cluster findings
        for c in clusters:
            rule_id = "CORR-CROSS-CAM-001"
            title = f"Cross-Image Common Hardware Signature ({c.cluster_id})"
            summary = f"{len(c.evidence_ids)} images share capture device profile ({c.make or 'Unknown'} {c.model or ''})."
            interpretation = (
                f"Evaluation of metadata across evidence items reveals identical camera hardware and processing signatures "
                f"across images: {', '.join(c.filenames)}. WHAT WAS FOUND: Shared container signatures. "
                "WHY IT MATTERS: Connects disparate evidence items to a single capture device or editing workstation. "
                "RECOMMENDED NEXT STEP: Verify camera serial number continuity and match against known suspect hardware."
            )
            limitations = "Identical mass-market cameras produce identical Make/Model tags. Software tags can reflect standard viewers."

            cls._upsert_finding(
                db=db,
                case_id=case.case_identifier,
                evidence_id=c.evidence_ids[0] if c.evidence_ids else None,
                rule_id=f"{rule_id}-{c.cluster_id}",
                title=title,
                summary=summary,
                interpretation=interpretation,
                limitations=limitations,
                severity_label="CORRELATED_OBSERVATION",
                actor=actor,
                now=now
            )
            created_count += 1

        # Match findings
        for m in cross_matches:
            rule_id = "CORR-CROSS-MATCH-003"
            title = f"Cross-Image Feature Keypoint Correlation ({m.evidence_a_filename} & {m.evidence_b_filename})"
            summary = f"Isolated {m.shared_keypoint_count} shared invariant keypoints between two case images."
            interpretation = (
                f"WHAT WAS FOUND: {m.shared_keypoint_count} matching ORB/SIFT feature points. "
                "WHY IT MATTERS: Suggests potential image reuse, splicing donor relationship, or same-scene capture angle. "
                "RECOMMENDED NEXT STEP: Perform side-by-side keypoint vector alignment in Compare Mode to confirm spatial consistency."
            )
            cls._upsert_finding(
                db=db,
                case_id=case.case_identifier,
                evidence_id=m.evidence_a_id,
                rule_id=f"{rule_id}-{m.evidence_a_id}-{m.evidence_b_id}",
                title=title,
                summary=summary,
                interpretation=interpretation,
                limitations=m.limitations,
                severity_label="REVIEW_REQUIRED",
                actor=actor,
                now=now
            )
            created_count += 1

        db.commit()
        return created_count

    @staticmethod
    def _upsert_finding(
        db: Session,
        case_id: str,
        evidence_id: Optional[int],
        rule_id: str,
        title: str,
        summary: str,
        interpretation: str,
        limitations: str,
        severity_label: str,
        actor: str,
        now: datetime.datetime
    ):
        existing = (
            db.query(Finding)
            .filter(
                Finding.case_id == case_id,
                Finding.correlation_rule_id == rule_id,
            )
            .first()
        )
        if existing:
            existing.title = title
            existing.summary = summary
            existing.interpretation = interpretation
            existing.limitations = limitations
            existing.updated_at = now
        else:
            fnd = Finding(
                case_id=case_id,
                evidence_id=evidence_id,
                correlation_rule_id=rule_id,
                correlation_rule_version="3.0",
                finding_type="CROSS_IMAGE_CORRELATION",
                severity_label=severity_label,
                title=title,
                summary=summary,
                interpretation=interpretation,
                limitations=limitations,
                status="GENERATED",
                created_at=now,
                updated_at=now,
            )
            db.add(fnd)
            db.flush()
            AuditService.log_event(
                db=db,
                case_id=case_id,
                evidence_id=evidence_id,
                event_type="FINDING_GENERATED",
                actor=actor,
                metadata={"finding_id": fnd.finding_identifier, "rule_id": rule_id, "title": title}
            )
