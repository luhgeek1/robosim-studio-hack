from dataclasses import replace

import pytest

from app.domain.reference import ParameterDef
from app.service.projects.import_values import check_value


@pytest.fixture
def number() -> ParameterDef:
    return ParameterDef(
        "height_m", "Высота", "Объект", "number", "м", True, 0, 20, None, [], None, None, None, [], 0
    )


def codes(result: dict) -> set[str]:
    return {item["code"] for item in result["issues"]}


def test_unit_in_value_requires_explicit_repair(number: ParameterDef) -> None:
    result = check_value(number, "10 000 мм", None)
    assert codes(result) == {"EMBEDDED_UNIT"}
    assert result["suggestion"]["value"] == 10
    assert result["suggestion"]["unit"] == "м"


def test_units_are_converted_without_changing_source(number: ParameterDef) -> None:
    result = check_value(number, "10 000", "мм")
    assert result["value"] == 10
    assert codes(result) == {"UNIT_CONVERTED"}


@pytest.mark.parametrize("value", ["от 10 до 20", "около 10", "10/20", "10-20", "NaN", "Infinity", "1e999"])
def test_ambiguous_and_nonfinite_numbers_are_errors(number: ParameterDef, value: str) -> None:
    result = check_value(number, value, None)
    assert any(item["severity"] == "error" for item in result["issues"])
    assert result["suggestion"] is None


def test_negative_and_fractional_counts_require_user_value(number: ParameterDef) -> None:
    count = replace(number, type="integer", unit=None)
    assert "INVALID_VALUE" in codes(check_value(count, -2, None))
    assert "INVALID_VALUE" in codes(check_value(count, 2.5, None))


def test_unknown_boolean_is_not_assumed_true(number: ParameterDef) -> None:
    boolean = replace(number, type="boolean", unit=None)
    assert "INVALID_VALUE" in codes(check_value(boolean, "возможно", None))
    assert check_value(boolean, "Нет", None)["value"] is False


def test_conflicting_units_require_manual_review(number: ParameterDef) -> None:
    result = check_value(number, "10 см", "м")
    assert codes(result) == {"UNIT_CONFLICT"}
    assert result["suggestion"] is None


def test_enum_typo_suggestion(number: ParameterDef) -> None:
    enum = replace(
        number, type="enum", unit=None, enum_values=[{"value": "concrete", "label": "Промышленный бетон"}]
    )
    result = check_value(enum, "Промышленый бетон", None)
    assert result["suggestion"]["value"] == "concrete"
    assert "INVALID_VALUE" in codes(result)


def test_typical_range_warning_does_not_change_measured_value(number: ParameterDef) -> None:
    result = check_value(number, 50, "м")
    assert result["value"] == 50
    assert codes(result) == {"RANGE_EXCEEDED"}
