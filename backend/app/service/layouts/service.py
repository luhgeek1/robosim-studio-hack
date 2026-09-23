import math
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core.errors import (
    ConflictError,
    ErrorCode,
    FileTooLargeError,
    InvalidInputError,
    NotFoundError,
    UnsupportedFileTypeError,
)
from app.db.models import Layout, Project, StoredFile
from app.db.repositories.layouts import LayoutRepository
from app.db.repositories.projects import ProjectRepository
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.layout.models import EdgeKind, LayoutTemplate
from app.domain.project.params import input_names
from app.engine.layout import Edge, LayoutError, Plan, generate, stats, validate
from app.engine.trace import Book, InputKind
from app.service.layouts.mapping import (
    derivation_json,
    edge_from,
    node_from,
    plan_from,
    rack_from,
    stats_json,
    store_plan,
    zone_from,
)
from app.service.projects.audit import AuditLog
from app.service.projects.context import ProjectContext, ProjectLoader
from app.service.projects.norms import NormLoader

LAYOUT_NOT_FOUND = "Планировка ещё не сгенерирована"
BACKGROUND_PURPOSE = "layout_background"
BACKGROUND_TYPES = frozenset({"image/png", "image/jpeg", "application/pdf"})
BACKGROUND_MAX_BYTES = 10 * 1024 * 1024
EDITED_NOTE = "Планировка изменена вручную: геометрия выше описывает исходную генерацию, маршруты пересчитаны"


@dataclass(frozen=True, slots=True)
class LayoutPatch:
    zones: list[dict[str, Any]] | None = None
    racks: list[dict[str, Any]] | None = None
    nodes: list[dict[str, Any]] | None = None
    edges: list[dict[str, Any]] | None = None
    background_scale_m_per_px: float | None = None
    scale_set: bool = False


@dataclass(frozen=True, slots=True)
class LayoutView:
    layout: Layout
    params_changed: bool
    background: StoredFile | None


def param_book(context: ProjectContext) -> Book:
    names = {key: (name, unit) for key, name, unit, _ in input_names(context.params)}
    return Book.of(
        InputKind.PARAM,
        [(key, names[key][0], value, names[key][1]) for key, value in context.numeric().items()],
    )


def _measured(plan: Plan) -> Plan:
    """Straight edges get their length from the node positions; an elevator hop keeps its own."""
    nodes = {node.id: node for node in plan.nodes}

    def length(edge: Edge) -> float:
        first, second = nodes.get(edge.source), nodes.get(edge.target)
        if first is None or second is None:
            return 0.0
        return round(math.hypot(first.x - second.x, first.y - second.y), 2)

    return replace(
        plan,
        edges=tuple(
            e if e.kind == EdgeKind.ELEVATOR_LINK else replace(e, length_m=length(e)) for e in plan.edges
        ),
    )


