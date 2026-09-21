"""
ForenSight V4 — Standard Engine Execution Status & Scientific Guardrails

Defines standardized execution states for forensic engines.
Enforces the non-negotiable scientific rule:
    NOT_APPLICABLE != NEGATIVE_EVIDENCE
"""

from enum import Enum
from typing import Dict, Any


class EngineExecutionStatus(str, Enum):
    """
    Standardized execution outcomes for forensic engine executions.
    """
    # Engine evaluated input and successfully computed empirical observations
    APPLIED = "APPLIED"
    
    # Engine completed execution successfully (alias / parity with APPLIED)
    COMPLETED = "COMPLETED"
    
    # Engine could not be applied due to mathematical/container inapplicability (e.g. DCT on PNG)
    # CRITICAL: Inapplicability is NOT negative evidence; it does not prove authenticity.
    NOT_APPLICABLE = "NOT_APPLICABLE"
    
    # Execution failed due to system error, corrupted input, or resource bounds
    FAILED = "FAILED"

    # Execution queued or currently in progress
    PENDING = "PENDING"
    RUNNING = "RUNNING"

    @classmethod
    def is_terminal(cls, status: "EngineExecutionStatus") -> bool:
        return status in (cls.APPLIED, cls.COMPLETED, cls.NOT_APPLICABLE, cls.FAILED)

    @classmethod
    def to_legacy_analysis_status(cls, status: "EngineExecutionStatus") -> str:
        """
        Maps standard V4 status to V2/V3 Analysis table status strings.
        """
        mapping = {
            cls.APPLIED: "completed",
            cls.COMPLETED: "completed",
            cls.NOT_APPLICABLE: "completed",  # Completed with inapplicability findings
            cls.FAILED: "failed",
            cls.PENDING: "pending",
            cls.RUNNING: "running",
        }
        return mapping.get(status, "completed")


class ScientificInapplicabilityExplanation:
    """
    Standardized explanation structure when an engine is NOT_APPLICABLE.
    Guarantees that method inapplicability cannot be misrepresented as negative evidence.
    """
    
    @staticmethod
    def create_payload(
        engine_id: str,
        reason: str,
        container_format: str,
        required_format: str,
    ) -> Dict[str, Any]:
        return {
            "status": EngineExecutionStatus.NOT_APPLICABLE.value,
            "engine_id": engine_id,
            "scientific_guardrail": (
                "CRITICAL FORENSIC NOTICE: Method inapplicability is NOT negative evidence. "
                "The target image container or structure does not meet the mathematical requirements "
                "of this forensic filter. The absence of findings under this method MUST NOT be cited "
                "as evidence of image authenticity or absence of manipulation."
            ),
            "inapplicability_reason": reason,
            "target_format": container_format,
            "required_format": required_format,
            "is_negative_evidence": False,
            "authenticity_proved": False,
        }
