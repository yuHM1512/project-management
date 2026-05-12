import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Mtcl, User
from schemas import MtclResponse, MtclUpdate
from routers.auth import get_current_user, require_admin


router = APIRouter()


def clean_mtcl_text(value: str) -> str:
    text = re.sub(r"\s*\[[^\]]+\]", "", value or "")
    return re.sub(r"\s+", " ", text).strip()


@router.get("/", response_model=List[MtclResponse])
def list_mtcl(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = db.query(Mtcl).order_by(Mtcl.objective_group.asc(), Mtcl.id.asc()).all()
    return items


@router.put("/{item_id}", response_model=MtclResponse)
def update_mtcl(
    item_id: int,
    payload: MtclUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    item = db.query(Mtcl).filter(Mtcl.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="MTCL item not found")

    data = payload.model_dump(exclude_unset=True)
    if "objective_group" in data:
        data["objective_group"] = clean_mtcl_text(data["objective_group"])
    if "description" in data:
        data["description"] = clean_mtcl_text(data["description"])
    if "units" in data and data["units"] is not None:
        cleaned_units = []
        for unit in data["units"]:
            clean_unit = clean_mtcl_text(unit)
            if clean_unit and clean_unit not in cleaned_units:
                cleaned_units.append(clean_unit)
        data["units"] = cleaned_units

    for key, value in data.items():
        setattr(item, key, value)

    db.commit()
    db.refresh(item)
    return item
