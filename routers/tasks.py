from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional

from database import get_db, engine
from models import Task, Project, User, TaskStatus, TaskAssignee
from schemas import TaskCreate, TaskUpdate, TaskResponse, TaskMove, UserResponse
from routers.auth import get_current_user
from routers.activities import log_activity
from routers.notifications_helper import notify_task_assigned, notify_task_updated

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
    # Kiểm tra nếu user là project owner
    if task.project.owner_id == user.id:
        return
    
    # Kiểm tra task_assignees
    assignees = getattr(task, 'assignees', [])
    if assignees:
        assignee_ids = [ta.user_id for ta in assignees]
        if user.id in assignee_ids:
            return
    
    raise HTTPException(status_code=403, detail="You do not have permission for this task")


def _enrich_task(task: Task):
    total = len(task.subtasks)
    completed = len([s for s in task.subtasks if s.is_done])
    progress = (completed / total * 100) if total else (100.0 if task.status == TaskStatus.DONE.value else 0.0)
    task.total_subtasks = total
    task.completed_subtasks = completed
    task.progress_percent = round(progress, 2)
    
    # Thêm thông tin assignees dưới dạng list UserResponse
    # KHÔNG gán vào task.assignees (relationship) mà tạo attribute mới
    assignees_list = []
    # Sử dụng getattr để tránh lỗi nếu relationship chưa được load
    assignees = getattr(task, 'assignees', [])
    for ta in assignees:
        if hasattr(ta, 'user') and ta.user:
            assignees_list.append(UserResponse(
                id=ta.user.id,
                username=ta.user.username,
                email=ta.user.email,
                full_name=ta.user.full_name,
                avatar_url=ta.user.avatar_url,
                role=ta.user.role,
                is_active=ta.user.is_active,
                created_at=ta.user.created_at,
                department=ta.user.department,
                team=ta.user.team
            ))
    
    # Không cần gán vào task.assignees nữa vì Pydantic sẽ tự serialize từ relationship
    # thông qua model_validator trong TaskResponse schema
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
        # Filter tasks where user is assigned via task_assignees
        assignee_task_ids = [
            row[0] for row in 
            db.query(TaskAssignee.task_id)
            .filter(TaskAssignee.user_id == current_user.id)
            .distinct()
            .all()
        ]
        
        if assignee_task_ids:
            query = query.filter(Task.id.in_(assignee_task_ids))
        else:
            # Nếu không có task nào được assign, trả về empty list
            query = query.filter(Task.id == -1)  # Không match task nào
    if status:
        query = query.filter(Task.status == status)

    # Eager load relationships
    # Kiểm tra xem bảng task_assignees có tồn tại không
    from sqlalchemy import inspect
    inspector = inspect(engine)
    has_task_assignees_table = 'task_assignees' in inspector.get_table_names()
    
    if has_task_assignees_table:
        tasks = (
            query.options(
                joinedload(Task.assignees).joinedload(TaskAssignee.user),
                joinedload(Task.subtasks),
                joinedload(Task.project)
            )
            .order_by(Task.position, Task.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    else:
        # Fallback nếu bảng chưa tồn tại
        tasks = (
            query.options(
                joinedload(Task.subtasks),
                joinedload(Task.project)
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
    try:
        task = db.query(Task).options(
            joinedload(Task.assignees).joinedload(TaskAssignee.user),
            joinedload(Task.subtasks),
            joinedload(Task.project)
        ).filter(Task.id == task_id).first()
    except Exception:
        # Fallback nếu có lỗi với joinedload
        task = db.query(Task).options(
            joinedload(Task.subtasks),
            joinedload(Task.project)
        ).filter(Task.id == task_id).first()
    
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

    # Xử lý assignee_ids (danh sách nhiều assignees)
    assignee_ids = task.assignee_ids or []
    
    # Validate assignees
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

    task_data = task.dict(exclude={"assignee_ids"})  # Loại bỏ assignee_ids khỏi task_data
    task_data["position"] = max_position

    db_task = Task(**task_data)
    db.add(db_task)
    db.flush()  # Flush để có db_task.id
    
    # Tạo TaskAssignee records cho tất cả assignees
    if assignee_ids:
        for user_id in assignee_ids:
            task_assignee = TaskAssignee(task_id=db_task.id, user_id=user_id)
            db.add(task_assignee)
    
    db.commit()
    db.refresh(db_task)
    
    # Load task với relationships để dùng cho notifications
    db_task = db.query(Task).options(
        joinedload(Task.assignees).joinedload(TaskAssignee.user),
        joinedload(Task.project)
    ).filter(Task.id == db_task.id).first()
    
    # Tạo notifications cho assignees
    if assignee_ids:
        notify_task_assigned(db, db_task, assignee_ids, current_user)
    
    # Log activity: task created
    assignee_names = [a.full_name or a.username for a in assignees] if assignee_ids else ["Unassigned"]
    assignee_name_str = ", ".join(assignee_names)
    log_activity(
        db, db_task.project_id, current_user.id,
        "task_created", "task", db_task.id,
        f"{current_user.full_name or current_user.username} đã tạo task '{db_task.title}'",
        {"task_id": db_task.id, "task_title": db_task.title, "assignee_ids": assignee_ids, "assignee_names": assignee_names}
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
    # Load task với relationships để kiểm tra quyền
    db_task = db.query(Task).options(
        joinedload(Task.assignees).joinedload(TaskAssignee.user),
        joinedload(Task.project)
    ).filter(Task.id == task_id).first()
    
    if not db_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    _ensure_task_access(db_task, current_user)

    # Store old values for activity log (TRƯỚC KHI update)
    old_status = db_task.status
    # Đảm bảo assignees đã được load
    old_assignee_ids = [ta.user_id for ta in db_task.assignees] if db_task.assignees else []
    
    update_data = task_update.dict(exclude_unset=True)
    
    # DEBUG: Log để kiểm tra
    print(f"DEBUG update_task: user_id={current_user.id}, username={current_user.username}, role={getattr(current_user, 'role', 'N/A')}")
    print(f"DEBUG update_task: task_id={task_id}, old_assignee_ids={old_assignee_ids}, update_data={update_data}")
    
    # Xử lý assignee_ids nếu có
    assignee_ids = update_data.pop("assignee_ids", None)
    assignees_changed = False
    if assignee_ids is not None:
        # Validate assignees
        assignees = []
        if assignee_ids:
            assignees = db.query(User).filter(User.id.in_(assignee_ids)).all()
            if len(assignees) != len(assignee_ids):
                raise HTTPException(status_code=404, detail="One or more assignees not found")
        
        # Xóa tất cả TaskAssignee cũ và tạo mới
        db.query(TaskAssignee).filter(TaskAssignee.task_id == db_task.id).delete()
        
        # Tạo TaskAssignee mới cho tất cả assignees
        for user_id in assignee_ids:
            task_assignee = TaskAssignee(task_id=db_task.id, user_id=user_id)
            db.add(task_assignee)
        
        assignees_changed = True
    
    # Xử lý các field khác
    for field, value in update_data.items():
        setattr(db_task, field, value)

    db.commit()
    db.refresh(db_task)
    
    # Load task với relationships để dùng cho notifications
    db_task = db.query(Task).options(
        joinedload(Task.assignees).joinedload(TaskAssignee.user),
        joinedload(Task.project)
    ).filter(Task.id == db_task.id).first()
    
    # Log activities
    new_assignee_ids = [ta.user_id for ta in db_task.assignees]
    
    # Log status change
    if "status" in update_data and update_data["status"] != old_status:
        status_map = {"todo": "To Do", "in_progress": "In Progress", "done": "Done", "blocked": "Blocked"}
        old_status_name = status_map.get(old_status, old_status)
        new_status_name = status_map.get(update_data["status"], update_data["status"])
        
        print(f"DEBUG: Logging status change - user_id={current_user.id}, username={current_user.username}, from {old_status} to {update_data['status']}")
        
        if update_data["status"] == "done":
            try:
                log_activity(
                    db, db_task.project_id, current_user.id,
                    "task_completed", "task", db_task.id,
                    f"{current_user.full_name or current_user.username} đã hoàn thành task '{db_task.title}'",
                    {"task_id": db_task.id, "task_title": db_task.title}
                )
                print(f"DEBUG: ✓ Status change (completed) activity logged successfully")
            except Exception as e:
                print(f"DEBUG: ✗ Error logging status change (completed): {e}")
                import traceback
                traceback.print_exc()
        else:
            try:
                log_activity(
                    db, db_task.project_id, current_user.id,
                    "task_status_changed", "task", db_task.id,
                    f"{current_user.full_name or current_user.username} đã chuyển task '{db_task.title}' từ '{old_status_name}' sang '{new_status_name}'",
                    {"task_id": db_task.id, "task_title": db_task.title, "old_status": old_status, "new_status": update_data["status"]}
                )
                print(f"DEBUG: ✓ Status change activity logged successfully")
            except Exception as e:
                print(f"DEBUG: ✗ Error logging status change: {e}")
                import traceback
                traceback.print_exc()
    
    # Log assignee change và tạo notifications
    if assignee_ids is not None and set(old_assignee_ids) != set(new_assignee_ids):
        assignee_names = [ta.user.full_name or ta.user.username for ta in db_task.assignees] if db_task.assignees else []
        assignee_name_str = ", ".join(assignee_names) if assignee_names else "Unassigned"
        
        print(f"DEBUG: Logging assignee change - user_id={current_user.id}, old={old_assignee_ids}, new={new_assignee_ids}")
        
        try:
            log_activity(
                db, db_task.project_id, current_user.id,
                "task_assigned", "task", db_task.id,
                f"Task '{db_task.title}' đã được giao cho {assignee_name_str}",
                {"task_id": db_task.id, "task_title": db_task.title, "assignee_ids": new_assignee_ids, "assignee_names": assignee_names}
            )
            print(f"DEBUG: ✓ Assignee change activity logged")
        except Exception as e:
            print(f"DEBUG: ✗ Error logging assignee change: {e}")
            import traceback
            traceback.print_exc()
        
        # Tạo notifications cho assignees mới
        notify_task_assigned(db, db_task, new_assignee_ids, current_user)
    
    # Log other updates và tạo notifications cho task updates
    other_updates = {k: v for k, v in update_data.items() if k not in ["status", "assignee_ids"]}
    if other_updates and not assignees_changed:
        # Chỉ tạo notification nếu có update thực sự (không phải chỉ thay đổi assignees)
        update_description = "cập nhật task"
        if "title" in other_updates:
            update_description = "đổi tên task"
        elif "description" in other_updates:
            update_description = "cập nhật mô tả task"
        elif "due_date" in other_updates:
            update_description = "thay đổi deadline"
        
        # DEBUG: Log trước khi gọi log_activity
        print(f"DEBUG: About to log activity - user_id={current_user.id}, project_id={db_task.project_id}, task_id={db_task.id}")
        print(f"DEBUG: Activity type=task_updated, description={current_user.full_name or current_user.username} đã cập nhật task '{db_task.title}'")
        
        try:
            log_activity(
                db, db_task.project_id, current_user.id,
                "task_updated", "task", db_task.id,
                f"{current_user.full_name or current_user.username} đã cập nhật task '{db_task.title}'",
                {"task_id": db_task.id, "task_title": db_task.title, "updated_fields": list(other_updates.keys())}
            )
            print(f"DEBUG: ✓ Activity logged successfully")
        except Exception as e:
            print(f"DEBUG: ✗ Error logging activity: {e}")
            import traceback
            traceback.print_exc()
        
        # Tạo notifications cho các assignees khác (trừ người update)
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
    
    # Log activity: status change (if status changed)
    if old_status != new_status:
        status_map = {"todo": "To Do", "in_progress": "In Progress", "done": "Done", "blocked": "Blocked"}
        old_status_name = status_map.get(old_status, old_status)
        new_status_name = status_map.get(new_status, new_status)
        if new_status == TaskStatus.DONE.value:
            log_activity(
                db, db_task.project_id, current_user.id,
                "task_completed", "task", db_task.id,
                f"{current_user.full_name or current_user.username} đã hoàn thành task '{db_task.title}'",
                {"task_id": db_task.id, "task_title": db_task.title}
            )
        else:
            log_activity(
                db, db_task.project_id, current_user.id,
                "task_status_changed", "task", db_task.id,
                f"{current_user.full_name or current_user.username} đã chuyển task '{db_task.title}' từ '{old_status_name}' sang '{new_status_name}'",
                {"task_id": db_task.id, "task_title": db_task.title, "old_status": old_status, "new_status": new_status}
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
    completed = len([s for s in db_task.subtasks if s.is_done])
    if total == 0 or completed < total:
        raise HTTPException(status_code=400, detail="Task chưa hoàn thành 100% sub tasks")

    db_task.status = TaskStatus.DONE.value
    db.commit()
    db.refresh(db_task)
    return _enrich_task(db_task)

