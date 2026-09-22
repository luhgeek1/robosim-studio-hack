from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Response, status

from app.api.deps import UowDep, require
from app.api.schemas.calculations import CalculationRun
from app.api.schemas.scenarios import (
    CalculateRequest,
    Scenario,
    ScenarioCopy,
    ScenarioCreate,
    ScenarioList,
    ScenarioUpdate,
)
from app.domain.auth import CurrentUser, Permission
from app.service.scenarios.calculations import CalculationService
from app.service.scenarios.service import ScenarioDraft, ScenarioPatch, ScenarioService

router = APIRouter(tags=["scenarios"])

OwnerDep = Annotated[CurrentUser, Depends(require(Permission.PROJECTS_OWN))]
ProjectIdPath = Annotated[UUID, Path()]
ScenarioIdPath = Annotated[UUID, Path()]


@router.get(
    "/projects/{project_id}/scenarios",
    operation_id="listScenarios",
    summary="Сценарии проекта (база создаётся автоматически)",
)
async def list_scenarios(project_id: ProjectIdPath, user: OwnerDep, uow: UowDep) -> ScenarioList:
    views = await ScenarioService(uow, user).list_scenarios(project_id)
    return ScenarioList(items=[Scenario.from_domain(view) for view in views])


@router.post(
    "/projects/{project_id}/scenarios",
    operation_id="createScenario",
    summary="Создать сценарий роботизации",
    status_code=status.HTTP_201_CREATED,
    responses={422: {"description": "Некорректные данные"}},
)
async def create_scenario(
    project_id: ProjectIdPath, payload: ScenarioCreate, user: OwnerDep, uow: UowDep
) -> Scenario:
    draft = ScenarioDraft(
        name=payload.name,
        kind=payload.kind,
        items=[item.to_domain() for item in payload.items],
        financing=payload.financing.to_domain() if payload.financing else None,
        horizon_years=payload.horizon_years,
        discount_rate_pct=payload.discount_rate_pct,
        overrides=[o.to_domain() for o in payload.overrides],
        from_recommendation=payload.from_recommendation,
    )
    return Scenario.from_domain(await ScenarioService(uow, user).create(project_id, draft))


@router.get(
    "/scenarios/{scenario_id}",
    operation_id="getScenario",
    summary="Сценарий",
    responses={404: {"description": "Не найдено"}},
)
async def get_scenario(scenario_id: ScenarioIdPath, user: OwnerDep, uow: UowDep) -> Scenario:
    return Scenario.from_domain(await ScenarioService(uow, user).get(scenario_id))


@router.patch(
    "/scenarios/{scenario_id}",
    operation_id="updateScenario",
    summary="Изменить состав, финансирование, горизонт, переопределения нормативов",
    responses={422: {"description": "Некорректные данные"}},
)
async def update_scenario(
    scenario_id: ScenarioIdPath, payload: ScenarioUpdate, user: OwnerDep, uow: UowDep
) -> Scenario:
    patch = ScenarioPatch(
        fields=frozenset(payload.model_fields_set),
        name=payload.name,
        items=[item.to_domain() for item in payload.items] if payload.items is not None else None,
        financing=payload.financing.to_domain() if payload.financing else None,
        horizon_years=payload.horizon_years,
        discount_rate_pct=payload.discount_rate_pct,
        overrides=[o.to_domain() for o in payload.overrides] if payload.overrides is not None else None,
    )
    return Scenario.from_domain(await ScenarioService(uow, user).update(scenario_id, patch))


@router.delete(
    "/scenarios/{scenario_id}",
    operation_id="deleteScenario",
    summary="Удалить сценарий (базовый удалить нельзя)",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={409: {"description": "Конфликт"}},
)
async def delete_scenario(scenario_id: ScenarioIdPath, user: OwnerDep, uow: UowDep) -> Response:
    await ScenarioService(uow, user).delete(scenario_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/scenarios/{scenario_id}/copy",
    operation_id="copyScenario",
    summary="Копировать сценарий (например, «покупка» → «RaaS» с тем же составом)",
    status_code=status.HTTP_201_CREATED,
)
async def copy_scenario(
    scenario_id: ScenarioIdPath, user: OwnerDep, uow: UowDep, payload: ScenarioCopy | None = None
) -> Scenario:
    request = payload or ScenarioCopy()
    view = await ScenarioService(uow, user).copy(scenario_id, request.name, request.kind)
    return Scenario.from_domain(view)


@router.post(
    "/scenarios/{scenario_id}/calculate",
    operation_id="calculateScenario",
    summary="Рассчитать экономику сценария (синхронно, ≤ 10 с)",
    description=(
        "Считает количество роботов, CAPEX, OPEX, эффект, денежный поток, метрики, интерпретацию и риски. "
        "Результат сохраняется с версиями входов."
    ),
    responses={409: {"description": "Сценарий не полон (нет продуктов) или параметры невалидны"}},
)
async def calculate_scenario(
    scenario_id: ScenarioIdPath, user: OwnerDep, uow: UowDep, payload: CalculateRequest | None = None
) -> CalculationRun:
    stored = await CalculationService(uow, user).calculate(scenario_id)
    return CalculationRun.from_stored(stored)
