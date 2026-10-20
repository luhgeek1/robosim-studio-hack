import asyncio
import logging
import time
from dataclasses import asdict, replace
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.core.errors import ErrorCode, job_problem
from app.db.models import DataVersion, Job, Layout, NormSet, Project, Scenario, SimulationRun
from app.db.repositories.users import to_current_user
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.jobs import JobStatus
from app.engine.simulation import SimMode, SimResult, SimulationError, prepare, simulate
from app.engine.simulation.joint import JointSweep, joint_sweep, with_fleet
from app.service.scenarios.calculations import CalculationService
from app.service.simulations.inputs import load_input
from app.service.simulations.progress import Progress
from app.service.simulations.results import pack_events, robots_json, summary_json, timeline_json
from app.service.simulations.sweep_results import SweepEconomics, apply_sweep, price_sweep, sweep_json

logger = logging.getLogger(__name__)
CRASHED = "Имитация прервалась из-за внутренней ошибки"

MS_PER_S = 1000
API_PREFIX = "/api/v1"


def _now() -> datetime:
    return datetime.now(UTC)


def _problem(detail: str, job_id: UUID, run_id: UUID | None) -> dict[str, Any]:
    return job_problem(
        status=422,
        detail=detail,
        error_code=ErrorCode.SIMULATION_FAILED,
        instance=f"{API_PREFIX}/simulations/{run_id}" if run_id else f"{API_PREFIX}/jobs/{job_id}",
        job_id=str(job_id),
    )


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
        job = await uow.session.scalar(select(Job).where(Job.id == job_id).with_for_update())
        if job is None or job.status != JobStatus.QUEUED:
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
        progress = Progress(db, job_id, run.id)
        result = await progress.run(simulate, inp, None, lambda value: progress(value, "Имитация дня"))
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
                item.error = _problem(detail, job_id, run_id)
                item.finished_at = _now()
        await uow.commit()


async def _sweep(payload: dict[str, Any], progress: Progress) -> JointSweep:
    inp = load_input(payload["engine_input"])
    prepared = await asyncio.to_thread(prepare, inp.plan, inp.settings.two_way_width_m)
    return await progress.run(
        joint_sweep,
        inp,
        payload["process_key"],
        int(payload["replications"]),
        prepared,
        progress,
        (payload.get("low"), payload.get("high")),
        payload.get("fixed_fleet"),
    )


async def run_fleet_sweep(db: Database, job_id: UUID) -> None:
    async with UnitOfWork(db.session()) as uow:
        job = await uow.session.scalar(select(Job).where(Job.id == job_id).with_for_update())
        if job is None or job.status != JobStatus.QUEUED:
            return
        payload = dict(job.payload)
        job.status, job.started_at, job.stage = JobStatus.RUNNING, _now(), "Перебор флота"
        await uow.commit()
    try:
        progress = Progress(db, job_id)
        result = await _sweep(payload, progress)
        best = await _best_run(result, payload, progress)
    except SimulationError as exc:
        await _fail(db, job_id, None, str(exc))
        return
    except Exception:
        logger.exception("fleet_sweep_crashed", extra={"job_id": str(job_id)})
        await _fail(db, job_id, None, CRASHED)
        return
    try:
        await _finish_sweep(db, job_id, payload, result, best)
    except Exception:
        # The scenario could change while the sweep ran (product replaced, process removed): the job must end.
        logger.exception("fleet_sweep_apply_failed", extra={"job_id": str(job_id)})
        await _fail(db, job_id, None, "Сценарий изменился во время перебора - запустите перебор ещё раз")


