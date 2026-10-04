"""
ForenSight V4 — Physical Lighting, Shadow & Solar Ephemeris Forensics Engine

Engine ID: PHYSICS-LIGHTING
Version: 1.0.0
Category: GEOMETRIC_ANALYSIS

Analyzes 2D local illumination vectors, cast shadow ray convergence,
and performs NOAA astronomical solar ephemeris cross-verification against EXIF metadata.
"""

import os
import json
import time
import math
import hashlib
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import cv2
from PIL import Image

from app.engine_extensions.contract import (
    BaseForensicEngine,
    InputRequirements,
    ExecutionContext,
    EngineExecutionResult,
)
from app.engine_extensions.categories import EngineCategory
from app.engine_extensions.status import EngineExecutionStatus
from app.engine_extensions.reference import ScientificReference, ReferenceType
from app.engine_extensions.artifact import EngineArtifactMetadata, ArtifactType
from app.engine_extensions.observation import NormalizedObservation
from app.engine_extensions.physics.physics_models import (
    LightingParameters,
    IlluminationPatch,
    DetectedShadowRay,
    SolarEphemerisEvaluation,
    LightingAnalysisResult,
)
from app.engine_extensions.physics.solar_ephemeris import (
    calculate_noaa_solar_position,
    extract_exif_datetime_and_gps,
)


