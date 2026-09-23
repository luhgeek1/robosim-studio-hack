from dataclasses import dataclass
from typing import Any

from app.core.parsing import first_number, parse_scalar
from app.domain.common.provenance import Scalar
from app.domain.reference import ParameterDef
from app.infra.importers.matching import EXACT_CONFIDENCE, Match, ParameterMatcher
from app.infra.importers.models import ImportSourceKind, MappedValue, ParsedImport, UnmappedField

_EMPTY_TEXTS = {"", "-", "—", "–"}
_NUMERIC_TYPES = {"number", "integer"}
_BOOLEAN_NUMBERS = {0: False, 1: True}


@dataclass(frozen=True, slots=True)
class RawRow:
    label: str
    value: Any
    unit: str | None
    location: str
    key: str | None = None


@dataclass(frozen=True, slots=True)
class _Candidate:
    index: int
    row: RawRow
    match: Match


class ValueConversionError(ValueError):
    pass


def cell_text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def clean_unit(value: Any) -> str | None:
    text = cell_text(value)
    return None if text in _EMPTY_TEXTS else text


def is_empty(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() in _EMPTY_TEXTS)


def _numeric(param: ParameterDef, raw: Any, warnings: list[str], location: str) -> Scalar:
    parsed = parse_scalar(raw)
    if isinstance(parsed, str) and (number := first_number(parsed)) is not None:
        warnings.append(f"{location}: значение «{parsed}» прочитано как {number:g} ({param.name})")
        parsed = number
    if isinstance(parsed, bool) or not isinstance(parsed, int | float):
        raise ValueConversionError(
            f"{location}: «{cell_text(raw)}» — не число, параметр «{param.name}» пропущен"
        )
    if param.type == "integer" and isinstance(parsed, float) and parsed.is_integer():
        return int(parsed)
    return parsed


def _boolean(param: ParameterDef, raw: Any, warnings: list[str], location: str) -> bool:
    parsed = parse_scalar(raw)
    if isinstance(parsed, bool):
        return parsed
    if isinstance(parsed, int | float) and parsed in _BOOLEAN_NUMBERS:
        return _BOOLEAN_NUMBERS[int(parsed)]
    if isinstance(parsed, str):
        # The organizer states a requirement instead of «Да»: «EASA/ИКАО», «Обязательно для Б-маршрутов».
        warnings.append(f"{location}: «{cell_text(raw)}» понято как «Да» — {param.name}")
        return True
    raise ValueConversionError(f"{location}: «{cell_text(raw)}» — ожидается «Да» или «Нет» ({param.name})")


def convert_value(param: ParameterDef, raw: Any, warnings: list[str], location: str) -> Scalar:
    if param.type in _NUMERIC_TYPES:
        return _numeric(param, raw, warnings, location)
    if param.type == "boolean":
        return _boolean(param, raw, warnings, location)
    return cell_text(raw)


def _resolve(row: RawRow, matcher: ParameterMatcher) -> tuple[Match | None, str | None]:
    if row.key:
        param = matcher.by_key(row.key)
        if param is not None:
            return Match(param, EXACT_CONFIDENCE), None
    resolution = matcher.resolve(row.label)
    return resolution.match, resolution.suggestion_key


def _mapped(candidate: _Candidate, warnings: list[str]) -> MappedValue | None:
    row, param = candidate.row, candidate.match.param
    try:
        value = convert_value(param, row.value, warnings, row.location)
    except ValueConversionError as error:
        warnings.append(str(error))
        return None
    return MappedValue(
        key=param.key,
        value=value,
        unit=row.unit,
        raw_field=row.label,
        raw_value=cell_text(row.value),
        confidence=candidate.match.confidence,
    )


def build_import(
    kind: ImportSourceKind,
    rows: list[RawRow],
    matcher: ParameterMatcher,
    warnings: list[str] | None = None,
) -> ParsedImport:
    notes = list(warnings or [])
    candidates: list[_Candidate] = []
    unmapped: list[UnmappedField] = []
    for index, row in enumerate(rows):
        if is_empty(row.value):
            continue
        match, suggestion = _resolve(row, matcher)
        if match is None:
            unmapped.append(UnmappedField(row.label, cell_text(row.value), suggestion))
        else:
            candidates.append(_Candidate(index, row, match))
    # Exact matches claim their keys before fuzzy ones, so a typo row can't steal a key from a correct row.
    chosen: dict[str, _Candidate] = {}
    for candidate in sorted(candidates, key=lambda item: (-item.match.confidence, item.index)):
        key = candidate.match.param.key
        if key in chosen:
            notes.append(
                f"{candidate.row.location}: «{candidate.row.label}» повторяет параметр «{key}», "
                f"оставлено значение из {chosen[key].row.location}"
            )
            continue
        chosen[key] = candidate
    mapped = [_mapped(item, notes) for item in sorted(chosen.values(), key=lambda item: item.index)]
    return ParsedImport(kind, [item for item in mapped if item is not None], unmapped, notes)
