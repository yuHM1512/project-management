from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import re
from typing import List, Optional
from datetime import datetime

from database import get_db
from models import ActivityLog, Project, User
from schemas import ActivityLogResponse, UserResponse
from routers.auth import get_current_user

router = APIRouter()

_MOJIBAKE_MARKERS = (
    "Ã",
    "Â",
    "Ä",
    "Æ",
    "áº",
    "á»",
    "â€™",
    "â€œ",
    "â€",
    "ï¿½",
    "�",
)


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


def _safe_str(val) -> str:
    """Return text with common UTF-8-as-Windows-1252/Latin-1 mojibake repaired."""
    if val is None:
        return ""
    if isinstance(val, bytes):
        val = val.decode("utf-8", errors="replace")

    text = str(val)
    text = _repair_mojibake_text(text)

    if _looks_mojibake(text):
        text = "".join(_repair_mojibake_text(part) for part in re.split(r"([ \t\r\n\f\v]+)", text))

    return text


def _repair_mojibake_text(text: str) -> str:
    for _ in range(3):
        if not _looks_mojibake(text):
            break

        candidates = []
        for encoding in ("cp1252", "latin1"):
            try:
                candidates.append(text.encode(encoding).decode("utf-8"))
            except UnicodeError:
                continue

        if not candidates:
            break

        best = min(candidates, key=_mojibake_score)
        if _mojibake_score(best) >= _mojibake_score(text):
            break

        text = best

    return text


def _looks_mojibake(text: str) -> bool:
    return any(marker in text for marker in _MOJIBAKE_MARKERS)


def _mojibake_score(text: str) -> int:
    return sum(text.count(marker) for marker in _MOJIBAKE_MARKERS)


def _repair_metadata(value):
    if isinstance(value, dict):
        return {key: _repair_metadata(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_repair_metadata(item) for item in value]
    if isinstance(value, str):
        return _safe_str(value)
    return value


def _enrich_activity(activity: ActivityLog) -> dict:
    """Enrich activity với thông tin user"""
    user = activity.user
    return {
        "id": activity.id,
        "project_id": activity.project_id,
        "user_id": activity.user_id,
        "activity_type": _safe_str(activity.activity_type),
        "entity_type": _safe_str(activity.entity_type),
        "entity_id": activity.entity_id,
        "description": _safe_str(activity.description),
        "metadata": _repair_metadata(activity.activity_metadata) if activity.activity_metadata else {},
        "created_at": activity.created_at,
        "user": {
            "id": user.id,
            "username": _safe_str(user.username),
            "email": _safe_str(user.email),
            "full_name": _safe_str(user.full_name),
            "avatar_url": _safe_str(user.avatar_url) if user.avatar_url else None,
        }
    }


@router.get("/recent", response_model=List[dict])
def get_recent_activities(
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy activities gần đây nhất trên toàn hệ thống (dùng cho dashboard)"""
    from sqlalchemy import desc
    activities = (
        db.query(ActivityLog)
        .order_by(desc(ActivityLog.created_at))
        .limit(limit)
        .all()
    )
    return [_enrich_activity(a) for a in activities]


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
        activity_type=_safe_str(activity_type),
        entity_type=_safe_str(entity_type),
        entity_id=entity_id,
        description=_safe_str(description),
        activity_metadata=_repair_metadata(metadata)
    )
    db.add(activity)
    db.commit()
    return activity

