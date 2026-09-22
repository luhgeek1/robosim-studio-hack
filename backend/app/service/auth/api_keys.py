"""Integration API keys (ТЗ 3.8.2). The secret is shown once; only its SHA-256 is stored."""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from app.core.errors import ForbiddenError, NotFoundError
from app.db.models import ApiKey
from app.db.repositories.api_keys import to_info
from app.db.uow import UnitOfWork
from app.domain.auth import ApiKeyInfo, CurrentUser, scopes_allowed

KEY_PREFIX = "rs_live_"
_VISIBLE_PREFIX_CHARS = 4
_SECRET_BYTES = 32


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


@dataclass(frozen=True, slots=True)
class CreatedApiKey:
    info: ApiKeyInfo
    secret: str


class ApiKeyService:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def list_keys(self, user_id: UUID) -> list[ApiKeyInfo]:
        return [to_info(key) for key in await self._uow.api_keys.list_active(user_id)]

    async def create(self, owner: CurrentUser, name: str, scopes: list[str]) -> CreatedApiKey:
        if not scopes_allowed(owner.role, scopes):
            raise ForbiddenError("Нельзя выдать ключу права, которых нет у вашей роли")
        secret = KEY_PREFIX + secrets.token_urlsafe(_SECRET_BYTES)
        key = ApiKey(
            user_id=owner.id,
            name=name.strip(),
            prefix=secret[: len(KEY_PREFIX) + _VISIBLE_PREFIX_CHARS],
            secret_hash=hash_secret(secret),
            scopes=sorted(set(scopes)),
            created_at=datetime.now(UTC),
        )
        self._uow.api_keys.add(key)
        await self._uow.flush()
        return CreatedApiKey(info=to_info(key), secret=secret)

    async def revoke(self, user_id: UUID, key_id: UUID) -> None:
        key = await self._uow.api_keys.get_owned(key_id, user_id)
        if key is None:
            raise NotFoundError("Ключ не найден")
        self._uow.api_keys.revoke(key, datetime.now(UTC))
        await self._uow.flush()
