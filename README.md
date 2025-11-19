# Project Management Application

Ứng dụng quản lý dự án được xây dựng với Python + FastAPI, tham khảo ý tưởng từ Notion.

## Tech Stack

### Backend
- **FastAPI**: Framework web hiện đại, nhanh cho Python
- **SQLAlchemy**: ORM để quản lý database
- **SQLite**: Database (có thể nâng cấp lên PostgreSQL)
- **Pydantic**: Validation và serialization
- **JWT**: Authentication

### Frontend
- **Vanilla JavaScript**: Không cần framework phức tạp
- **CSS3**: Modern styling với Flexbox/Grid
- **HTML5**: Semantic markup

## Tính năng chính

1. **Quản lý Dự án (Projects)**
   - Tạo, sửa, xóa dự án
   - Phân loại theo workspace/team
   - Trạng thái dự án (Active, Completed, Archived)

2. **Quản lý Tasks**
   - Tạo tasks với priority, due date, assignee
   - Board view (Kanban style)
   - List view
   - Calendar view

3. **Quản lý Team**
   - Thêm/sửa/xóa thành viên
   - Phân quyền (Admin, Member, Viewer)

4. **Dashboard**
   - Tổng quan dự án
   - Thống kê tasks
   - Timeline view

## Cài đặt

```bash
# Tạo virtual environment
python -m venv venv

# Kích hoạt virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Cài đặt dependencies
pip install -r requirements.txt

# Chạy ứng dụng
uvicorn main:app --reload
```

Truy cập: http://localhost:8000

## Cấu trúc dự án

```
project-management/
├── main.py                 # FastAPI app entry point
├── models.py              # Database models
├── schemas.py             # Pydantic schemas
├── database.py            # Database setup
├── routers/               # API routes
│   ├── projects.py
│   ├── tasks.py
│   ├── teams.py
│   └── auth.py
├── static/                # Static files (CSS, JS)
│   ├── css/
│   └── js/
├── templates/             # HTML templates
│   └── index.html
└── requirements.txt
```

## Framework gợi ý (nếu muốn mở rộng)

### Frontend Framework (tùy chọn)
- **Vue.js**: Nhẹ, dễ học, phù hợp cho ứng dụng vừa
- **React**: Phổ biến, nhiều thư viện hỗ trợ
- **Svelte**: Hiện đại, performance tốt

### Database
- **PostgreSQL**: Production-ready
- **MongoDB**: NoSQL nếu cần flexibility

### Authentication
- **OAuth2**: Đăng nhập bằng Google/GitHub
- **JWT**: Token-based auth (đã implement)

## Cách quản lý hiệu quả

1. **Workspace-based**: Tổ chức theo workspace/team
2. **Board View**: Kanban board cho visual workflow
3. **Filtering & Search**: Tìm kiếm nhanh tasks/projects
4. **Notifications**: Thông báo khi có task mới/update
5. **Templates**: Tạo template cho dự án tương tự
6. **Tags & Labels**: Phân loại tasks
7. **Time Tracking**: Theo dõi thời gian (tùy chọn)

