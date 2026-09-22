from dataclasses import dataclass
from uuid import UUID

from app.core.errors import NotFoundError
from app.db.repositories.users import to_profile
from app.db.uow import UnitOfWork
from app.domain.auth import UserProfile


@dataclass(frozen=True, slots=True)
class ProfileUpdate:
    """Partial update: only attributes named in ``fields`` are applied (``None`` clears optional ones)."""

    fields: frozenset[str]
    name: str | None = None
    organization: str | None = None
    position: str | None = None


class ProfileService:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    async def get(self, user_id: UUID) -> UserProfile:
        user = await self._uow.users.get(user_id)
        if user is None:
            raise NotFoundError("Пользователь не найден")
        return to_profile(user)

    async def update(self, user_id: UUID, patch: ProfileUpdate) -> UserProfile:
        user = await self._uow.users.get(user_id)
        if user is None:
            raise NotFoundError("Пользователь не найден")
        if "name" in patch.fields and patch.name is not None:
            user.name = patch.name.strip()
        if "organization" in patch.fields:
            user.organization = patch.organization
        if "position" in patch.fields:
            user.position = patch.position
        await self._uow.flush()
        return to_profile(user)
