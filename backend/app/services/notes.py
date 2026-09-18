import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.domain import AnalystNote, InvestigationCase, User, AuditEvent
from app.services.audit import AuditService

class NoteService:
    @classmethod
    def get_case_notes(
        cls,
        db: Session,
        case: InvestigationCase,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
    ) -> List[AnalystNote]:
        query = db.query(AnalystNote).filter(
            (AnalystNote.case_id == case.case_identifier) | (AnalystNote.case_id == str(case.id))
        )
        if target_type:
            query = query.filter(AnalystNote.target_type == target_type.upper())
        if target_id:
            query = query.filter(AnalystNote.target_id == str(target_id))

        return query.order_by(AnalystNote.created_at.desc()).all()

    @classmethod
    def create_note(
        cls,
        db: Session,
        case: InvestigationCase,
        target_type: str,
        target_id: str,
        content: str,
        author_user: User,
    ) -> AnalystNote:
        if not content.strip():
            raise HTTPException(status_code=400, detail="Note content cannot be empty")

        now = datetime.datetime.utcnow()
        note = AnalystNote(
            case_id=case.case_identifier,
            author=author_user.username,
            target_type=target_type.upper(),
            target_id=str(target_id),
            content=content.strip(),
            created_at=now,
            updated_at=now,
        )
        db.add(note)
        db.commit()
        db.refresh(note)

        # Audit event
        AuditService.log_event(
            db=db,
            case_id=case.case_identifier,
            event_type="NOTE_CREATED",
            actor=author_user.username,
            metadata={
                "note_id": note.note_identifier,
                "target_type": note.target_type,
                "target_id": note.target_id,
            }
        )

        return note

    @classmethod
    def update_note(
        cls,
        db: Session,
        note_id: int,
        content: str,
        current_user: User,
    ) -> AnalystNote:
        note = db.query(AnalystNote).filter(AnalystNote.id == note_id).first()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        
        if current_user.role != "ADMIN" and note.author != current_user.username:
            raise HTTPException(status_code=403, detail="Not authorized to edit this note")

        if not content.strip():
            raise HTTPException(status_code=400, detail="Note content cannot be empty")

        now = datetime.datetime.utcnow()
        note.content = content.strip()
        note.updated_at = now
        db.commit()
        db.refresh(note)

        AuditService.log_event(
            db=db,
            case_id=note.case_id,
            event_type="NOTE_UPDATED",
            actor=current_user.username,
            metadata={
                "note_id": note.note_identifier,
                "target_type": note.target_type,
                "target_id": note.target_id,
            }
        )

        return note
