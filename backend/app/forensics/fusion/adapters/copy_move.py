from typing import List, Dict, Any
from .base import BaseAdapter

class CopyMoveAdapter(BaseAdapter):
    @staticmethod
    def extract_observations(analysis) -> List[Dict[str, Any]]:
        findings = analysis.structured_findings
        if not findings:
            return []
            
        stats = findings.get("matching_statistics", {})
        geometric_inliers = stats.get("geometric_inliers", 0)
        filtered_matches = stats.get("spatially_filtered_matches", 0)
        
        raw_val = str(geometric_inliers)
        
        inlier_ratio = stats.get("inlier_ratio")
        if inlier_ratio is None and filtered_matches > 0:
            inlier_ratio = geometric_inliers / filtered_matches
        elif inlier_ratio is None:
            inlier_ratio = 0.0
            
        direction = "candidate" if geometric_inliers >= 4 else "absent"
        reliability = "HIGH" if (filtered_matches >= 4 or geometric_inliers >= 4) else "NOT_ASSESSABLE"
        
        interpretation = "Geometric correspondence strength within candidate matches."
        if geometric_inliers == 0:
            interpretation = "No geometrically consistent candidate correspondence identified."

        limitations = "Repeated natural structures, textures, and architectural patterns can produce geometric matches natively."
            
        obs = {
            "evidence_id": analysis.evidence_id,
            "analysis_id": analysis.id,
            "modality": "COPY_MOVE",
            "observation_type": "GEOMETRIC_CORRESPONDENCE",
            "metric_name": "geometric_inliers",
            "raw_value": raw_val,
            "normalized_value": inlier_ratio,
            "direction": direction,
            "technical_reliability": reliability,
            "interpretation": interpretation,
            "limitations": limitations
        }
        
        return [obs]
