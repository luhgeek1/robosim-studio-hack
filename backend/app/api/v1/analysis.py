from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path

from app.api.deps import UowDep, require
from app.api.schemas.analysis import (
    MonteCarloRequest,
    MonteCarloResult,
    Narrative,
    SensitivityRequest,
    SensitivityResult,
    SurveyPriorities,
)
from app.core.errors import ConflictError
from app.domain.auth import CurrentUser, Permission
from app.service.scenarios.analysis import AnalysisService
from app.service.scenarios.calculations import CalculationService
from app.service.scenarios.narrative import narrative

router = APIRouter(tags=["calculations"])

OwnerDep = Annotated[CurrentUser, Depends(require(Permission.PROJECTS_OWN))]
ScenarioIdPath = Annotated[UUID, Path()]


@router.post(
    "/scenarios/{scenario_id}/sensitivity",
    operation_id="runSensitivity",
    summary="Чувствительность к параметрам — торнадо и тепловая карта (ТЗ 3.5.6)",
    responses={409: {"description": "Нет расчёта"}},
)
async def run_sensitivity(
    scenario_id: ScenarioIdPath, user: OwnerDep, uow: UowDep, payload: SensitivityRequest | None = None
) -> SensitivityResult:
    request = payload or SensitivityRequest()
    heat = (request.heatmap.x_key, request.heatmap.y_key, request.heatmap.steps) if request.heatmap else None
    view = await AnalysisService(uow, user).sensitivity(
        scenario_id, request.metric, [p.to_domain() for p in request.parameters], heat
    )
    return SensitivityResult.from_domain(view, datetime.now(UTC))


@router.post(
    "/scenarios/{scenario_id}/monte-carlo",
    operation_id="runMonteCarlo",
    summary="Монте-Карло по неопределённости входов",
    description="method=analytic выполняется синхронно; surrogate и des появятся вместе с имитацией.",
)
async def run_monte_carlo(
    scenario_id: ScenarioIdPath, user: OwnerDep, uow: UowDep, payload: MonteCarloRequest | None = None
) -> MonteCarloResult:
    request = payload or MonteCarloRequest()
    if request.method != "analytic":
        raise ConflictError("Методы surrogate и des появятся вместе с имитацией; сейчас доступен analytic")
    outcome = await AnalysisService(uow, user).monte_carlo(
        scenario_id,
        n=request.n,
        metric=request.metric,
        requests=[d.to_domain() for d in request.distributions],
        seed=request.seed,
    )
    return MonteCarloResult.from_domain(outcome)


@router.get(
    "/scenarios/{scenario_id}/survey-priorities",
    operation_id="getSurveyPriorities",
    summary="Что уточнить при обследовании объекта (чувствительность × происхождение)",
)
async def get_survey_priorities(scenario_id: ScenarioIdPath, user: OwnerDep, uow: UowDep) -> SurveyPriorities:
    return SurveyPriorities.from_domain(await AnalysisService(uow, user).survey(scenario_id))


@router.get(
    "/calculations/{calculation_id}/narrative",
    operation_id="getCalculationNarrative",
    summary="Executive summary и следующие шаги (LLM с fallback на шаблоны)",
    tags=["assist"],
)
async def get_narrative(calculation_id: Annotated[UUID, Path()], user: OwnerDep, uow: UowDep) -> Narrative:
    stored = await CalculationService(uow, user).get(calculation_id)
    return Narrative.from_domain(narrative(stored.run))
