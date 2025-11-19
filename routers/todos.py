from typing import List
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Todo, UserRole
from schemas import TodoCreate, TodoUpdate, TodoResponse
from routers.auth import get_current_user

router = APIRouter()


def _get_todo_or_404(db: Session, todo_id: int) -> Todo:
    todo = db.query(Todo).filter(Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo


def _ensure_todo_permission(todo: Todo, current_user):
    if todo.owner_id != current_user.id and current_user.role != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Permission denied for this todo")


@router.get("/", response_model=List[TodoResponse])
def list_todos(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(Todo)
    if current_user.role != UserRole.ADMIN.value:
        query = query.filter(Todo.owner_id == current_user.id)
    if start_date:
        query = query.filter(Todo.planned_date >= start_date)
    if end_date:
        query = query.filter(Todo.planned_date <= end_date)
    return query.order_by(Todo.planned_date.asc()).all()


@router.post("/", response_model=TodoResponse)
def create_todo(
    payload: TodoCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    todo = Todo(
        owner_id=current_user.id,
        title=payload.title,
        description=payload.description,
        planned_date=payload.planned_date,
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.post("/bulk", response_model=List[TodoResponse])
def create_todos_bulk(
    todos: List[TodoCreate],
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    todo_objects = [
        Todo(
            owner_id=current_user.id,
            title=item.title,
            description=item.description,
            planned_date=item.planned_date
        )
        for item in todos
    ]
    db.add_all(todo_objects)
    db.commit()
    for todo in todo_objects:
        db.refresh(todo)
    return todo_objects


@router.put("/{todo_id}", response_model=TodoResponse)
def update_todo(
    todo_id: int,
    payload: TodoUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    todo = _get_todo_or_404(db, todo_id)
    _ensure_todo_permission(todo, current_user)

    update_data = payload.dict(exclude_unset=True)
    if "is_done" in update_data:
        is_done = update_data["is_done"]
        todo.is_done = bool(is_done)
        todo.done_at = datetime.utcnow() if is_done else None
        update_data.pop("is_done")
    for field, value in update_data.items():
        setattr(todo, field, value)
    db.commit()
    db.refresh(todo)
    return todo


@router.post("/{todo_id}/toggle", response_model=TodoResponse)
def toggle_todo_done(
    todo_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    todo = _get_todo_or_404(db, todo_id)
    _ensure_todo_permission(todo, current_user)
    today = date.today()
    planned_day = todo.planned_date.date() if todo.planned_date else None
    if planned_day and planned_day != today:
        raise HTTPException(status_code=400, detail="Chỉ có thể đánh dấu done trong ngày đã lên kế hoạch")
    todo.is_done = not todo.is_done
    todo.done_at = datetime.utcnow() if todo.is_done else None
    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{todo_id}")
def delete_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    todo = _get_todo_or_404(db, todo_id)
    _ensure_todo_permission(todo, current_user)
    db.delete(todo)
    db.commit()
    return {"message": "Todo deleted"}

