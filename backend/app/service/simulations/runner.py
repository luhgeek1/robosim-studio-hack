import asyncio
import logging
import time
from dataclasses import asdict, replace
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core.errors import ErrorCode
from app.db.models import Job, Scenario, ScenarioItem, SimulationRun
from app.db.repositories.users import to_current_user
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.jobs import JobStatus
from app.domain.scenario.models import CountMode
from app.engine.calculation import CalculationError, calculate
from app.engine.simulation import SimMode, SimResult, SimulationError, prepare, simulate
from app.engine.simulation.sweep import Sweep, SweepResult
from app.service.scenarios.calculations import CalculationService
from app.service.simulations.inputs import load_input
from app.service.simulations.results import pack_events, robots_json, summary_json, timeline_json

logger = logging.getLogger(__name__)
CRASHED = "Имитация прервалась из-за внутренней ошибки"

MS_PER_S = 1000
API_PREFIX = "/api/v1"


def _now() -> datetime:
    return datetime.now(UTC)


def _problem(detail: str) -> dict[str, Any]:
    return {
        "type": "about:blank",
        "title": "Simulation failed",
        "status": 422,
        "detail": detail,
        "error_code": ErrorCode.SIMULATION_FAILED.value,
    }


def store_result(run: SimulationRun, result: SimResult, duration_ms: int) -> None:
    run.summary = summary_json(result, run.engine_input.get("skipped", {}))
    run.timeline = timeline_json(result)
    run.heatmap = result.heatmap
    run.robots = robots_json(result)
    if run.config.get("record_events", True):
        run.events = pack_events(result.record.events)
        run.events_count = len(result.record.events)
    run.duration_ms = duration_ms
    run.status = JobStatus.DONE
    run.progress = 1.0
    run.stage = None
    run.finished_at = _now()


async def run_simulation(db: Database, job_id: UUID) -> None:
    async with UnitOfWork(db.session()) as uow:
        job = await uow.jobs.get(job_id)
        if job is None:
            return
        run = await uow.session.get(SimulationRun, UUID(job.payload["simulation_id"]))
        if run is None or run.status == JobStatus.CANCELLED:
            job.status = JobStatus.CANCELLED
            await uow.commit()
            return
        run.status = job.status = JobStatus.RUNNING
        run.stage = job.stage = "Имитация"
        job.started_at = _now()
        await uow.commit()
        inp = load_input(run.engine_input)
    started = time.perf_counter()
    try:
        result = await asyncio.to_thread(simulate, inp)
    except SimulationError as exc:
        await _fail(db, job_id, run.id, str(exc))
        return
    except Exception:
        logger.exception("simulation_crashed", extra={"simulation_id": str(run.id)})
        await _fail(db, job_id, run.id, CRASHED)
        return
    async with UnitOfWork(db.session()) as uow:
        run = await uow.session.get(SimulationRun, run.id)
        job = await uow.jobs.get(job_id)
        if run is None or job is None or run.status == JobStatus.CANCELLED:
            return
        store_result(run, result, int((time.perf_counter() - started) * MS_PER_S))
        job.status, job.progress, job.finished_at = JobStatus.DONE, 1.0, _now()
        job.result_url = f"{API_PREFIX}/simulations/{run.id}"
        await uow.commit()


async def _fail(db: Database, job_id: UUID, run_id: UUID | None, detail: str) -> None:
    async with UnitOfWork(db.session()) as uow:
        job = await uow.jobs.get(job_id)
        run = await uow.session.get(SimulationRun, run_id) if run_id else None
        for item in (job, run):
            if item is not None:
                item.status = JobStatus.FAILED
                item.error = _problem(detail)
                item.finished_at = _now()
        await uow.commit()


class _Progress:
    """Carries sweep progress from the worker thread to the event loop, which writes it to the job."""

    def __init__(self, db: Database, job_id: UUID) -> None:
        self.db = db
        self.job_id = job_id
        self.loop = asyncio.get_running_loop()
        self.pending: list[tuple[int, str]] = []

    def __call__(self, evaluated: float, stage: str) -> None:
        self.loop.call_soon_threadsafe(self.pending.append, (int(evaluated), stage))

    async def flush(self) -> None:
        if not self.pending:
            return
        evaluated, stage = self.pending[-1]
        self.pending.clear()
        async with UnitOfWork(self.db.session()) as uow:
            job = await uow.jobs.get(self.job_id)
            if job is not None:
                # The number of fleet sizes a search needs is not known upfront: progress approaches 1.
                job.progress = round(evaluated / (evaluated + 1), 3)
                job.stage = stage
                await uow.commit()


async def _sweep(db: Database, job_id: UUID, payload: dict[str, Any]) -> SweepResult:
    inp = load_input(payload["engine_input"])
    prepared = prepare(inp.plan, inp.settings.two_way_width_m)
    progress = _Progress(db, job_id)
    sweep = Sweep(inp, payload["process_key"], int(payload["replications"]), prepared, progress)
    task = asyncio.create_task(asyncio.to_thread(sweep.run, payload.get("low"), payload.get("high")))
    while not task.done():
        await asyncio.sleep(0.5)
        await progress.flush()
    return await task


