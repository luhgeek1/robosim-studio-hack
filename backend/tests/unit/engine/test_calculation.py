from dataclasses import replace
from uuid import uuid4

import pytest

from app.domain.common.provenance import ProvenanceStatus
from app.domain.reference import LaborGroupDef, ProcessDef, SiteCostDef, SizingModel
from app.domain.scenario.models import CountMode, Financing, FinancingKind, RaasTerms, ScenarioKind
from app.engine.calculation import CalculationError, CalculationInput, ItemInput, ParamMeta, calculate
from app.engine.trace import Book, InputKind
from app.seeds.schemas import load_norm_set, load_object_types

WAREHOUSE = next(o for o in load_object_types() if o.key == "warehouse")
NORMS = Book.of(InputKind.NORM, [(n.key, n.name, n.value, n.unit) for n in load_norm_set().norms])
PARAMS = {
    "pallets_in_per_day": 1000.0,
    "pallets_out_per_day": 1000.0,
    "pallets_internal_per_day": 0.0,
    "shifts_per_day": 2.0,
    "shift_hours": 11.0,
    "peak_factor": 1.5,
    "forklift_operators": 25.0,
    "forklift_salary_rub_month": 120_000.0,
    "payroll_tax_coeff": 1.302,
    "working_days_per_year": 365.0,
    "robotized_area_m2": 10_000.0,
    "pallet_weight_kg": 800.0,
}
H1500 = Book.of(
    InputKind.SPEC,
    [
        ("max_speed_mps", "Скорость", 1.5, "м/с"),
        ("runtime_h", "Автономность", 10.0, "ч"),
        ("charging_time_min", "Зарядка", 18.0, "мин"),
    ],
)


def _process(key: str) -> ProcessDef:
    seed = next(p for p in WAREHOUSE.processes if p.key == key)
    return ProcessDef(**{**seed.model_dump(exclude={"requirements"}), "requirements": []})


def scenario(kind: ScenarioKind = ScenarioKind.PURCHASE, **changes: object) -> CalculationInput:
    base = CalculationInput(
        object_type="warehouse",
        kind=kind,
        horizon_years=5,
        discount_rate=NORMS.get("discount_rate"),
        financing=Financing(),
        params=PARAMS,
        param_meta={k: ParamMeta(k, None, ProvenanceStatus.USER) for k in PARAMS},
        norms=NORMS,
        processes=[_process("pallet_transport")],
        labor_groups=[LaborGroupDef(**g.model_dump()) for g in WAREHOUSE.labor_groups],
        site_costs=[SiteCostDef(**c.model_dump()) for c in WAREHOUSE.site_costs],
        items=[
            ItemInput(
                process_key="pallet_transport",
                product_id=uuid4(),
                product_name="Ronavi H1500",
                solution_type="amr_transport",
                sizing_model=SizingModel.TRANSPORT_CYCLE,
                price=2_700_000.0,
                specs=H1500,
            )
        ],
    )
    return replace(base, **changes)  # type: ignore[arg-type]


