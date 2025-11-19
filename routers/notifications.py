from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime, date, timedelta

from database import get_db
from models import Notification, User, Task, TaskAssignee
from schemas import NotificationResponse
from routers.auth import get_current_user
from routers.notifications_helper import notify_deadline_reminder

router = APIRouter()


@router.get("/", response_model=List[NotificationResponse])
def get_notifications(
    skip: int = 0,
    limit: int = 50,
    unread_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy danh sách notifications của user hiện tại"""
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    
    if unread_only:
        query = query.filter(Notification.is_read == False)
    
    notifications = query.order_by(Notification.created_at.desc()).offset(skip).limit(limit).all()
    return notifications


@router.get("/unread-count", response_model=dict)
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy số lượng notifications chưa đọc"""
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).count()
    return {"count": count}


@router.put("/{notification_id}/read")
def mark_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Đánh dấu notification là đã đọc"""
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = True
    notification.read_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Notification marked as read"}


@router.put("/read-all")
def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Đánh dấu tất cả notifications là đã đọc"""
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.is_read == False
    ).update({
        "is_read": True,
        "read_at": datetime.utcnow()
    })
    db.commit()
    
    return {"message": "All notifications marked as read"}


@router.post("/check-deadlines")
def check_deadlines(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Kiểm tra và tạo notifications cho các tasks có deadline hôm nay
    Endpoint này có thể được gọi bởi cron job hoặc scheduled task
    """
    from models import UserRole
    
    # Chỉ admin mới có thể gọi endpoint này (hoặc có thể bỏ qua authentication cho cron job)
    if current_user.role != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Only admin can trigger deadline checks")
    
    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end = datetime.combine(today, datetime.max.time())
    
    # Lấy tất cả tasks có deadline hôm nay
    tasks = db.query(Task).options(
        joinedload(Task.assignees).joinedload(TaskAssignee.user),
        joinedload(Task.project)
    ).filter(
        Task.due_date.isnot(None),
        Task.due_date >= today_start,
        Task.due_date < today_end + timedelta(days=1)
    ).all()
    
    notified_count = 0
    for task in tasks:
        # Kiểm tra xem đã có notification deadline cho task này hôm nay chưa
        existing_notification = db.query(Notification).filter(
            Notification.task_id == task.id,
            Notification.type == "deadline_reminder",
            Notification.created_at >= today_start,
            Notification.created_at < today_end + timedelta(days=1)
        ).first()
        
        if not existing_notification:
            notify_deadline_reminder(db, task)
            notified_count += 1
    
    return {
        "message": f"Checked {len(tasks)} tasks with deadline today",
        "notifications_created": notified_count
    }

