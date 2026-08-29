from sqlalchemy.orm import Session
from typing import List
from app.models.domain import Analysis, EvidenceObservation
from .adapters import ADAPTERS
from .schemas import EvidenceSet, EvidenceObservationResponse

class EvidenceNormalizer:
    NORMALIZATION_VERSION = "1.0"

    @staticmethod
    def normalize_evidence(db: Session, evidence_id: int) -> EvidenceSet:
        # Fetch all completed analyses for this evidence
        analyses = db.query(Analysis).filter(
            Analysis.evidence_id == evidence_id,
            Analysis.status == "completed"
        ).all()

        # Idempotency: Remove existing observations for this normalization run
        db.query(EvidenceObservation).filter(EvidenceObservation.evidence_id == evidence_id).delete()
        
        all_modalities = set(["METADATA", "ELA", "NOISE", "JPEG_DCT", "COPY_MOVE"])
        present_modalities = set()
        
        new_observations = []
        
        for analysis in analyses:
            adapter_class = ADAPTERS.get(analysis.analysis_type)
            if adapter_class:
                present_modalities.add(analysis.analysis_type)
                try:
                    obs_dicts = adapter_class.extract_observations(analysis)
                    for obs_dict in obs_dicts:
                        db_obs = EvidenceObservation(**obs_dict)
                        new_observations.append(db_obs)
                except Exception as e:
                    # If extraction fails, log it but don't crash the fusion process
                    pass
        
        if new_observations:
            db.add_all(new_observations)
            db.commit()
            
            # Refresh to get IDs
            for obs in new_observations:
                db.refresh(obs)
                
        missing_modalities = list(all_modalities - present_modalities)
        
        # Convert to response schemas
        resp_obs = [
            EvidenceObservationResponse.model_validate(obs) if hasattr(EvidenceObservationResponse, 'model_validate') 
            else EvidenceObservationResponse.from_orm(obs)
            for obs in new_observations
        ]
        
        return EvidenceSet(
            evidence_id=evidence_id,
            normalization_version=EvidenceNormalizer.NORMALIZATION_VERSION,
            modalities_present=list(present_modalities),
            modalities_missing=missing_modalities,
            observations=resp_obs
        )
