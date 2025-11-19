import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import SubTask, Task, User, WorkLog, UserRole, TaskAssignee
from schemas import SubTaskCreate, SubTaskUpdate, SubTaskResponse
from routers.auth import get_current_user
from routers.activities import log_activity
from sqlalchemy.orm import joinedload


router = APIRouter()

UPLOAD_DIR = Path("static/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _get_task_or_404(db: Session, task_id: int) -> Task:
    task = db.query(Task).options(joinedload(Task.assignees), joinedload(Task.project)).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _get_subtask_or_404(db: Session, subtask_id: int) -> SubTask:
    subtask = db.query(SubTask).filter(SubTask.id == subtask_id).first()
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    return subtask


def _ensure_task_permission(task: Task, current_user):
    # Kiểm tra quyền: project owner hoặc assignee
    if task.project.owner_id != current_user.id:
        # Kiểm tra xem user có trong danh sách assignees không
        assignee_ids = [ta.user_id for ta in task.assignees]
        if current_user.id not in assignee_ids:
            raise HTTPException(status_code=403, detail="You do not have permission for this task")


def _ensure_worklog_permission(worklog: WorkLog, current_user):
    if worklog.owner_id != current_user.id and current_user.role != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="You do not have permission for this work log")


@router.get("/task/{task_id}", response_model=List[SubTaskResponse])
def list_subtasks(task_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    task = _get_task_or_404(db, task_id)
    _ensure_task_permission(task, current_user)
    return task.subtasks


@router.post("/", response_model=SubTaskResponse)
def create_subtask(subtask: SubTaskCreate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    task = _get_task_or_404(db, subtask.task_id)
    _ensure_task_permission(task, current_user)
    db_subtask = SubTask(**subtask.dict())
    db.add(db_subtask)
    db.commit()
    db.refresh(db_subtask)
    return db_subtask


@router.put("/{subtask_id}", response_model=SubTaskResponse)
def update_subtask(subtask_id: int, payload: SubTaskUpdate, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_subtask = _get_subtask_or_404(db, subtask_id)
    task = _get_task_or_404(db, db_subtask.task_id)
    _ensure_task_permission(task, current_user)

    # Store old is_done for activity log
    old_is_done = db_subtask.is_done
    
    update_data = payload.dict(exclude_unset=True)
    if "work_log_id" in update_data:
        new_worklog_id = update_data.pop("work_log_id")
        if new_worklog_id:
            worklog = db.query(WorkLog).filter(WorkLog.id == new_worklog_id).first()
            if not worklog:
                raise HTTPException(status_code=404, detail="Work log not found")
            _ensure_worklog_permission(worklog, current_user)
            if worklog.subtask_id and worklog.subtask_id != db_subtask.id:
                other = db.query(SubTask).filter(SubTask.id == worklog.subtask_id).first()
                if other:
                    other.work_log_id = None
            if db_subtask.work_log_id and db_subtask.work_log_id != worklog.id:
                previous_log = db.query(WorkLog).filter(WorkLog.id == db_subtask.work_log_id).first()
                if previous_log:
                    previous_log.subtask_id = None
            worklog.subtask_id = db_subtask.id
            worklog.task_id = task.id
            worklog.project_id = task.project_id
            db_subtask.work_log_id = worklog.id
        else:
            if db_subtask.work_log_id:
                existing = db.query(WorkLog).filter(WorkLog.id == db_subtask.work_log_id).first()
                if existing:
                    existing.subtask_id = None
            db_subtask.work_log_id = None

    for field, value in update_data.items():
        setattr(db_subtask, field, value)

    db.commit()
    db.refresh(db_subtask)
    
    # Log activity: subtask completed
    if "is_done" in update_data and update_data["is_done"] and not old_is_done:
        task = db.query(Task).filter(Task.id == db_subtask.task_id).first()
        current_user_obj = db.query(User).filter(User.id == current_user.id).first()
        log_activity(
            db, task.project_id, current_user.id,
            "subtask_completed", "subtask", db_subtask.id,
            f"{current_user_obj.full_name or current_user_obj.username} đã hoàn thành subtask '{db_subtask.title}' của task '{task.title}'",
            {"task_id": task.id, "task_title": task.title, "subtask_id": db_subtask.id, "subtask_title": db_subtask.title}
        )
    
    return db_subtask


@router.delete("/{subtask_id}")
def delete_subtask(subtask_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    db_subtask = _get_subtask_or_404(db, subtask_id)
    task = _get_task_or_404(db, db_subtask.task_id)
    _ensure_task_permission(task, current_user)

    db.delete(db_subtask)
    db.commit()
    return {"message": "Subtask deleted successfully"}


@router.post("/{subtask_id}/attachment", response_model=SubTaskResponse)
async def upload_subtask_attachment(
    subtask_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    db_subtask = _get_subtask_or_404(db, subtask_id)
    task = _get_task_or_404(db, db_subtask.task_id)
    _ensure_task_permission(task, current_user)

    extension = os.path.splitext(file.filename)[1] or ".dat"
    filename = f"subtask_{subtask_id}_{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / filename

    with destination.open("wb") as buffer:
        buffer.write(await file.read())

    db_subtask.attachment_url = f"/static/uploads/{filename}"
    db.commit()
    db.refresh(db_subtask)
    return db_subtask

