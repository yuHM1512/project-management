"""Periodic (recurring) meeting API."""
from __future__ import annotations
from datetime import date, datetime, timedelta, time as dt_time, timezone
from typing import List, Optional
import math

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import PeriodicMeeting, PeriodicMeetingParticipant, MeetingSession, MeetingAgendaItem, User, UserRole
from routers.auth import get_current_user
from routers.notifications_helper import notify_meeting_assigned, notify_meeting_session_open

router = APIRouter(prefix="/periodic-meetings", tags=["periodic-meetings"])

# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ParticipantOut(BaseModel):
    id: int
    full_name: Optional[str]
    email: str
    avatar_url: Optional[str]
    position: Optional[str]
    role: str

    class Config:
        from_attributes = True


class AgendaItemIn(BaseModel):
    content: str
    item_type: str = "update"   # update / issue / plan


class AgendaItemOut(BaseModel):
    id: int
    session_id: int
    user_id: int
    user_name: Optional[str]
    user_avatar: Optional[str]
    content: str
    item_type: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SessionOut(BaseModel):
    id: int
    meeting_id: int
    session_date: date
    opens_at: datetime
    title: str
    status: str          # upcoming / open / completed
    notes: Optional[str]
    agenda_count: int
    submitted_user_ids: List[int]

    class Config:
        from_attributes = True


class MeetingIn(BaseModel):
    title: str
    frequency: str                   # weekly / monthly / quarterly
    day_of_week: Optional[int] = None    # 0=Mon..6=Sun
    day_of_month: Optional[int] = None  # 1-28
    month_of_quarter: Optional[int] = None  # 1/2/3
    start_date: date
    end_date: Optional[date] = None
    description: Optional[str] = None
    participant_ids: List[int] = []


class MeetingOut(BaseModel):
    id: int
    title: str
    frequency: str
    day_of_week: Optional[int]
    day_of_month: Optional[int]
    month_of_quarter: Optional[int]
    start_date: date
    end_date: Optional[date]
    description: Optional[str]
    created_by: int
    is_active: bool
    participants: List[ParticipantOut]
    session_count: int
    next_session: Optional[date]

    class Config:
        from_attributes = True


# ── Session generation ────────────────────────────────────────────────────────

def _opens_at(session_date: date, frequency: str) -> datetime:
    """Return UTC datetime when the block becomes visible for participants."""
    offsets = {"weekly": 4, "monthly": 3, "quarterly": 7}
    delta = offsets.get(frequency, 2)
    d = session_date - timedelta(days=delta)
    return datetime.combine(d, dt_time(8, 0))   # 08:00 local (naive UTC for simplicity)


def _session_title(session_date: date, frequency: str, index: int) -> str:
    months_vi = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6",
                 "Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"]
    if frequency == "weekly":
        week_num = session_date.isocalendar()[1]
        return f"Tuần {week_num} – {session_date.strftime('%d/%m/%Y')}"
    elif frequency == "monthly":
        return f"{months_vi[session_date.month - 1]} {session_date.year} – {session_date.strftime('%d/%m/%Y')}"
    else:
        q = math.ceil(session_date.month / 3)
        return f"Q{q}/{session_date.year} – {session_date.strftime('%d/%m/%Y')}"


def _next_weekday(from_date: date, weekday: int) -> date:
    """Return the first date >= from_date with the given weekday (0=Mon)."""
    days_ahead = (weekday - from_date.weekday()) % 7
    return from_date + timedelta(days=days_ahead)


