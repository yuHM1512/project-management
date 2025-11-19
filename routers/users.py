from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import os
import uuid
from pathlib import Path

from database import get_db
from models import User
from schemas import UserResponse, UserUpdate, UserMeUpdate, ChangePasswordRequest
from routers.auth import get_current_user, require_admin, verify_password, get_password_hash


router = APIRouter()

UPLOAD_DIR = Path("static/uploads/avatars")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/", response_model=List[UserResponse])
def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy danh sách users để phân công/hiển thị."""
    users = db.query(User).offset(skip).limit(limit).all()
    return users


@router.put("/me", response_model=UserResponse)
def update_me(
    user_update: UserMeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Người dùng tự cập nhật thông tin cá nhân"""
    db_user = db.query(User).filter(User.id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    allowed_fields = {"email", "full_name", "avatar_url", "department", "team"}
    update_data = {
        key: value
        for key, value in user_update.dict(exclude_unset=True).items()
        if key in allowed_fields
    }

    if not update_data:
        return db_user

    if "email" in update_data and update_data["email"] != db_user.email:
        existing = db.query(User).filter(User.email == update_data["email"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already exists")

    for key, value in update_data.items():
        setattr(db_user, key, value)

    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/me/change-password")
def change_password(
    password_data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Đổi mật khẩu cho user hiện tại"""
    db_user = db.query(User).filter(User.id == current_user.id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Kiểm tra mật khẩu hiện tại
    if not verify_password(password_data.current_password, db_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Kiểm tra mật khẩu mới không trùng với mật khẩu cũ
    if verify_password(password_data.new_password, db_user.hashed_password):
        raise HTTPException(status_code=400, detail="New password must be different from current password")
    
    # Kiểm tra độ dài mật khẩu mới
    if len(password_data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    
    # Cập nhật mật khẩu mới
    db_user.hashed_password = get_password_hash(password_data.new_password)
    db.commit()
    
    return {"message": "Password changed successfully"}


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy thông tin chi tiết một user."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Cập nhật thông tin user (chỉ admin)"""
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Kiểm tra username unique (nếu đổi username)
    if user_update.username and user_update.username != db_user.username:
        existing = db.query(User).filter(User.username == user_update.username).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
    
    # Kiểm tra email unique (nếu đổi email)
    if user_update.email and user_update.email != db_user.email:
        existing = db.query(User).filter(User.email == user_update.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already exists")
    
    # Cập nhật các trường
    update_data = user_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_user, key, value)
    
    db.commit()
    db.refresh(db_user)
    return db_user


@router.post("/{user_id}/avatar", response_model=UserResponse)
async def upload_user_avatar(
    user_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Upload avatar cho user (chỉ admin, chỉ PNG)"""
    # Kiểm tra file type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Kiểm tra extension
    filename = file.filename or ""
    if not filename.lower().endswith(('.png', '.jpg', '.jpeg')):
        raise HTTPException(status_code=400, detail="File must be PNG, JPG or JPEG")
    
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Xóa avatar cũ nếu có
    if db_user.avatar_url:
        old_path = Path("static") / db_user.avatar_url.replace("/static/", "")
        if old_path.exists():
            old_path.unlink()
    
    # Lưu file mới
    extension = os.path.splitext(filename)[1] or ".png"
    new_filename = f"user_{user_id}_{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / new_filename
    
    with destination.open("wb") as buffer:
        buffer.write(await file.read())
    
    db_user.avatar_url = f"/static/uploads/avatars/{new_filename}"
    db.commit()
    db.refresh(db_user)
    return db_user

