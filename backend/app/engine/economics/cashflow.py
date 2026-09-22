from dataclasses import dataclass, field

from app.engine.economics.models import CashflowRow
from app.engine.finance import (
    MONTHS_PER_YEAR,
    DebtPayment,
    discount_factor,
    irr,
    payback_months,
)


@dataclass(frozen=True, slots=True)
class CashflowPlan:
    """Everything the monthly model needs, already in rubles of year 1; index 0 is «now» (the investment)."""

    months: int
    implementation_months: int
    ramp_up_months: int
    wage_indexation: float
    opex_indexation: float
    discount_rate: float
    baseline_labor_year: float
    savings_year: float
    operators_year: float
    opex_year: float
    fee_year: float
    upfront: float
    capex_total: float
    debt: list[DebtPayment] = field(default_factory=list)
    battery_cost: float = 0.0
    battery_interval_months: int | None = None
    fleet_cost: float = 0.0
    service_life_months: int | None = None
    buyout_month: int | None = None
    buyout_cost: float = 0.0
    ownership_opex_year: float = 0.0
    ownership_from_month: int | None = None
    fees_until_month: int | None = None
    is_baseline: bool = False


@dataclass(slots=True)
class CashflowOutcome:
    monthly: list[CashflowRow]
    yearly: list[CashflowRow]
    overlay: list[CashflowRow]
    flows: list[float]
    npv: float
    irr: float | None
    discounted_payback_years: float | None
    cash_payback_years: float | None
    cumulative_net: float
    tco: float
    tco_baseline: float
    interest_total: float
    replacements_total: float
    residual_value: float
    events: list[str] = field(default_factory=list)


def _year(month: int) -> int:
    return (month - 1) // MONTHS_PER_YEAR


class _Model:
    def __init__(self, plan: CashflowPlan) -> None:
        self.p = plan
        self.go_live = plan.implementation_months + 1
        self.events: list[str] = []

    def wage(self, month: int) -> float:
        return float((1 + self.p.wage_indexation) ** _year(month))

    def prices(self, month: int) -> float:
        return float((1 + self.p.opex_indexation) ** _year(month))

    def ramp(self, month: int) -> float:
        if month < self.go_live:
            return 0.0
        if self.p.ramp_up_months <= 0:
            return 1.0
        return min(1.0, (month - self.p.implementation_months) / self.p.ramp_up_months)

    def operating(self, month: int) -> bool:
        return month >= self.go_live

    def owned(self, month: int) -> bool:
        return self.p.ownership_from_month is not None and month >= self.p.ownership_from_month

    def paying_fees(self, month: int) -> bool:
        return self.p.fees_until_month is not None and month <= self.p.fees_until_month

    def replacement_months(self) -> list[int]:
        life = self.p.service_life_months
        if not life or self.p.fleet_cost <= 0:
            return []
        return list(range(self.p.implementation_months + life, self.p.months + 1, life))

    def battery_months(self, replacements: list[int]) -> list[int]:
        interval = self.p.battery_interval_months
        if not interval or self.p.battery_cost <= 0:
            return []
        months = range(self.p.implementation_months + interval, self.p.months + 1, interval)
        # a battery bought a year before the whole fleet is replaced is wasted — skip it
        return [m for m in months if not any(0 <= r - m < MONTHS_PER_YEAR for r in replacements)]

    def residual(self, replacements: list[int]) -> float:
        life = self.p.service_life_months
        if not life or self.p.fleet_cost <= 0 or self.p.buyout_month is not None:
            return 0.0
        start = replacements[-1] if replacements else self.p.implementation_months
        cost = self.p.fleet_cost * (self.prices(start) if replacements else 1.0)
        used = self.p.months - start
        return cost * max(0.0, life - used) / life


@dataclass(frozen=True, slots=True)
class _Month:
    labor: float
    savings: float = 0.0
    opex: float = 0.0
    fees: float = 0.0
    payments: float = 0.0
    interest: float = 0.0
    events: float = 0.0


