import csv
import io
import json
from collections import Counter
from collections.abc import Sequence
from pathlib import PurePath
from typing import Any

from app.domain.reference import ParameterDef
from app.infra.importers.collector import RawRow, build_import, cell_text, clean_unit
from app.infra.importers.matching import ParameterMatcher, normalize
from app.infra.importers.models import ImportFormatError, ImportSourceKind, ParsedImport
from app.infra.importers.tabular import KEY_HEADERS, NAME_HEADERS, UNIT_HEADERS, VALUE_HEADERS, table_rows
from app.infra.importers.xlsx import is_template, load_workbook, parse_freeform, parse_template

XLSX_EXTENSIONS = {".xlsx", ".xlsm"}
CSV_EXTENSIONS = {".csv", ".tsv", ".txt"}
JSON_EXTENSIONS = {".json"}
CSV_DELIMITERS = ";,\t"
CSV_ENCODINGS = ("utf-8-sig", "cp1251")
CSV_SNIFF_LINES = 50
_ZIP_SIGNATURE = b"PK\x03\x04"
_JSON_STARTS = ("{", "[")
_UNSUPPORTED = (
    "Неподдерживаемый формат файла «{name}». Загрузите шаблон Excel (.xlsx), таблицу Excel с колонками "
    "«Параметр» и «Значение», CSV или JSON"
)


def _detect_kind(content: bytes, filename: str) -> str:
    suffix = PurePath(filename).suffix.lower()
    if suffix in XLSX_EXTENSIONS:
        return "xlsx"
    if suffix in CSV_EXTENSIONS:
        return "csv"
    if suffix in JSON_EXTENSIONS:
        return "json"
    if not suffix and content.startswith(_ZIP_SIGNATURE):
        return "xlsx"
    if not suffix and content.lstrip().decode("utf-8", "ignore").startswith(_JSON_STARTS):
        return "json"
    raise ImportFormatError(_UNSUPPORTED.format(name=filename))


def _decode(content: bytes) -> str:
    for encoding in CSV_ENCODINGS:
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ImportFormatError("Не удалось определить кодировку CSV: сохраните файл в UTF-8")


def _delimiter_score(lines: list[str], delimiter: str) -> tuple[float, int]:
    widths = [len(cells) for cells in csv.reader(lines, delimiter=delimiter)]
    modal, hits = Counter(widths).most_common(1)[0]
    return (hits / len(widths) if modal > 1 else 0.0), modal


def _delimiter(text: str) -> str:
    """The delimiter that splits most lines into the same number (≥2) of fields.

    csv.Sniffer is not used: it prefers «,» on ties, and decimal commas in «;»-files fool it.
    """
    lines = [line for line in text.splitlines()[:CSV_SNIFF_LINES] if line.strip()]
    if not lines:
        return CSV_DELIMITERS[0]
    return max(CSV_DELIMITERS, key=lambda delimiter: _delimiter_score(lines, delimiter))


def _parse_csv(content: bytes, matcher: ParameterMatcher) -> ParsedImport:
    text = _decode(content)
    if not text.strip():
        raise ImportFormatError("CSV-файл пустой")
    table: list[Sequence[Any]] = list(csv.reader(io.StringIO(text), delimiter=_delimiter(text)))
    warnings: list[str] = []
    rows = table_rows(table, "CSV", warnings)
    return build_import(ImportSourceKind.CSV, rows, matcher, warnings)


def _json_raw(value: Any) -> Any:
    if isinstance(value, bool):
        return "Да" if value else "Нет"
    if isinstance(value, dict | list):
        return json.dumps(value, ensure_ascii=False)
    return value


def _pick(item: dict[str, Any], aliases: set[str]) -> Any:
    return next((value for field, value in item.items() if normalize(field) in aliases), None)


def _json_item_row(item: Any, number: int, warnings: list[str]) -> RawRow | None:
    location = f"JSON, элемент {number}"
    if not isinstance(item, dict):
        warnings.append(f"{location}: ожидается объект с полями key и value, элемент пропущен")
        return None
    key, name = cell_text(_pick(item, KEY_HEADERS)), cell_text(_pick(item, NAME_HEADERS))
    if not key and not name:
        warnings.append(f"{location}: нет поля key или name, элемент пропущен")
        return None
    value = _json_raw(_pick(item, VALUE_HEADERS))
    return RawRow(name or key, value, clean_unit(_pick(item, UNIT_HEADERS)), location, key or None)


def _json_field_row(field: str, value: Any) -> RawRow:
    location = f"JSON, поле «{field}»"
    if isinstance(value, dict) and _pick(value, VALUE_HEADERS) is not None:
        unit = clean_unit(_pick(value, UNIT_HEADERS))
        return RawRow(field, _json_raw(_pick(value, VALUE_HEADERS)), unit, location, field)
    return RawRow(field, _json_raw(value), None, location, field)


def _json_rows(data: Any, warnings: list[str]) -> list[RawRow]:
    if isinstance(data, dict):
        return [_json_field_row(str(field), value) for field, value in data.items()]
    if isinstance(data, list):
        rows = [_json_item_row(item, number, warnings) for number, item in enumerate(data, 1)]
        return [row for row in rows if row is not None]
    raise ImportFormatError("JSON должен быть объектом {ключ: значение} или списком [{key, value, unit}]")


def _parse_json(content: bytes, matcher: ParameterMatcher) -> ParsedImport:
    try:
        data = json.loads(_decode(content))
    except json.JSONDecodeError as error:
        message = f"Файл не является корректным JSON: строка {error.lineno}, {error.msg}"
        raise ImportFormatError(message) from error
    warnings: list[str] = []
    rows = _json_rows(data, warnings)
    return build_import(ImportSourceKind.JSON, rows, matcher, warnings)


def parse_file(content: bytes, filename: str, parameters: list[ParameterDef]) -> ParsedImport:
    """Map an uploaded file onto object-type parameters.

    Raises ImportFormatError only when the file as a whole can't be read; bad rows become warnings.
    """
    matcher = ParameterMatcher(parameters)
    kind = _detect_kind(content, filename)
    if kind == "csv":
        return _parse_csv(content, matcher)
    if kind == "json":
        return _parse_json(content, matcher)
    workbook = load_workbook(content)
    try:
        if is_template(workbook):
            return parse_template(workbook, matcher)
        return parse_freeform(workbook, matcher)
    finally:
        workbook.close()
