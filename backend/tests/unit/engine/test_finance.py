import pytest

from app.engine.finance import (
    PaymentSchedule,
    annuity_payment,
    debt_schedule,
    irr,
    npv,
    payback_months,
    roi_pct,
    simple_payback_years,
)


def test_annuity_reproduces_fcbas_cleaning_lease() -> None:
    # ФЦ БАС «Роботы-уборщики», с. 9: 2,2 млн ₽ в кредит под 21 % на 36 мес. → 995 тыс. ₽/год, под 16 % → 929
    assert annuity_payment(2_200_000, 0.21, 36, 12) * 12 == pytest.approx(995_000, rel=1e-3)
    assert annuity_payment(2_200_000, 0.16, 36, 12) * 12 == pytest.approx(929_000, rel=2e-3)


def test_zero_rate_annuity_is_straight_line() -> None:
    assert annuity_payment(1_200_000, 0.0, 12, 12) == pytest.approx(100_000)


def test_debt_schedule_repays_principal_exactly() -> None:
    schedule = debt_schedule(1_000_000, 0.18, 36, PaymentSchedule.QUARTERLY)
    assert [p.month for p in schedule[:3]] == [3, 6, 9]
    assert len(schedule) == 12
    assert sum(p.principal for p in schedule) == pytest.approx(1_000_000)
    assert schedule[-1].balance == pytest.approx(0, abs=1e-6)
    assert schedule[0].interest == pytest.approx(1_000_000 * 0.18 / 4)


def test_npv_discounts_by_month() -> None:
    flows = [-100.0] + [0.0] * 11 + [118.0]
    assert npv(0.18, flows) == pytest.approx(0.0, abs=1e-9)


def test_irr_matches_known_rate() -> None:
    flows = [-100.0] + [0.0] * 11 + [110.0]
    assert irr(flows) == pytest.approx(0.10, rel=1e-6)


def test_irr_undefined_without_sign_change() -> None:
    assert irr([10.0, 20.0]) is None
    assert irr([-10.0, -20.0]) is None


def test_payback_interpolates_inside_month() -> None:
    assert payback_months([-100.0, -40.0, 20.0]) == pytest.approx(1 + 40 / 60)
    assert payback_months([-100.0, -50.0]) is None
    assert payback_months([0.0, 5.0]) == 0.0


def test_simple_payback_and_roi() -> None:
    assert simple_payback_years(41_200_000, 15_800_000) == pytest.approx(2.6076, rel=1e-4)
    assert simple_payback_years(10.0, 0.0) is None
    assert roi_pct(50.0, 100.0) == pytest.approx(50.0)
    assert roi_pct(50.0, 0.0) is None
