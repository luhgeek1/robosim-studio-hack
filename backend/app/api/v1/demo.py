import asyncio
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Response

from app.api.deps import RedisDep, UowDep, get_database, rate_limited
from app.api.files import content_disposition
from app.api.schemas.demo import (
    DemoPreparation,
    DemoProjectList,
    DemoSnapshot,
    DemoWhatIfRequest,
    DemoWhatIfResult,
)
from app.api.schemas.simulations import SimulationReplay
from app.core.errors import InvalidInputError, NotFoundError
from app.db.session import Database
from app.domain.reports.models import ReportFormat, ReportSection
from app.service.demo.build import card
from app.service.demo.cache import RETRY_SECONDS, DemoCache, revision
from app.service.demo.prepare import claim, prepare
from app.service.demo.registry import DEMO_OWNER, EXAMPLES, example
from app.service.demo.what_if import what_if
from app.service.reports.collect import ReportCollector, ReportRequest
from app.service.reports.service import MEDIA_TYPES, render
from app.service.simulations.service import SimulationService

router = APIRouter(prefix="/demo/projects", tags=["demo"])
DatabaseDep = Annotated[Database, Depends(get_database)]


@router.get("", operation_id="listDemoProjects", summary="Примеры без регистрации")
async def list_examples(uow: UowDep, redis: RedisDep) -> DemoProjectList:
    items = []
    for item in EXAMPLES:
        cached = await DemoCache(redis, item.key, await revision(uow, item)).get()
        items.append(cached.demo if cached else card(item))
    return DemoProjectList(items=items)


@router.get("/{demo_key}", operation_id="getDemoProject", summary="Открыть публичный пример")
async def get_example(
    demo_key: str,
    uow: UowDep,
    redis: RedisDep,
    db: DatabaseDep,
    background: BackgroundTasks,
    response: Response,
) -> DemoSnapshot | DemoPreparation:
    item = example(demo_key)
    version = await revision(uow, item)
    cache = DemoCache(redis, item.key, version)
    if cached := await cache.get():
        return cached
    response.status_code = 202
    response.headers["Cache-Control"] = "no-store"
    if await redis.get(f"{cache.prefix}:failed"):
        return DemoPreparation(
            status="failed",
            stage="Подготовка прервалась. Можно повторить через полминуты.",
            retry_after_s=RETRY_SECONDS,
        )
    if token := await claim(cache):
        background.add_task(prepare, db, cache, item, version, token)
    stage = await redis.get(f"{cache.prefix}:stage")
    return DemoPreparation(status="preparing", stage=str(stage or "Готовим исходный пример"), retry_after_s=2)


@router.post(
    "/{demo_key}/what-if",
    operation_id="demoWhatIf",
    summary="Пробный расчёт без сохранения",
    dependencies=[Depends(rate_limited("demo-what-if"))],
)
async def calculate_example(
    demo_key: str, payload: DemoWhatIfRequest, uow: UowDep, redis: RedisDep
) -> DemoWhatIfResult:
    item = example(demo_key)
    snapshot = await DemoCache(redis, item.key, await revision(uow, item)).ready()
    return await what_if(uow, snapshot, payload)


@router.get("/{demo_key}/replay", operation_id="getDemoReplay", summary="События имитации публичного примера")
async def replay_example(
    demo_key: str,
    uow: UowDep,
    redis: RedisDep,
    from_s: Annotated[float, Query(ge=0)] = 0,
    to_s: Annotated[float | None, Query(gt=0)] = None,
) -> SimulationReplay:
    item = example(demo_key)
    if to_s is not None and not from_s < to_s <= from_s + 3600:
        raise InvalidInputError("Окно воспроизведения — от 1 до 3600 секунд")
    snapshot = await DemoCache(redis, item.key, await revision(uow, item)).ready()
    if snapshot.simulation is None:
        raise NotFoundError("У примера нет имитации")
    replay = await SimulationService(uow, DEMO_OWNER).replay(snapshot.simulation.id, from_s, to_s, None)
    return SimulationReplay.from_replay(replay)


@router.get(
    "/{demo_key}/report/{format}",
    operation_id="downloadDemoReport",
    summary="Отчёт по исходному примеру",
    dependencies=[Depends(rate_limited("demo-report"))],
)
async def report_example(
    demo_key: str, format: Literal["pdf", "xlsx"], uow: UowDep, redis: RedisDep
) -> Response:
    item = example(demo_key)
    snapshot = await DemoCache(redis, item.key, await revision(uow, item)).ready()
    sections: list[ReportSection] = [
        s for s in ReportSection if s not in {ReportSection.SENSITIVITY, ReportSection.MONTE_CARLO}
    ]
    request = ReportRequest(sections, [], [], f"Исходный публичный пример: {item.name}")
    model = await ReportCollector(uow, DEMO_OWNER).collect(snapshot.comparison.project_id, request)
    model.author = "Робомера · публичный пример"
    model.limitations.insert(0, item.scope)
    fmt = ReportFormat(format)
    data = await asyncio.to_thread(render, model, fmt)
    return Response(
        data,
        media_type=MEDIA_TYPES[fmt],
        headers={
            "Content-Disposition": content_disposition(f"robomera_{item.key}.{format}"),
            "Cache-Control": "no-store",
        },
    )
