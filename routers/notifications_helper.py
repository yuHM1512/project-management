"""
Helper functions để tạo notifications tự động khi có events
"""
from sqlalchemy.orm import Session
from models import Notification, Task, User, TaskAssignee, Project
from typing import List, Optional
from datetime import datetime


def create_notification(
    db: Session,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    project_id: Optional[int] = None,
    task_id: Optional[int] = None,
    thread_id: Optional[int] = None,
    activity_id: Optional[int] = None
):
    """Tạo một notification cho user"""
    notification = Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        message=message,
        project_id=project_id,
        task_id=task_id,
        thread_id=thread_id,
        activity_id=activity_id
    )
    db.add(notification)
    return notification


def notify_task_assigned(
    db: Session,
    task: Task,
    assignee_ids: List[int],
    assigned_by_user: User
):
    """Tạo notifications khi task được assign cho users"""
    project = task.project
    assigner_name = assigned_by_user.full_name or assigned_by_user.username
    
    for user_id in assignee_ids:
        if user_id != assigned_by_user.id:  # Không tạo notification cho người assign
            create_notification(
                db=db,
                user_id=user_id,
                notification_type="task_assigned",
                title="Task được giao cho bạn",
                message=f"{assigner_name} đã giao task '{task.title}' cho bạn trong project '{project.name}'",
                project_id=project.id,
                task_id=task.id
            )
    db.commit()


def notify_task_updated(
    db: Session,
    task: Task,
    updated_by_user: User,
    update_description: str
):
    """Tạo notifications khi task được update bởi một assignee (cho các assignees khác)"""
    project = task.project
    updater_name = updated_by_user.full_name or updated_by_user.username
    
    # Lấy danh sách assignees của task
    assignees = db.query(TaskAssignee).filter(TaskAssignee.task_id == task.id).all()
    
    for assignee in assignees:
        if assignee.user_id != updated_by_user.id:  # Không tạo notification cho người update
            create_notification(
                db=db,
                user_id=assignee.user_id,
                notification_type="task_updated",
                title="Task được cập nhật",
                message=f"{updater_name} đã {update_description} trong task '{task.title}' của project '{project.name}'",
                project_id=project.id,
                task_id=task.id
            )
    db.commit()


def notify_mentioned_in_thread(
    db: Session,
    thread_id: int,
    mentioned_user_id: int,
    mentioned_by_user: User,
    project_id: int,
    thread_content: str
):
    """Tạo notification khi user được mention trong thread"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return
    
    mentioner_name = mentioned_by_user.full_name or mentioned_by_user.username
    
    # Tạo notification (KHÔNG commit ở đây, để commit cùng với thread)
    create_notification(
        db=db,
        user_id=mentioned_user_id,
        notification_type="mentioned",
        title="Bạn được mention trong thread",
        message=f"{mentioner_name} đã mention bạn trong thread của project '{project.name}'",
        project_id=project_id,
        thread_id=thread_id
    )
    # KHÔNG commit ở đây - để caller commit


def notify_deadline_reminder(
    db: Session,
    task: Task
):
    """Tạo notification khi deadline của task đến (hôm nay)"""
    project = task.project
    
    # Lấy danh sách assignees của task
    assignees = db.query(TaskAssignee).filter(TaskAssignee.task_id == task.id).all()
    
    due_date_str = task.due_date.strftime('%d/%m/%Y') if task.due_date else ''
    
    for assignee in assignees:
        create_notification(
            db=db,
            user_id=assignee.user_id,
            notification_type="deadline_reminder",
            title="Deadline task hôm nay",
            message=f"Task '{task.title}' trong project '{project.name}' có deadline hôm nay ({due_date_str})",
            project_id=project.id,
            task_id=task.id
        )
    db.commit()

