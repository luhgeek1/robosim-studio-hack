import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core.errors import ConflictError, DomainError, ErrorCode, NotFoundError
from app.db.models import Project
from app.db.repositories.layouts import LayoutRepository
from app.db.repositories.projects import ProjectRepository, ProjectSort
from app.db.repositories.scenarios import ScenarioRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.project.models import AuditEntry, InitMode, ProjectInfo, ProjectStatus
from app.domain.project.params import data_quality
from app.domain.scenario.models import ScenarioKind
from app.service.layouts.service import LayoutService
from app.service.projects.audit import AuditLog
from app.service.projects.context import ProjectContext, ProjectLoader

_EDITABLE_STATUSES = frozenset({ProjectStatus.DRAFT, ProjectStatus.READY, ProjectStatus.ARCHIVED})

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ProjectDraft:
    name: str
    object_type: str
    mode: InitMode = InitMode.BLANK
    demo_key: str | None = None
    source_project_id: UUID | None = None
    notes: str | None = None
    tags: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class ProjectPatch:
    fields: frozenset[str]
    name: str | None = None
    notes: str | None = None
    tags: list[str] | None = None
    status: ProjectStatus | None = None


@dataclass(frozen=True, slots=True)
class ScenarioSummary:
    scenarios_count: int = 0
    last_calculation_id: UUID | None = None
    recommended_scenario_id: UUID | None = None
    headline: dict[str, Any] = field(default_factory=dict)


async def scenario_summaries(
    repo: ScenarioRepository, project_ids: list[UUID]
) -> dict[UUID, ScenarioSummary]:
    counts = await repo.counts(project_ids)
    latest = await repo.latest_project_runs(project_ids)
    recommended = await repo.recommended(project_ids)
    runs = await repo.latest_runs([s.id for s in recommended.values()])
    result: dict[UUID, ScenarioSummary] = {}
    for project_id in project_ids:
        scenario = recommended.get(project_id)
        run = runs.get(scenario.id) if scenario else latest.get(project_id)
        headline = (
            {
                "payback_years": run.payback_years,
                "capex_rub": run.capex_rub,
                "effect_rub_year": run.effect_rub_year,
                "verdict": run.verdict,
            }
            if run is not None and run.scenario_kind != ScenarioKind.BASELINE
            else {}
        )
        result[project_id] = ScenarioSummary(
            scenarios_count=counts.get(project_id, 0),
            last_calculation_id=latest[project_id].id if project_id in latest else None,
            recommended_scenario_id=scenario.id if scenario else None,
            headline=headline,
        )
    return result


def to_info(context: ProjectContext, scenarios: ScenarioSummary | None = None) -> ProjectInfo:
    project = context.project
    extra = scenarios or ScenarioSummary()
    summary, _ = data_quality(context.params, {})
    return ProjectInfo(
        id=project.id,
        name=project.name,
        object_type=project.object_type,
        status=ProjectStatus(project.status),
        version=project.version,
        owner_id=project.owner_id,
        organization=project.organization,
        notes=project.notes,
        tags=list(project.tags),
        created_at=project.created_at,
        updated_at=project.updated_at,
        data_quality=summary,
        scenarios_count=extra.scenarios_count,
        is_demo=project.init_mode == InitMode.DEMO,
        headline_metrics=extra.headline,
        last_calculation_id=extra.last_calculation_id,
        recommended_scenario_id=extra.recommended_scenario_id,
    )


