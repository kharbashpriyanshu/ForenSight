"""
ForenSight V4 — Forensic Engine Registry API

Provides authenticated, read-only discovery endpoints for forensic engines and future planned manifests.
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from app.api.deps import get_current_user
from app.models.domain import User
from app.engine_extensions import (
    engine_registry,
    EngineCategory,
    PLANNED_FUTURE_ENGINES,
    get_planned_engine_manifest,
)

router = APIRouter(prefix="/engines", tags=["Forensic Engine Registry"])


@router.get("", response_model=List[Dict[str, Any]])
def list_registered_engines(
    category: Optional[str] = Query(None, description="Filter by EngineCategory (e.g. FILE_ANALYSIS, LOCAL_ANALYSIS)"),
    container_format: Optional[str] = Query(None, description="Filter by supported format (e.g. JPEG, PNG)"),
    current_user: User = Depends(get_current_user),
):
    """
    Returns a list of all active registered forensic engines.
    Requires authentication.
    """
    cat_enum = None
    if category:
        try:
            cat_enum = EngineCategory(category.upper())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid category '{category}'. Available: {[c.value for c in EngineCategory]}")

    engines = engine_registry.list_engines(category=cat_enum)
    if container_format:
        engines = [e for e in engines if container_format.upper() in [f.upper() for f in e.input_requirements.supported_formats] or "ALL" in e.input_requirements.supported_formats]

    return [e.get_metadata() for e in engines]


@router.get("/categories", response_model=List[Dict[str, str]])
def list_engine_categories(
    current_user: User = Depends(get_current_user),
):
    """
    Lists all standard engine categories and their investigative descriptions.
    """
    return [
        {"category": c.value, "description": EngineCategory.describe(c)}
        for c in EngineCategory
    ]


@router.get("/planned", response_model=List[Dict[str, Any]])
def list_planned_engines(
    current_user: User = Depends(get_current_user),
):
    """
    Returns the formal catalog of future forensic engines planned for V4+.
    All returned engines have status='PLANNED'.
    """
    return get_planned_engine_manifest()


@router.get("/{engine_id}", response_model=Dict[str, Any])
def get_engine_detail(
    engine_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Retrieves full contract metadata, input requirements, limitations, and scientific references
    for a specific registered forensic engine.
    """
    engine = engine_registry.get_engine(engine_id)
    if not engine:
        raise HTTPException(status_code=404, detail=f"Forensic engine '{engine_id}' not found in active registry.")
    return engine.get_metadata()
