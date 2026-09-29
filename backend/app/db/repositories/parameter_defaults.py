from collections.abc import Sequence
from typing import Any
from uuid import UUID

from sqlalchemy import exists, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditEvent, ParameterDef, Project, ProjectParam
from app.domain.project.models import InitMode

DEFAULT_ENTITY_PREFIX = "parameter_default:"


def default_entity(object_type: str, key: str) -> str:
    """Audit entity of a reference default: platform events have no project."""
    return f"{DEFAULT_ENTITY_PREFIX}{object_type}.{key}"


class ParameterDefaultsRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, object_type: str, key: str, *, lock: bool = False) -> ParameterDef | None:
        statement = select(ParameterDef).where(
            ParameterDef.object_type == object_type, ParameterDef.key == key
        )
        if lock:
            statement = statement.with_for_update()
        row: ParameterDef | None = await self._session.scalar(statement)
        return row

    async def projects_by_mode(self, object_type: str) -> dict[InitMode, int]:
        statement = (
            select(Project.init_mode, func.count())
            .where(Project.object_type == object_type)
            .group_by(Project.init_mode)
        )
        return {InitMode(mode): count for mode, count in (await self._session.execute(statement)).tuples()}

    async def own_values_by_mode(self, object_type: str) -> dict[tuple[str, InitMode], int]:
        """(parameter, project mode) → projects that store their own value and ignore the default."""
        statement = (
            select(ProjectParam.key, Project.init_mode, func.count())
            .join(Project, Project.id == ProjectParam.project_id)
            .where(Project.object_type == object_type)
            .group_by(ProjectParam.key, Project.init_mode)
        )
        rows = (await self._session.execute(statement)).tuples()
        return {(key, InitMode(mode)): count for key, mode, count in rows}

    async def restamp_projects(
        self, object_type: str, key: str, modes: Sequence[InitMode]
    ) -> list[tuple[UUID, InitMode]]:
        """New version for projects that take this parameter from the default: their calculations go stale.

        ``updated_at`` stays: the user did not touch the project, the reference data changed under it.
        """
        if not modes:
            return []
        own_value = exists().where(ProjectParam.project_id == Project.id, ProjectParam.key == key)
        statement = (
            update(Project)
            .where(Project.object_type == object_type, Project.init_mode.in_(modes), ~own_value)
            .values(version=Project.version + 1, updated_at=Project.updated_at)
            .returning(Project.id, Project.init_mode)
            .execution_options(synchronize_session=False)
        )
        rows = (await self._session.execute(statement)).tuples()
        return [(project_id, InitMode(mode)) for project_id, mode in rows]

    def audit(
        self,
        project_id: UUID | None,
        entity: str,
        actor: str,
        *,
        before: dict[str, Any] | None,
        after: dict[str, Any],
        note: str,
    ) -> None:
        self._session.add(
            AuditEvent(
                project_id=project_id,
                actor=actor,
                entity=entity,
                action="update",
                before=before,
                after=after,
                note=note,
            )
        )

    async def last_changes(self, object_type: str) -> dict[str, AuditEvent]:
        """Latest admin change of each default of the object type (key → event)."""
        prefix = f"{DEFAULT_ENTITY_PREFIX}{object_type}."
        statement = (
            select(AuditEvent)
            .where(AuditEvent.project_id.is_(None), AuditEvent.entity.startswith(prefix))
            .order_by(AuditEvent.entity, AuditEvent.at.desc())
            .distinct(AuditEvent.entity)
        )
        return {row.entity.removeprefix(prefix): row for row in await self._session.scalars(statement)}

    async def history(
        self, object_type: str, key: str, page: int, page_size: int
    ) -> tuple[Sequence[AuditEvent], int]:
        where = (AuditEvent.project_id.is_(None), AuditEvent.entity == default_entity(object_type, key))
        total = await self._session.scalar(select(func.count()).select_from(AuditEvent).where(*where))
        statement = (
            select(AuditEvent)
            .where(*where)
            .order_by(AuditEvent.at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return (await self._session.scalars(statement)).all(), total or 0
