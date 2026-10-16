from collections.abc import Sequence

from app.db.models import Norm, NormSet
from app.db.repositories.reference import ReferenceRepository
from app.db.uow import UnitOfWork
from app.domain.admin import next_norm_version

_COLUMNS = (
    "key",
    "name",
    "value",
    "unit",
    "category",
    "range_min",
    "range_max",
    "source_id",
    "rationale",
    "affects",
    "editable_by_user",
    "object_types",
)


async def complete_current_norm_set(uow: UnitOfWork, system_norms: Sequence[Norm]) -> int:
    """Add new model inputs in a new revision; never overwrite the administrator's existing assumptions."""
    repo = ReferenceRepository(uow.session)
    current = await repo.norm_set(None)
    if current is None:
        return 0
    existing = list(await repo.norms(current.id, None, None))
    keys = {norm.key for norm in existing}
    missing = [norm for norm in system_norms if norm.key not in keys]
    if not missing:
        return 0
    revision = NormSet(
        version=next_norm_version(current.version, await repo.norm_set_versions()),
        published_by="system:upgrade",
        notes=f"Дополнение модели к {current.version}: " + ", ".join(norm.key for norm in missing),
    )
    copied = [
        Norm(**{column: getattr(norm, column) for column in _COLUMNS}) for norm in [*existing, *missing]
    ]
    await repo.publish_norm_set(revision, copied)
    return len(missing)
