from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import any_, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    DataVersion,
    Industry,
    Norm,
    NormSet,
    ObjectType,
    ParameterDef,
    ProcessDef,
    Product,
    ProductOffer,
    SolutionType,
    Source,
    SpecKey,
)


class ReferenceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def object_types(self) -> Sequence[ObjectType]:
        return (await self._session.scalars(select(ObjectType).order_by(ObjectType.order))).all()

    async def object_type(self, key: str) -> ObjectType | None:
        return await self._session.get(ObjectType, key)

    async def parameters(self, object_types: Sequence[str]) -> Sequence[ParameterDef]:
        statement = select(ParameterDef).where(ParameterDef.object_type.in_(object_types))
        return (await self._session.scalars(statement.order_by(ParameterDef.order))).all()

    async def processes(self, object_types: Sequence[str]) -> Sequence[ProcessDef]:
        statement = select(ProcessDef).where(ProcessDef.object_type.in_(object_types))
        return (await self._session.scalars(statement.order_by(ProcessDef.order))).all()

    async def sources(self, ids: set[UUID]) -> dict[UUID, Source]:
        if not ids:
            return {}
        rows = await self._session.scalars(select(Source).where(Source.id.in_(ids)))
        return {source.id: source for source in rows}

    async def solution_types(self) -> Sequence[SolutionType]:
        return (await self._session.scalars(select(SolutionType).order_by(SolutionType.order))).all()

    async def products_per_solution_type(self) -> dict[str, int]:
        rows = await self._session.execute(
            select(Product.solution_type, func.count()).group_by(Product.solution_type)
        )
        return dict(rows.tuples().all())

    async def spec_keys(self) -> Sequence[SpecKey]:
        return (await self._session.scalars(select(SpecKey).order_by(SpecKey.order))).all()

    async def industries_with_counts(self) -> list[tuple[Industry, int]]:
        count = func.count(func.distinct(ProductOffer.product_id))
        statement = (
            select(Industry, count)
            .outerjoin(ProductOffer, ProductOffer.industry_key == Industry.key)
            .group_by(Industry.key)
            .order_by(count.desc(), Industry.name)
        )
        return [(industry, total) for industry, total in (await self._session.execute(statement)).tuples()]

    async def norm_set(self, version: str | None) -> NormSet | None:
        condition = NormSet.version == version if version else NormSet.is_current.is_(True)
        norm_set: NormSet | None = await self._session.scalar(select(NormSet).where(condition))
        return norm_set

    async def norm_sets_with_counts(self) -> list[tuple[NormSet, int]]:
        statement = (
            select(NormSet, func.count(Norm.id))
            .outerjoin(Norm, Norm.norm_set_id == NormSet.id)
            .group_by(NormSet.id)
            .order_by(NormSet.published_at.desc())
        )
        return [(norm_set, total) for norm_set, total in (await self._session.execute(statement)).tuples()]

    async def norms(self, norm_set_id: UUID, category: str | None, object_type: str | None) -> Sequence[Norm]:
        statement = select(Norm).where(Norm.norm_set_id == norm_set_id)
        if category:
            statement = statement.where(Norm.category == category)
        if object_type:
            statement = statement.where(literal(object_type) == any_(Norm.object_types))
        return (await self._session.scalars(statement.order_by(Norm.category, Norm.key))).all()

    async def data_version(self, key: str) -> str | None:
        version = await self._session.get(DataVersion, key)
        return version.version if version else None
