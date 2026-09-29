from calendar import monthrange
from collections.abc import Collection
from datetime import date

from app.core.parsing import parse_dimensions
from app.domain.admin.models import Freshness, SpecScalar
from app.domain.common.provenance import ProvenanceStatus
from app.domain.project.models import InitMode, ValidationState
from app.domain.project.params import default_applies, validate_value
from app.domain.reference import ParameterDef

_SPEC_TYPES: dict[str, tuple[type, ...]] = {"number": (int, float), "string": (str,), "boolean": (bool,)}
_TEXT_TYPES = frozenset({"string", "dimensions"})
MONTHS_PER_YEAR = 12


def next_norm_version(current: str, taken: Collection[str]) -> str:
    """Minor bump of the current set: «v1» → «v1.1», «v1.1» → «v1.2»; skips labels already published."""
    base, dot, minor = current.rpartition(".")
    if dot and minor.isdigit():
        stem, number = base, int(minor) + 1
    else:
        stem, number = current, 1
    while f"{stem}.{number}" in taken:
        number += 1
    return f"{stem}.{number}"


def spec_value_matches(value_type: str, value: SpecScalar) -> bool:
    """bool is an int in Python, so a number spec must reject True/False explicitly."""
    if value_type == "number" and isinstance(value, bool):
        return False
    return isinstance(value, _SPEC_TYPES.get(value_type, (object,)))


def norm_in_range(value: float, low: float | None, high: float | None) -> bool:
    return (low is None or value >= low) and (high is None or value <= high)


def next_catalog_version(current: str | None, today: date) -> str:
    """Same «YYYY-MM-DD.N» label as the catalog seed: N counts catalog changes within one day."""
    day = f"{today:%Y-%m-%d}"
    current_day, _, revision = (current or "").partition(".")
    number = int(revision) + 1 if current_day == day and revision.isdigit() else 1
    return f"{day}.{number}"


def default_problem(definition: ParameterDef, value: SpecScalar) -> str | None:
    """Why a value cannot be the reference default of this parameter, or None.

    The same checks as a project value (type, list, range), but stricter: a project value outside the typical
    range only warns, while a default outside it would put that warning into every project relying on it.
    """
    if definition.type in _TEXT_TYPES:
        if not isinstance(value, str) or not value.strip():
            return "Ожидается непустой текст"
        if definition.type == "dimensions" and parse_dimensions(value) is None:
            return "Ожидаются габариты вида «1200×800×1600»"
        return None
    check = validate_value(definition, value)
    return None if check.status == ValidationState.OK else check.message


def restamped_modes(
    before: tuple[SpecScalar | None, ProvenanceStatus | None],
    after: tuple[SpecScalar, ProvenanceStatus],
    required: bool,
) -> list[InitMode]:
    """Project modes whose effective value changes with the new default (see ``default_applies``).

    Projects of these modes without their own value get a new version: saved calculations become stale and
    a rerun names the parameter in its diff.
    """
    (old_value, old_status), (new_value, new_status) = before, after
    modes: list[InitMode] = []
    for mode in InitMode:
        was = old_status is not None and default_applies(old_status, required, mode)
        now = default_applies(new_status, required, mode)
        if was != now or (now and old_value != new_value):
            modes.append(mode)
    return modes


def months_before(day: date, months: int) -> date:
    """The same day ``months`` calendar months earlier, clamped to the month's length (31.03 − 1 → 28.02)."""
    index = day.year * MONTHS_PER_YEAR + day.month - 1 - months
    year, month = divmod(index, MONTHS_PER_YEAR)
    return date(year, month + 1, min(day.day, monthrange(year, month + 1)[1]))


def freshness(retrieved_at: date | None, cutoff: date) -> Freshness:
    """A source retrieved before the cutoff is stale; one without a date cannot be checked (ТЗ 3.3.4)."""
    if retrieved_at is None:
        return Freshness.UNDATED
    return Freshness.STALE if retrieved_at < cutoff else Freshness.FRESH
