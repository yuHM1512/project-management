from pydantic import BaseModel, EmailStr, field_serializer, model_validator
from typing import Optional, List
from datetime import datetime
from models import ProjectStatus, TaskStatus, TaskPriority, UserRole

# User Schemas
class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    department: Optional[str] = None
    team: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    department: Optional[str] = None
    team: Optional[str] = None
    role: Optional[str] = None


class UserMeUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    department: Optional[str] = None
    team: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class UserResponse(UserBase):
    id: int
    avatar_url: Optional[str] = None
    role: Optional[str] = None
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# Workspace Schemas
class WorkspaceBase(BaseModel):
    name: str
    description: Optional[str] = None

class WorkspaceCreate(WorkspaceBase):
    pass

class WorkspaceResponse(WorkspaceBase):
    id: int
    owner_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# Project Schemas
class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    status: Optional[str] = ProjectStatus.ACTIVE.value
    color: Optional[str] = "#6366f1"
    workspace_id: Optional[int] = None
    project_type_id: Optional[int] = None
    due_date: Optional[datetime] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    color: Optional[str] = None
    project_type_id: Optional[int] = None

class ProjectResponse(ProjectBase):
    id: int
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Task Schemas
class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = TaskStatus.TODO.value
    priority: Optional[str] = TaskPriority.MEDIUM.value
    assignee_ids: Optional[List[int]] = None  # Danh sách assignees
    due_date: Optional[datetime] = None
    tags: Optional[str] = None
    position: Optional[int] = 0


class SubTaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    attachment_url: Optional[str] = None
    is_done: bool = False
    work_log_id: Optional[int] = None


class SubTaskCreate(SubTaskBase):
    task_id: int


class SubTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    attachment_url: Optional[str] = None
    is_done: Optional[bool] = None
    work_log_id: Optional[int] = None


class SubTaskResponse(SubTaskBase):
    id: int
    task_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    work_log_id: Optional[int] = None

    class Config:
        from_attributes = True

class WorkLogBase(BaseModel):
    title: str
    content: Optional[str] = None
    project_id: Optional[int] = None
    task_id: Optional[int] = None
    subtask_id: Optional[int] = None
    attachments: Optional[List[dict]] = None


class WorkLogCreate(WorkLogBase):
    pass


class WorkLogUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    project_id: Optional[int] = None
    task_id: Optional[int] = None
    subtask_id: Optional[int] = None
    attachments: Optional[List[dict]] = None


class WorkLogResponse(WorkLogBase):
    id: int
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NoteBase(BaseModel):
    title: str
    note_date: Optional[datetime] = None
    content: Optional[str] = None
    project_id: Optional[int] = None
    task_id: Optional[int] = None
    work_log_id: Optional[int] = None


class NoteCreate(NoteBase):
    pass


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    note_date: Optional[datetime] = None
    content: Optional[str] = None
    project_id: Optional[int] = None
    task_id: Optional[int] = None
    work_log_id: Optional[int] = None


class NoteResponse(NoteBase):
    id: int
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TodoBase(BaseModel):
    title: str
    description: Optional[str] = None
    planned_date: datetime


class TodoCreate(TodoBase):
    pass


class TodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    planned_date: Optional[datetime] = None
    is_done: Optional[bool] = None


class TodoResponse(TodoBase):
    id: int
    owner_id: int
    is_done: bool
    done_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TaskCreate(TaskBase):
    project_id: int

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee_ids: Optional[List[int]] = None  # Danh sách assignees
    due_date: Optional[datetime] = None
    tags: Optional[str] = None
    position: Optional[int] = None

