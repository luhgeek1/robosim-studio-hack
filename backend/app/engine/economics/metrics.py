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
    owner: CashflowOutcome,
) -> Metrics:
    owner_rate = inp.owner_discount_rate or inp.norms.get("owner_discount_rate")
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
        "Накопленный поток проекта до финансирования за горизонт",
        outcome.cumulative_net,
        "₽",
        "Σ поток_m, m = 0…horizon_years × 12 (помесячный поток, лист «Денежный поток»)",
        [horizon],
        Section.CASHFLOW,
    ).as_quantity()
    roi = roi_pct(outcome.cumulative_net, capex.value)
    if roi is not None:
        tracer.record(
            "roi_pct",
            "ROI проекта за горизонт",
            roi,
            "%",
            "cumulative_net / capex_total × 100",
            [cumulative, capex],
            Section.METRICS,
        )
    for key, name, value, unit, formula in (
        (
            "npv_rub",
            "NPV проекта до финансирования",
            outcome.npv,
            "₽",
            f"Σ поток проекта_m × (1 + {inp.discount_rate.key})^(−m / 12), m = 0…horizon_years × 12",
        ),
        (
            "tco_rub",
            "TCO сценария за горизонт",
            owner.tco,
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
        (
            "discounted_payback_years",
            "Дисконтированный срок окупаемости проекта",
            outcome.discounted_payback_years,
        ),
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
            "IRR проекта до финансирования",
            outcome.irr * PERCENT,
            "%",
            "ставка, при которой NPV = 0",
            [horizon],
            Section.METRICS,
        )
    record_accounting(inp, tracer, annual, effect)
    owner_upfront = -owner.flows[0]
    owner_roi = roi_pct(owner.cumulative_net, owner_upfront)
    record_owner_metrics(tracer, owner, owner_rate, horizon, capex, owner_roi)
    savings = _metric("labor_savings_total", "Высвобождение ФОТ", annual.savings_year, "₽/год")
    opex = _metric("opex_total", "OPEX роботизации", annual.opex.total, "₽/год")
    tracer.record(
        "project_effect_rub_year",
        "Годовой эффект проекта до финансирования",
        annual.savings_year - annual.opex.total,
        "₽/год",
        "labor_savings_total − opex_total",
        [savings, opex],
        Section.METRICS,
    )
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
        tco_rub=owner.tco,
        tco_baseline_rub=outcome.tco_baseline,
        fte_released=annual.fte_released,
        robots_total=annual.robots_total,
        discount_rate_pct=inp.discount_rate.value * PERCENT,
        horizon_years=inp.horizon_years,
        project_effect_rub_year=annual.savings_year - annual.opex.total,
        owner_upfront_rub=owner_upfront,
        owner_discount_rate_pct=owner_rate.value * PERCENT,
        owner_npv_rub=owner.npv,
        owner_roi_pct=owner_roi,
        owner_irr_pct=None if owner.irr is None else owner.irr * PERCENT,
        owner_discounted_payback_years=owner.discounted_payback_years,
        labor_potential_savings_rub_year=annual.potential_savings_year,
        labor_savings_rub_year=annual.savings_year,
        labor_cash_realization_pct=annual.cash_realization_share * PERCENT,
        labor_hours_released_year=annual.labor_hours_released_year,
    )


def record_owner_metrics(
    tracer: Tracer,
    owner: CashflowOutcome,
    rate: Quantity,
    horizon: Quantity,
    capex: Quantity,
    roi: float | None,
) -> None:
    """Owner cash flow subtracts repayments; ROI uses initial equity, with no ratio at zero equity."""
    financed = next((step.as_quantity() for step in tracer.steps if step.key == "financed_amount"), None)
    upfront = tracer.record(
        "owner_upfront_rub",
        "Первоначальные собственные вложения",
        -owner.flows[0],
        "₽",
        "capex_total − financed_amount" if financed else "capex_total",
        [capex, *([financed] if financed else [])],
        Section.CASHFLOW,
    ).as_quantity()
    cumulative = tracer.record(
        "owner_cumulative_net",
        "Накопленный поток собственника за горизонт",
        owner.cumulative_net,
        "₽",
        "Σ поток собственника_m, m = 0…horizon_years × 12 (лист «Поток собственника»)",
        [horizon],
        Section.CASHFLOW,
    ).as_quantity()
    for key, name, value, unit, formula, inputs in (
        (
            "owner_npv_rub",
            "NPV собственника после финансирования",
            owner.npv,
            "₽",
            f"Σ поток собственника_m × (1 + {rate.key})^(−m / 12), m = 0…horizon_years × 12",
            [horizon, rate],
        ),
        (
            "owner_roi_pct",
            "ROI первоначальных собственных вложений",
            roi,
            "%",
            "owner_cumulative_net / owner_upfront_rub × 100",
            [cumulative, upfront],
        ),
        (
            "owner_irr_pct",
            "IRR собственника после финансирования",
            None if owner.irr is None else owner.irr * PERCENT,
            "%",
            "ставка собственника, при которой NPV собственника = 0",
            [horizon],
        ),
        (
            "owner_discounted_payback_years",
            "Дисконтированная окупаемость собственных вложений",
            owner.discounted_payback_years,
            "лет",
            "первый момент, когда накопленный дисконтированный поток собственника ≥ 0",
            [horizon, rate],
        ),
    ):
        if value is not None:
            tracer.record(key, name, value, unit, formula, inputs, Section.METRICS)


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
