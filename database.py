import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

load_dotenv()

# Project Management Database (Shared Users)
SQLALCHEMY_DATABASE_URL = os.getenv(
    "SQLALCHEMY_DATABASE_URL",
    "",
)

# Internship App Database
INTERN_DATABASE_URL = os.getenv(
    "INTERN_DATABASE_URL",
    "",
)

main_connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}
intern_connect_args = {"check_same_thread": False} if INTERN_DATABASE_URL.startswith("sqlite") else {}

# Force UTF-8 client encoding for PostgreSQL to prevent mojibake
if SQLALCHEMY_DATABASE_URL.startswith("postgresql"):
    main_connect_args["options"] = "-c client_encoding=utf8"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=main_connect_args,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

intern_engine = create_engine(
    INTERN_DATABASE_URL,
    connect_args=intern_connect_args,
)
InternSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=intern_engine)

Base = declarative_base()
InternBase = declarative_base()


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_names(inspector, table_name: str) -> set[str]:
    if not _table_exists(inspector, table_name):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector, table_name: str) -> set[str]:
    if not _table_exists(inspector, table_name):
        return set()
    return {index["name"] for index in inspector.get_indexes(table_name)}


def _run_main_schema_sync():
    with engine.begin() as conn:
        dialect = conn.dialect.name
        inspector = inspect(conn)

        if _table_exists(inspector, "activity_logs"):
            activity_columns = _column_names(inspector, "activity_logs")
            if "metadata" in activity_columns and "activity_metadata" not in activity_columns:
                conn.execute(text("ALTER TABLE activity_logs RENAME COLUMN metadata TO activity_metadata"))

        if _table_exists(inspector, "users"):
            user_columns = _column_names(inspector, "users")
            json_type = "JSONB" if dialect == "postgresql" else "JSON"

            if "position" not in user_columns:
                conn.execute(text("ALTER TABLE users ADD COLUMN position VARCHAR(255)"))
            if "field" not in user_columns:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN field {json_type}"))
            if "chapter" not in user_columns:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN chapter {json_type}"))
            if "group" not in user_columns:
                conn.execute(text(f'ALTER TABLE users ADD COLUMN "group" {json_type}'))

            if dialect == "postgresql":
                conn.execute(text("""
                    UPDATE users
                    SET field = COALESCE(field, '[]'::jsonb),
                        chapter = COALESCE(chapter, '[]'::jsonb),
                        "group" = COALESCE("group", '[]'::jsonb)
                    WHERE field IS NULL OR chapter IS NULL OR "group" IS NULL
                """))
            else:
                conn.execute(text("""
                    UPDATE users
                    SET field = COALESCE(field, '[]'),
                        chapter = COALESCE(chapter, '[]'),
                        "group" = COALESCE("group", '[]')
                    WHERE field IS NULL OR chapter IS NULL OR "group" IS NULL
                """))

        if _table_exists(inspector, "project_types"):
            if dialect == "postgresql":
                conn.execute(text("""
                    INSERT INTO project_types (name, description)
                    VALUES
                        ('Company', 'Dự án cấp công ty'),
                        ('Administration Department', 'Dự án cấp phòng Hành chính'),
                        ('Trading Department', 'Dự án cấp phòng Kinh doanh')
                    ON CONFLICT (name) DO NOTHING
                """))
            else:
                conn.execute(text("""
                    INSERT OR IGNORE INTO project_types (name, description)
                    VALUES
                        ('Company', 'Dự án cấp công ty'),
                        ('Administration Department', 'Dự án cấp phòng Hành chính'),
                        ('Trading Department', 'Dự án cấp phòng Kinh doanh')
                """))

        inspector = inspect(conn)
        if _table_exists(inspector, "task_assignees"):
            task_assignee_indexes = _index_names(inspector, "task_assignees")
            if "idx_task_assignees_task_id" not in task_assignee_indexes:
                conn.execute(text("CREATE INDEX idx_task_assignees_task_id ON task_assignees(task_id)"))
            if "idx_task_assignees_user_id" not in task_assignee_indexes:
                conn.execute(text("CREATE INDEX idx_task_assignees_user_id ON task_assignees(user_id)"))
            if "idx_task_assignees_task_user" not in task_assignee_indexes:
                conn.execute(text("CREATE UNIQUE INDEX idx_task_assignees_task_user ON task_assignees(task_id, user_id)"))

            task_columns = _column_names(inspector, "tasks")
            if "assignee_id" in task_columns:
                conn.execute(text("""
                    INSERT INTO task_assignees (task_id, user_id, assigned_at)
                    SELECT t.id, t.assignee_id, COALESCE(t.created_at, CURRENT_TIMESTAMP)
                    FROM tasks t
                    WHERE t.assignee_id IS NOT NULL
                      AND NOT EXISTS (
                          SELECT 1
                          FROM task_assignees ta
                          WHERE ta.task_id = t.id AND ta.user_id = t.assignee_id
                      )
                """))

        inspector = inspect(conn)
        if _table_exists(inspector, "tasks"):
            task_columns = _column_names(inspector, "tasks")
            datetime_type = "TIMESTAMP WITH TIME ZONE" if dialect == "postgresql" else "DATETIME"
            if "frequency" not in task_columns:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN frequency VARCHAR(50)"))
            if "series_id" not in task_columns:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN series_id VARCHAR(64)"))
            if "period_start" not in task_columns:
                conn.execute(text(f"ALTER TABLE tasks ADD COLUMN period_start {datetime_type}"))
            if "period_end" not in task_columns:
                conn.execute(text(f"ALTER TABLE tasks ADD COLUMN period_end {datetime_type}"))
            if "repeat_until" not in task_columns:
                conn.execute(text(f"ALTER TABLE tasks ADD COLUMN repeat_until {datetime_type}"))
            if "task_type" not in task_columns:
                conn.execute(text("ALTER TABLE tasks ADD COLUMN task_type VARCHAR(20) DEFAULT 'recurring'"))

        inspector = inspect(conn)
        if _table_exists(inspector, "notifications"):
            notif_columns = _column_names(inspector, "notifications")
            if "session_id" not in notif_columns:
                conn.execute(text("ALTER TABLE notifications ADD COLUMN session_id INTEGER"))
            if "meeting_id" not in notif_columns:
                conn.execute(text("ALTER TABLE notifications ADD COLUMN meeting_id INTEGER"))

            notification_indexes = _index_names(inspector, "notifications")
            if "idx_notifications_user_id" not in notification_indexes:
                conn.execute(text("CREATE INDEX idx_notifications_user_id ON notifications(user_id)"))
            if "idx_notifications_is_read" not in notification_indexes:
                conn.execute(text("CREATE INDEX idx_notifications_is_read ON notifications(is_read)"))
            if "idx_notifications_created_at" not in notification_indexes:
                conn.execute(text("CREATE INDEX idx_notifications_created_at ON notifications(created_at)"))
            if "idx_notifications_user_created" not in notification_indexes:
                conn.execute(text("CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at)"))
            if dialect == "postgresql" and "idx_notifications_user_unread" not in notification_indexes:
                conn.execute(text("""
                    CREATE INDEX idx_notifications_user_unread
                    ON notifications(user_id, is_read)
                    WHERE is_read = FALSE
                """))

        inspector = inspect(conn)
        if _table_exists(inspector, "meeting_sessions"):
            session_cols = _column_names(inspector, "meeting_sessions")
            if "notified_open" not in session_cols:
                conn.execute(text("ALTER TABLE meeting_sessions ADD COLUMN notified_open BOOLEAN DEFAULT FALSE"))

        inspector = inspect(conn)
        if _table_exists(inspector, "projects"):
            project_columns = _column_names(inspector, "projects")
            if "objective_group" not in project_columns:
                conn.execute(text("ALTER TABLE projects ADD COLUMN objective_group VARCHAR(255)"))
            if "objective_description" not in project_columns:
                conn.execute(text("ALTER TABLE projects ADD COLUMN objective_description TEXT"))

            inspector = inspect(conn)
            project_indexes = _index_names(inspector, "projects")
            if "idx_projects_project_type_id" not in project_indexes:
                conn.execute(text("CREATE INDEX idx_projects_project_type_id ON projects(project_type_id)"))
            if "idx_projects_objective_group" not in project_indexes:
                conn.execute(text("CREATE INDEX idx_projects_objective_group ON projects(objective_group)"))


def _run_intern_schema_sync():
    with intern_engine.begin() as conn:
        inspector = inspect(conn)
        if _table_exists(inspector, "intern_personal"):
            intern_columns = _column_names(inspector, "intern_personal")
            if "gender" not in intern_columns:
                conn.execute(text("ALTER TABLE intern_personal ADD COLUMN gender VARCHAR"))


def get_db():
    """Dependency để lấy database session chính"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_intern_db():
    """Dependency để lấy database session của intern app"""
    db = InternSessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Khởi tạo database và đồng bộ non-destructive schema hiện tại"""
    import models  # noqa: F401
    import models_intern  # noqa: F401

    Base.metadata.create_all(bind=engine)
    InternBase.metadata.create_all(bind=intern_engine)
    _run_main_schema_sync()
    _run_intern_schema_sync()
