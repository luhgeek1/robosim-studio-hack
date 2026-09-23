from app.domain.scenario.models import ScenarioKind
from app.engine.economics.cashflow import CashflowPlan, simulate
from app.engine.economics.costs import AnnualCosts, CostModel
from app.engine.economics.financing import PERCENT, FinancingPlan, plan_financing
from app.engine.economics.metrics import build_metrics
from app.engine.economics.models import (
    Breakdown,
    EconomicsInput,
    EconomicsResult,
    EffectKind,
    Line,
)
from app.engine.finance import MONTHS_PER_YEAR
from app.engine.trace import InputKind, Quantity, Section, Tracer, TraceStep


def _metric(key: str, name: str, value: float, unit: str | None) -> Quantity:
    return Quantity(key, name, value, unit, InputKind.METRIC)


class _Assembler:
    def __init__(self, inp: EconomicsInput, tracer: Tracer, annual: AnnualCosts) -> None:
        self.inp = inp
        self.tr = tracer
        self.annual = annual
        self.norms = inp.norms
        self.months = inp.horizon_years * MONTHS_PER_YEAR

    def capex_step(self) -> TraceStep:
        return self.tr.record(
            "capex",
            "CAPEX",
            self.annual.capex.total,
            "₽",
            "capex_total",
            [_metric("capex_total", "CAPEX", self.annual.capex.total, "₽")],
            Section.METRICS,
        )

    def lease_subject(self) -> float:
        """Hardware and its delivery are leased; site works, software and commissioning are paid upfront."""
        lines = self.annual.capex.lines
        delivery = next((line.step for line in lines if line.step.key == "capex_delivery"), None)
        value = self.annual.hardware + (delivery.value if delivery else 0.0)
        if self.inp.kind == ScenarioKind.LEASE:
            hardware = _metric("hardware_rub", "Оборудование с зарядками", self.annual.hardware, "₽")
            self.tr.record(
                "lease_subject_rub",
                "Предмет лизинга",
                value,
                "₽",
                "hardware_rub + capex_delivery" if delivery else "hardware_rub",
                [hardware, *([delivery.as_quantity()] if delivery else [])],
                Section.CASHFLOW,
            )
        return value

    def effect(self, financing: FinancingPlan) -> tuple[Breakdown, Quantity | None]:
        lines = list(self.annual.savings)
        savings_total = sum(line.step.value for line in lines)
        savings = self.tr.record(
            "labor_savings_total",
            "Высвобождение ФОТ, всего",
            savings_total,
            "₽/год",
            " + ".join(line.step.key for line in lines) or "0",
            [line.step.as_quantity() for line in lines],
            Section.EFFECT,
        )
        opex = _metric("opex_total", "OPEX роботизации", self.annual.opex.total, "₽/год")
        lines.append(
            Line(
                self.tr.record(
                    "effect_extra_opex",
                    "Дополнительный OPEX роботизации",
                    -opex.value,
                    "₽/год",
                    "−opex_total",
                    [opex],
                    Section.EFFECT,
                ),
                EffectKind.EXTRA_OPEX,
            )
        )
        interest_year: Quantity | None = None
        if financing.debt:
            years = financing.years_within(self.months)
            horizon = Quantity(
                "horizon_years", "Горизонт расчёта", float(self.inp.horizon_years), "лет", InputKind.PARAM
            )
            interest = self.tr.record(
                "financing_interest_total",
                "Проценты за срок финансирования",
                financing.interest_within(self.months),
                "₽",
                "Σ проценты графика платежей в пределах horizon_years (лист «Денежный поток»)",
                [horizon],
                Section.CASHFLOW,
            ).as_quantity()
            term = self.tr.record(
                "financing_years",
                "Срок финансирования в горизонте",
                years,
                "лет",
                "min(срок финансирования, horizon_years)",
                [horizon],
                Section.CASHFLOW,
            ).as_quantity()
            step = self.tr.record(
                "effect_financing_cost",
                f"Обслуживание долга ({financing.label}), в среднем за год",
                -interest.value / years if years else 0.0,
                "₽/год",
                "−financing_interest_total / financing_years",
                [interest, term],
                Section.EFFECT,
            )
            lines.append(
                Line(step, EffectKind.EXTRA_OPEX, note="Доп. 2.1: проценты уменьшают годовой эффект")
            )
            interest_year = self.tr.record(
                "interest_year",
                "Проценты в год",
                -step.value,
                "₽/год",
                "−effect_financing_cost",
                [step.as_quantity()],
                Section.EFFECT,
            ).as_quantity()
        paid = interest_year.value if interest_year else 0.0
        total = self.tr.record(
            "effect_total",
            "Чистый годовой экономический эффект",
            savings.value - opex.value - paid,
            "₽/год",
            "labor_savings_total − opex_total" + (" − interest_year" if interest_year else ""),
            [savings.as_quantity(), opex, *([interest_year] if interest_year else [])],
            Section.EFFECT,
        )
        return Breakdown(total.value, lines), interest_year

    def scenario_cost(self, interest_year: Quantity | None) -> Breakdown:
        baseline = _metric("baseline_total", "Затраты «как сейчас»", self.annual.baseline.total, "₽/год")
        savings = _metric("labor_savings_total", "Высвобождение ФОТ", self.annual.savings_year, "₽/год")
        lines = [
            Line(
                self.tr.record(
                    "scenario.labor",
                    "ФОТ после роботизации",
                    baseline.value - savings.value,
                    "₽/год",
                    "baseline_total − labor_savings_total",
                    [baseline, savings],
                    Section.EFFECT,
                )
            )
        ]
        if self.inp.kind != ScenarioKind.BASELINE:
            opex = _metric("opex_total", "OPEX роботизации", self.annual.opex.total, "₽/год")
            lines.append(
                Line(
                    self.tr.record(
                        "scenario.opex",
                        "OPEX роботизации",
                        opex.value,
                        "₽/год",
                        "opex_total",
                        [opex],
                        Section.EFFECT,
                    )
                )
            )
        if interest_year:
            lines.append(
                Line(
                    self.tr.record(
                        "scenario.financing",
                        "Обслуживание долга",
                        interest_year.value,
                        "₽/год",
                        "interest_year",
                        [interest_year],
                        Section.EFFECT,
                    )
                )
            )
        return Breakdown(sum(line.step.value for line in lines), lines)

    def plan(self, financing: FinancingPlan) -> CashflowPlan:
        inp, annual, norms = self.inp, self.annual, self.norms
        implementation = int(norms.value("implementation_months"))
        owned = inp.kind in {ScenarioKind.PURCHASE, ScenarioKind.LEASE}
        life = min(
            (item.service_life.value for item in inp.items), default=norms.value("robot_service_life_years")
        )
        fee_until = buyout_month = ownership_from = None
        buyout_cost = 0.0
        in_opex = annual.ownership_opex_year if owned else self._raas_ownership_in_opex()
        if owned:
            ownership_from = implementation + 1
        if inp.kind == ScenarioKind.RAAS:
            fee_until = self.months
            terms = inp.financing.raas
            contract = (
                int(terms.contract_years * MONTHS_PER_YEAR)
                if terms.contract_years
                else int(norms.value("raas_min_contract_months"))
            )
            if terms.buyout_pct is not None and implementation + contract < self.months:
                buyout_month = implementation + contract
                fee_until = buyout_month
                ownership_from = buyout_month + 1
                buyout_cost = annual.hardware * terms.buyout_pct / PERCENT
        return CashflowPlan(
            months=self.months,
            implementation_months=implementation,
            ramp_up_months=int(norms.value("ramp_up_months")),
            wage_indexation=norms.value("wage_indexation_rate"),
            opex_indexation=norms.value("opex_indexation_rate"),
            discount_rate=inp.discount_rate.value,
            baseline_labor_year=annual.baseline.total,
            savings_year=annual.savings_year,
            operators_year=annual.operators_year,
            opex_year=annual.opex.total
            - annual.operators_year
            - annual.battery_year
            - annual.fee_year
            - (annual.ownership_opex_year if owned else 0.0),
            fee_year=annual.fee_year,
            upfront=financing.upfront,
            capex_total=annual.capex.total,
            debt=financing.debt,
            battery_cost=annual.equipment * norms.value("battery_cost_share_of_hardware") if owned else 0.0,
            battery_interval_months=int(norms.value("battery_replacement_interval_years") * MONTHS_PER_YEAR),
            fleet_cost=annual.equipment if owned else 0.0,
            service_life_months=int(life * MONTHS_PER_YEAR) if owned else None,
            buyout_month=buyout_month,
            buyout_cost=buyout_cost,
            ownership_opex_year=annual.ownership_opex_year - (0.0 if owned else in_opex),
            ownership_from_month=ownership_from,
            fees_until_month=fee_until,
            is_baseline=inp.kind == ScenarioKind.BASELINE,
        )

    def _raas_ownership_in_opex(self) -> float:
        keys = {"opex_service", "opex_spare_parts", "opex_software"}
        return sum(line.step.value for line in self.annual.opex.lines if line.step.key in keys)


def evaluate(inp: EconomicsInput, tracer: Tracer) -> EconomicsResult:
    """CAPEX, OPEX, baseline, effect, monthly cash flow and metrics of one scenario (ТЗ 3.5.2)."""
    model = CostModel(inp, tracer)
    annual = model.evaluate()
    assembler = _Assembler(inp, tracer, annual)
    capex = assembler.capex_step()
    financing = plan_financing(inp, tracer, capex, assembler.lease_subject())
    effect, interest_year = assembler.effect(financing)
    scenario_cost = assembler.scenario_cost(interest_year)
    outcome = simulate(assembler.plan(financing))
    metrics = build_metrics(inp, tracer, annual, effect, scenario_cost, outcome)
    return EconomicsResult(
        capex=annual.capex,
        opex=annual.opex,
        baseline=annual.baseline,
        scenario_cost=scenario_cost,
        effect=effect,
        monthly=outcome.monthly,
        yearly=outcome.yearly,
        overlay=outcome.overlay,
        ramp_up_months=int(inp.norms.value("implementation_months") + inp.norms.value("ramp_up_months")),
        metrics=metrics,
        warnings=[*annual.warnings, *outcome.events],
    )
