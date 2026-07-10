from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum, JSON, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum
import os

class ProjectStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class ProjectType(Base):
    __tablename__ = "project_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    projects = relationship("Project", back_populates="project_type")

class TaskStatus(str, enum.Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    BLOCKED = "blocked"

class TaskPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String)
    avatar_url = Column(String, nullable=True)
    role = Column(String, default=UserRole.MEMBER.value)  # admin, member, viewer
    department = Column(String, nullable=True)
    team = Column(String, nullable=True)
    position = Column(String, nullable=True)
    field = Column(JSON, nullable=True)
    chapter = Column(JSON, nullable=True)
    group = Column("group", JSON, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    projects = relationship("Project", back_populates="owner")
    task_assignees = relationship("TaskAssignee", back_populates="user")
    team_memberships = relationship("TeamMember", back_populates="user")
    threads = relationship("Thread", back_populates="user")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    task_comments = relationship("TaskComment", back_populates="user")
    activity_logs = relationship("ActivityLog", back_populates="user")
    work_logs = relationship("WorkLog", back_populates="owner", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="owner", cascade="all, delete-orphan")
    meetings_created = relationship("Meeting", foreign_keys="Meeting.creator_id", cascade="all, delete-orphan")
    meetings_as_employee = relationship("Meeting", foreign_keys="Meeting.employee_id", cascade="all, delete-orphan")
    recurring_task_templates = relationship("RecurringTaskTemplate", back_populates="user", cascade="all, delete-orphan")


class Mtcl(Base):
    __tablename__ = "mtcl"

    id = Column(Integer, primary_key=True, index=True)
    objective_group = Column(String(255), nullable=False, index=True)
    units = Column(JSON, nullable=False, default=list)
    description = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    projects = relationship("Project", back_populates="workspace")

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, nullable=True)
    objective_group = Column(String(255), nullable=True, index=True)
    objective_description = Column(Text, nullable=True)
    status = Column(String, default=ProjectStatus.ACTIVE.value)
    color = Column(String, default="#6366f1")  # Màu sắc cho project
    owner_id = Column(Integer, ForeignKey("users.id"))
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    project_type_id = Column(Integer, ForeignKey("project_types.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    due_date = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    owner = relationship("User", back_populates="projects")
    project_type = relationship("ProjectType", back_populates="projects")
    workspace = relationship("Workspace", back_populates="projects")
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")
    team_members = relationship("TeamMember", back_populates="project")
    threads = relationship("Thread", back_populates="project", cascade="all, delete-orphan")
    activity_logs = relationship("ActivityLog", back_populates="project", cascade="all, delete-orphan")
    work_logs = relationship("WorkLog", back_populates="project", cascade="all, delete-orphan")
    notes = relationship("Note", back_populates="project", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="project", cascade="all, delete-orphan")

class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    role = Column(String, default=UserRole.MEMBER.value)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    project = relationship("Project", back_populates="team_members")
    user = relationship("User", back_populates="team_memberships")

class TaskAssignee(Base):
    __tablename__ = "task_assignees"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    assigned_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    task = relationship("Task", back_populates="assignees")
    user = relationship("User", back_populates="task_assignees")

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    status = Column(String, default=TaskStatus.TODO.value)
    priority = Column(String, default=TaskPriority.MEDIUM.value)
    project_id = Column(Integer, ForeignKey("projects.id"))
    task_type = Column(String(20), nullable=True, default="recurring")  # "recurring" | "one_time"
    frequency = Column(String, nullable=True)
    series_id = Column(String(64), nullable=True, index=True)
    period_start = Column(DateTime(timezone=True), nullable=True)
    period_end = Column(DateTime(timezone=True), nullable=True)
    repeat_until = Column(DateTime(timezone=True), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    tags = Column(String, nullable=True)  # Comma-separated tags
    position = Column(Integer, default=0)  # Vị trí trong board
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    project = relationship("Project", back_populates="tasks")
    assignees = relationship("TaskAssignee", back_populates="task", cascade="all, delete-orphan")
    subtasks = relationship("SubTask", back_populates="task", cascade="all, delete-orphan")
    comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan")
    work_logs = relationship("WorkLog", back_populates="task", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="task", cascade="all, delete-orphan")


class SubTask(Base):
    __tablename__ = "subtasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"))
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    attachment_url = Column(String, nullable=True)
    is_done = Column(Boolean, default=False)
    work_log_id = Column(Integer, ForeignKey("work_logs.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    task = relationship("Task", back_populates="subtasks")
    work_log = relationship(
        "WorkLog",
        primaryjoin="SubTask.work_log_id == WorkLog.id",
        foreign_keys=[work_log_id],
        uselist=False
    )


class Thread(Base):
    __tablename__ = "threads"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    mentions = Column(JSON, nullable=True)  # Array of user IDs được mention: [1, 2, 3]
    parent_id = Column(Integer, ForeignKey("threads.id", ondelete="CASCADE"), nullable=True)  # Cho reply/threading
    is_edited = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)  # Soft delete
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    project = relationship("Project", back_populates="threads")
    user = relationship("User", back_populates="threads")
    notifications = relationship("Notification", back_populates="thread", cascade="all, delete-orphan")
    parent = relationship("Thread", remote_side=[id], backref="replies")


class TaskComment(Base):
    __tablename__ = "task_comments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    attachment_url = Column(String, nullable=True)  # URL của file/image đính kèm
    is_edited = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)  # Soft delete
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    task = relationship("Task", back_populates="comments")
    user = relationship("User", back_populates="task_comments")


class WorkLog(Base):
    __tablename__ = "work_logs"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    subtask_id = Column(Integer, ForeignKey("subtasks.id"), nullable=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    attachments = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User", back_populates="work_logs")
    project = relationship("Project", back_populates="work_logs")
    task = relationship("Task", back_populates="work_logs")
    subtask = relationship(
        "SubTask",
        primaryjoin="WorkLog.subtask_id == SubTask.id",
        foreign_keys=[subtask_id],
        uselist=False
    )
    notes = relationship("Note", back_populates="work_log")


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    work_log_id = Column(Integer, ForeignKey("work_logs.id"), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    title = Column(String, nullable=False)
    note_date = Column(DateTime(timezone=True), nullable=True)
    content = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User", back_populates="notes")
    work_log = relationship("WorkLog", back_populates="notes")
    project = relationship("Project", back_populates="notes")
    task = relationship("Task")


class Todo(Base):
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    planned_date = Column(DateTime(timezone=True), nullable=False)
    is_done = Column(Boolean, default=False)
    done_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    activity_type = Column(String, nullable=False)  # task_created, task_updated, task_status_changed, task_completed, task_assigned, comment_added, subtask_completed
    entity_type = Column(String, nullable=False)  # task, comment, subtask
    entity_id = Column(Integer, nullable=False)  # ID của task/comment/subtask
    description = Column(Text, nullable=False)  # Mô tả activity: "User A đã tạo task 'X'"
    activity_metadata = Column(JSON, nullable=True)  # Thông tin bổ sung
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    project = relationship("Project", back_populates="activity_logs")
    user = relationship("User", back_populates="activity_logs")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, nullable=False)  # task_assigned, mentioned, task_updated, deadline_reminder
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime(timezone=True), nullable=True)

    # Metadata để link đến object liên quan
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    thread_id = Column(Integer, ForeignKey("threads.id", ondelete="CASCADE"), nullable=True)
    activity_id = Column(Integer, ForeignKey("activity_logs.id", ondelete="SET NULL"), nullable=True)
    session_id = Column(Integer, nullable=True)   # for meeting_session_open
    meeting_id = Column(Integer, nullable=True)   # for meeting_session_open

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="notifications")
    project = relationship("Project", back_populates="notifications")
    task = relationship("Task", back_populates="notifications")
    thread = relationship("Thread", back_populates="notifications")


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, index=True)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # Admin tạo cuộc họp
    employee_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # Nhân viên được review
    time = Column(DateTime(timezone=True), nullable=False)
    location = Column(String, nullable=False, default="Phòng họp")
    department = Column(String, nullable=True)  # Đơn vị
    team = Column(String, nullable=True)  # Bộ phận
    contents = Column(JSON, nullable=True)  # List các content types: ["kpi", "strengths", ...]
    content_data = Column(JSON, nullable=True)  # Dict chứa nội dung chi tiết: {"kpi": "<html>", "strengths": "<html>", ...}
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    creator = relationship("User", foreign_keys=[creator_id], back_populates="meetings_created")
    employee = relationship("User", foreign_keys=[employee_id], back_populates="meetings_as_employee")


