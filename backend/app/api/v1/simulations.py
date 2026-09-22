import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Path, Query, Request, Response, status
from fastapi.responses import StreamingResponse

from app.api.deps import UowDep, require
from app.api.schemas.simulations import (
    FleetSweepRequest,
    FleetSweepResult,
    SimulationHeatmap,
    SimulationList,
    SimulationReplay,
    SimulationRequest,
    SimulationRun,
    SimulationTimeline,
    TimelinePoint,
)
from app.api.schemas.system import Job
from app.db.models import SimulationRun as RunRow
from app.db.repositories.jobs import to_info
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser, Permission
from app.domain.jobs import JobStatus
from app.service.jobs.queue import JobQueue
from app.service.simulations.inputs import RunRequest
from app.service.simulations.service import SIMULATION_JOB, SWEEP_JOB, SimulationService, SweepRequest

router = APIRouter(tags=["simulation"])

OwnerDep = Annotated[CurrentUser, Depends(require(Permission.PROJECTS_OWN))]
ScenarioIdPath = Annotated[UUID, Path()]
SimulationIdPath = Annotated[UUID, Path()]
STREAM_POLL_S = 0.5
_FINAL = frozenset({JobStatus.DONE, JobStatus.FAILED, JobStatus.CANCELLED})


def get_queue(request: Request) -> JobQueue:
    return JobQueue(request.app.state.settings, request.app.state.db)


QueueDep = Annotated[JobQueue, Depends(get_queue)]


@router.get(
    "/scenarios/{scenario_id}/simulations", operation_id="listSimulations", summary="Прогоны сценария"
)
async def list_simulations(scenario_id: ScenarioIdPath, user: OwnerDep, uow: UowDep) -> SimulationList:
    runs = await SimulationService(uow, user).runs(scenario_id)
    return SimulationList(items=[SimulationRun.from_row(r) for r in runs])


@router.post(
    "/scenarios/{scenario_id}/simulations",
    operation_id="startSimulation",
    summary="Запустить имитацию (фоновая задача, до 60 с; прогресс по SSE)",
    status_code=status.HTTP_202_ACCEPTED,
    responses={409: {"description": "Нет планировки или сценарий не полон"}},
)
async def start_simulation(
    scenario_id: ScenarioIdPath,
    payload: SimulationRequest,
    user: OwnerDep,
    uow: UowDep,
    queue: QueueDep,
    background: BackgroundTasks,
) -> SimulationRun:
    run = await SimulationService(uow, user).start(
        scenario_id, payload.to_request(), payload.model_dump(mode="json")
    )
    if run.job_id is not None:
        background.add_task(queue.dispatch, SIMULATION_JOB, run.job_id)
    return SimulationRun.from_row(run)


@router.post(
    "/scenarios/{scenario_id}/fleet-sweep",
    operation_id="runFleetSweep",
    summary="Перебор количества роботов — кривая N → SLA, загрузка, окупаемость (фоновая задача)",
    status_code=status.HTTP_202_ACCEPTED,
)
async def run_fleet_sweep(
    scenario_id: ScenarioIdPath,
    payload: FleetSweepRequest,
    user: OwnerDep,
    uow: UowDep,
    queue: QueueDep,
    background: BackgroundTasks,
) -> Job:
    sweep = SweepRequest(
        process_key=payload.process_key,
        low=payload.from_count,
        high=payload.to_count,
        request=RunRequest(mode=payload.mode, seed=payload.seed, record_events=False),
    )
    job = await SimulationService(uow, user).start_sweep(scenario_id, sweep, payload.model_dump(mode="json"))
    background.add_task(queue.dispatch, SWEEP_JOB, job.id)
    return Job.from_domain(to_info(job))


@router.get(
    "/scenarios/{scenario_id}/fleet-sweep/{job_id}",
    operation_id="getFleetSweepResult",
    summary="Результат перебора флота",
    responses={409: {"description": "Ещё считается"}},
)
async def get_fleet_sweep(
    scenario_id: ScenarioIdPath, job_id: Annotated[UUID, Path()], user: OwnerDep, uow: UowDep
) -> FleetSweepResult:
    return FleetSweepResult.model_validate(
        await SimulationService(uow, user).sweep_result(scenario_id, job_id)
    )


