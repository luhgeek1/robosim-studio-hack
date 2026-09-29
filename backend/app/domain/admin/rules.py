from collections.abc import Collection
from datetime import date

from app.domain.admin.models import SpecScalar

_SPEC_TYPES: dict[str, tuple[type, ...]] = {"number": (int, float), "string": (str,), "boolean": (bool,)}


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
