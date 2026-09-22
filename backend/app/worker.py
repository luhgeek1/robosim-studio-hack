from typing import Any, ClassVar

from arq import cron
from arq.connections import RedisSettings
from arq.typing import WorkerCoroutine

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.infra.worker_heartbeat import HEARTBEAT_KEY

_settings = get_settings()


async def heartbeat(ctx: dict[str, Any]) -> None:
    await ctx["redis"].set(HEARTBEAT_KEY, "1", ex=_settings.worker_heartbeat_ttl_s)


async def on_startup(ctx: dict[str, Any]) -> None:
    configure_logging(_settings.log_level, as_json=_settings.log_json)
    await heartbeat(ctx)


class WorkerSettings:
    functions: ClassVar[list[WorkerCoroutine]] = []
    cron_jobs: ClassVar[list[Any]] = [cron(heartbeat, second={0, 30}, run_at_startup=True)]
    on_startup = on_startup
    redis_settings = RedisSettings.from_dsn(_settings.redis_url)
