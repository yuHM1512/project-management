# Hướng dẫn chạy server

## Các cách chạy server với port 8004:

### Cách 1: Dùng script (Khuyến nghị)
```bash
# Windows
run.bat

# Linux/Mac
chmod +x run.sh
./run.sh
```

### Cách 2: Chạy trực tiếp với uvicorn
```bash
uvicorn main:app --reload --port 8004
```

### Cách 3: Chạy bằng Python
```bash
python main.py
```

### Cách 4: Tạo alias trong PowerShell (Windows)
```powershell
# Chạy một lần để setup alias
. .\setup-alias.ps1

# Sau đó có thể dùng
uvicorn-dev
```

## Lưu ý:
- **Port mặc định**: 8004
- **Port uvicorn mặc định**: 8000 (nếu không chỉ định --port)
- Luôn chỉ định `--port 8004` khi chạy uvicorn trực tiếp để tránh xung đột


