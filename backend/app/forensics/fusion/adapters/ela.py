from typing import List, Dict, Any
from .base import BaseAdapter

class ELAAdapter(BaseAdapter):
    @staticmethod
    def extract_observations(analysis) -> List[Dict[str, Any]]:
        findings = analysis.structured_findings
        if not findings:
            return []
            
        stats = findings.get("statistics", {})
        mean_error = stats.get("mean", 0.0)
        
        raw_val = f"{mean_error:.4f}"
        
        # We do not have a robust mathematically defensible normalization for ELA that maps to 0..1 globally,
        # so we leave normalized_value as None, strictly adhering to Sprint 7A rules.
        
        direction = "elevated" if mean_error > 5.0 else "informational" # Contextual threshold, not a fake score
        reliability = "MEDIUM" # ELA depends heavily on prior compression
        
        obs = {
            "evidence_id": analysis.evidence_id,
            "analysis_id": analysis.id,
            "modality": "ELA",
            "observation_type": "COMPRESSION_ERROR",
            "metric_name": "mean_absolute_error",
            "raw_value": raw_val,
            "normalized_value": None,
            "direction": direction,
            "technical_reliability": reliability,
            "interpretation": "Average recompression error magnitude.",
            "limitations": "Highly dependent on image edges, texture, JPEG quality, and prior compression history."
        }
        
        return [obs]
