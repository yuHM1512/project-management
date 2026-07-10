from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from database import init_db, get_db
from sqlalchemy.orm import Session
from routers import projects, tasks, teams, auth, users, subtasks, threads, comments, activities, worklogs, notifications, meetings, mtcl, recurring_tasks
# notes, todos hidden (personal scope — team-level app)
from routers import periodic_meetings
from routers.auth import get_current_user_from_cookie
from models import WorkLog
import uvicorn
import os
import hashlib
from pathlib import Path

app = FastAPI(title="Project Management", version="1.0.0")

# Khởi tạo database
init_db()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/assets", StaticFiles(directory="templates"), name="assets")

# Templates
templates = Jinja2Templates(directory="templates")

def no_store_template(template_name: str, context: dict):
    response = templates.TemplateResponse(template_name, context)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response

def get_file_version(file_path: str) -> str:
    """Tạo version hash dựa trên thời gian sửa đổi file để cache busting"""
    try:
        # Đảm bảo đường dẫn đúng từ root của project
        full_path = Path(file_path)
        if not full_path.is_absolute():
            # Nếu là relative path, tìm từ root của project
            full_path = Path(__file__).parent / file_path

        if full_path.exists():
            # Lấy thời gian sửa đổi và kích thước file
            stat = full_path.stat()
            # Tạo hash từ mtime và size
            version_str = f"{stat.st_mtime}_{stat.st_size}"
            return hashlib.md5(version_str.encode()).hexdigest()[:8]
    except Exception as e:
        # Log error trong development
        import logging
        logging.warning(f"Could not get version for {file_path}: {e}")
    return "v1"

# Thêm hàm vào template context
templates.env.globals['get_file_version'] = get_file_version

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(mtcl.router, prefix="/api/mtcl", tags=["mtcl"])
app.include_router(recurring_tasks.router, prefix="/api/recurring-tasks", tags=["recurring-tasks"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(teams.router, prefix="/api/teams", tags=["teams"])
app.include_router(subtasks.router, prefix="/api/subtasks", tags=["subtasks"])
app.include_router(threads.router, prefix="/api/threads", tags=["threads"])
app.include_router(comments.router, prefix="/api/comments", tags=["comments"])
app.include_router(activities.router, prefix="/api/activities", tags=["activities"])
app.include_router(worklogs.router, prefix="/api/work-logs", tags=["worklogs"])
# app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
# app.include_router(todos.router, prefix="/api/todos", tags=["todos"])
app.include_router(meetings.router, prefix="/api/meetings", tags=["meetings"])
app.include_router(periodic_meetings.router, prefix="/api", tags=["periodic-meetings"])
from routers import intern, mes
app.include_router(intern.router, prefix="/intern", tags=["intern"])
app.include_router(mes.router)

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Trang chủ"""
    return no_store_template("index.html", {"request": request})


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """Trang đăng nhập"""
    return no_store_template("login.html", {"request": request})


@app.get("/mes", response_class=HTMLResponse)
async def mes_page(request: Request, db: Session = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not user:
        return RedirectResponse(url="/login?next=/mes")
    return templates.TemplateResponse("mes.html", {"request": request, "user": user})


@app.get("/mes-update", response_class=HTMLResponse)
async def mes_update_page(request: Request, db: Session = Depends(get_db)):
    user = await get_current_user_from_cookie(request, db)
    if not user:
        return RedirectResponse(url="/login?next=/mes-update")

    from models import UserRole
    if user.role != UserRole.ADMIN.value:
        return RedirectResponse(url="/mes")

    return templates.TemplateResponse("mes_update.html", {"request": request, "user": user})


@app.get("/worklogs/{worklog_id}", response_class=HTMLResponse)
async def worklog_detail(worklog_id: int, request: Request, db: Session = Depends(get_db)):
    worklog = db.query(WorkLog).filter(WorkLog.id == worklog_id).first()
    if not worklog:
        raise HTTPException(status_code=404, detail="Work log not found")
    return templates.TemplateResponse(
        "worklog_detail.html",
        {
            "request": request,
            "worklog": worklog,
            "owner": worklog.owner,
            "project": worklog.project,
            "task": worklog.task,
            "subtask": worklog.subtask,
        }
    )

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "message": "Project Management API is running"}

@app.get("/api/version/js")
async def get_js_version():
    """Lấy version hiện tại của file JavaScript để kiểm tra update"""
    version = get_file_version("static/js/app.v2.js")
    return {"version": version, "file": "app.v2.js"}

@app.get("/{path:path}", response_class=HTMLResponse)
async def catch_all(request: Request, path: str):
    """
    Catch-all route để serve index.html cho tất cả frontend routes.
    Cho phép client-side routing hoạt động khi refresh page.
    """
    # Bỏ qua các routes đã được xử lý bởi các routes khác
    # (API routes, static files, login, worklogs được xử lý trước)
    # Chỉ serve index.html cho các frontend routes
    return no_store_template("index.html", {"request": request})

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8004, reload=True)
