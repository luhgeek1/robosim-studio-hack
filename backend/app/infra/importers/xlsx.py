from collections.abc import Sequence
from io import BytesIO
from typing import Any
from zipfile import BadZipFile

import openpyxl
from openpyxl.utils.exceptions import InvalidFileException
from openpyxl.workbook.workbook import Workbook

from app.infra.importers.collector import RawRow, build_import, cell_text, clean_unit
from app.infra.importers.matching import ParameterMatcher
from app.infra.importers.models import ImportFormatError, ImportSourceKind, ParsedImport
from app.infra.importers.tabular import table_rows
from app.infra.importers.template import (
    COLUMN_KEY,
    COLUMN_NAME,
    COLUMN_UNIT,
    COLUMN_VALUE,
    HEADER_ROW,
    META_MARKER_KEY,
    META_OBJECT_TYPE_KEY,
    META_SHEET,
    TEMPLATE_MARKER,
    TEMPLATE_SHEET,
)


def load_workbook(content: bytes) -> Workbook:
    try:
        return openpyxl.load_workbook(BytesIO(content), data_only=True)
    except (BadZipFile, InvalidFileException, KeyError, OSError, ValueError) as error:
        message = "Не удалось открыть файл Excel: он повреждён или сохранён не в формате .xlsx"
        raise ImportFormatError(message) from error


def _meta(workbook: Workbook) -> dict[str, str]:
    if META_SHEET not in workbook.sheetnames:
        return {}
    sheet = workbook[META_SHEET]
    pairs = [[*cells, None, None][:2] for cells in sheet.iter_rows(values_only=True)]
    return {cell_text(key): cell_text(value) for key, value in pairs}


def template_object_type(workbook: Workbook) -> str | None:
    meta = _meta(workbook)
    if meta.get(META_MARKER_KEY) != TEMPLATE_MARKER:
        return None
    return meta.get(META_OBJECT_TYPE_KEY) or None


def is_template(workbook: Workbook) -> bool:
    return _meta(workbook).get(META_MARKER_KEY) == TEMPLATE_MARKER and TEMPLATE_SHEET in workbook.sheetnames


def _sheet_table(workbook: Workbook, title: str) -> list[Sequence[Any]]:
    return [tuple(cells) for cells in workbook[title].iter_rows(values_only=True)]


def parse_template(workbook: Workbook, matcher: ParameterMatcher) -> ParsedImport:
    table = _sheet_table(workbook, TEMPLATE_SHEET)
    header = [cell_text(cell) for cell in table[HEADER_ROW - 1]] if table else []
    missing = [title for title in (COLUMN_KEY, COLUMN_VALUE) if title not in header]
    if missing:
        raise ImportFormatError(
            f"В шаблоне на листе «{TEMPLATE_SHEET}» нет колонок: {', '.join(missing)}. Скачайте шаблон заново"
        )
    key_at, value_at = header.index(COLUMN_KEY), header.index(COLUMN_VALUE)
    name_at = header.index(COLUMN_NAME) if COLUMN_NAME in header else None
    unit_at = header.index(COLUMN_UNIT) if COLUMN_UNIT in header else None
    rows: list[RawRow] = []
    for number, cells in enumerate(table[HEADER_ROW:], HEADER_ROW + 1):
        padded = list(cells) + [None] * len(header)
        key = cell_text(padded[key_at])
        if not key:
            continue  # group header rows have no key
        value = padded[value_at].strip() if isinstance(padded[value_at], str) else padded[value_at]
        location = f"Лист «{TEMPLATE_SHEET}», строка {number}"
        unit = clean_unit(padded[unit_at]) if unit_at is not None else None
        label = cell_text(padded[name_at]) if name_at is not None else key
        rows.append(RawRow(label or key, value, unit, location, key))
    return build_import(ImportSourceKind.XLSX_TEMPLATE, rows, matcher)


def _score(result: ParsedImport) -> float:
    return sum(item.confidence for item in result.mapped)


def parse_freeform(workbook: Workbook, matcher: ParameterMatcher) -> ParsedImport:
    candidates: list[tuple[str, ParsedImport]] = []
    for sheet in workbook.worksheets:
        if sheet.sheet_state != "visible":
            continue
        warnings: list[str] = []
        rows = table_rows(_sheet_table(workbook, sheet.title), f"Лист «{sheet.title}»", warnings)
        if rows:
            result = build_import(ImportSourceKind.XLSX_FREEFORM, rows, matcher, warnings)
            candidates.append((sheet.title, result))
    if not candidates:
        raise ImportFormatError("В файле Excel не найдено ни одной строки с параметрами")
    title, best = max(candidates, key=lambda item: _score(item[1]))
    skipped = [
        f"Лист «{other}» не загружен: выбран лист «{title}», где распознано больше параметров "
        f"({len(best.mapped)} против {len(result.mapped)})"
        for other, result in candidates
        if other != title
    ]
    return ParsedImport(best.source_kind, best.mapped, best.unmapped, [*best.warnings, *skipped])
