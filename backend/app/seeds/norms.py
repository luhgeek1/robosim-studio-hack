from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from app.core.config import Settings
from app.db.models import Norm, NormSet
from app.db.uow import UnitOfWork
from app.seeds.reference import SeedDataError
from app.seeds.schemas import NormSetSeed, load_norm_set
from app.seeds.sources import SourceRegistry, SourceSpec

SYSTEM_PUBLISHER = "system"


async def _source_ids(uow: UnitOfWork, seed: NormSetSeed) -> dict[str, Any]:
    unknown = sorted({norm.source for norm in seed.norms} - {source.key for source in seed.sources})
    if unknown:
        raise SeedDataError(f"norms {seed.version}: unknown sources {unknown}")
    registry = SourceRegistry(uow)
    return {
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


async def seed_norms(uow: UnitOfWork, _: Settings) -> int:
    """Keeps the system norm set in sync with its YAML.

    Admin-published sets are never touched. Calculations store a snapshot of the norms they used, so editing
    the system set does not change past results.
    """
    seed = load_norm_set("v1")
    norm_set = await uow.session.scalar(select(NormSet).where(NormSet.version == seed.version))
    if norm_set is not None and norm_set.published_by != SYSTEM_PUBLISHER:
        return 0
    if norm_set is None:
        has_current = await uow.session.scalar(select(NormSet.id).where(NormSet.is_current.is_(True)))
        norm_set = NormSet(
            version=seed.version, notes=seed.notes, published_by=SYSTEM_PUBLISHER, is_current=not has_current
        )
        uow.session.add(norm_set)
        await uow.flush()
    source_ids = await _source_ids(uow, seed)
    rows = [
        {
            "norm_set_id": norm_set.id,
            "key": norm.key,
            "name": norm.name,
            "value": norm.value,
            "unit": norm.unit,
            "category": norm.category,
            "range_min": norm.range.min if norm.range else None,
            "range_max": norm.range.max if norm.range else None,
            "source_id": source_ids[norm.source],
            "rationale": norm.rationale,
            "affects": norm.affects,
            "editable_by_user": norm.editable_by_user,
            "object_types": [t.value for t in norm.object_types],
        }
        for norm in seed.norms
    ]
    natural_key = ["norm_set_id", "key"]
    statement = insert(Norm).values(rows)
    updated = {column: statement.excluded[column] for column in rows[0] if column not in natural_key}
    await uow.session.execute(statement.on_conflict_do_update(index_elements=natural_key, set_=updated))
    kept = [norm.key for norm in seed.norms]
    await uow.session.execute(delete(Norm).where(Norm.norm_set_id == norm_set.id, Norm.key.not_in(kept)))
    return len(rows)
