# Seed Employees Script - Summary

## Tệp đã tạo

### 1. `seed_employees.py`
Script chính để đọc dữ liệu từ file Excel và insert vào table `public.users`

**Features:**
- Parse file Excel với `openpyxl`
- Support Unicode/Vietnamese characters (tên tiếng Việt có dấu)
- Hash password với `passlib.bcrypt` - password mặc định: `123456`
- Detect duplicate users (username hoặc email)
- Automatic transaction rollback nếu có lỗi
- Cross-platform compatible (Windows, Linux, macOS)

**Usage:**
```bash
# Với domain mặc định (company.com)
python seed_employees.py

# Với domain tùy chỉnh
python seed_employees.py yourdomain.com
```

### 2. `SEED_EMPLOYEES_README.md`
Tài liệu hướng dẫn chi tiết về cách sử dụng script

## Cách hoạt động

1. **Parse Headers**: Script tự động detect các cột trong Excel
   - Bắt buộc: "Họ & tên", "Mã nhân viên"
   - Tùy chọn: "Đơn vị", "Chức danh", "Lĩnh vực", v.v.

2. **Data Extraction**: 
   - Username ← Mã nhân viên (lowercase cho email)
   - Email ← {username}@{domain}
   - Full Name ← Họ & tên
   - Department ← Đơn vị
   - Position ← Chức danh

3. **Validation**:
   - Skip dòng trống hoặc thiếu required fields
   - Check duplicate (username hoặc email)

4. **Database Insert**:
   - Hash password với bcrypt
   - Set role = 'member', is_active = True
   - Batch insert với transaction

## Kết quả chạy đầu tiên

```
[INFO] Bat dau seed du lieu nhan vien...
[OK] Mo file Excel: seed_employees.xlsx

[INFO] Headers tim thay:
  - stt -> Col 1
  - họ & tên -> Col 2
  - mã nhân viên -> Col 3
  - đơn vị -> Col 4
  - chức danh -> Col 5
  - lĩnh vực -> Col 6
  - chương -> Col 7
  - nhóm -> Col 8

[OK] Row 2: Tao user 'P0872' (p0872@company.com)
[OK] Row 3: Tao user 'H3724' (h3724@company.com)
[OK] Row 4: Tao user 'H3839' (h3839@company.com)
... (26 more users created)

[SUCCESS] Tao 29 user(s)

[INFO] Hoan thanh!
```

**Total users created: 29**

## Data Structure

Mỗi user được tạo với:

```python
User(
    username="P0872",           # Mã nhân viên (lowercase)
    email="p0872@company.com",  # Generated email
    full_name="Hồ Anh Phát",   # Họ & tên
    hashed_password="...",      # bcrypt(123456)
    department="P. Tổng hợp",  # Đơn vị
    position="KSHT",            # Chức danh
    role="member",              # Default role
    is_active=True              # Active by default
)
```

## Lần chạy tiếp theo

Nếu chạy script lại:
- Các users đã tồn tại sẽ bị skip (duplicate detection)
- Chỉ những users mới từ Excel mới được thêm
- Output sẽ hiển thị `[SKIP] Row X: User 'XXX' da ton tai`

## Error Handling

- ✅ Excel not found → Exit with error
- ✅ Missing required columns → Exit with error  
- ✅ Database connection error → Rollback and exit
- ✅ Row-level errors → Log error but continue processing other rows

## Dependencies

```
openpyxl==3.x    # Read Excel files
passlib==1.7.x   # Password hashing
sqlalchemy==2.x  # ORM
```

## Custom Domain

Nếu email domain không phải `company.com`:

```bash
python seed_employees.py hachibavn.com
# Email sẽ là: p0872@hachibavn.com, h3724@hachibavn.com, etc.
```

## Security Notes

- Password mặc định `123456` chỉ dùng cho testing/development
- Nên yêu cầu users reset password khi lần đầu đăng nhập
- Tất cả passwords được hash với bcrypt trước khi lưu vào database
- Script không lưu plaintext passwords
