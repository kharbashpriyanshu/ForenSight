import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.schemas.domain import AnalysisResponse
from app.forensics.metadata.analyzer import MetadataAnalyzer
from app.forensics.ela.analyzer import ELAAnalyzer
from app.forensics.noise.analyzer import NoiseAnalyzer
from app.forensics.jpeg_dct.analyzer import JPEGDCTAnalyzer
from app.forensics.copy_move.analyzer import CopyMoveAnalyzer
from app.models.domain import Analysis
from app.core.config import settings

router = APIRouter()

@router.post("/evidence/{evidence_id}/analysis/metadata", response_model=AnalysisResponse)
def trigger_metadata_analysis(evidence_id: int, db: Session = Depends(get_db)):
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
def read_analysis(analysis_id: int, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis

@router.post("/evidence/{evidence_id}/analysis/ela", response_model=AnalysisResponse)
def trigger_ela_analysis(evidence_id: int, db: Session = Depends(get_db)):
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
def trigger_noise_analysis(evidence_id: int, db: Session = Depends(get_db)):
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
def trigger_jpeg_dct_analysis(evidence_id: int, db: Session = Depends(get_db)):
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
def trigger_copy_move_analysis(evidence_id: int, db: Session = Depends(get_db)):
    try:
        analysis = CopyMoveAnalyzer.run_analysis(db, evidence_id)
        return analysis
    except ValueError as e:
        if "not found" in str(e).lower() or "missing" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal Copy-Move Analysis failure")

@router.get("/artifacts/{artifact_path:path}")
def get_artifact(artifact_path: str):
    import pathlib
    import os
    
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
        
    return FileResponse(str(target_path))

@router.get("/analysis/{analysis_id}", response_model=AnalysisResponse)
def get_analysis_result(analysis_id: int, db: Session = Depends(get_db)):
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis
