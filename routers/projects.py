from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Mtcl, Project, ProjectType, TeamMember, UserRole
from schemas import ProjectCreate, ProjectUpdate, ProjectResponse
from routers.auth import get_current_user
from typing import List
from pydantic import BaseModel

router = APIRouter()


class ProjectTypeResponse(BaseModel):
    id: int
    name: str
    description: str = None
    
    class Config:
        from_attributes = True


def _apply_mtcl_mapping(db: Session, payload: dict) -> dict:
    objective_group = payload.get("objective_group")
    objective_description = payload.get("objective_description")

    if objective_group:
        query = db.query(Mtcl).filter(Mtcl.objective_group == objective_group)
        if objective_description:
            query = query.filter(Mtcl.description == objective_description)
        mtcl_item = query.order_by(Mtcl.id.asc()).first()
        if not mtcl_item:
            raise HTTPException(status_code=400, detail="Mục tiêu chất lượng không tồn tại")
        payload["objective_group"] = mtcl_item.objective_group
        payload["objective_description"] = mtcl_item.description
    elif objective_description:
        raise HTTPException(status_code=400, detail="Phải chọn mục tiêu chất lượng trước khi lưu mô tả")
    else:
        payload["objective_group"] = None
        payload["objective_description"] = None

    return payload

@router.get("/", response_model=List[ProjectResponse])
def get_projects(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Lấy danh sách tất cả projects"""
    projects = db.query(Project).offset(skip).limit(limit).all()
    return projects

@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, db: Session = Depends(get_db)):
    """Lấy thông tin một project"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.post("/", response_model=ProjectResponse)
def create_project(
    project: ProjectCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Tạo project mới"""
    project_data = _apply_mtcl_mapping(db, project.dict())
    db_project = Project(**project_data, owner_id=current_user.id)
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    project_update: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Cập nhật project"""
    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    if db_project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only project owner can update project")
    
    update_data = project_update.dict(exclude_unset=True)
    if "objective_group" in update_data or "objective_description" in update_data:
        update_data = _apply_mtcl_mapping(db, update_data)
    for field, value in update_data.items():
        setattr(db_project, field, value)
    
    db.commit()
    db.refresh(db_project)
    return db_project

@router.delete("/{project_id}")
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Xóa project và toàn bộ dữ liệu liên quan"""
    db_project = db.query(Project).filter(Project.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Project not found")
    is_admin = current_user.role == UserRole.ADMIN.value
    if not is_admin and db_project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only project owner or admin can delete project")

    # TeamMember không có cascade → xóa thủ công
    db.query(TeamMember).filter(TeamMember.project_id == project_id).delete(synchronize_session=False)

    db.delete(db_project)
    db.commit()
    return {"message": "Project deleted successfully"}


@router.get("/types/list", response_model=List[ProjectTypeResponse])
def get_project_types(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Lấy danh sách project types"""
    project_types = db.query(ProjectType).order_by(ProjectType.id).all()
    return project_types

