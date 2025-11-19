from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from database import init_db, get_db
from sqlalchemy.orm import Session
from routers import projects, tasks, teams, auth, users, subtasks, threads, comments, activities, worklogs, notes, todos, notifications
from models import WorkLog
import uvicorn

app = FastAPI(title="Project Management", version="1.0.0")

# Khởi tạo database
init_db()

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/assets", StaticFiles(directory="templates"), name="assets")

# Templates
templates = Jinja2Templates(directory="templates")

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(teams.router, prefix="/api/teams", tags=["teams"])
app.include_router(subtasks.router, prefix="/api/subtasks", tags=["subtasks"])
app.include_router(threads.router, prefix="/api/threads", tags=["threads"])
app.include_router(comments.router, prefix="/api/comments", tags=["comments"])
app.include_router(activities.router, prefix="/api/activities", tags=["activities"])
app.include_router(worklogs.router, prefix="/api/work-logs", tags=["worklogs"])
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(todos.router, prefix="/api/todos", tags=["todos"])

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Trang chủ"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    """Trang đăng nhập"""
    return templates.TemplateResponse("login.html", {"request": request})


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

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

