from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ApiKey
from app.domain.auth import ApiKeyInfo

MAX_KEYS_PER_USER = 50


def to_info(key: ApiKey) -> ApiKeyInfo:
    return ApiKeyInfo(
        id=key.id,
        name=key.name,
        prefix=key.prefix,
        scopes=tuple(key.scopes),
        created_at=key.created_at,
        last_used_at=key.last_used_at,
    )


class ApiKeyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_active(self, user_id: UUID) -> list[ApiKey]:
        result = await self._session.execute(
            select(ApiKey)
            .where(ApiKey.user_id == user_id, ApiKey.revoked_at.is_(None))
            .order_by(ApiKey.created_at.desc())
            .limit(MAX_KEYS_PER_USER)
        )
        return list(result.scalars())

    async def get_owned(self, key_id: UUID, user_id: UUID) -> ApiKey | None:
        result = await self._session.execute(
            select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user_id, ApiKey.revoked_at.is_(None))
        )
        return result.scalar_one_or_none()

    async def get_by_secret_hash(self, secret_hash: str) -> ApiKey | None:
        result = await self._session.execute(
            select(ApiKey).where(ApiKey.secret_hash == secret_hash, ApiKey.revoked_at.is_(None))
        )
        return result.scalar_one_or_none()

    def add(self, key: ApiKey) -> None:
        self._session.add(key)

    @staticmethod
    def revoke(key: ApiKey, at: datetime) -> None:
        key.revoked_at = at
