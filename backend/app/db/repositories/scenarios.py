from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CalculationRun, Project, Scenario, ScenarioItem
from app.domain.scenario.models import ScenarioKind


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

    async def set_recommended(self, project_id: UUID, scenario_id: UUID | None) -> None:
        """One statement for the whole project: exactly one scenario (or none) is left recommended."""
        await self._session.execute(
            update(Scenario)
            .where(Scenario.project_id == project_id)
            .values(is_recommended=Scenario.id == scenario_id if scenario_id else False)
            .execution_options(synchronize_session="fetch")
        )

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

    async def latest_robotized_run(self, project_id: UUID) -> CalculationRun | None:
        statement = (
            select(CalculationRun)
            .where(
                CalculationRun.project_id == project_id, CalculationRun.scenario_kind != ScenarioKind.BASELINE
            )
            .order_by(CalculationRun.computed_at.desc())
            .limit(1)
        )
        run: CalculationRun | None = await self._session.scalar(statement)
        return run

    async def run_owned(self, run_id: UUID, owner_id: UUID) -> CalculationRun | None:
        statement = (
            select(CalculationRun)
            .join(Project, Project.id == CalculationRun.project_id)
            .where(CalculationRun.id == run_id, Project.owner_id == owner_id)
        )
        run: CalculationRun | None = await self._session.scalar(statement)
        return run

    async def latest_project_runs(self, project_ids: Sequence[UUID]) -> dict[UUID, CalculationRun]:
        if not project_ids:
            return {}
        latest = (
            select(CalculationRun.project_id, func.max(CalculationRun.computed_at).label("at"))
            .where(CalculationRun.project_id.in_(project_ids))
            .group_by(CalculationRun.project_id)
            .subquery()
        )
        on_latest = (CalculationRun.project_id == latest.c.project_id) & (
            CalculationRun.computed_at == latest.c.at
        )
        statement = select(CalculationRun).join(latest, on_latest)
        return {run.project_id: run for run in (await self._session.scalars(statement)).all()}

    async def recommended(self, project_ids: Sequence[UUID]) -> dict[UUID, Scenario]:
        if not project_ids:
            return {}
        statement = select(Scenario).where(Scenario.project_id.in_(project_ids), Scenario.is_recommended)
        return {s.project_id: s for s in (await self._session.scalars(statement)).all()}

    async def copy_to(self, source_project_id: UUID, target_project_id: UUID, actor: str) -> int:
        """Scenarios with their items move to the copy; calculations stay behind and are redone on demand."""
        scenarios = await self.for_project(source_project_id)
        for scenario in scenarios:
            copy = Scenario(
                project_id=target_project_id,
                name=scenario.name,
                kind=scenario.kind,
                is_baseline=scenario.is_baseline,
                financing=dict(scenario.financing),
                horizon_years=scenario.horizon_years,
                discount_rate_pct=scenario.discount_rate_pct,
                overrides=list(scenario.overrides),
                created_by=actor,
            )
            copy.items = [
                ScenarioItem(
                    position=item.position,
                    process_key=item.process_key,
                    product_id=item.product_id,
                    offer_id=item.offer_id,
                    count_mode=item.count_mode,
                    count_manual=item.count_manual,
                    stations_mode=item.stations_mode,
                    stations_count=item.stations_count,
                    price_override_rub=item.price_override_rub,
                    throughput_override_per_hour=item.throughput_override_per_hour,
                    override_reason=item.override_reason,
                    notes=item.notes,
                )
                for item in scenario.items
            ]
            self._session.add(copy)
        return len(scenarios)
