from copy import deepcopy
from uuid import uuid5

from sqlalchemy import func, select, text

from app.api.guest_limits import MAX_GUEST_PROJECTS
from app.api.schemas.demo import DemoOpenRequest, DemoOpenResult, DemoSnapshot
from app.api.schemas.projects import Project as ProjectResponse
from app.core.errors import ConflictError, RateLimitedError
from app.db.models import Job, Project, Scenario, SimulationRun
from app.db.repositories.layouts import LayoutRepository
from app.db.repositories.projects import ProjectRepository
from app.db.repositories.scenarios import ScenarioRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser, Role
from app.domain.project.models import InitMode, ProjectStatus
from app.service.auth.guests import MAX_GUEST_SCENARIOS
from app.service.projects.service import ProjectService
from app.service.scenarios.calculations import CalculationService
from app.service.scenarios.comparison import ComparisonService


async def _copy_evidence(
    uow: UnitOfWork, user: CurrentUser, source: Scenario, target: Scenario
) -> dict[str, SimulationRun]:
    layout = await LayoutRepository(uow.session).get(target.project_id)
    assert layout is not None
    original = {item.process_key: item for item in source.items}
    copies: dict[str, SimulationRun] = {}
    for item in target.items:
        before = original[item.process_key]
        if before.simulation_id is None or before.simulated_count is None:
            continue
        key = str(before.simulation_id)
        if key not in copies:
            run = await uow.session.get(SimulationRun, before.simulation_id)
            assert run is not None
            copied = SimulationRun(
                project_id=target.project_id,
                scenario_id=target.id,
                layout_id=layout.id,
                layout_version=layout.version,
                status=run.status,
                progress=run.progress,
                purpose=run.purpose,
                stage="Подготовленная проверка исходного примера",
                config=run.config,
                engine_input=run.engine_input,
                versions={**run.versions, "project_version": 1, "layout_version": layout.version},
                seed=run.seed,
                fleet=run.fleet,
                summary=run.summary,
                timeline=run.timeline,
                heatmap=run.heatmap,
                robots=run.robots,
                events=run.events,
                events_count=run.events_count,
                duration_ms=run.duration_ms,
                created_by=user.email,
                created_at=run.created_at,
                finished_at=run.finished_at,
            )
            uow.session.add(copied)
            await uow.flush()
            copies[key] = copied
        item.simulation_id = copies[key].id
        item.simulated_count = before.simulated_count
        item.simulated_basis = before.simulated_basis
        item.simulated_project_version = 1
        item.simulated_fingerprint = before.simulated_fingerprint
        item.simulation_note = "Подготовленная проверка исходного примера; физические условия совпадают"
    await uow.flush()
    snapshot = await CalculationService(uow, user).snapshot(target)
    if any(
        i.simulated_count and i.simulated_fingerprint != snapshot.physical_fingerprint for i in target.items
    ):
        raise ConflictError("Условия проверки примера изменились. Обновите демо перед сохранением.")

    return copies


async def open_example(
    uow: UnitOfWork, user: CurrentUser, demo: DemoSnapshot, request: DemoOpenRequest
) -> DemoOpenResult:
    project_id = uuid5(user.id, f"demo-open:{request.request_id}")
    await uow.session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": project_id.int % (2**63)})
    projects = ProjectService(uow, user)
    existing = await uow.session.get(Project, project_id)
    if existing:
        if existing.demo_key != demo.demo.key:
            raise ConflictError("Этот запрос уже открыл другой пример")
        return DemoOpenResult(project=ProjectResponse.from_domain(await projects.get(project_id)))
    repository = ScenarioRepository(uow.session)
    originals = await repository.for_project(demo.comparison.project_id)
    if user.role == Role.GUEST:
        projects_count = await uow.session.scalar(
            select(func.count()).select_from(Project).where(Project.owner_id == user.id)
        )
        scenarios_count = await uow.session.scalar(
            select(func.count()).select_from(Scenario).join(Project).where(Project.owner_id == user.id)
        )
        if (projects_count or 0) >= MAX_GUEST_PROJECTS or (scenarios_count or 0) + len(
            originals
        ) > MAX_GUEST_SCENARIOS:
            raise RateLimitedError(
                "Недостаточно места для примера. Удалите лишний проект или сохраните их в аккаунте."
            )
    project = Project(
        id=project_id,
        owner_id=user.id,
        name=demo.demo.name,
        object_type=demo.demo.object_type,
        status=ProjectStatus.DRAFT,
        init_mode=InitMode.DEMO,
        demo_key=demo.demo.key,
        version=1,
        notes=(
            f"Личная копия примера. {demo.demo.scope} Проверка подготовлена {demo.prepared_at.isoformat()}."
        ),
        tags=[],
    )
    uow.session.add(project)
    await uow.flush()
    await ProjectRepository(uow.session).copy_params(demo.comparison.project_id, project.id)
    await LayoutRepository(uow.session).copy(demo.comparison.project_id, project.id, user.email)
    await repository.copy_to(demo.comparison.project_id, project.id, user.email)
    await uow.flush()
    sources = {s.kind: s for s in originals}
    for target in await repository.for_project(project.id):
        source = sources[target.kind]
        target.is_recommended = source.id == demo.primary_scenario_id
        if target.is_baseline:
            continue
        copies = await _copy_evidence(uow, user, source, target)
        sweep = await uow.jobs.latest_sweep(source.id) or await uow.jobs.latest_sweep(
            demo.primary_scenario_id
        )
        if sweep is not None and sweep.result is not None:
            await _copy_sweep(uow, user, sweep, target, copies)
    await ComparisonService(uow, user).compare(project.id, recalculate_stale=True)
    await uow.flush()
    return DemoOpenResult(project=ProjectResponse.from_domain(await projects.get(project.id)))


async def _copy_sweep(
    uow: UnitOfWork, user: CurrentUser, source: Job, target: Scenario, runs: dict[str, SimulationRun]
) -> None:
    payload, result = deepcopy(source.payload), deepcopy(source.result)
    assert result is not None
    payload.update(scenario_id=str(target.id), project_version=1, scenario_version=target.version)
    layout = await LayoutRepository(uow.session).get(target.project_id)
    assert layout is not None
    payload["layout_id"] = str(layout.id)
    payload["versions"] = {
        **payload.get("versions", {}),
        "project_version": 1,
        "layout_version": layout.version,
    }
    # Only the selected run is copied. KPI-only search points do not need replay references.
    for point in [result, *result.get("points", [])]:
        old_id = str(point.get("simulation_id"))
        if old_id in runs:
            point["simulation_id"] = str(runs[old_id].id)
        elif "simulation_id" in point:
            point["simulation_id"] = None
    job = Job(
        type=source.type,
        status=source.status,
        owner_id=user.id,
        progress=1,
        stage="Подготовленная проверка исходного примера",
        payload=payload,
        result=result,
        created_at=source.created_at,
        started_at=source.started_at,
        finished_at=source.finished_at,
    )
    uow.session.add(job)
    await uow.flush()
    job.result = {**result, "job_id": str(job.id)}
