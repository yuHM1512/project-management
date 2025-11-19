from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Note, UserRole
from schemas import NoteCreate, NoteUpdate, NoteResponse
from routers.auth import get_current_user


router = APIRouter()


def _get_note_or_404(db: Session, note_id: int) -> Note:
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


def _ensure_note_permission(note: Note, current_user):
    if note.owner_id != current_user.id and current_user.role != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Permission denied for this note")


@router.get("/", response_model=List[NoteResponse])
def list_notes(
    project_id: Optional[int] = None,
    task_id: Optional[int] = None,
    work_log_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(Note)
    if current_user.role != UserRole.ADMIN.value:
        query = query.filter(Note.owner_id == current_user.id)
    if project_id:
        query = query.filter(Note.project_id == project_id)
    if task_id:
        query = query.filter(Note.task_id == task_id)
    if work_log_id:
        query = query.filter(Note.work_log_id == work_log_id)
    return query.order_by(Note.note_date.desc().nullslast(), Note.updated_at.desc().nullslast()).all()


@router.post("/", response_model=NoteResponse)
def create_note(
    payload: NoteCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    data = payload.dict()
    data["owner_id"] = current_user.id
    note = Note(**data)
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.put("/{note_id}", response_model=NoteResponse)
def update_note(
    note_id: int,
    payload: NoteUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    note = _get_note_or_404(db, note_id)
    _ensure_note_permission(note, current_user)
    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}")
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    note = _get_note_or_404(db, note_id)
    _ensure_note_permission(note, current_user)
    db.delete(note)
    db.commit()
    return {"message": "Note deleted"}

