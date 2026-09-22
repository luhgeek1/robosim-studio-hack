from dataclasses import dataclass
from uuid import UUID

from app.core.errors import NotFoundError
from app.db.models import Project, ProjectParam, Source
from app.db.repositories.projects import ProjectRepository
from app.db.repositories.sources import to_source
from app.db.uow import UnitOfWork
from app.domain.auth import CurrentUser
from app.domain.common.provenance import Provenance
from app.domain.project.models import EffectiveParam, InitMode, StoredParam
from app.domain.project.params import numeric_inputs, resolve_all
from app.domain.reference import ObjectTypeDetail
from app.service.reference import ReferenceService

PROJECT_NOT_FOUND = "Проект не найден или недоступен"


def to_stored(param: ProjectParam, sources: dict[UUID, Source], history_count: int) -> StoredParam:
    source = sources.get(param.source_id) if param.source_id else None
    return StoredParam(
        key=param.key,
        value=param.value,
        unit=param.unit,
        provenance=Provenance(
            status=param.status,
            source=to_source(source) if source else None,
            confidence=param.confidence,
            raw_value=param.raw_value,
            note=param.note,
        ),
        history_count=history_count,
    )


@dataclass(slots=True)
class ProjectContext:
    project: Project
    object_type: ObjectTypeDetail
    params: list[EffectiveParam]

    @property
    def by_key(self) -> dict[str, EffectiveParam]:
        return {param.key: param for param in self.params}

    def numeric(self) -> dict[str, float | None]:
        return numeric_inputs(self.params)


class ProjectLoader:
    def __init__(self, uow: UnitOfWork) -> None:
        self._repo = ProjectRepository(uow.session)
        self._reference = ReferenceService(uow)
        self._object_types: dict[str, ObjectTypeDetail] = {}

    async def object_type(self, key: str) -> ObjectTypeDetail:
        if key not in self._object_types:
            self._object_types[key] = await self._reference.object_type(key)
        return self._object_types[key]

    async def project(self, user: CurrentUser, project_id: UUID, *, lock: bool = False) -> Project:
        project = await self._repo.get_owned(project_id, user.id, lock=lock)
        if project is None:
            raise NotFoundError(PROJECT_NOT_FOUND)
        return project

    async def contexts(self, projects: list[Project], *, with_history: bool = False) -> list[ProjectContext]:
        rows = await self._repo.params([p.id for p in projects])
        sources = await self._repo.sources({row.source_id for row in rows if row.source_id})
        result: list[ProjectContext] = []
        for project in projects:
            counts = await self._repo.history_counts(project.id) if with_history else {}
            stored = {
                row.key: to_stored(row, sources, counts.get(row.key, 0))
                for row in rows
                if row.project_id == project.id
            }
            object_type = await self.object_type(project.object_type)
            params = resolve_all(object_type.parameters, stored, InitMode(project.init_mode))
            result.append(ProjectContext(project=project, object_type=object_type, params=params))
        return result

    async def context(self, user: CurrentUser, project_id: UUID, *, lock: bool = False) -> ProjectContext:
        project = await self.project(user, project_id, lock=lock)
        return (await self.contexts([project], with_history=True))[0]
