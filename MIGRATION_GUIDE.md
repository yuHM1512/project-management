# Migration Guide

Ứng dụng hiện đã tự đồng bộ phần lớn schema khi khởi động thông qua `init_db()` trong [database.py](D:/Data%20Analyst/Tools/project-management/database.py). Không còn cần chạy các file `migrate*.sql` hay các script vá nhỏ lẻ như trước.

## Chuẩn bị

```bash
git clone https://github.com/yuHM1512/project-management
cd project-management
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

## Cấu hình môi trường

Tạo `.env` với tối thiểu:

```env
SQLALCHEMY_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/project_management
INTERN_DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/internship
SECRET_KEY=<your-secret>
```

Nếu dùng SQLite cho một trong hai DB thì chỉ cần đổi URL tương ứng.

## Khởi tạo schema

Chạy một lần:

```bash
python -c "from database import init_db; init_db()"
```

Lệnh này sẽ:

- tạo các bảng còn thiếu từ `models.py` và `models_intern.py`
- tự thêm các cột mới như `users.position`, `users.field`, `users.group`
- đồng bộ `intern_personal.gender`
- seed các `project_types` mặc định nếu còn thiếu
- migrate dữ liệu cũ từ `tasks.assignee_id` sang `task_assignees` nếu DB cũ vẫn còn cột đó
- tạo các index cần thiết cho `notifications`, `task_assignees`, `projects.project_type_id`
- đổi tên `activity_logs.metadata` sang `activity_metadata` nếu DB cũ còn dùng tên cũ

## Chạy app

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Seed dữ liệu mẫu

```bash
python seed_data.py
```

## Ghi chú

- Cơ chế đồng bộ schema hiện tại là `non-destructive`: không tự xóa cột/bảng cũ.
- Nếu cần dọn dữ liệu hoặc bảng legacy trong production, nên làm riêng bằng backup + migration có kiểm soát.
