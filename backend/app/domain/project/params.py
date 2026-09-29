from collections.abc import Iterable, Mapping, Sequence

from app.core.parsing import parse_dimensions
from app.domain.common.provenance import Provenance, ProvenanceStatus, Scalar
from app.domain.project.models import (
    Blocks,
    DataQualityItem,
    DataQualitySummary,
    EffectiveParam,
    InitMode,
    ParamValidation,
    Severity,
    StoredParam,
    ValidationIssue,
    ValidationReport,
    ValidationState,
)
from app.domain.reference import ParameterDef

PERCENT_UNIT = "%"
_PERCENT_BASE = 100.0
DIMENSION_PARTS = ("length", "width", "height")
_ALL_STAGES = (Blocks.MATCHING, Blocks.CALCULATION, Blocks.SIMULATION, Blocks.REPORT)
_TRUSTED = frozenset(
    {ProvenanceStatus.USER, ProvenanceStatus.IMPORTED, ProvenanceStatus.CONFIRMED, ProvenanceStatus.DERIVED}
)


def _missing(definition: ParameterDef) -> ParamValidation:
    if definition.required:
        return ParamValidation(
            ValidationState.MISSING,
            "REQUIRED_MISSING",
            f"Не заполнен обязательный параметр «{definition.name}»",
            f"Введите значение{f' (например, {definition.example})' if definition.example else ''}",
        )
    # An optional empty field is not an error, but it is not «ok» either: the form shows it as not filled.
    return ParamValidation(ValidationState.MISSING)


def _type_error(definition: ParameterDef, value: Scalar) -> ParamValidation | None:
    numeric = definition.type in {"number", "integer"}
    if numeric and (isinstance(value, bool) or not isinstance(value, int | float)):
        return ParamValidation(
            ValidationState.ERROR, "TYPE_MISMATCH", "Ожидается число", "Введите число без единиц"
        )
    if definition.type == "integer" and isinstance(value, float) and not value.is_integer():
        return ParamValidation(
            ValidationState.ERROR, "TYPE_MISMATCH", "Ожидается целое число", "Округлите значение"
        )
    if definition.type == "boolean" and not isinstance(value, bool):
        return ParamValidation(ValidationState.ERROR, "TYPE_MISMATCH", "Ожидается «да» или «нет»", None)
    if definition.type == "enum":
        allowed = {item["value"] for item in definition.enum_values}
        if value not in allowed:
            labels = ", ".join(item["label"] for item in definition.enum_values)
            return ParamValidation(
                ValidationState.ERROR, "ENUM_UNKNOWN", "Значение не из списка", f"Выберите: {labels}"
            )
    return None


def _format(number: float) -> str:
    return f"{number:,.10g}".replace(",", " ")


def validate_value(definition: ParameterDef, value: Scalar) -> ParamValidation:
    if value is None or value == "":
        return _missing(definition)
    if (error := _type_error(definition, value)) is not None:
        return error
    if isinstance(value, int | float) and not isinstance(value, bool):
        low, high = definition.min, definition.max
        # The typical range only warns, but a negative count, area or duration is impossible, not unusual.
        if value < 0 and low is not None and low >= 0:
            return ParamValidation(
                ValidationState.ERROR,
                "NEGATIVE_VALUE",
                "Значение не может быть отрицательным",
                f"Введите число от {_format(low)}",
            )
        if (low is not None and value < low) or (high is not None and value > high):
            unit = f" {definition.unit}" if definition.unit else ""
            bounds = (
                f"{_format(low) if low is not None else '…'}–{_format(high) if high is not None else '…'}"
            )
            return ParamValidation(
                ValidationState.WARNING,
                "RANGE_EXCEEDED",
                f"Значение {_format(value)}{unit} вне типичного диапазона {bounds}{unit}",
                "Проверьте единицы измерения и период (сутки, смена, год)",
            )
    return ParamValidation(ValidationState.OK)


def default_applies(status: ProvenanceStatus, required: bool, mode: InitMode) -> bool:
    """Whether a reference default fills an empty field of a project created in this mode.

    The organizer's demo values (status ``default``) of required parameters describe one particular facility,
    so a blank project does not take them; assumption defaults apply in every project.
    """
    return not (status == ProvenanceStatus.DEFAULT and required and mode == InitMode.BLANK)


