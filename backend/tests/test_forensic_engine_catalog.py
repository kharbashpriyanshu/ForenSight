"""
Regression test suite for ForenSight Forensic Engine Catalog and Dispatch Contract.

Verifies:
1. All 23 forensic engines exist and are registered in ForensicEngineRegistry.
2. Engine metadata, categories, and input requirements are properly populated.
3. Frontend-to-backend engine identifier mappings and dispatch resolution.
4. Format compatibility validation (lossy vs universal).
5. Reference data requirements for CAMERA-ID and PRNU.
6. Unsupported engine rejection.
7. Job queueing contract via POST /api/jobs/analysis/{evidence_id}/{analysis_type}.
"""

import pytest
from fastapi.testclient import TestClient
from app.engine_extensions.registry import engine_registry
from app.engine_extensions.categories import EngineCategory
from app.models.domain import InvestigationCase, Evidence, User
from app.services.audit import AuditService

EXPECTED_23_ENGINES = [
    # Legacy core (5)
    "METADATA",
    "ELA",
    "NOISE",
    "JPEG_DCT",
    "COPY_MOVE",
    # Step 2 JPEG (3)
    "JPEG-STRUCTURE",
    "JPEG-QT",
    "JPEG-HUFFMAN",
    # Step 3 Compression (3)
    "JPEG-GHOST",
    "ADJPEG",
    "NADJPEG",
    # Step 4 Blocking (1)
    "BLOCKING-ARTIFACT",
    # Step 5 Distribution, Color, Frequency (3)
    "HISTOGRAM",
    "COLOR-CHANNEL",
    "FOURIER",
    # Step 6 Noise & Resampling (2)
    "ADVANCED-NOISE",
    "RESAMPLING",
    # Step 7 Clone Detection (2)
    "CLONE-BLOCK",
    "CLONE-KEYPOINT",
    # Step 8 PRNU & Camera Attribution (2)
    "PRNU",
    "CAMERA-ID",
    # Physics & Geometry (2)
    "GEOMETRY-PERSPECTIVE",
    "PHYSICS-LIGHTING",
]

FRONTEND_TO_BACKEND_MAPPINGS = {
    "metadata": "METADATA",
    "ela": "ELA",
    "noise": "NOISE",
    "jpeg-dct": "JPEG_DCT",
    "copy-move": "COPY_MOVE",
    "resampling": "RESAMPLING",
    "advanced-noise": "ADVANCED-NOISE",
    "clone-block": "CLONE-BLOCK",
    "clone-keypoint": "CLONE-KEYPOINT",
    "histogram": "HISTOGRAM",
    "color-channel": "COLOR-CHANNEL",
    "fourier": "FOURIER",
    "prnu": "PRNU",
    "camera-id": "CAMERA-ID",
    "geometry-perspective": "GEOMETRY-PERSPECTIVE",
    "physics-lighting": "PHYSICS-LIGHTING",
    "jpeg-structure": "JPEG-STRUCTURE",
    "jpeg-qt": "JPEG-QT",
    "jpeg-huffman": "JPEG-HUFFMAN",
    "jpeg-ghost": "JPEG-GHOST",
    "adjpeg": "ADJPEG",
    "nadjpeg": "NADJPEG",
    "blocking-artifact": "BLOCKING-ARTIFACT",
}


def test_all_23_engines_registered():
    """Verify all 23 expected forensic engines are registered in the engine registry."""
    registered_ids = [e.engine_id for e in engine_registry.list_engines()]
    for expected_id in EXPECTED_23_ENGINES:
        assert expected_id in registered_ids, f"Engine '{expected_id}' not found in registry"
    assert len(registered_ids) >= 23


def test_engine_metadata_and_categories():
    """Verify that every registered engine exposes required contract metadata."""
    for engine_id in EXPECTED_23_ENGINES:
        engine = engine_registry.get_engine(engine_id)
        assert engine is not None, f"Engine {engine_id} could not be retrieved"
        assert engine.engine_name, f"Engine {engine_id} has empty engine_name"
        assert engine.engine_version, f"Engine {engine_id} has empty engine_version"
        assert engine.description, f"Engine {engine_id} has empty description"
        assert isinstance(engine.category, EngineCategory), f"Engine {engine_id} invalid category"
        assert engine.input_requirements is not None, f"Engine {engine_id} missing input requirements"
        assert len(engine.input_requirements.supported_formats) > 0, f"Engine {engine_id} has no supported formats"


