from app.db.models import Norm
from app.db.repositories.reference import ReferenceRepository
from app.db.uow import UnitOfWork
from app.engine.trace import Book, InputKind


class NormLoader:
    def __init__(self, uow: UnitOfWork) -> None:
        self._repo = ReferenceRepository(uow.session)

    async def rows(self, object_type: str) -> list[Norm]:
        norm_set = await self._repo.norm_set(None)
        return list(await self._repo.norms(norm_set.id, None, object_type)) if norm_set else []

    async def book(self, object_type: str) -> Book:
        return Book.of(
            InputKind.NORM, [(n.key, n.name, n.value, n.unit) for n in await self.rows(object_type)]
        )
