from dataclasses import replace

import pytest

from app.domain.scenario.models import Financing, FinancingKind, RaasTerms, ScenarioKind
from app.engine.calculation import calculate
from app.engine.economics.cashflow import CashflowPlan, simulate
from app.engine.finance import debt_schedule, npv, roi_pct
from tests.unit.engine.test_calculation import scenario


def test_financing_changes_owner_npv_without_changing_project_value() -> None:
    """100 at t0 and twelve savings of 10: project net=20; a free loan shifts only owner timing."""
    project_plan = CashflowPlan(
        months=12,
        implementation_months=0,
        ramp_up_months=0,
        wage_indexation=0,
        opex_indexation=0,
        discount_rate=0.18,
        baseline_labor_year=120,
        savings_year=120,
        operators_year=0,
        opex_year=0,
        fee_year=0,
        upfront=100,
        capex_total=100,
    )
    project = simulate(project_plan)
    owner = simulate(replace(project_plan, upfront=0, debt=debt_schedule(100, 0, 12, 1)))
    expected_project = -100 + sum(10 / 1.18 ** (month / 12) for month in range(1, 13))
    expected_owner = sum((10 - 100 / 12) / 1.18 ** (month / 12) for month in range(1, 13))
    assert project.npv == pytest.approx(expected_project)
    assert owner.npv == pytest.approx(expected_owner)
    assert owner.npv > project.npv
    assert project.cumulative_net == pytest.approx(20)
    assert owner.cumulative_net == pytest.approx(20)
    assert roi_pct(project.cumulative_net, 100) == pytest.approx(20)
    assert roi_pct(owner.cumulative_net, 0) is None


@pytest.mark.parametrize("horizon", [1, 5, 7])
@pytest.mark.parametrize(
    ("kind", "terms"),
    [
        (ScenarioKind.PURCHASE, Financing(kind=FinancingKind.LOAN, rate_pct=12, down_payment_pct=30)),
        (ScenarioKind.PURCHASE, Financing(kind=FinancingKind.LOAN, rate_pct=0, down_payment_pct=0)),
        (ScenarioKind.LEASE, Financing(rate_pct=10, down_payment_pct=20)),
    ],
)
def test_project_metrics_are_invariant_to_debt_structure(
    horizon: int, kind: ScenarioKind, terms: Financing
) -> None:
    cash = calculate(scenario(horizon_years=horizon)).economics
    financed = calculate(scenario(kind, horizon_years=horizon, financing=terms)).economics
    assert financed.monthly == cash.monthly
    assert financed.overlay == cash.overlay
    for key in ("npv_rub", "roi_pct", "irr_pct", "discounted_payback_years", "project_effect_rub_year"):
        assert getattr(financed.metrics, key) == getattr(cash.metrics, key)
    interest = financed.metrics.tco_rub - cash.metrics.tco_rub
    assert financed.owner_monthly[-1].cumulative == pytest.approx(financed.monthly[-1].cumulative - interest)
    # The remaining principal is settled at the horizon, even when the term extends beyond it.
    assert sum(row.net for row in financed.owner_monthly) == pytest.approx(
        financed.owner_monthly[-1].cumulative
    )
    metrics = financed.metrics
    expected_roi = roi_pct(financed.owner_monthly[-1].cumulative, financed.owner_upfront)
    assert (
        metrics.owner_roi_pct == pytest.approx(expected_roi)
        if expected_roi is not None
        else (metrics.owner_roi_pct is None)
    )
    assert metrics.effect_rub_year <= metrics.project_effect_rub_year


def test_owner_discount_rate_changes_only_discounted_owner_metrics() -> None:
    inp = scenario(financing=Financing(kind=FinancingKind.LOAN, down_payment_pct=30))
    reference = calculate(inp).economics
    norms = replace(
        inp.norms,
        items={
            **inp.norms.items,
            "owner_discount_rate": replace(inp.norms.get("owner_discount_rate"), value=0),
        },
    )
    changed = calculate(replace(inp, norms=norms)).economics
    assert changed.monthly == reference.monthly
    assert changed.metrics.npv_rub == reference.metrics.npv_rub
    assert changed.metrics.owner_discount_rate_pct == 0
    assert changed.metrics.owner_npv_rub == pytest.approx(changed.owner_monthly[-1].cumulative)
    assert changed.metrics.owner_npv_rub != reference.metrics.owner_npv_rub
    assert changed.metrics.owner_roi_pct == reference.metrics.owner_roi_pct
    assert changed.metrics.owner_irr_pct == reference.metrics.owner_irr_pct


@pytest.mark.parametrize("terms", [RaasTerms(), RaasTerms(contract_years=2, buyout_pct=20)])
def test_raas_service_costs_remain_in_both_perspectives(terms: RaasTerms) -> None:
    result = calculate(scenario(ScenarioKind.RAAS, financing=Financing(raas=terms))).economics
    assert result.monthly == result.owner_monthly
    assert result.metrics.npv_rub == result.metrics.owner_npv_rub
    assert result.metrics.roi_pct == result.metrics.owner_roi_pct
    assert any(row.financing > 0 for row in result.monthly)
    flows = [-result.upfront, *[row.net for row in result.monthly]]
    flows[1] += result.upfront
    assert npv(result.metrics.discount_rate_pct / 100, flows) == pytest.approx(result.metrics.npv_rub)


def test_baseline_roi_is_undefined_and_no_financial_return_is_claimed() -> None:
    metrics = calculate(scenario(ScenarioKind.BASELINE)).economics.metrics
    assert metrics.roi_pct is None
    assert metrics.owner_roi_pct is None
    assert metrics.irr_pct is None
    assert metrics.owner_irr_pct is None
    assert metrics.npv_rub == metrics.owner_npv_rub == 0
