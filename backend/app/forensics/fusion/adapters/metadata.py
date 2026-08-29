from typing import List, Dict, Any
from .base import BaseAdapter

class MetadataAdapter(BaseAdapter):
    @staticmethod
    def extract_observations(analysis) -> List[Dict[str, Any]]:
        findings = analysis.structured_findings
        if not findings:
            return []
            
        metadata = findings.get("metadata", {})
        software = metadata.get("Software")
        
        observations = []
        if software:
            obs = {
                "evidence_id": analysis.evidence_id,
                "analysis_id": analysis.id,
                "modality": "METADATA",
                "observation_type": "SOFTWARE_SIGNATURE",
                "metric_name": "software",
                "raw_value": str(software),
                "normalized_value": None, # Categorical, no normalization
                "direction": "present",
                "technical_reliability": "HIGH",
                "interpretation": "Editing software or processing engine metadata present.",
                "limitations": "Metadata can be easily stripped or forged. Indicates software touched the file, not necessarily malicious manipulation."
            }
            observations.append(obs)
        else:
            obs = {
                "evidence_id": analysis.evidence_id,
                "analysis_id": analysis.id,
                "modality": "METADATA",
                "observation_type": "SOFTWARE_SIGNATURE",
                "metric_name": "software",
                "raw_value": "missing",
                "normalized_value": None,
                "direction": "absent",
                "technical_reliability": "HIGH",
                "interpretation": "No software metadata present.",
                "limitations": "Missing metadata is common (e.g. stripped by social media)."
            }
            observations.append(obs)
            
        return observations
