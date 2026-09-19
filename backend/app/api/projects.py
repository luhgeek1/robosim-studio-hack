from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..data.parameters import OBJECT_TYPES, by_key
from ..db import get_db
from ..ml.providers import get_import_provider
from ..models import Project, ProjectParameter
from ..schemas import ConfidenceReport, NormalizedDocument, ParameterValue, RawRecord, ValidationIssue
from ..services.confidence import confidence_report
from ..services.parsers import parse_upload
from ..services.recommendation import params_of
from ..services.validator import validate
from .deps import get_project

router = APIRouter(prefix="/api", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    object_type: str = "warehouse"
    address: str = ""


class ProjectOut(BaseModel):
    id: str
    name: str
    object_type: str
    object_type_label: str
    address: str
    source_file: str
    imported_at: datetime | None
    created_at: datetime
    version: int
    confidence: int | None
    recognized: int | None
    total: int | None
    selected_robot_id: str | None
    selected_count: int | None
    supported: bool


def _label(t: str) -> str:
    return next((o["label"] for o in OBJECT_TYPES if o["id"] == t), t)


def _out(p: Project) -> ProjectOut:
    rep = p.import_report or {}
    return ProjectOut(id=p.id, name=p.name, object_type=p.object_type, object_type_label=_label(p.object_type), address=p.address, source_file=p.source_file,
                      imported_at=p.imported_at, created_at=p.created_at, version=p.version, confidence=rep.get("confidence"), recognized=rep.get("recognized"),
                      total=rep.get("total"), selected_robot_id=p.selected_robot_id, selected_count=p.selected_count,
                      supported=next((o["supported"] for o in OBJECT_TYPES if o["id"] == p.object_type), False))


@router.get("/object-types")
def object_types():
    return OBJECT_TYPES


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return [_out(p) for p in db.query(Project).order_by(Project.created_at.desc()).all()]


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    if body.object_type not in {o["id"] for o in OBJECT_TYPES}:
        raise HTTPException(422, "Неизвестный тип объекта")
    p = Project(name=body.name.strip() or "Новый проект", object_type=body.object_type, address=body.address)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _out(p)


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_one(project: Project = Depends(get_project)):
    return _out(project)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project: Project = Depends(get_project), db: Session = Depends(get_db)):
    db.delete(project)
    db.commit()


def _apply_import(db: Session, project: Project, doc: NormalizedDocument, source_file: str) -> dict:
    for old in list(project.parameters):
        db.delete(old)
    for p in doc.parameters:
        db.add(ProjectParameter(project_id=project.id, key=p.key, value=p.value, unit=p.unit, source=p.source, source_value=p.source_value, confidence=p.confidence, note=p.note))
    rep = confidence_report(doc.object_type, doc.parameters, doc.warnings)
    project.source_file = source_file
    project.imported_at = datetime.now(timezone.utc)
    project.version += 1
    project.selected_robot_id = None
    project.selected_count = None
    project.import_report = {"confidence": rep.score, "recognized": rep.recognized, "total": rep.total, "provider": doc.provider,
                             "unmapped": [u.model_dump() for u in doc.unmapped[:50]], "warnings": doc.warnings}
    db.commit()
    return project.import_report


class ImportOut(BaseModel):
    project: ProjectOut
    confidence: int
    recognized: int
    total: int
    provider: str
    unmapped: list[RawRecord]
    warnings: list[str]


@router.post("/projects/{project_id}/import", response_model=ImportOut)
async def import_file(file: UploadFile = File(...), project: Project = Depends(get_project), db: Session = Depends(get_db)):
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(413, "Файл больше 20 МБ")
    try:
        records = parse_upload(file.filename or "upload", content)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, f"Не удалось прочитать файл: {e}") from e
    if not records:
        raise HTTPException(422, "В файле не найдено параметров")
    doc = get_import_provider().normalize(records, project.object_type)
    rep = _apply_import(db, project, doc, file.filename or "upload")
    return ImportOut(project=_out(project), **{k: rep[k] for k in ("confidence", "recognized", "total", "provider", "unmapped", "warnings")})


