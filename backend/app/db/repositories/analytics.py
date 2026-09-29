from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, Select, any_, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CalculationRun, ObjectType, ProcessDef, Product, Project, Scenario, ScenarioItem
from app.domain.admin import CatalogGap, ProductCount
from app.domain.catalog import ProductStatus
from app.domain.scenario.models import ScenarioKind

TOP_PRODUCTS_LIMIT = 10


def _within(column: Any, start: datetime | None, end: datetime | None) -> ColumnElement[bool]:
    condition: ColumnElement[bool] = column.is_not(None)
    if start is not None:
        condition = condition & (column >= start)
    if end is not None:
        condition = condition & (column < end)
    return condition


async def _mapping(session: AsyncSession, statement: Select[Any]) -> dict[str, Any]:
    return {str(key): value for key, value in (await session.execute(statement)).tuples()}


class AnalyticsRepository:
    """Aggregates for the ФЦ БАС demand dashboard.

    The [start, end) period applies to each entity's own timestamp: project creation, calculation run,
    scenario creation.
    """

    def __init__(self, session: AsyncSession, start: datetime | None, end: datetime | None) -> None:
        self._session = session
        self._start = start
        self._end = end

    async def projects_by_object_type(self) -> dict[str, int]:
        statement = (
            select(Project.object_type, func.count())
            .where(_within(Project.created_at, self._start, self._end))
            .group_by(Project.object_type)
        )
        return await _mapping(self._session, statement)

    async def projects_by_industry(self) -> dict[str, int]:
        statement = (
            select(ObjectType.industry, func.count(Project.id))
            .join(Project, Project.object_type == ObjectType.key)
            .where(_within(Project.created_at, self._start, self._end))
            .group_by(ObjectType.industry)
        )
        return await _mapping(self._session, statement)

    async def calculations_count(self) -> int:
        statement = select(func.count()).where(_within(CalculationRun.computed_at, self._start, self._end))
        return int(await self._session.scalar(statement) or 0)

    async def avg_payback_by_object_type(self) -> dict[str, float]:
        """One run per project: the latest one of its recommended scenario, else of any robot scenario.

        Runs without a payback (the project never pays back within the horizon) and the «as is» baseline
        are left out, so the average describes projects that do pay back.
        """
        per_project = (
            select(Project.object_type.label("object_type"), CalculationRun.payback_years.label("payback"))
            .join(Project, Project.id == CalculationRun.project_id)
            .join(Scenario, Scenario.id == CalculationRun.scenario_id)
            .where(
                _within(CalculationRun.computed_at, self._start, self._end),
                CalculationRun.scenario_kind != ScenarioKind.BASELINE,
                CalculationRun.payback_years.is_not(None),
            )
            .order_by(
                CalculationRun.project_id, Scenario.is_recommended.desc(), CalculationRun.computed_at.desc()
            )
            .distinct(CalculationRun.project_id)
            .subquery()
        )
        statement = select(per_project.c.object_type, func.avg(per_project.c.payback)).group_by(
            per_project.c.object_type
        )
        return {
            key: round(float(value), 2) for key, value in (await _mapping(self._session, statement)).items()
        }

    async def top_products(self) -> list[ProductCount]:
        count = func.count(ScenarioItem.id)
        statement = (
            select(Product.id, Product.name, count)
            .join(ScenarioItem, ScenarioItem.product_id == Product.id)
            .join(Scenario, Scenario.id == ScenarioItem.scenario_id)
            .where(_within(Scenario.created_at, self._start, self._end))
            .group_by(Product.id, Product.name)
            .order_by(count.desc(), Product.name)
            .limit(TOP_PRODUCTS_LIMIT)
        )
        rows = (await self._session.execute(statement)).tuples()
        return [ProductCount(product_id=pid, name=name, count=total) for pid, name, total in rows]

    async def catalog_gaps(self) -> list[CatalogGap]:
        """Project processes for which the visible catalog offers no product beyond R&D.

        Matching evaluates exactly these candidates (object type and process tags) and skips R&D by default,
        so such a process can never get a «подходит» verdict.
        """
        fit = exists().where(
            ProcessDef.object_type == any_(Product.object_types),
            ProcessDef.key == any_(Product.processes),
            Product.hidden_at.is_(None),
            Product.status != ProductStatus.RND,
        )
        count = func.count(Project.id)
        statement = (
            select(ProcessDef.object_type, ProcessDef.key, count)
            .join(Project, Project.object_type == ProcessDef.object_type)
            .where(_within(Project.created_at, self._start, self._end), ~fit)
            .group_by(ProcessDef.object_type, ProcessDef.key)
            .order_by(count.desc(), ProcessDef.object_type, ProcessDef.key)
        )
        rows = (await self._session.execute(statement)).tuples()
        return [CatalogGap(object_type=ot, process_key=key, no_fit_count=total) for ot, key, total in rows]
