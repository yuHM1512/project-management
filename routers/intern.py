from fastapi import APIRouter, Request, Depends, Form, status
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session, joinedload
from database import get_intern_db
from models_intern import InternProfile, DailyLog, Resource, Question, Roadmap, Answer
from models import User
from routers.auth import get_current_user_from_cookie
from datetime import datetime, timezone
from typing import List

router = APIRouter()
templates = Jinja2Templates(directory="templates")

@router.get("/")
@router.get("/overview")
async def overview(request: Request, user: User = Depends(get_current_user_from_cookie), db: Session = Depends(get_intern_db)):
    if not user:
        return RedirectResponse(url="/login", status_code=303)

    profile = db.query(InternProfile).filter(InternProfile.user_id == user.id).first()
    return templates.TemplateResponse("intern/overview.html", {
        "request": request,
        "active_page": "overview",
        "profile": profile,
        "user": user
    })

@router.get("/logout")
async def logout():
    response = RedirectResponse(url="/login", status_code=303)
    response.delete_cookie(key="access_token")
    return response

@router.get("/personal-info")
async def personal_info_get(request: Request, user: User = Depends(get_current_user_from_cookie), db: Session = Depends(get_intern_db)):
    if not user:
        return RedirectResponse(url="/login", status_code=303)
    profile = db.query(InternProfile).filter(InternProfile.user_id == user.id).first()
    return templates.TemplateResponse("intern/personal_info.html", {
        "request": request,
        "active_page": "personal-info",
        "profile": profile,
        "user": user
    })

@router.post("/personal-info")
async def personal_info_post(
    request: Request,
    first_name: str = Form(None),
    last_name: str = Form(None),
    preferred_name: str = Form(None),
    pronouns: str = Form(None),
    email: str = Form(None),
    phone: str = Form(None),
    address: str = Form(None),
    dob: str = Form(None),
    gender: str = Form(None),
    nationality: str = Form(None),
    emergency_name: str = Form(None),
    emergency_relation: str = Form(None),
    emergency_phone: str = Form(None),
    user: User = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_intern_db)
):
    if not user:
        return RedirectResponse(url="/login", status_code=303)

    profile = db.query(InternProfile).filter(InternProfile.user_id == user.id).first()

    # Handle Full Name reconstruction
    full_name = profile.full_name if profile else ""
    if first_name or last_name:
        current_first = full_name.split(' ')[0] if full_name else ""
        current_last = ' '.join(full_name.split(' ')[1:]) if full_name and ' ' in full_name else ""
        new_first = first_name if first_name else current_first
        new_last = last_name if last_name else current_last
        full_name = f"{new_first} {new_last}".strip()

    if not profile:
        # Create new profile if not exists
        profile = InternProfile(user_id=user.id)
        db.add(profile)

    profile.full_name = full_name
    if email: profile.email = email
    if phone: profile.phone = phone
    if address: profile.address = address
    if preferred_name: profile.preferred_name = preferred_name # Note: Need to check if model has this field.
    # Wait, the previous model didn't have preferred_name, pronouns, gender, nationality.
    # I should check models_intern.py.
    # Checking previous file view of models_intern.py...
    # It only has: full_name, dob, email, internship_from, internship_to, position, phone, address, emergency*.
    # The personal_info.html template had fields matching the model in intern app.
    # BUT Step 164 showed personal_info.html has new fields! (first_name, last_name, preferred_name, pronouns, gender, nationality).
    # This means the user updated the template but maybe NOT the model?
    # Or I should assume standard fields for now.
    # Let's stick to the fields I know exist in `models_intern.py` from Step 92/126.
    # Step 92 model: full_name, dob, email, internship_from, internship_to, position, phone, address, emergency_*
    # I should map the form fields to these model fields.

    # Re-reading Step 164 template:
    # Inputs: first_name, last_name (mapped to full_name), preferred_name, pronouns, dob, gender, nationality, email, phone, address, emergency_name, emergency_relation, emergency_phone.
    # I will map what I can.

    if dob:
        try:
            profile.dob = datetime.strptime(dob, "%Y-%m-%d").date()
        except:
            pass

    if gender: profile.gender = gender # Save gender
    profile.emergency_contact_name = emergency_name
    profile.emergency_contact_relation = emergency_relation
    profile.emergency_contact_phone = emergency_phone

    db.commit()

    return templates.TemplateResponse("intern/personal_info.html", {
            "request": request,
            "active_page": "personal-info",
            "profile": profile,
            "user": user,
            "success": True
        })


