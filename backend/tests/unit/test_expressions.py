import pytest

from app.engine.expressions import ExpressionError, MissingValueError, parse


def test_arithmetic_over_parameters() -> None:
    expr = parse("pallets_in_per_day + pallets_out_per_day + pallets_internal_per_day")
    assert (
        expr.evaluate(
            {"pallets_in_per_day": 1000, "pallets_out_per_day": 1000, "pallets_internal_per_day": 0}
        )
        == 2000
    )
    assert expr.names == {"pallets_in_per_day", "pallets_out_per_day", "pallets_internal_per_day"}


def test_peak_ratio_and_functions() -> None:
    expr = parse("flights_peak_hour * operating_hours_per_day / flights_per_day")
    assert expr.evaluate(
        {"flights_peak_hour": 32, "operating_hours_per_day": 24, "flights_per_day": 280}
    ) == pytest.approx(2.742857, rel=1e-5)
    assert (
        parse("coalesce(cleaning_area_m2, area_m2)").evaluate({"cleaning_area_m2": None, "area_m2": 20000})
        == 20000
    )
    assert parse("max(a, b)").evaluate({"a": 1, "b": 3}) == 3


def test_conditions() -> None:
    check = parse("robotized_area_m2 <= area_m2")
    assert check.check({"robotized_area_m2": 10000, "area_m2": 20000})
    assert not check.check({"robotized_area_m2": 30000, "area_m2": 20000})


def test_missing_values_are_reported_by_name() -> None:
    with pytest.raises(MissingValueError) as info:
        parse("a + b").evaluate({"a": 1})
    assert info.value.names == ["b"]


@pytest.mark.parametrize("source", ["a * 1.302", "__import__('os')", "a.b", "a if b else c", "[a]", "a ** b"])
def test_rejects_literals_and_unsafe_syntax(source: str) -> None:
    with pytest.raises(ExpressionError):
        parse(source)


def test_division_by_zero() -> None:
    with pytest.raises(ExpressionError):
        parse("a / b").evaluate({"a": 1, "b": 0})


def test_unit_functions() -> None:
    required = parse("m_to_mm(aisle_width_m) - aisle_safety_clearance_mm")
    assert required.evaluate({"aisle_width_m": 2.8, "aisle_safety_clearance_mm": 500.0}) == pytest.approx(
        2300
    )
    with pytest.raises(ExpressionError):
        parse("m_to_mm(a, b)").evaluate({"a": 1.0, "b": 2.0})


def test_gain_to_release() -> None:
    # +20 % productivity → the same work needs 1 / 1.2 people → 1/6 of them are released
    expression = parse("gain_to_release(pick_assist_productivity_gain_share)")
    assert expression.names == frozenset({"pick_assist_productivity_gain_share"})
    assert expression.evaluate({"pick_assist_productivity_gain_share": 0.2}) == pytest.approx(1 / 6)
