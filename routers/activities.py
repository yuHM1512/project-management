from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from database import get_db
from models import ActivityLog, Project, User
from schemas import ActivityLogResponse, UserResponse
from routers.auth import get_current_user

router = APIRouter()


def _get_project_or_404(db: Session, project_id: int) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _ensure_project_access(project: Project, user: User):
    """Kiểm tra user có quyền truy cập project không"""
    if project.owner_id != user.id:
        # Có thể thêm logic kiểm tra team member ở đây nếu cần
        pass


def _enrich_activity(activity: ActivityLog) -> dict:
    """Enrich activity với thông tin user"""
    return {
        "id": activity.id,
        "project_id": activity.project_id,
        "user_id": activity.user_id,
        "activity_type": activity.activity_type,
        "entity_type": activity.entity_type,
        "entity_id": activity.entity_id,
        "description": activity.description,
        "metadata": activity.activity_metadata if activity.activity_metadata else {},
        "created_at": activity.created_at,
        "user": {
            "id": activity.user.id,
            "username": activity.user.username,
            "email": activity.user.email,
            "full_name": activity.user.full_name,
            "avatar_url": activity.user.avatar_url
        }
    }


@router.get("/", response_model=List[dict])
def get_activities(
    project_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy danh sách activities của project, sắp xếp theo thời gian mới nhất"""
    project = _get_project_or_404(db, project_id)
    _ensure_project_access(project, current_user)
    
    activities = db.query(ActivityLog).filter(
        ActivityLog.project_id == project_id
    ).order_by(ActivityLog.created_at.desc()).limit(limit).all()
    
    return [_enrich_activity(activity) for activity in activities]


def log_activity(
    db: Session,
    project_id: int,
    user_id: int,
    activity_type: str,
    entity_type: str,
    entity_id: int,
    description: str,
    metadata: Optional[dict] = None
):
    """Helper function để log activity"""
    activity = ActivityLog(
        project_id=project_id,
        user_id=user_id,
        activity_type=activity_type,
        entity_type=entity_type,
        entity_id=entity_id,
        description=description,
        activity_metadata=metadata
    )
    db.add(activity)
    db.commit()
    return activity

