from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.db.models import Project, SimulationRun
from app.db.repositories.projects import accessible_to
from app.domain.jobs import JobStatus


class SimulationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, run: SimulationRun) -> None:
        self._session.add(run)

    async def delete(self, run: SimulationRun) -> None:
        await self._session.delete(run)

    async def get_owned(
        self, run_id: UUID, owner_id: UUID, *, with_events: bool = False
    ) -> SimulationRun | None:
        statement = (
            select(SimulationRun)
            .join(Project, Project.id == SimulationRun.project_id)
            .where(SimulationRun.id == run_id, accessible_to(owner_id))
        )
        if not with_events:
            statement = statement.options(defer(SimulationRun.events), defer(SimulationRun.engine_input))
        run: SimulationRun | None = await self._session.scalar(statement)
        return run

    async def for_scenario(self, scenario_id: UUID) -> Sequence[SimulationRun]:
        statement = (
            select(SimulationRun)
            .where(SimulationRun.scenario_id == scenario_id)
            .options(
                defer(SimulationRun.events),
                defer(SimulationRun.engine_input),
                defer(SimulationRun.timeline),
                defer(SimulationRun.heatmap),
            )
            .order_by(SimulationRun.created_at.desc())
        )
        return (await self._session.scalars(statement)).all()

    async def get(self, run_id: UUID) -> SimulationRun | None:
        return await self._session.get(SimulationRun, run_id)

    async def latest_done(self, scenario_id: UUID) -> SimulationRun | None:
        statement = (
            select(SimulationRun)
            .where(SimulationRun.scenario_id == scenario_id, SimulationRun.status == JobStatus.DONE)
            .options(defer(SimulationRun.events), defer(SimulationRun.engine_input))
            .order_by(SimulationRun.created_at.desc())
            .limit(1)
        )
        run: SimulationRun | None = await self._session.scalar(statement)
        return run
