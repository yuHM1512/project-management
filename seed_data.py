"""
Script để tạo dữ liệu mẫu cho ứng dụng
Chạy: python seed_data.py
"""
from database import SessionLocal, init_db
from models import User, Project, Task, Workspace
from passlib.context import CryptContext
from datetime import datetime, timedelta

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_sample_data():
    """Tạo dữ liệu mẫu"""
    db = SessionLocal()
    
    try:
        # Tạo user mặc định
        user = db.query(User).filter(User.username == "admin").first()
        if not user:
            user = User(
                username="admin",
                email="admin@example.com",
                hashed_password=pwd_context.hash("admin123"),
                full_name="Administrator",
                is_active=True
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print("✓ Created admin user (username: admin, password: admin123)")
        else:
            print("✓ Admin user already exists")
        
        # Tạo workspace
        workspace = db.query(Workspace).filter(Workspace.name == "My Workspace").first()
        if not workspace:
            workspace = Workspace(
                name="My Workspace",
                description="Default workspace",
                owner_id=user.id
            )
            db.add(workspace)
            db.commit()
            db.refresh(workspace)
            print("✓ Created workspace")
        
        # Tạo projects mẫu
        projects_data = [
            {
                "name": "Website Redesign",
                "description": "Redesign company website với UI/UX mới",
                "color": "#6366f1",
                "status": "active"
            },
            {
                "name": "Mobile App Development",
                "description": "Phát triển ứng dụng mobile cho iOS và Android",
                "color": "#10b981",
                "status": "active"
            },
            {
                "name": "Marketing Campaign",
                "description": "Chiến dịch marketing Q1 2024",
                "color": "#f59e0b",
                "status": "active"
            }
        ]
        
        created_projects = []
        for proj_data in projects_data:
            existing = db.query(Project).filter(Project.name == proj_data["name"]).first()
            if not existing:
                project = Project(
                    **proj_data,
                    owner_id=user.id,
                    workspace_id=workspace.id
                )
                db.add(project)
                db.commit()
                db.refresh(project)
                created_projects.append(project)
                print(f"✓ Created project: {project.name}")
            else:
                created_projects.append(existing)
        
        # Tạo tasks mẫu cho project đầu tiên
        if created_projects:
            project = created_projects[0]
            tasks_data = [
                {
                    "title": "Research và phân tích competitors",
                    "description": "Tìm hiểu các website tương tự và best practices",
                    "status": "done",
                    "priority": "high",
                    "position": 0
                },
                {
                    "title": "Thiết kế wireframes",
                    "description": "Tạo wireframes cho các trang chính",
                    "status": "in_progress",
                    "priority": "high",
                    "position": 0
                },
                {
                    "title": "Design mockups",
                    "description": "Thiết kế UI mockups với Figma",
                    "status": "todo",
                    "priority": "medium",
                    "position": 1
                },
                {
                    "title": "Review với stakeholders",
                    "description": "Trình bày và nhận feedback",
                    "status": "todo",
                    "priority": "medium",
                    "position": 2
                },
                {
                    "title": "Fix bug responsive",
                    "description": "Sửa lỗi hiển thị trên mobile",
                    "status": "blocked",
                    "priority": "low",
                    "position": 0
                }
            ]
            
            for task_data in tasks_data:
                existing = db.query(Task).filter(
                    Task.title == task_data["title"],
                    Task.project_id == project.id
                ).first()
                if not existing:
                    task = Task(
                        **task_data,
                        project_id=project.id,
                        assignee_id=user.id,
                        due_date=datetime.now() + timedelta(days=7)
                    )
                    db.add(task)
                    print(f"✓ Created task: {task.title}")
            
            db.commit()
            print(f"✓ Created {len(tasks_data)} sample tasks")
        
        print("\n✅ Seed data created successfully!")
        print("\nBạn có thể đăng nhập với:")
        print("  Username: admin")
        print("  Password: admin123")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    print("Initializing database...")
    init_db()
    print("Creating sample data...\n")
    create_sample_data()

