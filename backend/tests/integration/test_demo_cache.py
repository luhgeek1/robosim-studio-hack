from httpx import AsyncClient
from sqlalchemy import select

from app.api.demo.cache import DemoCache, revision
from app.api.demo.prepare import claim
from app.api.demo.registry import EXAMPLES
from app.core.config import Settings
from app.db.models import ParameterDef
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.infra.redis import create_redis


async def test_demo_revision_changes_with_defaults_and_claim_is_exclusive(
    client: AsyncClient, settings: Settings
) -> None:
    assert (await client.get("/api/v1/demo/projects")).status_code == 200
    db = Database(settings)
    redis = create_redis(settings)
    try:
        async with UnitOfWork(db.session()) as uow:
            item = EXAMPLES[0]
            before = await revision(uow, item)
            param = await uow.session.scalar(
                select(ParameterDef).where(ParameterDef.object_type == item.object_type)
            )
            assert param is not None
            param.default_note = f"{param.default_note} · проверка версии"
            await uow.flush()
            assert await revision(uow, item) != before
            await uow.rollback()
            assert await revision(uow, item) == before
            cache = DemoCache(redis, item.key, before)
            await redis.delete(f"{cache.prefix}:lock")
            assert await claim(cache)
            assert await claim(cache) is None
            await redis.delete(f"{cache.prefix}:lock")
    finally:
        await redis.aclose()
        await db.dispose()
