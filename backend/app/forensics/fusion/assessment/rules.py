from typing import List, Dict, Set
from app.models.domain import EvidenceObservation, EvidenceRelation

def determine_evidence_families(observations: List[EvidenceObservation]) -> Set[str]:
    families = set()
    for obs in observations:
        if obs.modality in ["ELA", "JPEG_DCT"]:
            families.add("Compression")
        elif obs.modality == "NOISE":
            families.add("Residual")
        elif obs.modality == "COPY_MOVE":
            families.add("Spatial Correspondence")
        elif obs.modality == "METADATA":
            families.add("File Context")
    return families

def determine_assessment(families: Set[str], observations: List[EvidenceObservation], relations: List[EvidenceRelation]) -> Dict:
    # Rule Version
    rule_version = "7B-v1"
    
    if not observations:
        return {
            "level": "INSUFFICIENT_EVIDENCE",
            "summary": "No forensic analyses have been run or completed.",
            "limitations": ["Requires execution of core analysis engines."],
            "rule_version": rule_version
        }
        
    # Count distinct families that have actual "active" indications, not just "absent" or "informational"
    active_families = set()
    for obs in observations:
        if obs.direction in ["elevated", "suppressed", "present", "candidate"]:
            if obs.modality in ["ELA", "JPEG_DCT"]:
                active_families.add("Compression")
            elif obs.modality == "NOISE":
                active_families.add("Residual")
            elif obs.modality == "COPY_MOVE":
                active_families.add("Spatial Correspondence")
            elif obs.modality == "METADATA":
                # Metadata is mostly contextual.
                active_families.add("File Context")
                
    num_active_families = len(active_families)
    
    level = "LOW_FORENSIC_CONCERN"
    summary = "Limited or isolated forensic observations. Follow-up may be unnecessary unless contextualized by investigative leads."
    
    if num_active_families == 0:
        if len(observations) > 0:
            level = "LOW_FORENSIC_CONCERN"
            summary = "Analyses completed but produced no elevated or anomalous findings."
        else:
            level = "INSUFFICIENT_EVIDENCE"
            summary = "Not enough data to form a qualitative assessment."
    elif num_active_families == 1:
        if "File Context" in active_families:
            level = "LOW_FORENSIC_CONCERN"
            summary = "Only file metadata provides contextual signatures (e.g., software editors). This is common and does not independently warrant concern."
        else:
            level = "MODERATE_FORENSIC_CONCERN"
            summary = f"Observations are isolated to a single evidence family ({list(active_families)[0]}). Contextual review is advised."
    elif num_active_families >= 2:
        # Check if it's just compression + metadata, which is very common (saving in photoshop)
        if active_families == {"Compression", "File Context"}:
            level = "MODERATE_FORENSIC_CONCERN"
            summary = "Compression artifacts and editing software signatures align, strongly indicating processing history, but not definitively establishing malicious tampering."
        else:
            level = "ELEVATED_FORENSIC_CONCERN"
            summary = "Multiple distinct analytical families present active observations. Additional forensic examination is warranted."
            
    limitations = [
        "Assessment levels represent the degree of forensic follow-up warranted by the available observations.",
        "They are not probabilities of manipulation and do not independently establish authenticity or tampering."
    ]
    
    return {
        "level": level,
        "summary": summary,
        "limitations": limitations,
        "rule_version": rule_version
    }
