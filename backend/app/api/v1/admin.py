from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Response, status

from app.api.deps import UowDep, require
from app.api.schemas.admin import (
    AdminUserUpdate,
    AnalyticsOverview,
    NormSetCreate,
    ProductWrite,
    SpecsBulkWrite,
    UserList,
)
from app.api.schemas.auth import User
from app.api.schemas.catalog import ProductDetail
from app.api.schemas.reference import NormSet
from app.domain.admin import UserQuery
from app.domain.auth import CurrentUser, Permission, Role
from app.service.admin import AnalyticsService, CatalogAdminService, NormPublisher, UserAdminService

router = APIRouter(prefix="/admin", tags=["admin"])

MAX_PAGE_SIZE = 200
CatalogAdmin = Annotated[CurrentUser, Depends(require(Permission.CATALOG_WRITE))]
NormsAdmin = Annotated[CurrentUser, Depends(require(Permission.NORMS_WRITE))]
UsersAdmin = Annotated[CurrentUser, Depends(require(Permission.USERS_MANAGE))]
AnalyticsReader = Annotated[CurrentUser, Depends(require(Permission.ANALYTICS_READ))]
ProductIdPath = Annotated[UUID, Path()]


@router.post(
    "/catalog/products",
    operation_id="adminCreateProduct",
    summary="Добавить продукт вручную (ТЗ 3.3.5)",
    status_code=status.HTTP_201_CREATED,
)
async def create_product(payload: ProductWrite, uow: UowDep, user: CatalogAdmin) -> ProductDetail:
    detail = await CatalogAdminService(uow, user.email).create(payload.to_domain())
    return ProductDetail.from_detail(detail)


@router.patch(
    "/catalog/products/{product_id}",
    operation_id="adminUpdateProduct",
    summary="Редактировать продукт",
    responses={404: {"description": "Не найдено"}},
)
async def update_product(
    product_id: ProductIdPath, payload: ProductWrite, uow: UowDep, user: CatalogAdmin
) -> ProductDetail:
    detail = await CatalogAdminService(uow, user.email).update(product_id, payload.to_domain())
    return ProductDetail.from_detail(detail)


@router.delete(
    "/catalog/products/{product_id}",
    operation_id="adminDeleteProduct",
    summary="Скрыть продукт (мягкое удаление — расчёты, где он использован, сохраняются)",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses={404: {"description": "Не найдено"}},
)
async def delete_product(product_id: ProductIdPath, uow: UowDep, user: CatalogAdmin) -> Response:
    await CatalogAdminService(uow, user.email).hide(product_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/catalog/products/{product_id}/specs",
    operation_id="adminUpsertProductSpecs",
    summary="Задать характеристики с источниками",
    responses={404: {"description": "Не найдено"}},
)
async def upsert_product_specs(
    product_id: ProductIdPath, payload: SpecsBulkWrite, uow: UowDep, user: CatalogAdmin
) -> ProductDetail:
    specs = [spec.to_domain() for spec in payload.specs]
    detail = await CatalogAdminService(uow, user.email).upsert_specs(product_id, specs)
    return ProductDetail.from_detail(detail)


@router.post(
    "/norm-sets",
    operation_id="adminPublishNormSet",
    summary="Опубликовать новую версию нормативов (старые расчёты сохраняют свою)",
    status_code=status.HTTP_201_CREATED,
)
async def publish_norm_set(payload: NormSetCreate, uow: UowDep, user: NormsAdmin) -> NormSet:
    changes = [change.to_domain() for change in payload.changes]
    return NormSet.from_domain(await NormPublisher(uow, user.email).publish(payload.notes, changes))


@router.get("/users", operation_id="adminListUsers", summary="Пользователи")
async def list_users(
    uow: UowDep,
    user: UsersAdmin,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
    q: Annotated[str | None, Query(description="Поиск по email или имени")] = None,
    role: Annotated[Role | None, Query()] = None,
) -> UserList:
    query = UserQuery(page=page, page_size=page_size, q=q.strip() if q and q.strip() else None, role=role)
    items, total = await UserAdminService(uow, user).search(query)
    return UserList(
        items=[User.from_domain(item) for item in items], page=page, page_size=page_size, total=total
    )


@router.patch(
    "/users/{user_id}",
    operation_id="adminUpdateUser",
    summary="Роль, активность, привязка вендора",
    responses={404: {"description": "Не найдено"}},
)
async def update_user(
    user_id: Annotated[UUID, Path()], payload: AdminUserUpdate, uow: UowDep, user: UsersAdmin
) -> User:
    return User.from_domain(await UserAdminService(uow, user).update(user_id, payload.to_domain()))


@router.get(
    "/analytics/overview", operation_id="adminAnalyticsOverview", summary="Аналитика спроса для ФЦ БАС"
)
async def analytics_overview(
    uow: UowDep,
    _: AnalyticsReader,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
) -> AnalyticsOverview:
    return AnalyticsOverview.from_domain(await AnalyticsService(uow).overview(date_from, date_to))
