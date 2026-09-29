from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

from app.core.errors import InvalidInputError, NotFoundError
from app.db.models import Source
from app.db.repositories.source_registry import SourceRegistryRepository
from app.db.uow import UnitOfWork
from app.domain.admin import (
    Freshness,
    SourceEdit,
    SourceEntry,
    SourceQuery,
    SourceUsage,
    freshness,
    months_before,
)

STALE_NORM = "source_stale_after_months"
_EDITABLE = ("title", "url", "retrieved_at", "note")


@dataclass(frozen=True, slots=True)
class SourcePage:
    items: list[SourceEntry]
    total: int
    stale_after_months: int
    stale_before: date
    freshness_counts: dict[Freshness, int]


def _entry(source: Source, usage: SourceUsage, cutoff: date) -> SourceEntry:
    return SourceEntry(
        id=source.id,
        kind=source.kind,
        title=source.title,
        url=source.url,
        retrieved_at=source.retrieved_at,
        note=source.note,
        usage=usage,
        freshness=freshness(source.retrieved_at, cutoff),
    )


def _state(source: Source) -> dict[str, Any]:
    return {
        "title": source.title,
        "url": source.url,
        "retrieved_at": source.retrieved_at.isoformat() if source.retrieved_at else None,
        "note": source.note,
    }


class SourceRegistryService:
    """Registry of data sources (ТЗ 2.1.6, 3.3.4): where catalog, norm and default values come from.

    A source's metadata is provenance, not an input of any formula, so an edit changes no data version:
    calculations keep their numbers, and every screen and report shows the corrected title and link.
    """

    def __init__(self, uow: UnitOfWork, actor_email: str) -> None:
        self._uow = uow
        self._actor = actor_email
        self._repo = SourceRegistryRepository(uow.session)

    async def search(self, query: SourceQuery) -> SourcePage:
        months, cutoff = await self._threshold()
        rows, total, counts = await self._repo.search(query, cutoff)
        return SourcePage(
            items=[_entry(source, usage, cutoff) for source, usage in rows],
            total=total,
            stale_after_months=months,
            stale_before=cutoff,
            freshness_counts={state: counts.get(state, 0) for state in Freshness},
        )

    async def update(self, source_id: UUID, edit: SourceEdit) -> SourceEntry:
        source = await self._repo.get(source_id)
        if source is None:
            raise NotFoundError("Источник не найден в реестре")
        if "title" in edit.fields and not edit.title:
            raise InvalidInputError("Название источника не может быть пустым")
        if edit.url and not edit.url.startswith(("http://", "https://")):
            raise InvalidInputError("Ссылка должна начинаться с http:// или https://")
        if edit.retrieved_at and edit.retrieved_at > datetime.now(UTC).date():
            raise InvalidInputError("Дата получения не может быть в будущем")
        before = _state(source)
        for name in _EDITABLE:
            if name in edit.fields:
                setattr(source, name, getattr(edit, name))
        after = _state(source)
        if after != before:
            self._repo.audit(source.id, self._actor, before, after)
        await self._uow.flush()
        _, cutoff = await self._threshold()
        return _entry(source, await self._repo.usage(source.id), cutoff)

    async def _threshold(self) -> tuple[int, date]:
        value = await self._repo.norm_value(STALE_NORM)
        if value is None:
            raise NotFoundError(f"Норматив {STALE_NORM} не найден")
        months = round(value)
        return months, months_before(datetime.now(UTC).date(), months)
