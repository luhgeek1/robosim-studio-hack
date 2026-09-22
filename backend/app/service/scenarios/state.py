from app.core.versions import ENGINE_VERSION
from app.db.models import Project
from app.db.repositories.reference import ReferenceRepository
from app.db.uow import UnitOfWork
from app.service.scenarios.views import Versions

NO_VERSION = "none"


class VersionReader:
    """Current versions of everything a calculation depends on — a stored run is stale when any differs."""

    def __init__(self, uow: UnitOfWork) -> None:
        self._reference = ReferenceRepository(uow.session)

    async def current(self, project: Project) -> Versions:
        norm_set = await self._reference.norm_set(None)
        return Versions(
            project_version=project.version,
            catalog_version=await self._reference.data_version("catalog") or NO_VERSION,
            norm_set_version=norm_set.version if norm_set else NO_VERSION,
            engine_version=ENGINE_VERSION,
        )