async def _finish_sweep(
    db: Database,
    job_id: UUID,
    payload: dict[str, Any],
    result: JointSweep,
    best: tuple[SimResult, int] | None,
) -> None:
    async with UnitOfWork(db.session()) as uow:
        job = await uow.jobs.get(job_id)
        scenario = await uow.session.scalar(
            select(Scenario).where(Scenario.id == UUID(payload["scenario_id"])).with_for_update()
        )
        if job is None or job.status != JobStatus.RUNNING:
            return
        if scenario is None:
            raise SimulationError("Сценарий удалён во время расчёта")
        await uow.session.scalar(select(Project).where(Project.id == scenario.project_id).with_for_update())
        await uow.session.scalar(
            select(Layout).where(Layout.project_id == scenario.project_id).with_for_update()
        )
        await uow.session.scalars(select(DataVersion).with_for_update(read=True))
        await uow.session.scalars(
            select(NormSet).where(NormSet.is_current.is_(True)).with_for_update(read=True)
        )
        user = await uow.users.get(job.owner_id) if job.owner_id else None
        if user is None:
            raise SimulationError("Пользователь перебора недоступен")
        snapshot = await CalculationService(uow, to_current_user(user)).snapshot(scenario)
        current = scenario.version == payload.get(
            "scenario_version"
        ) and snapshot.physical_fingerprint == payload.get("physical_fingerprint")
        run = _sweep_run(uow, job, scenario, payload, result, best)
        await uow.flush()
        points = (
            await price_sweep(uow, job, scenario, payload["process_key"], result)
            if current
            else SweepEconomics()
        )
        applied = current and apply_sweep(snapshot, payload, result, run)
        if applied:
            job.payload = {**job.payload, "applied_fingerprint": snapshot.physical_fingerprint}
            await uow.flush()
            await CalculationService(uow, to_current_user(user)).calculate(scenario.id)
        job.result = {
            **sweep_json(result.result, points, run),
            "candidate_count": result.candidate_count,
            "joint_validation": {
                **asdict(result.validation),
                "skipped_processes": [
                    {"process_key": key, "reason": reason}
                    for key, reason in payload["engine_input"].get("skipped", {}).items()
                ],
            },
            "applied": applied,
        }
        if not current:
            job.result["explanation"] += (
                " Сценарий или физические входы изменились во время перебора: результат не применён, "
                "запустите перебор ещё раз."
            )
            job.result["recommended_count"] = None
            job.result["by_simulation"] = None
        job.status, job.progress, job.finished_at = JobStatus.DONE, 1.0, _now()
        job.result_url = f"{API_PREFIX}/scenarios/{scenario.id}/fleet-sweep/{job.id}"
        await uow.commit()


async def _best_run(
    result: JointSweep, payload: dict[str, Any], progress: Progress
) -> tuple[SimResult, int] | None:
    """The recommended fleet once more, with events, in the requested mode - for the player and the report."""
    if not result.validation.fleet or result.validation.status == "not_run":
        return None
    inp = load_input(payload["engine_input"])
    inp = with_fleet(inp, result.validation.fleet, result.fixed_fleet)
    config = replace(inp.config, mode=SimMode.PEAK, record_events=True)
    started = time.perf_counter()
    best = await progress.run(
        simulate,
        replace(inp, config=config),
        None,
        lambda value: progress(value, "Запись итогового прогона"),
    )
    progress(0, "Сохранение результата и экономики")
    await asyncio.sleep(0)
    await progress.flush()
    return best, int((time.perf_counter() - started) * MS_PER_S)


def _sweep_run(
    uow: UnitOfWork,
    job: Job,
    scenario: Scenario,
    payload: dict[str, Any],
    result: JointSweep,
    best: tuple[SimResult, int] | None,
) -> SimulationRun | None:
    if best is None:
        return None
    outcome, duration = best
    engine_input = dict(payload["engine_input"])
    physical = with_fleet(load_input(engine_input), result.validation.fleet, result.fixed_fleet)
    engine_input["config"] = asdict(physical.config)
    mode = SimMode.PEAK.value
    engine_input["config"] = {**engine_input["config"], "mode": mode, "record_events": True}
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
        fleet=_fleet(engine_input),
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
