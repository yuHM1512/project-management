from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict, Any

from database import get_db
from models import User, RecurringTaskTemplate
from schemas import RecurringTaskTemplateCreate, RecurringTaskTemplateUpdate, RecurringTaskTemplateResponse
from routers.auth import get_current_user

router = APIRouter()

VALID_FREQUENCIES = ["weekly", "monthly", "quarterly", "semi_annual", "annual", "ad_hoc"]


def _ensure_can_manage_template_user(user_id: int, current_user: User):
    if current_user.role != "admin" and current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")


def _get_template_or_404(db: Session, template_id: int) -> RecurringTaskTemplate:
    template = db.query(RecurringTaskTemplate).filter(RecurringTaskTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Recurring task not found")
    return template


@router.get("/matrix", response_model=List[Dict[str, Any]])
def get_matrix(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ma trận công việc định kỳ: tất cả nhân sự × tần suất"""
    users = db.query(User).filter(User.is_active == True).order_by(User.full_name).all()
    templates_all = db.query(RecurringTaskTemplate).filter(
        RecurringTaskTemplate.is_active == True
    ).all()

    # Group templates by user_id
    by_user: Dict[int, list] = {}
    for t in templates_all:
        by_user.setdefault(t.user_id, []).append(t)

    result = []
    for u in users:
        counts = {f: 0 for f in VALID_FREQUENCIES}
        for t in by_user.get(u.id, []):
            if t.frequency in counts:
                counts[t.frequency] += 1
        result.append({
            "user_id": u.id,
            "full_name": u.full_name or u.username,
            "username": u.username,
            "department": u.department,
            "team": u.team,
            "position": u.position,
            "avatar_url": u.avatar_url,
            "task_counts": counts,
            "total_tasks": sum(counts.values()),
        })
    return result


@router.get("/user/{user_id}", response_model=List[RecurringTaskTemplateResponse])
def list_recurring_tasks(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return db.query(RecurringTaskTemplate).filter(
        RecurringTaskTemplate.user_id == user_id
    ).order_by(RecurringTaskTemplate.frequency, RecurringTaskTemplate.created_at).all()


@router.get("/me", response_model=List[RecurringTaskTemplateResponse])
def list_my_recurring_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(RecurringTaskTemplate).filter(
        RecurringTaskTemplate.user_id == current_user.id
    ).order_by(RecurringTaskTemplate.frequency, RecurringTaskTemplate.created_at).all()


@router.post("/me", response_model=RecurringTaskTemplateResponse)
def create_my_recurring_task(
    task_in: RecurringTaskTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_recurring_task(current_user.id, task_in, db, current_user)


@router.post("/user/{user_id}", response_model=RecurringTaskTemplateResponse)
def create_recurring_task(
    user_id: int,
    task_in: RecurringTaskTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _ensure_can_manage_template_user(user_id, current_user)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if task_in.frequency not in set(VALID_FREQUENCIES):
        raise HTTPException(status_code=400, detail=f"Invalid frequency. Must be one of: {', '.join(VALID_FREQUENCIES)}")

    template = RecurringTaskTemplate(
        user_id=user_id,
        title=task_in.title,
        description=task_in.description,
        frequency=task_in.frequency,
        is_active=task_in.is_active if task_in.is_active is not None else True,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/{template_id}", response_model=RecurringTaskTemplateResponse)
def update_recurring_task(
    template_id: int,
    task_in: RecurringTaskTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = _get_template_or_404(db, template_id)
    _ensure_can_manage_template_user(template.user_id, current_user)
    if task_in.frequency and task_in.frequency not in VALID_FREQUENCIES:
        raise HTTPException(status_code=400, detail=f"Invalid frequency. Must be one of: {', '.join(VALID_FREQUENCIES)}")

    for key, value in task_in.dict(exclude_unset=True).items():
        setattr(template, key, value)
    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}")
def delete_recurring_task(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = _get_template_or_404(db, template_id)
    _ensure_can_manage_template_user(template.user_id, current_user)
    db.delete(template)
    db.commit()
    return {"message": "Deleted"}
