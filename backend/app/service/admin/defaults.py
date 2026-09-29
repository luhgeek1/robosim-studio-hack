from typing import Any

from app.core.errors import InvalidInputError, NotFoundError
from app.db.models import AuditEvent, ParameterDef as ParameterRow, Source
from app.db.repositories.catalog_admin import CatalogAdminRepository
from app.db.repositories.parameter_defaults import ParameterDefaultsRepository, default_entity
from app.db.uow import UnitOfWork
from app.domain.admin import DefaultChange, DefaultView, SpecScalar, default_problem, restamped_modes
from app.domain.common.provenance import ProvenanceStatus
from app.domain.project.models import AuditEntry, InitMode
from app.domain.project.params import default_applies
from app.domain.reference import ObjectTypeDetail, ParameterDef
from app.service.reference import ReferenceService

_PROJECT_ENTITY = "project_param:"


def _usage(
    definition: ParameterDef, by_mode: dict[InitMode, int], own: dict[tuple[str, InitMode], int]
) -> int:
    """Projects whose field is empty and filled by this default (a stored value always wins)."""
    default = definition.default
    if default is None:
        return 0
    return sum(
        count - own.get((definition.key, mode), 0)
        for mode, count in by_mode.items()
        if default_applies(default.provenance.status, definition.required, mode)
    )


def _normalized(definition: ParameterDef, value: SpecScalar) -> SpecScalar:
    """JSON gives 3.0 for an integer field typed as «3,0»: store it as 3, like the form does."""
    if definition.type == "integer" and isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def _snapshot(row: ParameterRow, source_title: str | None) -> dict[str, Any] | None:
    if row.default_status is None:
        return None
    return {"value": row.default_value, "status": row.default_status.value, "source": source_title}


class ParameterDefaultsAdmin:
    """Reference defaults of object parameters (ТЗ 2.1.6, 3.1.4) — edited in place, versioned by projects.

    A default is read live when a project has no own value. A change therefore restamps exactly the projects
    whose effective value moves: their version grows, saved calculations turn stale and keep their own input
    snapshot, so each old result stays reproducible and a rerun names the parameter in its diff.
    """

    def __init__(self, uow: UnitOfWork, actor_email: str) -> None:
        self._uow = uow
        self._actor = actor_email
        self._repo = ParameterDefaultsRepository(uow.session)
        self._sources = CatalogAdminRepository(uow.session)
        self._reference = ReferenceService(uow)

    async def defaults(self, object_type: str) -> list[DefaultView]:
        detail = await self._reference.object_type(object_type)
        by_mode = await self._repo.projects_by_mode(object_type)
        own = await self._repo.own_values_by_mode(object_type)
        changes = await self._repo.last_changes(object_type)
        return [
            self._view(detail, group.name, param, by_mode, own, changes.get(param.key))
            for group in detail.parameter_groups
            for param in group.parameters
        ]

    async def update(self, object_type: str, key: str, change: DefaultChange) -> tuple[DefaultView, int]:
        row = await self._repo.get(object_type, key, lock=True)
        if row is None:
            raise NotFoundError("Параметр не найден")
        value = await self._checked_value(object_type, row, change)
        status = change.status or row.default_status or ProvenanceStatus.ASSUMPTION
        before = _snapshot(row, await self._source_title(row))
        old_value, old_status = row.default_value, row.default_status
        source = await self._sources.add_source(change.source)
        row.default_value, row.default_status = value, status
        row.default_source_id, row.default_note = source.id, change.rationale
        await self._uow.flush()
        modes = restamped_modes((old_value, old_status), (value, status), row.required)
        restamped = await self._repo.restamp_projects(object_type, key, modes)
        entity = default_entity(object_type, key)
        after = _snapshot(row, source.title) or {}
        self._repo.audit(None, entity, self._actor, before=before, after=after, note=change.rationale)
        note = f"Администратор изменил значение по умолчанию: {change.rationale}"
        for project_id, mode in restamped:
            applied = old_status is not None and default_applies(old_status, row.required, mode)
            previous = {"value": old_value} if applied else None
            project_entity = f"{_PROJECT_ENTITY}{key}"
            self._repo.audit(
                project_id, project_entity, self._actor, before=previous, after={"value": value}, note=note
            )
        await self._uow.flush()
        views = await self.defaults(object_type)
        return next(view for view in views if view.definition.key == key), len(restamped)

    async def _checked_value(self, object_type: str, row: ParameterRow, change: DefaultChange) -> SpecScalar:
        if change.unit is not None and change.unit != (row.unit or ""):
            raise InvalidInputError(f"Единица параметра «{row.name}» — {row.unit or 'без единицы'}")
        detail = await self._reference.object_type(object_type)
        definition = next(param for param in detail.parameters if param.key == row.key)
        value = _normalized(definition, change.value)
        if (problem := default_problem(definition, value)) is not None:
            raise InvalidInputError(f"«{row.name}»: {problem}")
        return value

    async def history(
        self, object_type: str, key: str, page: int, page_size: int
    ) -> tuple[list[AuditEntry], int]:
        if await self._repo.get(object_type, key) is None:
            raise NotFoundError("Параметр не найден")
        rows, total = await self._repo.history(object_type, key, page, page_size)
        return [_entry(row) for row in rows], total

    async def _source_title(self, row: ParameterRow) -> str | None:
        source = await self._uow.session.get(Source, row.default_source_id) if row.default_source_id else None
        return source.title if source else None

    @staticmethod
    def _view(
        detail: ObjectTypeDetail,
        group_name: str,
        param: ParameterDef,
        by_mode: dict[InitMode, int],
        own: dict[tuple[str, InitMode], int],
        last: AuditEvent | None,
    ) -> DefaultView:
        default = param.default
        return DefaultView(
            object_type=detail.key.value,
            group_name=group_name,
            definition=param,
            applies_to_blank=default is None
            or default_applies(default.provenance.status, param.required, InitMode.BLANK),
            projects_total=sum(by_mode.values()),
            projects_using_default=_usage(param, by_mode, own),
            changed_by=last.actor if last else None,
            changed_at=last.at if last else None,
        )


def _entry(row: AuditEvent) -> AuditEntry:
    return AuditEntry(row.id, row.at, row.actor, row.entity, row.action, row.before, row.after, row.note)
