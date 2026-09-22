from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

from app.core.errors import DomainError, ErrorCode, NotFoundError
from app.db.models import Product
from app.db.repositories.catalog import CatalogRepository
from app.db.repositories.reference import ReferenceRepository
from app.db.uow import UnitOfWork
from app.domain.catalog import (
    Badge,
    CompareRow,
    Facet,
    ProductDetail,
    ProductQuery,
    ProductStatus,
    ProductSummary,
    SpecValue,
    best_product,
    primary_specs,
)
from app.domain.common.provenance import SourceInfo
from app.domain.reference import ObjectTypeKey
from app.service.catalog.mappers import to_case, to_offer, to_spec, to_summary

SIMILAR_LIMIT = 4
INTEGRATION_SPEC_KEY = "wms_integration"
MIN_COMPARE, MAX_COMPARE = 2, 5

_BADGE_NAMES = {
    Badge.IN_REGISTRY_719: "Есть в реестре 719",
    Badge.TESTED_FCBAS: "Протестировано ФЦ БАС",
    Badge.SPECS_CONFIRMED: "ТТХ подтверждены",
    Badge.DOMESTIC: "Отечественный производитель",
    Badge.HAS_CASES: "Есть внедрения",
}
_STATUS_NAMES = {
    ProductStatus.OPERATION: "Эксплуатация",
    ProductStatus.PILOTING: "Пилотирование",
    ProductStatus.RND: "НИОКР",
}
_OBJECT_TYPE_NAMES = {
    ObjectTypeKey.WAREHOUSE: "Склад",
    ObjectTypeKey.AIRPORT: "Аэропорт",
    ObjectTypeKey.HOSPITAL: "Медучреждение",
    ObjectTypeKey.CUSTOM: "Другой объект",
}


@dataclass(frozen=True, slots=True)
class CatalogFacets:
    solution_types: list[Facet]
    manufacturers: list[Facet]
    statuses: list[Facet]
    industries: list[Facet]
    badges: list[Facet]
    object_types: list[Facet]
    price_min_rub: float | None
    price_max_rub: float | None


@dataclass(frozen=True, slots=True)
class CompareResult:
    products: list[ProductSummary]
    rows: list[CompareRow]


class CatalogService:
    def __init__(self, uow: UnitOfWork) -> None:
        self._repo = CatalogRepository(uow.session)
        self._reference = ReferenceRepository(uow.session)

    async def _summaries(self, products: Sequence[Product]) -> list[ProductSummary]:
        manufacturers = await self._repo.manufacturers({p.manufacturer_id for p in products})
        names = await self._repo.solution_type_names()
        return [to_summary(p, manufacturers[p.manufacturer_id], names) for p in products]

    async def search(self, query: ProductQuery) -> tuple[list[ProductSummary], int]:
        products, total = await self._repo.search(query)
        return await self._summaries(products), total

    async def _specs(self, product_ids: Sequence[UUID]) -> dict[UUID, list[SpecValue]]:
        rows = await self._repo.specs(product_ids)
        keys = {key.key: key for key in await self._reference.spec_keys()}
        sources = await self._reference.sources({row.source_id for row in rows if row.source_id})
        by_product: dict[UUID, list[SpecValue]] = {pid: [] for pid in product_ids}
        for row in rows:
            by_product[row.product_id].append(to_spec(row, keys[row.key], sources))
        return by_product

    async def detail(self, product_id: UUID) -> ProductDetail:
        product = await self._repo.get(product_id)
        if product is None:
            raise NotFoundError("Продукт не найден")
        summary = (await self._summaries([product]))[0]
        offer_rows = await self._repo.offers(product_id)
        case_rows = await self._repo.cases(product_id)
        source_ids = {o.source_id for o, _ in offer_rows} | {c.source_id for c in case_rows if c.source_id}
        sources = await self._reference.sources(source_ids)
        specs = (await self._specs([product_id]))[product_id]
        primary = primary_specs(specs)
        capability_keys = await self._repo.capability_keys(product.solution_type)
        used_sources = _unique_sources(
            [to_offer(o, name, sources[o.source_id]).source for o, name in offer_rows]
            + [s.provenance.source for s in specs if s.provenance.source]
        )
        integration = primary.get(INTEGRATION_SPEC_KEY)
        return ProductDetail(
            summary=summary,
            description=product.description,
            offers=[to_offer(o, name, sources[o.source_id]) for o, name in offer_rows],
            specs=specs,
            cases=[to_case(c, sources) for c in case_rows],
            sources=used_sources,
            integration_notes=str(integration.value) if integration and integration.value else None,
            missing_key_specs=[key for key in capability_keys if key not in primary],
            similar_products=await self._summaries(await self._repo.similar(product, SIMILAR_LIMIT)),
        )

    async def compare(self, product_ids: list[UUID]) -> CompareResult:
        unique_ids = list(dict.fromkeys(product_ids))
        if not MIN_COMPARE <= len(unique_ids) <= MAX_COMPARE:
            raise DomainError("Сравнивать можно от 2 до 5 разных продуктов", error_code=ErrorCode.BAD_REQUEST)
        products = await self._repo.get_many(unique_ids)
        if len(products) != len(unique_ids):
            raise NotFoundError("Некоторые продукты не найдены")
        specs = await self._specs(unique_ids)
        by_product = {pid: primary_specs(values) for pid, values in specs.items()}
        rows: list[CompareRow] = []
        for key in await self._reference.spec_keys():
            values = {pid: spec[key.key] for pid, spec in by_product.items() if key.key in spec}
            if not values and not key.is_key_constraint:
                continue
            rows.append(
                CompareRow(
                    spec_key=key.key,
                    name=key.name,
                    group=key.group,
                    unit=key.unit,
                    better=key.better,
                    values=values,
                    best_product_id=best_product(values, key.better),
                )
            )
        return CompareResult(products=await self._summaries(products), rows=rows)

    async def facets(self, query: ProductQuery) -> CatalogFacets:
        names = await self._repo.solution_type_names()
        solution = await self._repo.facet_counts("solution_type", query)
        manufacturers = await self._repo.facet_counts("manufacturer", query)
        manufacturer_rows = await self._repo.manufacturers({value for value, _ in manufacturers})
        statuses = await self._repo.facet_counts("status", query)
        badges = await self._repo.facet_counts("badge", query)
        object_types = await self._repo.facet_counts("object_type", query)
        low, high = await self._repo.price_range(query)
        return CatalogFacets(
            solution_types=[Facet(key=k, name=names.get(k, k), count=c) for k, c in solution],
            manufacturers=[
                Facet(key=str(k), name=manufacturer_rows[k].name, count=c) for k, c in manufacturers
            ],
            statuses=[Facet(key=str(k), name=_STATUS_NAMES[ProductStatus(k)], count=c) for k, c in statuses],
            industries=[Facet(key=k, name=n, count=c) for k, n, c in await self._repo.industry_counts(query)],
            badges=[Facet(key=k, name=_BADGE_NAMES[Badge(k)], count=c) for k, c in badges],
            object_types=[
                Facet(key=k, name=_OBJECT_TYPE_NAMES[ObjectTypeKey(k)], count=c) for k, c in object_types
            ],
            price_min_rub=low,
            price_max_rub=high,
        )


def _unique_sources(sources: Sequence[SourceInfo | None]) -> list[SourceInfo]:
    seen: dict[UUID, SourceInfo] = {}
    for source in sources:
        if source is not None:
            seen.setdefault(source.id, source)
    return list(seen.values())
