"""Unit of Work: one transaction per request. Services call ``flush()``; only the owner of the UoW commits."""

from types import TracebackType
from typing import Self

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.api_keys import ApiKeyRepository
from app.db.repositories.jobs import JobRepository
from app.db.repositories.users import UserRepository


class UnitOfWork:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UserRepository(session)
        self.api_keys = ApiKeyRepository(session)
        self.jobs = JobRepository(session)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, tb: TracebackType | None
    ) -> None:
        if exc_type is not None:
            await self.session.rollback()
        await self.session.close()

    async def flush(self) -> None:
        await self.session.flush()

    async def commit(self) -> None:
        await self.session.commit()
