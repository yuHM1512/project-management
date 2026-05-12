from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from database import get_db
import models
import schemas
from routers.auth import require_admin

router = APIRouter(
    prefix="/api/mes",
    tags=["mes"]
)

@router.get("/all", response_model=schemas.MESAllContentResponse)
def get_all_mes_content(db: Session = Depends(get_db)):
    """Fetch all MES content for the frontend."""
    kpis = db.query(models.MESKPI).order_by(models.MESKPI.order).all()
    map_nodes = db.query(models.MESMapNode).order_by(models.MESMapNode.order).all()
    details = db.query(models.MESModuleDetail).order_by(models.MESModuleDetail.pillar, models.MESModuleDetail.order).all()

    return {
        "kpis": kpis,
        "map_nodes": map_nodes,
        "module_details": details
    }

# --- KPI Management ---

@router.get("/kpis", response_model=List[schemas.MESKPIResponse])
def get_kpis(db: Session = Depends(get_db)):
    return db.query(models.MESKPI).order_by(models.MESKPI.order).all()

@router.post("/kpis", response_model=schemas.MESKPIResponse)
def create_kpi(kpi: schemas.MESKPICreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    db_kpi = models.MESKPI(**kpi.model_dump())
    db.add(db_kpi)
    db.commit()
    db.refresh(db_kpi)
    return db_kpi

@router.put("/kpis/{kpi_id}", response_model=schemas.MESKPIResponse)
def update_kpi(kpi_id: int, kpi: schemas.MESKPIUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    db_kpi = db.query(models.MESKPI).filter(models.MESKPI.id == kpi_id).first()
    if not db_kpi:
        raise HTTPException(status_code=404, detail="KPI not found")

    update_data = kpi.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_kpi, key, value)

    db.commit()
    db.refresh(db_kpi)
    return db_kpi

@router.delete("/kpis/{kpi_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_kpi(kpi_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    db_kpi = db.query(models.MESKPI).filter(models.MESKPI.id == kpi_id).first()
    if not db_kpi:
        raise HTTPException(status_code=404, detail="KPI not found")
    db.delete(db_kpi)
    db.commit()
    return None

# --- Map Node Management ---

@router.get("/map-nodes", response_model=List[schemas.MESMapNodeResponse])
def get_map_nodes(db: Session = Depends(get_db)):
    return db.query(models.MESMapNode).order_by(models.MESMapNode.order).all()

@router.post("/map-nodes", response_model=schemas.MESMapNodeResponse)
def create_map_node(node: schemas.MESMapNodeCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    db_node = models.MESMapNode(**node.model_dump())
    db.add(db_node)
    db.commit()
    db.refresh(db_node)
    return db_node

@router.put("/map-nodes/{node_id}", response_model=schemas.MESMapNodeResponse)
def update_map_node(node_id: int, node: schemas.MESMapNodeUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    db_node = db.query(models.MESMapNode).filter(models.MESMapNode.id == node_id).first()
    if not db_node:
        raise HTTPException(status_code=404, detail="Map node not found")

    update_data = node.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_node, key, value)

    db.commit()
    db.refresh(db_node)
    return db_node

@router.delete("/map-nodes/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_map_node(node_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    db_node = db.query(models.MESMapNode).filter(models.MESMapNode.id == node_id).first()
    if not db_node:
        raise HTTPException(status_code=404, detail="Map node not found")
    db.delete(db_node)
    db.commit()
    return None

# --- Module Detail Management ---

@router.get("/module-details", response_model=List[schemas.MESModuleDetailResponse])
def get_module_details(db: Session = Depends(get_db)):
    return db.query(models.MESModuleDetail).order_by(models.MESModuleDetail.pillar, models.MESModuleDetail.order).all()

@router.post("/module-details", response_model=schemas.MESModuleDetailResponse)
def create_module_detail(detail: schemas.MESModuleDetailCreate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    db_detail = models.MESModuleDetail(**detail.model_dump())
    db.add(db_detail)
    db.commit()
    db.refresh(db_detail)
    return db_detail

@router.put("/module-details/{detail_id}", response_model=schemas.MESModuleDetailResponse)
def update_module_detail(detail_id: int, detail: schemas.MESModuleDetailUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    db_detail = db.query(models.MESModuleDetail).filter(models.MESModuleDetail.id == detail_id).first()
    if not db_detail:
        raise HTTPException(status_code=404, detail="Module detail not found")

    update_data = detail.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_detail, key, value)

    db.commit()
    db.refresh(db_detail)
    return db_detail

@router.delete("/module-details/{detail_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_module_detail(detail_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    db_detail = db.query(models.MESModuleDetail).filter(models.MESModuleDetail.id == detail_id).first()
    if not db_detail:
        raise HTTPException(status_code=404, detail="Module detail not found")
    db.delete(db_detail)
    db.commit()
    return None