@router.get(
    "/simulations/{simulation_id}",
    operation_id="getSimulation",
    summary="Состояние прогона и сводка KPI",
    responses={404: {"description": "Не найдено"}},
)
async def get_simulation(simulation_id: SimulationIdPath, user: OwnerDep, uow: UowDep) -> SimulationRun:
    return SimulationRun.from_row(await SimulationService(uow, user).get(simulation_id))


@router.delete(
    "/simulations/{simulation_id}",
    operation_id="cancelSimulation",
    summary="Отменить или удалить прогон",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def cancel_simulation(simulation_id: SimulationIdPath, user: OwnerDep, uow: UowDep) -> Response:
    await SimulationService(uow, user).delete(simulation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/simulations/{simulation_id}/timeline",
    operation_id="getSimulationTimeline",
    summary="KPI по времени — графики очереди, SLA, загрузки",
    responses={409: {"description": "Прогон не завершён"}},
)
async def get_timeline(
    simulation_id: SimulationIdPath,
    user: OwnerDep,
    uow: UowDep,
    step_min: Annotated[float, Query(gt=0, le=240)] = 5,
) -> SimulationTimeline:
    run, points = await SimulationService(uow, user).timeline(simulation_id, step_min)
    return SimulationTimeline(
        simulation_id=run.id, step_min=step_min, points=[TimelinePoint.model_validate(p) for p in points]
    )


@router.get(
    "/simulations/{simulation_id}/replay",
    operation_id="getSimulationReplay",
    summary="Журнал событий для 2D-плеера (постранично по времени)",
    responses={409: {"description": "Прогон без записи событий или не завершён"}},
)
async def get_replay(
    simulation_id: SimulationIdPath,
    user: OwnerDep,
    uow: UowDep,
    from_s: Annotated[float, Query(ge=0)] = 0,
    to_s: Annotated[float | None, Query(gt=0)] = None,
    robots: Annotated[str | None, Query(description="Фильтр по роботам через запятую")] = None,
) -> SimulationReplay:
    only = {r.strip() for r in robots.split(",") if r.strip()} if robots else None
    replay = await SimulationService(uow, user).replay(simulation_id, from_s, to_s, only)
    return SimulationReplay.from_replay(replay)


@router.get(
    "/simulations/{simulation_id}/heatmap",
    operation_id="getSimulationHeatmap",
    summary="Тепловая карта заторов и загрузки зон",
)
async def get_heatmap(simulation_id: SimulationIdPath, user: OwnerDep, uow: UowDep) -> SimulationHeatmap:
    run = await SimulationService(uow, user).heatmap(simulation_id)
    heat = run.heatmap or {}
    return SimulationHeatmap(
        simulation_id=run.id,
        edges=heat.get("edges", []),
        zones=heat.get("zones", []),
        nodes=heat.get("nodes", []),
    )


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


async def _run_events(db: Database, run_id: UUID, job_id: UUID | None) -> AsyncIterator[str]:
    while True:
        async with UnitOfWork(db.session()) as uow:
            run = await uow.session.get(RunRow, run_id)
            if run is None:
                return
            state = (run.status, run.progress, run.stage, run.summary, run.error)
        status_, progress, stage, summary, error = state
        body: dict[str, Any] = {
            "job_id": str(job_id or run_id),
            "status": status_.value,
            "progress": progress,
            "stage": stage,
        }
        if status_ == JobStatus.DONE and summary:
            body["partial"] = {
                "done": summary.get("completed"),
                "queue": (summary.get("queue") or {}).get("at_end"),
                "sla_running_pct": (summary.get("sla") or {}).get("achieved_pct"),
            }
        if status_ == JobStatus.FAILED:
            yield _sse("error", error or {"detail": "Имитация завершилась ошибкой"})
            return
        yield _sse("done" if status_ in _FINAL else "progress", body)
        if status_ in _FINAL:
            return
        await asyncio.sleep(STREAM_POLL_S)


@router.get(
    "/simulations/{simulation_id}/stream",
    operation_id="streamSimulation",
    summary="SSE-поток прогресса и бегущих KPI прогона",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}, "description": "Поток ProgressEvent"}},
)
async def stream_simulation(
    simulation_id: SimulationIdPath, request: Request, user: OwnerDep, uow: UowDep
) -> StreamingResponse:
    run = await SimulationService(uow, user).get(simulation_id)
    return StreamingResponse(
        _run_events(request.app.state.db, run.id, run.job_id), media_type="text/event-stream"
    )
