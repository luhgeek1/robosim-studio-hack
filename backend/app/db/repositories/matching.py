from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ManualCandidate, MatchingSettings


class MatchingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def settings(self, project_id: UUID) -> MatchingSettings | None:
        return await self._session.get(MatchingSettings, project_id)

    def add(self, item: MatchingSettings | ManualCandidate) -> None:
        self._session.add(item)

    async def manual(self, project_id: UUID) -> Sequence[ManualCandidate]:
        rows = await self._session.scalars(
            select(ManualCandidate).where(ManualCandidate.project_id == project_id)
        )
        return rows.all()

    async def manual_one(
        self, project_id: UUID, process_key: str, product_id: UUID
    ) -> ManualCandidate | None:
        statement = select(ManualCandidate).where(
            ManualCandidate.project_id == project_id,
            ManualCandidate.process_key == process_key,
            ManualCandidate.product_id == product_id,
        )
        item: ManualCandidate | None = await self._session.scalar(statement)
        return item
