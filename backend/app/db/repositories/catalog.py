from collections.abc import Sequence
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import Select, any_, exists, func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Industry,
    Manufacturer,
    Product,
    ProductCase,
    ProductOffer,
    ProductSpec,
    SolutionType,
)
from app.domain.catalog import ProductQuery, ProductSort

PAYLOAD_SPEC_KEY = "payload_kg"

FacetDimension = Literal["solution_type", "manufacturer", "status", "badge", "object_type"]
_FACET_COLUMNS: dict[str, Any] = {
    "solution_type": Product.solution_type,
    "manufacturer": Product.manufacturer_id,
    "status": Product.status,
    "badge": func.unnest(Product.badges),
    "object_type": func.unnest(Product.object_types),
}


def _ts_query(text: str) -> Any:
    return func.websearch_to_tsquery("russian", text)


def _apply_filters(statement: Select[Any], query: ProductQuery) -> Select[Any]:
    if query.q:
        pattern = f"%{query.q.strip()}%"
        statement = statement.where(Product.search.op("@@")(_ts_query(query.q)) | Product.name.ilike(pattern))
    if query.object_type:
        statement = statement.where(literal(query.object_type) == any_(Product.object_types))
    if query.process_key:
        statement = statement.where(literal(query.process_key) == any_(Product.processes))
    if query.solution_types:
        statement = statement.where(Product.solution_type.in_(query.solution_types))
    if query.industry:
        offer = select(ProductOffer.id).where(
            ProductOffer.product_id == Product.id, ProductOffer.industry_key == query.industry
        )
        statement = statement.where(exists(offer))
    if query.manufacturer_id:
        statement = statement.where(Product.manufacturer_id == query.manufacturer_id)
    if query.statuses:
        statement = statement.where(Product.status.in_(query.statuses))
    if query.badges:
        statement = statement.where(Product.badges.contains([b.value for b in query.badges]))
    if query.price_min_rub is not None:
        statement = statement.where(Product.price_from_rub >= query.price_min_rub)
    if query.price_max_rub is not None:
        statement = statement.where(Product.price_from_rub <= query.price_max_rub)
    if query.min_completeness is not None:
        statement = statement.where(Product.completeness >= query.min_completeness)
    if query.payload_min_kg is not None:
        spec = select(ProductSpec.id).where(
            ProductSpec.product_id == Product.id,
            ProductSpec.key == PAYLOAD_SPEC_KEY,
            ProductSpec.is_primary.is_(True),
            ProductSpec.value_num >= query.payload_min_kg,
        )
        statement = statement.where(exists(spec))
    return statement


def _order(statement: Select[Any], query: ProductQuery) -> Select[Any]:
    orders: dict[ProductSort, list[Any]] = {
        ProductSort.NAME: [Product.name],
        ProductSort.PRICE_ASC: [Product.price_from_rub, Product.name],
        ProductSort.PRICE_DESC: [Product.price_from_rub.desc(), Product.name],
        ProductSort.COMPLETENESS: [Product.completeness.desc(), Product.name],
        ProductSort.TRL: [Product.trl.desc().nulls_last(), Product.name],
        ProductSort.UPDATED: [Product.updated_at.desc(), Product.name],
    }
    if query.sort == ProductSort.RELEVANCE:
        if query.q:
            return statement.order_by(func.ts_rank(Product.search, _ts_query(query.q)).desc(), Product.name)
        return statement.order_by(Product.completeness.desc(), Product.name)
    return statement.order_by(*orders[query.sort])


class CatalogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def search(self, query: ProductQuery) -> tuple[Sequence[Product], int]:
        filtered = _apply_filters(select(Product), query)
        total = await self._session.scalar(select(func.count()).select_from(filtered.subquery()))
        page = _order(filtered, query).limit(query.page_size).offset((query.page - 1) * query.page_size)
        return (await self._session.scalars(page)).all(), int(total or 0)

    async def get(self, product_id: UUID) -> Product | None:
        return await self._session.get(Product, product_id)

    async def get_many(self, product_ids: Sequence[UUID]) -> list[Product]:
        rows = await self._session.scalars(select(Product).where(Product.id.in_(product_ids)))
        by_id = {product.id: product for product in rows}
        return [by_id[pid] for pid in product_ids if pid in by_id]

    async def similar(self, product: Product, limit: int) -> Sequence[Product]:
        statement = (
            select(Product)
            .where(Product.solution_type == product.solution_type, Product.id != product.id)
            .order_by(Product.completeness.desc(), Product.name)
            .limit(limit)
        )
        return (await self._session.scalars(statement)).all()

    async def manufacturers(self, ids: set[UUID]) -> dict[UUID, Manufacturer]:
        rows = await self._session.scalars(select(Manufacturer).where(Manufacturer.id.in_(ids)))
        return {row.id: row for row in rows}

    async def solution_type_names(self) -> dict[str, str]:
        return dict((await self._session.execute(select(SolutionType.key, SolutionType.name))).tuples().all())

    async def capability_keys(self, solution_type: str) -> list[str]:
        item = await self._session.get(SolutionType, solution_type)
        return item.capability_keys if item else []

    async def offers(self, product_id: UUID) -> Sequence[tuple[ProductOffer, str]]:
        statement = (
            select(ProductOffer, Industry.name)
            .join(Industry, Industry.key == ProductOffer.industry_key)
            .where(ProductOffer.product_id == product_id)
            .order_by(ProductOffer.price_rub, Industry.name)
        )
        return (await self._session.execute(statement)).tuples().all()

    async def specs(self, product_ids: Sequence[UUID]) -> Sequence[ProductSpec]:
        statement = (
            select(ProductSpec).where(ProductSpec.product_id.in_(product_ids)).order_by(ProductSpec.key)
        )
        return (await self._session.scalars(statement)).all()

    async def cases(self, product_id: UUID) -> Sequence[ProductCase]:
        return (
            await self._session.scalars(select(ProductCase).where(ProductCase.product_id == product_id))
        ).all()

    async def facet_counts(self, dimension: FacetDimension, query: ProductQuery) -> list[tuple[Any, int]]:
        column = _FACET_COLUMNS[dimension]
        base = _apply_filters(select(column.label("value"), Product.id), query).subquery()
        statement = select(base.c.value, func.count()).group_by(base.c.value).order_by(func.count().desc())
        return [(value, count) for value, count in (await self._session.execute(statement)).tuples()]

    async def industry_counts(self, query: ProductQuery) -> list[tuple[str, str, int]]:
        products = _apply_filters(select(Product.id), query).subquery()
        count = func.count(func.distinct(ProductOffer.product_id))
        statement = (
            select(Industry.key, Industry.name, count)
            .join(ProductOffer, ProductOffer.industry_key == Industry.key)
            .where(ProductOffer.product_id.in_(select(products.c.id)))
            .group_by(Industry.key)
            .order_by(count.desc())
        )
        return [(key, name, total) for key, name, total in (await self._session.execute(statement)).tuples()]

    async def price_range(self, query: ProductQuery) -> tuple[float | None, float | None]:
        base = _apply_filters(select(Product.price_from_rub.label("price")), query).subquery()
        row = (await self._session.execute(select(func.min(base.c.price), func.max(base.c.price)))).one()
        return row[0], row[1]

    async def products_per_process(self, object_type: str) -> dict[str, int]:
        process = func.unnest(Product.processes).label("process")
        base = select(process).where(literal(object_type) == any_(Product.object_types)).subquery()
        statement = select(base.c.process, func.count()).group_by(base.c.process)
        return dict((await self._session.execute(statement)).tuples().all())