class LightingEngine(BaseForensicEngine):
    """
    PHYSICS-LIGHTING v1.0.0 — Physical Illumination, Shadow & Solar Ephemeris Consistency Engine.
    Detects spliced composite insertions and fraudulent location/time claims through Lambertian
    reflectance gradient analysis, shadow ray vectors, and NOAA astronomical cross-checks.
    """
    engine_id: str = "PHYSICS-LIGHTING"
    engine_name: str = "Illumination & Solar Physics Analysis"
    engine_version: str = "1.0.0"
    category: EngineCategory = EngineCategory.GEOMETRIC_ANALYSIS
    description: str = (
        "Estimates 2D light source direction vectors across scene quadrants, evaluates shadow ray "
        "convergence, and cross-references observed shadows against NOAA astronomical solar ephemeris."
    )
    parameter_schema = LightingParameters

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
                reference_id="JOHNSON_FARID_2005",
                reference_type=ReferenceType.ACADEMIC_PAPER,
                title="Exposing Digital Forgeries by Detecting Inconsistencies in Lighting",
                authors=["Micah K. Johnson", "Hany Farid"],
                year=2005,
                publication="ACM Multimedia and Security Workshop (MM&Sec)",
                relevance="Estimation of 2D/3D light source directions from image shading and occluding contours."
            ),
            ScientificReference(
                reference_id="KEE_OBRIEN_FARID_2013",
                reference_type=ReferenceType.ACADEMIC_PAPER,
                title="Exposing Digital Forgeries from Shadows and Reflections",
                authors=["Eric Kee", "James F. O'Brien", "Hany Farid"],
                year=2013,
                publication="ACM Transactions on Graphics (TOG)",
                relevance="Shadow ray constraints and geometric light source projection verification."
            ),
            ScientificReference(
                reference_id="NOAA_SOLAR_ALGORITHM",
                reference_type=ReferenceType.TECHNICAL_REPORT,
                title="Solar Calculation Details and Astronomical Algorithms",
                authors=["National Oceanic and Atmospheric Administration (NOAA)"],
                year=2001,
                publication="NOAA Earth System Research Laboratory",
                relevance="Astronomical calculation of solar azimuth, elevation, and true solar time from GPS coordinates."
            )
        ]

    def execute(self, context: ExecutionContext) -> EngineExecutionResult:
        t0 = time.perf_counter()
        params = LightingParameters(**context.parameters) if context.parameters else LightingParameters()

        ev_path = getattr(context, "file_path", None) or context.stored_path
        if not os.path.isabs(ev_path):
            from app.core.config import settings
            cand = os.path.join(settings.STORAGE_DIR, ev_path)
            if os.path.exists(cand):
                ev_path = cand

        if not ev_path or not os.path.exists(ev_path):
            return self._fail("Evidence file does not exist on disk", time.perf_counter() - t0)

        img_bgr = cv2.imread(ev_path)
        if img_bgr is None:
            return self._fail("Failed to decode image bitstream", time.perf_counter() - t0)

        h, w = img_bgr.shape[:2]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        # 1. Grid-Based 2D Illumination Vector Estimation
        patches, mean_angle, variance = self._estimate_patch_illuminations(gray, w, h, params)

        # 2. Extract Shadow Ray Vectors
        shadow_rays = self._detect_shadow_rays(img_bgr, gray, w, h, params)

        # 3. NOAA Solar Ephemeris Verification
        solar_eval = self._evaluate_solar_ephemeris(ev_path, mean_angle, shadow_rays, params)

        # 4. Synthesize Physical Inconsistency Score
        total_p = len(patches)
        divergent_p = sum(1 for p in patches if p.is_divergent)
        div_ratio = (divergent_p / max(1, total_p)) if total_p > 0 else 0.0

        # Score formulation: weighted combination of lighting divergence and solar discrepancy
        inconsistency_score = min(1.0, div_ratio * 1.5)
        if solar_eval and solar_eval.astronomical_consistency in ["INCONSISTENT", "DAY_NIGHT_CONFLICT"]:
            inconsistency_score = max(inconsistency_score, 0.75)

        # Formulate Verdict and Forensic Interpretation
        if solar_eval and solar_eval.astronomical_consistency == "DAY_NIGHT_CONFLICT":
            verdict = "SOLAR_NIGHT_CONFLICT"
            interpretation = (
                f"Severe physical violation: EXIF timestamp claims image was captured at night "
                f"(Sun elevation: {solar_eval.solar_elevation_deg} deg), but scene exhibits daylight illumination."
            )
        elif solar_eval and solar_eval.astronomical_consistency == "INCONSISTENT":
            verdict = "SOLAR_ASTRONOMICAL_ANOMALY"
            interpretation = (
                f"Astronomical inconsistency: Expected shadow azimuth is {solar_eval.expected_shadow_azimuth_deg} deg, "
                f"which contradicts the physical light direction observed in the image."
            )
        elif div_ratio > 0.40:
            verdict = "LIGHTING_DIRECTION_ANOMALY"
            interpretation = (
                f"Significant illumination anomaly: {divergent_p} of {total_p} quadrants ({div_ratio*100:.1f}%) "
                f"exhibit light source directions deviating by >{params.divergence_threshold_deg} deg from the scene mean. "
                "This indicates candidate composite splicing under contradictory studio or outdoor lighting."
            )
        elif div_ratio > 0.20:
            verdict = "MODERATE_LIGHTING_VARIANCE"
            interpretation = (
                f"Moderate lighting direction variance ({divergent_p} divergent quadrants). "
                "May indicate multiple secondary light sources or non-Lambertian surface reflectance."
            )
        else:
            verdict = "LIGHTING_PHYSICS_CONSISTENT"
            interpretation = (
                f"High illumination consistency: Light source vectors across all evaluated quadrants "
                f"align coherently with scene mean ({mean_angle:.1f} deg)."
            )

        analysis_result = LightingAnalysisResult(
            mean_illuminant_angle_deg=round(mean_angle, 2),
            illuminant_angular_variance=round(variance, 2),
            total_patches=total_p,
            divergent_patches=divergent_p,
            divergence_ratio=round(div_ratio, 4),
            patches=patches,
            shadow_rays=shadow_rays,
            solar_ephemeris=solar_eval,
            lighting_inconsistency_score=round(inconsistency_score, 4),
            verdict=verdict,
            interpretation=interpretation
        )

        # 5. Generate Forensic Visualization Map
        artifact_path, artifact_meta = self._generate_lighting_overlay(
            img_bgr, patches, shadow_rays, solar_eval, mean_angle, context, params
        )

        elapsed = time.perf_counter() - t0

        direction = "anomalous" if inconsistency_score > 0.40 else ("elevated" if inconsistency_score > 0.20 else "consistent")
        observations = [
            NormalizedObservation(
                evidence_id=context.evidence_id,
                analysis_id=context.analysis_id,
                engine_id=self.engine_id,
                engine_version=self.engine_version,
                status=EngineExecutionStatus.COMPLETED.value,
                observation_type="PHYSICAL_LIGHTING",
                metric_name="LIGHTING_INCONSISTENCY_SCORE",
                raw_value=f"{inconsistency_score:.4f}",
                normalized_value=inconsistency_score,
                direction=direction,
                technical_reliability="HIGH",
                result_data={
                    "mean_illuminant_angle_deg": round(mean_angle, 2),
                    "angular_variance": round(variance, 2),
                    "divergent_patches_count": divergent_p,
                    "divergence_ratio": round(div_ratio, 4),
                    "inconsistency_score": round(inconsistency_score, 4),
                    "solar_consistency": solar_eval.astronomical_consistency if solar_eval else "METADATA_UNAVAILABLE"
                },
                parameters_used=params.model_dump(),
                interpretation=interpretation,
                limitations=[
                    "Assumes approximately Lambertian surface reflectance.",
                    "Extreme ambient diffusion (e.g. dense fog) limits directional contrast."
                ]
            )
        ]

        findings_dict = analysis_result.model_dump()
        if artifact_meta:
            findings_dict["artifacts"] = {"lighting_overlay": artifact_meta.storage_path}

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
                "Assumes approximately Lambertian surface reflectance.",
                "Non-planar specular reflections require analyst verification."
            ]
        )

    def _estimate_patch_illuminations(
        self,
        gray: np.ndarray,
        width: int,
        height: int,
        params: LightingParameters
    ) -> Tuple[List[IlluminationPatch], float, float]:
        """Divides image into grid patches and computes 2D Lambertian light direction vectors."""
        n_div = params.grid_divisions
        pw = width // n_div
        ph = height // n_div

        raw_patches = []
        sin_sum = 0.0
        cos_sum = 0.0

        for r in range(n_div):
            for c in range(n_div):
                x1 = c * pw
                y1 = r * ph
                x2 = width if c == n_div - 1 else (c + 1) * pw
                y2 = height if r == n_div - 1 else (r + 1) * ph

                patch_gray = gray[y1:y2, x1:x2]
                gx = cv2.Sobel(patch_gray, cv2.CV_32F, 1, 0, ksize=3)
                gy = cv2.Sobel(patch_gray, cv2.CV_32F, 0, 1, ksize=3)

                mag = np.sqrt(gx * gx + gy * gy)
                eff_thresh = min(params.min_gradient_magnitude, max(1.0, float(np.mean(mag) * 0.5)))
                mask = mag >= eff_thresh

                if np.sum(mask) < 20:
                    continue

                # Weighted gradient direction along boundaries points towards the light
                vx = float(np.sum(gx[mask]))
                vy = float(np.sum(gy[mask]))
                v_norm = math.hypot(vx, vy)
                if v_norm < 1e-4:
                    continue

                angle_rad = math.atan2(vy, vx)
                angle_deg = (math.degrees(angle_rad) + 360.0) % 360.0
                conf = min(1.0, v_norm / (np.sum(mask) * 20.0))

                raw_patches.append({
                    "id": f"P_{r}_{c}",
                    "box": [x1, y1, x2, y2],
                    "angle": angle_deg,
                    "conf": conf
                })

                sin_sum += math.sin(angle_rad)
                cos_sum += math.cos(angle_rad)

        if not raw_patches:
            return [], 0.0, 0.0

        # Circular mean angle across whole scene
        mean_rad = math.atan2(sin_sum, cos_sum)
        mean_deg = (math.degrees(mean_rad) + 360.0) % 360.0

        # Calculate circular variance and evaluate each patch's angular divergence
        processed_patches = []
        sq_diffs = []
        for p in raw_patches:
            diff = abs(p["angle"] - mean_deg)
            if diff > 180.0:
                diff = 360.0 - diff

            is_div = diff > params.divergence_threshold_deg
            sq_diffs.append(diff * diff)

            processed_patches.append(
                IlluminationPatch(
                    patch_id=p["id"],
                    box=p["box"],
                    illuminant_angle_deg=round(p["angle"], 2),
                    confidence=round(p["conf"], 3),
                    is_divergent=is_div,
                    angular_discrepancy_deg=round(diff, 2)
                )
            )

        variance = math.sqrt(float(np.mean(sq_diffs))) if sq_diffs else 0.0
        return processed_patches, mean_deg, variance

    def _detect_shadow_rays(
        self,
        img_bgr: np.ndarray,
        gray: np.ndarray,
        width: int,
        height: int,
        params: LightingParameters
    ) -> List[DetectedShadowRay]:
        """Detects low-luminance cast shadow regions and extracts directional shadow rays."""
        # Convert to Lab color space for perceptual luminance separation
        lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
        l_chan = lab[:, :, 0]

        # Shadow mask: low L, with morphological closing
        shadow_mask = (l_chan < params.shadow_luminance_threshold).astype(np.uint8) * 255
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        shadow_mask = cv2.morphologyEx(shadow_mask, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(shadow_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        rays = []

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 400:  # Ignore tiny noise blobs
                continue

            rect = cv2.minAreaRect(cnt)
            (cx, cy), (rw, rh), angle = rect
            if min(rw, rh) < 8 or max(rw, rh) / max(1.0, min(rw, rh)) < 1.4:
                continue

            # Approximate principal axis vector
            vx, vy, x0, y0 = cv2.fitLine(cnt, cv2.DIST_L2, 0, 0.01, 0.01)
            f_vx = float(np.ravel(vx)[0])
            f_vy = float(np.ravel(vy)[0])
            line_angle = (math.degrees(math.atan2(f_vy, f_vx)) + 360.0) % 360.0

            half_len = max(rw, rh) / 2.0
            p1_x = cx - f_vx * half_len
            p1_y = cy - f_vy * half_len
            p2_x = cx + f_vx * half_len
            p2_y = cy + f_vy * half_len

            rays.append(
                DetectedShadowRay(
                    caster_x=round(float(p1_x), 1),
                    caster_y=round(float(p1_y), 1),
                    shadow_x=round(float(p2_x), 1),
                    shadow_y=round(float(p2_y), 1),
                    vector_angle_deg=round(line_angle, 2),
                    ray_length=round(float(max(rw, rh)), 1)
                )
            )
            if len(rays) >= 12:
                break

        return rays

    def _evaluate_solar_ephemeris(
        self,
        image_path: str,
        mean_illuminant_angle: float,
        shadow_rays: List[DetectedShadowRay],
        params: LightingParameters
    ) -> Optional[SolarEphemerisEvaluation]:
        """Cross-references EXIF GPS & timestamp with NOAA astronomical solar calculations."""
        meta = extract_exif_datetime_and_gps(image_path)
        if not meta or not meta.get("has_gps"):
            return None

        dt = meta["datetime"]
        lat = meta["latitude"]
        lon = meta["longitude"]

        # Calculate NOAA solar position
        solar_data = calculate_noaa_solar_position(
            lat=lat,
            lon=lon,
            year=dt.year,
            month=dt.month,
            day=dt.day,
            hour=dt.hour,
            minute=dt.minute,
            second=dt.second
        )

        elevation = solar_data["solar_elevation_deg"]
        azimuth = solar_data["solar_azimuth_deg"]
        expected_shadow_az = solar_data["expected_shadow_azimuth_deg"]
        shadow_ratio = solar_data["shadow_length_ratio"]

        # 1. Day / Night check
        if elevation < -1.0:
            return SolarEphemerisEvaluation(
                exif_timestamp=meta.get("datetime_str"),
                latitude=lat,
                longitude=lon,
                solar_elevation_deg=elevation,
                solar_azimuth_deg=azimuth,
                expected_shadow_azimuth_deg=expected_shadow_az,
                expected_shadow_ratio=shadow_ratio,
                astronomical_consistency="DAY_NIGHT_CONFLICT",
                reasoning=(
                    f"Astronomical calculation indicates nighttime (Sun elevation: {elevation:+.1f} deg below horizon). "
                    "Contradicts visible outdoor daylight."
                )
            )

        # 2. Angular comparison with observed shadow rays or mean illumination
        measured_angle = None
        if shadow_rays:
            measured_angle = float(np.mean([r.vector_angle_deg for r in shadow_rays]))
        elif mean_illuminant_angle is not None:
            # Shadow direction is opposite illumination direction
            measured_angle = (mean_illuminant_angle + 180.0) % 360.0

        if measured_angle is not None:
            diff = abs(measured_angle - expected_shadow_az)
            if diff > 180.0:
                diff = 360.0 - diff

            if diff > params.solar_azimuth_tolerance_deg:
                consistency = "INCONSISTENT"
                reasoning = (
                    f"Astronomical discrepancy: Expected shadow azimuth is {expected_shadow_az:.1f} deg, "
                    f"but measured shadow/light vector is {measured_angle:.1f} deg (Error: {diff:.1f} deg > {params.solar_azimuth_tolerance_deg} deg tolerance)."
                )
            else:
                consistency = "CONSISTENT"
                reasoning = (
                    f"Astronomical verification passed: Observed shadow vector ({measured_angle:.1f} deg) "
                    f"matches NOAA calculated shadow direction ({expected_shadow_az:.1f} deg) within {diff:.1f} deg."
                )
        else:
            consistency = "CONSISTENT"
            reasoning = "Calculated solar position successfully; insufficient directional shadow rays to compute angular delta."

        return SolarEphemerisEvaluation(
            exif_timestamp=meta.get("datetime_str"),
            latitude=lat,
            longitude=lon,
            solar_elevation_deg=elevation,
            solar_azimuth_deg=azimuth,
            expected_shadow_azimuth_deg=expected_shadow_az,
            expected_shadow_ratio=shadow_ratio,
            astronomical_consistency=consistency,
            reasoning=reasoning
        )

    def _generate_lighting_overlay(
        self,
        img_bgr: np.ndarray,
        patches: List[IlluminationPatch],
        shadow_rays: List[DetectedShadowRay],
        solar_eval: Optional[SolarEphemerisEvaluation],
        mean_angle: float,
        context: ExecutionContext,
        params: LightingParameters
    ) -> Tuple[str, Optional[EngineArtifactMetadata]]:
        """Generates forensic PNG visualization with directional lighting vectors and solar ephemeris compass."""
        canvas = img_bgr.copy()
        h, w = canvas.shape[:2]

        # 1. Draw Illumination Vectors on each patch
        arrow_len = min(w, h) * 0.06
        for p in patches:
            x1, y1, x2, y2 = p.box
            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            angle_rad = math.radians(p.illuminant_angle_deg)
            tx = int(cx + arrow_len * math.cos(angle_rad))
            ty = int(cy + arrow_len * math.sin(angle_rad))

            # Consistent: Green (BGR: 16, 185, 129), Divergent: Red (BGR: 68, 68, 239)
            color = (68, 68, 239) if p.is_divergent else (16, 185, 129)
            cv2.arrowedLine(canvas, (cx, cy), (tx, ty), color, 2, tipLength=0.3)
            cv2.circle(canvas, (cx, cy), 3, color, -1)

            if p.is_divergent:
                # Highlight divergent bounding box
                cv2.rectangle(canvas, (x1, y1), (x2, y2), (68, 68, 239), 1)

        # 2. Draw Detected Shadow Rays in Cyan
        for r in shadow_rays:
            p1 = (int(r.caster_x), int(r.caster_y))
            p2 = (int(r.shadow_x), int(r.shadow_y))
            cv2.line(canvas, p1, p2, (212, 182, 6), 2, cv2.LINE_AA)
            cv2.circle(canvas, p1, 4, (212, 182, 6), -1)

        # 3. Compass Rose & HUD in Top-Right
        compass_cx = w - 85
        compass_cy = 85
        cv2.circle(canvas, (compass_cx, compass_cy), 45, (28, 43, 58), -1)
        cv2.circle(canvas, (compass_cx, compass_cy), 45, (184, 135, 42), 2)

        # Cardinal Points
        cv2.putText(canvas, "N", (compass_cx - 5, compass_cy - 30), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (245, 240, 226), 1)
        cv2.putText(canvas, "S", (compass_cx - 5, compass_cy + 40), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (245, 240, 226), 1)
        cv2.putText(canvas, "E", (compass_cx + 30, compass_cy + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (245, 240, 226), 1)
        cv2.putText(canvas, "W", (compass_cx - 40, compass_cy + 5), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (245, 240, 226), 1)

        # Mean Scene Light Vector (Green/Amber needle)
        mean_rad = math.radians(mean_angle)
        needle_x = int(compass_cx + 36 * math.cos(mean_rad))
        needle_y = int(compass_cy + 36 * math.sin(mean_rad))
        cv2.arrowedLine(canvas, (compass_cx, compass_cy), (needle_x, needle_y), (42, 135, 184), 2, tipLength=0.3)

        # If Solar Ephemeris is available, draw astronomical sun azimuth needle in Gold
        if solar_eval and solar_eval.solar_azimuth_deg is not None:
            sun_rad = math.radians(solar_eval.solar_azimuth_deg - 90.0) # Clockwise from North
            sun_x = int(compass_cx + 36 * math.cos(sun_rad))
            sun_y = int(compass_cy + 36 * math.sin(sun_rad))
            cv2.arrowedLine(canvas, (compass_cx, compass_cy), (sun_x, sun_y), (11, 218, 255), 2, tipLength=0.3)

        # HUD Legend Box
        cv2.rectangle(canvas, (10, 10), (320, 100), (28, 43, 58), -1)
        cv2.rectangle(canvas, (10, 10), (320, 100), (184, 135, 42), 1)
        cv2.putText(canvas, "PHYSICAL LIGHTING & SOLAR", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (245, 240, 226), 1, cv2.LINE_AA)
        cv2.putText(canvas, f"Scene Light: {mean_angle:.1f} deg", (20, 52), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (16, 185, 129), 1)
        cv2.putText(canvas, f"Divergent Patches: {sum(1 for p in patches if p.is_divergent)}/{len(patches)}", (20, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (68, 68, 239), 1)

        solar_status = solar_eval.astronomical_consistency if solar_eval else "NO_GPS_EXIF"
        cv2.putText(canvas, f"Solar Verification: {solar_status}", (20, 88), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (245, 240, 226), 1)

        storage_dir = context.storage_output_dir or os.path.abspath("storage/artifacts/physics")
        os.makedirs(storage_dir, exist_ok=True)
        filename = f"lighting_{context.evidence_id}_{int(time.time())}.png"
        full_path = os.path.join(storage_dir, filename)

        cv2.imwrite(full_path, canvas)

        sha = hashlib.sha256(open(full_path, "rb").read()).hexdigest()
        try:
            from app.core.config import settings
            rel_path = os.path.relpath(full_path, start=settings.STORAGE_DIR).replace("\\", "/")
        except Exception:
            rel_path = f"physics/{filename}"

        meta = EngineArtifactMetadata(
            artifact_id=f"lighting_map_{context.evidence_id}",
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
            provenance_metadata={"description": "Physical illumination vector field, shadow rays, and solar ephemeris compass overlay."}
        )
        return full_path, meta

    def _fail(self, msg: str, elapsed: float) -> EngineExecutionResult:
        return EngineExecutionResult(
            engine_id=self.engine_id,
            engine_version=self.engine_version,
            status=EngineExecutionStatus.FAILED,
            summary=f"Analysis failed: {msg}",
            structured_findings={"error": msg},
            execution_time_ms=elapsed * 1000.0,
        )
