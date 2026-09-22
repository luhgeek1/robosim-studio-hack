from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path

from app.api.deps import UowDep, require
from app.api.schemas.matching import Candidate, ManualAddRequest, MatchingResult, MatchingRunRequest
from app.domain.auth import CurrentUser, Permission
from app.service.matching.service import MatchingService

router = APIRouter(prefix="/projects/{project_id}/matching", tags=["matching"])

OwnerDep = Annotated[CurrentUser, Depends(require(Permission.PROJECTS_OWN))]
ProjectIdPath = Annotated[UUID, Path()]


@router.get(
    "",
    operation_id="getMatching",
    summary="Подбор решений по процессам с причинами и скорингом (ТЗ 3.4)",
    description="Возвращает последний результат; если параметры менялись — пересчитывает автоматически.",
    responses={409: {"description": "Не хватает обязательных параметров"}},
)
async def get_matching(project_id: ProjectIdPath, user: OwnerDep, uow: UowDep) -> MatchingResult:
    return MatchingResult.from_domain(await MatchingService(uow, user).run(project_id))


@router.post("", operation_id="runMatching", summary="Пересчитать подбор с другими весами")
async def run_matching(
    project_id: ProjectIdPath, user: OwnerDep, uow: UowDep, payload: MatchingRunRequest | None = None
) -> MatchingResult:
    request = payload or MatchingRunRequest()
    outcome = await MatchingService(uow, user).run(
        project_id,
        weights=request.weights,
        include_rnd=request.include_rnd,
        process_keys=request.process_keys,
    )
    return MatchingResult.from_domain(outcome)


@router.post(
    "/manual",
    operation_id="addManualCandidate",
    summary="Добавить продукт в подбор вручную с предупреждением (ТЗ 3.4.4)",
    responses={404: {"description": "Не найдено"}},
)
async def add_manual(
    project_id: ProjectIdPath, payload: ManualAddRequest, user: OwnerDep, uow: UowDep
) -> Candidate:
    view = await MatchingService(uow, user).add_manual(
        project_id, payload.process_key, payload.product_id, payload.offer_id, payload.acknowledge_warning
    )
    return Candidate.from_domain(view)
