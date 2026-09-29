from collections.abc import Sequence

from app.core.errors import InvalidInputError, NotFoundError
from app.db.models import Norm, NormSet
from app.db.repositories.catalog_admin import CatalogAdminRepository
from app.db.repositories.reference import ReferenceRepository
from app.db.uow import UnitOfWork
from app.domain.admin import NormChange, next_norm_version, norm_in_range
from app.domain.reference import NormSetInfo

_COPIED = (
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


class NormPublisher:
    """Publishes a new norm set: a copy of the current one with the admin's changes (ТЗ 3.5.1, 3.5.8).

    Calculations stamp the norm set version, so every saved run on the old set becomes stale and a rerun
    shows the difference.
    """

    def __init__(self, uow: UnitOfWork, actor_email: str) -> None:
        self._actor = actor_email
        self._repo = ReferenceRepository(uow.session)
        self._sources = CatalogAdminRepository(uow.session)

    async def publish(self, notes: str, changes: Sequence[NormChange]) -> NormSetInfo:
        current = await self._repo.norm_set(None)
        if current is None:
            raise NotFoundError("Нет действующего набора нормативов")
        norms = {norm.key: _copy(norm) for norm in await self._repo.norms(current.id, None, None)}
        _check_changes(changes, norms)
        for change in changes:
            norm = norms[change.key]
            norm.value = change.value
            if change.source is not None:
                norm.source_id = (await self._sources.add_source(change.source)).id
            if change.rationale:
                norm.rationale = change.rationale
        version = next_norm_version(current.version, await self._repo.norm_set_versions())
        norm_set = NormSet(version=version, notes=notes, published_by=self._actor)
        await self._repo.publish_norm_set(norm_set, list(norms.values()))
        return NormSetInfo(
            version=norm_set.version,
            published_at=norm_set.published_at,
            published_by=norm_set.published_by,
            notes=norm_set.notes,
            norms_count=len(norms),
            is_current=True,
        )


def _copy(norm: Norm) -> Norm:
    return Norm(**{column: getattr(norm, column) for column in _COPIED})


def _check_changes(changes: Sequence[NormChange], norms: dict[str, Norm]) -> None:
    seen: set[str] = set()
    for change in changes:
        norm = norms.get(change.key)
        if norm is None:
            raise InvalidInputError(f"Норматив «{change.key}» не найден в текущем наборе")
        if change.key in seen:
            raise InvalidInputError(f"Норматив «{change.key}» изменён дважды")
        seen.add(change.key)
        if change.unit is not None and change.unit != norm.unit:
            raise InvalidInputError(f"Единица норматива «{norm.name}» — {norm.unit}, менять её нельзя")
        if not norm_in_range(change.value, norm.range_min, norm.range_max):
            raise InvalidInputError(
                f"«{norm.name}»: значение {change.value:g} вне допустимого диапазона "
                f"{_bound(norm.range_min)}…{_bound(norm.range_max)} {norm.unit}"
            )


def _bound(value: float | None) -> str:
    return "—" if value is None else f"{value:g}"
