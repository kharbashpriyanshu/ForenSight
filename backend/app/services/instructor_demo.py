"""Reproducible, idempotent instructor demonstration investigation (FS-DEMO-001)."""

from __future__ import annotations

import hashlib
import io
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
from PIL import Image, ImageDraw
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.domain import (
    AnalystNote,
    Analysis,
    AnalysisJob,
    AnalysisJobOutbox,
    AuditEvent,
    CaseIntakeContext,
    Evidence,
    EvidenceAssessment,
    EvidenceIntakeContext,
    EvidenceLineageRelation,
    EvidenceObservation,
    EvidenceRelation,
    Finding,
    InvestigationCase,
    Report,
    User,
)
from app.services.audit import AuditService
from app.services.findings import FindingService
from app.services.reports import REPORTLAB_AVAILABLE

DEMO_USERNAME = "demo_instructor"
DEMO_PASSWORD = "forensight_demo_instructor"
DEMO_ROLE = "INVESTIGATOR"
DEMO_CASE_IDENTIFIER = "FS-DEMO-001"
DEMO_CASE_TITLE = "Digital Image Manipulation Investigation — Recruitment Campaign"

SYNTHETIC_DISCLAIMER = (
    "SYNTHETIC TRAINING DATASET: All images, metadata, events, and findings in FS-DEMO-001 "
    "were programmatically generated for forensic instruction and demonstration."
)


def _assert_not_production() -> None:
    if settings.ENVIRONMENT.strip().lower() in {"production", "prod"}:
        raise RuntimeError("Refusing to seed or reset development demonstration data in production")


