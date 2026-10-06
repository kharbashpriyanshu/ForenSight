"""
ForenSight V4 — External & Local Dataset Adapters

Standardized loaders and validators for registering forensic datasets.
Enforces security safeguards:
- Strict path traversal defense (rejects '..' and directory escaping)
- Bitstream SHA-256 validation
- Graceful handling of missing masks and partial metadata
- Preservation of original dataset identity (CASIA, Columbia, NIST/OpenMFC)
"""

import os
import json
import hashlib
from typing import Dict, Any, List, Optional, Tuple, Union
from PIL import Image

from .models import (
    ImageRecord,
    DatasetManifest,
    AuthenticOrManipulated,
    ManipulationType,
    UncertaintyStatus,
    DatasetSnapshot,
    DatasetRegistrationReport,
)


def validate_safe_relative_path(dataset_root: str, rel_path: str) -> str:
    """
    Validates that a relative path does not escape the designated dataset root.
    Strictly defends against directory traversal attacks.
    """
    if not rel_path or ".." in rel_path or rel_path.startswith("/") or rel_path.startswith("\\"):
        raise ValueError(f"Path traversal detected in relative path: '{rel_path}'")

    full_path = os.path.abspath(os.path.join(dataset_root, rel_path))
    root_abs = os.path.abspath(dataset_root)

    if not full_path.startswith(root_abs):
        raise ValueError(f"Resolved path escapes target directory: '{full_path}'")

    return full_path


