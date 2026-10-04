"""
ForenSight V4 — Geometric Perspective & Vanishing Point Forensics Engine

Engine ID: GEOMETRY-PERSPECTIVE
Version: 1.0.0
Category: GEOMETRIC_ANALYSIS

Evaluates 3D projective geometry, vanishing points (VPs), and the horizon line
to identify perspective inconsistencies, composite splicing, and mismatched camera elevations.
"""

import os
import json
import time
import math
import hashlib
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

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
from app.engine_extensions.geometry.geometry_models import (
    PerspectiveParameters,
    VanishingPoint,
    HorizonLine,
    PerspectiveOutlierLine,
    PerspectiveAnalysisResult,
)


class PerspectiveEngine(BaseForensicEngine):
    """
    GEOMETRY-PERSPECTIVE v1.0.0 — Geometric Perspective & Vanishing Point Consistency Engine.
    Detects composite splicing and perspective violations through straight line segment extraction,
    RANSAC vanishing point clustering, and horizon line estimation.
    """
    engine_id: str = "GEOMETRY-PERSPECTIVE"
    engine_name: str = "Perspective & Vanishing Point Analysis"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.GEOMETRIC_ANALYSIS
    description: str = (
        "Evaluates 3D linear perspective geometry, identifies vanishing points and horizon line, "
        "and detects composite splicing where inserted objects violate the scene's projective convergence."
    )
    parameter_schema = PerspectiveParameters

    input_requirements: InputRequirements = InputRequirements(
        supported_formats=["JPEG", "JPG", "PNG", "WEBP", "TIFF"],
        min_dimensions=(64, 64),
        max_dimensions=(8192, 8192),
        color_spaces=["RGB", "GRAYSCALE", "RGBA"],
        requires_file_path=True,
    )

    def get_scientific_references(self) -> List[ScientificReference]:
        return [
            ScientificReference(
                reference_id="HARTLEY_ZISSERMAN_2004",
                reference_type=ReferenceType.ACADEMIC_PAPER,
                title="Multiple View Geometry in Computer Vision (2nd Edition)",
                authors=["Richard Hartley", "Andrew Zisserman"],
                year=2004,
                publication="Cambridge University Press",
                relevance="Mathematical principles of projective geometry, vanishing points, and horizon estimation."
            ),
            ScientificReference(
                reference_id="KEE_FARID_2011",
                reference_type=ReferenceType.ACADEMIC_PAPER,
                title="Exposing Digital Forgeries from 3-D Lighting and Geometry",
                authors=["Eric Kee", "James F. O'Brien", "Hany Farid"],
                year=2011,
                publication="IEEE Transactions on Information Forensics and Security",
                relevance="Geometric perspective consistency and vanishing ray convergence for forensic verification."
            ),
            ScientificReference(
                reference_id="TARDIF_2009",
                reference_type=ReferenceType.ACADEMIC_PAPER,
                title="Non-iterative approach for fast and accurate vanishing point detection",
                authors=["Jean-Philippe Tardif"],
                year=2009,
                publication="IEEE 12th International Conference on Computer Vision (ICCV)",
                relevance="RANSAC and J-Linkage vanishing point extraction from image line segments."
            )
        ]

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        t0 = time.perf_counter()
        params = PerspectiveParameters(**context.parameters) if context.parameters else PerspectiveParameters()

        ev_path = getattr(context, "file_path", None) or context.stored_path
        if not os.path.isabs(ev_path):
            from app.core.config import settings
            cand = os.path.join(settings.STORAGE_DIR, ev_path)
            if os.path.exists(cand):
                ev_path = cand

        if not os.path.exists(ev_path):
            return self._fail("Evidence file does not exist on disk", time.perf_counter() - t0)

        # 1. Load image
        img_bgr = cv2.imread(ev_path)
        if img_bgr is None:
            return self._fail("OpenCV failed to decode image bitstream", time.perf_counter() - t0)

        h, w = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        # 2. Extract Straight Line Segments
        lines = self._extract_line_segments(gray, params)
        if len(lines) < 6:
            # Low rectilinear texture scene (e.g. smooth sky or featureless sand)
            return self._empty_result(w, h, len(lines), time.perf_counter() - t0)

        # 3. RANSAC Vanishing Point Clustering
        vp_clusters, outlier_lines = self._cluster_vanishing_points(lines, w, h, params)

        # 4. Estimate Horizon Line
        horizon = self._estimate_horizon_line(vp_clusters, w, h)

        # 5. Compute Perspective Consistency Metrics
        total_lines = len(lines)
        clustered_count = sum(len(c["lines"]) for c in vp_clusters)
        outlier_count = len(outlier_lines)
        outlier_ratio = outlier_count / max(1, total_lines)

        # Inconsistency score based on outlier ratio and vanishing point dispersion
        inconsistency_score = min(1.0, max(0.0, outlier_ratio * 1.6))
        if len(vp_clusters) == 0:
            inconsistency_score = 0.50
            verdict = "INCONCLUSIVE_GEOMETRY"
            interpretation = "Insufficient concurrent vanishing points detected to establish a definitive perspective frame."
        elif inconsistency_score > 0.45:
            verdict = "PERSPECTIVE_ANOMALY"
            interpretation = (
                f"Significant geometric inconsistency detected: {outlier_count} of {total_lines} straight line segments "
                f"({outlier_ratio*100:.1f}%) violate all dominant scene vanishing points. "
                "This indicates candidate composite splicing or altered perspective elevation."
            )
        elif inconsistency_score > 0.25:
            verdict = "MODERATE_GEOMETRIC_VARIANCE"
            interpretation = (
                f"Moderate perspective variance ({outlier_count} non-conforming line segments). "
                "Secondary objects may have non-rectilinear orientations or slight optical barrel distortion."
            )
        else:
            verdict = "PERSPECTIVE_CONSISTENT"
            interpretation = (
                f"Strong linear perspective consistency: {clustered_count} of {total_lines} segments converge "
                f"precisely across {len(vp_clusters)} primary vanishing points."
            )

        vp_models = [
            VanishingPoint(
                vp_index=i + 1,
                x=round(float(c["vp"][0]), 2),
                y=round(float(c["vp"][1]), 2),
                conforming_lines=len(c["lines"]),
                mean_residual_deg=round(float(c["mean_error"]), 2),
                is_at_infinity=bool(c["at_infinity"])
            )
            for i, c in enumerate(vp_clusters)
        ]

        outlier_models = [
            PerspectiveOutlierLine(
                x1=round(float(l[0]), 1),
                y1=round(float(l[1]), 1),
                x2=round(float(l[2]), 1),
                y2=round(float(l[3]), 1),
                length=round(float(math.hypot(l[2]-l[0], l[3]-l[1])), 1),
                min_angular_error_deg=round(float(err), 2)
            )
            for l, err in outlier_lines[:25]
        ]

        analysis_result = PerspectiveAnalysisResult(
            total_segments=total_lines,
            clustered_segments=clustered_count,
            outlier_segments=outlier_count,
            outlier_ratio=round(outlier_ratio, 4),
            perspective_inconsistency_score=round(inconsistency_score, 4),
            verdict=verdict,
            vanishing_points=vp_models,
            horizon=horizon,
            outliers=outlier_models,
            interpretation=interpretation
        )

        # 6. Generate Forensic Visual Artifact
        artifact_path, artifact_meta = self._generate_perspective_overlay(
            img_bgr, lines, vp_clusters, outlier_lines, horizon, context, params
        )

        elapsed = time.perf_counter() - t0

        # 7. Build Normalized Observations
        direction = "anomalous" if inconsistency_score > 0.45 else ("elevated" if inconsistency_score > 0.25 else "consistent")
        observations = [
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.COMPLETED.value,
                observation_type="GEOMETRIC_PERSPECTIVE",
                metric_name="PERSPECTIVE_INCONSISTENCY_SCORE",
                raw_value=f"{inconsistency_score:.4f}",
                normalized_value=inconsistency_score,
                direction=direction,
                technical_reliability="HIGH",
                result_data={
                    "total_line_segments": total_lines,
                    "conforming_segments": clustered_count,
                    "outlier_segments": outlier_count,
                    "outlier_ratio": round(outlier_ratio, 4),
                    "inconsistency_score": round(inconsistency_score, 4),
                    "dominant_vanishing_points": len(vp_clusters),
                    "horizon_detected": horizon is not None,
                },
                parameters_used=params.model_dump(),
                interpretation=interpretation,
                limitations=[
                    "Assumes scene contains planar rectilinear geometry (walls, roads, windows).",
                    "Extreme optical lens barrel or pincushion distortion can bias straight line Hough detection."
                ]
            )
        ]

        findings_dict = analysis_result.model_dump()
        if artifact_meta:
            findings_dict["artifacts"] = {"perspective_map": artifact_meta.storage_path}

        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.COMPLETED,
            summary=interpretation,
            structured_findings=findings_dict,
            observations=observations,
            artifacts=[artifact_meta] if artifact_meta else [],
            execution_time_ms=elapsed * 1000.0,
            limitations=[
                "Requires presence of rectilinear geometric structures.",
                "Outliers may occasionally occur from non-orthogonal real-world objects."
            ]
        )

    def _extract_line_segments(self, gray: np.ndarray, params: PerspectiveParameters) -> List[Tuple[float, float, float, float]]:
        """Extracts straight line segments using Edge Detection + Probabilistic Hough Transform."""
        edges = cv2.Canny(gray, params.canny_low, params.canny_high, apertureSize=3)
        hough_lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi / 180,
            threshold=40,
            minLineLength=params.min_line_length,
            maxLineGap=params.max_line_gap
        )
        if hough_lines is None:
            return []

        segments = []
        for l in hough_lines:
            coords = np.ravel(l)
            if len(coords) < 4:
                continue
            x1, y1, x2, y2 = coords[:4]
            length = math.hypot(float(x2 - x1), float(y2 - y1))
            if length >= params.min_line_length:
                segments.append((float(x1), float(y1), float(x2), float(y2)))
        return segments

    def _cluster_vanishing_points(
        self,
        lines: List[Tuple[float, float, float, float]],
        width: int,
        height: int,
        params: PerspectiveParameters
    ) -> Tuple[List[Dict[str, Any]], List[Tuple[Tuple[float, float, float, float], float]]]:
        """Clusters lines into primary vanishing points using iterative RANSAC."""
        remaining_lines = list(lines)
        vp_clusters = []
        max_vps = params.max_vanishing_points
        tol_deg = params.angle_tolerance_deg

        for vp_idx in range(max_vps):
            if len(remaining_lines) < 4:
                break

            best_vp = None
            best_inliers = []
            best_error = 999.0

            # RANSAC hypothesis generation
            n_iters = min(params.ransac_iterations, len(remaining_lines) * 8)
            for _ in range(n_iters):
                idx1, idx2 = np.random.choice(len(remaining_lines), 2, replace=False)
                l1 = remaining_lines[idx1]
                l2 = remaining_lines[idx2]

                pt = self._line_intersection(l1, l2)
                if pt is None:
                    continue

                px, py = pt
                # Reject intersections that are impossibly close to the image edge or center without orientation
                dist_center = math.hypot(px - width / 2, py - height / 2)
                if dist_center < 10:
                    continue

                inliers = []
                errors = []
                for cand in remaining_lines:
                    err = self._angle_to_point(cand, px, py)
                    if err <= tol_deg:
                        inliers.append(cand)
                        errors.append(err)

                if len(inliers) > len(best_inliers):
                    best_inliers = inliers
                    best_vp = (px, py)
                    best_error = float(np.mean(errors)) if errors else 0.0

            # Require at least 5 lines to form a robust vanishing point
            if best_vp is not None and len(best_inliers) >= 5:
                at_infinity = math.hypot(best_vp[0] - width / 2, best_vp[1] - height / 2) > 10 * max(width, height)
                vp_clusters.append({
                    "vp": best_vp,
                    "lines": best_inliers,
                    "mean_error": best_error,
                    "at_infinity": at_infinity
                })
                # Remove assigned inliers from remaining set
                inlier_set = set(best_inliers)
                remaining_lines = [l for l in remaining_lines if l not in inlier_set]
            else:
                break

        # Calculate minimum error of remaining lines against any discovered VP
        outlier_lines_with_err = []
        for l in remaining_lines:
            min_err = 999.0
            for c in vp_clusters:
                err = self._angle_to_point(l, c["vp"][0], c["vp"][1])
                if err < min_err:
                    min_err = err
            outlier_lines_with_err.append((l, min_err))

        return vp_clusters, outlier_lines_with_err

    def _line_intersection(
        self,
        l1: Tuple[float, float, float, float],
        l2: Tuple[float, float, float, float]
    ) -> Optional[Tuple[float, float]]:
        """Computes Euclidean intersection between two infinite lines passing through segment endpoints."""
        x1, y1, x2, y2 = l1
        x3, y3, x4, y4 = l2

        denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(denom) < 1e-5:
            return None  # Parallel lines

        px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denom
        py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denom
        return px, py

    def _angle_to_point(self, line: Tuple[float, float, float, float], px: float, py: float) -> float:
        """Measures angle in degrees between line segment direction and ray connecting midpoint to target point."""
        x1, y1, x2, y2 = line
        line_angle = math.atan2(y2 - y1, x2 - x1)

        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        ray_angle = math.atan2(py - cy, px - cx)

        diff = abs(line_angle - ray_angle)
        diff = diff % math.pi
        if diff > math.pi / 2:
            diff = math.pi - diff
        return math.degrees(diff)

    def _estimate_horizon_line(
        self,
        vp_clusters: List[Dict[str, Any]],
        width: int,
        height: int
    ) -> Optional[HorizonLine]:
        """Estimates the camera horizon line (vanishing line of the ground plane) from horizontal VPs."""
        if len(vp_clusters) < 2:
            return None

        # Sort VPs by distance to horizontal axis
        pts = [c["vp"] for c in vp_clusters]
        p1 = pts[0]
        p2 = pts[1]

        dx = p2[0] - p1[0]
        dy = p2[1] - p1[1]
        if abs(dx) < 1e-4:
            return None

        slope = dy / dx
        intercept = p1[1] - slope * p1[0]
        roll_deg = math.degrees(math.atan(slope))

        mid_y = slope * (width / 2.0) + intercept
        vert_fraction = mid_y / max(1.0, float(height))

        return HorizonLine(
            slope=round(slope, 6),
            intercept=round(intercept, 2),
            camera_roll_deg=round(roll_deg, 2),
            camera_vertical_fraction=round(vert_fraction, 4)
        )

    def _generate_perspective_overlay(
        self,
        img_bgr: np.ndarray,
        lines: List[Tuple[float, float, float, float]],
        vp_clusters: List[Dict[str, Any]],
        outliers: List[Tuple[Tuple[float, float, float, float], float]],
        horizon: Optional[HorizonLine],
        context: ExecutionContext,
        params: PerspectiveParameters
    ) -> Tuple[str, Optional[EngineArtifactMetadata]]:
        """Generates forensic PNG visualization with color-coded vanishing lines and horizon."""
        canvas = img_bgr.copy()
        h, w = canvas.shape[:2]

        cluster_colors = [
            (248, 189, 56),   # VP1: Sky Blue (BGR: 56, 189, 248) -> OpenCV BGR
            (11, 158, 245),   # VP2: Amber/Gold
            (129, 185, 16),   # VP3: Emerald Green
        ]
        outlier_color = (68, 68, 239)  # Red (BGR)

        # 1. Draw Inlier lines with cluster colors
        for c_idx, cluster in enumerate(vp_clusters):
            col = cluster_colors[c_idx % len(cluster_colors)]
            for l in cluster["lines"]:
                x1, y1, x2, y2 = map(int, l)
                cv2.line(canvas, (x1, y1), (x2, y2), col, 2, cv2.LINE_AA)

        # 2. Draw Outlier lines in red with thick stroke
        for l, _ in outliers:
            x1, y1, x2, y2 = map(int, l)
            cv2.line(canvas, (x1, y1), (x2, y2), outlier_color, 2, cv2.LINE_AA)

        # 3. Draw Horizon Line if present
        if horizon:
            y_left = int(horizon.slope * 0 + horizon.intercept)
            y_right = int(horizon.slope * w + horizon.intercept)
            cv2.line(canvas, (0, y_left), (w, y_right), (42, 135, 184), 3, cv2.LINE_AA)
            cv2.putText(
                canvas,
                f"HORIZON (Roll: {horizon.camera_roll_deg:+.1f} deg)",
                (20, max(30, min(h - 20, (y_left + y_right) // 2 - 10))),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (42, 135, 184),
                2,
                cv2.LINE_AA
            )

        # 4. Legend / HUD box
        overlay_hud = canvas.copy()
        cv2.rectangle(overlay_hud, (10, 10), (320, 105), (28, 43, 58), -1)
        cv2.addWeighted(overlay_hud, 0.85, canvas, 0.15, 0, canvas)
        cv2.rectangle(canvas, (10, 10), (320, 105), (184, 135, 42), 1)

        cv2.putText(canvas, "GEOMETRY PERSPECTIVE MAP", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (245, 240, 226), 1, cv2.LINE_AA)
        for i, c in enumerate(vp_clusters):
            col = cluster_colors[i % len(cluster_colors)]
            cv2.circle(canvas, (25, 48 + i * 18), 5, col, -1)
            cv2.putText(
                canvas,
                f"VP {i+1}: {len(c['lines'])} lines (Err: {c['mean_error']:.1f} deg)",
                (40, 52 + i * 18),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                (245, 240, 226),
                1,
                cv2.LINE_AA
            )

        # Outliers label
        cv2.circle(canvas, (25, 48 + len(vp_clusters) * 18), 5, outlier_color, -1)
        cv2.putText(
            canvas,
            f"Perspective Outliers: {len(outliers)} lines",
            (40, 52 + len(vp_clusters) * 18),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (245, 240, 226),
            1,
            cv2.LINE_AA
        )

        # Output artifact storage
        storage_dir = context.storage_output_dir or os.path.abspath("storage/artifacts/geometry")
        os.makedirs(storage_dir, exist_ok=True)
        filename = f"perspective_{context.evidence_id}_{int(time.time())}.png"
        full_path = os.path.join(storage_dir, filename)

        cv2.imwrite(full_path, canvas)

        sha = hashlib.sha256(open(full_path, "rb").read()).hexdigest()
        try:
            from app.core.config import settings
            rel_path = os.path.relpath(full_path, start=settings.STORAGE_DIR).replace("\\", "/")
        except Exception:
            rel_path = f"geometry/{filename}"

        meta = EngineArtifactMetadata(
            artifact_id=f"perspective_map_{context.evidence_id}",
            evidence_id=context.evidence_id,
            analysis_id=context.analysis_id,
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            artifact_type=ArtifactType.VISUALIZATION,
            storage_path=rel_path,
            sha256_hash=sha,
            mime_type="image/png",
            width=w,
            height=h,
            parameters_used=params.model_dump(),
            provenance_metadata={"description": "Perspective convergence map with color-coded vanishing points, horizon line, and geometric outliers."}
        )
        return full_path, meta

    def _empty_result(self, w: int, h: int, n_lines: int, elapsed: float) -> EngineExecutionResult:
        result = PerspectiveAnalysisResult(
            total_segments=n_lines,
            clustered_segments=0,
            outlier_segments=0,
            outlier_ratio=0.0,
            perspective_inconsistency_score=0.0,
            verdict="INSUFFICIENT_RECTILINEAR_FEATURES",
            vanishing_points=[],
            horizon=None,
            outliers=[],
            interpretation="Image lacks sufficient straight linear features to establish a perspective vanishing point frame."
        )
        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.COMPLETED,
            summary="Image lacks straight lines required for perspective convergence analysis.",
            structured_findings=result.model_dump(),
            observations=[
                NormalizedObservation(
                    evidence_id=0,
                    analysis_id=None,
                    engine_id=self.engine_id,
                    engine_version=self.engine_version,
                    status=EngineExecutionStatus.COMPLETED.value,
                    observation_type="GEOMETRIC_PERSPECTIVE",
                    metric_name="PERSPECTIVE_INCONSISTENCY_SCORE",
                    raw_value="0.0",
                    normalized_value=0.0,
                    direction="informational",
                    technical_reliability="CONDITIONAL",
                    result_data={"total_line_segments": n_lines},
                    parameters_used={},
                    interpretation="Image lacks rectilinear edges needed for vanishing point extraction.",
                    limitations=["Engine requires architectural or straight-line parallel edges."]
                )
            ],
            execution_time_ms=elapsed * 1000.0,
        )

    def _fail(self, msg: str, elapsed: float) -> EngineExecutionResult:
        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.FAILED,
            summary=f"Analysis failed: {msg}",
            structured_findings={"error": msg},
            execution_time_ms=elapsed * 1000.0,
        )
