"""
ForenSight V4 — Keypoint-Based Copy-Move Clone Forensics Engine

Engine ID: CLONE-KEYPOINT
Version: 1.0.0
Category: LOCAL_ANALYSIS

Detects spatially duplicated image regions using independent ORB keypoint extraction,
Hamming distance self-matching, spatial exclusion constraints, Lowe's ratio test,
and affine RANSAC geometric consistency modeling.
"""

import os
import json
import time
import hashlib
import math
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

from app.engine_extensions.contract import (
    BaseForensicEngine,
    InputRequirements,
    ApplicabilityResult,
    ExecutionContext,
    EngineExecutionResult,
)
from app.engine_extensions.categories import EngineCategory
from app.engine_extensions.status import EngineExecutionStatus
from app.engine_extensions.reference import ScientificReference, ReferenceType
from app.engine_extensions.artifact import EngineArtifactMetadata, ArtifactType
from app.engine_extensions.observation import NormalizedObservation


class CloneKeypointParameters(BaseModel):
    """Parameters for Keypoint-Based Copy-Move Clone Detection."""
    max_features: int = Field(1000, ge=100, le=5000, description="Maximum number of ORB keypoints to detect.")
    min_spatial_distance: float = Field(30.0, ge=5.0, le=200.0, description="Minimum Euclidean distance (pixels) between matched keypoints.")
    ratio_threshold: float = Field(0.75, ge=0.50, le=0.95, description="Lowe's ratio test threshold on Hamming distances.")
    min_inliers: int = Field(4, ge=3, le=50, description="Minimum RANSAC inliers required to confirm a geometric transformation.")
    ransac_reproj_threshold: float = Field(5.0, ge=1.0, le=20.0, description="Maximum reprojection error for RANSAC affine consensus.")
    max_dimension: int = Field(2048, ge=256, le=4096, description="Maximum image dimension before proportional downsampling.")


