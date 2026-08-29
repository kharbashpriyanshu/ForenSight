from typing import List, Dict, Any
from .base import BaseAdapter

class NoiseAdapter(BaseAdapter):
    @staticmethod
    def extract_observations(analysis) -> List[Dict[str, Any]]:
        findings = analysis.structured_findings
        if not findings:
            return []
            
        stats = findings.get("global_statistics", {})
        mean_residual = stats.get("mean_residual", 0.0)
        
        raw_val = f"{mean_residual:.4f}"
        
        direction = "elevated" if mean_residual > 5.0 else "informational"
        reliability = "MEDIUM"
        
        obs = {
            "evidence_id": analysis.evidence_id,
            "analysis_id": analysis.id,
            "modality": "NOISE",
            "observation_type": "RESIDUAL_MAGNITUDE",
            "metric_name": "mean_residual",
            "raw_value": raw_val,
            "normalized_value": None,
            "direction": direction,
            "technical_reliability": reliability,
            "interpretation": "Average noise residual magnitude.",
            "limitations": "Affected by natural edges, texture, hardware noise, and filtering history."
        }
        
        return [obs]