class RecurringTaskTemplate(Base):
    __tablename__ = "recurring_task_templates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    frequency = Column(String(50), nullable=False)  # weekly, monthly, quarterly, semi_annual, annual, ad_hoc
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="recurring_task_templates")


class MESKPI(Base):
    __tablename__ = "mes_kpis"

    id = Column(Integer, primary_key=True, index=True)
    icon = Column(String(50), nullable=False)
    title = Column(String(100), nullable=False)
    value = Column(String(50), nullable=False)
    impact_label = Column(String(50), nullable=True)
    impact_color = Column(String(50), nullable=True)
    order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class MESMapNode(Base):
    __tablename__ = "mes_map_nodes"

    id = Column(Integer, primary_key=True, index=True)
    pillar = Column(Integer, nullable=False)
    title = Column(String(100), nullable=False)
    subtitle = Column(String(100), nullable=True)
    description = Column(Text, nullable=True)
    icon = Column(String(50), nullable=True)
    color = Column(String(50), nullable=True)
    status = Column(String(50), nullable=True)
    status_color = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True)
    order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class MESModuleDetail(Base):
    __tablename__ = "mes_module_details"

    id = Column(Integer, primary_key=True, index=True)
    pillar = Column(Integer, nullable=False)
    step_number = Column(String(20), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    icon = Column(String(50), nullable=True)
    order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# ── Recurring Meeting Models ──────────────────────────────────────────────────

class PeriodicMeeting(Base):
    """Định nghĩa cuộc họp định kỳ (template)."""
    __tablename__ = "periodic_meetings"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    frequency = Column(String(20), nullable=False)   # weekly / monthly / quarterly
    day_of_week = Column(Integer, nullable=True)     # 0=Mon..6=Sun  (weekly)
    day_of_month = Column(Integer, nullable=True)    # 1-28           (monthly / quarterly)
    month_of_quarter = Column(Integer, nullable=True) # 1,2,3 = tháng đầu mỗi quý (quarterly)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    description = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    creator = relationship("User", foreign_keys=[created_by])
    participants = relationship("PeriodicMeetingParticipant", back_populates="meeting",
                                cascade="all, delete-orphan")
    sessions = relationship("MeetingSession", back_populates="meeting",
                            order_by="MeetingSession.session_date",
                            cascade="all, delete-orphan")


class PeriodicMeetingParticipant(Base):
    __tablename__ = "periodic_meeting_participants"

    id = Column(Integer, primary_key=True)
    meeting_id = Column(Integer, ForeignKey("periodic_meetings.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    role = Column(String(20), default="participant")  # organizer / participant

    meeting = relationship("PeriodicMeeting", back_populates="participants")
    user = relationship("User")


class MeetingSession(Base):
    """Một phiên họp cụ thể được tạo tự động theo chu kỳ."""
    __tablename__ = "meeting_sessions"

    id = Column(Integer, primary_key=True, index=True)
    meeting_id = Column(Integer, ForeignKey("periodic_meetings.id", ondelete="CASCADE"))
    session_date = Column(Date, nullable=False)      # ngày họp thực tế
    opens_at = Column(DateTime(timezone=True), nullable=False)  # khi block mở ra
    title = Column(String(300), nullable=False)      # e.g. "Tuần 28 – 07/07/2026"
    notes = Column(Text, nullable=True)              # ghi chú tổng hợp sau họp
    notified_open = Column(Boolean, default=False)   # đã gửi thông báo mở phiên chưa
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    meeting = relationship("PeriodicMeeting", back_populates="sessions")
    agenda_items = relationship("MeetingAgendaItem", back_populates="session",
                                order_by="MeetingAgendaItem.created_at",
                                cascade="all, delete-orphan")


class MeetingAgendaItem(Base):
    """Nội dung từng thành viên chuẩn bị trước phiên họp."""
    __tablename__ = "meeting_agenda_items"

    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("meeting_sessions.id", ondelete="CASCADE"))
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    content = Column(Text, nullable=False)
    item_type = Column(String(20), default="update")  # update / issue / plan
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    session = relationship("MeetingSession", back_populates="agenda_items")
    user = relationship("User")