@dataclass(slots=True)
class _Totals:
    rows: list[CashflowRow] = field(default_factory=list)
    total_cost: list[float] = field(default_factory=list)
    flows: list[float] = field(default_factory=list)
    tco: float = 0.0
    tco_baseline: float = 0.0
    interest: float = 0.0
    replaced: float = 0.0
    residual: float = 0.0


@dataclass(frozen=True, slots=True)
class _Schedule:
    replacements: list[int]
    batteries: list[int]
    debt: dict[int, DebtPayment]
    outstanding: float
    residual: float


def _month(model: _Model, month: int, schedule: _Schedule) -> _Month:
    plan = model.p
    labor = plan.baseline_labor_year / MONTHS_PER_YEAR * model.wage(month)
    if plan.is_baseline:
        return _Month(labor)
    opex = fees = events = 0.0
    if model.operating(month):
        opex = plan.operators_year / MONTHS_PER_YEAR * model.wage(month)
        opex += plan.opex_year / MONTHS_PER_YEAR * model.prices(month)
        if model.owned(month):
            opex += plan.ownership_opex_year / MONTHS_PER_YEAR * model.prices(month)
        if model.paying_fees(month):
            fees = plan.fee_year / MONTHS_PER_YEAR * model.prices(month)
    for months, cost, label in (
        ([plan.buyout_month] if plan.buyout_month else [], plan.buyout_cost, "Выкуп парка по окончании RaaS"),
        (schedule.replacements, plan.fleet_cost, "Замена парка роботов по сроку службы"),
        (schedule.batteries, plan.battery_cost, "Замена АКБ"),
    ):
        if month in months:
            events += cost * model.prices(month)
            model.events.append(f"{label} — месяц {month}")
    payment = schedule.debt.get(month)
    return _Month(
        labor=labor,
        savings=plan.savings_year / MONTHS_PER_YEAR * model.wage(month) * model.ramp(month),
        opex=opex,
        fees=fees,
        payments=payment.payment if payment else 0.0,
        interest=payment.interest if payment else 0.0,
        events=events,
    )


def _schedule(model: _Model) -> _Schedule:
    plan = model.p
    replacements = model.replacement_months()
    within = [p for p in plan.debt if p.month <= plan.months]
    outstanding = within[-1].balance if within else sum(p.principal for p in plan.debt)
    return _Schedule(
        replacements=replacements,
        batteries=model.battery_months(replacements),
        debt={p.month: p for p in within},
        outstanding=outstanding,
        residual=model.residual(replacements),
    )


def simulate(plan: CashflowPlan) -> CashflowOutcome:
    """Monthly incremental cash flow against «как сейчас» (for the baseline itself — its own costs).

    Index 0 of `flows` is the upfront investment; month m flows happen at the end of month m.
    TCO counts CAPEX, remaining labor, OPEX, RaaS fees, interest and replacements; principal repayments are
    not costs (CAPEX already counts the asset), and the residual value is not subtracted.
    """
    model = _Model(plan)
    schedule = _schedule(model)
    totals = _Totals(flows=[-plan.upfront], tco=plan.capex_total, residual=schedule.residual)
    cumulative = discounted = -plan.upfront
    for month in range(1, plan.months + 1):
        flow = _month(model, month, schedule)
        totals.tco_baseline += flow.labor
        if plan.is_baseline:
            cumulative -= flow.labor
            totals.rows.append(CashflowRow(month, 0.0, flow.labor, 0.0, 0.0, -flow.labor, cumulative, None))
            totals.total_cost.append(flow.labor)
            continue
        totals.interest += flow.interest
        totals.replaced += flow.events
        totals.tco += flow.labor - flow.savings + flow.opex + flow.fees + flow.interest + flow.events
        payments, events = flow.payments, flow.events
        if month == plan.months:
            if schedule.outstanding > 0:
                payments += schedule.outstanding
                model.events.append("Остаток долга погашается в конце горизонта")
            events -= schedule.residual
        financing = payments + flow.fees
        net = flow.savings - flow.opex - financing - events
        totals.flows.append(net)
        cumulative += net
        discounted += net * discount_factor(plan.discount_rate, month)
        upfront = plan.upfront if month == 1 else 0.0
        totals.rows.append(
            CashflowRow(
                month,
                events + upfront,
                flow.opex,
                flow.savings,
                financing,
                net - upfront,
                cumulative,
                discounted,
            )
        )
        totals.total_cost.append(flow.labor - flow.savings + flow.opex + financing + events + upfront)
    return _outcome(plan, model, totals)