def _generate_sessions(meeting: PeriodicMeeting) -> List[MeetingSession]:
    sessions = []
    end = meeting.end_date or (meeting.start_date + timedelta(days=365))
    idx = 1

    if meeting.frequency == "weekly":
        dow = meeting.day_of_week if meeting.day_of_week is not None else 0
        cur = _next_weekday(meeting.start_date, dow)
        while cur <= end:
            sessions.append(MeetingSession(
                meeting_id=meeting.id,
                session_date=cur,
                opens_at=_opens_at(cur, "weekly"),
                title=_session_title(cur, "weekly", idx),
            ))
            cur += timedelta(weeks=1)
            idx += 1

    elif meeting.frequency == "monthly":
        dom = meeting.day_of_month or 1
        cur = meeting.start_date.replace(day=1)
        while cur <= end:
            import calendar
            last_day = calendar.monthrange(cur.year, cur.month)[1]
            actual_day = min(dom, last_day)
            d = cur.replace(day=actual_day)
            if d >= meeting.start_date and d <= end:
                sessions.append(MeetingSession(
                    meeting_id=meeting.id,
                    session_date=d,
                    opens_at=_opens_at(d, "monthly"),
                    title=_session_title(d, "monthly", idx),
                ))
                idx += 1
            # next month
            if cur.month == 12:
                cur = cur.replace(year=cur.year + 1, month=1)
            else:
                cur = cur.replace(month=cur.month + 1)

    elif meeting.frequency == "quarterly":
        dom = meeting.day_of_month or 1
        # Start from the quarter containing start_date
        cur_q_start = meeting.start_date.replace(
            month=((meeting.start_date.month - 1) // 3) * 3 + 1, day=1)
        moq = (meeting.month_of_quarter or 1) - 1  # 0-based offset within quarter
        while cur_q_start <= end:
            import calendar
            m = cur_q_start.month + moq
            if m > 12:
                m -= 12
                y = cur_q_start.year + 1
            else:
                y = cur_q_start.year
            last_day = calendar.monthrange(y, m)[1]
            actual_day = min(dom, last_day)
            d = date(y, m, actual_day)
            if d >= meeting.start_date and d <= end:
                sessions.append(MeetingSession(
                    meeting_id=meeting.id,
                    session_date=d,
                    opens_at=_opens_at(d, "quarterly"),
                    title=_session_title(d, "quarterly", idx),
                ))
                idx += 1
            # next quarter
            if cur_q_start.month >= 10:
                cur_q_start = cur_q_start.replace(year=cur_q_start.year + 1, month=1)
            else:
                cur_q_start = cur_q_start.replace(month=cur_q_start.month + 3)

    return sessions


# ── Helpers ───────────────────────────────────────────────────────────────────

def _session_status(s: MeetingSession) -> str:
    now = datetime.now(timezone.utc)
    if now < s.opens_at.replace(tzinfo=None) if s.opens_at.tzinfo else s.opens_at:
        return "upcoming"
    today = date.today()
    if s.session_date < today:
        return "completed"
    return "open"


def _is_admin(user: User) -> bool:
    return user.role == UserRole.ADMIN.value


def _can_access_meeting(meeting: PeriodicMeeting, user: User) -> bool:
    if _is_admin(user) or meeting.created_by == user.id:
        return True
    return any(p.user_id == user.id for p in meeting.participants)


def _ensure_meeting_access(meeting: PeriodicMeeting, user: User):
    if not _can_access_meeting(meeting, user):
        raise HTTPException(status_code=403, detail="Permission denied for this meeting")


def _get_session_with_meeting(session_id: int, db: Session) -> MeetingSession:
    session = (db.query(MeetingSession)
               .options(joinedload(MeetingSession.meeting)
                        .joinedload(PeriodicMeeting.participants)
                        .joinedload(PeriodicMeetingParticipant.user))
               .filter(MeetingSession.id == session_id)
               .first())
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _meeting_to_out(m: PeriodicMeeting) -> MeetingOut:
    participants = []
    for p in m.participants:
        participants.append(ParticipantOut(
            id=p.user.id,
            full_name=p.user.full_name,
            email=p.user.email,
            avatar_url=p.user.avatar_url if hasattr(p.user, 'avatar_url') else None,
            position=p.user.position if hasattr(p.user, 'position') else None,
            role=p.role,
        ))
    today = date.today()
    next_s = next((s.session_date for s in m.sessions if s.session_date >= today), None)
    return MeetingOut(
        id=m.id, title=m.title, frequency=m.frequency,
        day_of_week=m.day_of_week, day_of_month=m.day_of_month,
        month_of_quarter=m.month_of_quarter,
        start_date=m.start_date, end_date=m.end_date,
        description=m.description, created_by=m.created_by,
        is_active=m.is_active,
        participants=participants,
        session_count=len(m.sessions),
        next_session=next_s,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[MeetingOut])
def list_meetings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = (db.query(PeriodicMeeting)
             .options(joinedload(PeriodicMeeting.participants).joinedload(PeriodicMeetingParticipant.user),
                      joinedload(PeriodicMeeting.sessions))
             .filter(PeriodicMeeting.is_active == True))
    if not _is_admin(current_user):
        query = query.filter(
            (PeriodicMeeting.created_by == current_user.id) |
            PeriodicMeeting.participants.any(PeriodicMeetingParticipant.user_id == current_user.id)
        )
    meetings = query.order_by(PeriodicMeeting.created_at.desc()).all()
    return [_meeting_to_out(m) for m in meetings]


@router.post("/", response_model=MeetingOut, status_code=status.HTTP_201_CREATED)
def create_meeting(data: MeetingIn, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    meeting = PeriodicMeeting(
        title=data.title, frequency=data.frequency,
        day_of_week=data.day_of_week, day_of_month=data.day_of_month,
        month_of_quarter=data.month_of_quarter,
        start_date=data.start_date, end_date=data.end_date,
        description=data.description, created_by=current_user.id,
    )
    db.add(meeting)
    db.flush()  # get id before generating sessions

    # Add participants (creator is always organizer)
    pids = set(data.participant_ids)
    pids.add(current_user.id)
    for uid in pids:
        role = "organizer" if uid == current_user.id else "participant"
        db.add(PeriodicMeetingParticipant(meeting_id=meeting.id, user_id=uid, role=role))

    # Auto-generate sessions
    sessions = _generate_sessions(meeting)
    for s in sessions:
        db.add(s)

    db.commit()
    db.refresh(meeting)
    # Reload with relationships
    meeting = (db.query(PeriodicMeeting)
               .options(joinedload(PeriodicMeeting.participants).joinedload(PeriodicMeetingParticipant.user),
                        joinedload(PeriodicMeeting.sessions))
               .filter(PeriodicMeeting.id == meeting.id).first())

    # Notify participants (exclude creator/organizer)
    notify_ids = [uid for uid in pids if uid != current_user.id]
    if notify_ids:
        notify_meeting_assigned(db, meeting.title, notify_ids, current_user)

    return _meeting_to_out(meeting)


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: int, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    m = (db.query(PeriodicMeeting)
         .options(joinedload(PeriodicMeeting.participants).joinedload(PeriodicMeetingParticipant.user),
                  joinedload(PeriodicMeeting.sessions))
         .filter(PeriodicMeeting.id == meeting_id).first())
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    _ensure_meeting_access(m, current_user)
    return _meeting_to_out(m)


class MeetingPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    end_date: Optional[date] = None
    participant_ids: Optional[List[int]] = None


@router.patch("/{meeting_id}", response_model=MeetingOut)
def patch_meeting(meeting_id: int, data: MeetingPatch, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    m = db.query(PeriodicMeeting).options(
        joinedload(PeriodicMeeting.participants).joinedload(PeriodicMeetingParticipant.user),
        joinedload(PeriodicMeeting.sessions)
    ).filter(PeriodicMeeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    if not (_is_admin(current_user) or m.created_by == current_user.id):
        raise HTTPException(status_code=403, detail="Only meeting creator or admin can update")
    if data.title is not None:
        m.title = data.title
    if data.description is not None:
        m.description = data.description
    if data.end_date is not None:
        m.end_date = data.end_date
    newly_added_ids: set = set()
    if data.participant_ids is not None:
        existing_ids = {p.user_id for p in m.participants}
        db.query(PeriodicMeetingParticipant).filter(
            PeriodicMeetingParticipant.meeting_id == meeting_id
        ).delete()
        new_ids = set(data.participant_ids)
        for uid in new_ids:
            role = "organizer" if uid == m.created_by else "participant"
            db.add(PeriodicMeetingParticipant(meeting_id=meeting_id, user_id=uid, role=role))
        newly_added_ids = new_ids - existing_ids - {current_user.id}
    db.commit()
    db.refresh(m)
    if newly_added_ids:
        notify_meeting_assigned(db, m.title, list(newly_added_ids), current_user)
    return _meeting_to_out(m)


@router.delete("/{meeting_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meeting(meeting_id: int, db: Session = Depends(get_db),
                   current_user: User = Depends(get_current_user)):
    m = db.query(PeriodicMeeting).filter(PeriodicMeeting.id == meeting_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Not found")
    if not (_is_admin(current_user) or m.created_by == current_user.id):
        raise HTTPException(status_code=403, detail="Only meeting creator or admin can delete")
    m.is_active = False
    db.commit()


@router.get("/{meeting_id}/sessions", response_model=List[SessionOut])
def list_sessions(meeting_id: int, db: Session = Depends(get_db),
                  current_user: User = Depends(get_current_user)):
    meeting = (db.query(PeriodicMeeting)
               .options(joinedload(PeriodicMeeting.participants))
               .filter(PeriodicMeeting.id == meeting_id)
               .first())
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    _ensure_meeting_access(meeting, current_user)
    sessions = (db.query(MeetingSession)
                .options(joinedload(MeetingSession.agenda_items))
                .filter(MeetingSession.meeting_id == meeting_id)
                .order_by(MeetingSession.session_date)
                .all())
    result = []
    for s in sessions:
        submitted = list({item.user_id for item in s.agenda_items})
        result.append(SessionOut(
            id=s.id, meeting_id=s.meeting_id,
            session_date=s.session_date, opens_at=s.opens_at,
            title=s.title, status=_session_status(s),
            notes=s.notes,
            agenda_count=len(s.agenda_items),
            submitted_user_ids=submitted,
        ))
    return result


@router.get("/sessions/{session_id}/agenda", response_model=List[AgendaItemOut])
def get_agenda(session_id: int, db: Session = Depends(get_db),
               current_user: User = Depends(get_current_user)):
    session = _get_session_with_meeting(session_id, db)
    _ensure_meeting_access(session.meeting, current_user)
    items = (db.query(MeetingAgendaItem)
             .options(joinedload(MeetingAgendaItem.user))
             .filter(MeetingAgendaItem.session_id == session_id)
             .order_by(MeetingAgendaItem.created_at)
             .all())
    return [AgendaItemOut(
        id=i.id, session_id=i.session_id, user_id=i.user_id,
        user_name=i.user.full_name if i.user else None,
        user_avatar=getattr(i.user, 'avatar_url', None),
        content=i.content, item_type=i.item_type,
        created_at=i.created_at, updated_at=i.updated_at,
    ) for i in items]


@router.post("/sessions/{session_id}/agenda", response_model=AgendaItemOut,
             status_code=status.HTTP_201_CREATED)
def add_agenda_item(session_id: int, data: AgendaItemIn,
                    db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    session = _get_session_with_meeting(session_id, db)
    _ensure_meeting_access(session.meeting, current_user)
    item = MeetingAgendaItem(
        session_id=session_id, user_id=current_user.id,
        content=data.content, item_type=data.item_type,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    db.refresh(item, ["user"])
    return AgendaItemOut(
        id=item.id, session_id=item.session_id, user_id=item.user_id,
        user_name=current_user.full_name,
        user_avatar=getattr(current_user, 'avatar_url', None),
        content=item.content, item_type=item.item_type,
        created_at=item.created_at, updated_at=item.updated_at,
    )


@router.put("/sessions/agenda/{item_id}", response_model=AgendaItemOut)
def update_agenda_item(item_id: int, data: AgendaItemIn,
                       db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    item = (db.query(MeetingAgendaItem)
            .options(joinedload(MeetingAgendaItem.session)
                     .joinedload(MeetingSession.meeting)
                     .joinedload(PeriodicMeeting.participants))
            .filter(MeetingAgendaItem.id == item_id)
            .first())
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    _ensure_meeting_access(item.session.meeting, current_user)
    if item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your item")
    item.content = data.content
    item.item_type = data.item_type
    db.commit()
    db.refresh(item)
    return AgendaItemOut(
        id=item.id, session_id=item.session_id, user_id=item.user_id,
        user_name=current_user.full_name,
        user_avatar=getattr(current_user, 'avatar_url', None),
        content=item.content, item_type=item.item_type,
        created_at=item.created_at, updated_at=item.updated_at,
    )


@router.delete("/sessions/agenda/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agenda_item(item_id: int, db: Session = Depends(get_db),
                       current_user: User = Depends(get_current_user)):
    item = (db.query(MeetingAgendaItem)
            .options(joinedload(MeetingAgendaItem.session)
                     .joinedload(MeetingSession.meeting)
                     .joinedload(PeriodicMeeting.participants))
            .filter(MeetingAgendaItem.id == item_id)
            .first())
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    _ensure_meeting_access(item.session.meeting, current_user)
    if item.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your item")
    db.delete(item)
    db.commit()


@router.patch("/sessions/{session_id}/notes")
def update_session_notes(session_id: int, body: dict,
                         db: Session = Depends(get_db),
                         current_user: User = Depends(get_current_user)):
    s = _get_session_with_meeting(session_id, db)
    if not (_is_admin(current_user) or s.meeting.created_by == current_user.id):
        raise HTTPException(status_code=403, detail="Only meeting creator or admin can update notes")
    s.notes = body.get("notes", s.notes)
    db.commit()
    return {"ok": True}


@router.post("/sessions/check-open")
def check_open_sessions(db: Session = Depends(get_db),
                        current_user: User = Depends(get_current_user)):
    """Tìm các phiên vừa mở và gửi thông báo cho participants. Chỉ admin."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Admin only")

    now = datetime.now(timezone.utc)
    sessions = (db.query(MeetingSession)
                .options(joinedload(MeetingSession.meeting)
                         .joinedload(PeriodicMeeting.participants))
                .filter(
                    MeetingSession.opens_at <= now,
                    MeetingSession.session_date >= date.today(),
                    MeetingSession.notified_open == False,  # noqa: E712
                )
                .all())

    count = 0
    for s in sessions:
        participant_ids = [p.user_id for p in s.meeting.participants]
        if participant_ids:
            notify_meeting_session_open(
                db, s.title, s.meeting.title, participant_ids,
                session_id=s.id, meeting_id=s.meeting_id,
            )
        s.notified_open = True
        count += 1

    if count:
        db.commit()

    return {"sessions_notified": count}
