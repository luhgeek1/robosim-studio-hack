from datetime import date

from app.domain.admin import next_catalog_version, next_norm_version, norm_in_range, spec_value_matches


def test_norm_version_minor_bump() -> None:
    assert next_norm_version("v1", {"v1"}) == "v1.1"
    assert next_norm_version("v1.1", {"v1", "v1.1"}) == "v1.2"
    assert next_norm_version("v1.9", {"v1.9"}) == "v1.10"


def test_norm_version_skips_taken_labels() -> None:
    assert next_norm_version("v1", {"v1", "v1.1", "v1.2"}) == "v1.3"


def test_catalog_version_counts_changes_within_a_day() -> None:
    today = date(2026, 9, 29)
    assert next_catalog_version(None, today) == "2026-09-29.1"
    assert next_catalog_version("2026-09-29.3", today) == "2026-09-29.4"
    assert next_catalog_version("2026-09-28.7", today) == "2026-09-29.1"


def test_spec_value_types() -> None:
    assert spec_value_matches("number", 1500)
    assert spec_value_matches("number", 1.5)
    assert not spec_value_matches("number", True)
    assert not spec_value_matches("number", "1500")
    assert spec_value_matches("boolean", False)
    assert not spec_value_matches("string", 3)


def test_norm_range_bounds_are_inclusive_and_optional() -> None:
    assert norm_in_range(0.7, 0.7, 0.85)
    assert not norm_in_range(0.9, 0.7, 0.85)
    assert norm_in_range(100.0, None, None)