class LayoutService:
    def __init__(self, uow: UnitOfWork, user: CurrentUser) -> None:
        self._uow = uow
        self._user = user
        self._loader = ProjectLoader(uow)
        self._repo = LayoutRepository(uow.session)
        self._norms = NormLoader(uow)
        self._audit = AuditLog(ProjectRepository(uow.session), user)

    async def _view(self, project: Project, layout: Layout) -> LayoutView:
        background = await self._repo.file(layout.background_file_id) if layout.background_file_id else None
        generated_at = layout.generator.get("project_version")
        changed = layout.generated and generated_at is not None and generated_at < project.version
        return LayoutView(layout, changed, background)

    async def _owned(self, project_id: UUID, *, lock: bool = False) -> tuple[Project, Layout]:
        project = await self._loader.project(self._user, project_id, lock=lock)
        layout = await self._repo.get(project.id, lock=lock)
        if layout is None:
            raise NotFoundError(LAYOUT_NOT_FOUND)
        return project, layout

    async def get(self, project_id: UUID) -> LayoutView:
        project, layout = await self._owned(project_id)
        return await self._view(project, layout)

    @staticmethod
    def _bump(project: Project, layout: Layout) -> None:
        # The layout is part of the project: its change makes stored calculations stale (VersionStamp).
        project.version += 1
        project.updated_at = datetime.now(UTC)
        layout.generator = {**layout.generator, "project_version": project.version}

    async def generate(
        self, project_id: UUID, template: str | None, overrides: dict[str, float], *, bump: bool = True
    ) -> LayoutView:
        """`bump=False` when the layout is created together with the project: nothing was calculated yet."""
        context = await self._loader.context(self._user, project_id, lock=True)
        templates = context.object_type.layout_templates
        if not templates:
            raise ConflictError(
                f"Для типа объекта «{context.object_type.name}» генератор планировки пока не поддерживается",
                error_code=ErrorCode.OBJECT_TYPE_NOT_SUPPORTED,
            )
        chosen = template or templates[0]
        if chosen not in templates:
            raise InvalidInputError(f"Шаблон {chosen} не подходит; доступны: {', '.join(templates)}")
        norms = await self._norms.book(context.project.object_type)
        try:
            generated = generate(LayoutTemplate(chosen), param_book(context), norms, overrides)
            summary = stats(generated.plan)
        except LayoutError as exc:
            raise ConflictError(str(exc), error_code=ErrorCode.PARAMS_INVALID, details=exc.details) from exc
        project = context.project
        layout = await self._repo.get(project.id, lock=True)
        action = "update"
        if layout is None:
            action = "create"
            layout = Layout(project_id=project.id, version=0, updated_by=self._user.email)
            self._repo.add(layout)
        store_plan(layout, generated.plan)
        layout.version += 1
        layout.template = chosen
        layout.generated = True
        layout.generator = {
            "template": chosen,
            "seed": None,
            "overrides": overrides,
            "params": generated.inputs,
        }
        layout.stats = stats_json(summary)
        layout.derivation = derivation_json(generated.derivation)
        layout.warnings = generated.warnings
        layout.updated_by = self._user.email
        if bump:
            self._bump(project, layout)
        else:
            layout.generator = {**layout.generator, "project_version": project.version}
        await self._uow.flush()
        self._audit.write(
            project.id,
            "layout",
            action,
            after={"version": layout.version, "template": chosen, "avg_route_m": layout.stats["avg_route_m"]},
        )
        return await self._view(project, layout)

    async def update(self, project_id: UUID, patch: LayoutPatch) -> LayoutView:
        project, layout = await self._owned(project_id, lock=True)
        current = plan_from(layout)
        try:
            plan = Plan(
                current.width_m,
                current.height_m,
                tuple(zone_from(z) for z in patch.zones) if patch.zones is not None else current.zones,
                tuple(rack_from(r) for r in patch.racks) if patch.racks is not None else current.racks,
                tuple(node_from(n) for n in patch.nodes) if patch.nodes is not None else current.nodes,
                tuple(edge_from(e) for e in patch.edges) if patch.edges is not None else current.edges,
            )
        except (KeyError, ValueError, TypeError) as exc:
            raise InvalidInputError(f"Некорректный элемент планировки: {exc}") from exc
        plan = _measured(plan)
        problems = validate(plan)
        if problems:
            raise InvalidInputError("Планировка не прошла проверку", details=problems)
        before = {"version": layout.version, "avg_route_m": layout.stats.get("avg_route_m")}
        try:
            summary = stats(plan)
        except LayoutError as exc:
            raise InvalidInputError(str(exc)) from exc
        store_plan(layout, plan)
        if patch.scale_set:
            layout.background_scale_m_per_px = patch.background_scale_m_per_px
        layout.version += 1
        layout.generated = False
        layout.stats = stats_json(summary)
        layout.warnings = [w for w in layout.warnings if w != EDITED_NOTE] + [EDITED_NOTE]
        layout.updated_by = self._user.email
        self._bump(project, layout)
        await self._uow.flush()
        self._audit.write(
            project.id,
            "layout",
            "update",
            before=before,
            after={"version": layout.version, "avg_route_m": layout.stats["avg_route_m"]},
        )
        return await self._view(project, layout)

    async def upload_background(
        self, project_id: UUID, filename: str, content_type: str, data: bytes, scale: float | None
    ) -> LayoutView:
        project, layout = await self._owned(project_id, lock=True)
        if content_type not in BACKGROUND_TYPES:
            raise UnsupportedFileTypeError("Подложка принимается в PNG, JPG или PDF")
        if len(data) > BACKGROUND_MAX_BYTES:
            raise FileTooLargeError("Подложка больше 10 МБ")
        stored = StoredFile(
            owner_id=self._user.id,
            project_id=project.id,
            purpose=BACKGROUND_PURPOSE,
            filename=filename,
            content_type=content_type,
            size_bytes=len(data),
            data=data,
        )
        self._repo.add(stored)
        await self._uow.flush()
        layout.background_file_id = stored.id
        if scale is not None:
            layout.background_scale_m_per_px = scale
        layout.updated_by = self._user.email
        await self._uow.flush()
        self._audit.write(project.id, "layout", "import", after={"background": filename, "scale": scale})
        return await self._view(project, layout)

    async def background(self, project_id: UUID) -> StoredFile:
        _, layout = await self._owned(project_id)
        stored = await self._repo.file(layout.background_file_id) if layout.background_file_id else None
        if stored is None:
            raise NotFoundError("Подложка не загружена")
        return stored
