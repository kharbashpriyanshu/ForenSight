from typing import List, Dict, Any
from .base import BaseAdapter

class JPEGDCTAdapter(BaseAdapter):
    @staticmethod
    def extract_observations(analysis) -> List[Dict[str, Any]]:
        findings = analysis.structured_findings
        if not findings:
            return []
            
        stats = findings.get("frequency_bands", {})
        high_freq = stats.get("high_freq_energy", 0.0)
        
        raw_val = f"{high_freq:.4f}"
        
        direction = "suppressed" if high_freq < 10.0 else "informational"
        reliability = "MEDIUM"
        
        obs = {
            "evidence_id": analysis.evidence_id,
            "analysis_id": analysis.id,
            "modality": "JPEG_DCT",
            "observation_type": "FREQUENCY_ENERGY",
            "metric_name": "high_freq_energy",
            "raw_value": raw_val,
            "normalized_value": None,
            "direction": direction,
            "technical_reliability": reliability,
            "interpretation": "High-frequency DCT coefficient energy.",
            "limitations": "Varies by camera, initial compression quality, and image detail."
        }
        
        return [obs]
