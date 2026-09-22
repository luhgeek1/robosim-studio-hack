from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Project, Robot


def get_project(project_id: str, db: Session = Depends(get_db)) -> Project:
    p = db.get(Project, project_id)
    if p is None:
        raise HTTPException(404, "Проект не найден")
    return p


def get_robot(db: Session, robot_id: str) -> Robot:
    r = db.get(Robot, robot_id)
    if r is None:
        raise HTTPException(404, "Робот не найден в каталоге")
    return r
