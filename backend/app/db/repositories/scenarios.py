from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CalculationRun, Project, Scenario, ScenarioItem


class ScenarioRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def add(self, item: Scenario | ScenarioItem | CalculationRun) -> None:
        self._session.add(item)

    async def delete(self, item: Scenario) -> None:
        await self._session.delete(item)

    async def for_project(self, project_id: UUID) -> Sequence[Scenario]:
        statement = (
            select(Scenario)
            .where(Scenario.project_id == project_id)
            .order_by(Scenario.is_baseline.desc(), Scenario.created_at, Scenario.id)
        )
        return (await self._session.scalars(statement)).all()

    async def get_owned(self, scenario_id: UUID, owner_id: UUID, *, lock: bool = False) -> Scenario | None:
        statement = (
            select(Scenario)
            .join(Project, Project.id == Scenario.project_id)
            .where(Scenario.id == scenario_id, Project.owner_id == owner_id)
        )
        if lock:
            statement = statement.with_for_update(of=Scenario)
        scenario: Scenario | None = await self._session.scalar(statement)
        return scenario

    async def counts(self, project_ids: Sequence[UUID]) -> dict[UUID, int]:
        if not project_ids:
            return {}
        statement = (
            select(Scenario.project_id, func.count())
            .where(Scenario.project_id.in_(project_ids))
            .group_by(Scenario.project_id)
        )
        return dict((await self._session.execute(statement)).tuples().all())

    async def latest_runs(self, scenario_ids: Sequence[UUID]) -> dict[UUID, CalculationRun]:
        if not scenario_ids:
            return {}
        latest = (
            select(CalculationRun.scenario_id, func.max(CalculationRun.computed_at).label("at"))
            .where(CalculationRun.scenario_id.in_(scenario_ids))
            .group_by(CalculationRun.scenario_id)
            .subquery()
        )
        on_latest = (CalculationRun.scenario_id == latest.c.scenario_id) & (
            CalculationRun.computed_at == latest.c.at
        )
        statement = select(CalculationRun).join(latest, on_latest)
        return {run.scenario_id: run for run in (await self._session.scalars(statement)).all()}

    async def run_owned(self, run_id: UUID, owner_id: UUID) -> CalculationRun | None:
        statement = (
            select(CalculationRun)
            .join(Project, Project.id == CalculationRun.project_id)
            .where(CalculationRun.id == run_id, Project.owner_id == owner_id)
        )
        run: CalculationRun | None = await self._session.scalar(statement)
        return run
