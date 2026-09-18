import os
import json
import tempfile
import pytest
from app.forensics.metadata.extractor import MetadataExtractor
from app.forensics.ela.engine import ELAEngine
from app.forensics.noise.engine import NoiseEngine
from app.forensics.jpeg_dct.engine import JPEGDCTEngine
from app.forensics.copy_move.engine import CopyMoveEngine
from app.services.correlation import CorrelationEngine, CORRELATION_RULES
from tests.golden.generate_golden import normalize_dict, pydantic_to_dict

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "fixtures", "forensics")
GOLDEN_DIR = os.path.join(os.path.dirname(__file__), "golden")

@pytest.fixture(scope="module")
def ensure_fixtures():
    from tests.fixtures.generate_fixtures import generate_all_fixtures
    manifest_path = os.path.join(FIXTURES_DIR, "fixtures_manifest.json")
    if not os.path.exists(manifest_path):
        generate_all_fixtures()
    return FIXTURES_DIR


def test_phase7_determinism_three_runs(ensure_fixtures):
    """
    PHASE 7C: Determinism Validation.
    Executes identical analysis 3 times across all 5 engines.
    Asserts Run 1 == Run 2 == Run 3 on all normalized structured metrics.
    """
    clean_jpg = os.path.join(ensure_fixtures, "clean_reference.jpg")
    cm_jpg = os.path.join(ensure_fixtures, "synthetic_copy_move.jpg")

    with tempfile.TemporaryDirectory() as tmp1, tempfile.TemporaryDirectory() as tmp2, tempfile.TemporaryDirectory() as tmp3:
        # 1. Metadata
        m1 = normalize_dict(pydantic_to_dict(MetadataExtractor.extract(clean_jpg)))
        m2 = normalize_dict(pydantic_to_dict(MetadataExtractor.extract(clean_jpg)))
        m3 = normalize_dict(pydantic_to_dict(MetadataExtractor.extract(clean_jpg)))
        assert m1 == m2 == m3, "Metadata extraction is non-deterministic"

        # 2. ELA
        e1 = normalize_dict(pydantic_to_dict(ELAEngine.run(clean_jpg, tmp1, quality=90)))
        e2 = normalize_dict(pydantic_to_dict(ELAEngine.run(clean_jpg, tmp2, quality=90)))
        e3 = normalize_dict(pydantic_to_dict(ELAEngine.run(clean_jpg, tmp3, quality=90)))
        assert e1["statistics"] == e2["statistics"] == e3["statistics"], "ELA statistics are non-deterministic"
        assert e1["jpeg_quality"] == e2["jpeg_quality"] == e3["jpeg_quality"]

        # 3. Noise
        n1 = normalize_dict(pydantic_to_dict(NoiseEngine.run(clean_jpg, tmp1)))
        n2 = normalize_dict(pydantic_to_dict(NoiseEngine.run(clean_jpg, tmp2)))
        n3 = normalize_dict(pydantic_to_dict(NoiseEngine.run(clean_jpg, tmp3)))
        assert n1["global_statistics"] == n2["global_statistics"] == n3["global_statistics"], "Noise statistics non-deterministic"
        assert n1["local_statistics"] == n2["local_statistics"] == n3["local_statistics"]

        # 4. JPEG DCT
        d1 = normalize_dict(pydantic_to_dict(JPEGDCTEngine.run(clean_jpg, tmp1)))
        d2 = normalize_dict(pydantic_to_dict(JPEGDCTEngine.run(clean_jpg, tmp2)))
        d3 = normalize_dict(pydantic_to_dict(JPEGDCTEngine.run(clean_jpg, tmp3)))
        assert d1["dc_statistics"] == d2["dc_statistics"] == d3["dc_statistics"], "DCT statistics non-deterministic"
        assert d1["quantization_tables"] == d2["quantization_tables"] == d3["quantization_tables"]

        # 5. Copy-Move
        c1 = normalize_dict(pydantic_to_dict(CopyMoveEngine.run(cm_jpg, tmp1)))
        c2 = normalize_dict(pydantic_to_dict(CopyMoveEngine.run(cm_jpg, tmp2)))
        c3 = normalize_dict(pydantic_to_dict(CopyMoveEngine.run(cm_jpg, tmp3)))
        assert c1["feature_statistics"] == c2["feature_statistics"] == c3["feature_statistics"], "Copy-Move stats non-deterministic"
        assert c1["matching_statistics"] == c2["matching_statistics"] == c3["matching_statistics"]


