from app.domain.scenario.models import ScenarioKind
from app.engine.economics.cashflow import CashflowOutcome
from app.engine.economics.costs import AnnualCosts
from app.engine.economics.financing import PERCENT
from app.engine.economics.models import Breakdown, EconomicsInput, Metrics
from app.engine.finance import roi_pct, simple_payback_years
from app.engine.trace import InputKind, Quantity, Section, Tracer


def _metric(key: str, name: str, value: float, unit: str | None) -> Quantity:
    return Quantity(key, name, value, unit, InputKind.METRIC)


def build_metrics(
    inp: EconomicsInput,
    tracer: Tracer,
    annual: AnnualCosts,
    effect: Breakdown,
    scenario_cost: Breakdown,
    outcome: CashflowOutcome,
) -> Metrics:
    capex = _metric("capex_total", "CAPEX", annual.capex.total, "₽")
    effect_q = _metric("effect_total", "Чистый годовой эффект", effect.total, "₽/год")
    payback = simple_payback_years(capex.value, effect.total) if capex.value > 0 else None
    if payback is not None:
        tracer.record(
            "payback_years",
            "Простой срок окупаемости",
            payback,
            "лет",
            "capex_total / effect_total",
            [capex, effect_q],
            Section.METRICS,
        )
    horizon = Quantity("horizon_years", "Горизонт расчёта", float(inp.horizon_years), "лет", InputKind.PARAM)
    cumulative = tracer.record(
        "cumulative_net",
        "Накопленный чистый поток за горизонт",
        outcome.cumulative_net,
        "₽",
        "Σ поток_m, m = 0…horizon_years × 12 (помесячный поток, лист «Денежный поток»)",
        [horizon],
        Section.CASHFLOW,
    ).as_quantity()
    roi = roi_pct(outcome.cumulative_net, capex.value) or 0.0
    if capex.value > 0:
        tracer.record(
            "roi_pct",
            "ROI за горизонт",
            roi,
            "%",
            "cumulative_net / capex_total × 100",
            [cumulative, capex],
            Section.METRICS,
        )
    for key, name, value, unit, formula in (
        (
            "npv_rub",
            "Чистая приведённая стоимость (NPV)",
            outcome.npv,
            "₽",
            "Σ поток_m × (1 + discount_rate)^(−m / 12), m = 0…horizon_years × 12",
        ),
        (
            "tco_rub",
            "TCO сценария за горизонт",
            outcome.tco,
            "₽",
            "capex_total + Σ (ФОТ после роботизации + OPEX + плата RaaS + проценты + замены)",
        ),
        (
            "tco_baseline_rub",
            "TCO «как сейчас» за горизонт",
            outcome.tco_baseline,
            "₽",
            "Σ baseline_total × (1 + wage_indexation_rate)^год / 12",
        ),
    ):
        tracer.record(key, name, value, unit, formula, [horizon, inp.discount_rate], Section.METRICS)
    for key, name, years in (
        ("discounted_payback_years", "Дисконтированный срок окупаемости", outcome.discounted_payback_years),
        (
            "cash_payback_years",
            "Окупаемость по денежному потоку (с внедрением и разгоном)",
            outcome.cash_payback_years,
        ),
    ):
        if years is not None:
            tracer.record(
                key,
                name,
                years,
                "лет",
                "первый момент, когда накопленный поток ≥ 0",
                [horizon],
                Section.METRICS,
            )
    if outcome.irr is not None:
        tracer.record(
            "irr_pct",
            "Внутренняя норма доходности (IRR)",
            outcome.irr * PERCENT,
            "%",
            "ставка, при которой NPV = 0",
            [horizon],
            Section.METRICS,
        )
    record_accounting(inp, tracer, annual, effect)
    return Metrics(
        capex_rub=annual.capex.total,
        opex_rub_year=annual.opex.total,
        baseline_cost_rub_year=annual.baseline.total,
        scenario_cost_rub_year=scenario_cost.total,
        opex_delta_rub_year=scenario_cost.total - annual.baseline.total,
        effect_rub_year=effect.total,
        payback_years=payback,
        discounted_payback_years=outcome.discounted_payback_years,
        roi_pct=roi,
        npv_rub=outcome.npv,
        irr_pct=None if outcome.irr is None else outcome.irr * PERCENT,
        tco_rub=outcome.tco,
        tco_baseline_rub=outcome.tco_baseline,
        fte_released=annual.fte_released,
        robots_total=annual.robots_total,
        discount_rate_pct=inp.discount_rate.value * PERCENT,
        horizon_years=inp.horizon_years,
    )


def record_accounting(inp: EconomicsInput, tracer: Tracer, annual: AnnualCosts, effect: Breakdown) -> None:
    """Доп. 2.2, Q&A: straight-line depreciation shows the accounting result only, never enters payback."""
    if inp.kind not in {ScenarioKind.PURCHASE, ScenarioKind.LEASE} or annual.capex.total <= 0:
        return
    life = inp.norms.get("robot_service_life_years")
    capex = _metric("capex_total", "CAPEX", annual.capex.total, "₽")
    depreciation = tracer.record(
        "depreciation_year",
        "Амортизация (линейная, справочно)",
        capex.value / life.value,
        "₽/год",
        f"capex_total / {life.key}",
        [capex, life],
        Section.METRICS,
    )
    effect_q = _metric("effect_total", "Чистый годовой эффект", effect.total, "₽/год")
    ebt = tracer.record(
        "profit_before_tax_effect",
        "Прирост прибыли до налога (справочно)",
        effect.total - depreciation.value,
        "₽/год",
        "effect_total − depreciation_year",
        [effect_q, depreciation.as_quantity()],
        Section.METRICS,
    )
    tax = inp.norms.get("profit_tax_rate")
    tracer.record(
        "net_profit_effect",
        "Прирост чистой прибыли (справочно)",
        ebt.value * (1 - tax.value),
        "₽/год",
        f"profit_before_tax_effect × (1 − {tax.key})",
        [ebt.as_quantity(), tax],
        Section.METRICS,
    )
