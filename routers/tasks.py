from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Project, Task, TaskAssignee, TaskStatus, User
from routers.activities import log_activity
from routers.auth import get_current_user
from routers.notifications_helper import notify_task_assigned, notify_task_updated
from schemas import TaskCreate, TaskMove, TaskResponse, TaskUpdate, UserResponse

router = APIRouter()


def _get_task_or_404(db: Session, task_id: int) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _ensure_project_owner(project: Project, user: User):
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only project owner can perform this action")


def _ensure_task_access(task: Task, user: User):
    if task.project.owner_id == user.id:
        return

    assignees = getattr(task, "assignees", [])
    if assignees and user.id in [task_assignee.user_id for task_assignee in assignees]:
        return

    raise HTTPException(status_code=403, detail="You do not have permission for this task")


def _load_task_with_relations(db: Session, task_id: int) -> Optional[Task]:
    return (
        db.query(Task)
        .options(
            joinedload(Task.assignees).joinedload(TaskAssignee.user),
            joinedload(Task.subtasks),
            joinedload(Task.project),
        )
        .filter(Task.id == task_id)
        .first()
    )


def _enrich_task(task: Task):
    total = len(task.subtasks)
    completed = len([subtask for subtask in task.subtasks if subtask.is_done])
    progress = (completed / total * 100) if total else (100.0 if task.status == TaskStatus.DONE.value else 0.0)
    task.total_subtasks = total
    task.completed_subtasks = completed
    task.progress_percent = round(progress, 2)

    assignees_list = []
    for task_assignee in getattr(task, "assignees", []):
        if hasattr(task_assignee, "user") and task_assignee.user:
            assignees_list.append(
                UserResponse(
                    id=task_assignee.user.id,
                    username=task_assignee.user.username,
                    email=task_assignee.user.email,
                    full_name=task_assignee.user.full_name,
                    avatar_url=task_assignee.user.avatar_url,
                    role=task_assignee.user.role,
                    is_active=task_assignee.user.is_active,
                    created_at=task_assignee.user.created_at,
                    department=task_assignee.user.department,
                    team=task_assignee.user.team,
                    position=getattr(task_assignee.user, "position", None),
                    field=getattr(task_assignee.user, "field", None),
                    group=getattr(task_assignee.user, "group", None),
                )
            )

    return task


