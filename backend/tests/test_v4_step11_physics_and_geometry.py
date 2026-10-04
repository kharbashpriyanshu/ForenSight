"""
ForenSight V4 — Step 11: Physics & Geometry Forensics Test Suite

Tests:
1. NOAA Solar Ephemeris Astronomical Calculations
2. Perspective & Vanishing Point Geometric Analysis (GEOMETRY-PERSPECTIVE)
3. Physical Illumination & Shadow Direction Analysis (PHYSICS-LIGHTING)
4. Solar Ephemeris Day/Night & Azimuth Inconsistency Checks
5. Engine Discovery & Registry Integration
"""

import os
import math
import tempfile
import pytest
import numpy as np
import cv2
from PIL import Image

from app.engine_extensions.registry import engine_registry
from app.engine_extensions.contract import ExecutionContext
from app.engine_extensions.geometry import (
    PerspectiveEngine,
    PerspectiveParameters,
)
from app.engine_extensions.physics import (
    LightingEngine,
    LightingParameters,
    calculate_noaa_solar_position,
)


def test_noaa_solar_ephemeris_accuracy():
    """Verify NOAA astronomical calculations against known solar positions."""
    # 1. Ahmedabad, India (Lat: 23.0225, Lon: 72.5714), 12 March 2026 at 14:30 IST (UTC+5.5)
    res_ahm = calculate_noaa_solar_position(
        lat=23.0225, lon=72.5714,
        year=2026, month=3, day=12,
        hour=14, minute=30, second=0,
        tz_offset=5.5
    )
    assert 50.0 < res_ahm["solar_elevation_deg"] < 60.0
    assert 215.0 < res_ahm["solar_azimuth_deg"] < 235.0
    assert 0.5 < res_ahm["shadow_length_ratio"] < 1.0
    assert 35.0 < res_ahm["expected_shadow_azimuth_deg"] < 55.0

    # 2. Midnight test (London at 00:00 UTC) -> Sun well below horizon
    res_night = calculate_noaa_solar_position(
        lat=51.5074, lon=-0.1278,
        year=2026, month=6, day=21,
        hour=0, minute=0, second=0,
        tz_offset=0.0
    )
    assert res_night["solar_elevation_deg"] < -10.0  # Nighttime


def test_perspective_engine_registration():
    """Verify GEOMETRY-PERSPECTIVE and PHYSICS-LIGHTING are active in registry."""
    eng_persp = engine_registry.get_engine("GEOMETRY-PERSPECTIVE")
    assert eng_persp is not None
    assert eng_persp.engine_name == "Perspective & Vanishing Point Analysis"
    assert eng_persp.category.value == "GEOMETRIC_ANALYSIS"

    eng_light = engine_registry.get_engine("PHYSICS-LIGHTING")
    assert eng_light is not None
    assert eng_light.engine_name == "Illumination & Solar Physics Analysis"
    assert eng_light.category.value == "GEOMETRIC_ANALYSIS"


def test_perspective_engine_converging_lines():
    """Test perspective engine on synthetic image with converging lines to a single VP."""
    with tempfile.TemporaryDirectory() as tmpdir:
        img_path = os.path.join(tmpdir, "converging_test.png")
        canvas = np.zeros((600, 800, 3), dtype=np.uint8)
        canvas.fill(220)

        # Target VP at (400, 150)
        vp_target = (400, 150)
        for start_x in [50, 150, 250, 350, 450, 550, 650, 750]:
            cv2.line(canvas, (start_x, 550), vp_target, (30, 30, 30), 3)

        cv2.imwrite(img_path, canvas)

        engine = PerspectiveEngine()
        context = ExecutionContext(
            evidence_id=101,
            analysis_id=201,
            stored_path=img_path,
            sha256_hash="test_hash",
            image_format="PNG",
            file_path=img_path,
            mime_type="image/png",
            file_size=os.path.getsize(img_path),
            width=800,
            height=600,
            storage_output_dir=tmpdir
        )

        res = engine.execute(context)
        assert res.status.value == "COMPLETED"
        assert res.findings["total_segments"] >= 6
        assert len(res.findings["vanishing_points"]) >= 1
        # The primary VP should be near (400, 150)
        primary_vp = res.findings["vanishing_points"][0]
        assert abs(primary_vp["x"] - 400) < 50
        assert abs(primary_vp["y"] - 150) < 50
        assert res.findings["verdict"] in ["PERSPECTIVE_CONSISTENT", "MODERATE_GEOMETRIC_VARIANCE"]
        assert len(res.artifacts) == 1