def _yearly(rows: list[CashflowRow], months: int) -> list[CashflowRow]:
    result: list[CashflowRow] = []
    for year in range(months // MONTHS_PER_YEAR + (1 if months % MONTHS_PER_YEAR else 0)):
        chunk = rows[year * MONTHS_PER_YEAR : (year + 1) * MONTHS_PER_YEAR]
        if not chunk:
            break
        result.append(
            CashflowRow(
                period=year + 1,
                capex=sum(r.capex for r in chunk),
                opex=sum(r.opex for r in chunk),
                savings=sum(r.savings for r in chunk),
                financing=sum(r.financing for r in chunk),
                net=sum(r.net for r in chunk),
                cumulative=chunk[-1].cumulative,
                discounted_cumulative=chunk[-1].discounted_cumulative,
            )
        )
    return result


def _overlay(total_cost: list[float]) -> list[CashflowRow]:
    """Cumulative full cost by year (labor included) — curves of all scenarios cross at the payback point."""
    result: list[CashflowRow] = []
    cumulative = 0.0
    for year in range(0, len(total_cost), MONTHS_PER_YEAR):
        cost = sum(total_cost[year : year + MONTHS_PER_YEAR])
        cumulative -= cost
        result.append(CashflowRow(year // MONTHS_PER_YEAR + 1, 0.0, cost, 0.0, 0.0, -cost, cumulative, None))
    return result


def _outcome(plan: CashflowPlan, model: _Model, totals: _Totals) -> CashflowOutcome:
    yearly, overlay = _yearly(totals.rows, plan.months), _overlay(totals.total_cost)
    if plan.is_baseline:
        return CashflowOutcome(
            monthly=totals.rows,
            yearly=yearly,
            overlay=overlay,
            flows=[0.0] * (plan.months + 1),
            npv=0.0,
            irr=None,
            discounted_payback_years=None,
            cash_payback_years=None,
            cumulative_net=0.0,
            tco=totals.tco_baseline,
            tco_baseline=totals.tco_baseline,
            interest_total=0.0,
            replacements_total=0.0,
            residual_value=0.0,
        )
    flows = totals.flows
    cumulative, discounted = [flows[0]], [flows[0]]
    for month, flow in enumerate(flows[1:], start=1):
        cumulative.append(cumulative[-1] + flow)
        discounted.append(discounted[-1] + flow * discount_factor(plan.discount_rate, month))
    cash_payback, discounted_payback = payback_months(cumulative), payback_months(discounted)
    return CashflowOutcome(
        monthly=totals.rows,
        yearly=yearly,
        overlay=overlay,
        flows=flows,
        npv=discounted[-1],
        irr=irr(flows),
        discounted_payback_years=None if discounted_payback is None else discounted_payback / MONTHS_PER_YEAR,
        cash_payback_years=None if cash_payback is None else cash_payback / MONTHS_PER_YEAR,
        cumulative_net=cumulative[-1],
        tco=totals.tco,
        tco_baseline=totals.tco_baseline,
        interest_total=totals.interest,
        replacements_total=totals.replaced,
        residual_value=totals.residual,
        events=model.events,
    )
