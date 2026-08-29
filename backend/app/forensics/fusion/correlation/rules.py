from typing import List, Dict
from app.models.domain import EvidenceObservation, EvidenceRelation

def evaluate_relations(observations: List[EvidenceObservation]) -> List[Dict]:
    relations = []
    
    # Map observations by modality for easy lookup
    obs_by_modality = {obs.modality: obs for obs in observations}
    
    # 1. ELA + JPEG/DCT = Contextual (Compression family)
    ela = obs_by_modality.get("ELA")
    dct = obs_by_modality.get("JPEG_DCT")
    
    if ela and dct:
        relations.append({
            "observation_a_id": ela.id,
            "observation_b_id": dct.id,
            "relation_type": "CONTEXTUAL",
            "strength": "MODERATE",
            "explanation": "Both ELA and JPEG/DCT observations reflect JPEG compression and processing history. They should be considered part of the same compression-history context rather than fully independent signs of manipulation.",
            "limitations": "Does not prove manipulation. Both are heavily influenced by the initial compression quality of the image."
        })
        
    # 2. Metadata (Software) + ELA/Noise/DCT = Contextual
    meta = obs_by_modality.get("METADATA")
    if meta and meta.observation_type == "SOFTWARE_SIGNATURE" and meta.direction == "present":
        # Correlate with ELA or Noise if they are elevated
        if ela and ela.direction == "elevated":
            relations.append({
                "observation_a_id": meta.id,
                "observation_b_id": ela.id,
                "relation_type": "CONTEXTUAL",
                "strength": "MODERATE",
                "explanation": "Editing software metadata is present alongside elevated recompression error. This provides processing-history context but does not independently establish malicious image manipulation.",
                "limitations": "Software metadata merely indicates the file was saved by an editor, which naturally causes recompression errors (ELA)."
            })
            
    # 3. Copy-Move + Anything = Independent Spatial correspondence
    cm = obs_by_modality.get("COPY_MOVE")
    if cm and cm.direction == "candidate":
        # Example of contrasting: If there's a strong spatial match but no software metadata
        if meta and meta.direction == "absent":
            relations.append({
                "observation_a_id": cm.id,
                "observation_b_id": meta.id,
                "relation_type": "INDEPENDENT",
                "strength": "MODERATE",
                "explanation": "Geometrically consistent feature correspondence was observed, but no editing software metadata is present.",
                "limitations": "Metadata can be stripped easily, and Copy-Move corresponds to structural patterns."
            })

    return relations
