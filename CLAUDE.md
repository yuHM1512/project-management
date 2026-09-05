# Project Management — Nội bộ doanh nghiệp sản xuất

## Tổng quan

Tool quản lý dự án nội bộ cho doanh nghiệp sản xuất. SPA monolithic: FastAPI backend serve một `index.html` duy nhất, client-side routing bằng vanilla JS.

## Tech Stack

- **Backend**: FastAPI 0.104.1, Python 3.12
- **Database**: PostgreSQL (2 DB: `project_management` + `internship`), SQLAlchemy 2.0 ORM
- **Frontend**: Vanilla JS (`static/js/app.v2.js` — ~9200 dòng, 420+ functions), Tailwind CSS (`static/css/style.css` — ~11000 dòng)
- **Template**: Jinja2 (chỉ dùng cho shell HTML, không server-side rendering)
- **Auth**: JWT (python-jose) + bcrypt, token lưu httponly cookie
- **Server**: Uvicorn, port 8004

## Cấu trúc thư mục

```
├── main.py                 # FastAPI app, mount routers, catch-all SPA route
├── database.py             # Engine, SessionLocal, init_db() + schema sync thủ công
├── models.py               # SQLAlchemy models (main DB)
├── models_intern.py        # SQLAlchemy models (internship DB)
├── schemas.py              # Pydantic request/response schemas
├── routers/                # API endpoints
│   ├── auth.py             # JWT login/register, get_current_user
│   ├── projects.py         # CRUD dự án
│   ├── tasks.py            # CRUD task + recurring task logic (646 dòng)
│   ├── subtasks.py         # Subtask CRUD
│   ├── teams.py            # Team member management
│   ├── threads.py          # Discussion threads trong project
│   ├── comments.py         # Task comments
│   ├── activities.py       # Activity log
│   ├── worklogs.py         # Work log entries
│   ├── notifications.py    # Notification CRUD + polling
│   ├── notifications_helper.py  # Helper tạo notification
│   ├── meetings.py         # 1-1 meeting review
│   ├── periodic_meetings.py # Họp định kỳ + sessions + agenda (554 dòng)
│   ├── recurring_tasks.py  # Template công việc định kỳ
│   ├── mtcl.py             # Mục tiêu chất lượng
│   ├── users.py            # User management (admin)
│   ├── intern.py           # Intern module (DB riêng)
│   ├── mes.py              # MES roadmap data
│   ├── notes.py            # Personal notes (disabled)
│   └── todos.py            # Personal todos (disabled)
├── static/
│   ├── js/                  # Frontend JS modules (tách từ app.v2.js)
│   │   ├── utils.js         # Shared helpers (toast, API, formatting)
│   │   ├── app.js           # Core: routing, auth, sidebar, global state
│   │   ├── dashboard.js     # Dashboard view, stats, calendar
│   │   ├── projects.js      # Project CRUD, modal, members, objectives
│   │   ├── kanban.js        # Board views, drag & drop, task cards
│   │   ├── tasks.js         # Task CRUD, detail modal, subtasks
│   │   ├── timeline.js      # Gantt chart, timeline views
│   │   ├── meetings.js      # 1-1 meeting review
│   │   ├── periodic-meetings.js  # Periodic meetings, sessions, agenda
│   │   ├── notifications.js # Notification polling & rendering
│   │   ├── threads.js       # Discussion threads, comments, mentions
│   │   ├── activities.js    # Activity log, polling
│   │   ├── settings.js      # User management, MTCL, account
│   │   ├── worklogs.js      # Work log CRUD, attachments
│   │   ├── personal.js      # Notes, todos (personal section)
│   │   ├── recurring-tasks.js # Recurring task templates, matrix
│   │   └── app.v2.js        # [DEPRECATED] Monolithic file — giữ để backup
│   └── css/style.css        # Tailwind + custom CSS
├── templates/
│   ├── index.html          # SPA shell (1917 dòng)
│   ├── login.html          # Login page
│   ├── mes.html            # MES page
│   └── intern/             # Intern sub-app templates
└── design/                 # Design mockups (HTML + screenshots)
```

## Data Model

