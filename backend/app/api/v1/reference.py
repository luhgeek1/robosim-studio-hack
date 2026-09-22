from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.api.deps import UowDep
from app.api.schemas.reference import (
    Industry,
    IndustryList,
    Norm,
    NormList,
    NormSet,
    NormSetList,
    ObjectType,
    ObjectTypeList,
    SolutionType,
    SolutionTypeList,
)
from app.domain.reference import NormCategory, ObjectTypeKey
from app.service.reference import ReferenceService

router = APIRouter(tags=["reference"])


@router.get(
    "/object-types",
    operation_id="listObjectTypes",
    summary="Типы объектов с группами параметров и процессами",
)
async def list_object_types(uow: UowDep) -> ObjectTypeList:
    items = await ReferenceService(uow).object_types()
    return ObjectTypeList(items=[ObjectType.from_domain(item) for item in items])


@router.get(
    "/object-types/{object_type}",
    operation_id="getObjectType",
    summary="Тип объекта — схема формы параметров",
    responses={404: {"description": "Не найдено"}},
)
async def get_object_type(object_type: Annotated[ObjectTypeKey, Path()], uow: UowDep) -> ObjectType:
    return ObjectType.from_domain(await ReferenceService(uow).object_type(object_type.value))


@router.get("/solution-types", operation_id="listSolutionTypes", summary="Типы роботизированных решений")
async def list_solution_types(
    uow: UowDep,
    object_type: Annotated[ObjectTypeKey | None, Query()] = None,
    process_key: Annotated[str | None, Query()] = None,
) -> SolutionTypeList:
    items = await ReferenceService(uow).solution_types(
        object_type.value if object_type else None, process_key
    )
    return SolutionTypeList(items=[SolutionType.from_domain(item) for item in items])


@router.get("/industries", operation_id="listIndustries", summary="Отрасли каталога")
async def list_industries(uow: UowDep) -> IndustryList:
    items = await ReferenceService(uow).industries()
    return IndustryList(
        items=[Industry(key=i.key, name=i.name, products_count=i.products_count) for i in items]
    )


@router.get(
    "/norms",
    operation_id="listNorms",
    summary="Реестр нормативов расчётной модели с источниками",
    description="Показывается пользователю на экране «Методика» и в отчёте. "
    "Каждый норматив имеет источник и обоснование.",
)
async def list_norms(
    uow: UowDep,
    version: Annotated[str | None, Query(description="Версия набора; по умолчанию текущая")] = None,
    category: Annotated[NormCategory | None, Query()] = None,
    object_type: Annotated[ObjectTypeKey | None, Query()] = None,
) -> NormList:
    norm_version, items = await ReferenceService(uow).norms(
        version, category.value if category else None, object_type.value if object_type else None
    )
    return NormList(version=norm_version, items=[Norm.from_domain(item) for item in items])


@router.get("/norm-sets", operation_id="listNormSets", summary="Версии наборов нормативов")
async def list_norm_sets(uow: UowDep) -> NormSetList:
    return NormSetList(items=[NormSet.from_domain(item) for item in await ReferenceService(uow).norm_sets()])
