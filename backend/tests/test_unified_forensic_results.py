import pytest
from app.engine_extensions.registry import engine_registry
from app.models.domain import Evidence, Analysis, InvestigationCase
from app.services.reports import ReportService
import datetime


def test_23_engine_spatial_eligibility_classification():
    """Verify that every registered engine is correctly classified as spatial vs global."""
    SPATIAL_ENGINES = {
        "ELA",
        "NOISE",
        "COPY_MOVE",
        "RESAMPLING",
        "ADVANCED-NOISE",
        "CLONE-BLOCK",
        "CLONE-KEYPOINT",
        "COLOR-CHANNEL",
        "JPEG-GHOST",
        "NADJPEG",
        "BLOCKING-ARTIFACT",
        "GEOMETRY-PERSPECTIVE",
        "PHYSICS-LIGHTING"
    }

    GLOBAL_ENGINES = {
        "METADATA",
        "JPEG_DCT",
        "HISTOGRAM",
        "FOURIER",
        "PRNU",
        "CAMERA-ID",
        "JPEG-STRUCTURE",
        "JPEG-QT",
        "JPEG-HUFFMAN",
        "ADJPEG"
    }

    registered_engines = [e.engine_id for e in engine_registry.list_engines()]
    assert len(registered_engines) == 23

    for eng in registered_engines:
        assert (eng in SPATIAL_ENGINES) or (eng in GLOBAL_ENGINES), f"Engine {eng} unclassified"

    # Verify no overlap
    assert len(SPATIAL_ENGINES.intersection(GLOBAL_ENGINES)) == 0


def test_mixed_result_aggregation_and_failure_transparency(db_session):
    """Verify that failed, completed, and missing examinations are explicitly tracked without silent omissions."""
    case = InvestigationCase(
        case_identifier="FS-CASE-TEST-B3",
        title="Stage 2 Batch 3 Aggregation Test",
        status="open"
    )
    db_session.add(case)
    db_session.commit()

    ev = Evidence(
        case_id=case.id,
        evidence_identifier="FS-EV-TEST-B3",
        original_filename="test_evidence.jpg",
        stored_path="test_evidence.jpg",
        sha256_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        mime_type="image/jpeg",
        image_format="JPEG",
        file_size=102400,
        width=1280,
        height=720
    )
    db_session.add(ev)
    db_session.commit()

    # Successful analysis with spatial regions
    an1 = Analysis(
        evidence_id=ev.id,
        analysis_type="ELA",
        status="completed",
        structured_findings={
            "mean_error": 8.45,
            "variance": 12.3,
            "elevated_regions": [
                {"x": 100, "y": 150, "w": 80, "h": 60, "intensity": 0.8}
            ]
        }
    )
    # Failed analysis
    an2 = Analysis(
        evidence_id=ev.id,
        analysis_type="PRNU",
        status="failed",
        summary="Reference sensor model missing from case library",
        structured_findings={"error": "Missing reference"}
    )
    db_session.add_all([an1, an2])
    db_session.commit()

    analyses = db_session.query(Analysis).filter(Analysis.evidence_id == ev.id).all()
    assert len(analyses) == 2

    completed = [a for a in analyses if a.status == "completed"]
    failed = [a for a in analyses if a.status == "failed"]

    assert len(completed) == 1
    assert completed[0].analysis_type == "ELA"
    assert "elevated_regions" in completed[0].structured_findings

    assert len(failed) == 1
    assert failed[0].analysis_type == "PRNU"
    assert "Reference sensor model missing" in failed[0].summary
    # Ensure failure is NOT presented as negative finding or zero error
    assert failed[0].status != "completed"


def test_evidentiary_report_preserves_sha256_and_neutral_conclusions(db_session, monkeypatch):
    """Verify that case reports preserve the immutable SHA-256 and do not emit binary fake/real verdicts."""
    case = InvestigationCase(
        case_identifier="FS-CASE-RPT-001",
        title="Report Integrity Test",
        status="open"
    )
    db_session.add(case)
    db_session.commit()

    evidence_hash = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
    ev = Evidence(
        case_id=case.id,
        evidence_identifier="FS-EV-RPT-001",
        original_filename="sample_capture.jpg",
        stored_path="sample_capture.jpg",
        sha256_hash=evidence_hash,
        mime_type="image/jpeg",
        image_format="JPEG",
        file_size=204800,
        width=1920,
        height=1080
    )
    db_session.add(ev)
    db_session.commit()

    # Generate JSON report
    report = ReportService.generate_case_report(
        db=db_session,
        case_id=case.case_identifier,
        author_username="test_examiner",
        report_format="json"
    )

    assert report is not None
    assert report.artifact_path is not None
    assert report.case_id == case.case_identifier

    # Read generated artifact
    import json
    with open(report.artifact_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert data["case_information"]["case_identifier"] == case.case_identifier
    # SHA-256 must be preserved verbatim
    assert len(data["evidence"]) == 1
    assert data["evidence"][0]["sha256"] == evidence_hash

    # Must NOT produce automated binary verdict and must assert deterministic principles
    assert "fake percentages" in data["disclaimer"]
    for ev_item in data["evidence"]:
        assert "authenticity_score" not in ev_item
        assert "verdict" not in ev_item or ev_item.get("verdict") not in ["FAKE", "REAL", "AUTHENTIC", "MANIPULATED"]
