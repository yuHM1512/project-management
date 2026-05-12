# Seed Employees Script

Script để tự động import dữ liệu nhân viên từ file Excel vào table `public.users` trong database.

## File yêu cầu

- `seed_employees.xlsx` - File Excel chứa danh sách nhân viên
  - Các cột bắt buộc: **Họ & tên**, **Mã nhân viên**
  - Các cột tùy chọn: **Đơn vị**, **Chức danh**, **Lĩnh vực**, **Chương**, **Nhóm**

## Cấu trúc Excel

| STT | Họ & tên | Mã nhân viên | Đơn vị | Chức danh | Lĩnh vực | Chương | Nhóm |
|-----|----------|-------------|--------|-----------|----------|--------|------|
| 1 | Hồ Anh Phát | P0872 | P. Tổng hợp | KSHT | OPEX | ... | ... |
| 2 | Nguyễn Khắc Minh Huy | H3724 | P. Tổng hợp | KSHT | OPEX | ... | ... |

## Cách sử dụng

### Chạy script với domain mặc định

```bash
python seed_employees.py
```

Email sẽ được tạo theo format: `{username}@company.com`

### Chạy script với domain tùy chỉnh

```bash
python seed_employees.py example.com
```

Email sẽ được tạo theo format: `{username}@example.com`

## Dữ liệu được tạo

Script sẽ tạo các user với:

- **Username**: Lấy từ cột "Mã nhân viên"
- **Email**: Được tạo từ username + domain
- **Full Name**: Lấy từ cột "Họ & tên"
- **Department**: Lấy từ cột "Đơn vị"
- **Position**: Lấy từ cột "Chức danh"
- **Password**: Mặc định là `123456` (đã hash)
- **Role**: `member`
- **Status**: `is_active = True`

## Behavior

- **Duplicate detection**: Nếu user có cùng username hoặc email đã tồn tại, sẽ skip dòng đó
- **Case insensitive**: Username sẽ được convert sang lowercase cho email
- **Whitespace handling**: Tự động trim whitespace từ các field
- **Unicode support**: Hỗ trợ tên tiếng Việt có dấu

## Output

Script sẽ hiển thị:

```
[INFO] Bat dau seed du lieu nhan vien...
[OK] Mo file Excel: seed_employees.xlsx

[INFO] Headers tim thay:
  - stt -> Col 1
  - họ & tên -> Col 2
  - mã nhân viên -> Col 3
  - ...

[OK] Row 2: Tao user 'P0872' (p0872@company.com)
[OK] Row 3: Tao user 'H3724' (h3724@company.com)
[SKIP] Row X: User 'XXX' (...@company.com) da ton tai

[SUCCESS] Tao 12 user(s)
[WARN] Skip 3 row(s)

[INFO] Hoan thanh!
```

## Lỗi thường gặp

### File không tìm thấy
```
[ERROR] File khong ton tai: seed_employees.xlsx
```
Kiểm tra file Excel có tồn tại trong cùng thư mục.

### Thiếu cột bắt buộc
```
[ERROR] Thieu cac cot bat buoc: ['họ & tên', 'mã nhân viên']
```
Kiểm tra file Excel có đúng tên cột: "Họ & tên" và "Mã nhân viên"

## Dependencies

- `openpyxl` - Đọc file Excel
- `passlib` - Hash password
- `sqlalchemy` - ORM database

## Notes

- Password mặc định là `123456`. Khuyến cáo người dùng thay đổi password khi lần đầu đăng nhập
- Script tự động commit changes vào database sau khi thực hiện
- Nếu có lỗi, tất cả changes sẽ rollback