### Core entities
- **User**: username, email, role (admin/member/viewer), department, team, position, field/chapter/group (JSON)
- **Project**: name, status (active/completed/archived), project_type, objective_group (MTCL), color
- **Task**: title, description, status (todo/in_progress/done/blocked), priority (low/medium/high/urgent), task_type (recurring/one_time), frequency, series_id, period_start/end
- **TaskAssignee**: Many-to-many Task↔User
- **SubTask**: Checklist items trong task, link tới WorkLog
- **Thread**: Discussion trong project, threaded replies, mentions
- **TaskComment**: Comments trên task
- **WorkLog**: Nhật ký công việc
- **Notification**: In-app notifications
- **ActivityLog**: Audit trail

### Domain-specific
- **Mtcl**: Mục tiêu chất lượng (objective_group + units + description)
- **Meeting**: 1-1 review meeting (creator ↔ employee)
- **PeriodicMeeting → MeetingSession → MeetingAgendaItem**: Họp định kỳ với sessions tự động
- **RecurringTaskTemplate**: Template task lặp lại theo user
- **MESKPI, MESMapNode, MESModuleDetail**: Dữ liệu MES roadmap
- **ProjectType**: Phân loại dự án (Công ty, Phòng Tổng hợp, Phòng KDXNK, Phòng QLCL)

### Intern DB (riêng biệt)
- **InternProfile, Resource, DailyLog, Roadmap, QAPost, QAReply**

## API Conventions

- Prefix: `/api/<resource>` (tasks, projects, users, etc.)
- Auth: `Depends(get_current_user)` cho protected routes, `require_admin` cho admin-only
- Response: Pydantic models with `from_attributes = True`
- Intern routes: `/intern/...` (không có `/api` prefix)
- Periodic meetings: `/api/periodic-meetings/...`
- MES: `/api/mes/...`

## Database Migration

**KHÔNG dùng Alembic.** Schema sync thủ công trong `database.py`:
- `_run_main_schema_sync()`: ALTER TABLE thêm cột mới, CREATE INDEX, seed project_types
- `_run_intern_schema_sync()`: Thêm cột gender cho intern
- `init_db()` chạy mỗi lần app start: `create_all()` + schema sync

Khi thêm cột mới: thêm vào model + thêm ALTER TABLE idempotent vào `_run_main_schema_sync()`.

## Frontend Architecture

SPA 16 file JS modules (tách từ monolithic `app.v2.js`):
- **Load order quan trọng**: utils → app (core) → feature modules. Thứ tự trong `index.html`.
- Client-side routing: `getRouteFromURL()`, `updateURL()`, `navigateToRoute()` (trong `app.js`)
- Tất cả functions ở global scope — không dùng ES modules/bundler
- Views: dashboard, projects, kanban board, task detail, meetings, settings, personal
- Fetch API cho mọi request qua `apiCall()` wrapper (trong `utils.js`)
- Cache busting: server hash mtime mỗi file → query param `?v=<hash>`
- Auto version check: combined hash tất cả JS files, polling `/api/version/js` mỗi 5 phút

## Chạy project

```bash
# Cài dependencies
pip install -r requirements.txt

# Cấu hình .env
SQLALCHEMY_DATABASE_URL=postgresql://user:pass@localhost:5432/project_management
INTERN_DATABASE_URL=postgresql://user:pass@localhost:5432/internship

# Chạy
python main.py
# hoặc
uvicorn main:app --host 0.0.0.0 --port 8004 --reload
```

## Lưu ý khi phát triển

1. **Schema changes**: Thêm cột vào model → thêm ALTER TABLE idempotent vào `database.py` `_run_main_schema_sync()`. Check dialect (postgresql vs sqlite).
2. **Frontend**: JS đã tách module theo feature. Sửa function nào thì vào file tương ứng. Thêm feature mới → tạo file mới hoặc thêm vào module phù hợp + cập nhật `index.html` script tags và `JS_MODULE_FILES` trong `main.py`.
3. **Auth flow**: Login → JWT cookie → `get_current_user` dependency. Cookie-based auth cho page routes via `get_current_user_from_cookie`.
4. **Recurring tasks**: Logic phức tạp trong `routers/tasks.py` — frequency-based period calculation, series_id grouping.
5. **Notifications**: Tạo qua helper functions trong `notifications_helper.py`, poll từ client.
6. **2 databases**: Main DB qua `get_db()`, Intern DB qua `get_intern_db()`. Không mix sessions.
7. **Notes/Todos routers**: Đã disabled (commented out trong main.py) — personal scope không phù hợp team app.

## Known Issues

- Không có test suite
- Không có CORS middleware (chỉ dùng same-origin)
- `app.v2.js` vẫn tồn tại (backup) — có thể xóa sau khi xác nhận modules hoạt động ổn
