from typing import List, Optional
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from database import get_db
from models import WorkLog, UserRole, SubTask, Task, TaskAssignee
from schemas import WorkLogCreate, WorkLogUpdate, WorkLogResponse
from routers.auth import get_current_user
from sqlalchemy.orm import joinedload

router = APIRouter()

WORKLOG_UPLOAD_DIR = Path("static/uploads/worklogs")
WORKLOG_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _get_worklog_or_404(db: Session, worklog_id: int) -> WorkLog:
    worklog = db.query(WorkLog).filter(WorkLog.id == worklog_id).first()
    if not worklog:
        raise HTTPException(status_code=404, detail="Work log not found")
    return worklog


def _ensure_worklog_permission(worklog: WorkLog, current_user):
    if worklog.owner_id != current_user.id and current_user.role != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Permission denied for this work log")


def _sync_worklog_subtask(db: Session, worklog: WorkLog, new_subtask_id: Optional[int], current_user):
    if new_subtask_id:
        subtask = db.query(SubTask).filter(SubTask.id == new_subtask_id).first()
        if not subtask:
            raise HTTPException(status_code=404, detail="Sub task không tồn tại")
        task = db.query(Task).options(joinedload(Task.assignees), joinedload(Task.project)).filter(Task.id == subtask.task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        # Kiểm tra quyền: admin, project owner, hoặc assignee
        if current_user.role != UserRole.ADMIN.value:
            if task.project.owner_id != current_user.id:
                # Kiểm tra xem user có trong danh sách assignees không
                assignee_ids = [ta.user_id for ta in task.assignees]
                if current_user.id not in assignee_ids:
                    raise HTTPException(status_code=403, detail="Bạn không có quyền với sub task này")
        if subtask.work_log_id and subtask.work_log_id != worklog.id:
            other = db.query(WorkLog).filter(WorkLog.id == subtask.work_log_id).first()
            if other:
                other.subtask_id = None
        if worklog.subtask_id and worklog.subtask_id != subtask.id:
            prev = db.query(SubTask).filter(SubTask.id == worklog.subtask_id).first()
            if prev:
                prev.work_log_id = None
        subtask.work_log_id = worklog.id
        worklog.task_id = task.id
        worklog.project_id = task.project_id
        worklog.subtask_id = subtask.id
    else:
        if worklog.subtask_id:
            prev = db.query(SubTask).filter(SubTask.id == worklog.subtask_id).first()
            if prev:
                prev.work_log_id = None
        worklog.subtask_id = None


@router.get("/", response_model=List[WorkLogResponse])
def list_worklogs(
    project_id: Optional[int] = None,
    task_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(WorkLog)
    if current_user.role != UserRole.ADMIN.value:
        query = query.filter(WorkLog.owner_id == current_user.id)
    if project_id:
        query = query.filter(WorkLog.project_id == project_id)
    if task_id:
        query = query.filter(WorkLog.task_id == task_id)
    return query.order_by(WorkLog.updated_at.desc().nullslast(), WorkLog.created_at.desc()).all()


@router.post("/", response_model=WorkLogResponse)
def create_worklog(
    payload: WorkLogCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    data = payload.dict()
    data["owner_id"] = current_user.id
    subtask_id = data.pop("subtask_id", None)
    worklog = WorkLog(**data)
    db.add(worklog)
    db.commit()
    db.refresh(worklog)
    _sync_worklog_subtask(db, worklog, subtask_id, current_user)
    db.commit()
    db.refresh(worklog)
    return worklog


@router.put("/{worklog_id}", response_model=WorkLogResponse)
def update_worklog(
    worklog_id: int,
    payload: WorkLogUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    worklog = _get_worklog_or_404(db, worklog_id)
    _ensure_worklog_permission(worklog, current_user)

    update_data = payload.dict(exclude_unset=True)
    subtask_id = update_data.pop("subtask_id", None) if "subtask_id" in update_data else worklog.subtask_id
    for field, value in update_data.items():
        setattr(worklog, field, value)

    _sync_worklog_subtask(db, worklog, subtask_id, current_user)
    db.commit()
    db.refresh(worklog)
    return worklog


@router.delete("/{worklog_id}")
def delete_worklog(
    worklog_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    worklog = _get_worklog_or_404(db, worklog_id)
    _ensure_worklog_permission(worklog, current_user)
    _sync_worklog_subtask(db, worklog, None, current_user)
    db.delete(worklog)
    db.commit()
    return {"message": "Work log deleted"}


@router.post("/{worklog_id}/attachments", response_model=WorkLogResponse)
async def upload_worklog_attachment(
    worklog_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    worklog = _get_worklog_or_404(db, worklog_id)
    _ensure_worklog_permission(worklog, current_user)

    extension = os.path.splitext(file.filename)[1] or ".dat"
    filename = f"worklog_{worklog_id}_{uuid.uuid4().hex}{extension}"
    destination = WORKLOG_UPLOAD_DIR / filename

    with destination.open("wb") as buffer:
        buffer.write(await file.read())

    attachment_entry = {
        "name": file.filename,
        "url": f"/static/uploads/worklogs/{filename}",
        "size": destination.stat().st_size,
        "type": file.content_type,
    }
    attachments = worklog.attachments or []
    attachments.append(attachment_entry)
    worklog.attachments = attachments
    db.commit()
    db.refresh(worklog)
    return worklog

