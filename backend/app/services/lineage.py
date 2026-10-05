"""Case-scoped, explainable candidate links between image evidence items."""

from itertools import combinations
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.domain import Evidence, EvidenceLineageRelation, InvestigationCase


MAX_CASE_IMAGES = 80
MAX_ANALYSIS_EDGE = 1600


class LineageService:
    @staticmethod
    def _safe_image_path(evidence: Evidence) -> Path:
        root = Path(settings.STORAGE_DIR).resolve()
        path = Path(evidence.stored_path).resolve()
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise ValueError("Evidence path is outside the configured storage directory") from exc
        if not path.is_file():
            raise FileNotFoundError("Evidence file is not available")
        return path

    @staticmethod
    def _features(path: Path) -> Dict[str, Any]:
        try:
            with Image.open(path) as image:
                image = ImageOps.exif_transpose(image).convert("RGB")
                image.thumbnail((MAX_ANALYSIS_EDGE, MAX_ANALYSIS_EDGE), Image.Resampling.LANCZOS)
                rgb = np.asarray(image)
        except (OSError, UnidentifiedImageError) as exc:
            raise ValueError("Evidence file could not be decoded for comparison") from exc

        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        reduced = cv2.resize(gray, (9, 8), interpolation=cv2.INTER_AREA)
        bits = reduced[:, 1:] >= reduced[:, :-1]
        dhash = 0
        for bit in bits.flatten():
            dhash = (dhash << 1) | int(bit)

        orb = cv2.ORB_create(nfeatures=1400, scaleFactor=1.2, nlevels=8)
        keypoints, descriptors = orb.detectAndCompute(gray, None)
        return {
            "dhash": dhash,
            "gray": gray,
            "keypoints": keypoints or [],
            "descriptors": descriptors,
            "shape": gray.shape,
            "texture_std": float(np.std(gray)),
        }

    @staticmethod
    def _compare(a: Dict[str, Any], b: Dict[str, Any], hash_a: str, hash_b: str) -> Optional[Dict[str, Any]]:
        if hash_a and hash_a == hash_b:
            return {
                "relation_kind": "EXACT_BITSTREAM",
                "matching_details": {
                    "methods": ["SHA256"],
                    "sha256_equal": True,
                    "limitations": ["Equal hashes establish identical file bytes, not the source or truth of the image."],
                },
            }

        dhash_distance = int((a["dhash"] ^ b["dhash"]).bit_count())
        matches_count = 0
        inliers = 0
        inlier_ratio = 0.0
        da, db = a["descriptors"], b["descriptors"]
        if da is not None and db is not None and len(da) >= 8 and len(db) >= 8:
            matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
            pair_matches = matcher.knnMatch(da, db, k=2)
            good = [m for m, n in pair_matches if m.distance < 0.72 * n.distance]
            matches_count = len(good)
            if matches_count >= 8:
                points_a = np.float32([a["keypoints"][m.queryIdx].pt for m in good])
                points_b = np.float32([b["keypoints"][m.trainIdx].pt for m in good])
                try:
                    _, mask = cv2.findHomography(points_a, points_b, cv2.RANSAC, 3.0)
                    if mask is not None:
                        inliers = int(mask.ravel().sum())
                        inlier_ratio = inliers / max(matches_count, 1)
                except cv2.error:
                    # Degenerate matches do not provide geometric support.
                    pass

        height_a, width_a = a["shape"]
        height_b, width_b = b["shape"]
        aspect_a = width_a / max(height_a, 1)
        aspect_b = width_b / max(height_b, 1)
        aspect_delta = abs(aspect_a - aspect_b) / max(aspect_a, aspect_b, 1e-6)
        geometry_supported = inliers >= 12 and inlier_ratio >= 0.35
        low_frequency_supported = (
            dhash_distance <= 3
            and aspect_delta <= 0.015
            and min(a["texture_std"], b["texture_std"]) >= 8.0
        )
        if not geometry_supported and not low_frequency_supported:
            return None

        return {
            "relation_kind": "LIKELY_DERIVATIVE" if geometry_supported else "POSSIBLE_DERIVATIVE",
            "matching_details": {
                "methods": ["ORB_RANSAC"] if geometry_supported else ["DHash", "AspectRatio"],
                "sha256_equal": False,
                "dhash_hamming_distance_64": dhash_distance,
                "keypoint_matches": matches_count,
                "ransac_inliers": inliers,
                "ransac_inlier_ratio": round(inlier_ratio, 4),
                "relative_aspect_ratio_difference": round(aspect_delta, 5),
                "criteria": "At least 12 geometrically consistent ORB inliers at 35% inlier ratio, or DHash distance at most 3 with compatible aspect ratio and non-flat image texture.",
                "limitations": [
                    "Candidate matching thresholds have not been validated as forensic error rates.",
                    "A match indicates visual correspondence only; it does not establish which file came first or whether either image is authentic.",
                    "Repeated textures and screenshots can create false or missed matches; analyst review is required.",
                ],
            },
        }

    @classmethod
    def refresh_case(cls, db: Session, case: InvestigationCase) -> Dict[str, Any]:
        evidence_items = db.query(Evidence).filter(Evidence.case_id == case.id).order_by(Evidence.id.asc()).all()
        if len(evidence_items) > MAX_CASE_IMAGES:
            raise ValueError(f"Lineage refresh supports at most {MAX_CASE_IMAGES} images per case at a time")

        features: Dict[int, Dict[str, Any]] = {}
        for evidence in evidence_items:
            try:
                features[evidence.id] = cls._features(cls._safe_image_path(evidence))
            except (OSError, ValueError):
                continue

        candidate_count = 0
        for evidence_a, evidence_b in combinations(evidence_items, 2):
            if evidence_a.id not in features or evidence_b.id not in features:
                continue
            match = cls._compare(
                features[evidence_a.id], features[evidence_b.id],
                evidence_a.sha256_hash or "", evidence_b.sha256_hash or "",
            )
            if not match:
                continue
            candidate_count += 1
            relation = (
                db.query(EvidenceLineageRelation)
                .filter(
                    EvidenceLineageRelation.case_id == case.id,
                    EvidenceLineageRelation.evidence_a_id == evidence_a.id,
                    EvidenceLineageRelation.evidence_b_id == evidence_b.id,
                )
                .first()
            )
            if relation is None:
                relation = EvidenceLineageRelation(
                    case_id=case.id,
                    evidence_a_id=evidence_a.id,
                    evidence_b_id=evidence_b.id,
                    relation_kind=match["relation_kind"],
                    matching_details=match["matching_details"],
                )
                db.add(relation)
            else:
                relation.relation_kind = match["relation_kind"]
                relation.matching_details = match["matching_details"]

        db.commit()
        return {
            "case_id": case.case_identifier,
            "evidence_count": len(evidence_items),
            "candidate_pair_count": candidate_count,
            "pairs_evaluated": len(evidence_items) * (len(evidence_items) - 1) // 2,
            "matching_is_calibrated": False,
            "disclaimer": "These are image-similarity candidates, not proven parent-child relationships. Review each pair and select a parent manually when known.",
            "relations": cls.list_case_relations(db, case),
        }

    @staticmethod
    def list_case_relations(db: Session, case: InvestigationCase) -> List[Dict[str, Any]]:
        relations = (
            db.query(EvidenceLineageRelation)
            .filter(EvidenceLineageRelation.case_id == case.id)
            .order_by(EvidenceLineageRelation.created_at.desc())
            .all()
        )
        evidence_ids = {item_id for relation in relations for item_id in (relation.evidence_a_id, relation.evidence_b_id)}
        evidence = {item.id: item for item in db.query(Evidence).filter(Evidence.id.in_(evidence_ids)).all()} if evidence_ids else {}
        rows = []
        for relation in relations:
            a, b = evidence.get(relation.evidence_a_id), evidence.get(relation.evidence_b_id)
            if not a or not b:
                continue
            rows.append({
                "id": relation.id,
                "relation_kind": relation.relation_kind,
                "review_status": relation.review_status,
                "parent_evidence_id": relation.parent_evidence_id,
                "reviewer": relation.reviewer,
                "review_note": relation.review_note,
                "reviewed_at": relation.reviewed_at.isoformat() if relation.reviewed_at else None,
                "matching_details": relation.matching_details or {},
                "evidence_a": LineageService._evidence_summary(a),
                "evidence_b": LineageService._evidence_summary(b),
            })
        return rows

    @staticmethod
    def _evidence_summary(evidence: Evidence) -> Dict[str, Any]:
        return {
            "id": evidence.id,
            "evidence_identifier": evidence.evidence_identifier,
            "filename": evidence.original_filename,
            "sha256": evidence.sha256_hash,
            "width": evidence.width,
            "height": evidence.height,
            "created_at": evidence.created_at.isoformat() if evidence.created_at else None,
        }
