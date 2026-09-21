"""
ForenSight V4 — Scientific References Contract

Provides a structured model for documenting academic literature, industry standards,
and technical specifications underpinning forensic engines.
Prohibits fake citations: unverified future engines must leave references empty/null.
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ReferenceType(str, Enum):
    PAPER = "PAPER"
    BOOK = "BOOK"
    STANDARD = "STANDARD"
    TECH_DOC = "TECH_DOC"
    VALIDATION_REPORT = "VALIDATION_REPORT"


class ScientificReference(BaseModel):
    """
    Empirical or peer-reviewed reference validating an analytical method.
    """
    title: str = Field(..., description="Full title of the paper, standard, or book.")
    authors: Optional[str] = Field(None, description="Primary authors or issuing organization.")
    publication_venue: Optional[str] = Field(None, description="Journal, conference, or publishing body.")
    year: Optional[int] = Field(None, description="Year of publication.")
    doi_or_url: Optional[str] = Field(None, description="Direct DOI link or official standard URL.")
    reference_type: ReferenceType = Field(ReferenceType.PAPER, description="Category of citation.")
    notes: Optional[str] = Field(None, description="Relevance to algorithmic implementation.")
