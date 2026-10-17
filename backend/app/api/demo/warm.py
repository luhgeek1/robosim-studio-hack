import logging

from redis.asyncio import Redis

from app.api.demo.cache import DemoCache, revision
from app.api.demo.prepare import claim, prepare
from app.api.demo.registry import EXAMPLES
from app.db.session import Database
from app.db.uow import UnitOfWork

logger = logging.getLogger(__name__)


async def warm_examples(db: Database, redis: Redis) -> None:
    for item in EXAMPLES:
        try:
            async with UnitOfWork(db.session()) as uow:
                version = await revision(uow, item)
            cache = DemoCache(redis, item.key, version)
            if await cache.get():
                continue
            if token := await claim(cache):
                await prepare(db, cache, item, version, token)
        except Exception:
            # Demo preparation must not take down the API or prevent the other examples from loading.
            logger.exception("public_demo_warmup_failed", extra={"demo_key": item.key})