class ProjectService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._repo = ProjectRepository(uow.session)
        self._loader = ProjectLoader(uow)
        self._audit = AuditLog(self._repo, user)
        self._scenarios = ScenarioRepository(uow.session)

    async def list_projects(
        self,
        *,
        q: str | None,
        object_type: str | None,
        status: str | None,
        sort: ProjectSort,
        page: int,
        page_size: int,
    ) -> tuple[list[ProjectInfo], int]:
        projects, total = await self._repo.list_owned(
            self._user.id,
            q=q,
            object_type=object_type,
            status=status,
            sort=sort,
            page=page,
            page_size=page_size,
        )
        contexts = await self._loader.contexts(list(projects))
        summaries = await scenario_summaries(self._scenarios, [p.id for p in projects])
        return [to_info(context, summaries.get(context.project.id)) for context in contexts], total

    async def get(self, project_id: UUID) -> ProjectInfo:
        context = await self._loader.context(self._user, project_id)
        summaries = await scenario_summaries(self._scenarios, [project_id])
        return to_info(context, summaries.get(project_id))

    async def create(self, draft: ProjectDraft) -> ProjectInfo:
        object_type = await self._loader.object_type(draft.object_type)
        if draft.mode == InitMode.COPY:
            if draft.source_project_id is None:
                raise DomainError("Для копии укажите исходный проект", error_code=ErrorCode.BAD_REQUEST)
            return await self.copy(draft.source_project_id, draft.name)
        demo_keys = {demo.key for demo in object_type.demo_projects}
        if draft.mode == InitMode.DEMO and draft.demo_key not in demo_keys:
            raise NotFoundError(f"Демо-объект не найден; доступны: {', '.join(sorted(demo_keys)) or 'нет'}")
        project = Project(
            owner_id=self._user.id,
            name=draft.name.strip(),
            object_type=draft.object_type,
            status=ProjectStatus.DRAFT,
            init_mode=draft.mode,
            demo_key=draft.demo_key if draft.mode == InitMode.DEMO else None,
            version=1,
            notes=draft.notes,
            tags=draft.tags,
        )
        self._repo.add(project)
        await self._uow.flush()
        self._audit.write(project.id, "project", "create", after=self._repo.snapshot(project))
        if draft.mode == InitMode.DEMO and object_type.layout_templates:
            await self._demo_layout(project.id)
        return await self.get(project.id)

    async def _demo_layout(self, project_id: UUID) -> None:
        """A demo object comes with its layout: routes in matching and scenarios are real from the start."""
        try:
            await LayoutService(self._uow, self._user).generate(project_id, None, {}, bump=False)
        except ConflictError as exc:
            logger.warning("demo_layout_skipped", extra={"project_id": str(project_id), "reason": exc.detail})

    async def update(self, project_id: UUID, patch: ProjectPatch) -> ProjectInfo:
        project = await self._loader.project(self._user, project_id, lock=True)
        before = self._repo.snapshot(project)
        if "name" in patch.fields and patch.name:
            project.name = patch.name.strip()
        if "notes" in patch.fields:
            project.notes = patch.notes
        if "tags" in patch.fields and patch.tags is not None:
            project.tags = patch.tags
        if "status" in patch.fields and patch.status is not None:
            if patch.status not in _EDITABLE_STATUSES:
                raise DomainError(
                    "Статус «рассчитан» ставится только расчётом", error_code=ErrorCode.BAD_REQUEST
                )
            project.status = patch.status
        project.updated_at = datetime.now(UTC)
        await self._uow.flush()
        self._audit.write(
            project.id,
            "project",
            "update",
            before=before,
            after=self._repo.snapshot(project),
        )
        return await self.get(project.id)

    async def delete(self, project_id: UUID) -> None:
        project = await self._loader.project(self._user, project_id, lock=True)
        self._audit.write(
            None,
            f"project:{project.id}",
            "delete",
            before=self._repo.snapshot(project),
        )
        await self._repo.delete(project)
        await self._uow.flush()

    async def copy(self, project_id: UUID, name: str | None) -> ProjectInfo:
        source = await self._loader.project(self._user, project_id)
        copy = Project(
            owner_id=self._user.id,
            name=(name or f"{source.name} (копия)").strip(),
            object_type=source.object_type,
            status=ProjectStatus.DRAFT,
            init_mode=source.init_mode,
            demo_key=source.demo_key,
            version=1,
            organization=source.organization,
            notes=source.notes,
            tags=list(source.tags),
        )
        self._repo.add(copy)
        await self._uow.flush()
        await self._repo.copy_params(source.id, copy.id)
        await LayoutRepository(self._uow.session).copy(source.id, copy.id, self._user.email)
        await self._scenarios.copy_to(source.id, copy.id, self._user.email)
        self._audit.write(copy.id, "project", "create", after={"copied_from": str(source.id)})
        await self._uow.flush()
        return await self.get(copy.id)

    async def export(self, project_id: UUID) -> dict[str, Any]:
        context = await self._loader.context(self._user, project_id)
        info = to_info(context)
        return {
            "project": {
                "id": str(info.id),
                "name": info.name,
                "object_type": info.object_type,
                "version": info.version,
            },
            "params": {
                p.key: {"value": p.value, "unit": p.unit, "status": p.provenance.status.value}
                for p in context.params
            },
            "exported_at": datetime.now(UTC).isoformat(),
        }

    async def audit(self, project_id: UUID, page: int, page_size: int) -> tuple[list[AuditEntry], int]:
        await self._loader.project(self._user, project_id)
        rows, total = await self._repo.audit(project_id, page, page_size)
        return [
            AuditEntry(r.id, r.at, r.actor, r.entity, r.action, r.before, r.after, r.note) for r in rows
        ], total
