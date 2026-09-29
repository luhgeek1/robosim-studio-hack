from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query

from app.api.deps import UowDep, require
from app.api.schemas.admin_reference import (
    AdminParameterDefault,
    ParameterDefaultList,
    ParameterDefaultResult,
    ParameterDefaultWrite,
    RegistrySource,
    SourceList,
    SourceUpdate,
)
from app.api.schemas.projects import AuditEvent, AuditList
from app.domain.admin import Freshness, SourceQuery
from app.domain.auth import CurrentUser, Permission
from app.domain.common.provenance import SourceKind
from app.domain.reference import ObjectTypeKey
from app.service.admin import ParameterDefaultsAdmin, SourceRegistryService

router = APIRouter(prefix="/admin", tags=["admin"])

MAX_PAGE_SIZE = 200
ReferenceAdmin = Annotated[CurrentUser, Depends(require(Permission.NORMS_WRITE))]
SourcesAdmin = Annotated[CurrentUser, Depends(require(Permission.CATALOG_WRITE))]
ObjectTypePath = Annotated[ObjectTypeKey, Path()]
ParamKeyPath = Annotated[str, Path(max_length=64)]
Page = Annotated[int, Query(ge=1)]


@router.get(
    "/parameter-defaults/{object_type}",
    operation_id="adminListParameterDefaults",
    summary="Параметры по умолчанию типа объекта и сколько проектов на них опирается (ТЗ 2.1.6, 3.1.4)",
    responses={404: {"description": "Не найдено"}},
)
async def list_parameter_defaults(
    object_type: ObjectTypePath, uow: UowDep, user: ReferenceAdmin
) -> ParameterDefaultList:
    views = await ParameterDefaultsAdmin(uow, user.email).defaults(object_type.value)
    return ParameterDefaultList(
        object_type=object_type.value, items=[AdminParameterDefault.from_view(view) for view in views]
    )


@router.put(
    "/parameter-defaults/{object_type}/{key}",
    operation_id="adminSetParameterDefault",
    summary="Задать значение по умолчанию с источником и обоснованием",
    description="Проекты без своего значения получают новую версию: их сохранённые расчёты устаревают, "
    "пересчёт показывает изменение параметра в диффе.",
    responses={404: {"description": "Не найдено"}},
)
async def set_parameter_default(
    object_type: ObjectTypePath,
    key: ParamKeyPath,
    payload: ParameterDefaultWrite,
    uow: UowDep,
    user: ReferenceAdmin,
) -> ParameterDefaultResult:
    view, restamped = await ParameterDefaultsAdmin(uow, user.email).update(
        object_type.value, key, payload.to_domain()
    )
    return ParameterDefaultResult(
        parameter=AdminParameterDefault.from_view(view), projects_restamped=restamped
    )


@router.get(
    "/parameter-defaults/{object_type}/{key}/history",
    operation_id="adminParameterDefaultHistory",
    summary="История значения по умолчанию",
    responses={404: {"description": "Не найдено"}},
)
async def parameter_default_history(
    object_type: ObjectTypePath,
    key: ParamKeyPath,
    uow: UowDep,
    user: ReferenceAdmin,
    page: Page = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
) -> AuditList:
    items, total = await ParameterDefaultsAdmin(uow, user.email).history(
        object_type.value, key, page, page_size
    )
    return AuditList(
        items=[AuditEvent.from_domain(item) for item in items], page=page, page_size=page_size, total=total
    )


@router.get(
    "/sources",
    operation_id="adminListSources",
    summary="Реестр источников данных: ссылки, даты, где используются (ТЗ 3.3.4)",
)
async def list_sources(
    uow: UowDep,
    user: SourcesAdmin,
    page: Page = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 50,
    q: Annotated[str | None, Query(max_length=200, description="Название, ссылка или примечание")] = None,
    kind: Annotated[SourceKind | None, Query()] = None,
    freshness: Annotated[Freshness | None, Query()] = None,
    include_unused: Annotated[bool, Query(description="Показать источники без ссылок на них")] = False,
) -> SourceList:
    query = SourceQuery(
        page=page,
        page_size=page_size,
        q=q.strip() if q and q.strip() else None,
        kind=kind,
        freshness=freshness,
        include_unused=include_unused,
    )
    result = await SourceRegistryService(uow, user.email).search(query)
    return SourceList(
        items=[RegistrySource.from_domain(item) for item in result.items],
        page=page,
        page_size=page_size,
        total=result.total,
        stale_after_months=result.stale_after_months,
        stale_before=result.stale_before,
        freshness_counts=result.freshness_counts,
    )


@router.patch(
    "/sources/{source_id}",
    operation_id="adminUpdateSource",
    summary="Исправить название, ссылку, дату получения или примечание источника",
    responses={404: {"description": "Не найдено"}},
)
async def update_source(
    source_id: Annotated[UUID, Path()], payload: SourceUpdate, uow: UowDep, user: SourcesAdmin
) -> RegistrySource:
    entry = await SourceRegistryService(uow, user.email).update(source_id, payload.to_domain())
    return RegistrySource.from_domain(entry)
