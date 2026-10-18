from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.api.demo.cache import DemoCache
from app.api.demo.registry import DEMO_OWNER, DEMO_OWNER_ID, Example
from app.api.schemas.calculations import CalculationRun, CalculationTrace, ComparisonTable, TraceItem
from app.api.schemas.demo import DemoHeadline, DemoProject, DemoSnapshot
from app.api.schemas.layouts import Layout
from app.api.schemas.matching import MatchingResult
from app.api.schemas.processes import ProcessDemand
from app.api.schemas.projects import ProjectParam
from app.api.schemas.scenarios import Scenario
from app.api.schemas.simulations import FleetSweepResult, SimulationRun
from app.db.models import Project, User
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.jobs import JobStatus
from app.domain.project.models import InitMode
from app.domain.scenario.models import ScenarioItemSpec, ScenarioKind
from app.engine.matching import CandidateStatus
from app.engine.simulation import SimMode
from app.service.layouts.service import LayoutService
from app.service.matching.service import MatchingService
from app.service.projects.context import ProjectLoader
from app.service.projects.processes import ProcessService
from app.service.projects.service import ProjectDraft, ProjectService
from app.service.scenarios.calculations import CalculationService
from app.service.scenarios.comparison import ComparisonService
from app.service.scenarios.service import ScenarioDraft, ScenarioService
from app.service.simulations.inputs import RunRequest
from app.service.simulations.runner import run_fleet_sweep
from app.service.simulations.service import SimulationService, SweepRequest


def card(item: Example) -> DemoProject:
    return DemoProject(
        key=item.key,
        object_type=item.object_type,
        name=item.name,
        description=item.description,
        scope=item.scope,
    )


async def _project(uow: UnitOfWork, item: Example, version: str) -> UUID:
    await uow.session.execute(
        insert(User)
        .values(
            id=DEMO_OWNER_ID,
            email=DEMO_OWNER.email,
            name="Публичные примеры",
            password_hash="!disabled",  # noqa: S106 — invalid hash; this account cannot log in.
            role=DEMO_OWNER.role,
            is_active=False,
        )
        .on_conflict_do_nothing(index_elements=[User.id])
    )
    marker = f"public-demo:{item.key}:{version}"
    existing = await uow.session.scalar(
        select(Project).where(
            Project.owner_id == DEMO_OWNER_ID,
            Project.notes == marker,
        )
    )
    if existing is not None:
        return existing.id
    project = await ProjectService(uow, DEMO_OWNER).create(
        ProjectDraft(
            name=item.name,
            object_type=item.object_type,
            mode=InitMode.DEMO,
            demo_key=item.key,
            notes=marker,
        )
    )
    return project.id


async def _purchase(uow: UnitOfWork, project_id: UUID, item: Example) -> UUID:
    service = ScenarioService(uow, DEMO_OWNER)
    existing = await service.list_scenarios(project_id)
    if purchase := next((s for s in existing if s.kind == ScenarioKind.PURCHASE), None):
        return purchase.id
    matching = await MatchingService(uow, DEMO_OWNER).run(project_id, process_keys=list(item.processes))
    items = []
    for process in matching.processes:
        candidates = [
            c
            for c in process.candidates
            if c.result.status != CandidateStatus.EXCLUDED and c.data.input.robots_estimate is not None
        ]
        if not candidates:
            continue
        candidate = min(candidates, key=lambda c: c.result.rank or 10000)
        items.append(
            ScenarioItemSpec(
                process.process_key,
                candidate.summary.id,
                candidate.data.offer.id if candidate.data.offer else None,
            )
        )
    if not items:
        raise ValueError("Нет допустимых решений для публичного примера")
    purchase = await service.create(project_id, ScenarioDraft("Покупка", ScenarioKind.PURCHASE, items=items))
    return purchase.id


async def _simulate(db: Database, scenario_id: UUID, item: Example) -> None:
    async with UnitOfWork(db.session()) as uow:
        service = SimulationService(uow, DEMO_OWNER)
        if any(run.status == JobStatus.DONE for run in await service.runs(scenario_id)):
            return
        sweep = SweepRequest(item.processes[0], request=RunRequest(mode=SimMode.PEAK))
        job = await service.start_sweep(
            scenario_id, sweep, {"process_key": sweep.process_key, "mode": "peak"}
        )
        await uow.commit()
    await run_fleet_sweep(db, job.id)
    async with UnitOfWork(db.session()) as uow:
        finished = await uow.jobs.get(job.id)
        if finished is None or finished.status != JobStatus.DONE:
            raise ValueError("Не удалось подготовить имитацию примера")


async def _snapshot(uow: UnitOfWork, item: Example, primary: UUID, version: str) -> DemoSnapshot:
    service = ScenarioService(uow, DEMO_OWNER)
    purchase = await service.owned(primary)
    project_id = purchase.project_id
    kinds = {s.kind for s in await service.list_scenarios(project_id)}
    for kind, name in ((ScenarioKind.RAAS, "Робот как услуга"), (ScenarioKind.LEASE, "Лизинг")):
        if kind not in kinds:
            await service.copy(primary, name, kind)
    compared = await ComparisonService(uow, DEMO_OWNER).compare(project_id, recalculate_stale=True)
    calculations = [CalculationRun.from_stored(s.stored) for s in compared.scenarios]
    calculation = next(c for c in calculations if c.scenario_id == primary)
    context = await ProjectLoader(uow).context(DEMO_OWNER, project_id)
    processes = await ProcessService(uow, DEMO_OWNER).overview(project_id)
    simulations = SimulationService(uow, DEMO_OWNER)
    runs = await simulations.runs(primary)
    demo = card(item)
    demo.headline = DemoHeadline(
        **{k: getattr(calculation.metrics, k) for k in DemoHeadline.model_fields if k != "verdict"},
        verdict=calculation.interpretation.verdict,
    )
    trace = await CalculationService(uow, DEMO_OWNER).trace(calculation.id, None)
    return DemoSnapshot(
        demo=demo,
        params=[ProjectParam.from_domain(p) for p in context.params],
        processes=[ProcessDemand.from_domain(p) for p in processes.processes],
        matching=MatchingResult.from_domain(await MatchingService(uow, DEMO_OWNER).run(project_id)),
        scenarios=[Scenario.from_domain(s) for s in await service.list_scenarios(project_id)],
        comparison=ComparisonTable.from_domain(compared),
        calculations=calculations,
        trace=CalculationTrace(
            calculation_id=trace[0],
            items=[TraceItem.model_validate(t) for t in trace[1]],
            undocumented_constants=trace[2],
        ),
        primary_scenario_id=primary,
        simulation=SimulationRun.from_row(next(r for r in runs if r.status == JobStatus.DONE)),
        layout=Layout.from_view(await LayoutService(uow, DEMO_OWNER).get(project_id)),
        sweep=FleetSweepResult.model_validate(await simulations.latest_sweep(primary, None)),
        prepared_at=datetime.now(UTC),
        revision=version,
    )


async def build(db: Database, cache: DemoCache, item: Example, version: str) -> None:
    await cache.stage("Подбираем решения по параметрам объекта")
    async with UnitOfWork(db.session()) as uow:
        project_id = await _project(uow, item, version)
        primary = await _purchase(uow, project_id, item)
        await uow.commit()
    await cache.stage("Проверяем парк, очереди и общие ресурсы имитацией")
    await _simulate(db, primary, item)
    await cache.stage("Сравниваем покупку, лизинг и услугу")
    async with UnitOfWork(db.session()) as uow:
        snapshot = await _snapshot(uow, item, primary, version)
        await uow.commit()
    await cache.publish(snapshot)
