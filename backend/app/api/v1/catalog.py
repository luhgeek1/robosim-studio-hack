from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Query

from app.api.deps import OptionalUserDep, UowDep
from app.api.schemas.catalog import (
    CatalogFacets,
    CompareRequest,
    CompareResult,
    CompareRow,
    Product,
    ProductDetail,
    ProductList,
)
from app.api.schemas.reference import SpecKey, SpecKeyList
from app.core.errors import UnauthorizedError
from app.domain.catalog import Badge, ProductQuery, ProductSort, ProductStatus
from app.domain.reference import ObjectTypeKey
from app.service.catalog import CatalogService
from app.service.matching.service import MatchingService
from app.service.reference import ReferenceService

router = APIRouter(prefix="/catalog", tags=["catalog"])

MAX_PAGE_SIZE = 200


def _csv(values: list[str] | None) -> list[str]:
    """Accepts both ``?a=x&a=y`` and the contract's ``?a=x,y`` (style: form, explode: false)."""
    return [part.strip() for value in values or [] for part in value.split(",") if part.strip()]


@router.get(
    "/products", operation_id="listProducts", summary="Каталог продуктов с фильтрами, поиском и сортировкой"
)
async def list_products(
    uow: UowDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
    q: Annotated[str | None, Query(description="Полнотекстовый поиск")] = None,
    object_type: Annotated[ObjectTypeKey | None, Query()] = None,
    process_key: Annotated[str | None, Query()] = None,
    solution_type: Annotated[list[str] | None, Query()] = None,
    industry: Annotated[str | None, Query()] = None,
    manufacturer_id: Annotated[UUID | None, Query()] = None,
    status: Annotated[list[str] | None, Query()] = None,
    badge: Annotated[list[str] | None, Query()] = None,
    price_min_rub: Annotated[float | None, Query(ge=0)] = None,
    price_max_rub: Annotated[float | None, Query(ge=0)] = None,
    payload_min_kg: Annotated[float | None, Query(ge=0)] = None,
    min_completeness: Annotated[float | None, Query(ge=0, le=1)] = None,
    sort: Annotated[ProductSort, Query()] = ProductSort.RELEVANCE,
) -> ProductList:
    query = ProductQuery(
        page=page,
        page_size=page_size,
        q=q.strip() if q and q.strip() else None,
        object_type=object_type.value if object_type else None,
        process_key=process_key,
        solution_types=tuple(_csv(solution_type)),
        industry=industry,
        manufacturer_id=manufacturer_id,
        statuses=tuple(ProductStatus(s) for s in _csv(status)),
        badges=tuple(Badge(b) for b in _csv(badge)),
        price_min_rub=price_min_rub,
        price_max_rub=price_max_rub,
        payload_min_kg=payload_min_kg,
        min_completeness=min_completeness,
        sort=sort,
    )
    items, total = await CatalogService(uow).search(query)
    return ProductList(
        items=[Product.from_domain(p) for p in items], page=page, page_size=page_size, total=total
    )


@router.get("/facets", operation_id="getCatalogFacets", summary="Значения фильтров с количествами")
async def get_catalog_facets(
    uow: UowDep,
    object_type: Annotated[ObjectTypeKey | None, Query()] = None,
    process_key: Annotated[str | None, Query()] = None,
) -> CatalogFacets:
    query = ProductQuery(object_type=object_type.value if object_type else None, process_key=process_key)
    return CatalogFacets.from_domain(await CatalogService(uow).facets(query))


@router.get(
    "/spec-keys",
    operation_id="listSpecKeys",
    summary="Словарь характеристик (ключ, название, группа, единица, участие в жёстких проверках)",
)
async def list_spec_keys(uow: UowDep) -> SpecKeyList:
    return SpecKeyList(items=[SpecKey.from_domain(item) for item in await ReferenceService(uow).spec_keys()])


@router.get(
    "/products/{product_id}",
    operation_id="getProduct",
    summary="Карточка продукта — предложения, ТТХ с источниками, кейсы",
    responses={404: {"description": "Не найдено"}},
)
async def get_product(product_id: Annotated[UUID, Path()], uow: UowDep) -> ProductDetail:
    return ProductDetail.from_detail(await CatalogService(uow).detail(product_id))


@router.post(
    "/compare", operation_id="compareProducts", summary="Сравнение 2–5 продуктов по группам характеристик"
)
async def compare_products(payload: CompareRequest, uow: UowDep, user: OptionalUserDep) -> CompareResult:
    result = await CatalogService(uow).compare(payload.product_ids)
    compatibility: dict[str, str] = {}
    if payload.project_id is not None:
        if user is None:
            raise UnauthorizedError("Совместимость с проектом видна после входа")
        compatibility = await MatchingService(uow, user).compatibility(
            payload.project_id, payload.product_ids, payload.process_key
        )
    return CompareResult(
        products=[Product.from_domain(p) for p in result.products],
        rows=[CompareRow.from_domain(r) for r in result.rows],
        compatibility=compatibility,
    )