def test_purchase_hand_calculation() -> None:
    result = calculate(scenario())
    sizing = result.sizing[0]
    # the cycle model of test_sizing: 25 robots + reserve 4 = 29, 10 chargers
    assert (sizing.count.analytic, sizing.count.reserve, sizing.count.final, sizing.chargers) == (
        25,
        4,
        29,
        10,
    )
    economics = result.economics
    capex = {line.step.key: line.step.value for line in economics.capex.lines}
    # hardware = 2.7 M × 29 + 10 × 0.3 M = 81.3 M
    assert capex["capex_equipment.pallet_transport"] == pytest.approx(78_300_000)
    assert capex["capex_chargers"] == pytest.approx(3_000_000)
    assert capex["capex_delivery"] == pytest.approx(81_300_000 * 0.02)
    assert capex["capex_software"] == pytest.approx(29 * 150_000)
    assert capex["capex_commissioning"] == pytest.approx(8_130_000)
    assert capex["capex_site_preparation"] == pytest.approx(10_000 * 300)
    assert "capex_elevators" not in capex
    subtotal = 81_300_000 + 1_626_000 + 4_350_000 + 8_130_000 + 2_000_000 + 3_000_000 + 1_500_000 + 300_000
    assert economics.capex.total == pytest.approx(subtotal * 1.1)
    opex = {line.step.key: line.step.value for line in economics.opex.lines}
    # energy: 25 working robots × 0.7 kW × 22 h × 365 d / 0.9 × 8.73 ₽/kWh
    assert opex["opex_energy"] == pytest.approx(25 * 0.7 * 22 * 365 / 0.9 * 8.73)
    # operators: max(2, 29 / 10 × 1.0) = 2.9 FTE × 150 000 × 12 × 1.302
    assert opex["opex_operators"] == pytest.approx(2.9 * 150_000 * 12 * 1.302)
    assert opex["opex_battery"] == pytest.approx(78_300_000 * 0.1 / 4)
    # baseline: 25 × 120 000 × 12 × 1.302; transport share 0.7, release 0.85
    assert economics.baseline.total == pytest.approx(25 * 120_000 * 12 * 1.302)
    savings = 25 * 0.7 * 120_000 * 12 * 1.302 * 0.85
    assert economics.effect.total == pytest.approx(savings - economics.opex.total)
    metrics = economics.metrics
    assert metrics.fte_released == pytest.approx(25 * 0.7 * 0.85)
    assert metrics.payback_years == pytest.approx(economics.capex.total / economics.effect.total)
    assert metrics.scenario_cost_rub_year - metrics.baseline_cost_rub_year == pytest.approx(
        -metrics.effect_rub_year
    )
    assert len(economics.monthly) == 60
    assert len(economics.yearly) == 5
    assert economics.yearly[-1].cumulative == pytest.approx(economics.monthly[-1].cumulative)


def test_cashflow_is_consistent_with_metrics() -> None:
    economics = calculate(scenario()).economics
    monthly = economics.monthly
    # implementation 3 months: no savings, no OPEX; CAPEX is paid in month 1
    assert monthly[0].capex == pytest.approx(economics.capex.total)
    assert monthly[2].savings == 0
    assert monthly[2].opex == 0
    assert monthly[3].savings > 0
    assert sum(row.net for row in monthly) == pytest.approx(monthly[-1].cumulative)
    metrics = economics.metrics
    assert metrics.roi_pct == pytest.approx(monthly[-1].cumulative / metrics.capex_rub * 100)
    # battery replaced after 4 years of operation, inside the 5-year horizon
    assert any(row.capex > 0 for row in monthly[48:54])


def test_trace_covers_every_cost_line_with_formula() -> None:
    result = calculate(scenario())
    keys = {step.key for step in result.trace}
    for line in [*result.economics.capex.lines, *result.economics.opex.lines]:
        assert line.step.key in keys
        assert "=" in line.step.rendered
    assert "pallet_transport.cycle_time_s" in keys
    assert "pallet_transport.demand_peak_per_hour" in keys


def test_raas_moves_hardware_into_fees() -> None:
    purchase = calculate(scenario()).economics
    raas = calculate(scenario(ScenarioKind.RAAS)).economics
    assert raas.capex.total < purchase.capex.total / 5
    fee = next(line for line in raas.opex.lines if line.step.key == "opex_raas_fee")
    # fee = max(2.7 M × 5.3 %, 100 000) = 143 100 ₽ per robot per month
    assert fee.step.value == pytest.approx(29 * 143_100 * 12)
    assert not any(line.step.key == "opex_service" for line in raas.opex.lines)
    assert all(row.financing > 0 for row in raas.monthly[3:])


