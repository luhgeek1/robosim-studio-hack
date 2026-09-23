from dataclasses import dataclass
from datetime import date
from urllib.parse import urlparse
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.db.models import Source
from app.db.uow import UnitOfWork
from app.domain.common.provenance import SourceKind

DATASET_RETRIEVED = date(2026, 9, 15)


@dataclass(frozen=True, slots=True)
class SourceSpec:
    key: str
    kind: SourceKind
    title: str
    url: str | None = None
    retrieved_at: date | None = None
    note: str | None = None


def dataset_sheet_source(sheet: str) -> SourceSpec:
    return SourceSpec(
        key=f"dataset:{sheet}",
        kind=SourceKind.ORGANIZER_DATASET,
        title=f"Датасеты_хакатон.xlsx, лист «{sheet}»",
        retrieved_at=DATASET_RETRIEVED,
    )


def team_assumption_source(topic: str) -> SourceSpec:
    return SourceSpec(
        key=f"assumption:{topic}",
        kind=SourceKind.TEAM_ASSUMPTION,
        title="Допущение команды «РобоМера»",
        note="Обоснование — в поле rationale/note значения",
    )


def url_source(url: str, retrieved_at: date | None, *, vendor_domain: str | None) -> SourceSpec:
    host = urlparse(url).netloc.removeprefix("www.")
    is_vendor = vendor_domain is not None and host == vendor_domain
    return SourceSpec(
        key=f"url:{url}",
        kind=SourceKind.VENDOR_SITE if is_vendor else SourceKind.OPEN_SOURCE,
        title=host or url,
        url=url if url.startswith("http") else None,
        retrieved_at=retrieved_at,
    )


class SourceRegistry:
    """Upserts sources by natural key and caches their ids for the duration of a seed run."""

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow
        self._ids: dict[str, UUID] = {}

    async def id_for(self, spec: SourceSpec) -> UUID:
        if spec.key in self._ids:
            return self._ids[spec.key]
        values = {
            "key": spec.key,
            "kind": spec.kind,
            "title": spec.title,
            "url": spec.url,
            "retrieved_at": spec.retrieved_at,
            "note": spec.note,
        }
        statement = insert(Source).values(**values)
        statement = statement.on_conflict_do_update(
            index_elements=[Source.key], set_={k: v for k, v in values.items() if k != "key"}
        )
        await self._uow.session.execute(statement)
        source_id = await self._uow.session.scalar(select(Source.id).where(Source.key == spec.key))
        assert source_id is not None
        self._ids[spec.key] = source_id
        return source_id