@router.get("/", response_model=List[TaskResponse])
def get_tasks(
    project_id: Optional[int] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    assigned_only: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy danh sách tasks với filter"""
    query = db.query(Task)

    if project_id:
        query = query.filter(Task.project_id == project_id)
        if not assigned_only:
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                raise HTTPException(status_code=404, detail="Project not found")

    if assigned_only:
        assignee_task_ids = [
            row[0]
            for row in db.query(TaskAssignee.task_id).filter(TaskAssignee.user_id == current_user.id).distinct().all()
        ]
        if assignee_task_ids:
            query = query.filter(Task.id.in_(assignee_task_ids))
        else:
            query = query.filter(Task.id == -1)

    if status:
        query = query.filter(Task.status == status)

    tasks = (
        query.options(
            joinedload(Task.assignees).joinedload(TaskAssignee.user),
            joinedload(Task.subtasks),
            joinedload(Task.project),
        )
        .order_by(Task.position, Task.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_enrich_task(task) for task in tasks]


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy thông tin một task"""
    task = _load_task_with_relations(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _ensure_task_access(task, current_user)
    return _enrich_task(task)


@router.post("/", response_model=TaskResponse)
def create_task(
    task: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tạo task mới"""
    project = db.query(Project).filter(Project.id == task.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _ensure_project_owner(project, current_user)

    assignee_ids = task.assignee_ids or []
    assignees = []
    if assignee_ids:
        assignees = db.query(User).filter(User.id.in_(assignee_ids)).all()
        if len(assignees) != len(assignee_ids):
            raise HTTPException(status_code=404, detail="One or more assignees not found")

    max_position = (
        db.query(Task)
        .filter(
            Task.project_id == task.project_id,
            Task.status == task.status,
        )
        .count()
    )

    task_data = task.dict(exclude={"assignee_ids"})
    task_data["position"] = max_position

    db_task = Task(**task_data)
    db.add(db_task)
    db.flush()

    for user_id in assignee_ids:
        db.add(TaskAssignee(task_id=db_task.id, user_id=user_id))

    db.commit()

    db_task = _load_task_with_relations(db, db_task.id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found after create")

    if assignee_ids:
        notify_task_assigned(db, db_task, assignee_ids, current_user)

    assignee_names = [assignee.full_name or assignee.username for assignee in assignees] if assignee_ids else ["Unassigned"]
    log_activity(
        db,
        db_task.project_id,
        current_user.id,
        "task_created",
        "task",
        db_task.id,
        f"{current_user.full_name or current_user.username} đã tạo task '{db_task.title}'",
        {"task_id": db_task.id, "task_title": db_task.title, "assignee_ids": assignee_ids, "assignee_names": assignee_names},
    )

    return _enrich_task(db_task)


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    task_update: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cập nhật task"""
    db_task = _load_task_with_relations(db, task_id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")

    _ensure_task_access(db_task, current_user)

    old_status = db_task.status
    old_assignee_ids = [task_assignee.user_id for task_assignee in db_task.assignees] if db_task.assignees else []
    update_data = task_update.dict(exclude_unset=True)

    assignee_ids = update_data.pop("assignee_ids", None)
    assignees_changed = False

    if assignee_ids is not None and set(old_assignee_ids) != set(assignee_ids):
        assignees = []
        if assignee_ids:
            assignees = db.query(User).filter(User.id.in_(assignee_ids)).all()
            if len(assignees) != len(assignee_ids):
                raise HTTPException(status_code=404, detail="One or more assignees not found")

        db.query(TaskAssignee).filter(TaskAssignee.task_id == db_task.id).delete()
        for user_id in assignee_ids:
            db.add(TaskAssignee(task_id=db_task.id, user_id=user_id))

        assignees_changed = True

    for field, value in update_data.items():
        setattr(db_task, field, value)

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(exc)}")

    db_task = _load_task_with_relations(db, db_task.id)
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found after update")

    new_assignee_ids = [task_assignee.user_id for task_assignee in db_task.assignees] if db_task.assignees else []

    if "status" in update_data and update_data["status"] != old_status:
        status_map = {"todo": "To Do", "in_progress": "In Progress", "done": "Done", "blocked": "Blocked"}
        old_status_name = status_map.get(old_status, old_status)
        new_status_name = status_map.get(update_data["status"], update_data["status"])

        if update_data["status"] == "done":
            log_activity(
                db,
                db_task.project_id,
                current_user.id,
                "task_completed",
                "task",
                db_task.id,
                f"{current_user.full_name or current_user.username} đã hoàn thành task '{db_task.title}'",
                {"task_id": db_task.id, "task_title": db_task.title},
            )
        else:
            log_activity(
                db,
                db_task.project_id,
                current_user.id,
                "task_status_changed",
                "task",
                db_task.id,
                f"{current_user.full_name or current_user.username} đã chuyển task '{db_task.title}' từ '{old_status_name}' sang '{new_status_name}'",
                {"task_id": db_task.id, "task_title": db_task.title, "old_status": old_status, "new_status": update_data["status"]},
            )

    if assignees_changed:
        assignee_names = [task_assignee.user.full_name or task_assignee.user.username for task_assignee in db_task.assignees] if db_task.assignees else []
        assignee_name_str = ", ".join(assignee_names) if assignee_names else "Unassigned"

        log_activity(
            db,
            db_task.project_id,
            current_user.id,
            "task_assigned",
            "task",
            db_task.id,
            f"Task '{db_task.title}' đã được giao cho {assignee_name_str}",
            {"task_id": db_task.id, "task_title": db_task.title, "assignee_ids": new_assignee_ids, "assignee_names": assignee_names},
        )
        notify_task_assigned(db, db_task, new_assignee_ids, current_user)

    other_updates = {key: value for key, value in update_data.items() if key != "status"}
    if other_updates:
        update_description = "cập nhật task"
        if "title" in other_updates:
            update_description = "đổi tên task"
        elif "description" in other_updates:
            update_description = "cập nhật mô tả task"
        elif "due_date" in other_updates:
            update_description = "thay đổi deadline"

        log_activity(
            db,
            db_task.project_id,
            current_user.id,
            "task_updated",
            "task",
            db_task.id,
            f"{current_user.full_name or current_user.username} đã cập nhật task '{db_task.title}'",
            {"task_id": db_task.id, "task_title": db_task.title, "updated_fields": list(other_updates.keys())},
        )
        notify_task_updated(db, db_task, current_user, update_description)

    return _enrich_task(db_task)


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Xóa task"""
    db_task = _get_task_or_404(db, task_id)
    _ensure_project_owner(db_task.project, current_user)

    db.delete(db_task)
    db.commit()
    return {"message": "Task deleted successfully"}


@router.post("/{task_id}/move")
def move_task(
    task_id: int,
    move_data: TaskMove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Di chuyển task giữa các columns (board view)"""
    db_task = _get_task_or_404(db, task_id)
    _ensure_task_access(db_task, current_user)

    new_status = move_data.new_status
    new_position = move_data.new_position
    old_status = db_task.status
    old_position = db_task.position

    if new_status == TaskStatus.DONE.value and db_task.project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only project owner can move task to Done")

    if old_status == new_status:
        if new_position > old_position:
            db.query(Task).filter(
                Task.project_id == db_task.project_id,
                Task.status == old_status,
                Task.position > old_position,
                Task.position <= new_position,
            ).update({Task.position: Task.position - 1})
        else:
            db.query(Task).filter(
                Task.project_id == db_task.project_id,
                Task.status == old_status,
                Task.position >= new_position,
                Task.position < old_position,
            ).update({Task.position: Task.position + 1})
    else:
        db.query(Task).filter(
            Task.project_id == db_task.project_id,
            Task.status == old_status,
            Task.position > old_position,
        ).update({Task.position: Task.position - 1})

        db.query(Task).filter(
            Task.project_id == db_task.project_id,
            Task.status == new_status,
            Task.position >= new_position,
        ).update({Task.position: Task.position + 1})

    db_task.status = new_status
    db_task.position = new_position
    db.commit()
    db.refresh(db_task)

    if old_status != new_status:
        status_map = {"todo": "To Do", "in_progress": "In Progress", "done": "Done", "blocked": "Blocked"}
        old_status_name = status_map.get(old_status, old_status)
        new_status_name = status_map.get(new_status, new_status)
        if new_status == TaskStatus.DONE.value:
            log_activity(
                db,
                db_task.project_id,
                current_user.id,
                "task_completed",
                "task",
                db_task.id,
                f"{current_user.full_name or current_user.username} đã hoàn thành task '{db_task.title}'",
                {"task_id": db_task.id, "task_title": db_task.title},
            )
        else:
            log_activity(
                db,
                db_task.project_id,
                current_user.id,
                "task_status_changed",
                "task",
                db_task.id,
                f"{current_user.full_name or current_user.username} đã chuyển task '{db_task.title}' từ '{old_status_name}' sang '{new_status_name}'",
                {"task_id": db_task.id, "task_title": db_task.title, "old_status": old_status, "new_status": new_status},
            )

    return {"message": "Task moved successfully", "task": _enrich_task(db_task)}


@router.post("/{task_id}/confirm-complete", response_model=TaskResponse)
def confirm_task_completion(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Project owner xác nhận hoàn thành task (status Done)"""
    db_task = _get_task_or_404(db, task_id)
    _ensure_project_owner(db_task.project, current_user)

    total = len(db_task.subtasks)
    completed = len([subtask for subtask in db_task.subtasks if subtask.is_done])
    if total == 0 or completed < total:
        raise HTTPException(status_code=400, detail="Task chưa hoàn thành 100% sub tasks")

    db_task.status = TaskStatus.DONE.value
    db.commit()
    db.refresh(db_task)
    return _enrich_task(db_task)
