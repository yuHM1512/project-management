import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models import Project, Thread, User
from routers.auth import get_current_user
from routers.notifications_helper import notify_mentioned_in_thread
from schemas import ThreadCreate, ThreadResponse, ThreadUpdate

router = APIRouter()
THREAD_UPLOAD_DIR = Path("static/uploads/threads")
THREAD_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def parse_mentions(content: str, project_id: int, db: Session) -> List[int]:
    """Parse mentions từ content (format: @username) và trả về list user IDs"""
    if not content:
        return []

    matches = re.findall(r"@([a-zA-Z0-9_]+)", content)
    if not matches:
        return []

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return []

    all_users = db.query(User).filter(User.is_active == True).all()
    mentioned_user_ids = []

    for mention_text in matches:
        mention_lower = mention_text.strip().lower()
        if not mention_lower:
            continue

        matched_user = next(
            (
                user
                for user in all_users
                if (user.username and user.username.lower() == mention_lower)
                or (user.full_name and user.full_name.lower() == mention_lower)
            ),
            None,
        )
        if matched_user and matched_user.id not in mentioned_user_ids:
            mentioned_user_ids.append(matched_user.id)

    return mentioned_user_ids


def _get_thread_or_404(db: Session, thread_id: int) -> Thread:
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


def _ensure_project_access(project: Project, user: User):
    if project.owner_id != user.id:
        return


def _enrich_thread(thread: Thread, db: Session) -> dict:
    thread_dict = {
        "id": thread.id,
        "project_id": thread.project_id,
        "user_id": thread.user_id,
        "content": thread.content if not thread.is_deleted else "[Message đã bị xóa]",
        "parent_id": thread.parent_id,
        "mentions": thread.mentions if thread.mentions else [],
        "is_edited": thread.is_edited,
        "is_deleted": thread.is_deleted,
        "created_at": thread.created_at,
        "updated_at": thread.updated_at,
        "user": {
            "id": thread.user.id,
            "username": thread.user.username,
            "email": thread.user.email,
            "full_name": thread.user.full_name,
            "avatar_url": thread.user.avatar_url,
        },
    }

    if thread.parent_id is None:
        replies = (
            db.query(Thread)
            .filter(
                Thread.parent_id == thread.id,
                Thread.is_deleted == False,
            )
            .order_by(Thread.created_at.asc())
            .all()
        )
        thread_dict["replies"] = [_enrich_thread(reply, db) for reply in replies]
    else:
        thread_dict["replies"] = []

    return thread_dict


@router.get("/", response_model=List[dict])
def get_threads(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy danh sách threads của một project"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    _ensure_project_access(project, current_user)

    threads = (
        db.query(Thread)
        .filter(
            Thread.project_id == project_id,
            Thread.parent_id == None,
            Thread.is_deleted == False,
        )
        .order_by(Thread.created_at.asc())
        .all()
    )

    return [_enrich_thread(thread, db) for thread in threads]


@router.post("/", response_model=dict)
def create_thread(
    thread: ThreadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Tạo thread mới"""
    project = db.query(Project).filter(Project.id == thread.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    _ensure_project_access(project, current_user)
    mentions = parse_mentions(thread.content, thread.project_id, db)

    db_thread = Thread(
        project_id=thread.project_id,
        user_id=current_user.id,
        content=thread.content,
        mentions=mentions if mentions else None,
        parent_id=thread.parent_id,
    )
    db.add(db_thread)
    db.flush()

    for mentioned_user_id in mentions:
        if mentioned_user_id == current_user.id:
            continue
        notify_mentioned_in_thread(
            db,
            db_thread.id,
            mentioned_user_id,
            current_user,
            thread.project_id,
            thread.content,
        )

    db.commit()
    db.refresh(db_thread)
    return _enrich_thread(db_thread, db)


@router.post("/upload")
async def upload_thread_attachment(
    project_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    _ensure_project_access(project, current_user)

    if not file:
        raise HTTPException(status_code=400, detail="File is required")

    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are supported")

    original_name = file.filename or "thread-image"
    extension = os.path.splitext(original_name)[1] or ".png"
    filename = f"thread_{project_id}_{uuid.uuid4().hex}{extension}"
    destination = THREAD_UPLOAD_DIR / filename

    content = await file.read()
    with destination.open("wb") as buffer:
        buffer.write(content)

    return {"url": f"/static/uploads/threads/{filename}"}


@router.put("/{thread_id}", response_model=dict)
def update_thread(
    thread_id: int,
    thread_update: ThreadUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cập nhật thread (chỉ người gửi mới được sửa)"""
    db_thread = _get_thread_or_404(db, thread_id)

    if db_thread.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own messages")

    if db_thread.is_deleted:
        raise HTTPException(status_code=400, detail="Cannot edit deleted message")

    if thread_update.content:
        db_thread.content = thread_update.content
        mentions = parse_mentions(thread_update.content, db_thread.project_id, db)
        old_mentions = db_thread.mentions or []
        db_thread.mentions = mentions if mentions else None
        db_thread.is_edited = True
        db_thread.updated_at = datetime.utcnow()

        new_mentions = [user_id for user_id in mentions if user_id not in old_mentions]
        for mentioned_user_id in new_mentions:
            if mentioned_user_id == current_user.id:
                continue
            notify_mentioned_in_thread(
                db,
                db_thread.id,
                mentioned_user_id,
                current_user,
                db_thread.project_id,
                thread_update.content,
            )

    db.commit()
    db.refresh(db_thread)
    return _enrich_thread(db_thread, db)


@router.delete("/{thread_id}")
def delete_thread(
    thread_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Xóa thread (soft delete)"""
    db_thread = _get_thread_or_404(db, thread_id)

    project = db.query(Project).filter(Project.id == db_thread.project_id).first()
    is_owner = project and project.owner_id == current_user.id
    is_author = db_thread.user_id == current_user.id

    if not (is_owner or is_author):
        raise HTTPException(status_code=403, detail="You can only delete your own messages or be project owner")

    db_thread.is_deleted = True
    db_thread.updated_at = datetime.utcnow()
    db.commit()

    return {"message": "Thread deleted successfully"}
