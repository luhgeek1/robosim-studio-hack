from uuid import uuid4

from app.domain.catalog import Badge, SpecValue, best_product, completeness, derived_badges
from app.domain.common.provenance import Provenance, ProvenanceStatus
from app.domain.reference import SpecGroup


def spec(key: str, value: object, status: ProvenanceStatus = ProvenanceStatus.CONFIRMED) -> SpecValue:
    return SpecValue(key, key, SpecGroup.TECHNICAL, value, None, Provenance(status=status), True)  # type: ignore[arg-type]


def test_completeness_counts_key_specs_plus_description_and_price() -> None:
    specs = {
        "payload_kg": spec("payload_kg", 1500),
        "width_mm": spec("width_mm", 650, ProvenanceStatus.ASSUMPTION),
    }
    # 1 filled key spec of 2 + description + price = 3 of 4; an assumption is not data about the product
    assert completeness(["payload_kg", "width_mm"], specs, has_description=True, has_price=True) == 0.75


def test_badges_derived_from_data() -> None:
    specs = {"payload_kg": spec("payload_kg", 1500)}
    badges = derived_badges(
        [Badge.TESTED_FCBAS], country="RU", has_cases=True, capability_keys=["payload_kg"], specs=specs
    )
    assert badges == sorted([Badge.TESTED_FCBAS, Badge.DOMESTIC, Badge.HAS_CASES, Badge.SPECS_CONFIRMED])


def test_specs_confirmed_needs_every_key_spec_confirmed() -> None:
    specs = {"payload_kg": spec("payload_kg", 1500, ProvenanceStatus.VENDOR_CLAIM)}
    badges = derived_badges([], country="RU", has_cases=False, capability_keys=["payload_kg"], specs=specs)
    assert Badge.SPECS_CONFIRMED not in badges


def test_best_product_respects_direction_and_ties() -> None:
    a, b, c = uuid4(), uuid4(), uuid4()
    assert best_product({a: spec("x", 1500), b: spec("x", 800)}, "higher") == a
    assert best_product({a: spec("x", 1500), b: spec("x", 800)}, "lower") == b
    assert best_product({a: spec("x", 1), b: spec("x", 1)}, "higher") is None
    assert best_product({a: spec("x", 1), c: spec("x", True)}, "higher") is None
    assert best_product({a: spec("x", 1), b: spec("x", 2)}, "none") is None
