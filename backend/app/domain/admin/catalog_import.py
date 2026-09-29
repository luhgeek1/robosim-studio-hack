from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any
from uuid import UUID

# Organizer's classification of a row: «Тип», «Подтип» (synonyms merged) and the short «тип» (brs, bas).
CatalogKeys = tuple[str | None, str | None, str | None]
# From the most specific to the broadest: category + subtype, subtype, category, the short kind.
_LEVELS: tuple[tuple[int, ...], ...] = ((0, 1), (1,), (0,), (2,))

_FIELDS: dict[str, str] = {
    "name": "Название",
    "manufacturer": "Производитель",
    "catalog_category": "Категория",
    "subtype": "Подтип",
    "status": "Стадия",
    "trl": "УГТ",
    "market_potential": "Рыночный потенциал",
    "price_from_rub": "Цена от, ₽",
    "offers": "Предложения (отрасль, сценарий, цена)",
    "description": "Описание",
}
# Long text is reported as changed without echoing both versions.
_TEXT_ONLY = frozenset({"description"})


class ImportAction(StrEnum):
    CREATED = "created"
    UPDATED = "updated"
    UNCHANGED = "unchanged"
    CONFLICT = "conflict"


@dataclass(frozen=True, slots=True)
class FieldChange:
    field: str
    label: str
    before: str | float | None
    after: str | float | None


@dataclass(frozen=True, slots=True)
class ImportItem:
    product_id: UUID
    name: str
    action: ImportAction
    row: int
    solution_type: str | None = None
    reason: str | None = None
    changes: tuple[FieldChange, ...] = ()
    new_offers: int = 0


@dataclass(frozen=True, slots=True)
class ImportRowError:
    row: int
    message: str


@dataclass(frozen=True, slots=True)
class CatalogImportReport:
    dry_run: bool
    catalog_version: str
    items: list[ImportItem]
    errors: list[ImportRowError] = field(default_factory=list)
    skipped: int = 0
    not_in_file: int = 0

    def count(self, action: ImportAction) -> int:
        return sum(1 for item in self.items if item.action == action)

    @property
    def offers_created(self) -> int:
        return sum(item.new_offers for item in self.items if item.action != ImportAction.CONFLICT)


def infer_solution_type(keys: CatalogKeys, known: Iterable[tuple[CatalogKeys, str]]) -> str | None:
    """Solution type of a new product by how the same file classifies products already in the catalog.

    The most specific organizer classification wins, and only when every known product with it has one
    solution type; an ambiguous or unseen classification returns None — the admin adds such a product by hand.
    """
    pairs = list(known)
    for level in _LEVELS:
        probe = tuple(keys[i] for i in level)
        if any(part is None for part in probe):
            continue
        types = {kind for other, kind in pairs if tuple(other[i] for i in level) == probe}
        if len(types) == 1:
            return types.pop()
    return None


def field_changes(current: Mapping[str, Any], planned: Mapping[str, Any]) -> list[FieldChange]:
    """What the file changes in a product card, in the order an admin reads the card."""
    changes: list[FieldChange] = []
    for key, label in _FIELDS.items():
        before, after = current.get(key), planned.get(key)
        if before == after:
            continue
        if key == "offers":
            # The count tells the admin rows were added or dropped; a repriced row shows only as «changed».
            counts = float(len(before or ())), float(len(after or ()))
            changes.append(FieldChange(key, label, *(counts if counts[0] != counts[1] else (None, None))))
        elif key in _TEXT_ONLY:
            changes.append(FieldChange(key, label, None, None))
        else:
            changes.append(FieldChange(key, label, _scalar(before), _scalar(after)))
    return changes


def _scalar(value: Any) -> str | float | None:
    if value is None or isinstance(value, str):
        return value
    return float(value)
