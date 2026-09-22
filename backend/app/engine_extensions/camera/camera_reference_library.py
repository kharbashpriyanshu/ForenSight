"""
Case-scoped Camera Reference Fingerprint Library.

Stores and retrieves PRNU camera sensor reference fingerprints (.npy arrays and metadata.json)
strictly isolated by case: storage/cases/{case_id}/camera_references/{reference_id}/.
"""

import os
import json
import hashlib
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Tuple, Dict, Any
import numpy as np

from app.core.config import settings
from app.engine_extensions.camera.camera_id_models import CameraReferenceMetadata


class CameraReferenceLibrary:
    """Case-scoped persistent storage manager for camera PRNU sensor reference fingerprints."""

    @classmethod
    def _get_base_dir(cls, case_id: Any) -> str:
        case_str = str(case_id).strip()
        # Sanitize against path traversal
        clean_case = os.path.basename(case_str)
        if not clean_case or ".." in case_str:
            clean_case = "default"
        base = os.path.join(settings.STORAGE_DIR, "cases", clean_case, "camera_references")
        os.makedirs(base, exist_ok=True)
        return base

    @classmethod
    def list_references(cls, case_id: Any) -> List[CameraReferenceMetadata]:
        """Lists all stored camera references for the given case."""
        base_dir = cls._get_base_dir(case_id)
        results: List[CameraReferenceMetadata] = []
        if not os.path.exists(base_dir):
            return results

        for entry in sorted(os.listdir(base_dir)):
            ref_dir = os.path.join(base_dir, entry)
            if not os.path.isdir(ref_dir):
                continue
            meta_path = os.path.join(ref_dir, "metadata.json")
            if os.path.isfile(meta_path):
                try:
                    with open(meta_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    results.append(CameraReferenceMetadata(**data))
                except Exception:
                    continue
        return results

    @classmethod
    def get_reference(
        cls,
        case_id: Any,
        reference_id: str,
    ) -> Optional[Tuple[CameraReferenceMetadata, np.ndarray]]:
        """Retrieves camera reference metadata and .npy fingerprint array for given case and reference_id."""
        clean_ref = os.path.basename(str(reference_id).strip())
        if not clean_ref or ".." in str(reference_id):
            return None

        base_dir = cls._get_base_dir(case_id)
        ref_dir = os.path.join(base_dir, clean_ref)
        meta_path = os.path.join(ref_dir, "metadata.json")
        fp_path = os.path.join(ref_dir, "fingerprint.npy")

        if not (os.path.isfile(meta_path) and os.path.isfile(fp_path)):
            return None

        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            metadata = CameraReferenceMetadata(**data)
            fingerprint = np.load(fp_path).astype(np.float32)
            return metadata, fingerprint
        except Exception:
            return None

    @classmethod
    def save_reference(
        cls,
        case_id: Any,
        camera_label: str,
        fingerprint: np.ndarray,
        make_model: Optional[str] = None,
        serial_number: Optional[str] = None,
        num_images_aggregated: int = 1,
        notes: Optional[str] = None,
        reference_id: Optional[str] = None,
    ) -> CameraReferenceMetadata:
        """Saves a new PRNU reference fingerprint to case storage."""
        if fingerprint.ndim != 2:
            raise ValueError(f"Fingerprint array must be 2D, got shape {fingerprint.shape}")

        clean_case = str(case_id).strip()
        ref_id = reference_id or f"cam-ref-{uuid.uuid4().hex[:12]}"
        clean_ref = os.path.basename(ref_id)

        base_dir = cls._get_base_dir(clean_case)
        ref_dir = os.path.join(base_dir, clean_ref)
        os.makedirs(ref_dir, exist_ok=True)

        fp_path = os.path.join(ref_dir, "fingerprint.npy")
        np.save(fp_path, fingerprint.astype(np.float32))

        # Compute SHA-256
        with open(fp_path, "rb") as f:
            file_bytes = f.read()
        sha256_hash = hashlib.sha256(file_bytes).hexdigest()

        h, w = fingerprint.shape
        created_at = datetime.now(timezone.utc).isoformat()

        metadata = CameraReferenceMetadata(
            reference_id=clean_ref,
            case_id=clean_case,
            camera_label=camera_label.strip(),
            make_model=make_model.strip() if make_model else None,
            serial_number=serial_number.strip() if serial_number else None,
            width=int(w),
            height=int(h),
            num_images_aggregated=max(1, int(num_images_aggregated)),
            sha256_hash=sha256_hash,
            created_at=created_at,
            notes=notes.strip() if notes else None,
        )

        meta_path = os.path.join(ref_dir, "metadata.json")
        with open(meta_path, "w", encoding="utf-8") as f:
            f.write(metadata.model_dump_json(indent=2))

        return metadata

    @classmethod
    def delete_reference(cls, case_id: Any, reference_id: str) -> bool:
        """Deletes a reference fingerprint from case storage."""
        clean_ref = os.path.basename(str(reference_id).strip())
        base_dir = cls._get_base_dir(case_id)
        ref_dir = os.path.join(base_dir, clean_ref)
        if not os.path.exists(ref_dir):
            return False

        import shutil
        shutil.rmtree(ref_dir, ignore_errors=True)
        return True
