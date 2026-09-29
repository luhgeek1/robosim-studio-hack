from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core.errors import ConflictError, ErrorCode, NotFoundError
from app.core.versions import ENGINE_VERSION
from app.db.models import Job, Layout, Scenario, SimulationRun
from app.db.repositories.simulations import SimulationRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.jobs import JobStatus, JobType
from app.engine.simulation import SimInput
from app.service.layouts.mapping import plan_from
from app.service.layouts.reader import LayoutReader
from app.service.scenarios.calculations import CalculationService, Evaluation
from app.service.scenarios.service import ScenarioService
from app.service.simulations.inputs import InputBuilder, RunRequest, config_from, dump_input
from app.service.simulations.results import resample, unpack_events, window

SIMULATION_NOT_FOUND = "Прогон имитации не найден или недоступен"
REPLAY_WINDOW_S = 3600.0
SECONDS_PER_HOUR = 3600.0
SIMULATION_JOB = "simulation"
SWEEP_JOB = "fleet_sweep"


@dataclass(frozen=True, slots=True)
class Replay:
    run: SimulationRun
    layout: dict[str, Any]
    robots: list[dict[str, Any]]
    total_seconds: float
    from_s: float
    to_s: float
    next_from_s: float | None
    events: list[dict[str, Any]]


@dataclass(frozen=True, slots=True)
class SweepRequest:
    process_key: str
    low: int | None = None
    high: int | None = None
    request: RunRequest = field(default_factory=RunRequest)


@dataclass(frozen=True, slots=True)
class Draft:
    """A scenario resolved for the simulation: calculation, layout and the engine input built from them."""

    evaluation: Evaluation
    layout: Layout
    inp: SimInput
    skipped: dict[str, str]


def plan_json(layout: Layout) -> dict[str, Any]:
    return {
        "width_m": layout.width_m,
        "height_m": layout.height_m,
        "zones": layout.zones,
        "racks": layout.racks,
        "nodes": layout.nodes,
        "edges": layout.edges,
    }


