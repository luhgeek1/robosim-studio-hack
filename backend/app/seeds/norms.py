from sqlalchemy import select

from app.core.config import Settings
from app.db.models import Norm, NormSet
from app.db.uow import UnitOfWork
from app.seeds.reference import SeedDataError
from app.seeds.schemas import load_norm_set
from app.seeds.sources import SourceRegistry, SourceSpec


async def seed_norms(uow: UnitOfWork, _: Settings) -> int:
    """Publishes norm set v1 once; later changes are new versions, so old calculations stay reproducible."""
    seed = load_norm_set("v1")
    if await uow.session.scalar(select(NormSet.id).where(NormSet.version == seed.version)):
        return 0
    known_sources = {source.key for source in seed.sources}
    unknown = sorted({norm.source for norm in seed.norms} - known_sources)
    if unknown:
        raise SeedDataError(f"norms {seed.version}: unknown sources {unknown}")

    registry = SourceRegistry(uow)
    source_ids = {
        source.key: await registry.id_for(
            SourceSpec(
                key=f"norms:{source.key}",
                kind=source.kind,
                title=source.title,
                url=source.url,
                retrieved_at=source.retrieved_at,
                note=source.note,
            )
        )
        for source in seed.sources
    }
    has_current = await uow.session.scalar(select(NormSet.id).where(NormSet.is_current.is_(True)))
    norm_set = NormSet(
        version=seed.version, notes=seed.notes, published_by="system", is_current=not has_current
    )
    uow.session.add(norm_set)
    await uow.flush()
    uow.session.add_all(
        Norm(
            norm_set_id=norm_set.id,
            key=norm.key,
            name=norm.name,
            value=norm.value,
            unit=norm.unit,
            category=norm.category,
            range_min=norm.range.min if norm.range else None,
            range_max=norm.range.max if norm.range else None,
            source_id=source_ids[norm.source],
            rationale=norm.rationale,
            affects=norm.affects,
            editable_by_user=norm.editable_by_user,
            object_types=[t.value for t in norm.object_types],
        )
        for norm in seed.norms
    )
    await uow.flush()
    return len(seed.norms)
