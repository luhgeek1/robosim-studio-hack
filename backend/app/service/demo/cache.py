import hashlib
import json
from typing import Any

from redis.asyncio import Redis

from app.api.schemas.demo import DemoSnapshot
from app.core.errors import ConflictError
from app.core.versions import ENGINE_VERSION
from app.db.repositories.reference import ReferenceRepository
from app.db.uow import UnitOfWork
from app.service.demo.registry import DEMO_REVISION, Example

CACHE_SECONDS = 7 * 24 * 60 * 60
LOCK_SECONDS = 60
RETRY_SECONDS = 30


def _columns(row: Any) -> dict[str, Any]:
    return {column.name: getattr(row, column.name) for column in row.__table__.columns}


async def revision(uow: UnitOfWork, item: Example) -> str:
    repo = ReferenceRepository(uow.session)
    norm = await repo.norm_set(None)
    rows: list[Any] = [await repo.object_type(item.object_type)]
    rows.extend(await repo.parameters([item.object_type]))
    rows.extend(await repo.processes([item.object_type]))
    data = [
        DEMO_REVISION,
        ENGINE_VERSION,
        await repo.data_version("catalog"),
        norm.version if norm else None,
        [_columns(row) for row in rows if row is not None],
    ]
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()[:20]


class DemoCache:
    def __init__(self, redis: Redis, key: str, version: str) -> None:
        self.redis = redis
        self.prefix = f"demo:{key}:{version}"

    async def get(self) -> DemoSnapshot | None:
        raw = await self.redis.get(self.prefix)
        return DemoSnapshot.model_validate_json(raw) if raw else None

    async def ready(self) -> DemoSnapshot:
        snapshot = await self.get()
        if snapshot is None:
            raise ConflictError("Пример ещё готовится: откройте его и дождитесь расчёта")
        return snapshot

    async def publish(self, snapshot: DemoSnapshot) -> None:
        await self.redis.set(self.prefix, snapshot.model_dump_json(), ex=CACHE_SECONDS)

    async def stage(self, text: str) -> None:
        await self.redis.set(f"{self.prefix}:stage", text, ex=LOCK_SECONDS)