def compute_sha256(file_path: str) -> str:
    """Computes bit-for-bit SHA-256 hex digest of file."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


class BaseDatasetAdapter:
    """Abstract interface for dataset loading and integrity verification."""

    def __init__(self, dataset_root: str):
        self.dataset_root = os.path.abspath(dataset_root)

    def load_manifest(self) -> DatasetManifest:
        raise NotImplementedError

    def get_image(self, record: ImageRecord) -> Tuple[str, Optional[str]]:
        """
        Validates path safety, file presence, and SHA-256 hash.
        Returns: (full_image_path, full_mask_path_or_none)
        """
        img_p = validate_safe_relative_path(self.dataset_root, record.filename)
        if not os.path.exists(img_p):
            raise FileNotFoundError(f"Image not found on disk: {img_p}")

        if record.sha256:
            calc_hash = compute_sha256(img_p)
            if calc_hash.lower() != record.sha256.lower():
                raise ValueError(
                    f"SHA-256 hash mismatch for {record.image_id}. "
                    f"Expected {record.sha256}, calculated {calc_hash}."
                )

        mask_p = None
        if record.ground_truth_mask:
            mask_p = validate_safe_relative_path(self.dataset_root, record.ground_truth_mask)
            if not os.path.exists(mask_p):
                mask_p = None

        return img_p, mask_p

    def verify_integrity(self, manifest: DatasetManifest) -> Tuple[int, int, List[str]]:
        """
        Scans all files in manifest and verifies SHA-256 digests.
        Returns: (verified_count, failed_count, error_messages)
        """
        verified = 0
        failed = 0
        errors = []

        for record in manifest.images:
            try:
                self.get_image(record)
                verified += 1
            except Exception as e:
                failed += 1
                errors.append(f"Security/IO error validating {record.image_id}: {str(e)}")

        return verified, failed, errors


class ManifestDatasetAdapter(BaseDatasetAdapter):
    """Loads any dataset governed by a standard ForenSight manifest.json or DatasetManifest."""

    def __init__(self, dataset_root: str, manifest_filename_or_obj: Union[str, DatasetManifest] = "manifest.json"):
        super().__init__(dataset_root)
        if isinstance(manifest_filename_or_obj, DatasetManifest):
            self._preloaded_manifest = manifest_filename_or_obj
            self.manifest_path = os.path.join(self.dataset_root, "manifest.json")
        else:
            self._preloaded_manifest = None
            self.manifest_path = validate_safe_relative_path(self.dataset_root, manifest_filename_or_obj)

    def load_manifest(self) -> DatasetManifest:
        if self._preloaded_manifest is not None:
            return self._preloaded_manifest

        if not os.path.exists(self.manifest_path):
            raise FileNotFoundError(f"Manifest not found: {self.manifest_path}")

        with open(self.manifest_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        return DatasetManifest.model_validate(data)


class GenericDirectoryAdapter(BaseDatasetAdapter):
    """
    Crawls an un-manifested directory of images and auto-generates a baseline manifest
    without guessing ground truth (marks all unknown fields as 'UNKNOWN').
    """

    SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}

    def __init__(self, dataset_root: str, dataset_id: str = "custom-external", dataset_name: str = "Custom Dataset"):
        super().__init__(dataset_root)
        self.dataset_id = dataset_id
        self.dataset_name = dataset_name

    def load_manifest(self) -> DatasetManifest:
        images: List[ImageRecord] = []
        seen_hashes = set()

        for root, _, files in os.walk(self.dataset_root):
            for file in sorted(files):
                ext = os.path.splitext(file)[1].lower()
                if ext not in self.SUPPORTED_EXTENSIONS:
                    continue

                abs_p = os.path.join(root, file)
                rel_p = os.path.relpath(abs_p, self.dataset_root).replace("\\", "/")
                
                # Compute SHA-256
                sha = compute_sha256(abs_p)
                if sha in seen_hashes:
                    # Duplicate bitstream in dataset
                    continue
                seen_hashes.add(sha)

                # Inspect dimensions
                width = 0
                height = 0
                color_mode = "RGB"
                fmt = ext.replace(".", "").upper()
                try:
                    with Image.open(abs_p) as pil_img:
                        width, height = pil_img.size
                        color_mode = pil_img.mode
                        fmt = pil_img.format or fmt
                except Exception:
                    pass

                img_id = f"{self.dataset_id}_{len(images)+1:04d}"
                images.append(ImageRecord(
                    image_id=img_id,
                    dataset_id=self.dataset_id,
                    source="Imported Local Directory",
                    source_license="UNKNOWN",
                    filename=rel_p,
                    sha256=sha,
                    format=fmt,
                    width=width,
                    height=height,
                    color_mode=color_mode,
                    authentic_or_manipulated=AuthenticOrManipulated.UNKNOWN,
                    manipulation_type=ManipulationType.UNKNOWN,
                    ground_truth_mask=None,
                    notes="Auto-indexed via GenericDirectoryAdapter"
                ))

        return DatasetManifest(
            manifest_version="1.0.0",
            dataset_id=self.dataset_id,
            dataset_version="1.0.0",
            dataset_name=self.dataset_name,
            dataset_type="EXTERNAL",
            description=f"Auto-indexed local directory dataset at {self.dataset_root}",
            creation_date="2026-09-22T00:00:00Z",
            images=images
        )


class CASIADatasetAdapter(BaseDatasetAdapter):
    """
    Adapter for CASIA Image Tampering Detection Dataset (v1.0 & v2.0).
    Parses naming conventions (e.g. 'Au' for authentic, 'Tp' for tampered).
    """

    def __init__(self, dataset_root: str, manifest_filename: Optional[str] = None):
        super().__init__(dataset_root)
        self.manifest_filename = manifest_filename

    def load_manifest(self) -> DatasetManifest:
        if self.manifest_filename:
            m_path = os.path.join(self.dataset_root, self.manifest_filename)
            if os.path.exists(m_path):
                with open(m_path, "r", encoding="utf-8") as f:
                    return DatasetManifest.model_validate(json.load(f))

        images: List[ImageRecord] = []
        for root, _, files in os.walk(self.dataset_root):
            for file in sorted(files):
                ext = os.path.splitext(file)[1].lower()
                if ext not in {".jpg", ".jpeg", ".tif", ".tiff", ".png"}:
                    continue

                abs_p = os.path.join(root, file)
                rel_p = os.path.relpath(abs_p, self.dataset_root).replace("\\", "/")
                sha = compute_sha256(abs_p)

                # Heuristic naming parsing for CASIA conventions
                fn_lower = file.lower()
                if fn_lower.startswith("au_") or "authentic" in root.lower():
                    auth_status = AuthenticOrManipulated.AUTHENTIC
                    manip_type = ManipulationType.NONE
                elif fn_lower.startswith("tp_") or "tampered" in root.lower() or "casia" in root.lower():
                    auth_status = AuthenticOrManipulated.MANIPULATED
                    # In CASIA, 'D' often denotes copy-move, 'S' denotes splicing
                    if "_d_" in fn_lower:
                        manip_type = ManipulationType.COPY_MOVE
                    elif "_s_" in fn_lower:
                        manip_type = ManipulationType.SPLICING
                    else:
                        manip_type = ManipulationType.UNKNOWN
                else:
                    auth_status = AuthenticOrManipulated.UNKNOWN
                    manip_type = ManipulationType.UNKNOWN

                width, height = 0, 0
                fmt = ext.replace(".", "").upper()
                try:
                    with Image.open(abs_p) as pil_img:
                        width, height = pil_img.size
                        fmt = pil_img.format or fmt
                except Exception:
                    pass

                images.append(ImageRecord(
                    image_id=f"casia_{len(images)+1:04d}",
                    dataset_id="casia",
                    source="CASIA Institute of Automation",
                    source_license="Research-Only / Non-Commercial",
                    filename=rel_p,
                    sha256=sha,
                    format=fmt,
                    width=width,
                    height=height,
                    authentic_or_manipulated=auth_status,
                    manipulation_type=manip_type,
                    notes="Imported via CASIADatasetAdapter"
                ))

        return DatasetManifest(
            manifest_version="1.0.0",
            dataset_id="casia",
            dataset_version="2.0",
            dataset_name="CASIA Image Tampering Detection Dataset",
            dataset_type="EXTERNAL",
            description="CASIA image splicing and copy-move evaluation benchmark collection.",
            creation_date="2026-09-22T00:00:00Z",
            images=images
        )


class ColumbiaDatasetAdapter(BaseDatasetAdapter):
    """
    Adapter for Columbia Uncompressed Image Splicing Detection Dataset.
    High-resolution authentic vs spliced uncompressed TIFF pairs.
    """

    def load_manifest(self) -> DatasetManifest:
        images: List[ImageRecord] = []
        for root, _, files in os.walk(self.dataset_root):
            for file in sorted(files):
                ext = os.path.splitext(file)[1].lower()
                if ext not in {".tif", ".tiff", ".bmp", ".png"}:
                    continue

                abs_p = os.path.join(root, file)
                rel_p = os.path.relpath(abs_p, self.dataset_root).replace("\\", "/")
                sha = compute_sha256(abs_p)

                fn_lower = file.lower()
                root_lower = root.lower()

                # Determine authentic vs spliced
                if "authentic" in root_lower or "auth" in fn_lower:
                    auth_status = AuthenticOrManipulated.AUTHENTIC
                    manip_type = ManipulationType.NONE
                elif "spliced" in root_lower or "splice" in fn_lower:
                    auth_status = AuthenticOrManipulated.MANIPULATED
                    manip_type = ManipulationType.SPLICING
                else:
                    auth_status = AuthenticOrManipulated.UNKNOWN
                    manip_type = ManipulationType.UNKNOWN

                width, height = 0, 0
                fmt = ext.replace(".", "").upper()
                try:
                    with Image.open(abs_p) as pil_img:
                        width, height = pil_img.size
                        fmt = pil_img.format or fmt
                except Exception:
                    pass

                images.append(ImageRecord(
                    image_id=f"columbia_{len(images)+1:04d}",
                    dataset_id="columbia-splicing",
                    source="Columbia University DVMM Lab",
                    source_license="Academic Research Only",
                    filename=rel_p,
                    sha256=sha,
                    format=fmt,
                    width=width,
                    height=height,
                    authentic_or_manipulated=auth_status,
                    manipulation_type=manip_type,
                    ground_truth_availability=UncertaintyStatus.KNOWN,
                    compression_history_status=UncertaintyStatus.KNOWN,
                    annotation_provenance="Columbia DVMM Lab Ground Truth Annotations",
                    notes="Imported via ColumbiaDatasetAdapter"
                ))

        return DatasetManifest(
            manifest_version="1.0.0",
            dataset_id="columbia-splicing",
            dataset_version="1.0",
            dataset_name="Columbia Uncompressed Image Splicing Evaluation Dataset",
            dataset_type="EXTERNAL",
            description="Uncompressed TIFF photographic splicing evaluation benchmark collection.",
            creation_date="2026-09-22T00:00:00Z",
            images=images
        )


class NISTOpenMFCDatasetAdapter(BaseDatasetAdapter):
    """
    Adapter for NIST / DARPA Media Forensics Challenge (OpenMFC) datasets.
    Handles heterogeneous operations (splicing, removal, color alteration).
    """

    def load_manifest(self) -> DatasetManifest:
        images: List[ImageRecord] = []
        for root, _, files in os.walk(self.dataset_root):
            for file in sorted(files):
                ext = os.path.splitext(file)[1].lower()
                if ext not in {".jpg", ".jpeg", ".tif", ".tiff", ".png"}:
                    continue

                abs_p = os.path.join(root, file)
                rel_p = os.path.relpath(abs_p, self.dataset_root).replace("\\", "/")
                sha = compute_sha256(abs_p)

                width, height = 0, 0
                fmt = ext.replace(".", "").upper()
                try:
                    with Image.open(abs_p) as pil_img:
                        width, height = pil_img.size
                        fmt = pil_img.format or fmt
                except Exception:
                    pass

                images.append(ImageRecord(
                    image_id=f"openmfc_{len(images)+1:04d}",
                    dataset_id="nist-openmfc",
                    source="NIST / DARPA Media Forensics Challenge (OpenMFC)",
                    source_license="OpenMFC Evaluation License",
                    filename=rel_p,
                    sha256=sha,
                    format=fmt,
                    width=width,
                    height=height,
                    authentic_or_manipulated=AuthenticOrManipulated.UNKNOWN,
                    manipulation_type=ManipulationType.UNKNOWN,
                    ground_truth_availability=UncertaintyStatus.UNVERIFIED,
                    annotation_provenance="NIST OpenMFC Manifest Specifications",
                    notes="Imported via NISTOpenMFCDatasetAdapter"
                ))

        return DatasetManifest(
            manifest_version="1.0.0",
            dataset_id="nist-openmfc",
            dataset_version="1.0",
            dataset_name="NIST Media Forensics Challenge Evaluation Dataset",
            dataset_type="EXTERNAL",
            description="NIST / DARPA Media Forensics multi-modal manipulation challenge dataset.",
            creation_date="2026-09-22T00:00:00Z",
            images=images
        )


# =========================================================================
# Dataset Registration & Cryptographic Snapshot Verification
# =========================================================================

def register_dataset(
    dataset_dir: str,
    manifest_filename: str = "manifest.json"
) -> DatasetRegistrationReport:
    """
    Validates manifest and on-disk files, validates safe paths, computes SHA-256,
    checks image decodability and dimensions, detects duplicate bitstream hashes,
    and generates an immutable dataset_snapshot.json.
    Never mutates source image files.
    """
    import uuid
    import time

    dataset_root = os.path.abspath(dataset_dir)
    reg_id = str(uuid.uuid4())
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    errors: List[str] = []
    duplicate_hashes: List[str] = []

    if not os.path.exists(dataset_root) or not os.path.isdir(dataset_root):
        return DatasetRegistrationReport(
            registration_id=reg_id,
            dataset_id="UNKNOWN",
            dataset_version="UNKNOWN",
            status="INVALID",
            is_valid=False,
            validation_errors=[f"Dataset directory does not exist or is not a directory: {dataset_root}"],
            timestamp_utc=ts
        )

    try:
        manifest_path = validate_safe_relative_path(dataset_root, manifest_filename)
    except Exception as e:
        return DatasetRegistrationReport(
            registration_id=reg_id,
            dataset_id="UNKNOWN",
            dataset_version="UNKNOWN",
            status="INVALID",
            is_valid=False,
            validation_errors=[f"Invalid manifest relative path: {str(e)}"],
            timestamp_utc=ts
        )

    if not os.path.exists(manifest_path):
        return DatasetRegistrationReport(
            registration_id=reg_id,
            dataset_id="UNKNOWN",
            dataset_version="UNKNOWN",
            status="INVALID",
            is_valid=False,
            validation_errors=[f"Manifest file not found: {manifest_path}"],
            timestamp_utc=ts
        )

    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest_data = json.load(f)
        manifest = DatasetManifest.model_validate(manifest_data)
    except Exception as e:
        return DatasetRegistrationReport(
            registration_id=reg_id,
            dataset_id="UNKNOWN",
            dataset_version="UNKNOWN",
            status="INVALID",
            is_valid=False,
            validation_errors=[f"Manifest parsing/validation failed: {str(e)}"],
            timestamp_utc=ts
        )

    total_bytes = 0
    validated_images = 0
    validated_masks = 0
    seen_hashes: Dict[str, str] = {} # sha256 -> image_id

    if not manifest.images:
        errors.append("Dataset manifest contains no image records")
    dataset_type = manifest.dataset_type.strip().upper()
    if dataset_type not in {"CONTROLLED", "EXTERNAL"}:
        errors.append("dataset_type must be either CONTROLLED or EXTERNAL")
    image_ids = [record.image_id for record in manifest.images]
    if len(image_ids) != len(set(image_ids)):
        errors.append("Dataset manifest contains duplicate image_id values")
    if dataset_type == "EXTERNAL":
        required_provenance = (
            "source_url", "license_id", "license_url", "rights_review_reference",
            "acquisition_date", "acquisition_method", "ground_truth_source",
            "split_policy", "held_out_grouping", "known_limitations",
        )
        provenance = manifest.provenance or {}
        for key in required_provenance:
            value = provenance.get(key)
            if not isinstance(value, str) or not value.strip() or value.strip().upper() in {"UNKNOWN", "TBD", "TODO"}:
                errors.append(f"External dataset provenance requires a reviewed '{key}' value")
        if any(not record.source_license.strip() or record.source_license.strip().upper() == "UNKNOWN" for record in manifest.images):
            errors.append("Every external image record must declare its source_license")

    for rec in manifest.images:
        if len(rec.sha256) != 64 or any(char not in "0123456789abcdefABCDEF" for char in rec.sha256):
            errors.append(f"Invalid or missing SHA-256 digest for {rec.image_id}")
        try:
            img_p = validate_safe_relative_path(dataset_root, rec.filename)
        except Exception as e:
            errors.append(f"Security error for {rec.image_id}: {str(e)}")
            continue

        if not os.path.exists(img_p):
            errors.append(f"Source image file missing on disk: {rec.filename}")
            continue

        file_size = os.path.getsize(img_p)
        total_bytes += file_size

        calc_sha = compute_sha256(img_p)
        if rec.sha256 and rec.sha256.lower() != calc_sha.lower():
            errors.append(
                f"SHA-256 mismatch for {rec.image_id}. Expected {rec.sha256}, calculated {calc_sha}."
            )
            continue

        # Check for duplicates
        if calc_sha in seen_hashes:
            duplicate_hashes.append(calc_sha)
        else:
            seen_hashes[calc_sha] = rec.image_id

        # Validate image readability and dimensions
        try:
            with Image.open(img_p) as pimg:
                w, h = pimg.size
                if rec.width > 0 and rec.height > 0:
                    if w != rec.width or h != rec.height:
                        errors.append(
                            f"Dimensional mismatch for {rec.image_id}: manifest says {rec.width}x{rec.height}, image is {w}x{h}."
                        )
        except Exception as e:
            errors.append(f"Failed to decode image file {rec.filename}: {str(e)}")
            continue

        validated_images += 1

        # Validate mask if specified
        if rec.ground_truth_mask:
            try:
                mask_p = validate_safe_relative_path(dataset_root, rec.ground_truth_mask)
                if not os.path.exists(mask_p):
                    errors.append(f"Referenced mask not found on disk: {rec.ground_truth_mask}")
                else:
                    total_bytes += os.path.getsize(mask_p)
                    with Image.open(mask_p) as pmask:
                        mw, mh = pmask.size
                        if (mw, mh) != (w, h):
                            errors.append(
                                f"Mask dimensions {mw}x{mh} do not match image {w}x{h} for {rec.image_id}."
                            )
                        else:
                            validated_masks += 1
            except Exception as e:
                errors.append(f"Security/decoding error for mask {rec.ground_truth_mask}: {str(e)}")

    is_valid = len(errors) == 0
    status_str = "VALID" if is_valid else "INVALID"

    snapshot_path = None
    if is_valid:
        snap = create_dataset_snapshot(dataset_root, manifest)
        snapshot_path = os.path.join(dataset_root, "dataset_snapshot.json")

    report = DatasetRegistrationReport(
        registration_id=reg_id,
        dataset_id=manifest.dataset_id,
        dataset_version=manifest.dataset_version,
        status=status_str,
        is_valid=is_valid,
        total_images_discovered=validated_images,
        total_masks_validated=validated_masks,
        total_bytes=total_bytes,
        duplicate_hash_count=len(duplicate_hashes),
        duplicate_hashes=duplicate_hashes,
        validation_errors=errors,
        snapshot_path=snapshot_path,
        timestamp_utc=ts
    )

    report_p = os.path.join(dataset_root, "dataset_registration_report.json")
    with open(report_p, "w", encoding="utf-8") as f:
        json.dump(report.model_dump(), f, indent=2)

    return report


def create_dataset_snapshot(
    dataset_dir: str,
    manifest: Optional[DatasetManifest] = None,
    output_filename: str = "dataset_snapshot.json"
) -> DatasetSnapshot:
    """
    Generates an immutable cryptographic snapshot of a dataset including all
    image hashes, mask hashes, and manifest hash.
    """
    import time
    dataset_root = os.path.abspath(dataset_dir)

    if manifest is None:
        adapter = ManifestDatasetAdapter(dataset_root)
        manifest = adapter.load_manifest()

    manifest_p = os.path.join(dataset_root, "manifest.json")
    manifest_sha = compute_sha256(manifest_p) if os.path.exists(manifest_p) else ""

    image_hashes: Dict[str, str] = {}
    mask_hashes: Dict[str, str] = {}
    total_bytes = 0

    for rec in manifest.images:
        img_p = validate_safe_relative_path(dataset_root, rec.filename)
        if os.path.exists(img_p):
            h = compute_sha256(img_p)
            image_hashes[rec.filename] = h
            total_bytes += os.path.getsize(img_p)

        if rec.ground_truth_mask:
            mask_p = validate_safe_relative_path(dataset_root, rec.ground_truth_mask)
            if os.path.exists(mask_p):
                mh = compute_sha256(mask_p)
                mask_hashes[rec.ground_truth_mask] = mh
                total_bytes += os.path.getsize(mask_p)

    snap = DatasetSnapshot(
        dataset_id=manifest.dataset_id,
        dataset_version=manifest.dataset_version,
        total_records=len(image_hashes),
        total_bytes=total_bytes,
        manifest_sha256=manifest_sha,
        image_hashes=image_hashes,
        mask_hashes=mask_hashes,
        generated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        harness_version="1.0.0"
    )

    out_p = os.path.join(dataset_root, output_filename)
    with open(out_p, "w", encoding="utf-8") as f:
        json.dump(snap.model_dump(), f, indent=2)

    return snap


def verify_dataset_snapshot(
    dataset_dir: str,
    snapshot_filename: str = "dataset_snapshot.json"
) -> Tuple[bool, str, List[str]]:
    """
    Verifies on-disk files against dataset_snapshot.json.
    Returns: (is_valid, status_str, reasons)
    """
    dataset_root = os.path.abspath(dataset_dir)
    reasons: List[str] = []

    try:
        snap_p = validate_safe_relative_path(dataset_root, snapshot_filename)
    except Exception as e:
        return False, "INVALID", [f"Invalid snapshot relative path: {str(e)}"]

    if not os.path.exists(snap_p):
        return False, "INVALID", [f"Snapshot file not found: {snap_p}"]

    try:
        with open(snap_p, "r", encoding="utf-8") as f:
            snap_data = json.load(f)
        snapshot = DatasetSnapshot.model_validate(snap_data)
    except Exception as e:
        return False, "INVALID", [f"Corrupted snapshot file: {str(e)}"]

    # 1. Verify manifest hash if recorded
    manifest_p = os.path.join(dataset_root, "manifest.json")
    if snapshot.manifest_sha256 and os.path.exists(manifest_p):
        cur_m_sha = compute_sha256(manifest_p)
        if cur_m_sha.lower() != snapshot.manifest_sha256.lower():
            reasons.append(
                f"Manifest SHA-256 altered! Expected {snapshot.manifest_sha256}, found {cur_m_sha}."
            )

    # 2. Verify all image hashes
    for rel_p, expected_sha in snapshot.image_hashes.items():
        try:
            full_img_p = validate_safe_relative_path(dataset_root, rel_p)
        except Exception as e:
            reasons.append(f"Security error for path {rel_p}: {str(e)}")
            continue

        if not os.path.exists(full_img_p):
            reasons.append(f"Missing image file referenced in snapshot: {rel_p}")
            continue

        cur_sha = compute_sha256(full_img_p)
        if cur_sha.lower() != expected_sha.lower():
            reasons.append(
                f"Hash mismatch / bitstream modification detected for image {rel_p}. Expected {expected_sha}, found {cur_sha}."
            )

    # 3. Verify all mask hashes
    for rel_m_p, expected_m_sha in snapshot.mask_hashes.items():
        try:
            full_mask_p = validate_safe_relative_path(dataset_root, rel_m_p)
        except Exception as e:
            reasons.append(f"Security error for mask path {rel_m_p}: {str(e)}")
            continue

        if not os.path.exists(full_mask_p):
            reasons.append(f"Missing mask file referenced in snapshot: {rel_m_p}")
            continue

        cur_m_sha = compute_sha256(full_mask_p)
        if cur_m_sha.lower() != expected_m_sha.lower():
            reasons.append(
                f"Hash mismatch / bitstream modification detected for mask {rel_m_p}. Expected {expected_m_sha}, found {cur_m_sha}."
            )

    is_valid = len(reasons) == 0
    status_str = "VALID" if is_valid else "INVALID"
    return is_valid, status_str, reasons

