import datetime
from sqlalchemy.orm import Session
from app.models.domain import Analysis, Evidence
from .schemas import ExtractedMetadata, MetadataFindings
from .extractor import MetadataExtractor

class MetadataAnalyzer:
    @staticmethod
    def run_analysis(db: Session, evidence_id: int) -> Analysis:
        evidence = db.query(Evidence).filter(Evidence.id == evidence_id).first()
        if not evidence:
            raise ValueError("Evidence not found")

        analysis = Analysis(
            evidence_id=evidence.id,
            analysis_type="METADATA",
            status="running"
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)

        try:
            raw_meta = MetadataExtractor.extract(evidence.stored_path)
            
            indicators = []
            
            if not raw_meta.exif:
                indicators.append("NO_EXIF_METADATA")
            else:
                indicators.append("EXIF_METADATA_PRESENT")
                
            software = raw_meta.exif.get("Software")
            if software:
                indicators.append("POST_PROCESSING_SOFTWARE_PRESENT")
                
            make = raw_meta.exif.get("Make")
            model = raw_meta.exif.get("Model")
            if make or model:
                indicators.append("CAMERA_METADATA_PRESENT")
                
            capture_time = raw_meta.exif.get("DateTimeOriginal") or raw_meta.exif.get("DateTime")
            if capture_time:
                indicators.append("CAPTURE_TIMESTAMP_PRESENT")
                
            has_gps = False
            if raw_meta.gps_info:
                indicators.append("GPS_METADATA_PRESENT")
                has_gps = True
                
            findings = MetadataFindings(
                indicators=indicators,
                software_detected=software,
                camera_make=make,
                camera_model=model,
                capture_time=capture_time,
                has_gps=has_gps
            )
            
            analysis.status = "completed"
            analysis.summary = "Metadata extraction and normalization completed successfully."
            
            analysis.structured_findings = {
                "findings": findings.model_dump(),
                "extracted_metadata": raw_meta.model_dump()
            }
            analysis.completed_at = datetime.datetime.utcnow()
            
            db.commit()
            db.refresh(analysis)
            return analysis
            
        except Exception as e:
            analysis.status = "failed"
            analysis.summary = f"Analysis failed: {str(e)}"
            analysis.completed_at = datetime.datetime.utcnow()
            db.commit()
            db.refresh(analysis)
            raise ValueError(f"Metadata extraction failed: {str(e)}")
