import os
import hashlib
import json
import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.domain import InvestigationCase, Evidence, AuditEvent
from app.services.audit import AuditService
from app.schemas.v3 import (
    ChainOfCustodyResponse,
    CustodyVerificationResult,
    CustodyTimelineEvent,
)

class CustodyService:
    @classmethod
    def verify_evidence_integrity(
        cls,
        db: Session,
        evidence: Evidence,
        verifier: str = "System"
    ) -> CustodyVerificationResult:
        now = datetime.datetime.now(datetime.timezone.utc)
        stored_path = evidence.stored_path or ""
        file_exists = os.path.exists(stored_path)

        actual_hash = ""
        intact = False
        status = "FILE_MISSING"
        message = f"Physical evidence file missing at stored path: {stored_path}"

        if file_exists:
            sha256 = hashlib.sha256()
            try:
                with open(stored_path, "rb") as f:
                    while chunk := f.read(8192):
                        sha256.update(chunk)
                actual_hash = sha256.hexdigest()
                intact = (actual_hash.lower() == (evidence.sha256_hash or "").lower())

                if intact:
                    status = "VERIFIED_INTACT"
                    message = "Cryptographic SHA-256 verification succeeded. File byte stream is bit-for-bit identical to ingest state."
                else:
                    status = "TAMPER_OR_BITROT_DETECTED"
                    message = f"CRITICAL INTEGRITY FAILURE: Physical disk hash ({actual_hash}) does not match recorded ingest hash ({evidence.sha256_hash})."
            except Exception as e:
                status = "READ_ERROR"
                message = f"Failed to read evidence storage file: {str(e)}"

        # Log audit event
        case = evidence.case
        case_id_str = case.case_identifier if case else str(evidence.case_id)
        AuditService.log_event(
            db=db,
            case_id=case_id_str,
            event_type="CUSTODY_VERIFIED",
            evidence_id=evidence.id,
            actor=verifier,
            metadata={
                "status": status,
                "intact": intact,
                "ingest_hash": evidence.sha256_hash,
                "verified_hash": actual_hash,
            }
        )

        return CustodyVerificationResult(
            evidence_id=evidence.id,
            evidence_identifier=evidence.evidence_identifier,
            filename=evidence.original_filename,
            stored_path=stored_path,
            ingest_sha256_hash=evidence.sha256_hash,
            current_disk_sha256_hash=actual_hash,
            integrity_intact=intact,
            verified_at=now,
            verifier=verifier,
            status=status,
            message=message
        )

    @classmethod
    def get_chain_of_custody(cls, db: Session, case: InvestigationCase) -> ChainOfCustodyResponse:
        evidence_items = db.query(Evidence).filter(Evidence.case_id == case.id).all()
        ev_map = {e.id: e for e in evidence_items}

        summaries: List[CustodyVerificationResult] = []
        all_intact = True

        for ev in evidence_items:
            result = cls.verify_evidence_integrity(db, ev, verifier="ChainOfCustodyAudit")
            if not result.integrity_intact:
                all_intact = False
            summaries.append(result)

        # Audit timeline for case
        events = (
            db.query(AuditEvent)
            .filter(
                (AuditEvent.case_id == case.case_identifier) |
                (AuditEvent.case_id == str(case.id))
            )
            .order_by(AuditEvent.timestamp.asc())
            .all()
        )

        timeline: List[CustodyTimelineEvent] = []
        for ev in events:
            details_dict = {}
            if ev.safe_metadata:
                try:
                    details_dict = json.loads(ev.safe_metadata) if isinstance(ev.safe_metadata, str) else ev.safe_metadata
                except Exception:
                    details_dict = {"raw": str(ev.safe_metadata)}

            ev_record = ev_map.get(ev.evidence_id) if ev.evidence_id else None
            filename = ev_record.original_filename if ev_record else details_dict.get("filename")

            timeline.append(CustodyTimelineEvent(
                id=ev.id,
                timestamp=ev.timestamp,
                event_type=ev.event_type,
                actor=ev.actor or "System",
                evidence_id=ev.evidence_id,
                evidence_filename=filename,
                details=details_dict
            ))

        return ChainOfCustodyResponse(
            case_identifier=case.case_identifier,
            case_created_at=case.created_at,
            total_evidence_items=len(evidence_items),
            all_hashes_intact=all_intact,
            evidence_summaries=summaries,
            custody_timeline=timeline
        )
