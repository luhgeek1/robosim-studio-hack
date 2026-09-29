from datetime import date

from app.domain.admin import (
    Freshness,
    default_problem,
    freshness,
    months_before,
    next_catalog_version,
    next_norm_version,
    norm_in_range,
    restamped_modes,
    spec_value_matches,
)
from app.domain.common.provenance import ProvenanceStatus
from app.domain.project.models import InitMode
from app.domain.reference import ParameterDef


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


def _param(kind: str, **kwargs: object) -> ParameterDef:
    values: dict[str, object] = {
        "key": "p",
        "name": "Параметр",
        "group": "g",
        "type": kind,
        "unit": None,
        "required": False,
        "min": None,
        "max": None,
        "step": None,
        "enum_values": [],
        "default": None,
        "hint": None,
        "example": None,
        "affects": [],
        "order": 0,
    }
    values.update(kwargs)
    return ParameterDef(**values)  # type: ignore[arg-type]


def test_default_is_checked_strictly_against_the_parameter() -> None:
    salary = _param("number", min=30_000, max=200_000, unit="₽/мес")
    assert default_problem(salary, 95_000) is None
    assert default_problem(salary, 250_000) is not None
    assert default_problem(salary, "95 000") is not None
    assert default_problem(_param("integer"), 2.5) is not None
    assert default_problem(_param("boolean"), 1) is not None
    listed = _param("enum", enum_values=[{"value": "rack", "label": "Стеллажи"}])
    assert default_problem(listed, "rack") is None
    assert default_problem(listed, "floor") is not None
    assert default_problem(_param("dimensions"), "1200×800×1600") is None
    assert default_problem(_param("dimensions"), "большая") is not None
    assert default_problem(_param("string"), "  ") is not None


def test_restamped_modes_follow_where_the_default_applies() -> None:
    default, assumption = ProvenanceStatus.DEFAULT, ProvenanceStatus.ASSUMPTION
    # A required demo value never reaches a blank project, so a blank project keeps its version.
    assert restamped_modes((10, default), (12, default), required=True) == [InitMode.DEMO, InitMode.COPY]
    assert restamped_modes((10, assumption), (12, assumption), required=True) == list(InitMode)
    assert restamped_modes((10, default), (10, default), required=True) == []
    # The same number turned into an assumption now fills blank projects too.
    assert restamped_modes((10, default), (10, assumption), required=True) == [InitMode.BLANK]
    assert restamped_modes((None, None), (5, assumption), required=False) == list(InitMode)


def test_months_before_clamps_to_month_length() -> None:
    assert months_before(date(2026, 9, 30), 12) == date(2025, 9, 30)
    assert months_before(date(2026, 3, 31), 1) == date(2026, 2, 28)
    assert months_before(date(2026, 1, 15), 3) == date(2025, 10, 15)


def test_freshness_by_cutoff() -> None:
    cutoff = date(2025, 9, 30)
    assert freshness(date(2025, 9, 30), cutoff) == Freshness.FRESH
    assert freshness(date(2025, 9, 29), cutoff) == Freshness.STALE
    assert freshness(None, cutoff) == Freshness.UNDATED