def ensure_demo_user(db: Session) -> User:
    """Create or update the isolated non-admin demonstration investigator account."""
    _assert_not_production()
    user = db.query(User).filter(User.username == DEMO_USERNAME).first()
    if not user:
        user = User(
            username=DEMO_USERNAME,
            hashed_password=get_password_hash(DEMO_PASSWORD),
            role=DEMO_ROLE,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    needs_pw = False
    try:
        if not verify_password(DEMO_PASSWORD, user.hashed_password):
            needs_pw = True
    except Exception:
        needs_pw = True

    if needs_pw or user.role != DEMO_ROLE:
        user.hashed_password = get_password_hash(DEMO_PASSWORD)
        user.role = DEMO_ROLE
        db.commit()
        db.refresh(user)
    return user


def _build_exif_bytes(make: str, model: str, dt_str: str) -> bytes:
    """Build minimal valid TIFF/EXIF bytes with Make, Model, and DateTimeOriginal."""
    exif = Image.Exif()
    exif[271] = make        # Make
    exif[272] = model       # Model
    exif[306] = dt_str      # DateTime
    exif[36867] = dt_str    # DateTimeOriginal
    return exif.tobytes()


def _generate_textured_scene(width: int, height: int, seed: int, palette_shift: int = 0) -> np.ndarray:
    """Generate a deterministic, rich-texture synthetic image suitable for ELA, DCT, noise, and keypoint engines."""
    rng = np.random.default_rng(seed)
    y_grid, x_grid = np.mgrid[0:height, 0:width]

    # Smooth studio gradient background + subtle sensor-like noise
    base_r = np.clip(45 + palette_shift + 85 * (x_grid / width) + 25 * np.sin(y_grid / 42.0), 0, 255)
    base_g = np.clip(65 + 70 * (y_grid / height) + 20 * np.cos(x_grid / 55.0), 0, 255)
    base_b = np.clip(95 - palette_shift // 2 + 60 * ((x_grid + y_grid) / (width + height)), 0, 255)
    arr = np.stack([base_r, base_g, base_b], axis=-1).astype(np.float32)

    # Add fine natural-like multi-scale texture so ORB/SIFT/DCT/Noise have real signal
    low_noise = rng.normal(0, 6.0, size=(height // 4, width // 4, 3))
    low_img = Image.fromarray(np.clip(128 + low_noise * 8, 0, 255).astype(np.uint8)).resize(
        (width, height), Image.Resampling.BICUBIC
    )
    arr += (np.asarray(low_img, dtype=np.float32) - 128.0) * 0.35
    arr += rng.normal(0, 3.2, size=(height, width, 3))

    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="RGB")
    draw = ImageDraw.Draw(img)

    # Architectural / campaign graphic elements with sharp edges and corners (keypoint-rich)
    draw.rectangle([70, 90, width - 70, height - 90], outline=(235, 225, 200), width=4)
    draw.rounded_rectangle([110, 130, 340, 320], radius=18, fill=(28, 56, 112), outline=(212, 160, 67), width=4)

    # Distinct high-contrast emblem inside (120..270, 140..290) for copy-move / lineage keypoints
    for i in range(6):
        cx = 165 + (i % 3) * 42
        cy = 185 + (i // 3) * 48
        draw.polygon(
            [(cx, cy - 16), (cx + 15, cy), (cx, cy + 16), (cx - 15, cy)],
            fill=(220 - i * 18, 175, 75 + i * 20),
            outline=(255, 255, 255),
        )

    # Diagonal grid lines & typography-like blocks on right side
    for idx in range(5):
        y0 = 150 + idx * 34
        draw.rectangle([380, y0, width - 120 - (idx % 2) * 60, y0 + 16], fill=(240, 238, 232))

    # Add deterministic micro-texture inside the emblem so SIFT/ORB finds dense keypoints
    out = np.asarray(img, dtype=np.int16)
    micro = rng.integers(-14, 15, size=(160, 160, 3))
    out[135:295, 115:275] = np.clip(out[135:295, 115:275] + micro, 0, 255)
    return out.astype(np.uint8)


def _encode_jpeg_bytes(arr: np.ndarray, quality: int, exif_bytes: Optional[bytes] = None) -> bytes:
    buf = io.BytesIO()
    img = Image.fromarray(arr, mode="RGB")
    save_kwargs: Dict[str, Any] = {"format": "JPEG", "quality": quality, "subsampling": 0}
    if exif_bytes:
        save_kwargs["exif"] = exif_bytes
    img.save(buf, **save_kwargs)
    return buf.getvalue()


def _encode_png_bytes(arr: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr, mode="RGB").save(buf, format="PNG")
    return buf.getvalue()


def _generate_demo_assets() -> Dict[str, Any]:
    """Build the 7 deterministic synthetic recruitment-campaign evidence files + ground-truth splice mask."""
    master_arr = _generate_textured_scene(960, 640, seed=20261112, palette_shift=0)
    master_exif = _build_exif_bytes("Lumix-Sim", "S5-Demo", "2026:09:14 10:22:00")
    master_bytes = _encode_jpeg_bytes(master_arr, quality=95, exif_bytes=master_exif)

    # 2. Derived web banner (cropped + resized, Q=82, stripped EXIF)
    master_img = Image.open(io.BytesIO(master_bytes)).convert("RGB")
    cropped = master_img.crop((40, 50, 920, 600)).resize((800, 520), Image.Resampling.LANCZOS)
    web_banner_bytes = _encode_jpeg_bytes(np.asarray(cropped), quality=82, exif_bytes=None)

    # 3. Double-compressed social reupload (re-encoded from web banner at Q=62)
    banner_decoded = np.asarray(Image.open(io.BytesIO(web_banner_bytes)).convert("RGB"))
    social_reupload_bytes = _encode_jpeg_bytes(banner_decoded, quality=62, exif_bytes=None)

    # 4. Deliberately manipulated composite splice (Q=55 patch inserted into Q=95 master) + ground-truth mask
    splice_base = np.asarray(Image.open(io.BytesIO(master_bytes)).convert("RGB")).copy()
    patch_rng = np.random.default_rng(998877)
    patch_scene = _generate_textured_scene(560, 420, seed=445566, palette_shift=70)
    patch_arr = patch_scene[120:270, 140:360].copy()
    patch_arr = np.clip(patch_arr.astype(np.int16) + patch_rng.integers(-10, 11, size=patch_arr.shape), 0, 255).astype(np.uint8)
    patch_q55 = np.asarray(Image.open(io.BytesIO(_encode_jpeg_bytes(patch_arr, quality=55))).convert("RGB"))
    sx, sy, sw, sh = 560, 320, 220, 150
    splice_base[sy:sy + sh, sx:sx + sw] = patch_q55
    splice_bytes = _encode_jpeg_bytes(splice_base, quality=92, exif_bytes=master_exif)

    mask_arr = np.zeros((640, 960), dtype=np.uint8)
    mask_arr[sy:sy + sh, sx:sx + sw] = 255
    mask_buf = io.BytesIO()
    Image.fromarray(mask_arr, mode="L").save(mask_buf, format="PNG")
    splice_mask_bytes = mask_buf.getvalue()

    # 5. Copy-move cloned poster (copies high-keypoint emblem 115..275, 135..295 -> 600..760, 360..520)
    clone_base = np.asarray(Image.open(io.BytesIO(master_bytes)).convert("RGB")).copy()
    clone_base[360:520, 600:760] = clone_base[135:295, 115:275]
    clone_bytes = _encode_jpeg_bytes(clone_base, quality=93, exif_bytes=master_exif)

    # 6. Lossless PNG press export
    press_png_bytes = _encode_png_bytes(master_arr)

    # 7. Unrelated negative-control office image from a different simulated camera
    unrelated_arr = _generate_textured_scene(800, 600, seed=771133, palette_shift=110)
    unrelated_exif = _build_exif_bytes("Nikon-Sim", "Z6-Demo", "2026:09:10 15:05:00")
    unrelated_bytes = _encode_jpeg_bytes(unrelated_arr, quality=92, exif_bytes=unrelated_exif)

    items = [
        {
            "filename": "campaign_studio_master.jpg",
            "mime_type": "image/jpeg",
            "bytes": master_bytes,
            "role": "master",
            "intake": {
                "source_platform": "Internal Studio Archive",
                "acquisition_method": "Direct Studio Export (Synthetic Reference)",
                "received_from": "Apex Global Brand Studio (Fictional)",
                "received_at": "2026-09-14T11:00:00Z",
                "reported_capture_time": "2026-09-14T10:22:00Z",
                "intake_notes": f"{SYNTHETIC_DISCLAIMER} Role: Pristine reference master (Q=95, Lumix-Sim S5-Demo).",
            },
        },
        {
            "filename": "campaign_web_banner.jpg",
            "mime_type": "image/jpeg",
            "bytes": web_banner_bytes,
            "role": "derived_banner",
            "intake": {
                "source_platform": "Corporate Careers Portal",
                "acquisition_method": "Web Asset Download",
                "received_from": "Apex Global Web Team (Fictional)",
                "received_at": "2026-09-15T09:15:00Z",
                "intake_notes": f"{SYNTHETIC_DISCLAIMER} Role: Cropped/resized Q=82 derivative of campaign_studio_master.jpg.",
            },
        },
        {
            "filename": "campaign_social_reupload.jpg",
            "mime_type": "image/jpeg",
            "bytes": social_reupload_bytes,
            "role": "double_jpeg",
            "intake": {
                "source_platform": "Social Media Recruitment Feed",
                "acquisition_method": "Platform Re-download",
                "received_from": "Public Campaign Monitoring (Fictional)",
                "received_at": "2026-09-16T14:30:00Z",
                "intake_notes": f"{SYNTHETIC_DISCLAIMER} Role: Recompressed Q=62 derivative of campaign_web_banner.jpg (double-JPEG).",
            },
        },
        {
            "filename": "campaign_composite_splice.jpg",
            "mime_type": "image/jpeg",
            "bytes": splice_bytes,
            "role": "splice",
            "intake": {
                "source_platform": "Third-Party Job Board",
                "acquisition_method": "Reported Suspect Submission",
                "received_from": "HR Compliance Desk (Fictional)",
                "received_at": "2026-09-17T08:45:00Z",
                "intake_notes": (
                    f"{SYNTHETIC_DISCLAIMER} Role: Synthetic localized splice (220x150 Q=55 patch at x=560,y=320). "
                    f"Ground-truth mask SHA-256: {hashlib.sha256(splice_mask_bytes).hexdigest()}"
                ),
            },
        },
        {
            "filename": "campaign_cloned_poster.jpg",
            "mime_type": "image/jpeg",
            "bytes": clone_bytes,
            "role": "copy_move",
            "intake": {
                "source_platform": "External Flyer Distribution",
                "acquisition_method": "Reported Suspect Submission",
                "received_from": "HR Compliance Desk (Fictional)",
                "received_at": "2026-09-17T10:10:00Z",
                "intake_notes": f"{SYNTHETIC_DISCLAIMER} Role: Synthetic copy-move clone (160x160 emblem duplicated from (115,135) to (600,360)).",
            },
        },
        {
            "filename": "campaign_press_png.png",
            "mime_type": "image/png",
            "bytes": press_png_bytes,
            "role": "lossless_png",
            "intake": {
                "source_platform": "Press Kit Archive",
                "acquisition_method": "Lossless Export",
                "received_from": "Apex Global Communications (Fictional)",
                "received_at": "2026-09-15T12:00:00Z",
                "intake_notes": f"{SYNTHETIC_DISCLAIMER} Role: Lossless PNG export of master scene for container/DCT contrast.",
            },
        },
        {
            "filename": "campaign_unrelated_office.jpg",
            "mime_type": "image/jpeg",
            "bytes": unrelated_bytes,
            "role": "negative_control",
            "intake": {
                "source_platform": "Facilities Archive",
                "acquisition_method": "Reference Control Sample",
                "received_from": "Apex Global Facilities (Fictional)",
                "received_at": "2026-09-12T16:00:00Z",
                "reported_capture_time": "2026-09-10T15:05:00Z",
                "intake_notes": f"{SYNTHETIC_DISCLAIMER} Role: Unrelated negative-control image (Nikon-Sim Z6-Demo).",
            },
        },
    ]

    return {"items": items, "splice_mask_bytes": splice_mask_bytes}


def reset_instructor_demo(db: Session) -> Dict[str, Any]:
    """Delete ONLY FS-DEMO-001 and its associated records/files. Never touches other cases."""
    _assert_not_production()
    case = db.query(InvestigationCase).filter(InvestigationCase.case_identifier == DEMO_CASE_IDENTIFIER).first()
    if not case:
        return {"removed": False, "case_identifier": DEMO_CASE_IDENTIFIER}

    evidences = db.query(Evidence).filter(Evidence.case_id == case.id).all()
    evidence_ids = [e.id for e in evidences]
    stored_paths = [e.stored_path for e in evidences if e.stored_path]

    reports = db.query(Report).filter(
        (Report.case_id == case.case_identifier) | (Report.case_id == str(case.id))
    ).all()
    report_paths = [r.artifact_path for r in reports if r.artifact_path]

    if evidence_ids:
        jobs = db.query(AnalysisJob).filter(AnalysisJob.evidence_id.in_(evidence_ids)).all()
        job_ids = [j.id for j in jobs]
        if job_ids:
            db.query(AnalysisJobOutbox).filter(AnalysisJobOutbox.job_id.in_(job_ids)).delete(synchronize_session=False)
        db.query(EvidenceRelation).filter(EvidenceRelation.evidence_id.in_(evidence_ids)).delete(synchronize_session=False)
        db.query(EvidenceAssessment).filter(EvidenceAssessment.evidence_id.in_(evidence_ids)).delete(synchronize_session=False)
        db.query(EvidenceObservation).filter(EvidenceObservation.evidence_id.in_(evidence_ids)).delete(synchronize_session=False)
        db.query(AnalysisJob).filter(AnalysisJob.evidence_id.in_(evidence_ids)).delete(synchronize_session=False)
        db.query(Analysis).filter(Analysis.evidence_id.in_(evidence_ids)).delete(synchronize_session=False)
        db.query(EvidenceIntakeContext).filter(EvidenceIntakeContext.evidence_id.in_(evidence_ids)).delete(synchronize_session=False)

    db.query(EvidenceLineageRelation).filter(EvidenceLineageRelation.case_id == case.id).delete(synchronize_session=False)
    db.query(Finding).filter((Finding.case_id == case.case_identifier) | (Finding.case_id == str(case.id))).delete(synchronize_session=False)
    db.query(AnalystNote).filter((AnalystNote.case_id == case.case_identifier) | (AnalystNote.case_id == str(case.id))).delete(synchronize_session=False)
    db.query(Report).filter((Report.case_id == case.case_identifier) | (Report.case_id == str(case.id))).delete(synchronize_session=False)
    db.query(AuditEvent).filter((AuditEvent.case_id == case.case_identifier) | (AuditEvent.case_id == str(case.id))).delete(synchronize_session=False)

    if evidence_ids:
        db.query(Evidence).filter(Evidence.id.in_(evidence_ids)).delete(synchronize_session=False)

    db.query(CaseIntakeContext).filter(CaseIntakeContext.case_id == case.id).delete(synchronize_session=False)
    db.delete(case)
    db.commit()

    for p in stored_paths + report_paths:
        if p and os.path.isfile(p):
            try:
                os.remove(p)
            except OSError:
                pass

    return {"removed": True, "case_identifier": DEMO_CASE_IDENTIFIER, "removed_evidence_count": len(evidence_ids)}


def _is_demo_complete(db: Session, case: InvestigationCase) -> bool:
    ev_count = db.query(Evidence).filter(Evidence.case_id == case.id).count()
    rep_count = db.query(Report).filter(Report.case_id == case.case_identifier).count()
    fnd_count = db.query(Finding).filter(Finding.case_id == case.case_identifier).count()
    return ev_count >= 7 and rep_count >= 1 and fnd_count >= 3


def seed_instructor_demo(db: Session, reset: bool = False) -> Dict[str, Any]:
    """
    Idempotently seed FS-DEMO-001 using ForenSight's actual HTTP/service pipeline.
    If partially seeded, safely resets only FS-DEMO-001 and re-seeds.
    """
    _assert_not_production()
    demo_user = ensure_demo_user(db)

    existing = db.query(InvestigationCase).filter(InvestigationCase.case_identifier == DEMO_CASE_IDENTIFIER).first()
    if existing and not reset:
        if _is_demo_complete(db, existing):
            return {
                "status": "already_seeded",
                "case_identifier": existing.case_identifier,
                "username": DEMO_USERNAME,
                "evidence_count": db.query(Evidence).filter(Evidence.case_id == existing.id).count(),
            }
        # Recover from partial seed state cleanly
        reset_instructor_demo(db)
    elif existing and reset:
        reset_instructor_demo(db)

    # Create the deterministic case identifier and log CASE_CREATED through AuditService
    case = InvestigationCase(
        case_identifier=DEMO_CASE_IDENTIFIER,
        title=DEMO_CASE_TITLE,
        status="Open",
        user_id=demo_user.id,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    AuditService.log_event(db, case.case_identifier, "CASE_CREATED", actor=demo_user.username)

    # Store ground-truth splice mask for reproducible reference
    gt_dir = Path(settings.STORAGE_DIR).resolve().parent / "demo_ground_truth"
    gt_dir.mkdir(parents=True, exist_ok=True)
    assets = _generate_demo_assets()
    mask_path = gt_dir / "campaign_composite_splice_mask.png"
    mask_path.write_bytes(assets["splice_mask_bytes"])

    # Execute the real application pipeline via TestClient bound to the active db session
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import sessionmaker
    from app.db.database import get_db
    from app.main import app

    prev_override = app.dependency_overrides.get(get_db)
    LocalSession = sessionmaker(autocommit=False, autoflush=False, bind=db.get_bind())

    def _override_db():
        s = LocalSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _override_db
    token = create_access_token(demo_user.username)
    headers = {"Authorization": f"Bearer {token}"}
    client = TestClient(app)

    try:
        # 1. Case Intake Context
        r_intake_ctx = client.put(
            f"/api/cases/{DEMO_CASE_IDENTIFIER}/intake",
            json={
                "claim_summary": (
                    "Apex Global Talent (fictional) reported suspected manipulation and unauthorized reuse "
                    "of recruitment campaign imagery across external job boards and social channels. "
                    + SYNTHETIC_DISCLAIMER
                ),
                "reported_event_date": "2026-09-17",
                "reported_location": "Synthetic Training Lab (Fictional)",
                "source_reference_url": "https://example.invalid/apex-recruitment-campaign",
                "intake_notes": SYNTHETIC_DISCLAIMER,
            },
            headers=headers,
        )
        assert r_intake_ctx.status_code == 200, r_intake_ctx.text

        # 2. Evidence Intake (real files, real SHA-256, real dimensions, real custody/audit events)
        evidence_by_role: Dict[str, Dict[str, Any]] = {}
        for item in assets["items"]:
            resp = client.post(
                "/api/cases/intake",
                data={
                    "case_id": DEMO_CASE_IDENTIFIER,
                    "source_platform": item["intake"]["source_platform"],
                    "acquisition_method": item["intake"]["acquisition_method"],
                    "received_from": item["intake"]["received_from"],
                    "received_at": item["intake"]["received_at"],
                    "reported_capture_time": item["intake"].get("reported_capture_time", ""),
                    "intake_notes": item["intake"]["intake_notes"],
                },
                files={"file": (item["filename"], io.BytesIO(item["bytes"]), item["mime_type"])},
                headers=headers,
            )
            assert resp.status_code == 200, f"Intake failed for {item['filename']}: {resp.text}"
            evidence_by_role[item["role"]] = resp.json()

        # 3. Execute real forensic analysis engines genuinely applicable to each evidence item
        role_modalities = {
            "master": ["metadata", "ela", "noise", "jpeg-dct"],
            "derived_banner": ["metadata", "jpeg-dct", "resampling"],
            "double_jpeg": ["metadata", "jpeg-dct", "adjpeg"],
            "splice": ["metadata", "ela", "noise", "jpeg-dct", "advanced-noise"],
            "copy_move": ["metadata", "copy-move", "clone-keypoint"],
            "lossless_png": ["metadata", "noise", "fourier"],
            "negative_control": ["metadata", "noise", "jpeg-dct"],
        }
        for role, ev in evidence_by_role.items():
            ev_id = ev["id"]
            modalities = role_modalities.get(role, ["metadata", "ela", "noise"])

            for mod in modalities:
                r_job = client.post(f"/api/jobs/analysis/{ev_id}/{mod}", headers=headers)
                assert r_job.status_code in (200, 202), f"Job {mod} failed for {ev_id}: {r_job.text}"

            # 4. Normalize observations & run intra-evidence correlation + assessment
            r_norm = client.post(f"/api/evidence/{ev_id}/fusion/normalize", headers=headers)
            assert r_norm.status_code == 200, f"Normalize failed for {ev_id}: {r_norm.text}"
            r_corr = client.post(f"/api/evidence/{ev_id}/fusion/correlate", headers=headers)
            assert r_corr.status_code == 200, f"Correlate failed for {ev_id}: {r_corr.text}"

        # 5. Compute Image Lineage & confirm genuine synthetic derivations
        r_lin = client.post(f"/api/cases/{DEMO_CASE_IDENTIFIER}/lineage/refresh", headers=headers)
        assert r_lin.status_code == 200, r_lin.text
        master_id = evidence_by_role["master"]["id"]
        banner_id = evidence_by_role["derived_banner"]["id"]
        social_id = evidence_by_role["double_jpeg"]["id"]
        splice_id = evidence_by_role["splice"]["id"]
        clone_id = evidence_by_role["copy_move"]["id"]
        png_id = evidence_by_role["lossless_png"]["id"]

        confirmed_pairs = {
            frozenset({master_id, banner_id}): (master_id, "Confirmed synthetic crop/resize derivation (Q=95 -> Q=82)."),
            frozenset({banner_id, social_id}): (banner_id, "Confirmed synthetic recompression derivation (Q=82 -> Q=62)."),
            frozenset({master_id, splice_id}): (master_id, "Confirmed synthetic composite splice derived from reference master."),
            frozenset({master_id, clone_id}): (master_id, "Confirmed synthetic copy-move clone derived from reference master."),
            frozenset({master_id, png_id}): (master_id, "Confirmed lossless PNG export from reference master."),
        }
        for rel in r_lin.json().get("relations", []):
            pair = frozenset({rel["evidence_a"]["id"], rel["evidence_b"]["id"]})
            if pair in confirmed_pairs:
                parent_id, note = confirmed_pairs[pair]
                r_rev = client.patch(
                    f"/api/cases/{DEMO_CASE_IDENTIFIER}/lineage/{rel['id']}",
                    json={"review_status": "CONFIRMED_RELATION", "parent_evidence_id": parent_id, "review_note": note},
                    headers=headers,
                )
                assert r_rev.status_code == 200, r_rev.text

        # 6. Cross-Image Correlation
        r_cross = client.post(f"/api/cases/{DEMO_CASE_IDENTIFIER}/cross-correlation/evaluate", headers=headers)
        assert r_cross.status_code == 200, r_cross.text

        # 7. Create traced Findings from actual persisted observations & analyses
        def _create_and_review_finding(
            ev_id: int,
            title: str,
            severity: str,
            summary: str,
            interpretation: str,
            limitations: str,
            review_status: str,
            review_note: str,
        ) -> None:
            obs_rows = db.query(EvidenceObservation).filter(EvidenceObservation.evidence_id == ev_id).all()
            anl_rows = db.query(Analysis).filter(Analysis.evidence_id == ev_id, Analysis.status == "completed").all()
            obs_ids = [o.id for o in obs_rows[:4]]
            anl_ids = [a.id for a in anl_rows[:4]]
            fnd = Finding(
                case_id=DEMO_CASE_IDENTIFIER,
                evidence_id=ev_id,
                finding_type="CORRELATED_OBSERVATION",
                severity_label=severity,
                title=title,
                summary=summary,
                supporting_observations=obs_ids,
                supporting_analysis_ids=anl_ids,
                correlation_rule_id="DEMO-CORR-01",
                correlation_rule_version="1.0",
                interpretation=interpretation,
                limitations=limitations,
                status="GENERATED",
            )
            db.add(fnd)
            db.commit()
            db.refresh(fnd)
            AuditService.log_event(
                db,
                DEMO_CASE_IDENTIFIER,
                "FINDING_GENERATED",
                evidence_id=ev_id,
                actor=demo_user.username,
                metadata={"finding_id": fnd.finding_identifier, "title": title},
            )
            FindingService.review_finding(
                db=db,
                finding=fnd,
                new_status=review_status,
                reviewer_user=demo_user,
                review_note=review_note,
                decision=review_status,
            )

        _create_and_review_finding(
            ev_id=splice_id,
            title="Localized Error-Level & Compression Discontinuity",
            severity="HIGH",
            summary="ELA and JPEG compression analyses indicate a localized residual discontinuity in the lower-right quadrant relative to the surrounding frame.",
            interpretation="Consistent with insertion of differently compressed content (Q=55 patch in Q=92/95 frame); warrants comparison against reference master and ground-truth mask.",
            limitations="ELA residuals reflect recompression differences and cannot alone establish intent or origin.",
            review_status="CONFIRMED_BY_ANALYST",
            review_note="Confirmed synthetic splice region aligns with documented reference difference.",
        )

        _create_and_review_finding(
            ev_id=clone_id,
            title="Duplicated Keypoint Cluster Consistent with Copy-Move",
            severity="HIGH",
            summary="Copy-move and clone-keypoint detectors identified matching local descriptor clusters between upper-left and lower-right regions.",
            interpretation="Indicates spatial duplication of textured emblem content within the same image; consistent with localized cloning.",
            limitations="Repetitive architectural or graphic patterns can produce benign keypoint matches; geometric verification is required.",
            review_status="CONFIRMED_BY_ANALYST",
            review_note="Verified duplicated emblem geometry matches upper-left source region.",
        )

        _create_and_review_finding(
            ev_id=social_id,
            title="Multi-Generation JPEG Recompression Signature",
            severity="OBSERVATION",
            summary="Metadata is absent and JPEG DCT/ELA metrics reflect lower quality encoding (Q=62) relative to the web banner source.",
            interpretation="Consistent with routine social-platform re-encoding rather than localized semantic tampering; no localized splice anomaly detected.",
            limitations="Social platforms routinely strip EXIF and recompress uploads; double-JPEG signatures are not evidence of malicious editing.",
            review_status="INCONCLUSIVE",
            review_note="Benign recompression expected for social media redistribution; retained as contextual finding.",
        )

        # 8. Structured 3-part Analyst Notes
        notes_payloads = [
            {
                "target_type": "CASE",
                "target_id": DEMO_CASE_IDENTIFIER,
                "content": (
                    "WHAT WAS FOUND:\n"
                    "Lineage and cross-correlation link five campaign variants to campaign_studio_master.jpg, while campaign_unrelated_office.jpg shows distinct camera metadata (Nikon-Sim Z6-Demo) and no shared keypoints.\n\n"
                    "WHY DOES IT MATTER:\n"
                    "Separates benign multi-channel redistribution (web banner, social reupload, press PNG) from localized structural anomalies in campaign_composite_splice.jpg and campaign_cloned_poster.jpg.\n\n"
                    "WHAT SHOULD THE INVESTIGATOR DO NEXT:\n"
                    "Review confirmed findings in Analyst Review and inspect the generated investigation report."
                ),
            },
            {
                "target_type": "EVIDENCE",
                "target_id": str(splice_id),
                "content": (
                    "WHAT WAS FOUND:\n"
                    "Elevated localized ELA residual in the lower-right region compared to campaign_studio_master.jpg.\n\n"
                    "WHY DOES IT MATTER:\n"
                    "Consistent with localized post-capture insertion from a differently compressed source.\n\n"
                    "WHAT SHOULD THE INVESTIGATOR DO NEXT:\n"
                    "Compare side-by-side with campaign_studio_master.jpg in Evidence Comparison."
                ),
            },
        ]
        for npayload in notes_payloads:
            r_note = client.post(f"/api/cases/{DEMO_CASE_IDENTIFIER}/notes", json=npayload, headers=headers)
            assert r_note.status_code == 200, r_note.text

        # 9. Transition case status to IN_REVIEW
        case.status = "IN_REVIEW"
        db.commit()
        AuditService.log_event(
            db,
            DEMO_CASE_IDENTIFIER,
            "CASE_STATUS_UPDATED",
            actor=demo_user.username,
            metadata={"new_status": "IN_REVIEW", "synthetic_demo": True},
        )

        # 10. Generate final report using real ReportService (JSON + PDF attempt)
        r_rep_json = client.post(f"/api/cases/{DEMO_CASE_IDENTIFIER}/reports?format=json", headers=headers)
        assert r_rep_json.status_code == 200, r_rep_json.text
        if REPORTLAB_AVAILABLE:
            r_rep_pdf = client.post(f"/api/cases/{DEMO_CASE_IDENTIFIER}/reports?format=pdf", headers=headers)
            assert r_rep_pdf.status_code == 200, r_rep_pdf.text

        return {
            "status": "seeded",
            "case_identifier": DEMO_CASE_IDENTIFIER,
            "username": DEMO_USERNAME,
            "evidence_count": len(evidence_by_role),
            "report_identifier": r_rep_json.json().get("report_identifier"),
            "reportlab_available": REPORTLAB_AVAILABLE,
        }
    finally:
        if prev_override is not None:
            app.dependency_overrides[get_db] = prev_override
        else:
            app.dependency_overrides.pop(get_db, None)
