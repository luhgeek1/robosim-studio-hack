from app.db.models import Source
from app.domain.common.provenance import SourceInfo


def to_source(source: Source) -> SourceInfo:
    return SourceInfo(
        id=source.id,
        kind=source.kind,
        title=source.title,
        url=source.url,
        retrieved_at=source.retrieved_at,
        note=source.note,
    )
