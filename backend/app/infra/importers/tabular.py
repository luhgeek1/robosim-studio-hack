from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from app.infra.importers.collector import RawRow, cell_text, clean_unit
from app.infra.importers.matching import normalize

KEY_HEADERS = {"ключ", "key", "код", "код параметра"}
NAME_HEADERS = {"параметр", "parameter", "name", "наименование", "название", "показатель"}
VALUE_HEADERS = {"значение", "value", "базовое значение"}
UNIT_HEADERS = {"ед изм", "ед", "единица", "единица измерения", "unit", "units"}
HEADER_SCAN_ROWS = 10
_NAME_VALUE_WIDTH = 2
_NAME_UNIT_VALUE_WIDTH = 3


@dataclass(frozen=True, slots=True)
class Columns:
    value: int
    name: int | None = None
    key: int | None = None
    unit: int | None = None


def _find(headers: list[str], aliases: set[str]) -> int | None:
    return next((index for index, header in enumerate(headers) if header in aliases), None)


def detect_columns(cells: Sequence[Any]) -> Columns | None:
    headers = [normalize(cell_text(cell)) for cell in cells]
    value = _find(headers, VALUE_HEADERS)
    name, key = _find(headers, NAME_HEADERS), _find(headers, KEY_HEADERS)
    if value is None or (name is None and key is None):
        return None
    return Columns(value=value, name=name, key=key, unit=_find(headers, UNIT_HEADERS))


def default_columns(width: int) -> Columns:
    """No header row: ``name | value`` or the organizer layout ``name | unit | value | …``."""
    if width >= _NAME_UNIT_VALUE_WIDTH:
        return Columns(name=0, unit=1, value=2)
    return Columns(name=0, value=1)


def _cell(cells: Sequence[Any], index: int | None) -> Any:
    return cells[index] if index is not None and index < len(cells) else None


def _to_row(cells: Sequence[Any], columns: Columns, location: str) -> RawRow | None:
    name, key = cell_text(_cell(cells, columns.name)), cell_text(_cell(cells, columns.key))
    label = name or key
    if not label:
        return None
    value = _cell(cells, columns.value)
    if isinstance(value, str):
        value = value.strip()
    return RawRow(label, value, clean_unit(_cell(cells, columns.unit)), location, key or None)


def table_rows(table: list[Sequence[Any]], place: str, warnings: list[str]) -> list[RawRow]:
    """``place`` prefixes row locations in warnings, e.g. «Лист «Склад», строка 4»."""
    start, columns = 0, None
    for index, cells in enumerate(table[:HEADER_SCAN_ROWS]):
        columns = detect_columns(cells)
        if columns is not None:
            start = index + 1
            break
    if columns is None:
        width = max((len(cells) for cells in table), default=0)
        if width < _NAME_VALUE_WIDTH:
            return []
        columns = default_columns(width)
        warnings.append(
            f"{place}: не найдена строка заголовков («Параметр», «Значение»), "
            "колонки определены по порядку: название, ед. изм., значение"
            if width >= _NAME_UNIT_VALUE_WIDTH
            else f"{place}: не найдена строка заголовков, колонки определены по порядку: название, значение"
        )
    rows = [
        _to_row(cells, columns, f"{place}, строка {start + offset + 1}")
        for offset, cells in enumerate(table[start:])
    ]
    return [row for row in rows if row is not None]