def test_phase7_golden_outputs_match(ensure_fixtures):
    """
    PHASE 7B: Golden Output Testing.
    Compares normalized engine outputs on controlled reference fixtures against committed golden snapshots.
    """
    with tempfile.TemporaryDirectory() as tmp_out:
        # Check Metadata Golden
        p_meta = os.path.join(ensure_fixtures, "metadata_known_camera.jpg")
        meta_actual = normalize_dict(pydantic_to_dict(MetadataExtractor.extract(p_meta)))
        with open(os.path.join(GOLDEN_DIR, "clean_jpeg_metadata.golden.json"), "r", encoding="utf-8") as f:
            meta_golden = json.load(f)
        assert meta_actual["exif"]["Make"] == meta_golden["exif"]["Make"]
        assert meta_actual["exif"]["Model"] == meta_golden["exif"]["Model"]

        # Check ELA Golden
        p_ela = os.path.join(ensure_fixtures, "clean_reference.jpg")
        ela_actual = normalize_dict(pydantic_to_dict(ELAEngine.run(p_ela, tmp_out, quality=90)))
        with open(os.path.join(GOLDEN_DIR, "clean_jpeg_ela.golden.json"), "r", encoding="utf-8") as f:
            ela_golden = json.load(f)
        assert ela_actual["statistics"] == ela_golden["statistics"]

        # Check Noise Golden
        p_noise = os.path.join(ensure_fixtures, "clean_reference.jpg")
        noise_actual = normalize_dict(pydantic_to_dict(NoiseEngine.run(p_noise, tmp_out)))
        with open(os.path.join(GOLDEN_DIR, "clean_jpeg_noise.golden.json"), "r", encoding="utf-8") as f:
            noise_golden = json.load(f)
        assert noise_actual["global_statistics"] == noise_golden["global_statistics"]

        # Check DCT Golden
        p_dct = os.path.join(ensure_fixtures, "clean_reference.jpg")
        dct_actual = normalize_dict(pydantic_to_dict(JPEGDCTEngine.run(p_dct, tmp_out)))
        with open(os.path.join(GOLDEN_DIR, "clean_jpeg_dct.golden.json"), "r", encoding="utf-8") as f:
            dct_golden = json.load(f)
        assert dct_actual["dc_statistics"] == dct_golden["dc_statistics"]
        assert dct_actual["quantization_tables"] == dct_golden["quantization_tables"]

        # Check CopyMove Golden
        p_cm = os.path.join(ensure_fixtures, "synthetic_copy_move.jpg")
        cm_actual = normalize_dict(pydantic_to_dict(CopyMoveEngine.run(p_cm, tmp_out)))
        with open(os.path.join(GOLDEN_DIR, "synthetic_copymove.golden.json"), "r", encoding="utf-8") as f:
            cm_golden = json.load(f)
        assert cm_actual["matching_statistics"] == cm_golden["matching_statistics"]


def test_phase7_evidence_hash_invariant_through_pipeline(client, db_session, ensure_fixtures):
    """
    PHASE 7D: Hash / Integrity Validation.
    Verifies that the original evidence SHA-256 remains 100% immutable across:
    UPLOAD -> ANALYSIS -> REPORT GENERATION.
    """
    import hashlib
    clean_jpg = os.path.join(ensure_fixtures, "clean_reference.jpg")
    with open(clean_jpg, "rb") as f:
        file_bytes = f.read()
    orig_hash = hashlib.sha256(file_bytes).hexdigest()

    # 1. Create Case
    res_c = client.post("/api/cases", json={"title": "Hash Invariant Case"})
    assert res_c.status_code == 200
    case_data = res_c.json()
    case_id = case_data["id"]

    # 2. Upload Evidence
    with open(clean_jpg, "rb") as f:
        res_e = client.post(
            f"/api/cases/{case_id}/evidence",
            files={"file": ("clean_reference.jpg", f, "image/jpeg")}
        )
    assert res_e.status_code == 200
    ev_data = res_e.json()
    ev_id = ev_data["id"]
    assert ev_data["sha256_hash"] == orig_hash

    # 3. Run all analyses
    for m in ["metadata", "ela", "noise", "jpeg-dct"]:
        res_j = client.post(f"/api/jobs/analysis/{ev_id}/{m}")
        assert res_j.status_code == 202

    # 4. Generate Report
    res_r = client.post(f"/api/cases/{case_id}/reports?format=json")
    assert res_r.status_code == 200

    # 5. Check hash on disk after all operations
    from app.models.domain import Evidence
    ev_db = db_session.query(Evidence).filter(Evidence.id == ev_id).first()
    assert ev_db is not None
    with open(ev_db.stored_path, "rb") as f:
        current_hash = hashlib.sha256(f.read()).hexdigest()

    assert current_hash == orig_hash == ev_db.sha256_hash, "Evidence source modified during analysis pipeline!"


def test_phase7_negative_evidence_vs_method_inapplicability(client, db_session, ensure_fixtures):
    """
    PHASE 7G: Negative Evidence vs. Absence of Evidence.
    Verifies that running DCT on a lossless PNG does NOT report clean authenticity,
    but explicitly triggers METHOD_INAPPLICABILITY_CONFLICT under CORR-CONFLICT-005.
    """
    clean_png = os.path.join(ensure_fixtures, "clean_reference.png")

    res_c = client.post("/api/cases", json={"title": "Negative vs Absence Case"})
    case_id = res_c.json()["id"]

    with open(clean_png, "rb") as f:
        res_e = client.post(
            f"/api/cases/{case_id}/evidence",
            files={"file": ("clean_reference.png", f, "image/png")}
        )
    assert res_e.status_code == 200
    ev_id = res_e.json()["id"]

    # Run DCT job on PNG (will record FAILED due to container format)
    res_job = client.post(f"/api/jobs/analysis/{ev_id}/jpeg-dct")
    assert res_job.status_code == 202

    # Run correlation engine
    res_corr = client.post(f"/api/cases/{case_id}/correlations/run")
    assert res_corr.status_code == 200
    corr_data = res_corr.json()

    # Must include CORR-CONFLICT-005 distinguishing inapplicability from clean verdict
    rule_ids = [f.get("correlation_rule_id") for f in corr_data]
    assert "CORR-CONFLICT-005" in rule_ids, "Failed to flag format inapplicability conflict!"
    
    conflict_finding = next(f for f in corr_data if f.get("correlation_rule_id") == "CORR-CONFLICT-005")
    assert "PNG" in conflict_finding["summary"] or "inapplicability" in conflict_finding["summary"].lower()
    assert "NEGATIVE EVIDENCE" in conflict_finding["interpretation"]