async def run_fleet_sweep(db: Database, job_id: UUID) -> None:
    async with UnitOfWork(db.session()) as uow:
        job = await uow.jobs.get(job_id)
        if job is None:
            return
        payload = dict(job.payload)
        job.status, job.started_at, job.stage = JobStatus.RUNNING, _now(), "Перебор флота"
        await uow.commit()
    try:
        result = await _sweep(db, job_id, payload)
        best = await _best_run(result, payload)
    except SimulationError as exc:
        await _fail(db, job_id, None, str(exc))
        return
    except Exception:
        logger.exception("fleet_sweep_crashed", extra={"job_id": str(job_id)})
        await _fail(db, job_id, None, CRASHED)
        return
    async with UnitOfWork(db.session()) as uow:
        job = await uow.jobs.get(job_id)
        scenario = await uow.session.get(Scenario, UUID(payload["scenario_id"]))
        if job is None or scenario is None:
            return
        run = _sweep_run(uow, job, scenario, payload, result, best)
        await uow.flush()
        points = await _economics(uow, job, scenario, payload["process_key"], result)
        _apply(scenario, payload, result, run)
        job.result = _sweep_json(result, points, run)
        job.status, job.progress, job.finished_at = JobStatus.DONE, 1.0, _now()
        job.result_url = f"{API_PREFIX}/scenarios/{scenario.id}/fleet-sweep/{job.id}"
        await uow.commit()


async def _best_run(result: SweepResult, payload: dict[str, Any]) -> tuple[SimResult, int] | None:
    """The recommended fleet once more, with events, in the requested mode — for the player and the report."""
    if result.recommended_count is None:
        return None
    inp = load_input(payload["engine_input"])
    mode = inp.config.mode if inp.config.mode != SimMode.NORMAL else SimMode.PEAK
    fleet = {**inp.config.fleet, result.process_key: result.recommended_count}
    config = replace(inp.config, mode=mode, fleet=fleet, record_events=True)
    started = time.perf_counter()
    best = await asyncio.to_thread(simulate, replace(inp, config=config))
    return best, int((time.perf_counter() - started) * MS_PER_S)


def _sweep_run(
    uow: UnitOfWork,
    job: Job,
    scenario: Scenario,
    payload: dict[str, Any],
    result: SweepResult,
    best: tuple[SimResult, int] | None,
) -> SimulationRun | None:
    if best is None or result.recommended_count is None:
        return None
    outcome, duration = best
    engine_input = payload["engine_input"]
    mode = engine_input["config"]["mode"]
    mode = SimMode.PEAK.value if mode == SimMode.NORMAL.value else mode
    run = SimulationRun(
        scenario_id=scenario.id,
        project_id=scenario.project_id,
        job_id=job.id,
        status=JobStatus.RUNNING,
        purpose="sweep",
        config={**payload["request"], "mode": mode, "record_events": True},
        engine_input=engine_input,
        versions=payload["versions"],
        layout_id=UUID(payload["layout_id"]),
        layout_version=payload["versions"]["layout_version"],
        seed=engine_input["config"]["seed"],
        fleet=[
            {**f, "count": result.recommended_count} if f["process_key"] == result.process_key else f
            for f in _fleet(engine_input)
        ],
        events_count=0,
        created_by="fleet-sweep",
    )
    store_result(run, outcome, duration)
    uow.session.add(run)
    return run


def _fleet(engine_input: dict[str, Any]) -> list[dict[str, Any]]:
    fleet = engine_input["config"].get("fleet", {})
    return [
        {
            "process_key": p["key"],
            "product_name": p["product_name"],
            "count": fleet.get(p["key"], p["robots"]),
        }
        for p in engine_input["processes"]
    ]


async def _economics(
    uow: UnitOfWork, job: Job, scenario: Scenario, process_key: str, result: SweepResult
) -> dict[int, tuple[float | None, float | None]]:
    """CAPEX and payback for each fleet size of the curve: the same calculation with the count set by hand."""
    user = await uow.users.get(job.owner_id) if job.owner_id else None
    if user is None:
        return {}
    evaluation = await CalculationService(uow, to_current_user(user)).evaluate(scenario.id)
    base = evaluation.snapshot.input
    points: dict[int, tuple[float | None, float | None]] = {}
    for point in result.points:
        items = [
            replace(item, count_mode=CountMode.MANUAL, count_manual=point.count, simulated_robots=None)
            if item.process_key == process_key
            else item
            for item in base.items
        ]
        try:
            metrics = calculate(replace(base, items=items), render=False).economics.metrics
        except CalculationError:
            continue
        points[point.count] = (metrics.capex_rub, metrics.payback_years)
    return points


def _apply(
    scenario: Scenario, payload: dict[str, Any], result: SweepResult, run: SimulationRun | None
) -> None:
    """The sweep's answer becomes the scenario's N: the next calculation takes it (count source simulated)."""
    item: ScenarioItem | None = next((i for i in scenario.items if i.process_key == result.process_key), None)
    if item is None or result.recommended_count is None:
        return
    item.simulated_count = result.recommended_count
    item.simulated_basis = result.analytic_count
    item.simulation_id = run.id if run else None
    item.simulated_project_version = payload["project_version"]
    item.simulation_note = result.explanation
    scenario.version += 1


def _sweep_json(
    result: SweepResult, economics: dict[int, tuple[float | None, float | None]], run: SimulationRun | None
) -> dict[str, Any]:
    return {
        "process_key": result.process_key,
        "points": [
            {
                **{k: v for k, v in asdict(p).items() if k not in {"passed", "runs", "sla_min_pct"}},
                "sla_min_pct": p.sla_min_pct,
                "passed": p.passed,
                "runs": p.runs,
                "capex_rub": economics.get(p.count, (None, None))[0],
                "payback_years": economics.get(p.count, (None, None))[1],
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
    }
