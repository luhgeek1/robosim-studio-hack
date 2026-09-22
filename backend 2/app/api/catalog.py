from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Robot
from ..schemas import RobotOut
from ..services.catalog import to_out
from .deps import get_robot

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/robots", response_model=list[RobotOut])
def robots(scenario: str | None = None, with_specs: bool = False, db: Session = Depends(get_db)):
    q = db.query(Robot)
    rows = q.all()
    if scenario:
        rows = [r for r in rows if scenario.lower() in r.scenario.lower()]
    if with_specs:
        rows = [r for r in rows if r.specs]
    return [to_out(r) for r in rows]


@router.get("/robots/{robot_id}", response_model=RobotOut)
def robot(robot_id: str, db: Session = Depends(get_db)):
    return to_out(get_robot(db, robot_id))


@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    rows = db.query(Robot).all()
    return {"total": len(rows), "with_specs": sum(1 for r in rows if r.specs), "scenarios": sorted({r.scenario for r in rows if r.scenario})}
