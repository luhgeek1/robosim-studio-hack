from app.domain.scenario.models import ScenarioKind
from app.engine.calculation.context import WORKING_DAYS_PARAM, Context
from app.engine.calculation.fleet import build_fleet_item
from app.engine.calculation.models import (
    CalculationError,
    CalculationInput,
    CalculationResult,
    CountResult,
    ItemInput,
    ItemSizing,
    ParamMeta,
)
from app.engine.economics import EconomicsInput, FleetItem, evaluate
from app.engine.trace import InputKind, Quantity

__all__ = [
    "CalculationError",
    "CalculationInput",
    "CalculationResult",
    "CountResult",
    "ItemInput",
    "ItemSizing",
    "ParamMeta",
    "calculate",
]


def calculate(inp: CalculationInput, *, render: bool = True) -> CalculationResult:
    """Demand → robots per process → CAPEX/OPEX/effect/cash flow of one scenario; pure and deterministic."""
    calc = Context(inp, render)
    payroll = calc.payroll()
    labor = calc.labor()
    if inp.kind != ScenarioKind.BASELINE and not inp.items:
        raise CalculationError("В сценарии нет решений: добавьте продукт хотя бы для одного процесса")
    if len({item.process_key for item in inp.items}) != len(inp.items):
        raise CalculationError(
            "В сценарии два продукта на один процесс: оставьте по одному решению на процесс"
        )
    items = list(inp.items) if inp.kind != ScenarioKind.BASELINE else []
    days = (
        calc.working_days()
        if items
        else Quantity(WORKING_DAYS_PARAM, "Рабочих дней в году", 0.0, "дн.", InputKind.PARAM)
    )
    fleet: list[FleetItem] = []
    sizing: list[ItemSizing] = []
    for item in items:
        fleet_item, item_sizing = build_fleet_item(calc, item, payroll, days)
        fleet.append(fleet_item)
        sizing.append(item_sizing)
    economics = evaluate(
        EconomicsInput(
            kind=inp.kind,
            horizon_years=inp.horizon_years,
            discount_rate=inp.discount_rate,
            financing=inp.financing,
            items=fleet,
            site_costs=calc.site_costs() if items else [],
            labor=labor,
            payroll=payroll,
            working_days=days,
            norms=inp.norms,
        ),
        calc.tr,
    )
    warnings = [*calc.warnings, *(w for s in sizing for w in s.warnings), *economics.warnings]
    return CalculationResult(inp.kind, sizing, economics, calc.tr.steps, list(dict.fromkeys(warnings)))