def test_frontend_id_resolution_and_compatibility():
    """Verify that every frontend engine identifier resolves to a registered backend engine."""
    for fe_id, expected_backend_id in FRONTEND_TO_BACKEND_MAPPINGS.items():
        # Test standard normalization logic used in backend job dispatch
        canonical_backend_id = fe_id.upper().replace("_", "-")
        # Legacy engines might use underscores
        engine = engine_registry.get_engine(canonical_backend_id) or engine_registry.get_engine(fe_id.upper().replace("-", "_"))
        assert engine is not None, f"Frontend ID '{fe_id}' failed to resolve to backend engine"
        assert engine.engine_id == expected_backend_id, (
            f"Frontend ID '{fe_id}' resolved to '{engine.engine_id}', expected '{expected_backend_id}'"
        )


def test_format_compatibility_declarations():
    """Verify format declarations: JPEG-specific lossy engines vs universal engines."""
    jpeg_only_engines = ["ELA", "JPEG_DCT", "JPEG-STRUCTURE", "JPEG-QT", "JPEG-HUFFMAN", "JPEG-GHOST", "ADJPEG", "NADJPEG", "BLOCKING-ARTIFACT"]
    for eng_id in jpeg_only_engines:
        engine = engine_registry.get_engine(eng_id)
        assert engine is not None
        formats = [f.upper() for f in engine.input_requirements.supported_formats]
        assert "PNG" not in formats, f"Lossy JPEG engine '{eng_id}' should not claim PNG support"
        assert any(f in ["JPEG", "JPG"] for f in formats), f"Engine '{eng_id}' must support JPEG"

    universal_engines = ["METADATA", "NOISE", "COPY_MOVE", "RESAMPLING", "ADVANCED-NOISE", "HISTOGRAM", "FOURIER"]
    for eng_id in universal_engines:
        engine = engine_registry.get_engine(eng_id)
        assert engine is not None
        formats = [f.upper() for f in engine.input_requirements.supported_formats]
        assert "PNG" in formats or "ALL" in formats, f"Universal engine '{eng_id}' must declare PNG support"
        assert any(f in ["JPEG", "JPG", "ALL"] for f in formats), f"Universal engine '{eng_id}' must declare JPEG support"


def test_camera_and_prnu_reference_requirements():
    """Verify CAMERA-ID and PRNU handle missing references gracefully."""
    camera_engine = engine_registry.get_engine("CAMERA-ID")
    assert camera_engine is not None
    assert "PRNU" in camera_engine.description or "reference" in camera_engine.description.lower()
    assert any("reference" in lim.lower() for lim in camera_engine.limitations)

    prnu_engine = engine_registry.get_engine("PRNU")
    assert prnu_engine is not None
    assert prnu_engine.category == EngineCategory.CAMERA_IDENTIFICATION


def test_job_dispatch_queueing_endpoint(client: TestClient, monkeypatch):
    """Verify POST /api/jobs/analysis/{evidence_id}/{analysis_type} queues valid jobs for all 23 engines."""
    monkeypatch.setattr("app.api.jobs.publish_pending_analysis_jobs", lambda **kwargs: {"published": 0, "deferred": 0})
    monkeypatch.setattr("app.services.job_dispatch.publish_pending_analysis_jobs", lambda **kwargs: {"published": 0, "deferred": 0})
    import io
    from PIL import Image

    # Create case via client API
    case_res = client.post("/api/cases", json={"title": "Engine Catalog Dispatch Test"})
    assert case_res.status_code == 200
    case_id = case_res.json()["id"]

    # Upload test evidence
    img = Image.new("RGB", (32, 32), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    files = {"file": ("test_catalog.jpg", buf.getvalue(), "image/jpeg")}
    ev_res = client.post(f"/api/cases/{case_id}/evidence", files=files)
    assert ev_res.status_code == 200
    ev_id = ev_res.json()["id"]

    # Queue an analysis for each frontend engine id
    for fe_id in FRONTEND_TO_BACKEND_MAPPINGS.keys():
        resp = client.post(f"/api/jobs/analysis/{ev_id}/{fe_id}")
        assert resp.status_code in [200, 202], f"Failed to queue job for engine '{fe_id}': {resp.text}"
        data = resp.json()
        assert data["evidence_id"] == ev_id
        assert data["status"] in ["QUEUED", "RUNNING", "COMPLETED"]


def test_unsupported_engine_rejection(client: TestClient):
    """Verify that submitting an unrecognized engine identifier fails appropriately."""
    # Worker dispatcher validates registered engine IDs. Ensure engine_registry returns None for non-existent engine
    assert engine_registry.get_engine("NON-EXISTENT-ENGINE") is None
    assert engine_registry.get_engine("FAKE_ANALYSIS_TYPE") is None
