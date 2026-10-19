"""Abuse protection on the regular API, applied only to temporary identities."""

from fastapi import Request
from redis.asyncio import Redis
from sqlalchemy import func, select

from app.core.errors import ForbiddenError, RateLimitedError, UnauthorizedError
from app.db.models import Job, Project, Scenario, StoredFile, User
from app.db.uow import UnitOfWork
from app.domain.jobs import JobStatus
from app.infra.client_ip import client_ip
from app.infra.rate_limit import RateLimiter
from app.service.auth.guests import MAX_GUEST_SCENARIOS, ensure_guest_active

MAX_GUEST_PROJECTS = 10
MAX_GUEST_ACTIVE_JOBS = 2
_COMPUTE = ("calculate", "matching", "sensitivity", "monte-carlo", "fleet-sweep", "simulations", "reports")


async def guard_guest(request: Request, user: User, uow: UnitOfWork, redis: Redis) -> None:
    ip = client_ip(request, request.app.state.settings)
    for key, limit in ((f"guest:{user.id}", 240), (f"guest-ip:{ip}", 1200)):
        if not await RateLimiter(redis, limit=limit, window_s=60).hit(key):
            raise RateLimitedError("Слишком много запросов демо. Повторите через минуту.")
    path = request.url.path.rstrip("/")
    if request.method == "GET" and path.rsplit("/", 1)[-1] in {
        "matching",
        "comparison",
        "data-quality",
        "survey-priorities",
    }:
        for key, limit in ((f"guest-read-compute:{user.id}", 60), (f"guest-read-compute-ip:{ip}", 240)):
            if not await RateLimiter(redis, limit=limit, window_s=60).hit(key):
                raise RateLimitedError("Слишком много запросов расчётных данных. Повторите через минуту.")
    if request.method in {"GET", "HEAD", "OPTIONS"}:
        return
    # Serialize mutations of one guest, so quotas cannot be bypassed with parallel requests.
    locked = await uow.session.scalar(
        select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True)
    )
    if locked is None:
        raise UnauthorizedError("Гостевая сессия завершена")
    ensure_guest_active(locked)
    if "/organizations" in path or "/invitations" in path or "/rfqs" in path:
        raise ForbiddenError("Для совместной работы сохраните проект в аккаунте")
    if request.method == "POST":
        await _quotas(path, user, uow, redis)


async def _quotas(path: str, user: User, uow: UnitOfWork, redis: Redis) -> None:
    if path == "/api/v1/projects" or (path.startswith("/api/v1/projects/") and path.endswith("/copy")):
        count = await uow.session.scalar(
            select(func.count()).select_from(Project).where(Project.owner_id == user.id)
        )
        if (count or 0) >= MAX_GUEST_PROJECTS:
            raise RateLimitedError("В демо можно держать до 10 проектов. Удалите лишний или сбросьте демо.")
    if path.endswith(("/scenarios", "/copy", "/from-recommendation")):
        count = await uow.session.scalar(
            select(func.count()).select_from(Scenario).join(Project).where(Project.owner_id == user.id)
        )
        if (count or 0) >= MAX_GUEST_SCENARIOS:
            raise RateLimitedError("В демо можно держать до 30 сценариев. Удалите лишние.")
    stored = await uow.session.scalar(
        select(func.coalesce(func.sum(StoredFile.size_bytes), 0)).where(StoredFile.owner_id == user.id)
    )
    if (stored or 0) > 100 * 1024 * 1024:
        raise RateLimitedError("Временные файлы заняли 100 МБ. Удалите лишние проекты или сбросьте демо.")
    if path.rsplit("/", 1)[-1] in _COMPUTE:
        total = await uow.session.scalar(select(func.count()).select_from(Job).where(Job.owner_id == user.id))
        if (total or 0) >= 100:
            raise RateLimitedError("Лимит демо: 100 фоновых задач за сессию. Начните новое демо.")
        if not await RateLimiter(redis, limit=12, window_s=60).hit(f"guest-compute:{user.id}"):
            raise RateLimitedError("Лимит демо: 12 запусков расчёта в минуту. Повторите через минуту.")
        active = await uow.session.scalar(
            select(func.count())
            .select_from(Job)
            .where(Job.owner_id == user.id, Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]))
        )
        if (active or 0) >= MAX_GUEST_ACTIVE_JOBS:
            raise RateLimitedError(
                "Уже выполняются две задачи. Дождитесь результата перед следующим запуском."
            )
