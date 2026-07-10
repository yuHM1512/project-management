from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from models import TeamMember, Project, User
from routers.auth import get_current_user
from schemas import TeamMemberCreate, TeamMemberResponse

router = APIRouter()


def _ensure_project_owner(project: Project, user: User):
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only project owner can manage project members")

@router.get("/project/{project_id}", response_model=List[TeamMemberResponse])
def get_team_members(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Lấy danh sách team members của một project"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    members = db.query(TeamMember).filter(TeamMember.project_id == project_id).all()
    return members

@router.post("/", response_model=TeamMemberResponse)
def add_team_member(member: TeamMemberCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Thêm member vào project"""
    # Kiểm tra project tồn tại
    project = db.query(Project).filter(Project.id == member.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    _ensure_project_owner(project, current_user)
    
    # Kiểm tra user tồn tại
    user = db.query(User).filter(User.id == member.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Kiểm tra đã là member chưa
    existing = db.query(TeamMember).filter(
        TeamMember.project_id == member.project_id,
        TeamMember.user_id == member.user_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="User is already a team member")
    
    db_member = TeamMember(**member.dict())
    db.add(db_member)
    db.commit()
    db.refresh(db_member)
    return db_member

@router.delete("/{member_id}")
def remove_team_member(member_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Xóa member khỏi project"""
    db_member = db.query(TeamMember).filter(TeamMember.id == member_id).first()
    if not db_member:
        raise HTTPException(status_code=404, detail="Team member not found")
    _ensure_project_owner(db_member.project, current_user)
    
    db.delete(db_member)
    db.commit()
    return {"message": "Team member removed successfully"}

@router.put("/{member_id}/role")
def update_member_role(member_id: int, role: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Cập nhật role của member"""
    db_member = db.query(TeamMember).filter(TeamMember.id == member_id).first()
    if not db_member:
        raise HTTPException(status_code=404, detail="Team member not found")
    _ensure_project_owner(db_member.project, current_user)
    
    db_member.role = role
    db.commit()
    db.refresh(db_member)
    return {"message": "Role updated successfully", "member": db_member}

