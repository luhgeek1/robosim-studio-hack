from app.engine.economics.cashflow import CashflowPlan
from app.engine.economics.models import EconomicsInput
from app.engine.finance import MONTHS_PER_YEAR
from app.engine.trace import InputKind, Quantity, Section, Tracer


def record_lifecycle(inp: EconomicsInput, tracer: Tracer, plan: CashflowPlan) -> None:
    """Expose the inputs for asset age, buyout and replacements for both RaaS and purchase."""
    if plan.service_life_months is None:
        return
    lives = [
        tracer.record(
            f"{item.key}.service_life_months",
            f"Срок службы: {item.product_name}",
            item.service_life.value * MONTHS_PER_YEAR,
            "мес",
            f"{item.service_life.key} × 12",
            [item.service_life],
            Section.CASHFLOW,
        ).as_quantity()
        for item in inp.items
    ]
    tracer.record(
        "fleet_service_life_months",
        "Срок службы парка от первоначального запуска",
        float(plan.service_life_months),
        "мес",
        f"min({', '.join(value.key for value in lives)})",
        lives,
        Section.CASHFLOW,
    )
    equipment = Quantity("equipment_rub", "Стоимость роботов", plan.fleet_cost, "₽", InputKind.METRIC)
    battery = inp.norms.get("battery_cost_share_of_hardware")
    interval = inp.norms.get("battery_replacement_interval_years")
    tracer.record(
        "cashflow_battery_cost",
        "Стоимость замены АКБ в ценах первого года",
        plan.battery_cost,
        "₽",
        f"equipment_rub × {battery.key}",
        [equipment, battery],
        Section.CASHFLOW,
    )
    tracer.record(
        "cashflow_battery_interval_months",
        "Интервал замены АКБ от запуска или последней замены робота",
        interval.value * MONTHS_PER_YEAR,
        "мес",
        f"{interval.key} × 12",
        [interval],
        Section.CASHFLOW,
    )
    if plan.buyout_month is not None:
        _record_buyout(inp, tracer, plan)


def _record_buyout(inp: EconomicsInput, tracer: Tracer, plan: CashflowPlan) -> None:
    terms = inp.financing.raas
    implementation = inp.norms.get("implementation_months")
    if terms.contract_years is not None:
        term = Quantity(
            "raas_contract_years", "Срок RaaS по договору", terms.contract_years, "лет", InputKind.PARAM
        )
        term_formula = f"{term.key} × 12"
    else:
        term = inp.norms.get("raas_min_contract_months")
        term_formula = term.key
    tracer.record(
        "raas_buyout_month",
        "Выкуп RaaS в конце месяца без обнуления возраста оборудования",
        float(plan.buyout_month or 0),
        "мес",
        f"{implementation.key} + {term_formula}",
        [implementation, term],
        Section.CASHFLOW,
    )
    share = Quantity("raas_buyout_pct", "Выкуп по договору", terms.buyout_pct or 0.0, "%", InputKind.PARAM)
    hardware = next(step.as_quantity() for step in tracer.steps if step.key == "hardware_rub")
    tracer.record(
        "raas_buyout_cost",
        "Стоимость выкупа RaaS в ценах первого года",
        plan.buyout_cost,
        "₽",
        "hardware_rub × raas_buyout_pct / 100",
        [hardware, share],
        Section.CASHFLOW,
    )