def test_perspective_engine_outlier_splicing_detection():
    """Test perspective engine detects non-conforming spliced outlier lines."""
    with tempfile.TemporaryDirectory() as tmpdir:
        img_path = os.path.join(tmpdir, "spliced_outlier_test.png")
        canvas = np.zeros((600, 800, 3), dtype=np.uint8)
        canvas.fill(220)

        # Main scene converging lines meeting at (400, 150)
        vp1 = (400, 150)
        for sx in [100, 200, 300, 500, 600, 700]:
            cv2.line(canvas, (sx, 550), vp1, (30, 30, 30), 3)

        # Spliced object with completely contradictory perspective meeting at (100, 500)
        vp_fake = (100, 500)
        for sx in [600, 650, 700, 750]:
            cv2.line(canvas, (sx, 100), vp_fake, (30, 30, 30), 3)

        cv2.imwrite(img_path, canvas)

        engine = PerspectiveEngine()
        context = ExecutionContext(
            evidence_id=102,
            analysis_id=202,
            stored_path=img_path,
            sha256_hash="test_hash_2",
            image_format="PNG",
            file_path=img_path,
            mime_type="image/png",
            file_size=os.path.getsize(img_path),
            width=800,
            height=600,
            storage_output_dir=tmpdir
        )

        res = engine.execute(context)
        assert res.status.value == "COMPLETED"
        assert res.findings["outlier_segments"] > 0
        assert res.findings["outlier_ratio"] > 0.05


def test_lighting_engine_consistent_illumination():
    """Test lighting engine evaluates coherent directional illumination."""
    with tempfile.TemporaryDirectory() as tmpdir:
        img_path = os.path.join(tmpdir, "consistent_light.png")
        canvas = np.zeros((400, 400, 3), dtype=np.uint8)
        # Create shaded spheres / circles with light from top-left
        for y in range(400):
            for x in range(400):
                # Gradient sloping from top-left (255) to bottom-right (0)
                val = max(0, min(255, 255 - int((x + y) * 0.35)))
                canvas[y, x] = (val, val, val)

        cv2.imwrite(img_path, canvas)

        engine = LightingEngine()
        context = ExecutionContext(
            evidence_id=103,
            analysis_id=203,
            stored_path=img_path,
            sha256_hash="hash_light",
            image_format="PNG",
            file_path=img_path,
            mime_type="image/png",
            file_size=os.path.getsize(img_path),
            width=400,
            height=400,
            storage_output_dir=tmpdir
        )

        res = engine.execute(context)
        assert res.status.value == "COMPLETED"
        assert res.findings["divergence_ratio"] < 0.25
        assert res.findings["verdict"] in ["LIGHTING_PHYSICS_CONSISTENT", "MODERATE_LIGHTING_VARIANCE"]
        assert len(res.artifacts) == 1


def test_lighting_engine_divergent_lighting_anomaly():
    """Test lighting engine flags composite patches with contradictory lighting."""
    with tempfile.TemporaryDirectory() as tmpdir:
        img_path = os.path.join(tmpdir, "divergent_light.png")
        canvas = np.zeros((400, 400, 3), dtype=np.uint8)

        # Left half: light from left
        for y in range(400):
            for x in range(200):
                val = max(0, min(255, 255 - x))
                canvas[y, x] = (val, val, val)

        # Right half: spliced with light from opposite direction (right)
        for y in range(400):
            for x in range(200, 400):
                val = max(0, min(255, (x - 200)))
                canvas[y, x] = (val, val, val)

        cv2.imwrite(img_path, canvas)

        engine = LightingEngine()
        context = ExecutionContext(
            evidence_id=104,
            analysis_id=204,
            stored_path=img_path,
            sha256_hash="hash_div",
            image_format="PNG",
            file_path=img_path,
            mime_type="image/png",
            file_size=os.path.getsize(img_path),
            width=400,
            height=400,
            storage_output_dir=tmpdir
        )

        res = engine.execute(context)
        assert res.status.value == "COMPLETED"
        assert res.findings["divergent_patches"] > 0
        assert res.findings["lighting_inconsistency_score"] > 0.30
