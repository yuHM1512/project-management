# Migration Guide

Hướng dẫn từng bước để di chuyển ứng dụng Project Management sang máy khác và khởi động trong trạng thái đầy đủ bảng/cột.

## 1. Chuẩn bị
- Python 3.10+ và PowerShell/Bash.
- Git, PostgreSQL 14+ (SQLAlchemy mặc định kết nối PostgreSQL, vẫn hỗ trợ SQLite nếu đổi `DATABASE_URL`).
- Các file mã nguồn hiện tại (bao gồm `static/uploads` nếu muốn giữ avatar/attachments).
- Nếu muốn sao chép dữ liệu thật: tạo bản backup `pg_dump` trên máy cũ và sao chép file `.env`.

## 2. Clone mã nguồn
```bash
git clone <repo-url> project-management
cd project-management
```

## 3. Thiết lập môi trường Python
```bash
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac
pip install -r requirements.txt
```

## 4. Cấu hình biến môi trường
1. Tạo file `.env` ở thư mục gốc (có thể copy từ `templates/env.example.txt`):
   ```
   DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/project_management
   ```
2. Đảm bảo PostgreSQL đã tạo user & database:
   ```sql
   CREATE DATABASE project_management;
   ```

## 5. Khởi tạo schema mặc định
Chạy `init_db()` để SQLAlchemy tạo toàn bộ bảng/cột định nghĩa trong `models.py` trước khi apply các migration thủ công:
```bash
python -c "from database import init_db; init_db()"
```
Lệnh này chỉ cần chạy một lần trên máy mới.

## 6. Áp dụng các migration bổ sung
Các file `.sql` trong thư mục gốc cần chạy theo thứ tự sau để đảm bảo đủ bảng/cột mới:
```bash
psql -d project_management -f migrate_activity_metadata.sql
psql -d project_management -f migrate_project_types.sql
psql -d project_management -f migrate_task_assignees.sql
psql -d project_management -f migrate_notifications.sql
```
> **Ghi chú:** `migrate_task_assignees.sql` sẽ xóa cột `assignee_id` khỏi `tasks`. Chỉ chạy script này trên DB đã cập nhật mã nguồn tương ứng (repo hiện tại đã dùng bảng `task_assignees`).

Nếu bạn có migration khác (ví dụ `update_project_type.sql`), chạy tiếp sau các bước trên.

## 7. Nạp dữ liệu
- **Nếu chuyển dữ liệu thật:** dùng `pg_restore` từ file backup ở bước 1.
- **Nếu chỉ cần dữ liệu mẫu:** chạy script seed mặc định:
  ```bash
  python seed_data.py
  ```
  Script sẽ tạo user `admin/admin123`, workspace mẫu, vài project/task.

## 8. Tài nguyên tĩnh
Để giữ avatar/attachments hiện có, copy toàn bộ thư mục `static/uploads` từ máy cũ sang máy mới trước khi chạy ứng dụng. Nếu không copy, ứng dụng sẽ vẫn chạy nhưng thiếu file minh họa.

## 9. Khởi chạy ứng dụng
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Truy cập `http://localhost:8000` để mở giao diện (template `templates/index.html`).

## 10. Kiểm tra sau migrate
- Đăng nhập bằng tài khoản admin (hoặc tài khoản khôi phục từ backup).
- Mở `Board` → kiểm tra `Ngày yêu cầu hoàn thành`, `Tiến độ dự án`, Activity Log.
- Tạo project mới xem `project_type` hoạt động.
- Gửi message Thread với `@mention` để chắc chắn notifications hoạt động.
- Kiểm tra API thủ công (tuỳ chọn):
  ```bash
  curl http://localhost:8000/docs
  ```

## 11. Troubleshooting nhanh
- **Thiếu bảng/cột**: chạy lại `python -c "from database import init_db();"` rồi áp dụng migration SQL.
- **Lỗi kết nối DB**: xác thực `DATABASE_URL` đúng định dạng và Postgres đang chạy.
- **Static files 404**: chắc chắn chạy app từ gốc repo và không xoá `static/`.

Hoàn thành các bước trên, ứng dụng sẽ chạy đầy đủ trên máy mới với toàn bộ schema và dữ liệu cần thiết.

