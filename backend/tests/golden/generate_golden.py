import os
import json
import tempfile
from app.forensics.metadata.extractor import MetadataExtractor
from app.forensics.ela.engine import ELAEngine
from app.forensics.noise.engine import NoiseEngine
from app.forensics.jpeg_dct.engine import JPEGDCTEngine
from app.forensics.copy_move.engine import CopyMoveEngine
from app.services.correlation import CorrelationEngine

GOLDEN_DIR = os.path.dirname(__file__)
FIXTURES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fixtures", "forensics")

def normalize_dict(obj):
    """Normalize non-deterministic fields like absolute paths, timestamps, UUIDs."""
    if isinstance(obj, dict):
        new_d = {}
        for k, v in obj.items():
            if k in ("error_image_path", "recompressed_image_path", "residual_image_path", 
                     "local_map_image_path", "visualization_path", "analysis_grid_path", "raw_metadata_path"):
                new_d[k] = "<NORMALIZED_PATH>"
            elif k in ("timestamp", "created_at", "completed_at", "queued_at", "started_at"):
                new_d[k] = "<NORMALIZED_TIMESTAMP>"
            elif k in ("job_id", "analysis_id", "finding_id", "evidence_id"):
                new_d[k] = "<NORMALIZED_ID>"
            else:
                new_d[k] = normalize_dict(v)
        return new_d
    elif isinstance(obj, list):
        return [normalize_dict(item) for item in obj]
    elif isinstance(obj, float):
        return round(obj, 4)
    return obj

def pydantic_to_dict(model):
    if hasattr(model, "model_dump"):
        return model.model_dump()
    elif hasattr(model, "dict"):
        return model.dict()
    return model

def generate_golden_records():
    os.makedirs(GOLDEN_DIR, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp_out:
        # 1. Metadata Golden from metadata_known_camera.jpg
        p_meta = os.path.join(FIXTURES_DIR, "metadata_known_camera.jpg")
        meta_res = MetadataExtractor.extract(p_meta)
        meta_dict = normalize_dict(pydantic_to_dict(meta_res))
        with open(os.path.join(GOLDEN_DIR, "clean_jpeg_metadata.golden.json"), "w", encoding="utf-8") as f:
            json.dump(meta_dict, f, indent=2, sort_keys=True)

        # 2. ELA Golden from clean_reference.jpg
        p_ela = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
        ela_res = ELAEngine.run(p_ela, tmp_out, quality=90)
        ela_dict = normalize_dict(pydantic_to_dict(ela_res))
        with open(os.path.join(GOLDEN_DIR, "clean_jpeg_ela.golden.json"), "w", encoding="utf-8") as f:
            json.dump(ela_dict, f, indent=2, sort_keys=True)

        # 3. Noise Golden from clean_reference.jpg
        p_noise = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
        noise_res = NoiseEngine.run(p_noise, tmp_out, kernel_size=5, sigma=1.0)
        noise_dict = normalize_dict(pydantic_to_dict(noise_res))
        with open(os.path.join(GOLDEN_DIR, "clean_jpeg_noise.golden.json"), "w", encoding="utf-8") as f:
            json.dump(noise_dict, f, indent=2, sort_keys=True)

        # 4. JPEG DCT Golden from clean_reference.jpg
        p_dct = os.path.join(FIXTURES_DIR, "clean_reference.jpg")
        dct_res = JPEGDCTEngine.run(p_dct, tmp_out)
        dct_dict = normalize_dict(pydantic_to_dict(dct_res))
        with open(os.path.join(GOLDEN_DIR, "clean_jpeg_dct.golden.json"), "w", encoding="utf-8") as f:
            json.dump(dct_dict, f, indent=2, sort_keys=True)

        # 5. Copy-Move Golden from synthetic_copy_move.jpg
        p_cm = os.path.join(FIXTURES_DIR, "synthetic_copy_move.jpg")
        cm_res = CopyMoveEngine.run(p_cm, tmp_out)
        cm_dict = normalize_dict(pydantic_to_dict(cm_res))
        with open(os.path.join(GOLDEN_DIR, "synthetic_copymove.golden.json"), "w", encoding="utf-8") as f:
            json.dump(cm_dict, f, indent=2, sort_keys=True)

        # 6. Correlation Rules Golden
        from app.services.correlation import CORRELATION_RULES
        rules_dict = normalize_dict(CORRELATION_RULES)
        with open(os.path.join(GOLDEN_DIR, "correlation_rules.golden.json"), "w", encoding="utf-8") as f:
            json.dump(rules_dict, f, indent=2, sort_keys=True)

    print("Successfully generated all golden output snapshots in tests/golden/")

if __name__ == "__main__":
    generate_golden_records()
