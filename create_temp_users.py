"""Script tạo nhanh các user tạm để chỉnh sửa sau.
Chạy: python create_temp_users.py
"""
import uuid
from typing import List

from passlib.context import CryptContext

from database import SessionLocal
from models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_temp_users(count: int = 2, password: str = "Hachiba@123") -> List[User]:
    """Tạo `count` user tạm với password cố định."""
    db = SessionLocal()
    created_users: List[User] = []

    try:
        for idx in range(count):
            username = f"user_{uuid.uuid4().hex[:6]}"
            email = f"{username}@example.com"

            # Tránh tạo trùng username nếu đã tồn tại
            if db.query(User).filter(User.username == username).first():
                continue

            temp_user = User(
                username=username,
                email=email,
                hashed_password=pwd_context.hash(password),
                full_name=f"Temporary User {idx + 1}",
                is_active=True,
            )
            db.add(temp_user)
            db.commit()
            db.refresh(temp_user)
            created_users.append(temp_user)

        return created_users
    finally:
        db.close()


if __name__ == "__main__":
    users = create_temp_users()

    if not users:
        print("⚠️  Không tạo được user mới (có thể đã tồn tại username trùng).")
    else:
        print("✅ Đã tạo user tạm:")
        for user in users:
            print(f"  - Username: {user.username} | Email: {user.email} | Password: Hachiba@123")


