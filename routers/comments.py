from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import os
import shutil

from database import get_db
from models import TaskComment, Task, User, TaskAssignee, Project
from schemas import TaskCommentCreate, TaskCommentUpdate, TaskCommentResponse, UserResponse
from routers.auth import get_current_user
from routers.activities import log_activity
from sqlalchemy.orm import joinedload

router = APIRouter()

UPLOAD_DIR = "static/uploads/comments"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _get_task_or_404(db: Session, task_id: int) -> Task:
    task = db.query(Task).options(
        joinedload(Task.assignees).joinedload(TaskAssignee.user),
        joinedload(Task.project).joinedload(Project.team_members)
    ).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _ensure_task_access(task: Task, user: User):
    """Kiểm tra user có quyền xem task (read-only) - cho phép tất cả users trong project xem"""
    from models import UserRole
    
    # Admin có thể truy cập tất cả
    if user.role == UserRole.ADMIN.value:
        return
    
    # Project owner có thể truy cập
    if task.project.owner_id == user.id:
        return
    
    # Kiểm tra xem user có trong danh sách assignees không
    assignees = getattr(task, 'assignees', [])
    if assignees:
        assignee_ids = [ta.user_id for ta in assignees]
        if user.id in assignee_ids:
            return
    
    # Kiểm tra xem user có phải team member của project không
    team_members = getattr(task.project, 'team_members', [])
    if team_members:
        team_member_ids = [tm.user_id for tm in team_members]
        if user.id in team_member_ids:
            return
    
    # Cho phép tất cả users xem (read-only) - không raise 403
    # Chỉ cần kiểm tra quyền write ở các endpoint tạo/sửa/xóa
    return


def _enrich_comment(comment: TaskComment) -> dict:
    """Enrich comment với thông tin user"""
    return {
        "id": comment.id,
        "task_id": comment.task_id,
        "user_id": comment.user_id,
        "content": comment.content if not comment.is_deleted else "[Comment đã bị xóa]",
        "attachment_url": comment.attachment_url,
        "is_edited": comment.is_edited,
        "is_deleted": comment.is_deleted,
        "created_at": comment.created_at,
        "updated_at": comment.updated_at,
        "user": {
            "id": comment.user.id,
            "username": comment.user.username,
            "email": comment.user.email,
            "full_name": comment.user.full_name,
            "avatar_url": comment.user.avatar_url
        }
    }


@router.get("/", response_model=List[dict])
def get_comments(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy tất cả comments của một task"""
    task = _get_task_or_404(db, task_id)
    _ensure_task_access(task, current_user)
    
    comments = db.query(TaskComment).filter(
        TaskComment.task_id == task_id,
        TaskComment.is_deleted == False
    ).order_by(TaskComment.created_at.asc()).all()
    
    return [_enrich_comment(comment) for comment in comments]


def _ensure_task_write_permission(task: Task, user: User):
    """Kiểm tra user có quyền chỉnh sửa task (write) - chỉ assignees và project owner"""
    from models import UserRole
    
    # Admin có thể chỉnh sửa tất cả
    if user.role == UserRole.ADMIN.value:
        return
    
    # Project owner có thể chỉnh sửa
    if task.project.owner_id == user.id:
        return
    
    # Kiểm tra xem user có trong danh sách assignees không
    assignees = getattr(task, 'assignees', [])
    if assignees:
        assignee_ids = [ta.user_id for ta in assignees]
        if user.id in assignee_ids:
            return
    
    raise HTTPException(status_code=403, detail="You do not have permission to modify this task")

@router.post("/", response_model=dict)
def create_comment(
    comment: TaskCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tạo comment mới"""
    task = _get_task_or_404(db, comment.task_id)
    _ensure_task_write_permission(task, current_user)
    
    db_comment = TaskComment(
        task_id=comment.task_id,
        user_id=current_user.id,
        content=comment.content,
        attachment_url=comment.attachment_url
    )
    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)
    
    # Log activity: comment added
    task = db.query(Task).filter(Task.id == comment.task_id).first()
    log_activity(
        db, task.project_id, current_user.id,
        "comment_added", "comment", db_comment.id,
        f"{current_user.full_name or current_user.username} đã comment vào task '{task.title}'",
        {"task_id": task.id, "task_title": task.title, "comment_id": db_comment.id}
    )
    
    return _enrich_comment(db_comment)


@router.put("/{comment_id}", response_model=dict)
def update_comment(
    comment_id: int,
    comment_update: TaskCommentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cập nhật comment (chỉ người tạo hoặc assignee/project owner mới được sửa)"""
    db_comment = db.query(TaskComment).filter(TaskComment.id == comment_id).first()
    if not db_comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Người tạo comment có thể sửa
    if db_comment.user_id == current_user.id:
        pass  # OK
    else:
        # Hoặc là assignee/project owner của task
        task = _get_task_or_404(db, db_comment.task_id)
        try:
            _ensure_task_write_permission(task, current_user)
        except HTTPException:
            raise HTTPException(status_code=403, detail="You can only edit your own comments or be an assignee/owner")
    
    if db_comment.is_deleted:
        raise HTTPException(status_code=400, detail="Cannot edit deleted comment")
    
    if comment_update.content is not None:
        db_comment.content = comment_update.content
        db_comment.is_edited = True
        db_comment.updated_at = datetime.utcnow()
    
    if comment_update.attachment_url is not None:
        db_comment.attachment_url = comment_update.attachment_url
    
    db.commit()
    db.refresh(db_comment)
    
    return _enrich_comment(db_comment)


@router.delete("/{comment_id}")
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Xóa comment (soft delete - chỉ người tạo, assignee hoặc project owner)"""
    db_comment = db.query(TaskComment).filter(TaskComment.id == comment_id).first()
    if not db_comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    task = _get_task_or_404(db, db_comment.task_id)
    
    # Người tạo comment có thể xóa
    can_delete = db_comment.user_id == current_user.id
    
    # Hoặc project owner
    if not can_delete:
        can_delete = task.project.owner_id == current_user.id
    
    # Hoặc assignee của task
    if not can_delete:
        assignees = getattr(task, 'assignees', [])
        if assignees:
            assignee_ids = [ta.user_id for ta in assignees]
            can_delete = current_user.id in assignee_ids
    
    if not can_delete:
        raise HTTPException(status_code=403, detail="You don't have permission to delete this comment")
    
    db_comment.is_deleted = True
    db_comment.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Comment deleted successfully"}


@router.post("/{comment_id}/upload")
async def upload_comment_attachment(
    comment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload attachment cho comment"""
    db_comment = db.query(TaskComment).filter(TaskComment.id == comment_id).first()
    if not db_comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    if db_comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only upload attachment for your own comments")
    
    # Lưu file
    file_ext = os.path.splitext(file.filename)[1]
    filename = f"comment_{comment_id}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}{file_ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Update comment với attachment URL
    attachment_url = f"/static/uploads/comments/{filename}"
    db_comment.attachment_url = attachment_url
    db.commit()
    db.refresh(db_comment)
    
    return _enrich_comment(db_comment)

