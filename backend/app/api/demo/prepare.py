import asyncio
import logging
from collections.abc import Awaitable
from contextlib import suppress
from typing import cast
from uuid import uuid4

from app.api.demo.build import build
from app.api.demo.cache import LOCK_SECONDS, RETRY_SECONDS, DemoCache
from app.api.demo.registry import Example
from app.db.session import Database

logger = logging.getLogger(__name__)
_RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end"
_RENEW = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) end"


async def claim(cache: DemoCache) -> str | None:
    token = str(uuid4())
    taken = await cache.redis.set(f"{cache.prefix}:lock", token, nx=True, ex=LOCK_SECONDS)
    return token if taken else None


async def _renew(cache: DemoCache, token: str) -> None:
    while True:
        await asyncio.sleep(LOCK_SECONDS / 3)
        await cast(
            Awaitable[str], cache.redis.eval(_RENEW, 1, f"{cache.prefix}:lock", token, str(LOCK_SECONDS))
        )


async def prepare(db: Database, cache: DemoCache, item: Example, version: str, token: str) -> None:
    heartbeat = asyncio.create_task(_renew(cache, token))
    try:
        await build(db, cache, item, version)
    except Exception:
        logger.exception("public_demo_preparation_failed", extra={"demo_key": item.key})
        await cache.redis.set(f"{cache.prefix}:failed", "1", ex=RETRY_SECONDS)
    finally:
        heartbeat.cancel()
        with suppress(asyncio.CancelledError):
            await heartbeat
        await cast(Awaitable[str], cache.redis.eval(_RELEASE, 1, f"{cache.prefix}:lock", token))
