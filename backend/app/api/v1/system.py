import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Response, status
from sqlalchemy import text

from app.api.deps import CurrentUserDep, RedisDep, SettingsDep, UowDep
from app.api.schemas.system import CheckState, Health, Job, SystemVersion
from app.core.errors import NotFoundError
from app.core.versions import ENGINE_VERSION
from app.db.repositories.jobs import to_info
from app.domain.auth import Permission
from app.infra.worker_heartbeat import HEARTBEAT_KEY

router = APIRouter(tags=["system"])
logger = logging.getLogger(__name__)

NO_DATA_VERSION = "none"


@router.get("/health", operation_id="health", summary="Liveness (без внешних вызовов)")
async def health() -> Health:
    return Health(status="ok")


@router.get(
    "/ready",
    operation_id="ready",
    summary="Readiness (БД, Redis, воркер)",
    responses={503: {"model": Health, "description": "Не готов"}},
)
async def ready(response: Response, uow: UowDep, redis: RedisDep) -> Health:
    checks: dict[str, CheckState] = {"database": "fail", "redis": "fail", "worker": "fail", "llm": "skipped"}
    try:
        await uow.session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except OSError:
        logger.warning("readiness: database unreachable")
    try:
        await redis.ping()
        checks["redis"] = "ok"
        checks["worker"] = "ok" if await redis.exists(HEARTBEAT_KEY) else "fail"
    except (OSError, ConnectionError):
        logger.warning("readiness: redis unreachable")
    if checks["database"] != "ok" or checks["redis"] != "ok":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return Health(status="down", checks=checks)
    return Health(status="ok" if checks["worker"] == "ok" else "degraded", checks=checks)


@router.get("/version", operation_id="version", summary="Версии приложения, движка, каталога и нормативов")
async def version(settings: SettingsDep) -> SystemVersion:
    return SystemVersion(
        app_version=settings.app_version,
        engine_version=ENGINE_VERSION,
        catalog_version=NO_DATA_VERSION,
        norm_set_version=NO_DATA_VERSION,
        llm_enabled=False,
        build_sha=settings.build_sha,
    )


@router.get(
    "/jobs/{job_id}",
    operation_id="getJob",
    summary="Состояние фоновой задачи",
    responses={404: {"description": "Не найдено"}},
)
async def get_job(job_id: Annotated[UUID, Path()], user: CurrentUserDep, uow: UowDep) -> Job:
    job = await uow.jobs.get(job_id)
    if job is None or (job.owner_id != user.id and not user.can(Permission.USERS_MANAGE)):
        raise NotFoundError("Задача не найдена")
    return Job.from_domain(to_info(job))
