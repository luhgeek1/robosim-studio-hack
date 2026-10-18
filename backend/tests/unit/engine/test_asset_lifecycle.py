from dataclasses import replace

import pytest

from app.domain.scenario.models import Financing, RaasTerms, ScenarioKind
from app.engine.calculation import calculate
from app.engine.economics.cashflow import CashflowPlan, simulate
from app.engine.finance import irr, npv
from tests.unit.engine.test_calculation import scenario


@pytest.mark.parametrize("annual_rate", [-0.90, -0.995, 0, 0.1, 20.0])
def test_irr_uses_effective_annual_rates_over_the_full_negative_domain(annual_rate: float) -> None:
    flows = [-100.0, *([0.0] * 11), 100 * (1 + annual_rate)]
    result = irr(flows)
    assert result == pytest.approx(annual_rate, abs=1e-7)
    assert result is not None
    assert npv(result, flows) == pytest.approx(0, abs=1e-5)


def _lifecycle(*, buyout: int | None = None) -> CashflowPlan:
    return CashflowPlan(
        months=120,
        implementation_months=0,
        ramp_up_months=0,
        wage_indexation=0,
        opex_indexation=0,
        discount_rate=0,
        baseline_labor_year=0,
        savings_year=0,
        operators_year=0,
        opex_year=0,
        fee_year=0,
        upfront=100 if buyout is None else 0,
        capex_total=100 if buyout is None else 0,
        battery_cost=10,
        battery_interval_months=48,
        fleet_cost=100,
        service_life_months=84,
        ownership_from_month=1 if buyout is None else buyout + 1,
        buyout_month=buyout,
        buyout_cost=20 if buyout is not None else 0,
    )


def test_raas_buyout_retains_asset_age_and_owner_pays_later_replacements() -> None:
    """Buy at month24, battery at48, fleet at84, remaining fleet value100×48/84 at120."""
    outcome = simulate(_lifecycle(buyout=24))
    costs = {row.period: row.capex for row in outcome.monthly if row.capex != 0}
    assert costs == pytest.approx({24: 20, 48: 10, 84: 100, 120: -100 * 48 / 84})
    # A replacement robot's first battery is due at84+48=132, not at the original calendar's96.
    assert outcome.monthly[95].capex == 0
    assert outcome.residual_value == pytest.approx(100 * 48 / 84)


def test_vendor_replacements_before_raas_buyout_do_not_charge_customer() -> None:
    """The supplier replaced the7-year-old robot at84; buyout at90 acquires its6-month-old successor."""
    outcome = simulate(_lifecycle(buyout=90))
    assert all(row.capex == 0 for row in outcome.monthly[:89])
    assert outcome.monthly[89].capex == 20
    assert outcome.residual_value == pytest.approx(100 * 48 / 84)


def test_replacement_due_at_raas_buyout_is_paid_by_buyer() -> None:
    outcome = simulate(_lifecycle(buyout=84))
    assert outcome.monthly[83].capex == 120
    assert outcome.residual_value == pytest.approx(100 * 48 / 84)
    boundary = simulate(replace(_lifecycle(buyout=84), months=84))
    assert boundary.replacements_total == 120
    assert boundary.residual_value == 100
    assert boundary.monthly[-1].capex == 20


def test_buyout_at_horizon_includes_purchase_and_remaining_asset_value() -> None:
    outcome = simulate(replace(_lifecycle(buyout=60), months=60))
    assert outcome.monthly[-1].capex == pytest.approx(20 - 100 * 24 / 84)
    assert outcome.replacements_total == 20
    assert outcome.residual_value == pytest.approx(100 * 24 / 84)


def test_raas_evaluation_includes_buyout_exactly_at_horizon() -> None:
    """3-month implementation plus57-month contract equals the5-year horizon."""
    paid = calculate(
        scenario(ScenarioKind.RAAS, financing=Financing(raas=RaasTerms(contract_years=4.75, buyout_pct=20)))
    )
    free = calculate(
        scenario(ScenarioKind.RAAS, financing=Financing(raas=RaasTerms(contract_years=4.75, buyout_pct=0)))
    )
    steps = {step.key: step for step in paid.trace}
    purchase = steps["raas_buyout_cost"].value * 1.05**4
    assert steps["raas_buyout_month"].value == 60
    assert paid.economics.monthly[-1].capex - free.economics.monthly[-1].capex == pytest.approx(purchase)
    assert paid.economics.metrics.npv_rub - free.economics.metrics.npv_rub == pytest.approx(
        -purchase / 1.18**5
    )


def test_raas_buyout_evaluation_includes_batteries_replacements_and_trace_sources() -> None:
    result = calculate(
        scenario(
            ScenarioKind.RAAS,
            horizon_years=10,
            financing=Financing(raas=RaasTerms(contract_years=2, buyout_pct=20)),
        )
    )
    charged = [row.period for row in result.economics.monthly if row.capex > 0]
    assert charged == [1, 27, 51, 63, 111]
    assert result.economics.monthly[-1].capex < 0
    inputs = {quantity.key for step in result.trace for quantity in step.inputs}
    assert {
        "battery_cost_share_of_hardware",
        "battery_replacement_interval_years",
        "raas_buyout_pct",
    } <= inputs
