import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

load_dotenv()

# Project Management Database (Shared Users)
SQLALCHEMY_DATABASE_URL = os.getenv(
    "SQLALCHEMY_DATABASE_URL",
    "",
)

# Internship App Database
INTERN_DATABASE_URL = os.getenv(
    "INTERN_DATABASE_URL",
    "",
)

connect_args = {"check_same_thread": False} if SQLALCHEMY_DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args=connect_args,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

intern_engine = create_engine(
    INTERN_DATABASE_URL,
    connect_args=connect_args,
)
InternSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=intern_engine)

Base = declarative_base()
InternBase = declarative_base()

def get_db():
    """Dependency để lấy database session chính"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_intern_db():
    """Dependency để lấy database session của intern app"""
    db = InternSessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Khởi tạo database và tạo tables"""
    # Import các models để SQLAlchemy biết schema trước khi tạo bảng
    import models  # noqa: F401
    import models_intern  # noqa: F401
    
    # Tạo bảng cho từng DB dựa trên Base tương ứng
    Base.metadata.create_all(bind=engine)
    InternBase.metadata.create_all(bind=intern_engine)

