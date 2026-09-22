from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query

from app.api.deps import UowDep, require
from app.api.schemas.calculations import (
    CalculationRun,
    CalculationTrace,
    ComparisonTable,
    RerunResult,
    Section,
    TraceItem,
)
from app.domain.auth import CurrentUser, Permission
from app.service.scenarios.calculations import CalculationService
from app.service.scenarios.comparison import ComparisonService

router = APIRouter(tags=["calculations"])

OwnerDep = Annotated[CurrentUser, Depends(require(Permission.PROJECTS_OWN))]
CalculationIdPath = Annotated[UUID, Path()]


@router.get(
    "/calculations/{calculation_id}",
    operation_id="getCalculation",
    summary="Сохранённый расчёт (воспроизводим по версиям)",
    responses={404: {"description": "Не найдено"}},
)
async def get_calculation(calculation_id: CalculationIdPath, user: OwnerDep, uow: UowDep) -> CalculationRun:
    return CalculationRun.from_stored(await CalculationService(uow, user).get(calculation_id))


@router.get(
    "/calculations/{calculation_id}/trace",
    operation_id="getCalculationTrace",
    summary="Трасса расчёта — каждая метрика с формулой, входами и источниками (ТЗ 3.5.8)",
)
async def get_trace(
    calculation_id: CalculationIdPath,
    user: OwnerDep,
    uow: UowDep,
    section: Annotated[Section | None, Query()] = None,
) -> CalculationTrace:
    run_id, items, undocumented = await CalculationService(uow, user).trace(calculation_id, section)
    return CalculationTrace(
        calculation_id=run_id,
        items=[TraceItem.model_validate(item) for item in items],
        undocumented_constants=undocumented,
    )


@router.post(
    "/calculations/{calculation_id}/rerun",
    operation_id="rerunCalculation",
    summary="Пересчитать на актуальных версиях каталога и нормативов, показать разницу",
)
async def rerun_calculation(calculation_id: CalculationIdPath, user: OwnerDep, uow: UowDep) -> RerunResult:
    return RerunResult.from_domain(await ComparisonService(uow, user).rerun(calculation_id))


@router.get(
    "/projects/{project_id}/comparison",
    operation_id="getComparison",
    summary="Сводная таблица сценариев и рекомендация (ТЗ 3.5.5, 3.7.1)",
    responses={409: {"description": "Нет рассчитанных сценариев"}},
)
async def get_comparison(
    project_id: Annotated[UUID, Path()],
    user: OwnerDep,
    uow: UowDep,
    recalculate_stale: Annotated[bool, Query()] = True,
) -> ComparisonTable:
    view = await ComparisonService(uow, user).compare(project_id, recalculate_stale=recalculate_stale)
    return ComparisonTable.from_domain(view)
