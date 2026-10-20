import math
import re
from difflib import get_close_matches
from typing import Any

from app.core.errors import DomainError, ParamsInvalidError
from app.core.parsing import parse_dimensions, parse_scalar
from app.domain.common.units import normalize_unit
from app.domain.project.models import ValidationState
from app.domain.project.params import validate_value
from app.domain.reference import ParameterDef
from app.service.projects.params import ParamChange, coerce

_NUMBER_WITH_UNIT = re.compile(r"^([+−-]?\d[\d\s\u00a0\u202f]*(?:[.,]\d+)?)\s*([^\d\s].*)?$")
_DIMENSIONS = re.compile(r"\d+(?:[.,]\d+)?(?:\s*[x×х*]\s*\d+(?:[.,]\d+)?){1,2}", re.I)
# Explicit requirements in the organizer workbook, not a general interpretation of arbitrary text.
_REQUIREMENTS = {"easa/икао", "обязательно для б-маршрутов"}


def issue(code: str, message: str, how_to_fix: str, severity: str = "error") -> dict[str, str]:
    return {"code": code, "message": message, "how_to_fix": how_to_fix, "severity": severity}


def _number(raw: Any) -> tuple[Any, str | None]:
    if not isinstance(raw, str):
        return raw, None
    cleaned = raw.replace("\u00a0", " ").replace("\u202f", " ").strip()
    parsed = parse_scalar(cleaned)
    if isinstance(parsed, int | float):
        return parsed, None
    match = _NUMBER_WITH_UNIT.fullmatch(cleaned)
    if match is None:
        return parse_scalar(cleaned), None
    number, suffix = match.groups()
    return parse_scalar(number), suffix


def _enum_suggestion(definition: ParameterDef, value: Any) -> Any:
    labels = {item["label"].lower(): item["value"] for item in definition.enum_values}
    labels.update({item["value"].lower(): item["value"] for item in definition.enum_values})
    matches = get_close_matches(str(value).strip().lower(), labels, n=2, cutoff=0.8)
    values = {labels[label] for label in matches}
    return values.pop() if len(values) == 1 else None


def check_value(definition: ParameterDef, raw: Any, unit: str | None) -> dict[str, Any]:
    value, embedded = _number(raw) if definition.type in {"integer", "number"} else (raw, None)
    issues: list[dict[str, str]] = []
    suggestion = None
    if definition.type == "boolean":
        value = parse_scalar(value)
        if isinstance(value, int | float) and value in {0, 1}:
            value = bool(value)
        if isinstance(value, str) and value.lower() in _REQUIREMENTS:
            value = True
            issues.append(
                issue("REQUIREMENT", "Требование прочитано как «Да»", "Проверьте требование", "warning")
            )
    if isinstance(value, float) and not math.isfinite(value):
        return {
            "value": str(raw),
            "issues": [
                issue("NOT_FINITE", "Ожидается конечное число", "Введите число вместо NaN или бесконечности")
            ],
            "suggestion": None,
        }
    if embedded:
        return _embedded_unit(definition, raw, value, unit, embedded)
    try:
        converted = _finite_value(definition, value, unit)
    except DomainError as exc:
        issues.append(issue("INVALID_VALUE", exc.detail, "Исправьте значение или единицу измерения"))
        proposed = _enum_suggestion(definition, raw) if definition.type == "enum" else None
        if proposed is not None:
            suggestion = {
                "key": definition.key,
                "value": proposed,
                "unit": definition.unit,
                "message": "Исправить опечатку в варианте списка",
            }
        return {"value": raw, "issues": issues, "suggestion": suggestion}
    if converted is None or converted == "":
        issues.append(issue("EMPTY_VALUE", "Значение не заполнено", "Введите значение или исключите строку"))
    if definition.type == "dimensions":
        dimensions = parse_dimensions(str(converted))
        if (
            _DIMENSIONS.fullmatch(str(converted)) is None
            or not dimensions
            or any(v is not None and v <= 0 for v in dimensions)
        ):
            issues.append(
                issue(
                    "DIMENSIONS_FORMAT",
                    "Некорректные габариты",
                    "Введите положительные размеры через ×, например 1200×800×1600",
                )
            )
    check = validate_value(definition, converted)
    if check.status == ValidationState.WARNING:
        issues.append(
            issue(
                check.code or "RANGE",
                check.message or "Проверьте значение",
                check.how_to_fix or "Уточните исходные данные",
                "warning",
            )
        )
    if unit and normalize_unit(unit) != normalize_unit(definition.unit):
        issues.append(
            issue(
                "UNIT_CONVERTED",
                f"Значение переведено из «{unit}» в «{definition.unit}»",
                "Проверьте результат перевода",
                "info",
            )
        )
    return {"value": converted, "unit": definition.unit, "issues": issues, "suggestion": suggestion}


def _embedded_unit(
    definition: ParameterDef, raw: Any, value: Any, unit: str | None, embedded: str
) -> dict[str, Any]:
    issues: list[dict[str, str]] = []
    suggestion = None
    try:
        converted = _finite_value(definition, value, embedded)
    except DomainError:
        issues.append(
            issue(
                "VALUE_FORMAT",
                "Не удалось прочитать число с единицей",
                "Введите число и укажите единицу отдельно",
            )
        )
    else:
        if unit and normalize_unit(unit) != normalize_unit(embedded):
            issues.append(
                issue(
                    "UNIT_CONFLICT",
                    f"В значении указано «{embedded}», в колонке — «{unit}»",
                    "Уточните единицу: они противоречат друг другу",
                )
            )
        else:
            suggestion = {
                "key": definition.key,
                "value": converted,
                "unit": definition.unit,
                "message": "Отделить единицу и привести число к единице параметра",
            }
            issues.append(
                issue(
                    "EMBEDDED_UNIT",
                    "Единица записана внутри значения",
                    "Примените предложенное исправление или введите число",
                )
            )
    return {"value": str(raw), "issues": issues, "suggestion": suggestion}


def _finite_value(definition: ParameterDef, value: Any, unit: str | None) -> Any:
    converted = coerce(definition, ParamChange(definition.key, value, unit))
    if isinstance(converted, float) and not math.isfinite(converted):
        raise ParamsInvalidError("После перевода единиц получилось бесконечное число")
    return converted
