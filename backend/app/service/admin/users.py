from uuid import UUID

from app.core.errors import InvalidInputError, NotFoundError
from app.db.models import Manufacturer
from app.db.repositories.users import to_profile
from app.db.uow import UnitOfWork
from app.domain.admin import UserChange, UserQuery
from app.domain.auth import CurrentUser, Role, UserProfile


class UserAdminService:
    def __init__(self, uow: UnitOfWork, actor: CurrentUser) -> None:
        self._uow = uow
        self._actor = actor

    async def search(self, query: UserQuery) -> tuple[list[UserProfile], int]:
        users, total = await self._uow.users.search(query)
        return [to_profile(user) for user in users], total

    async def update(self, user_id: UUID, change: UserChange) -> UserProfile:
        user = await self._uow.users.get(user_id)
        if user is None:
            raise NotFoundError("Пользователь не найден")
        if user.id == self._actor.id and (
            (change.role is not None and change.role != Role.ADMIN) or change.is_active is False
        ):
            raise InvalidInputError(
                "Нельзя снять с себя роль администратора или отключить свою учётную запись"
            )
        if change.role == Role.GUEST:
            raise InvalidInputError("Роль «гость» не назначается учётной записи")
        vendor = change.vendor_manufacturer_id if change.vendor_manufacturer_set else None
        if vendor is not None and await self._uow.session.get(Manufacturer, vendor) is None:
            raise InvalidInputError("Производитель для привязки вендора не найден")
        revoke = (change.role is not None and change.role != user.role) or (
            change.is_active is not None and change.is_active != user.is_active
        )
        if change.role is not None:
            user.role = change.role
        if change.is_active is not None:
            user.is_active = change.is_active
        if change.vendor_manufacturer_set:
            user.vendor_manufacturer_id = change.vendor_manufacturer_id
        if revoke:
            # Access and refresh tokens carry auth_version: a new role or a block ends every open session.
            user.auth_version += 1
        await self._uow.flush()
        return to_profile(user)