class TaskResponse(TaskBase):
    id: int
    project_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    subtasks: List[SubTaskResponse] = []
    progress_percent: float = 0.0
    completed_subtasks: int = 0
    total_subtasks: int = 0
    assignees: Optional[List[UserResponse]] = []  # Danh sách assignees với thông tin user
    
    @model_validator(mode='before')
    @classmethod
    def serialize_assignees(cls, data):
        """Serialize assignees từ SQLAlchemy relationship sang list UserResponse"""
        if isinstance(data, dict):
            return data
        
        # Nếu data là SQLAlchemy model instance
        if hasattr(data, 'assignees'):
            assignees_relationship = getattr(data, 'assignees', [])
            assignees_list = []
            for ta in assignees_relationship:
                if hasattr(ta, 'user') and ta.user:
                    user = ta.user
                    assignees_list.append({
                        'id': user.id,
                        'username': user.username,
                        'email': user.email,
                        'full_name': user.full_name,
                        'avatar_url': user.avatar_url,
                        'role': user.role,
                        'is_active': user.is_active,
                        'created_at': user.created_at,
                        'department': user.department,
                        'team': user.team
                    })
            # Tạo dict từ object để Pydantic có thể serialize
            if not isinstance(data, dict):
                data_dict = {
                    'id': data.id,
                    'title': data.title,
                    'description': data.description,
                    'status': data.status,
                    'priority': data.priority,
                    'due_date': data.due_date,
                    'tags': data.tags,
                    'position': data.position,
                    'project_id': data.project_id,
                    'created_at': data.created_at,
                    'updated_at': data.updated_at,
                    'subtasks': getattr(data, 'subtasks', []),
                    'progress_percent': getattr(data, 'progress_percent', 0.0),
                    'completed_subtasks': getattr(data, 'completed_subtasks', 0),
                    'total_subtasks': getattr(data, 'total_subtasks', 0),
                    'assignees': assignees_list
                }
                return data_dict
        return data
    
    class Config:
        from_attributes = True

# Team Member Schemas
class TeamMemberBase(BaseModel):
    role: Optional[str] = UserRole.MEMBER.value

class TeamMemberCreate(TeamMemberBase):
    user_id: int
    project_id: int

class TeamMemberResponse(TeamMemberBase):
    id: int
    project_id: int
    user_id: int
    joined_at: datetime
    
    class Config:
        from_attributes = True

# Dashboard Schemas
class DashboardStats(BaseModel):
    total_projects: int
    active_projects: int
    total_tasks: int
    tasks_by_status: dict
    tasks_by_priority: dict

# Task Move Schema
class TaskMove(BaseModel):
    new_status: str
    new_position: int

# Thread Schemas
class ThreadBase(BaseModel):
    content: str
    parent_id: Optional[int] = None

class ThreadCreate(ThreadBase):
    project_id: int

class ThreadUpdate(BaseModel):
    content: Optional[str] = None

class ThreadResponse(ThreadBase):
    id: int
    project_id: int
    user_id: int
    mentions: Optional[List[int]] = None  # List of user IDs được mention
    is_edited: bool
    is_deleted: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    user: Optional[UserResponse] = None  # Thông tin người gửi
    replies: List['ThreadResponse'] = []  # Danh sách replies
    
    class Config:
        from_attributes = True

# Update forward reference
ThreadResponse.model_rebuild()

# Task Comment Schemas
class TaskCommentBase(BaseModel):
    content: str
    attachment_url: Optional[str] = None

class TaskCommentCreate(TaskCommentBase):
    task_id: int

class TaskCommentUpdate(BaseModel):
    content: Optional[str] = None
    attachment_url: Optional[str] = None

class TaskCommentResponse(TaskCommentBase):
    id: int
    task_id: int
    user_id: int
    is_edited: bool
    is_deleted: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    user: Optional[UserResponse] = None  # Thông tin người comment
    
    class Config:
        from_attributes = True

# Activity Log Schemas
class ActivityLogResponse(BaseModel):
    id: int
    project_id: int
    user_id: int
    activity_type: str
    entity_type: str
    entity_id: int
    description: str
    metadata: Optional[dict] = None
    created_at: datetime
    user: Optional[UserResponse] = None  # Thông tin user thực hiện activity
    
    class Config:
        from_attributes = True


# Notifications
class NotificationBase(BaseModel):
    type: str
    title: str
    message: str
    project_id: Optional[int] = None
    task_id: Optional[int] = None
    thread_id: Optional[int] = None


class NotificationResponse(NotificationBase):
    id: int
    user_id: int
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

