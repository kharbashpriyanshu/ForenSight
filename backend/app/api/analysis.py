import os
import pathlib
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.schemas.domain import AnalysisResponse
from app.forensics.metadata.analyzer import MetadataAnalyzer
from app.forensics.ela.analyzer import ELAAnalyzer
from app.forensics.noise.analyzer import NoiseAnalyzer
from app.forensics.jpeg_dct.analyzer import JPEGDCTAnalyzer
from app.forensics.copy_move.analyzer import CopyMoveAnalyzer
from app.models.domain import Analysis, User, Evidence, InvestigationCase
from app.api.deps import get_current_user, verify_evidence_access, verify_analysis_access
from app.core.config import settings

router = APIRouter()

@router.post("/evidence/{evidence_id}/analysis/metadata", response_model=AnalysisResponse)
def trigger_metadata_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        analysis = MetadataAnalyzer.run_analysis(db, evidence_id)
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal analysis failure")

@router.get("/analysis/{analysis_id}", response_model=AnalysisResponse)
def read_analysis(
    analysis_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    analysis = verify_analysis_access(db, analysis_id, current_user)
    return analysis

@router.post("/evidence/{evidence_id}/analysis/ela", response_model=AnalysisResponse)
def trigger_ela_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        analysis = ELAAnalyzer.run_analysis(db, evidence_id)
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal ELA failure")

@router.post("/evidence/{evidence_id}/analysis/noise", response_model=AnalysisResponse)
def trigger_noise_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        analysis = NoiseAnalyzer.run_analysis(db, evidence_id)
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal Noise Analysis failure")

@router.post("/evidence/{evidence_id}/analysis/jpeg-dct", response_model=AnalysisResponse)
def trigger_jpeg_dct_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        analysis = JPEGDCTAnalyzer.run_analysis(db, evidence_id)
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal JPEG/DCT Analysis failure")

@router.post("/evidence/{evidence_id}/analysis/copy-move", response_model=AnalysisResponse)
def trigger_copy_move_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        analysis = CopyMoveAnalyzer.run_analysis(db, evidence_id)
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal Copy-Move Analysis failure")

@router.post("/evidence/{evidence_id}/analysis/jpeg-structure", response_model=AnalysisResponse)
def trigger_jpeg_structure_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "JPEG-STRUCTURE")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal JPEG Structure failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/jpeg-qt", response_model=AnalysisResponse)
def trigger_jpeg_qt_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "JPEG-QT")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal JPEG Quantization failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/jpeg-huffman", response_model=AnalysisResponse)
def trigger_jpeg_huffman_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "JPEG-HUFFMAN")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal JPEG Huffman failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/jpeg-ghost", response_model=AnalysisResponse)
def trigger_jpeg_ghost_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "JPEG-GHOST")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal JPEG Ghost failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/adjpeg", response_model=AnalysisResponse)
def trigger_adjpeg_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "ADJPEG")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal ADJPEG failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/nadjpeg", response_model=AnalysisResponse)
def trigger_nadjpeg_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "NADJPEG")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal NADJPEG failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/blocking-artifact", response_model=AnalysisResponse)
def trigger_blocking_artifact_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "BLOCKING-ARTIFACT")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Blocking Artifact failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/histogram", response_model=AnalysisResponse)
def trigger_histogram_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "HISTOGRAM")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Histogram failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/color-channel", response_model=AnalysisResponse)
def trigger_color_channel_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "COLOR-CHANNEL")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Color Channel failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/fourier", response_model=AnalysisResponse)
def trigger_fourier_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "FOURIER")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Fourier failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/advanced-noise", response_model=AnalysisResponse)
def trigger_advanced_noise_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "ADVANCED-NOISE")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Advanced Noise failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/resampling", response_model=AnalysisResponse)
def trigger_resampling_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "RESAMPLING")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Resampling failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/clone-block", response_model=AnalysisResponse)
def trigger_clone_block_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "CLONE-BLOCK")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Clone-Block failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/clone-keypoint", response_model=AnalysisResponse)
def trigger_clone_keypoint_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        analysis = V4EngineRunner.run_engine(db, evidence_id, "CLONE-KEYPOINT")
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Clone-Keypoint failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/prnu", response_model=AnalysisResponse)
def trigger_prnu_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
        params = {"case_id": str(evidence.case_id)} if evidence else {}
        analysis = V4EngineRunner.run_engine(db, evidence_id, "PRNU", parameters=params)
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal PRNU failure: {str(e)}")

