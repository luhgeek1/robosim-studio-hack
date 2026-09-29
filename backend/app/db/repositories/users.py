from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.domain.admin import UserQuery
from app.domain.auth import CurrentUser, UserProfile


def to_current_user(user: User) -> CurrentUser:
    return CurrentUser(id=user.id, email=user.email, role=user.role, auth_version=user.auth_version)


def to_profile(user: User) -> UserProfile:
    return UserProfile(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        organization=user.organization,
        position=user.position,
        vendor_manufacturer_id=user.vendor_manufacturer_id,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        is_active=user.is_active,
    )


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, user_id: UUID) -> User | None:
        return await self._session.get(User, user_id)

    async def get_by_email(self, email: str) -> User | None:
        result = await self._session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def email_exists(self, email: str) -> bool:
        result = await self._session.execute(
            select(func.count()).select_from(User).where(User.email == email)
        )
        return result.scalar_one() > 0

    async def search(self, query: UserQuery) -> tuple[Sequence[User], int]:
        statement = select(User)
        if query.q:
            pattern = f"%{query.q.strip()}%"
            statement = statement.where(or_(User.email.ilike(pattern), User.name.ilike(pattern)))
        if query.role is not None:
            statement = statement.where(User.role == query.role)
        total = await self._session.scalar(select(func.count()).select_from(statement.subquery()))
        page = (
            statement.order_by(User.created_at.desc(), User.email)
            .limit(query.page_size)
            .offset((query.page - 1) * query.page_size)
        )
        return (await self._session.scalars(page)).all(), int(total or 0)

    def add(self, user: User) -> None:
        self._session.add(user)

    @staticmethod
    def touch_login(user: User, at: datetime) -> None:
        user.last_login_at = at