@router.post("/projects/{project_id}/import/demo", response_model=ImportOut)
def import_demo(project: Project = Depends(get_project), db: Session = Depends(get_db)):
    """Loads the bundled demo document for the project's object type."""
    if project.object_type == "warehouse":
        path = settings.sample_dir / "warehouse_moscow_01.json"
        records = parse_upload(path.name, path.read_bytes())
        name = path.name
    else:
        sheet = {"airport": "Аэропорт", "medical": "Медучреждение"}[project.object_type]
        records = _dataset_sheet(sheet)
        name = f"Датасеты_хакатон.xlsx / {sheet}"
    doc = get_import_provider().normalize(records, project.object_type)
    rep = _apply_import(db, project, doc, name)
    return ImportOut(project=_out(project), **{k: rep[k] for k in ("confidence", "recognized", "total", "provider", "unmapped", "warnings")})


def _dataset_sheet(sheet: str) -> list[RawRecord]:
    import openpyxl

    from ..services.parsers import _rows_to_records

    wb = openpyxl.load_workbook(settings.dataset_xlsx, data_only=True, read_only=True)
    ws = wb[sheet]
    return _rows_to_records([list(r) for r in ws.iter_rows(values_only=True)], sheet)


class ParametersOut(BaseModel):
    groups: list[dict[str, Any]]
    parameters: list[ParameterValue]
    validation: list[ValidationIssue]


@router.get("/projects/{project_id}/parameters", response_model=ParametersOut)
def parameters(project: Project = Depends(get_project)):
    params = params_of(project)
    defs = by_key(project.object_type)
    groups: dict[str, list] = {}
    for d in defs.values():
        p = params.get(d.key)
        if p is None:
            continue
        groups.setdefault(d.group, []).append(p.model_dump())
    return ParametersOut(groups=[{"title": k, "items": v} for k, v in groups.items()], parameters=list(params.values()),
                         validation=validate(project.object_type, params))


class ParameterPatch(BaseModel):
    values: dict[str, Any]


@router.patch("/projects/{project_id}/parameters", response_model=ParametersOut)
def patch_parameters(body: ParameterPatch, project: Project = Depends(get_project), db: Session = Depends(get_db)):
    defs = by_key(project.object_type)
    existing = {p.key: p for p in project.parameters}
    for key, value in body.values.items():
        d = defs.get(key)
        if d is None:
            raise HTTPException(422, f"Неизвестный параметр {key}")
        p = existing.get(key) or ProjectParameter(project_id=project.id, key=key, unit=d.unit)
        p.value, p.source, p.confidence, p.source_value, p.note = value, "confirmed", 1.0, "введено пользователем", ""
        p.updated_at = datetime.now(timezone.utc)
        db.add(p)
    project.version += 1
    params = params_of(project)
    rep = confidence_report(project.object_type, list(params.values()))
    project.import_report = {**(project.import_report or {}), "confidence": rep.score, "recognized": rep.recognized, "total": rep.total}
    db.commit()
    db.refresh(project)
    return parameters(project)


@router.get("/projects/{project_id}/confidence", response_model=ConfidenceReport)
def confidence(project: Project = Depends(get_project)):
    params = list(params_of(project).values())
    return confidence_report(project.object_type, params, (project.import_report or {}).get("warnings", []))


class SelectionBody(BaseModel):
    robot_id: str | None = None
    count: int | None = None


@router.put("/projects/{project_id}/selection", response_model=ProjectOut)
def set_selection(body: SelectionBody, project: Project = Depends(get_project), db: Session = Depends(get_db)):
    if body.robot_id is not None:
        project.selected_robot_id = body.robot_id
    if body.count is not None:
        project.selected_count = body.count
    db.commit()
    db.refresh(project)
    return _out(project)


@router.get("/projects/{project_id}/export")
def export_project(project: Project = Depends(get_project)):
    """Canonical JSON of the project (what the ML team's importer must produce)."""
    return json.loads(json.dumps({"object_type": project.object_type, "parameters": [p.model_dump() for p in params_of(project).values()]}, default=str))
