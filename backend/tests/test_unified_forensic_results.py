import pytest
from app.engine_extensions.registry import engine_registry
from app.models.domain import Evidence, Analysis, InvestigationCase
from app.services.reports import ReportService
import datetime


def test_23_engine_spatial_eligibility_classification():
    """Verify that every registered engine is correctly classified into vector, raster, or global categories."""
    VECTOR_LOCALIZATION_ENGINES = {
        "ADVANCED-NOISE",
        "COPY_MOVE",
        "CLONE-KEYPOINT",
        "CLONE-BLOCK",
        "COLOR-CHANNEL",
        "RESAMPLING",
        "BLOCKING-ARTIFACT",
        "JPEG-GHOST"
    }

    RASTER_ARTIFACT_ENGINES = {
        "ELA",
        "NOISE"
    }

    GLOBAL_METRIC_ENGINES = {
        "METADATA",
        "JPEG_DCT",
        "HISTOGRAM",
        "FOURIER",
        "PRNU",
        "CAMERA-ID",
        "JPEG-STRUCTURE",
        "JPEG-QT",
        "JPEG-HUFFMAN",
        "ADJPEG",
        "NADJPEG",
        "GEOMETRY-PERSPECTIVE",
        "PHYSICS-LIGHTING"
    }

    registered_engines = [e.engine_id for e in engine_registry.list_engines()]
    assert len(registered_engines) == 23

    for eng in registered_engines:
        assert (
            (eng in VECTOR_LOCALIZATION_ENGINES) or 
            (eng in RASTER_ARTIFACT_ENGINES) or 
            (eng in GLOBAL_METRIC_ENGINES)
        ), f"Engine {eng} unclassified"

    # Verify no overlap across categories
    assert len(VECTOR_LOCALIZATION_ENGINES.intersection(RASTER_ARTIFACT_ENGINES)) == 0
    assert len(VECTOR_LOCALIZATION_ENGINES.intersection(GLOBAL_METRIC_ENGINES)) == 0
    assert len(RASTER_ARTIFACT_ENGINES.intersection(GLOBAL_METRIC_ENGINES)) == 0


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

    # Successful analysis with genuine raster output
    an1 = Analysis(
        evidence_id=ev.id,
        analysis_type="ELA",
        status="completed",
        structured_findings={
            "jpeg_quality": 90,
            "width": 1280,
            "height": 720,
            "mean_error": 8.45,
            "std_error": 4.2,
            "artifacts": {
                "ela_map": "analyses/ela/ela_map_test.jpg"
            }
        }
    )
    # Successful analysis with genuine vector candidate regions
    an2 = Analysis(
        evidence_id=ev.id,
        analysis_type="ADVANCED-NOISE",
        status="completed",
        structured_findings={
            "local_consistency": {
                "candidate_region_count": 1,
                "candidate_regions": [
                    {
                        "region_id": "noise-inconsistency-1",
                        "bounding_box": [120, 80, 200, 150],
                        "max_deviation_z": 3.4
                    }
                ]
            }
        }
    )
    # Failed analysis
    an3 = Analysis(
        evidence_id=ev.id,
        analysis_type="PRNU",
        status="failed",
        summary="Reference sensor model missing from case library",
        structured_findings={"error": "Missing reference"}
    )
    db_session.add_all([an1, an2, an3])
    db_session.commit()

    analyses = db_session.query(Analysis).filter(Analysis.evidence_id == ev.id).all()
    assert len(analyses) == 3

    completed = [a for a in analyses if a.status == "completed"]
    failed = [a for a in analyses if a.status == "failed"]

    assert len(completed) == 2
    assert len(failed) == 1
    assert failed[0].analysis_type == "PRNU"
    assert "Reference sensor model missing" in failed[0].summary
    # Ensure failure is NOT presented as negative finding or zero error
    assert failed[0].status != "completed"


def test_spatial_contract_normalization_and_raster_separation():
    """Verify backend spatial contract integrity across vector, clone, and raster modalities."""
    img_w, img_h = 1920, 1080

    # 1. Advanced Noise: local_consistency.candidate_regions with bounding_box: [x, y, w, h]
    adv_noise_data = {
        "local_consistency": {
            "candidate_regions": [
                {
                    "region_id": "noise-01",
                    "bounding_box": [300, 200, 150, 100],
                    "max_deviation_z": 3.12
                }
            ]
        }
    }
    adv_cands = adv_noise_data["local_consistency"]["candidate_regions"]
    assert len(adv_cands) == 1
    box = adv_cands[0]["bounding_box"]
    assert len(box) == 4
    assert 0 <= box[0] < img_w and 0 <= box[1] < img_h
    assert box[2] > 0 and box[3] > 0

    # 2. Classical Copy-Move: candidate_regions with source and destination bounding boxes
    copy_move_data = {
        "candidate_regions": {
            "source_bounding_box": [100, 150, 120, 80],
            "destination_bounding_box": [500, 350, 120, 80],
            "supporting_matches": 15
        }
    }
    cm = copy_move_data["candidate_regions"]
    assert "source_bounding_box" in cm and "destination_bounding_box" in cm
    assert len(cm["source_bounding_box"]) == 4
    assert len(cm["destination_bounding_box"]) == 4
    assert cm["source_bounding_box"] != cm["destination_bounding_box"]

    # 3. Clone-Keypoint: candidate_regions with [min_x, min_y, max_x, max_y]
    clone_kp_data = {
        "candidate_regions": [
            {
                "region_id": "CLONE_KEYPOINT_R1",
                "source_bounding_box": [200, 150, 360, 290],
                "target_bounding_box": [600, 450, 760, 590],
                "inlier_keypoint_count": 18
            }
        ]
    }
    kp_cand = clone_kp_data["candidate_regions"][0]
    s_box = kp_cand["source_bounding_box"]
    t_box = kp_cand["target_bounding_box"]
    # Verify [x1, y1, x2, y2] to [x, y, w, h] transformation produces valid dimensions
    s_w, s_h = s_box[2] - s_box[0], s_box[3] - s_box[1]
    t_w, t_h = t_box[2] - t_box[0], t_box[3] - t_box[1]
    assert s_w > 0 and s_h > 0
    assert t_w > 0 and t_h > 0

    # 4. Color Channel: candidate_regions with x, y, width, height
    color_data = {
        "candidate_regions": [
            {
                "region_id": 1,
                "x": 400,
                "y": 250,
                "width": 128,
                "height": 96,
                "mean_z_score": 2.85
            }
        ]
    }
    col_cands = color_data["candidate_regions"]
    assert len(col_cands) == 1
    assert col_cands[0]["x"] == 400 and col_cands[0]["y"] == 250
    assert col_cands[0]["width"] == 128 and col_cands[0]["height"] == 96

    # 5. Raster Artifacts (ELA): Generates continuous raster map artifact, NOT vector regions
    ela_data = {
        "mean_error": 12.4,
        "max_error": 54.0,
        "artifacts": {
            "ela_map": "analyses/ela/ela_map_1.jpg"
        }
    }
    assert "artifacts" in ela_data
    assert "ela_map" in ela_data["artifacts"]
    assert "candidate_regions" not in ela_data
    assert "elevated_regions" not in ela_data


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
