from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query

from app.api.deps import UowDep, require
from app.api.schemas.processes import ProcessDemandList
from app.api.schemas.projects import (
    DataQualityItem,
    DataQualityReport,
    DataQualitySummary,
    ParamHistoryItem,
    ParamHistoryList,
    ParamsBulkUpsert,
    ParamValueUpdate,
    ProjectParam,
    ProjectParams,
    ValidationReport,
)
from app.domain.auth import CurrentUser, Permission
from app.domain.common.provenance import ProvenanceStatus
from app.domain.project.params import data_quality
from app.service.projects.context import ProjectContext
from app.service.projects.params import ParamChange, ParamsService
from app.service.projects.processes import ProcessService

router = APIRouter(prefix="/projects/{project_id}", tags=["params"])

OwnerDep = Annotated[CurrentUser, Depends(require(Permission.PROJECTS_OWN))]
ProjectIdPath = Annotated[UUID, Path()]
KeyPath = Annotated[str, Path(max_length=64)]


def _params(context: ProjectContext, group: str | None = None) -> ProjectParams:
    summary, _ = data_quality(context.params, {})
    return ProjectParams(
        project_id=context.project.id,
        project_version=context.project.version,
        params=[
            ProjectParam.from_domain(p)
            for p in context.params
            if group is None or p.definition.group == group
        ],
        data_quality=DataQualitySummary.from_domain(summary),
    )


@router.get(
    "/params", operation_id="listProjectParams", summary="Параметры объекта с происхождением и валидацией"
)
async def list_params(
    project_id: ProjectIdPath, user: OwnerDep, uow: UowDep, group: Annotated[str | None, Query()] = None
) -> ProjectParams:
    return _params(await ParamsService(uow, user).context(project_id), group)


@router.put(
    "/params",
    operation_id="upsertProjectParams",
    summary="Массовое сохранение из формы",
    description="Все присланные значения получают статус `user`. "
    "Версия проекта растёт, расчёты помечаются stale.",
)
async def upsert_params(
    project_id: ProjectIdPath, payload: ParamsBulkUpsert, user: OwnerDep, uow: UowDep
) -> ProjectParams:
    changes = [ParamChange(key=p.key, value=p.value, unit=p.unit, note=p.note) for p in payload.params]
    return _params(await ParamsService(uow, user).apply(project_id, changes, ProvenanceStatus.USER))


@router.patch(
    "/params/{key}", operation_id="updateProjectParam", summary="Изменить один параметр (инлайн-правка)"
)
async def update_param(
    project_id: ProjectIdPath, key: KeyPath, payload: ParamValueUpdate, user: OwnerDep, uow: UowDep
) -> ProjectParam:
    change = ParamChange(key=key, value=payload.value, unit=payload.unit, note=payload.note)
    context = await ParamsService(uow, user).apply(project_id, [change], ProvenanceStatus.USER)
    return ProjectParam.from_domain(context.by_key[key])


@router.delete("/params/{key}", operation_id="resetProjectParam", summary="Сбросить к значению по умолчанию")
async def reset_param(project_id: ProjectIdPath, key: KeyPath, user: OwnerDep, uow: UowDep) -> ProjectParam:
    return ProjectParam.from_domain(await ParamsService(uow, user).reset(project_id, key))


@router.get(
    "/params/{key}/history",
    operation_id="getProjectParamHistory",
    summary="История правок параметра (ТЗ 3.5.4)",
)
async def param_history(
    project_id: ProjectIdPath, key: KeyPath, user: OwnerDep, uow: UowDep
) -> ParamHistoryList:
    items = await ParamsService(uow, user).history(project_id, key)
    return ParamHistoryList(items=[ParamHistoryItem.from_domain(i) for i in items])


@router.get(
    "/validation",
    operation_id="getProjectValidation",
    summary="Проверка заполненности, форматов и диапазонов (ТЗ 3.2.4)",
)
async def validation(project_id: ProjectIdPath, user: OwnerDep, uow: UowDep) -> ValidationReport:
    return ValidationReport.from_domain(await ParamsService(uow, user).validation(project_id))


@router.get(
    "/data-quality",
    operation_id="getProjectDataQuality",
    summary="Панель доверия — происхождение параметров и их влияние",
)
async def data_quality_report(project_id: ProjectIdPath, user: OwnerDep, uow: UowDep) -> DataQualityReport:
    summary, items = await ParamsService(uow, user).data_quality(project_id)
    return DataQualityReport(
        summary=DataQualitySummary.from_domain(summary), items=[DataQualityItem.from_domain(i) for i in items]
    )


@router.get(
    "/processes",
    operation_id="getProjectProcesses",
    summary="Процессы объекта — спрос, пик, текущая стоимость («где деньги»)",
    responses={409: {"description": "Не хватает обязательных параметров"}},
)
async def processes(project_id: ProjectIdPath, user: OwnerDep, uow: UowDep) -> ProcessDemandList:
    return ProcessDemandList.from_domain(await ProcessService(uow, user).overview(project_id))
