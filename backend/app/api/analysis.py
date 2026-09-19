from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Project
from ..schemas import ConfigurationsOut, MatchResult, Recommendation, Scenario, SimEvent, SimKpis
from ..services import recommendation as rec
from ..services.validator import validate
from .deps import get_project, get_robot

router = APIRouter(prefix="/api/projects/{project_id}", tags=["analysis"])


def _ensure_supported(project: Project):
    if project.object_type != "warehouse":
        raise HTTPException(409, "Расчётные модули для этого типа объекта ещё не подключены: доступны параметры и достоверность данных")
    if not project.parameters:
        raise HTTPException(409, "Сначала загрузите данные объекта")


class AnalysisOut(BaseModel):
    hourly: list[dict]
    demand: dict
    hours_over_capacity: int
    findings: list[dict]
    requirements: list[dict]
    flow: list[dict]
    validation: list[dict]
    suitable: bool


@router.get("/analysis", response_model=AnalysisOut)
def analysis(project: Project = Depends(get_project), db: Session = Depends(get_db)):
    _ensure_supported(project)
    site = rec.site_of(project, db)
    cur_sla = site.current_sla
    over = sum(1 for v in site.profile if v > site.manual_capacity)
    issues = validate(project.object_type, rec.params_of(project))
    errors = [i for i in issues if i.level == "error"]
    f = lambda v, d=0: f"{v:,.{d}f}".replace(",", " ").replace(".", ",")
    findings = [
        {"tone": "warn", "text": f"{over} часов в сутки поток выше ручной мощности. Это и есть причина срывов SLA — не персонал, а предел скорости ручного перемещения."},
        {"tone": "warn", "text": f"{f(site.current_opex_mln, 1)} млн ₽ в год стоит текущий процесс: {site.operators} операторов и парк техники. Зарплаты растут на {f(site.wage_growth * 100)} % в год."},
        {"tone": "ok" if not errors else "crit", "text": ("Зона пригодна для роботов: " + f"ровный пол ({f(site.floor_flatness_mm)} мм/2м), проходы {f(site.aisle_width_m, 1)} м, стандартные паллеты, WMS ведёт задания.") if not errors else "Есть блокирующие проблемы в данных: " + "; ".join(e.message for e in errors)},
    ]
    return AnalysisOut(
        hourly=[{"hour": h, "value": v} for h, v in enumerate(site.profile)],
        demand={"average": round(site.avg_rate), "peak": round(site.peak_rate), "manual_capacity": round(site.manual_capacity), "required": round(site.peak_rate),
                "sla_target": site.target_sla, "current_sla": round(cur_sla), "current_opex": site.current_opex_mln, "budget": site.budget_mln,
                "daily_total": site.daily_total, "operators": site.operators, "working_hours": site.working_hours},
        hours_over_capacity=over, findings=findings,
        requirements=[{"value": f"≥ {f(site.peak_rate)}", "label": "паллет в час в пик"}, {"value": f"≥ {f(site.target_sla)} %", "label": "отгрузок в срок"},
                      {"value": f"≤ {f(site.budget_mln)} млн ₽", "label": "бюджет"}, {"value": f"{f(site.aisle_width_m, 1)} м", "label": "ширина проходов"}],
        flow=[{"name": "Приёмка", "value": f(site.daily_total / 2), "unit": "паллет / сутки", "note": "узкое место в пик", "tone": "warn"},
              {"name": "Хранение", "value": f(rec.params_of(project).get('pallet_positions').value if rec.params_of(project).get('pallet_positions') and rec.params_of(project)['pallet_positions'].value else 0), "unit": "паллето-мест", "note": "ёмкости достаточно", "tone": "ok"},
              {"name": "Комплектация", "value": f((rec.params_of(project).get('order_lines_per_day').value or 0) / 60 if rec.params_of(project).get('order_lines_per_day') else 0), "unit": "заказов / сутки", "note": "зависит от приёмки", "tone": "neutral"},
              {"name": "Отгрузка", "value": f(site.daily_total / 2), "unit": "паллет / сутки", "note": f"SLA {f(cur_sla)} % в пик", "tone": "warn"}],
        validation=[i.model_dump() for i in issues], suitable=not errors,
    )


@router.get("/matching", response_model=list[MatchResult])
def matching(project: Project = Depends(get_project), db: Session = Depends(get_db)):
    _ensure_supported(project)
    return rec.matching(db, project)


@router.get("/configurations", response_model=ConfigurationsOut)
def configurations(robot_id: str | None = None, project: Project = Depends(get_project), db: Session = Depends(get_db)):
    _ensure_supported(project)
    robot = get_robot(db, robot_id) if robot_id else rec.best_robot(db, project)
    if robot is None:
        raise HTTPException(404, "Нет подходящих роботов")
    return rec.configurations(db, project, robot)


class SimulationOut(BaseModel):
    kpis: SimKpis
    events: list[SimEvent]


@router.get("/simulation", response_model=SimulationOut, response_model_by_alias=True)
def simulation(robot_id: str, count: int = Query(ge=1, le=12), load: str = Query("normal", pattern="^(normal|peak)$"),
               project: Project = Depends(get_project), db: Session = Depends(get_db)):
    _ensure_supported(project)
    kpis, events = rec.simulate(db, project, get_robot(db, robot_id), count, load)
    return SimulationOut(kpis=kpis, events=events)


@router.get("/scenarios", response_model=list[Scenario])
def scenarios(robot_id: str, count: int = Query(ge=1, le=12), project: Project = Depends(get_project), db: Session = Depends(get_db)):
    _ensure_supported(project)
    return rec.scenarios(db, project, get_robot(db, robot_id), count)


@router.get("/recommendation", response_model=Recommendation)
def recommendation(robot_id: str | None = None, count: int | None = None, project: Project = Depends(get_project), db: Session = Depends(get_db)):
    _ensure_supported(project)
    user_robot = get_robot(db, robot_id) if robot_id else None
    return rec.recommendation(db, project, user_robot, count)


@router.post("/report")
def report(robot_id: str | None = None, count: int | None = None, project: Project = Depends(get_project), db: Session = Depends(get_db)):
    """Executive summary as JSON. PDF rendering is a later step (PROJECT_CONTEXT §27)."""
    _ensure_supported(project)
    r = rec.recommendation(db, project, get_robot(db, robot_id) if robot_id else None, count)
    cfg = rec.configurations(db, project, db.get(type(rec.best_robot(db, project)), r.robot.id)) if r.robot else None
    return {"project": project.name, "generated_for": "руководитель, принимающий инвестиционное решение", "summary": r.executive_summary,
            "recommendation": r.model_dump(), "configurations": cfg.model_dump() if cfg else None, "format": "json", "pdf": None}
