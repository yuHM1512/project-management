from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Table
from sqlalchemy.orm import relationship
from database import InternBase as Base # Alias explicitly for minimal diffs
from datetime import datetime

# Association table for many-to-many relationship between roadmaps and resources
roadmap_resources = Table(
    'roadmap_resources',
    Base.metadata,
    Column('roadmap_id', Integer, ForeignKey('roadmaps.id'), primary_key=True),
    Column('resource_id', Integer, ForeignKey('resources.id'), primary_key=True)
)

class InternProfile(Base):
    __tablename__ = "intern_personal"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, unique=True, index=True) # ID from project_management.users
    full_name = Column(String)
    dob = Column(Date, nullable=True)
    email = Column(String, unique=True, index=True)
    internship_from = Column(Date)
    internship_to = Column(Date)
    position = Column(String)

    phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    gender = Column(String, nullable=True) # New field
    emergency_contact_name = Column(String, nullable=True)
    emergency_contact_relation = Column(String, nullable=True)
    emergency_contact_phone = Column(String, nullable=True)

class Resource(Base):
    __tablename__ = "resources"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String) # Technical, Soft Skills, etc.
    title = Column(String)
    description = Column(Text)
    url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class DailyLog(Base):
    __tablename__ = "daily_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer)
    date = Column(Date, default=datetime.utcnow().date)
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

class Question(Base):
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer)
    author_name = Column(String)
    title = Column(String)
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    answers = relationship("Answer", back_populates="question")

class Answer(Base):
    __tablename__ = "answers"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"))
    user_id = Column(Integer)
    author_name = Column(String)
    author_role = Column(String) # Mentor, Trainer, etc.
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    question = relationship("Question", back_populates="answers")

class Roadmap(Base):
    __tablename__ = "roadmaps"

    id = Column(Integer, primary_key=True, index=True)
    stage = Column(String) # e.g. "Week 1", "Phase 1"
    title = Column(String)
    description = Column(Text)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Many-to-many relationship with resources
    resources = relationship("Resource", secondary=roadmap_resources, backref="roadmaps")