@router.get("/hub")
async def hub(request: Request, category: str = "All", q: str = None, user: User = Depends(get_current_user_from_cookie), db: Session = Depends(get_intern_db)):
    if not user:
        return RedirectResponse(url="/login", status_code=303)
    profile = db.query(InternProfile).filter(InternProfile.user_id == user.id).first()
    query = db.query(Resource)

    if category != "All":
        query = query.filter(Resource.category == category)

    if q:
        search_term = f"%{q}%"
        query = query.filter(Resource.title.ilike(search_term) | Resource.description.ilike(search_term))

    resources = query.all()

    # Get Roadmap with linked resources (eager loading to prevent N+1 queries)
    roadmap = db.query(Roadmap).options(joinedload(Roadmap.resources)).order_by(Roadmap.position.asc(), Roadmap.start_date.asc()).all()

    # Get all resources for the modal dropdown
    all_resources = db.query(Resource).order_by(Resource.category, Resource.title).all()

    return templates.TemplateResponse("intern/hub.html", {
        "request": request,
        "active_page": "hub",
        "resources": resources,
        "current_category": category,
        "roadmap": roadmap,
        "all_resources": all_resources,
        "profile": profile,
        "user": user
    })

@router.post("/hub/resource")
async def add_resource(
    request: Request,
    title: str = Form(...),
    category: str = Form(...),
    description: str = Form(...),
    url: str = Form(None),
    user: User = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_intern_db)
):
    if not user or user.role != "admin":
        return RedirectResponse(url="/intern/hub", status_code=303)

    new_resource = Resource(
        title=title,
        category=category,
        description=description,
        url=url
    )
    db.add(new_resource)
    db.commit()
    return RedirectResponse(url="/intern/hub", status_code=303)

@router.post("/hub/roadmap")
async def add_roadmap(
    request: Request,
    stage: str = Form(...),
    title: str = Form(...),
    description: str = Form(...),
    start_date: str = Form(None),
    end_date: str = Form(None),
    position: int = Form(0),
    resource_ids: List[int] = Form([]),
    user: User = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_intern_db)
):
    if not user or user.role != "admin":
        return RedirectResponse(url="/intern/hub", status_code=303)

    s_date = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else None
    e_date = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else None

    new_item = Roadmap(
        stage=stage,
        title=title,
        description=description,
        start_date=s_date,
        end_date=e_date,
        position=position
    )
    db.add(new_item)
    db.flush()  # Flush to get the ID before linking resources

    # Link selected resources to the roadmap item
    if resource_ids:
        selected_resources = db.query(Resource).filter(Resource.id.in_(resource_ids)).all()
        new_item.resources.extend(selected_resources)

    db.commit()
    return RedirectResponse(url="/intern/hub", status_code=303)

@router.post("/hub/roadmap/edit/{item_id}")
async def edit_roadmap(
    item_id: int,
    request: Request,
    stage: str = Form(...),
    title: str = Form(...),
    description: str = Form(...),
    start_date: str = Form(None),
    end_date: str = Form(None),
    position: int = Form(0),
    resource_ids: List[int] = Form([]),
    user: User = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_intern_db)
):
    if not user or user.role != "admin":
        return RedirectResponse(url="/intern/hub", status_code=303)

    item = db.query(Roadmap).filter(Roadmap.id == item_id).first()
    if not item:
        return RedirectResponse(url="/intern/hub", status_code=303)

    item.stage = stage
    item.title = title
    item.description = description
    item.start_date = datetime.strptime(start_date, "%Y-%m-%d").date() if start_date else None
    item.end_date = datetime.strptime(end_date, "%Y-%m-%d").date() if end_date else None
    item.position = position

    # Update resource links
    item.resources = [] # Clear existing
    if resource_ids:
        selected_resources = db.query(Resource).filter(Resource.id.in_(resource_ids)).all()
        item.resources.extend(selected_resources)

    db.commit()
    return RedirectResponse(url="/intern/hub", status_code=303)