class CloneKeypointEngine(BaseForensicEngine):
    """
    Forensic engine analyzing keypoint-based copy-move cloning.
    Extracts deterministic ORB descriptors, performs spatial-exclusion self-matching,
    applies Lowe's ratio test, and estimates geometric consistency via affine RANSAC.
    """
    engine_id: str = "CLONE-KEYPOINT"
    engine_name: str = "Keypoint-Based Clone Detection"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.LOCAL_ANALYSIS
    description: str = (
        "Detects candidate duplicated regions via independent ORB keypoint extraction, "
        "Hamming distance self-matching, spatial exclusion constraints, and affine RANSAC."
    )
    parameter_schema = CloneKeypointParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG", "PNG", "WEBP", "TIFF"],
        min_dimensions=(32, 32),
        max_dimensions=(4096, 4096),
        color_spaces=["RGB", "GRAYSCALE", "RGBA"],
        requires_file_path=True,
    )

    scientific_references: List[ScientificReference] = [
        ScientificReference(
            title="A SIFT-Based Forensic Method for Copy-Move Attack Detection and Transformation Recovery",
            authors="Amerini, I., Ballan, L., Caldelli, R., Del Bimbo, A., Serra, G.",
            publication_venue="IEEE Transactions on Information Forensics and Security",
            year=2011,
            reference_type=ReferenceType.PAPER,
            notes="Establishes keypoint matching with spatial clustering and geometric transform estimation for copy-move localization."
        ),
        ScientificReference(
            title="Going deeper into copy-move forgery detection: explore image telltales via multi-scale analysis and dense local features",
            authors="Silva, E., Carvalho, T., Ferreira, A., Rocha, A.",
            publication_venue="Journal of Visual Communication and Image Representation",
            year=2015,
            reference_type=ReferenceType.PAPER,
            notes="Analyzes scale-invariant keypoint detection and robust geometric transformation consensus under forensic constraints."
        ),
        ScientificReference(
            title="ORB: An efficient alternative to SIFT or SURF",
            authors="Rublee, E., Rabaud, V., Konolige, K., Bradski, G.",
            publication_venue="Proceedings of the IEEE International Conference on Computer Vision (ICCV)",
            year=2011,
            reference_type=ReferenceType.PAPER,
            notes="Formulates oriented FAST and rotated BRIEF binary descriptors providing rotation invariance and deterministic matching."
        )
    ]

    limitations: List[str] = [
        "Smooth, featureless regions (e.g., clear skies, uniform surfaces) lack sufficient keypoints for analysis.",
        "Heavy compression artifacts or aggressive downsampling may degrade keypoint descriptor repeatability.",
        "Geometric estimation models planar affine transformations (rotation, uniform scale, translation); complex non-rigid warping may escape detection.",
        "Naturally repetitive textures (e.g., architectural grids, fabric patterns) may produce dense candidate pairings, filtered by geometric consensus.",
    ]

    def check_applicability(self, context: ExecutionContext) -> ApplicabilityResult:
        """Determines if the image is applicable for keypoint-based clone detection."""
        if context.width is not None and context.height is not None:
            if context.width < 32 or context.height < 32:
                return ApplicabilityResult(
                    is_applicable=False,
                    reason=f"Image dimensions ({context.width}x{context.height}) below minimum required (32x32) for keypoint extraction.",
                )
        if context.image_format:
            fmt = context.image_format.upper()
            if fmt not in ["JPEG", "JPG", "PNG", "WEBP", "TIFF"]:
                return ApplicabilityResult(
                    is_applicable=False,
                    reason=f"Unsupported format '{fmt}'. Keypoint clone analysis requires standard raster formats.",
                )
        return ApplicabilityResult(is_applicable=True)

    def _resolve_relative_path(self, full_path: str, context: ExecutionContext) -> str:
        """Helper to compute storage-relative path."""
        try:
            rel = os.path.relpath(full_path, context.storage_output_dir)
            return rel.replace("\\", "/")
        except Exception:
            return os.path.basename(full_path)

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        start_time = time.perf_counter()

        applicability = self.check_applicability(context)
        if not applicability.is_applicable:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=f"Analysis skipped: {applicability.reason}",
                observations=[],
                artifacts=[],
                structured_findings={"reason": applicability.reason},
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 1. Parse parameters
        params = context.parameters or {}
        max_features = int(params.get("max_features", 1000))
        min_spatial_dist = float(params.get("min_spatial_distance", 30.0))
        ratio_thresh = float(params.get("ratio_threshold", 0.75))
        min_inliers = int(params.get("min_inliers", 4))
        ransac_thresh = float(params.get("ransac_reproj_threshold", 5.0))
        max_dim = int(params.get("max_dimension", 2048))

        # 2. Load input image safely
        img_path = getattr(context, "stored_path", None)
        if not img_path or not os.path.exists(img_path):
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Evidence file missing at: {img_path}",
                observations=[],
                artifacts=[],
                structured_findings={"error": "File not found"},
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        try:
            pil_img = Image.open(img_path)
            pil_img.load()
            orig_w, orig_h = pil_img.size
            if pil_img.mode != "RGB":
                pil_rgb = pil_img.convert("RGB")
            else:
                pil_rgb = pil_img
            np_rgb = np.array(pil_rgb)
        except Exception as e:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.FAILED,
                summary=f"Failed to read image for keypoint analysis: {str(e)}",
                observations=[],
                artifacts=[],
                structured_findings={"error": str(e)},
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 3. Check for oversized dimensions & downscale if needed
        scale_factor = 1.0
        work_rgb = np_rgb
        if max(orig_w, orig_h) > max_dim:
            scale_factor = max_dim / float(max(orig_w, orig_h))
            new_w = int(orig_w * scale_factor)
            new_h = int(orig_h * scale_factor)
            work_rgb = cv2.resize(np_rgb, (new_w, new_h), interpolation=cv2.INTER_AREA)

        work_gray = cv2.cvtColor(work_rgb, cv2.COLOR_RGB2GRAY)
        H, W = work_gray.shape

        if H < 32 or W < 32:
            return EngineExecutionResult(
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.NOT_APPLICABLE,
                summary=f"Image dimensions ({W}x{H}) below minimum required (32x32).",
                observations=[],
                artifacts=[],
                structured_findings={"reason": "Dimensions below 32x32"},
                execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
            )

        # 4. Deterministic ORB Keypoint Extraction
        cv2.setRNGSeed(42)
        orb = cv2.ORB_create(
            nfeatures=max_features,
            scaleFactor=1.2,
            nlevels=8,
            edgeThreshold=15,
            firstLevel=0,
            WTA_K=2,
            scoreType=cv2.ORB_HARRIS_SCORE,
            patchSize=31,
            fastThreshold=10,
        )

        keypoints, descriptors = orb.detectAndCompute(work_gray, None)
        num_kps = len(keypoints) if keypoints is not None else 0

        # Data structures for tracking matches
        filtered_matches: List[Tuple[int, int, float]] = []  # (idx1, idx2, distance)
        raw_match_candidates: int = 0
        geometric_inliers: List[Dict[str, Any]] = []
        candidate_regions: List[Dict[str, Any]] = []
        affine_model: Optional[Dict[str, Any]] = None

        if descriptors is not None and len(descriptors) >= 4:
            # 5. Keypoint Self-Matching with Spatial Exclusion & Lowe's Ratio Test
            # Match each descriptor against all descriptors.
            # Using cv2.BFMatcher with NORM_HAMMING.
            bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
            # Find up to k=6 nearest neighbors to ensure finding neighbors beyond spatial exclusion
            knn_k = min(6, len(descriptors))
            knn_matches = bf.knnMatch(descriptors, descriptors, k=knn_k)

            seen_pairs = set()
            for query_idx, matches in enumerate(knn_matches):
                q_pt = keypoints[query_idx].pt
                # Filter matches: exclude self (distance == 0, query_idx == train_idx)
                # and exclude matches closer than min_spatial_dist
                spatially_valid = []
                for m in matches:
                    if m.trainIdx == query_idx:
                        continue
                    t_pt = keypoints[m.trainIdx].pt
                    dist_px = math.hypot(q_pt[0] - t_pt[0], q_pt[1] - t_pt[1])
                    if dist_px >= min_spatial_dist:
                        spatially_valid.append(m)

                if len(spatially_valid) >= 1:
                    raw_match_candidates += 1

                if len(spatially_valid) >= 2:
                    m1 = spatially_valid[0]
                    m2 = spatially_valid[1]
                    # Lowe's ratio test on Hamming distance
                    # Avoid division by zero: if m2.distance == 0, ratio is 1.0
                    d1 = float(m1.distance)
                    d2 = float(m2.distance)
                    if d2 > 0 and (d1 / d2) <= ratio_thresh:
                        pair_key = (min(query_idx, m1.trainIdx), max(query_idx, m1.trainIdx))
                        if pair_key not in seen_pairs:
                            seen_pairs.add(pair_key)
                            filtered_matches.append((pair_key[0], pair_key[1], d1))
                elif len(spatially_valid) == 1:
                    # Single spatially valid match with low absolute Hamming distance
                    m1 = spatially_valid[0]
                    if m1.distance <= 32:  # Strong binary match threshold
                        pair_key = (min(query_idx, m1.trainIdx), max(query_idx, m1.trainIdx))
                        if pair_key not in seen_pairs:
                            seen_pairs.add(pair_key)
                            filtered_matches.append((pair_key[0], pair_key[1], float(m1.distance)))

        num_filtered = len(filtered_matches)

        # 6. Affine RANSAC Geometric Consistency Modeling
        if num_filtered >= min_inliers:
            src_pts = np.float32([keypoints[idx1].pt for idx1, idx2, _ in filtered_matches]).reshape(-1, 1, 2)
            dst_pts = np.float32([keypoints[idx2].pt for idx1, idx2, _ in filtered_matches]).reshape(-1, 1, 2)

            # cv2.estimateAffinePartial2D computes rotation, uniform scaling, and translation
            cv2.setRNGSeed(42)
            M, inliers_mask = cv2.estimateAffinePartial2D(
                src_pts,
                dst_pts,
                method=cv2.RANSAC,
                ransacReprojThreshold=ransac_thresh,
                maxIters=2000,
                confidence=0.99,
            )

            if M is not None and inliers_mask is not None:
                inlier_indices = np.where(inliers_mask.ravel() == 1)[0]
                if len(inlier_indices) >= min_inliers:
                    # Decompose affine matrix M:
                    # M = [[s*cos(theta), -s*sin(theta), tx],
                    #      [s*sin(theta),  s*cos(theta), ty]]
                    a, b = M[0, 0], M[1, 0]
                    affine_scale = float(math.sqrt(a * a + b * b))
                    affine_theta_deg = float(math.atan2(b, a) * (180.0 / math.pi))
                    affine_tx = float(M[0, 2])
                    affine_ty = float(M[1, 2])

                    # Calculate reprojection residuals for inliers
                    transformed_src = cv2.transform(src_pts[inlier_indices], M)
                    residuals = np.linalg.norm(transformed_src - dst_pts[inlier_indices], axis=2).ravel()
                    mean_reproj_err = float(np.mean(residuals)) if len(residuals) > 0 else 0.0

                    inv_scale = 1.0 / scale_factor
                    inlier_pairs_records = []
                    src_coords = []
                    dst_coords = []

                    for idx in inlier_indices:
                        i1, i2, dist_val = filtered_matches[idx]
                        pt1 = keypoints[i1].pt
                        pt2 = keypoints[i2].pt

                        # Original image scale coordinates
                        orig_pt1 = (float(pt1[0] * inv_scale), float(pt1[1] * inv_scale))
                        orig_pt2 = (float(pt2[0] * inv_scale), float(pt2[1] * inv_scale))

                        src_coords.append(orig_pt1)
                        dst_coords.append(orig_pt2)

                        inlier_pairs_records.append({
                            "src_point": orig_pt1,
                            "dst_point": orig_pt2,
                            "hamming_distance": dist_val,
                            "work_scale_src": (float(pt1[0]), float(pt1[1])),
                            "work_scale_dst": (float(pt2[0]), float(pt2[1])),
                        })

                    geometric_inliers = inlier_pairs_records

                    # Formulate candidate duplicated regions (source & target bounding boxes)
                    src_arr = np.array(src_coords)
                    dst_arr = np.array(dst_coords)

                    src_bbox = [
                        int(np.min(src_arr[:, 0])),
                        int(np.min(src_arr[:, 1])),
                        int(np.max(src_arr[:, 0])),
                        int(np.max(src_arr[:, 1])),
                    ]
                    dst_bbox = [
                        int(np.min(dst_arr[:, 0])),
                        int(np.min(dst_arr[:, 1])),
                        int(np.max(dst_arr[:, 0])),
                        int(np.max(dst_arr[:, 1])),
                    ]

                    candidate_regions.append({
                        "region_id": "CLONE_KEYPOINT_R1",
                        "source_bounding_box": src_bbox,
                        "target_bounding_box": dst_bbox,
                        "inlier_keypoint_count": len(inlier_indices),
                        "mean_reprojection_error": round(mean_reproj_err, 3),
                        "estimated_scale": round(affine_scale, 4),
                        "estimated_rotation_degrees": round(affine_theta_deg, 2),
                        "estimated_translation": (round(affine_tx * inv_scale, 2), round(affine_ty * inv_scale, 2)),
                    })

                    affine_model = {
                        "matrix": M.tolist(),
                        "scale": round(affine_scale, 4),
                        "rotation_deg": round(affine_theta_deg, 2),
                        "translation": [round(affine_tx * inv_scale, 2), round(affine_ty * inv_scale, 2)],
                        "mean_reprojection_error": round(mean_reproj_err, 3),
                    }

        num_inliers = len(geometric_inliers)
        inlier_ratio = float(num_inliers / num_filtered) if num_filtered > 0 else 0.0

        # 7. Generate Artifacts
        out_dir = context.storage_output_dir or os.path.dirname(img_path)
        os.makedirs(out_dir, exist_ok=True)
        base_name = f"evidence_{context.evidence_id}_{self.engine_id.lower().replace('-', '_')}"

        map_path = os.path.join(out_dir, f"{base_name}_map.png")
        diag_path = os.path.join(out_dir, f"{base_name}_analysis.png")
        json_path = os.path.join(out_dir, f"{base_name}_data.json")

        # Visual Match Map
        self._generate_match_map(
            output_path=map_path,
            original_rgb=work_rgb,
            keypoints=keypoints,
            filtered_matches=filtered_matches,
            geometric_inliers=geometric_inliers,
            candidate_regions=candidate_regions,
            scale_factor=scale_factor,
        )

        # Diagnostic Plot
        self._generate_diagnostic_plot(
            output_path=diag_path,
            num_kps=num_kps,
            raw_candidates=raw_match_candidates,
            num_filtered=num_filtered,
            num_inliers=num_inliers,
            inlier_ratio=inlier_ratio,
            affine_model=affine_model,
            candidate_regions=candidate_regions,
        )

        # Structured Findings
        analysis_data = {
            "engine_id": self.engine_id,
            "engine_version": self.engine_version,
            "evidence_id": context.evidence_id,
            "analysis_id": context.analysis_id,
            "original_dimensions": [orig_w, orig_h],
            "analysis_dimensions": [W, H],
            "scale_factor": round(scale_factor, 4),
            "keypoint_count": num_kps,
            "raw_match_candidates": raw_match_candidates,
            "filtered_match_count": num_filtered,
            "geometric_inlier_count": num_inliers,
            "geometric_inlier_ratio": round(inlier_ratio, 4),
            "affine_model": affine_model,
            "candidate_regions": candidate_regions,
            "inlier_pairs_sample": [
                {
                    "src": p["src_point"],
                    "dst": p["dst_point"],
                    "hamming_dist": p["hamming_distance"],
                }
                for p in geometric_inliers[:50]
            ],
            "parameters": {
                "max_features": max_features,
                "min_spatial_distance": min_spatial_dist,
                "ratio_threshold": ratio_thresh,
                "min_inliers": min_inliers,
                "ransac_reproj_threshold": ransac_thresh,
                "max_dimension": max_dim,
            },
        }

        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(analysis_data, f, indent=2)

        # 8. Artifact Metadata
        artifacts: List[EngineArtifactMetadata] = []

        with open(map_path, "rb") as f:
            map_bytes = f.read()
        artifacts.append(EngineArtifactMetadata(
            artifact_id="clone_keypoint_map",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            analysis_id=context.analysis_id,
            evidence_id=context.evidence_id,
            artifact_type=ArtifactType.VISUALIZATION,
            storage_path=self._resolve_relative_path(map_path, context),
            sha256_hash=hashlib.sha256(map_bytes).hexdigest(),
            mime_type="image/png",
        ))

        with open(diag_path, "rb") as f:
            diag_bytes = f.read()
        artifacts.append(EngineArtifactMetadata(
            artifact_id="clone_keypoint_analysis",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            analysis_id=context.analysis_id,
            evidence_id=context.evidence_id,
            artifact_type=ArtifactType.PLOT,
            storage_path=self._resolve_relative_path(diag_path, context),
            sha256_hash=hashlib.sha256(diag_bytes).hexdigest(),
            mime_type="image/png",
        ))

        with open(json_path, "rb") as f:
            json_bytes = f.read()
        artifacts.append(EngineArtifactMetadata(
            artifact_id="clone_keypoint_json",
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            analysis_id=context.analysis_id,
            evidence_id=context.evidence_id,
            artifact_type=ArtifactType.JSON,
            storage_path=self._resolve_relative_path(json_path, context),
            sha256_hash=hashlib.sha256(json_bytes).hexdigest(),
            mime_type="application/json",
        ))

        # 9. Normalized Observations
        direction = "elevated" if num_inliers >= min_inliers else "informational"
        observations = [
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CLONE_KEYPOINT",
                metric_name="KEYPOINT_COUNT",
                raw_value=str(num_kps),
                normalized_value=float(min(1.0, num_kps / max_features)),
                direction="informational",
                technical_reliability="HIGH",
                result_data={"keypoints": num_kps},
                parameters_used=context.parameters,
                interpretation=f"Detected {num_kps} deterministic ORB keypoints across active spatial gradient regions.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CLONE_KEYPOINT",
                metric_name="RAW_MATCH_COUNT",
                raw_value=str(raw_match_candidates),
                normalized_value=float(min(1.0, raw_match_candidates / 200.0)),
                direction="informational",
                technical_reliability="HIGH",
                result_data={"raw_matches": raw_match_candidates},
                parameters_used=context.parameters,
                interpretation=f"Identified {raw_match_candidates} spatial keypoint neighbor candidates satisfying distance >= {min_spatial_dist}px.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CLONE_KEYPOINT",
                metric_name="FILTERED_MATCH_COUNT",
                raw_value=str(num_filtered),
                normalized_value=float(min(1.0, num_filtered / 100.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"filtered_matches": num_filtered},
                parameters_used=context.parameters,
                interpretation=f"{num_filtered} candidate matches passed Lowe's ratio test (ratio <= {ratio_thresh}).",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CLONE_KEYPOINT",
                metric_name="GEOMETRIC_INLIER_COUNT",
                raw_value=str(num_inliers),
                normalized_value=float(min(1.0, num_inliers / 50.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"geometric_inliers": num_inliers},
                parameters_used=context.parameters,
                interpretation=f"{num_inliers} keypoint pairs confirmed under RANSAC affine transformation consensus (threshold <= {ransac_thresh}px).",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CLONE_KEYPOINT",
                metric_name="GEOMETRIC_INLIER_RATIO",
                raw_value=str(round(inlier_ratio, 4)),
                normalized_value=float(min(1.0, inlier_ratio)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"inlier_ratio": round(inlier_ratio, 4)},
                parameters_used=context.parameters,
                interpretation=f"Geometric consensus ratio of {inlier_ratio:.2%} among filtered candidate pairings.",
                limitations=self.limitations,
            ),
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status="APPLIED",
                observation_type="CLONE_KEYPOINT",
                metric_name="CANDIDATE_REGION_COUNT",
                raw_value=str(len(candidate_regions)),
                normalized_value=float(min(1.0, len(candidate_regions) / 5.0)),
                direction=direction,
                technical_reliability="HIGH",
                result_data={"candidate_regions": len(candidate_regions)},
                parameters_used=context.parameters,
                interpretation=f"Localized {len(candidate_regions)} candidate cloned region pair(s) through geometric consensus.",
                limitations=self.limitations,
            ),
        ]

        summary = (
            f"Keypoint clone analysis: {num_kps} keypoints detected, {num_filtered} filtered match pairs. "
            f"Affine RANSAC consensus confirmed {num_inliers} inliers across {len(candidate_regions)} candidate region pair(s)."
        )

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.APPLIED,
            summary=summary,
            observations=observations,
            artifacts=artifacts,
            structured_findings=analysis_data,
            execution_time_ms=(time.perf_counter() - start_time) * 1000.0,
        )

    def _generate_match_map(
        self,
        output_path: str,
        original_rgb: np.ndarray,
        keypoints: List[cv2.KeyPoint],
        filtered_matches: List[Tuple[int, int, float]],
        geometric_inliers: List[Dict[str, Any]],
        candidate_regions: List[Dict[str, Any]],
        scale_factor: float,
    ) -> None:
        """Draws keypoints, connection vectors, and candidate cloned region bounding boxes."""
        canvas = original_rgb.copy()

        # 1. Draw non-inlier candidate matches in faint gray lines
        inlier_pt_set = set()
        for p in geometric_inliers:
            inlier_pt_set.add((round(p["work_scale_src"][0], 1), round(p["work_scale_src"][1], 1)))

        for i1, i2, _ in filtered_matches[:200]:
            pt1 = (int(round(keypoints[i1].pt[0])), int(round(keypoints[i1].pt[1])))
            pt2 = (int(round(keypoints[i2].pt[0])), int(round(keypoints[i2].pt[1])))
            cv2.line(canvas, pt1, pt2, (160, 174, 192), 1, cv2.LINE_AA)

        # 2. Draw confirmed geometric inliers in vibrant emerald/cyan lines
        for p in geometric_inliers:
            pt1 = (int(round(p["work_scale_src"][0])), int(round(p["work_scale_src"][1])))
            pt2 = (int(round(p["work_scale_dst"][0])), int(round(p["work_scale_dst"][1])))
            cv2.line(canvas, pt1, pt2, (16, 185, 129), 2, cv2.LINE_AA)
            cv2.circle(canvas, pt1, 4, (59, 130, 246), -1)
            cv2.circle(canvas, pt2, 4, (239, 68, 68), -1)

        # 3. Draw bounding boxes around candidate regions if present
        for reg in candidate_regions:
            # Scale coordinates down to work_rgb scale
            s_box = [int(v * scale_factor) for v in reg["source_bounding_box"]]
            t_box = [int(v * scale_factor) for v in reg["target_bounding_box"]]
            cv2.rectangle(canvas, (s_box[0], s_box[1]), (s_box[2], s_box[3]), (59, 130, 246), 2)
            cv2.rectangle(canvas, (t_box[0], t_box[1]), (t_box[2], t_box[3]), (239, 68, 68), 2)
            cv2.putText(canvas, "Source", (s_box[0], max(16, s_box[1] - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (59, 130, 246), 1, cv2.LINE_AA)
            cv2.putText(canvas, "Target", (t_box[0], max(16, t_box[1] - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (239, 68, 68), 1, cv2.LINE_AA)

        # Save visualization
        pil_res = Image.fromarray(canvas)
        pil_res.save(output_path, "PNG")

    def _generate_diagnostic_plot(
        self,
        output_path: str,
        num_kps: int,
        raw_candidates: int,
        num_filtered: int,
        num_inliers: int,
        inlier_ratio: float,
        affine_model: Optional[Dict[str, Any]],
        candidate_regions: List[Dict[str, Any]],
    ) -> None:
        """Draws clean, deterministic 3-panel forensic diagnostic visualization."""
        W, H = 840, 360
        img = Image.new("RGB", (W, H), color=(248, 250, 252))
        draw = ImageDraw.Draw(img)

        # Panel 1: Keypoint Filtering Funnel
        draw.rectangle([20, 20, 270, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((32, 28), "Keypoint Matching Funnel", fill=(30, 41, 59))
        draw.text((32, 46), f"Detected: {num_kps} ORB Features", fill=(100, 116, 139))

        funnel_stages = [
            ("Raw Keypoints", num_kps, 1000, (59, 130, 246)),
            ("Spatial Neighbors", raw_candidates, 500, (14, 165, 233)),
            ("Lowe's Filtered", num_filtered, 200, (168, 85, 247)),
            ("RANSAC Inliers", num_inliers, 50, (16, 185, 129)),
        ]

        for idx, (label, count, max_ref, col) in enumerate(funnel_stages):
            y_base = 80 + idx * 56
            draw.text((32, y_base), label, fill=(51, 65, 85))
            draw.text((180, y_base), f"{count}", fill=(100, 116, 139))
            bar_len = int(min(1.0, count / float(max_ref)) * 210) if max_ref > 0 else 0
            draw.rectangle([32, y_base + 18, 242, y_base + 28], fill=(241, 245, 249))
            draw.rectangle([32, y_base + 18, 32 + bar_len, y_base + 28], fill=col)

        # Panel 2: Geometric Consensus & Inlier Ratio
        draw.rectangle([290, 20, 550, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((302, 28), "Geometric Consensus", fill=(30, 41, 59))
        draw.text((302, 46), f"Inlier Ratio: {inlier_ratio:.1%}", fill=(100, 116, 139))

        # Circular or gauge meter for inlier ratio
        draw.rectangle([320, 90, 520, 190], fill=(248, 250, 252), outline=(226, 232, 240))
        ratio_pct = int(inlier_ratio * 100)
        draw.text((370, 115), f"{ratio_pct}%", fill=(30, 41, 59))
        draw.text((345, 150), "Affine Inlier Rate", fill=(100, 116, 139))

        if affine_model is not None:
            draw.text((310, 215), f"Affine Scale: {affine_model['scale']:.3f}x", fill=(51, 65, 85))
            draw.text((310, 240), f"Rotation: {affine_model['rotation_deg']:.1f} deg", fill=(51, 65, 85))
            draw.text((310, 265), f"Translation: ({affine_model['translation'][0]:.1f}, {affine_model['translation'][1]:.1f})px", fill=(51, 65, 85))
            draw.text((310, 290), f"Mean Residual: {affine_model['mean_reprojection_error']:.2f}px", fill=(16, 185, 129))
        else:
            draw.text((330, 240), "No consensus model", fill=(148, 163, 184))
            draw.text((330, 260), "exceeded threshold", fill=(148, 163, 184))

        # Panel 3: Candidate Duplicated Regions
        draw.rectangle([570, 20, 820, 330], fill=(255, 255, 255), outline=(203, 213, 225), width=1)
        draw.text((582, 28), "Candidate Regions", fill=(30, 41, 59))
        draw.text((582, 46), f"Detected Clusters: {len(candidate_regions)}", fill=(100, 116, 139))

        if len(candidate_regions) > 0:
            for idx, reg in enumerate(candidate_regions[:3]):
                y_base = 80 + idx * 75
                draw.text((582, y_base), f"{reg['region_id']}", fill=(30, 41, 59))
                draw.text((582, y_base + 18), f"Inliers: {reg['inlier_keypoint_count']} keypoints", fill=(16, 185, 129))
                draw.text((582, y_base + 36), f"Rot: {reg['estimated_rotation_degrees']} deg | Scl: {reg['estimated_scale']}x", fill=(100, 116, 139))
                draw.text((582, y_base + 54), f"Err: {reg['mean_reprojection_error']}px", fill=(59, 130, 246))
        else:
            draw.text((600, 160), "No candidate clone", fill=(148, 163, 184))
            draw.text((600, 180), "regions identified", fill=(148, 163, 184))

        img.save(output_path, "PNG")
