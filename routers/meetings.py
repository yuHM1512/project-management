from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Meeting, User, UserRole
from schemas import MeetingCreate, MeetingUpdate, MeetingResponse
from routers.auth import get_current_user

router = APIRouter()


def _get_meeting_or_404(db: Session, meeting_id: int) -> Meeting:
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


def _ensure_meeting_permission(meeting: Meeting, current_user):
    # Chỉ creator (admin) hoặc employee được review mới có thể xem/sửa
    if meeting.creator_id != current_user.id and meeting.employee_id != current_user.id:
        if current_user.role != UserRole.ADMIN.value:
            raise HTTPException(status_code=403, detail="Permission denied for this meeting")


@router.get("/", response_model=List[MeetingResponse])
def list_meetings(
    creator: Optional[bool] = Query(None, description="Filter by creator (admin only)"),
    employee: Optional[bool] = Query(None, description="Filter by employee (regular user)"),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List meetings - Admin sees meetings they created, regular users see meetings they're involved in"""
    try:
        query = db.query(Meeting)
        
        if current_user.role == UserRole.ADMIN.value:
            if creator:
                # Admin xem các meeting họ tạo
                query = query.filter(Meeting.creator_id == current_user.id)
            elif employee:
                # Admin xem các meeting họ là employee (nếu có)
                query = query.filter(Meeting.employee_id == current_user.id)
            else:
                # Mặc định admin xem tất cả meetings họ tạo
                query = query.filter(Meeting.creator_id == current_user.id)
        else:
            # Regular user chỉ xem meetings họ được review
            query = query.filter(Meeting.employee_id == current_user.id)
        
        meetings = query.order_by(Meeting.time.desc()).all()
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Error listing meetings: {str(e)}\n{error_detail}")
    
    # Thêm thông tin creator_name và employee_name
    result = []
    for meeting in meetings:
        # Query names directly to avoid relationship loading issues
        creator = db.query(User).filter(User.id == meeting.creator_id).first()
        employee = db.query(User).filter(User.id == meeting.employee_id).first()
        
        creator_name = None
        employee_name = None
        if creator:
            creator_name = creator.full_name or creator.username
        if employee:
            employee_name = employee.full_name or employee.username
        
        meeting_dict = {
            "id": meeting.id,
            "creator_id": meeting.creator_id,
            "employee_id": meeting.employee_id,
            "time": meeting.time,
            "location": meeting.location,
            "department": meeting.department,
            "team": meeting.team,
            "contents": meeting.contents,
            "content_data": meeting.content_data,
            "created_at": meeting.created_at,
            "updated_at": meeting.updated_at,
            "creator_name": creator_name,
            "employee_name": employee_name,
            "employee_username": employee.username if employee else None,
        }
        result.append(MeetingResponse(**meeting_dict))
    
    return result


@router.post("/", response_model=MeetingResponse)
def create_meeting(
    payload: MeetingCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Create a new meeting - Only admin can create meetings"""
    try:
        if current_user.role != UserRole.ADMIN.value:
            raise HTTPException(status_code=403, detail="Only admin can create meetings")
        
        # Verify employee exists and belongs to same department
        employee = db.query(User).filter(User.id == payload.employee_id).first()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
        
        if employee.department != current_user.department:
            raise HTTPException(status_code=403, detail="Employee must belong to the same department")
        
        # Convert payload to dict - handle both dict() and model_dump() for Pydantic v1/v2 compatibility
        try:
            data = payload.model_dump() if hasattr(payload, 'model_dump') else payload.dict()
        except:
            data = payload.dict()
        
        data["creator_id"] = current_user.id
        # Set department from current user if not provided
        if not data.get("department"):
            data["department"] = current_user.department
        # Set team from employee if not provided
        if not data.get("team") and employee.team:
            data["team"] = employee.team
        
        meeting = Meeting(**data)
        db.add(meeting)
        db.commit()
        db.refresh(meeting)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        error_detail = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Error creating meeting: {str(e)}\n{error_detail}")
    
    # Return with names - query directly to avoid relationship loading issues
    creator = db.query(User).filter(User.id == meeting.creator_id).first()
    employee = db.query(User).filter(User.id == meeting.employee_id).first()
    
    creator_name = None
    employee_name = None
    if creator:
        creator_name = creator.full_name or creator.username
    if employee:
        employee_name = employee.full_name or employee.username
    
    meeting_dict = {
        "id": meeting.id,
        "creator_id": meeting.creator_id,
        "employee_id": meeting.employee_id,
        "time": meeting.time,
        "location": meeting.location,
        "department": meeting.department,
        "team": meeting.team,
        "contents": meeting.contents,
        "content_data": meeting.content_data,
        "created_at": meeting.created_at,
        "updated_at": meeting.updated_at,
        "creator_name": creator_name,
        "employee_name": employee_name,
        "employee_username": employee.username if employee else None,
    }
    return MeetingResponse(**meeting_dict)


@router.get("/{meeting_id}", response_model=MeetingResponse)
def get_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get a specific meeting"""
    meeting = _get_meeting_or_404(db, meeting_id)
    _ensure_meeting_permission(meeting, current_user)
    
    # Query names directly
    creator = db.query(User).filter(User.id == meeting.creator_id).first()
    employee = db.query(User).filter(User.id == meeting.employee_id).first()
    
    creator_name = None
    employee_name = None
    if creator:
        creator_name = creator.full_name or creator.username
    if employee:
        employee_name = employee.full_name or employee.username
    
    meeting_dict = {
        "id": meeting.id,
        "creator_id": meeting.creator_id,
        "employee_id": meeting.employee_id,
        "time": meeting.time,
        "location": meeting.location,
        "department": meeting.department,
        "team": meeting.team,
        "contents": meeting.contents,
        "content_data": meeting.content_data,
        "created_at": meeting.created_at,
        "updated_at": meeting.updated_at,
        "creator_name": creator_name,
        "employee_name": employee_name,
        "employee_username": employee.username if employee else None,
    }
    return MeetingResponse(**meeting_dict)


@router.put("/{meeting_id}", response_model=MeetingResponse)
def update_meeting(
    meeting_id: int,
    payload: MeetingUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update a meeting - Only creator (admin) can update"""
    try:
        meeting = _get_meeting_or_404(db, meeting_id)
        
        if meeting.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only meeting creator can update")
        
        # Handle both dict() and model_dump() for Pydantic v1/v2 compatibility
        try:
            update_data = payload.model_dump(exclude_unset=True) if hasattr(payload, 'model_dump') else payload.dict(exclude_unset=True)
        except:
            update_data = payload.dict(exclude_unset=True)
    
        # If employee_id is updated, verify new employee
        if "employee_id" in update_data:
            employee = db.query(User).filter(User.id == update_data["employee_id"]).first()
            if not employee:
                raise HTTPException(status_code=404, detail="Employee not found")
            if employee.department != current_user.department:
                raise HTTPException(status_code=403, detail="Employee must belong to the same department")
            if not update_data.get("team") and employee.team:
                update_data["team"] = employee.team
        
        for field, value in update_data.items():
            setattr(meeting, field, value)
        
        db.commit()
        db.refresh(meeting)
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        import traceback
        error_detail = traceback.format_exc()
        raise HTTPException(status_code=500, detail=f"Error updating meeting: {str(e)}\n{error_detail}")
    
    # Query names directly
    creator = db.query(User).filter(User.id == meeting.creator_id).first()
    employee = db.query(User).filter(User.id == meeting.employee_id).first()
    
    creator_name = None
    employee_name = None
    if creator:
        creator_name = creator.full_name or creator.username
    if employee:
        employee_name = employee.full_name or employee.username
    
    meeting_dict = {
        "id": meeting.id,
        "creator_id": meeting.creator_id,
        "employee_id": meeting.employee_id,
        "time": meeting.time,
        "location": meeting.location,
        "department": meeting.department,
        "team": meeting.team,
        "contents": meeting.contents,
        "content_data": meeting.content_data,
        "created_at": meeting.created_at,
        "updated_at": meeting.updated_at,
        "creator_name": creator_name,
        "employee_name": employee_name,
        "employee_username": employee.username if employee else None,
    }
    return MeetingResponse(**meeting_dict)


@router.delete("/{meeting_id}")
def delete_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete a meeting - Only creator (admin) can delete"""
    meeting = _get_meeting_or_404(db, meeting_id)
    
    if meeting.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only meeting creator can delete")
    
    db.delete(meeting)
    db.commit()
    return {"message": "Meeting deleted successfully"}

