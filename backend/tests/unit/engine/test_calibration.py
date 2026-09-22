import pytest

from app.engine.calibration import CalibrationCase, applicable, calibrate_annuity, calibrate_warehouse
from app.engine.trace import Book, InputKind
from app.seeds.schemas import load_calibration, load_norm_set

NORMS = Book.of(InputKind.NORM, [(n.key, n.name, n.value, n.unit) for n in load_norm_set().norms])
CASES = {c.key: CalibrationCase(**c.model_dump()) for c in load_calibration().cases}


def test_annuity_formula_matches_fcbas_within_tolerance() -> None:
    calibration = calibrate_annuity(CASES["fcbas_cleaning_loan"])
    assert calibration.within_tolerance
    assert abs(calibration.deviation_pct or 0) < 0.1


def test_warehouse_case_is_recomputed_with_our_norms() -> None:
    calibration = calibrate_warehouse(CASES["fcbas_warehouse_amr"], NORMS)
    checks = {check.key: check for check in calibration.checks}
    assert checks["people_cost"].ours == pytest.approx(9_396_000)
    assert abs(checks["people_cost"].deviation_pct) < 0.1
    # our robot line is more expensive: commissioning, CAPEX reserve, software and operators are counted
    assert checks["robot_cost"].ours > checks["robot_cost"].reference
    assert checks["robot_cost"].ours < checks["people_cost"].ours
    # ФЦ БАС assumes an ideal cycle; ours accounts for charging, effective speed and fleet utilization
    assert checks["pallets_per_year"].ours < checks["pallets_per_year"].reference
    assert "ПНР" in calibration.note


def test_only_relevant_cases_apply() -> None:
    cases = list(CASES.values())
    assert [c.case_key for c in applicable(cases, {"amr_transport"}, "own_funds", NORMS)] == [
        "fcbas_warehouse_amr"
    ]
    assert [c.case_key for c in applicable(cases, {"cleaning_robot"}, "loan", NORMS)] == [
        "fcbas_cleaning_loan"
    ]
    assert applicable(cases, {"cleaning_robot"}, "own_funds", NORMS) == []