def resolve(definition: ParameterDef, stored: StoredParam | None, mode: InitMode) -> EffectiveParam:
    """Effective value of a parameter: stored > default > missing (see ``default_applies``)."""
    if stored is not None:
        return EffectiveParam(
            definition,
            stored.value,
            stored.unit,
            stored.provenance,
            validate_value(definition, stored.value),
            stored.history_count,
        )
    default = definition.default
    if default is None or not default_applies(default.provenance.status, definition.required, mode):
        return EffectiveParam(
            definition,
            None,
            definition.unit,
            Provenance(status=ProvenanceStatus.MISSING),
            _missing(definition),
        )
    return EffectiveParam(
        definition, default.value, default.unit, default.provenance, validate_value(definition, default.value)
    )


def resolve_all(
    definitions: Sequence[ParameterDef], stored: Mapping[str, StoredParam], mode: InitMode
) -> list[EffectiveParam]:
    return [resolve(definition, stored.get(definition.key), mode) for definition in definitions]


def _enum_number(definition: ParameterDef, value: Scalar) -> float | None:
    """A list value takes part in formulas only if the reference data gives it a number (lift API: yes 1)."""
    item = next((i for i in definition.enum_values if i.get("value") == value), None)
    number = item.get("number") if item else None
    return float(number) if number is not None else None


_DIMENSION_NAMES = {"length": "длина", "width": "ширина", "height": "высота"}


def input_names(params: Iterable[EffectiveParam]) -> list[tuple[str, str, str | None, EffectiveParam]]:
    """Every name a formula can read, with its label and unit: a dimensions parameter gives three."""
    names: list[tuple[str, str, str | None, EffectiveParam]] = []
    for param in params:
        definition = param.definition
        if definition.type == "dimensions":
            for part in DIMENSION_PARTS:
                label = f"{definition.name} — {_DIMENSION_NAMES[part]}"
                names.append((f"{param.key}_{part}", label, definition.unit, param))
        else:
            names.append((param.key, definition.name, definition.unit, param))
    return names


def numeric_inputs(params: Iterable[EffectiveParam]) -> dict[str, float | None]:
    """Values for expressions: numbers as is, booleans as 1/0, percent parameters as a fraction, list values
    by their number, dimensions «1200×800×1600» as `<key>_length`, `<key>_width`, `<key>_height` in mm."""
    values: dict[str, float | None] = {}
    for param in params:
        value = param.value
        if param.definition.type == "dimensions":
            parsed = parse_dimensions(value) if isinstance(value, str) else None
            for part, number in zip(DIMENSION_PARTS, parsed or (None, None, None), strict=True):
                values[f"{param.key}_{part}"] = number
        elif param.definition.type == "enum":
            values[param.key] = _enum_number(param.definition, value)
        elif isinstance(value, bool):
            values[param.key] = float(value)
        elif isinstance(value, int | float):
            is_percent = param.definition.unit == PERCENT_UNIT
            values[param.key] = float(value) / _PERCENT_BASE if is_percent else float(value)
        else:
            values[param.key] = None
    return values


def field_issues(params: Iterable[EffectiveParam]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for param in params:
        check = param.validation
        if check.status == ValidationState.OK or check.code is None or check.message is None:
            continue
        severity = Severity.WARNING if check.status == ValidationState.WARNING else Severity.ERROR
        blocks = _ALL_STAGES if severity == Severity.ERROR else ()
        issues.append(
            ValidationIssue(
                param.key,
                param.definition.name,
                severity,
                check.code,
                check.message,
                check.how_to_fix,
                blocks,
            )
        )
    return issues


def build_report(field_level: list[ValidationIssue], cross_field: list[ValidationIssue]) -> ValidationReport:
    order = {Severity.ERROR: 0, Severity.WARNING: 1, Severity.INFO: 2}
    return ValidationReport(sorted([*field_level, *cross_field], key=lambda issue: order[issue.severity]))


def data_quality(
    params: Sequence[EffectiveParam], impact: Mapping[str, str]
) -> tuple[DataQualitySummary, list[DataQualityItem]]:
    """Score = share of parameters that affect processes whose value is entered, imported or confirmed."""
    counts: dict[str, int] = {}
    for param in params:
        counts[param.provenance.status.value] = counts.get(param.provenance.status.value, 0) + 1
    relevant = [p for p in params if p.definition.affects] or list(params)
    trusted = sum(p.provenance.status in _TRUSTED for p in relevant)
    score = round(trusted / len(relevant), 3) if relevant else 0.0
    items = [
        DataQualityItem(
            key=p.key,
            name=p.definition.name,
            status=p.provenance.status.value,
            impact=impact.get(p.key, "unknown"),
            source_title=p.provenance.source.title if p.provenance.source else None,
        )
        for p in params
    ]
    return DataQualitySummary(score=score, counts=counts), items
