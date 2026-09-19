"""Orchestrates the P0 chain: parameters -> matching -> sizing -> economics -> simulation
-> recommendation. Results are cached in calculation_results per project version."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..config import settings
from ..ml.providers import get_explanation_provider
from ..models import CalculationResult, Project, ProjectParameter, Robot, SimulationRun
from ..schemas import Configuration, ConfigurationsOut, MatchResult, ParameterValue, Recommendation, Scenario, SimEvent, SimKpis
from . import economics, simulation
from .catalog import to_out, warehouse_candidates
from .matching import match
from .site import Site, build_site
from .sizing import sizing_report

COUNT_SPAN = 1  # evaluate required-1 .. required+1
MAX_COUNT = 8


def params_of(project: Project) -> dict[str, ParameterValue]:
    from ..data.parameters import by_key

    defs = by_key(project.object_type)
    out = {}
    for p in project.parameters:
        d = defs.get(p.key)
        out[p.key] = ParameterValue(key=p.key, label=d.label if d else p.key, group=d.group if d else "", value=p.value, unit=p.unit, source=p.source,
                                    source_value=p.source_value, confidence=p.confidence, note=p.note, kind=d.kind if d else "number",
                                    min=d.min if d else None, max=d.max if d else None, required=d.required if d else False,
                                    out_of_range=bool(d and d.min is not None and isinstance(p.value, (int, float)) and (p.value < d.min or p.value > d.max)))
    return out


def site_of(project: Project, db: Session | None = None) -> Site:
    site = build_site(project.object_type, params_of(project))
    if db is not None:
        site.current_sla = current_sla(db, project, site)
    return site


def _cached(db: Session, project: Project, kind: str, key: str = ""):
    row = db.query(CalculationResult).filter_by(project_id=project.id, project_version=project.version, kind=kind, key=key).first()
    return row.payload if row else None


def _store(db: Session, project: Project, kind: str, key: str, payload: dict | list):
    db.add(CalculationResult(project_id=project.id, project_version=project.version, kind=kind, key=key, payload=payload))
    db.commit()


def matching(db: Session, project: Project) -> list[MatchResult]:
    cached = _cached(db, project, "matching")
    if cached is not None:
        return [MatchResult.model_validate(m) for m in cached]
    site = site_of(project)
    res = match(warehouse_candidates(db), site)
    _store(db, project, "matching", "", [m.model_dump() for m in res])
    return res


def simulate(db: Session, project: Project, robot: Robot, n: int, mode: str) -> tuple[SimKpis, list[SimEvent]]:
    row = db.query(SimulationRun).filter_by(project_id=project.id, project_version=project.version, robot_id=robot.id, robot_count=n, load_mode=mode).first()
    if row:
        return SimKpis.model_validate(row.kpis), [SimEvent.model_validate(e) for e in row.events]
    site = site_of(project)
    kpis, events = simulation.simulate_robots(robot, n, site, mode, settings.simulation_seed)
    db.add(SimulationRun(project_id=project.id, project_version=project.version, robot_id=robot.id, robot_count=n, load_mode=mode,
                         kpis=kpis.model_dump(), events=[e.model_dump(by_alias=True) for e in events]))
    db.commit()
    return kpis, events


def current_sla(db: Session, project: Project, site: Site | None = None) -> float:
    cached = _cached(db, project, "current")
    if cached is not None:
        return cached["sla"]
    site = site or site_of(project)
    k = simulation.simulate_manual(site, "normal", settings.simulation_seed)
    _store(db, project, "current", "", k.model_dump())
    return k.sla


def configurations(db: Session, project: Project, robot: Robot) -> ConfigurationsOut:
    cached = _cached(db, project, "configurations", robot.id)
    if cached is not None:
        return ConfigurationsOut.model_validate(cached)
    site = site_of(project, db)
    sz = sizing_report(robot, site)
    base = max(1, sz["required_count"])
    counts = [n for n in range(max(1, base - COUNT_SPAN), min(MAX_COUNT, base + COUNT_SPAN) + 1)]
    if len(counts) < 3 and base == 1:
        counts = [1, 2, 3]
    cfgs: list[Configuration] = []
    for n in counts:
        normal, _ = simulate(db, project, robot, n, "normal")
        peak, _ = simulate(db, project, robot, n, "peak")
        econ = economics.evaluate(robot, n, base, site, normal)
        cfgs.append(Configuration(count=n, normal=normal, peak=peak, econ=econ, meets_sla=normal.sla >= site.target_sla, status="under"))
    rec = next((c.count for c in cfgs if c.meets_sla and c.econ.capex_mln <= site.budget_mln), None)
    if rec is None:
        rec = next((c.count for c in cfgs if c.meets_sla), None)
    for c in cfgs:
        c.status = "optimal" if c.count == rec else ("under" if rec is None or c.count < rec else "over")
    out = ConfigurationsOut(robot=to_out(robot), sizing=sz, configurations=cfgs, recommended_count=rec, explanations={})
    ctx = out.model_dump()
    ctx["target_sla"] = site.target_sla
    out.explanations = get_explanation_provider().explain_configuration(ctx)
    _store(db, project, "configurations", robot.id, out.model_dump())
    return out


def scenarios(db: Session, project: Project, robot: Robot, n: int) -> list[Scenario]:
    key = f"{robot.id}:{n}"
    cached = _cached(db, project, "scenarios", key)
    if cached is not None:
        return [Scenario.model_validate(s) for s in cached]
    site = site_of(project, db)
    normal, _ = simulate(db, project, robot, n, "normal")
    econ = economics.evaluate(robot, n, sizing_report(robot, site)["required_count"], site, normal)
    res = economics.scenarios(robot, n, site, econ, normal, site.current_sla)
    _store(db, project, "scenarios", key, [s.model_dump() for s in res])
    return res


def best_robot(db: Session, project: Project) -> Robot | None:
    ms = matching(db, project)
    for m in ms:
        if m.eligible:
            return db.get(Robot, m.robot.id)
    return None


def recommendation(db: Session, project: Project, user_robot: Robot | None = None, user_count: int | None = None) -> Recommendation:
    robot = best_robot(db, project)
    if robot is None:
        return Recommendation(verdict="not_recommended", headline="Подходящих решений в каталоге не найдено", robot=None, count=None, capex_mln=None, payback_years=None,
                              roi_5y=None, sla=None, throughput=None, key_benefit="", key_risk="Ни одно решение не проходит жёсткие ограничения объекта.",
                              next_steps=["Уточнить параметры объекта", "Расширить каталог"], executive_summary="Роботизация пока не рекомендуется.")
    site = site_of(project, db)
    cfg_out = configurations(db, project, robot)
    rec_n = cfg_out.recommended_count
    cfg = next((c for c in cfg_out.configurations if c.count == rec_n), None)
    if cfg is None:
        worst = cfg_out.configurations[-1]
        return Recommendation(verdict="not_recommended", headline="Роботизация в текущем бюджете не рекомендуется", robot=to_out(robot), count=None, capex_mln=None,
                              payback_years=None, roi_5y=None, sla=worst.normal.sla, throughput=worst.normal.throughput,
                              key_benefit="", key_risk=f"Даже {worst.count} × {robot.short_name} не выполняют SLA {site.target_sla:.0f} %.",
                              next_steps=["Пересмотреть бюджет", "Рассмотреть RaaS для пилота"], executive_summary="Роботизация в текущем бюджете не рекомендуется.")
    e = cfg.econ
    verdict = "recommended" if e.payback_years and e.payback_years <= site.horizon_years * 0.6 else "conditional"
    benefit = (f"Снижение операционных затрат на {e.savings_year_mln:.1f} млн ₽ в год при достаточной производительности даже в пиковый период: "
               f"{cfg.normal.throughput:.0f} паллет в час против пиковых {site.peak_rate:.0f}. Штат зоны сокращается на {e.replaced_fte:.0f} человек без потери SLA.").replace(f"{e.savings_year_mln:.1f}", f"{e.savings_year_mln:.1f}".replace(".", ","))
    risk = ("Необходимо подтвердить интеграцию с текущей WMS: версия API не указана в исходных данных. Это влияет на срок внедрения и стоимость интеграции, но не на выбор робота."
            if not site.wms_api_known else "Подтвердить ровность пола и покрытие Wi-Fi в зоне хранения перед пилотом.")
    steps = ["Запросить у поставщика WMS спецификацию API", "Замерить ровность пола в зоне хранения", f"Пилот на 2 роботах в одном проходе — 6 недель, поставка {robot.specs.get('lead_weeks', {}).get('value', 10)} недель"]
    note = None
    if user_robot is not None and (user_robot.id != robot.id or (user_count and user_count != rec_n)):
        u_out = configurations(db, project, user_robot)
        u_cfg = next((c for c in u_out.configurations if c.count == (user_count or u_out.recommended_count)), None)
        if u_cfg:
            if u_cfg.normal.sla >= site.target_sla:
                note = (f"Вы рассматривали {u_cfg.count} × {user_robot.short_name}. Эта конфигурация выполняет SLA ({u_cfg.normal.sla:.0f} %), "
                        f"но ROI за 5 лет {u_cfg.econ.roi_5y or 0:.0f} % и окупаемость {u_cfg.econ.payback_years or 0:.1f} года хуже, чем у рекомендации. ")
            else:
                note = f"Вы рассматривали {u_cfg.count} × {user_robot.short_name}. Эта конфигурация не выполняет SLA ({u_cfg.normal.sla:.0f} % при требовании {site.target_sla:.0f} %). "
            note += f"Система оставляет рекомендацию: {rec_n} × {robot.short_name}."
    rec = Recommendation(verdict=verdict, headline="Роботизация рекомендована" if verdict == "recommended" else "Роботизация возможна, но окупается долго",
                         robot=to_out(robot), count=rec_n, capex_mln=e.capex_mln, payback_years=e.payback_years, roi_5y=e.roi_5y, sla=cfg.normal.sla,
                         throughput=cfg.normal.throughput, key_benefit=benefit, key_risk=risk, next_steps=steps, user_choice_note=note, executive_summary="")
    rec.executive_summary = get_explanation_provider().executive_summary(rec.model_dump())
    return rec