def test_raas_with_buyout_switches_to_ownership() -> None:
    financing = Financing(raas=RaasTerms(contract_years=2.5, buyout_pct=20))
    economics = calculate(scenario(ScenarioKind.RAAS, financing=financing)).economics
    buyout = 3 + 30
    assert economics.monthly[buyout - 1].capex > 0
    assert economics.monthly[buyout].financing == 0
    assert economics.monthly[buyout].opex > economics.monthly[buyout - 2].opex


def test_lease_and_loan_pay_annuity_and_cost_interest() -> None:
    lease = calculate(scenario(ScenarioKind.LEASE)).economics
    purchase = calculate(scenario()).economics
    assert lease.monthly[0].capex < purchase.monthly[0].capex
    assert lease.metrics.effect_rub_year < purchase.metrics.effect_rub_year
    assert any(line.step.key == "effect_financing_cost" for line in lease.effect.lines)
    loan = calculate(scenario(financing=Financing(kind=FinancingKind.LOAN, down_payment_pct=30))).economics
    assert loan.monthly[0].capex == pytest.approx(purchase.metrics.capex_rub * 0.3, rel=1e-6)
    assert loan.metrics.tco_rub > purchase.metrics.tco_rub


def test_manual_count_below_requirement_cuts_savings() -> None:
    items = [replace(scenario().items[0], count_mode=CountMode.MANUAL, count_manual=10)]
    result = calculate(scenario(items=items))
    sizing = result.sizing[0]
    assert sizing.count.final == 10
    assert sizing.coverage == pytest.approx(
        10 * sizing.outcome.effective_per_hour / sizing.demand_peak_per_hour
    )
    full = calculate(scenario()).economics.effect.lines[0].step.value
    assert result.economics.effect.lines[0].step.value == pytest.approx(full * sizing.coverage)


def test_baseline_costs_labor_only() -> None:
    economics = calculate(scenario(ScenarioKind.BASELINE)).economics
    assert economics.capex.total == 0
    assert economics.metrics.effect_rub_year == 0
    first = economics.baseline.total / 12
    assert economics.monthly[0].opex == pytest.approx(first)
    assert economics.monthly[12].opex == pytest.approx(first * 1.08)
    assert economics.metrics.tco_rub == economics.metrics.tco_baseline_rub


def test_missing_specs_require_manual_count() -> None:
    items = [replace(scenario().items[0], specs=Book.of(InputKind.SPEC, []))]
    with pytest.raises(CalculationError, match="Задайте количество вручную"):
        calculate(scenario(items=items))


def test_release_is_capped_by_the_work_itself() -> None:
    # 400 pallets a day need far fewer than the 17.5 forklift drivers of the dataset:
    # cap = 400 × 365 / nominal 7.137 per hour / (24 × 365 / 4.2) × (1 + 0.25 time loss) ≈ 12.3 FTE
    params = {**PARAMS, "pallets_in_per_day": 200.0, "pallets_out_per_day": 200.0}
    result = calculate(scenario(params=params))
    savings = result.economics.effect.lines[0]
    cap = next(step for step in result.trace if step.key == "pallet_transport.release_cap_fte")
    assert cap.value == pytest.approx(400 * 365 / (3600 / 504.44) / (24 * 365 / 4.2) * 1.25, rel=1e-3)
    assert savings.fte == pytest.approx(cap.value)
    assert any("ограничено объёмом работ" in w for w in result.warnings)


@pytest.mark.parametrize("simulated", [False, True])
@pytest.mark.parametrize("kind", list(ScenarioKind))
def test_every_metric_input_refers_to_an_earlier_step(kind: ScenarioKind, simulated: bool) -> None:
    """The trace is a graph: the report's live Excel formulas and the UI links follow these references."""
    inp = scenario(kind)
    if simulated and inp.items:
        inp = replace(inp, items=[replace(inp.items[0], simulated_robots=8, simulated_basis=14)])
    seen: set[str] = set()
    for step in calculate(inp).trace:
        for quantity in step.inputs:
            if quantity.kind == InputKind.METRIC:
                assert quantity.key in seen, (step.key, quantity.key)
        assert step.key not in seen, step.key
        seen.add(step.key)
