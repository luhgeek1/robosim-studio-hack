from dataclasses import dataclass, field

from app.domain.scenario.models import FinancingKind, ScenarioKind
from app.engine.economics.models import EconomicsInput
from app.engine.finance import MONTHS_PER_YEAR, DebtPayment, annuity_payment, debt_schedule
from app.engine.trace import InputKind, Quantity, Section, Tracer, TraceStep

PERCENT = 100


@dataclass(frozen=True, slots=True)
class FinancingPlan:
    upfront: float
    principal: float = 0.0
    term_months: int = 0
    debt: list[DebtPayment] = field(default_factory=list)
    label: str | None = None

    def interest_within(self, months: int) -> float:
        return sum(p.interest for p in self.debt if p.month <= months)

    def years_within(self, months: int) -> float:
        return min(self.term_months, months) / MONTHS_PER_YEAR


def _user_share(key: str, name: str, pct: float | None) -> Quantity | None:
    if pct is None:
        return None
    return Quantity(key, name, pct / PERCENT, "доля", InputKind.PARAM)


def _terms(inp: EconomicsInput, prefix: str) -> tuple[Quantity, Quantity, Quantity]:
    """Rate, term and down payment: the scenario's own values first, the norm registry otherwise."""
    financing, norms = inp.financing, inp.norms
    rate = _user_share("financing_rate", "Ставка по договору", financing.rate_pct) or norms.get(
        f"{prefix}_rate"
    )
    term = (
        Quantity(
            "financing_term_months",
            "Срок по договору",
            financing.term_years * MONTHS_PER_YEAR,
            "мес",
            InputKind.PARAM,
        )
        if financing.term_years
        else norms.get(f"{prefix}_term_months")
    )
    default_down = (
        norms.get("lease_down_payment_share")
        if prefix == "lease"
        else Quantity("down_payment_share", "Собственный взнос", 0.0, "доля", InputKind.PARAM)
    )
    down = _user_share("down_payment_share", "Аванс по договору", financing.down_payment_pct) or default_down
    return rate, term, down


def plan_financing(
    inp: EconomicsInput, tracer: Tracer, capex: TraceStep, lease_subject: float
) -> FinancingPlan:
    """Доп. 2.1: loan or lease is an annuity at the nominal rate (ФЦ БАС method); own funds pay upfront."""
    kind, financing = inp.kind, inp.financing
    if kind == ScenarioKind.BASELINE:
        return FinancingPlan(upfront=0.0)
    if kind == ScenarioKind.LEASE:
        prefix, base_key, base_name, base = "lease", "lease_subject_rub", "Предмет лизинга", lease_subject
    elif kind == ScenarioKind.PURCHASE and financing.kind == FinancingKind.LOAN:
        prefix, base_key, base_name, base = "loan", "capex_total", "CAPEX", capex.value
    else:
        return FinancingPlan(upfront=capex.value)
    rate, term, down = _terms(inp, prefix)
    subject = Quantity(base_key, base_name, base, "₽", InputKind.METRIC)
    principal = tracer.record(
        "financed_amount",
        "Сумма финансирования",
        base * (1 - down.value),
        "₽",
        f"{subject.key} × (1 − {down.key})",
        [subject, down],
        Section.CASHFLOW,
    )
    months = int(term.value)
    step = inp.financing.payment_schedule.months
    periods = max(1, -(-months // step))
    per_year = MONTHS_PER_YEAR // step
    payment = annuity_payment(principal.value, rate.value, periods, per_year)
    tracer.record(
        "financing_payment",
        f"Платёж по {'лизингу' if prefix == 'lease' else 'кредиту'} (аннуитет)",
        payment,
        "₽",
        f"аннуитет(financed_amount, {rate.key}, {term.key})",
        [principal.as_quantity(), rate, term],
        Section.CASHFLOW,
    )
    debt = debt_schedule(principal.value, rate.value, months, step)
    return FinancingPlan(
        upfront=capex.value - principal.value,
        principal=principal.value,
        term_months=months,
        debt=debt,
        label="лизинг" if prefix == "lease" else "кредит",
    )
