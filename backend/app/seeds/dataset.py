from dataclasses import dataclass
from pathlib import Path
from typing import Any

import openpyxl

from app.core.parsing import parse_scalar

DATASET_FILE = "case/dataset/Датасеты_хакатон.xlsx"
_HEADER_ROWS = 2
_SECTION_MARK = "▌"


@dataclass(frozen=True, slots=True)
class DatasetRow:
    sheet: str
    row: int
    name: str
    unit: str | None
    value: Any
    raw_value: str | None
    min: float | None
    max: float | None
    note: str | None


def _number(value: Any) -> float | None:
    parsed = parse_scalar(value)
    return float(parsed) if isinstance(parsed, int | float) and not isinstance(parsed, bool) else None


def read_dataset(data_root: Path) -> dict[str, dict[str, DatasetRow]]:
    """Sheet → parameter name → row. Formula cells come with their cached values (``data_only``)."""
    workbook = openpyxl.load_workbook(data_root / DATASET_FILE, data_only=True, read_only=True)
    sheets: dict[str, dict[str, DatasetRow]] = {}
    for sheet in workbook.worksheets:
        rows: dict[str, DatasetRow] = {}
        for index, cells in enumerate(
            sheet.iter_rows(min_row=_HEADER_ROWS + 1, values_only=True), _HEADER_ROWS + 1
        ):
            name = str(cells[0]).strip() if cells and cells[0] is not None else ""
            if not name or name.startswith(_SECTION_MARK):
                continue
            unit, value, low, high, note = (list(cells[1:6]) + [None] * 5)[:5]
            rows[name] = DatasetRow(
                sheet=sheet.title,
                row=index,
                name=name,
                unit=str(unit).strip() if unit not in (None, "-") else None,
                value=parse_scalar(value),
                raw_value=None if value is None else str(value),
                min=_number(low),
                max=_number(high),
                note=str(note).strip() if note else None,
            )
        sheets[sheet.title] = rows
    workbook.close()
    return sheets
