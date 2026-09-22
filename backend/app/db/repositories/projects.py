from collections.abc import Sequence
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditEvent, ParamHistory, ParamImport, Project, ProjectParam, Source

ProjectSort = Literal["updated_desc", "created_desc", "name"]
_SORTS = {
    "updated_desc": Project.updated_at.desc(),
    "created_desc": Project.created_at.desc(),
    "name": Project.name,
}


class ProjectRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_owned(
        self,
        owner_id: UUID,
        *,
        q: str | None,
        object_type: str | None,
        status: str | None,
        sort: ProjectSort,
        page: int,
        page_size: int,
    ) -> tuple[Sequence[Project], int]:
        statement = select(Project).where(Project.owner_id == owner_id)
        if q:
            statement = statement.where(Project.name.ilike(f"%{q}%"))
        if object_type:
            statement = statement.where(Project.object_type == object_type)
        if status:
            statement = statement.where(Project.status == status)
        total = await self._session.scalar(select(func.count()).select_from(statement.subquery()))
        page_query = (
            statement.order_by(_SORTS[sort], Project.id).limit(page_size).offset((page - 1) * page_size)
        )
        return (await self._session.scalars(page_query)).all(), int(total or 0)

    async def get_owned(self, project_id: UUID, owner_id: UUID, *, lock: bool = False) -> Project | None:
        statement = select(Project).where(Project.id == project_id, Project.owner_id == owner_id)
        if lock:
            statement = statement.with_for_update()
        project: Project | None = await self._session.scalar(statement)
        return project

    def add(self, item: Project | ProjectParam | ParamHistory | AuditEvent | ParamImport) -> None:
        self._session.add(item)

    async def delete(self, project: Project) -> None:
        await self._session.delete(project)

    async def params(self, project_ids: Sequence[UUID]) -> Sequence[ProjectParam]:
        if not project_ids:
            return []
        rows = await self._session.scalars(
            select(ProjectParam).where(ProjectParam.project_id.in_(project_ids))
        )
        return rows.all()

    async def param(self, project_id: UUID, key: str) -> ProjectParam | None:
        statement = select(ProjectParam).where(ProjectParam.project_id == project_id, ProjectParam.key == key)
        param: ProjectParam | None = await self._session.scalar(statement)
        return param

    async def delete_param(self, param: ProjectParam) -> None:
        await self._session.delete(param)

    async def history_counts(self, project_id: UUID) -> dict[str, int]:
        statement = (
            select(ParamHistory.key, func.count())
            .where(ParamHistory.project_id == project_id)
            .group_by(ParamHistory.key)
        )
        return dict((await self._session.execute(statement)).tuples().all())

    async def history(self, project_id: UUID, key: str, limit: int) -> Sequence[ParamHistory]:
        statement = (
            select(ParamHistory)
            .where(ParamHistory.project_id == project_id, ParamHistory.key == key)
            .order_by(ParamHistory.changed_at.desc())
            .limit(limit)
        )
        return (await self._session.scalars(statement)).all()

    async def copy_params(self, source_id: UUID, target_id: UUID) -> None:
        for param in await self.params([source_id]):
            self._session.add(
                ProjectParam(
                    project_id=target_id,
                    key=param.key,
                    value=param.value,
                    unit=param.unit,
                    status=param.status,
                    source_id=param.source_id,
                    confidence=param.confidence,
                    raw_value=param.raw_value,
                    note=param.note,
                    changed_by=param.changed_by,
                    changed_at=param.changed_at,
                )
            )

    async def audit(self, project_id: UUID, page: int, page_size: int) -> tuple[Sequence[AuditEvent], int]:
        statement = select(AuditEvent).where(AuditEvent.project_id == project_id)
        total = await self._session.scalar(select(func.count()).select_from(statement.subquery()))
        rows = await self._session.scalars(
            statement.order_by(AuditEvent.at.desc()).limit(page_size).offset((page - 1) * page_size)
        )
        return rows.all(), int(total or 0)

    async def import_(self, project_id: UUID, import_id: UUID) -> ParamImport | None:
        statement = select(ParamImport).where(
            ParamImport.id == import_id, ParamImport.project_id == project_id
        )
        item: ParamImport | None = await self._session.scalar(statement)
        return item

    async def sources(self, ids: set[UUID]) -> dict[UUID, Source]:
        if not ids:
            return {}
        return {s.id: s for s in await self._session.scalars(select(Source).where(Source.id.in_(ids)))}

    async def clear_params(self, project_id: UUID) -> None:
        await self._session.execute(delete(ProjectParam).where(ProjectParam.project_id == project_id))

    @staticmethod
    def snapshot(project: Project) -> dict[str, Any]:
        return {"name": project.name, "status": project.status.value, "version": project.version}
