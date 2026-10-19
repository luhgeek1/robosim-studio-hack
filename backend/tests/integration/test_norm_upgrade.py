from typing import Any

import pytest
from sqlalchemy import select

from app.core.config import Settings
from app.db.models import Norm, NormSet
from app.db.repositories.reference import ReferenceRepository
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.admin import next_norm_version
from app.seeds.norms import seed_norms

pytestmark = pytest.mark.integration

_NORM_FIELDS = (
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
_MISSING = {"labor_cash_realization_share", "owner_discount_rate", "manual_tow_speed_mps"}


def _values(norm: Norm) -> dict[str, Any]:
    return {field: getattr(norm, field) for field in _NORM_FIELDS}


async def _upgrade_preserves_prior_revision(uow: UnitOfWork, settings: Settings) -> None:
    await seed_norms(uow, settings)
    repository = ReferenceRepository(uow.session)
    current = await repository.norm_set(None)
    assert current is not None
    system = {n.key: n for n in await repository.norms(current.id, None, None)}
    assert system.keys() >= _MISSING
    admin_norms = [Norm(**_values(norm)) for key, norm in system.items() if key not in _MISSING]
    edited = next(norm for norm in admin_norms if norm.key == "discount_rate")
    edited.value = 0.123
    edited.rationale = "Ставка утверждена администратором для проверки обновления"
    admin = NormSet(
        version=next_norm_version(current.version, await repository.norm_set_versions()),
        published_by="admin@robomera.demo",
        notes="Предыдущая полная версия, до появления новых параметров модели",
    )
    await repository.publish_norm_set(admin, admin_norms)
    before = {norm.key: {"id": norm.id, **_values(norm)} for norm in admin_norms}
    published_at = admin.published_at

    await seed_norms(uow, settings)
    upgraded = await repository.norm_set(None)
    assert upgraded is not None
    assert upgraded.id != admin.id
    assert upgraded.published_by == "system:upgrade"
    assert upgraded.version != admin.version
    assert not admin.is_current
    upgraded_norms = {norm.key: norm for norm in await repository.norms(upgraded.id, None, None)}
    assert upgraded_norms.keys() == system.keys()
    assert upgraded_norms["discount_rate"].value == pytest.approx(0.123)
    for key, prior in before.items():
        assert _values(upgraded_norms[key]) == {k: v for k, v in prior.items() if k != "id"}
    for key in _MISSING:
        assert _values(upgraded_norms[key]) == _values(system[key])
    previous = {n.key: {"id": n.id, **_values(n)} for n in await repository.norms(admin.id, None, None)}
    assert previous == before
    assert admin.published_by == "admin@robomera.demo"
    assert admin.published_at == published_at

    versions = await repository.norm_set_versions()
    await seed_norms(uow, settings)
    repeated = await repository.norm_set(None)
    assert repeated is not None
    assert repeated.id == upgraded.id
    assert await repository.norm_set_versions() == versions
    active = list(await uow.session.scalars(select(NormSet.id).where(NormSet.is_current.is_(True))))
    assert active == [upgraded.id]


async def test_norm_upgrade_preserves_admin_inputs_and_is_idempotent(settings: Settings) -> None:
    database = Database(settings)
    try:
        async with UnitOfWork(database.session()) as uow:
            original = set(await uow.session.scalars(select(NormSet.id)))
            try:
                await _upgrade_preserves_prior_revision(uow, settings)
            finally:
                # Rollback must restore every version and the current flag.
                await uow.rollback()
            restored = set(await uow.session.scalars(select(NormSet.id)))
            assert restored == original
    finally:
        await database.dispose()