class SimulationService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._repo = SimulationRepository(uow.session)
        self._scenarios = ScenarioService(uow, user)
        self._calculations = CalculationService(uow, user)
        self._layouts = LayoutReader(uow)

    async def _prepare(self, scenario: Scenario, request: RunRequest) -> Draft:
        evaluation = await self._calculations.evaluate(scenario.id)
        layout = await self._layouts.layout(scenario.project_id)
        if layout is None:
            raise ConflictError("Нет планировки: сгенерируйте её перед имитацией")
        prepared = InputBuilder(evaluation.snapshot, evaluation.result).build()
        if not prepared.processes:
            reasons = "; ".join(prepared.skipped.values()) or "в сценарии нет роботов"
            raise ConflictError(f"Имитировать нечего: {reasons}", error_code=ErrorCode.SCENARIO_INCOMPLETE)
        plan = plan_from(layout)
        config = config_from(request, prepared.chargers)
        return Draft(
            evaluation,
            layout,
            SimInput(plan, tuple(prepared.processes), prepared.settings, config),
            prepared.skipped,
        )

    def _versions(self, evaluation: Evaluation, layout: Layout) -> dict[str, Any]:
        versions = evaluation.snapshot.versions
        return {
            "project_version": versions.project_version,
            "catalog_version": versions.catalog_version,
            "norm_set_version": versions.norm_set_version,
            "engine_version": ENGINE_VERSION,
            "layout_version": layout.version,
            "computed_at": datetime.now(UTC).isoformat(),
            "inputs_hash": evaluation.snapshot.inputs_hash,
        }

    def new_run(
        self, scenario: Scenario, draft: Draft, request: dict[str, Any], *, job_id: UUID | None = None
    ) -> SimulationRun:
        inp, layout = draft.inp, draft.layout
        fleet = [
            {
                "process_key": p.key,
                "product_name": p.product_name,
                "count": inp.config.fleet.get(p.key, p.robots),
                "stations": inp.config.stations.get(p.key, p.stations) or None,
            }
            for p in inp.processes
        ]
        run = SimulationRun(
            scenario_id=scenario.id,
            project_id=scenario.project_id,
            job_id=job_id,
            status=JobStatus.QUEUED,
            progress=0.0,
            purpose="run",
            config=request,
            engine_input={**dump_input(inp, plan_json(layout)), "skipped": draft.skipped},
            versions=self._versions(draft.evaluation, layout),
            layout_id=layout.id,
            layout_version=layout.version,
            seed=inp.config.seed,
            fleet=fleet,
            events_count=0,
            created_by=self._user.email,
        )
        self._repo.add(run)
        return run

    async def start(self, scenario_id: UUID, request: RunRequest, raw: dict[str, Any]) -> SimulationRun:
        scenario = await self._scenarios.owned(scenario_id)
        draft = await self._prepare(scenario, request)
        job = Job(type=JobType.SIMULATION, owner_id=self._user.id, payload={"kind": SIMULATION_JOB})
        self._uow.session.add(job)
        await self._uow.flush()
        run = self.new_run(scenario, draft, raw, job_id=job.id)
        await self._uow.flush()
        job.payload = {"kind": SIMULATION_JOB, "simulation_id": str(run.id)}
        return run

    async def runs(self, scenario_id: UUID) -> list[SimulationRun]:
        await self._scenarios.owned(scenario_id)
        return list(await self._repo.for_scenario(scenario_id))

    async def get(self, run_id: UUID, *, with_events: bool = False) -> SimulationRun:
        run = await self._repo.get_owned(run_id, self._user.id, with_events=with_events)
        if run is None:
            raise NotFoundError(SIMULATION_NOT_FOUND)
        return run

    async def delete(self, run_id: UUID) -> None:
        run = await self.get(run_id)
        if run.status in {JobStatus.QUEUED, JobStatus.RUNNING}:
            run.status = JobStatus.CANCELLED
            run.finished_at = datetime.now(UTC)
        else:
            await self._repo.delete(run)
        await self._uow.flush()

    @staticmethod
    def _finished(run: SimulationRun) -> None:
        if run.status != JobStatus.DONE:
            raise ConflictError("Прогон ещё не завершён", error_code=ErrorCode.JOB_NOT_READY)

    async def timeline(self, run_id: UUID, step_min: float) -> tuple[SimulationRun, list[dict[str, Any]]]:
        run = await self.get(run_id)
        self._finished(run)
        return run, resample(run.timeline or [], step_min)

    async def heatmap(self, run_id: UUID) -> SimulationRun:
        run = await self.get(run_id)
        self._finished(run)
        return run

    async def replay(
        self, run_id: UUID, from_s: float, to_s: float | None, robots: set[str] | None
    ) -> Replay:
        run = await self.get(run_id, with_events=True)
        self._finished(run)
        if not run.config.get("record_events", True) or run.events is None:
            raise ConflictError("Прогон запущен без записи событий", error_code=ErrorCode.JOB_NOT_READY)
        total = float((run.summary or {}).get("duration_hours", 0.0)) * SECONDS_PER_HOUR
        end = min(total, to_s if to_s is not None else from_s + REPLAY_WINDOW_S)
        events = window(unpack_events(run.events), from_s, end, robots)
        return Replay(
            run=run,
            layout=run.engine_input["plan"],
            robots=run.robots or [],
            total_seconds=total,
            from_s=from_s,
            to_s=end,
            next_from_s=end if end < total else None,
            events=events,
        )

    async def start_sweep(self, scenario_id: UUID, sweep: SweepRequest, raw: dict[str, Any]) -> Job:
        scenario = await self._scenarios.owned(scenario_id)
        draft = await self._prepare(scenario, sweep.request)
        evaluation, layout = draft.evaluation, draft.layout
        if sweep.process_key not in {p.key for p in draft.inp.processes}:
            reason = draft.skipped.get(sweep.process_key, "процесса нет в сценарии")
            raise ConflictError(
                f"Перебор флота невозможен: {reason}", error_code=ErrorCode.SCENARIO_INCOMPLETE
            )
        job = Job(
            type=JobType.SIMULATION,
            owner_id=self._user.id,
            payload={
                "kind": SWEEP_JOB,
                "scenario_id": str(scenario.id),
                "process_key": sweep.process_key,
                "low": sweep.low,
                "high": sweep.high,
                "request": raw,
                "replications": int(evaluation.snapshot.input.norms.value("sim_replications")),
                "project_version": evaluation.snapshot.versions.project_version,
                "layout_id": str(layout.id),
                "versions": self._versions(evaluation, layout),
                "engine_input": {**dump_input(draft.inp, plan_json(layout)), "skipped": draft.skipped},
            },
        )
        self._uow.session.add(job)
        await self._uow.flush()
        return job

    async def latest_sweep(self, scenario_id: UUID, process_key: str | None) -> dict[str, Any]:
        """The last finished sweep of the scenario: the screen shows its curve after a reload."""
        await self._scenarios.owned(scenario_id)
        job = await self._uow.jobs.latest_sweep(scenario_id, process_key)
        if job is None or job.result is None:
            raise NotFoundError("Перебор флота для этого сценария ещё не запускался")
        return {**job.result, "job_id": str(job.id)}

    async def sweep_result(self, scenario_id: UUID, job_id: UUID) -> dict[str, Any]:
        await self._scenarios.owned(scenario_id)
        job = await self._uow.jobs.get(job_id)
        if job is None or job.owner_id != self._user.id or job.payload.get("scenario_id") != str(scenario_id):
            raise NotFoundError("Перебор флота не найден")
        if job.status == JobStatus.FAILED:
            raise ConflictError((job.error or {}).get("detail", "Перебор завершился ошибкой"))
        if job.status != JobStatus.DONE or job.result is None:
            raise ConflictError("Перебор ещё считается", error_code=ErrorCode.JOB_NOT_READY)
        return {**job.result, "job_id": str(job.id)}