@router.post("/evidence/{evidence_id}/analysis/camera-id", response_model=AnalysisResponse)
def trigger_camera_id_analysis(
    evidence_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    verify_evidence_access(db, evidence_id, current_user)
    try:
        from app.engine_extensions.runner import V4EngineRunner
        evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
        params = {"case_id": str(evidence.case_id)} if evidence else {}
        analysis = V4EngineRunner.run_engine(db, evidence_id, "CAMERA-ID", parameters=params)
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Camera-ID failure: {str(e)}")

@router.get("/cases/{case_id}/camera-references")
def list_case_camera_references(
    case_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = db.query(InvestigationCase).filter(
        (InvestigationCase.case_identifier == case_id) | (InvestigationCase.id == int(case_id)) if case_id.isdigit() else (InvestigationCase.case_identifier == case_id)
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    from app.engine_extensions.camera import CameraReferenceLibrary
    refs = CameraReferenceLibrary.list_references(case.id)
    return [r.model_dump() for r in refs]

@router.post("/cases/{case_id}/camera-references")
async def create_case_camera_reference(
    case_id: str,
    file: UploadFile = File(...),
    camera_label: str = Form(...),
    make_model: Optional[str] = Form(None),
    serial_number: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = db.query(InvestigationCase).filter(
        (InvestigationCase.case_identifier == case_id) | (InvestigationCase.id == int(case_id)) if case_id.isdigit() else (InvestigationCase.case_identifier == case_id)
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded reference file is empty")

    filename = file.filename or "reference"
    from app.engine_extensions.camera import CameraReferenceLibrary
    import numpy as np
    import cv2
    from io import BytesIO

    if filename.endswith(".npy"):
        try:
            arr = np.load(BytesIO(file_bytes))
            if arr.ndim != 2:
                raise HTTPException(status_code=400, detail="NumPy reference array must be 2-dimensional")
            fingerprint = arr.astype(np.float32)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid .npy array: {str(e)}")
    else:
        # Decode as image
        try:
            nparr = np.frombuffer(file_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
            if img is None:
                raise HTTPException(status_code=400, detail="Invalid image file for camera reference")
            from app.engine_extensions.prnu.prnu_extractor import extract_noise_residual, zero_mean_normalize
            res = extract_noise_residual(img.astype(np.float32))
            fingerprint = zero_mean_normalize(res)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to extract PRNU from reference image: {str(e)}")

    ref_meta = CameraReferenceLibrary.save_reference(
        case_id=case.id,
        camera_label=camera_label,
        fingerprint=fingerprint,
        make_model=make_model,
        serial_number=serial_number,
        notes=notes,
    )
    return ref_meta.model_dump()

@router.delete("/cases/{case_id}/camera-references/{reference_id}")
def delete_case_camera_reference(
    case_id: str,
    reference_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    case = db.query(InvestigationCase).filter(
        (InvestigationCase.case_identifier == case_id) | (InvestigationCase.id == int(case_id)) if case_id.isdigit() else (InvestigationCase.case_identifier == case_id)
    ).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    if current_user.role != "ADMIN" and case.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this case")

    from app.engine_extensions.camera import CameraReferenceLibrary
    success = CameraReferenceLibrary.delete_reference(case.id, reference_id)
    if not success:
        raise HTTPException(status_code=404, detail="Camera reference not found")
    return {"message": "Camera reference deleted successfully", "reference_id": reference_id}

@router.get("/artifacts/{artifact_path:path}")
def get_artifact(
    artifact_path: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Prevent encoded traversal or null bytes
    if "\0" in artifact_path or ".." in artifact_path:
        raise HTTPException(status_code=403, detail="Invalid artifact path")
    
    # Explicitly reject absolute paths and Windows drives
    if os.path.isabs(artifact_path) or artifact_path.startswith("/") or artifact_path.startswith("\\"):
        raise HTTPException(status_code=403, detail="Invalid artifact path")
        
    try:
        base_dir = pathlib.Path(settings.STORAGE_DIR).resolve()
        target_path = (base_dir / artifact_path).resolve()
    except Exception:
        raise HTTPException(status_code=403, detail="Invalid artifact path")
        
    try:
        target_path.relative_to(base_dir)
    except ValueError:
        raise HTTPException(status_code=403, detail="Invalid artifact path")
        
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="Artifact not found")

    # Authorize access: ADMIN has global access; INVESTIGATOR must own the associated case
    if current_user.role != "ADMIN":
        norm_path = artifact_path.replace("\\", "/").strip("/")
        base_filename = os.path.basename(norm_path)
        
        # Check if artifact matches any evidence owned by current_user
        user_evidence = (
            db.query(Evidence)
            .join(InvestigationCase, Evidence.case_id == InvestigationCase.id)
            .filter(
                InvestigationCase.user_id == current_user.id,
                (Evidence.stored_path.endswith(norm_path) | Evidence.stored_path.endswith(base_filename))
            )
            .first()
        )
        
        authorized = user_evidence is not None
        
        if not authorized:
            # Check if artifact is referenced in analysis structured_findings for user's cases
            user_analyses = (
                db.query(Analysis)
                .join(Evidence, Analysis.evidence_id == Evidence.id)
                .join(InvestigationCase, Evidence.case_id == InvestigationCase.id)
                .filter(InvestigationCase.user_id == current_user.id)
                .all()
            )
            for an in user_analyses:
                if an.structured_findings and (norm_path in str(an.structured_findings) or base_filename in str(an.structured_findings)):
                    authorized = True
                    break

        if not authorized and norm_path.startswith("cases/"):
            parts = norm_path.split("/")
            if len(parts) >= 2:
                c_part = parts[1]
                user_case = (
                    db.query(InvestigationCase)
                    .filter(
                        InvestigationCase.user_id == current_user.id,
                        (InvestigationCase.id == int(c_part) if c_part.isdigit() else InvestigationCase.case_identifier == c_part)
                    )
                    .first()
                )
                if user_case:
                    authorized = True
        
        if not authorized:
            raise HTTPException(status_code=403, detail="Not authorized to access this artifact")

    # Detect appropriate media_type
    ext = target_path.suffix.lower()
    if ext in (".jpg", ".jpeg"):
        media_type = "image/jpeg"
    elif ext == ".png":
        media_type = "image/png"
    elif ext == ".webp":
        media_type = "image/webp"
    elif ext == ".json":
        media_type = "application/json"
    else:
        media_type = "application/octet-stream"

    return FileResponse(str(target_path), media_type=media_type)


