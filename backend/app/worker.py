from typing import Any, ClassVar
from uuid import UUID

from arq import cron
from arq.connections import RedisSettings
from arq.typing import WorkerCoroutine

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import Database
from app.infra.worker_heartbeat import HEARTBEAT_KEY
from app.service.jobs.queue import JOB_FUNCTION, execute

_settings = get_settings()


async def heartbeat(ctx: dict[str, Any]) -> None:
    await ctx["redis"].set(HEARTBEAT_KEY, "1", ex=_settings.worker_heartbeat_ttl_s)


async def on_startup(ctx: dict[str, Any]) -> None:
    configure_logging(_settings.log_level, as_json=_settings.log_json)
    ctx["db"] = Database(_settings)
    await heartbeat(ctx)


async def on_shutdown(ctx: dict[str, Any]) -> None:
    await ctx["db"].dispose()


async def run_job(ctx: dict[str, Any], name: str, job_id: str) -> None:
    await execute(ctx["db"], name, UUID(job_id))


run_job.__qualname__ = JOB_FUNCTION


class WorkerSettings:
    functions: ClassVar[list[WorkerCoroutine]] = [run_job]
    cron_jobs: ClassVar[list[Any]] = [cron(heartbeat, second={0, 30}, run_at_startup=True)]
    on_startup = on_startup
    on_shutdown = on_shutdown
    job_timeout = _settings.job_timeout_s
    # A simulation that crashed is recorded as failed by its runner; retrying it would only repeat the error.
    max_tries = 1
    redis_settings = RedisSettings.from_dsn(_settings.redis_url)
