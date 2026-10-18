from dataclasses import asdict, dataclass, field, replace
from datetime import UTC, datetime
from typing import Any

from app.db.models import Job, Scenario, SimulationRun
from app.db.repositories.users import to_current_user
from app.db.uow import UnitOfWork
from app.domain.scenario.models import CountMode, CountSource
from app.engine.calculation import CalculationError, CalculationInput, calculate
from app.engine.simulation.joint import JointSweep
from app.engine.simulation.sweep import SweepResult
from app.service.scenarios.calculations import CalculationService
from app.service.scenarios.snapshot import Snapshot


@dataclass(frozen=True, slots=True)
class FleetEconomics:
    working: int
    reserve: int
    total: int
    capex_rub: float
    payback_years: float | None
    npv_rub: float


@dataclass(slots=True)
class SweepEconomics:
    """The fleet curve priced the way the scenario will be once the sweep's N applies, plus both
    answers side by side: N by the cycle formula and N confirmed by the simulation («было → стало»)."""

    points: dict[int, FleetEconomics | None] = field(default_factory=dict)
    by_formula: FleetEconomics | None = None
    by_simulation: FleetEconomics | None = None


def _priced(base: CalculationInput, process_key: str, change: dict[str, Any]) -> FleetEconomics | None:
    items = [replace(item, **change) if item.process_key == process_key else item for item in base.items]
    try:
        result = calculate(replace(base, items=items), render=False)
    except CalculationError:
        return None
    count = next((s.count for s in result.sizing if s.item.process_key == process_key), None)
    if count is None:
        return None
    metrics = result.economics.metrics
    working = count.simulated if count.simulated and count.source == CountSource.SIMULATED else count.analytic
    return FleetEconomics(
        working, count.reserve, count.final, metrics.capex_rub, metrics.payback_years, metrics.npv_rub
    )


async def price_sweep(
    uow: UnitOfWork, job: Job, scenario: Scenario, process_key: str, joint: JointSweep
) -> SweepEconomics:
    """A fleet that holds SLA is priced as the simulated count plus reserve with the peak covered —
    exactly what the scenario gets when that N applies. A fleet that fails SLA gets no payback."""
    user = await uow.users.get(job.owner_id) if job.owner_id else None
    if user is None:
        return SweepEconomics()
    evaluation = await CalculationService(uow, to_current_user(user)).evaluate(scenario.id)
    base = evaluation.snapshot.input
    result = joint.result
    auto: dict[str, Any] = {"count_mode": CountMode.AUTO, "count_manual": None}
    out = SweepEconomics(
        by_formula=_priced(base, process_key, {**auto, "simulated_robots": None, "simulated_basis": None})
    )
    base = replace(
        base,
        items=[
            replace(
                item,
                **auto,
                simulated_robots=joint.validation.fleet[item.process_key],
                simulated_basis=joint.bases[item.process_key],
                simulation_outdated=False,
            )
            if item.process_key in joint.validation.fleet and item.process_key not in joint.fixed_fleet
            else item
            for item in base.items
        ],
    )
    for point in result.points:
        priced = _priced(
            base,
            process_key,
            {
                **auto,
                "simulated_robots": point.count,
                "simulated_basis": result.analytic_count,
                "simulation_outdated": False,
            },
        )
        out.points[point.count] = (
            priced if point.passed or priced is None else replace(priced, payback_years=None)
        )
    if result.recommended_count is not None:
        out.by_simulation = out.points.get(result.recommended_count)
    return out


def apply_sweep(
    snapshot: Snapshot, payload: dict[str, Any], result: JointSweep, run: SimulationRun | None
) -> bool:
    """Confirm the complete jointly tested fleet atomically, including its post-application fingerprint."""
    if result.validation.status != "passed" or run is None:
        return False
    scenario = snapshot.scenario
    items = [
        item
        for item in scenario.items
        if item.process_key in result.validation.fleet and item.process_key not in result.fixed_fleet
    ]
    for item in items:
        item.simulated_count = result.validation.fleet[item.process_key]
        item.simulated_basis = result.bases[item.process_key]
        item.simulation_id = run.id
        item.simulated_project_version = payload["project_version"]
        item.simulation_note = result.result.explanation
        item.count_mode = CountMode.AUTO
        item.count_manual = None
    fingerprint = snapshot.physical_fingerprint
    for item in items:
        item.simulated_fingerprint = fingerprint
    scenario.version += 1
    return True


def _fleet_json(fleet: FleetEconomics | None) -> dict[str, Any] | None:
    return asdict(fleet) if fleet else None


def reprice_view(snapshot: Snapshot, result: dict[str, Any]) -> dict[str, Any]:
    """Keep physical evidence, but show every financial comparison using current prices and financing."""
    key = result["process_key"]
    auto = {"count_mode": CountMode.AUTO, "count_manual": None, "simulation_outdated": False}
    base = snapshot.input
    formula = _priced(base, key, {**auto, "simulated_robots": None, "simulated_basis": None})
    points = []
    confirmed = None
    for point in result["points"]:
        priced = _priced(
            base,
            key,
            {
                **auto,
                "simulated_robots": point["count"],
                "simulated_basis": result["analytic_count"],
            },
        )
        if priced is not None and not point["passed"]:
            priced = replace(priced, payback_years=None)
        points.append(
            {
                **point,
                "robots_total": priced.total if priced else None,
                "capex_rub": priced.capex_rub if priced else None,
                "payback_years": priced.payback_years if priced else None,
                "npv_rub": priced.npv_rub if priced else None,
            }
        )
        if point["count"] == result["recommended_count"]:
            confirmed = priced
    return {
        **result,
        "points": points,
        "by_formula": _fleet_json(formula),
        "by_simulation": _fleet_json(confirmed),
    }


def sweep_json(result: SweepResult, economics: SweepEconomics, run: SimulationRun | None) -> dict[str, Any]:
    def priced(count: int, attr: str) -> float | None:
        fleet = economics.points.get(count)
        return getattr(fleet, attr) if fleet else None

    return {
        "process_key": result.process_key,
        "points": [
            {
                **{k: v for k, v in asdict(p).items() if k not in {"passed", "runs", "sla_min_pct"}},
                "sla_min_pct": p.sla_min_pct,
                "passed": p.passed,
                "runs": p.runs,
                "robots_total": priced(p.count, "total"),
                "capex_rub": priced(p.count, "capex_rub"),
                "payback_years": priced(p.count, "payback_years"),
                "npv_rub": priced(p.count, "npv_rub"),
                "simulation_id": str(run.id) if run and p.count == result.recommended_count else None,
            }
            for p in result.points
        ],
        "recommended_count": result.recommended_count,
        "analytic_count": result.analytic_count,
        "target_pct": result.target_pct,
        "explanation": result.explanation,
        "simulation_id": str(run.id) if run else None,
        "applied": result.recommended_count is not None,
        "by_formula": _fleet_json(economics.by_formula),
        "by_simulation": _fleet_json(economics.by_simulation),
        "computed_at": datetime.now(UTC).isoformat(),
    }
