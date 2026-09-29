from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import Select, case, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AuditEvent,
    Norm,
    NormSet,
    ParameterDef,
    Product,
    ProductCase,
    ProductOffer,
    ProductSpec,
    Source,
)
from app.domain.admin import Freshness, SourceQuery, SourceUsage

SOURCE_ENTITY_PREFIX = "source:"
_USAGE = ("specs", "offers", "cases", "norms", "parameters")


def _product_usage(model: type[ProductSpec | ProductOffer | ProductCase], label: str) -> Any:
    """References from visible products only: a hidden product no longer shows its source anywhere."""
    return (
        select(model.source_id.label("source_id"), func.count().label(label))
        .join(Product, Product.id == model.product_id)
        .where(model.source_id.is_not(None), Product.hidden_at.is_(None))
        .group_by(model.source_id)
        .subquery()
    )


def _usage_subqueries() -> list[Any]:
    norms = (
        select(Norm.source_id.label("source_id"), func.count().label("norms"))
        .join(NormSet, NormSet.id == Norm.norm_set_id)
        .where(NormSet.is_current.is_(True))
        .group_by(Norm.source_id)
        .subquery()
    )
    parameters = (
        select(ParameterDef.default_source_id.label("source_id"), func.count().label("parameters"))
        .where(ParameterDef.default_source_id.is_not(None))
        .group_by(ParameterDef.default_source_id)
        .subquery()
    )
    return [
        _product_usage(ProductSpec, "specs"),
        _product_usage(ProductOffer, "offers"),
        _product_usage(ProductCase, "cases"),
        norms,
        parameters,
    ]


class SourceRegistryRepository:
    """Sources of reference and catalog data, seeded or typed by the admin; project uploads are not listed."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def search(
        self, query: SourceQuery, stale_before: date
    ) -> tuple[list[tuple[Source, SourceUsage]], int, dict[Freshness, int]]:
        usage = _usage_subqueries()
        counts = [func.coalesce(sub.c[name], 0).label(name) for sub, name in zip(usage, _USAGE, strict=True)]
        total_usage = sum((column for column in counts[1:]), counts[0])
        freshness = case(
            (Source.retrieved_at.is_(None), literal(Freshness.UNDATED.value)),
            (Source.retrieved_at < stale_before, literal(Freshness.STALE.value)),
            else_=literal(Freshness.FRESH.value),
        )
        base: Select[Any] = select(Source, *counts, freshness.label("freshness"))
        for sub in usage:
            base = base.outerjoin(sub, sub.c.source_id == Source.id)
        base = base.where(Source.key.is_not(None))
        if query.q:
            pattern = f"%{query.q}%"
            base = base.where(
                or_(Source.title.ilike(pattern), Source.url.ilike(pattern), Source.note.ilike(pattern))
            )
        if query.kind:
            base = base.where(Source.kind == query.kind)
        if not query.include_unused:
            base = base.where(total_usage > 0)
        by_freshness = base.subquery()
        tallies = await self._session.execute(
            select(by_freshness.c.freshness, func.count()).group_by(by_freshness.c.freshness)
        )
        freshness_counts = {Freshness(key): count for key, count in tallies.tuples()}
        if query.freshness:
            base = base.where(freshness == query.freshness.value)
        total = await self._session.scalar(select(func.count()).select_from(base.subquery())) or 0
        page = (
            base.order_by(total_usage.desc(), Source.title, Source.id)
            .offset((query.page - 1) * query.page_size)
            .limit(query.page_size)
        )
        rows = (await self._session.execute(page)).all()
        items = [(row[0], SourceUsage(*(row[i + 1] for i in range(len(_USAGE))))) for row in rows]
        return items, total, freshness_counts

    async def get(self, source_id: UUID) -> Source | None:
        statement = select(Source).where(Source.id == source_id, Source.key.is_not(None))
        source: Source | None = await self._session.scalar(statement)
        return source

    async def usage(self, source_id: UUID) -> SourceUsage:
        counts = [
            await self._session.scalar(select(sub.c[name]).where(sub.c.source_id == source_id)) or 0
            for sub, name in zip(_usage_subqueries(), _USAGE, strict=True)
        ]
        return SourceUsage(*counts)

    async def norm_value(self, key: str) -> float | None:
        """The norm from the current set; a set published before the norm existed falls back to the newest
        set that has it."""
        statement = (
            select(Norm.value)
            .join(NormSet, NormSet.id == Norm.norm_set_id)
            .where(Norm.key == key)
            .order_by(NormSet.is_current.desc(), NormSet.published_at.desc())
            .limit(1)
        )
        value: float | None = await self._session.scalar(statement)
        return value

    def audit(self, source_id: UUID, actor: str, before: dict[str, Any], after: dict[str, Any]) -> None:
        self._session.add(
            AuditEvent(
                project_id=None,
                actor=actor,
                entity=f"{SOURCE_ENTITY_PREFIX}{source_id}",
                action="update",
                before=before,
                after=after,
            )
        )


async def edited_source_ids(session: AsyncSession) -> set[UUID]:
    """Sources the admin has edited (an audit event exists): the seed keeps their title, link and date."""
    statement = select(AuditEvent.entity).where(
        AuditEvent.project_id.is_(None), AuditEvent.entity.startswith(SOURCE_ENTITY_PREFIX)
    )
    return {UUID(entity.removeprefix(SOURCE_ENTITY_PREFIX)) for entity in await session.scalars(statement)}
