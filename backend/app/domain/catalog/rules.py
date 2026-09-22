from collections.abc import Iterable, Sequence
from uuid import UUID

from app.domain.catalog.models import Badge, SpecValue
from app.domain.common.provenance import ProvenanceStatus

BASE_COMPLETENESS_FIELDS = ("description", "price")

_FILLED = frozenset(
    {
        ProvenanceStatus.CONFIRMED,
        ProvenanceStatus.VENDOR_CLAIM,
        ProvenanceStatus.DERIVED,
        ProvenanceStatus.USER,
    }
)


def primary_specs(specs: Iterable[SpecValue]) -> dict[str, SpecValue]:
    return {spec.key: spec for spec in specs if spec.is_primary}


def _is_filled(spec: SpecValue | None) -> bool:
    return spec is not None and spec.value is not None and spec.provenance.status in _FILLED


def completeness(
    capability_keys: Sequence[str], specs: dict[str, SpecValue], *, has_description: bool, has_price: bool
) -> float:
    """Share of filled card fields: key specs of the solution type plus description and price.

    Assumptions (ProvenanceStatus.ASSUMPTION) do not count: they are placeholders, not data about the product.
    """
    filled = sum(_is_filled(specs.get(key)) for key in capability_keys) + has_description + has_price
    total = len(capability_keys) + len(BASE_COMPLETENESS_FIELDS)
    return round(filled / total, 3)


def derived_badges(
    assigned: Iterable[Badge],
    *,
    country: str,
    has_cases: bool,
    capability_keys: Sequence[str],
    specs: dict[str, SpecValue],
) -> list[Badge]:
    badges = set(assigned)
    if country == "RU":
        badges.add(Badge.DOMESTIC)
    if has_cases:
        badges.add(Badge.HAS_CASES)
    key_specs = [specs.get(key) for key in capability_keys]
    if key_specs and all(
        spec is not None and spec.provenance.status == ProvenanceStatus.CONFIRMED for spec in key_specs
    ):
        badges.add(Badge.SPECS_CONFIRMED)
    return sorted(badges)


def best_product(values: dict[UUID, SpecValue], better: str) -> UUID | None:
    """Product with the best numeric value; ``None`` when not comparable or tied."""
    numeric = {
        pid: float(v.value)
        for pid, v in values.items()
        if isinstance(v.value, int | float) and not isinstance(v.value, bool)
    }
    if better not in {"higher", "lower"} or len(numeric) < 2:
        return None
    pick = max if better == "higher" else min
    best_value = pick(numeric.values())
    winners = [pid for pid, value in numeric.items() if value == best_value]
    return winners[0] if len(winners) == 1 else None