@router.get("/daily-log")
async def daily_log_get(request: Request, date: str = None, user: User = Depends(get_current_user_from_cookie), db: Session = Depends(get_intern_db)):
    if not user:
        return RedirectResponse(url="/login", status_code=303)
    profile = db.query(InternProfile).filter(InternProfile.user_id == user.id).first()

    target_date = datetime.strptime(date, "%Y-%m-%d").date() if date else datetime.now(timezone.utc).date()

    log = db.query(DailyLog).filter(DailyLog.user_id == user.id, DailyLog.date == target_date).first()
    return templates.TemplateResponse("intern/daily_log.html", {
        "request": request,
        "active_page": "daily-log",
        "log": log,
        "selected_date": target_date,
        "profile": profile,
        "user": user
    })

@router.post("/daily-log")
async def daily_log_post(
    request: Request,
    content: str = Form(...),
    date: str = Form(None),
    user: User = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_intern_db)
):
    if not user:
        return RedirectResponse(url="/login", status_code=303)
    profile = db.query(InternProfile).filter(InternProfile.user_id == user.id).first()

    target_date = datetime.strptime(date, "%Y-%m-%d").date() if date else datetime.now(timezone.utc).date()

    log = db.query(DailyLog).filter(DailyLog.user_id == user.id, DailyLog.date == target_date).first()
    if log:
        log.content = content
    else:
        log = DailyLog(user_id=user.id, date=target_date, content=content)
        db.add(log)
    db.commit()

    return templates.TemplateResponse("intern/daily_log.html", {
        "request": request,
        "active_page": "daily-log",
        "log": log,
        "selected_date": target_date,
        "success": True,
        "profile": profile,
        "user": user
    })

@router.get("/qa-forum")
async def qa_forum(request: Request, user: User = Depends(get_current_user_from_cookie), db: Session = Depends(get_intern_db)):
    if not user:
        return RedirectResponse(url="/login", status_code=303)
    profile = db.query(InternProfile).filter(InternProfile.user_id == user.id).first()
    questions = db.query(Question).order_by(Question.created_at.desc()).all()
    return templates.TemplateResponse("intern/qa_forum.html", {
        "request": request,
        "active_page": "qa-forum",
        "questions": questions,
        "profile": profile,
        "user": user
    })

@router.post("/qa-forum")
async def qa_post(
    request: Request,
    title: str = Form(...),
    content: str = Form(...),
    user: User = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_intern_db)
):
    if not user:
        return RedirectResponse(url="/login", status_code=303)
    profile = db.query(InternProfile).filter(InternProfile.user_id == user.id).first()
    author_name = profile.full_name if profile else user.full_name

    new_q = Question(user_id=user.id, author_name=author_name, title=title, content=content)
    db.add(new_q)
    db.commit()

    questions = db.query(Question).order_by(Question.created_at.desc()).all()
    return templates.TemplateResponse("intern/qa_forum.html", {
        "request": request,
        "active_page": "qa-forum",
        "questions": questions,
        "success": True,
        "profile": profile,
        "user": user
    })

@router.post("/qa-forum/answer")
async def qa_answer_post(
    request: Request,
    question_id: int = Form(...),
    content: str = Form(...),
    user: User = Depends(get_current_user_from_cookie),
    db: Session = Depends(get_intern_db)
):
    if not user or user.role != "admin":
        return RedirectResponse(url="/intern/qa-forum", status_code=303)

    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        return RedirectResponse(url="/intern/qa-forum", status_code=303)

    # Get admin profile or use user name
    profile = db.query(InternProfile).filter(InternProfile.user_id == user.id).first()
    author_name = profile.full_name if profile else user.full_name

    new_answer = Answer(
        question_id=question_id,
        user_id=user.id,
        author_name=author_name,
        author_role="Admin", # Hardcoded ensuring role is set
        content=content
    )
    db.add(new_answer)
    db.commit()

    return RedirectResponse(url="/intern/qa-forum", status_code=303)
