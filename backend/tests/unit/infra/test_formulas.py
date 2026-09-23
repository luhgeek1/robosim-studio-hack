import pytest

from app.infra.reports.formulas import translate

CELLS = {"a": ("C1", 10.0), "b": ("C2", 4.0), "p.robots": ("C3", 14.2), "share": ("C4", 0.15)}


def resolve(name: str) -> tuple[str, float] | None:
    return CELLS.get(name)


@pytest.mark.parametrize(
    ("formula", "expected", "excel"),
    [
        ("a × b", 40.0, "C1*C2"),
        ("a − b / 2", 8.0, "C1-C2/2"),
        ("⌈p.robots⌉", 15.0, "ROUNDUP(C3,0)"),
        ("⌈p.robots × share⌉", 3.0, "ROUNDUP(C3*C4,0)"),
        ("min(1, a / b)", 1.0, "MIN(1,C1/C2)"),
        ("max(a, b) × 12", 120.0, "MAX(C1,C2)*12"),
        ("−a", -10.0, "-C1"),
        ("mm_to_m(a)", 0.01, "((C1)*0.001)"),
        ("coalesce(missing, (a + b) / 2, b)", 7.0, "((C1+C2)/2)"),
        ("gain_to_release(share)", 0.15 / 1.15, "((C4)/(1+C4))"),
        # Call results are parenthesised: the division applies to the whole converted value.
        ("b / mm_to_m(a)", 400.0, "C2/((C1)*0.001)"),
        ("coalesce(missing, a + b) × 2", 28.0, "(C1+C2)*2"),
    ],
)
def test_trace_formulas_become_excel_formulas(formula: str, expected: float, excel: str) -> None:
    assert translate(formula, resolve, expected) == excel


@pytest.mark.parametrize(
    "formula",
    [
        "Σ поток_m × (1 + discount_rate)^(−m / 12)",
        "первый момент, когда накопленный поток ≥ 0",
        "a × unknown_cell",
    ],
)
def test_prose_and_unknown_names_stay_values(formula: str) -> None:
    assert translate(formula, resolve, 1.0) is None


def test_a_formula_that_does_not_reproduce_the_value_is_rejected() -> None:
    # A live formula must give exactly what the platform calculated, otherwise the value is written instead.
    assert translate("a × b", resolve, 41.0) is None
