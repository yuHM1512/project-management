from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import re

from database import get_db
from models import Thread, Project, User
from schemas import ThreadCreate, ThreadUpdate, ThreadResponse, UserResponse
from routers.auth import get_current_user
from routers.notifications_helper import notify_mentioned_in_thread

router = APIRouter()


@router.get("/debug/parse-mentions")
def debug_parse_mentions(
    content: str,
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Debug endpoint để test parse mentions"""
    mentions = parse_mentions(content, project_id, db)
    
    # Lấy danh sách users để hiển thị
    all_users = db.query(User).filter(User.is_active == True).all()
    users_info = [
        {
            "id": u.id,
            "username": u.username,
            "full_name": u.full_name,
            "is_active": u.is_active
        }
        for u in all_users
    ]
    
    return {
        "content": content,
        "project_id": project_id,
        "parsed_mentions": mentions,
        "all_users": users_info,
        "matched_users": [
            {"id": u.id, "username": u.username, "full_name": u.full_name}
            for u in all_users if u.id in mentions
        ]
    }


def parse_mentions(content: str, project_id: int, db: Session) -> List[int]:
    """Parse mentions từ content (format: @username hoặc @full_name) và trả về list user IDs"""
    if not content:
        return []
    
    # DEBUG: Log input
    print(f"DEBUG parse_mentions: content='{content}', project_id={project_id}")
    
    # Tìm tất cả @mentions trong content
    # Pattern: @username (có thể có số, chữ, underscore) - KHÔNG có space sau @
    # Ví dụ: @L2006, @user123, @nguyen_van
    mentions_pattern = r'@([a-zA-Z0-9_]+)'
    matches = re.findall(mentions_pattern, content)
    
    print(f"DEBUG parse_mentions: regex matches={matches}")
    
    if not matches:
        print("DEBUG parse_mentions: No matches found")
        return []
    
    # Lấy danh sách users trong project (có thể mở rộng để lấy từ team members)
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        print(f"DEBUG parse_mentions: Project {project_id} not found")
        return []
    
    # Lấy tất cả users (có thể filter theo project team members sau)
    all_users = db.query(User).filter(User.is_active == True).all()
    print(f"DEBUG parse_mentions: Found {len(all_users)} active users")
    
    mentioned_user_ids = []
    for mention_text in matches:
        mention_text = mention_text.strip()
        if not mention_text:
            continue
        
        print(f"DEBUG parse_mentions: Processing mention_text='{mention_text}'")
            
        # Tìm user theo username hoặc full_name (case-insensitive)
        user = None
        mention_lower = mention_text.lower()
        
        for u in all_users:
            # Match username (exact match, case-insensitive)
            if u.username and u.username.lower() == mention_lower:
                user = u
                print(f"DEBUG parse_mentions: ✓ Matched username '{u.username}' (ID: {u.id})")
                break
            # Match full_name (exact match, case-insensitive)
            if u.full_name and u.full_name.lower() == mention_lower:
                user = u
                print(f"DEBUG parse_mentions: ✓ Matched full_name '{u.full_name}' (ID: {u.id})")
                break
        
        if user and user.id not in mentioned_user_ids:
            mentioned_user_ids.append(user.id)
            print(f"DEBUG parse_mentions: Added user_id {user.id} to mentions")
        # Debug: log nếu không tìm thấy user
        elif not user:
            print(f"WARNING: Could not find user for mention '@{mention_text}' in project {project_id}")
            print(f"  Available usernames: {[u.username for u in all_users if u.username]}")
            print(f"  Available full_names: {[u.full_name for u in all_users if u.full_name]}")
    
    print(f"DEBUG parse_mentions: Final result: {mentioned_user_ids}")
    return mentioned_user_ids


def _get_thread_or_404(db: Session, thread_id: int) -> Thread:
    thread = db.query(Thread).filter(Thread.id == thread_id).first()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


def _ensure_project_access(project: Project, user: User):
    """Kiểm tra user có quyền truy cập project không"""
    # Project owner hoặc member đều có thể xem threads
    if project.owner_id != user.id:
        # Có thể thêm logic kiểm tra team member ở đây nếu cần
        pass


def _enrich_thread(thread: Thread, db: Session) -> dict:
    """Enrich thread với thông tin user và replies"""
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
            "avatar_url": thread.user.avatar_url
        }
    }
    
    # Lấy replies (chỉ top-level messages có replies)
    if thread.parent_id is None:
        replies = db.query(Thread).filter(
            Thread.parent_id == thread.id,
            Thread.is_deleted == False
        ).order_by(Thread.created_at.asc()).all()
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
    
    # Lấy tất cả top-level messages (không có parent_id)
    threads = db.query(Thread).filter(
        Thread.project_id == project_id,
        Thread.parent_id == None,
        Thread.is_deleted == False
    ).order_by(Thread.created_at.asc()).all()
    
    # Enrich với user info và replies
    result = []
    for thread in threads:
        result.append(_enrich_thread(thread, db))
    
    return result


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
    
    # Parse mentions từ content
    mentions = parse_mentions(thread.content, thread.project_id, db)
    
    # DEBUG: Log chi tiết
    print("=" * 60)
    print("DEBUG CREATE THREAD - MENTIONS")
    print("=" * 60)
    print(f"Content: {thread.content}")
    print(f"Project ID: {thread.project_id}")
    print(f"Parsed mentions (raw): {mentions}")
    print(f"Parsed mentions type: {type(mentions)}")
    print(f"Parsed mentions length: {len(mentions) if mentions else 0}")
    if mentions:
        print(f"Parsed mentions values: {mentions}")
    else:
        print("WARNING: No mentions found!")
    print("=" * 60)
    
    db_thread = Thread(
        project_id=thread.project_id,
        user_id=current_user.id,
        content=thread.content,
        mentions=mentions if mentions else None,  # Lưu list [1, 2, 3] hoặc None
        parent_id=thread.parent_id
    )
    db.add(db_thread)
    db.flush()  # Flush để có db_thread.id nhưng chưa commit
    
    # Tạo notifications cho các users được mention TRƯỚC KHI commit thread
    print(f"DEBUG: Checking mentions for notifications: {mentions}")
    if mentions:
        print(f"DEBUG: Found {len(mentions)} mentions, creating notifications...")
        for mentioned_user_id in mentions:
            print(f"DEBUG: Processing mention for user_id: {mentioned_user_id}")
            if mentioned_user_id != current_user.id:  # Không tạo notification cho chính mình
                try:
                    print(f"DEBUG: Creating notification for user_id: {mentioned_user_id}")
                    notify_mentioned_in_thread(
                        db, db_thread.id, mentioned_user_id, current_user,
                        thread.project_id, thread.content
                    )
                    print(f"DEBUG: ✓ Notification created for user_id: {mentioned_user_id}")
                except Exception as e:
                    # Log lỗi nhưng không block việc tạo thread
                    print(f"ERROR: Error creating notification for mention: {e}")
                    import traceback
                    traceback.print_exc()
            else:
                print(f"DEBUG: Skipping notification for self (user_id: {mentioned_user_id})")
    else:
        print("DEBUG: No mentions found, skipping notifications")
    
    # Commit thread và notifications cùng lúc
    print(f"DEBUG: Committing thread and notifications...")
    db.commit()
    db.refresh(db_thread)
    
    # DEBUG: Kiểm tra sau khi commit
    print(f"DEBUG: After commit - Thread ID: {db_thread.id}")
    print(f"DEBUG: After commit - Mentions in DB: {db_thread.mentions}")
    print(f"DEBUG: After commit - Mentions type: {type(db_thread.mentions)}")
    
    # Kiểm tra notifications đã được tạo chưa
    from models import Notification
    created_notifications = db.query(Notification).filter(
        Notification.thread_id == db_thread.id,
        Notification.type == "mentioned"
    ).all()
    print(f"DEBUG: Created notifications count: {len(created_notifications)}")
    for notif in created_notifications:
        print(f"DEBUG:   - Notification ID: {notif.id}, User ID: {notif.user_id}")
    
    return _enrich_thread(db_thread, db)


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
        # Parse mentions mới từ content
        mentions = parse_mentions(thread_update.content, db_thread.project_id, db)
        old_mentions = db_thread.mentions or []
        db_thread.mentions = mentions if mentions else None
        db_thread.is_edited = True
        db_thread.updated_at = datetime.utcnow()
        
        # Tạo notifications cho các users được mention mới (chưa được mention trước đó)
        if mentions:
            new_mentions = [uid for uid in mentions if uid not in old_mentions]
            for mentioned_user_id in new_mentions:
                if mentioned_user_id != current_user.id:  # Không tạo notification cho chính mình
                    try:
                        notify_mentioned_in_thread(
                            db, db_thread.id, mentioned_user_id, current_user,
                            db_thread.project_id, thread_update.content
                        )
                    except Exception as e:
                        # Log lỗi nhưng không block việc update thread
                        print(f"Error creating notification for mention: {e}")
    
    db.commit()
    db.refresh(db_thread)
    
    return _enrich_thread(db_thread, db)


@router.delete("/{thread_id}")
def delete_thread(
    thread_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Xóa thread (soft delete) - người gửi hoặc project owner"""
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

