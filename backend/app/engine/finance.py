import math
from collections.abc import Sequence
from dataclasses import dataclass

MONTHS_PER_YEAR = 12
_IRR_LOW = -0.99
_IRR_HIGH = 10.0
_IRR_TOLERANCE = 1e-10
_IRR_ITERATIONS = 200


def annuity_payment(principal: float, annual_rate: float, periods: int, periods_per_year: int) -> float:
    """Level payment that repays `principal` over `periods` at the nominal annual rate (ФЦ БАС method)."""
    if periods <= 0 or principal <= 0:
        return 0.0
    rate = annual_rate / periods_per_year
    if rate == 0:
        return principal / periods
    return principal * rate / (1 - (1 + rate) ** -periods)


@dataclass(frozen=True, slots=True)
class DebtPayment:
    month: int
    payment: float
    interest: float
    principal: float
    balance: float


def debt_schedule(
    principal: float, annual_rate: float, term_months: int, months_per_period: int
) -> list[DebtPayment]:
    """Annuity schedule; payment `k` falls at the end of month k × months_per_period."""
    step = months_per_period
    periods = max(1, math.ceil(term_months / step))
    per_year = MONTHS_PER_YEAR // step
    payment = annuity_payment(principal, annual_rate, periods, per_year)
    balance = principal
    result: list[DebtPayment] = []
    for period in range(1, periods + 1):
        interest = balance * annual_rate / per_year
        repaid = min(balance, payment - interest)
        balance -= repaid
        result.append(DebtPayment(period * step, interest + repaid, interest, repaid, max(balance, 0.0)))
    return result


def discount_factor(rate: float, months: float) -> float:
    return float((1 + rate) ** (-months / MONTHS_PER_YEAR))


def npv(rate: float, flows: Sequence[float]) -> float:
    """flows[0] happens now, flows[m] at the end of month m; nominal annual rate."""
    return sum(flow * discount_factor(rate, month) for month, flow in enumerate(flows))


def _monthly_npv(rate: float, flows: Sequence[float]) -> float:
    return sum(flow / (1 + rate) ** month for month, flow in enumerate(flows))


def irr(flows: Sequence[float]) -> float | None:
    """Annual IRR of monthly flows by bisection; None when the flows never change sign."""
    if not any(f < 0 for f in flows) or not any(f > 0 for f in flows):
        return None
    low, high = _IRR_LOW / MONTHS_PER_YEAR, _IRR_HIGH / MONTHS_PER_YEAR
    f_low, f_high = _monthly_npv(low, flows), _monthly_npv(high, flows)
    if f_low * f_high > 0:
        return None
    for _ in range(_IRR_ITERATIONS):
        middle = (low + high) / 2
        f_middle = _monthly_npv(middle, flows)
        if abs(f_middle) < _IRR_TOLERANCE or high - low < _IRR_TOLERANCE:
            break
        if f_low * f_middle < 0:
            high = middle
        else:
            low, f_low = middle, f_middle
    return float((1 + (low + high) / 2) ** MONTHS_PER_YEAR - 1)


def payback_months(cumulative: Sequence[float]) -> float | None:
    """First moment the cumulative flow climbs back to zero after going negative, interpolated
    inside the month; index 0 is «now». A flow that never goes negative pays back at once. A loan
    without a down payment starts at exactly zero and dips with the first instalments: no payback yet."""
    first_negative = next((month for month, value in enumerate(cumulative) if value < 0), None)
    if first_negative is None:
        return 0.0
    for month in range(first_negative + 1, len(cumulative)):
        before, after = cumulative[month - 1], cumulative[month]
        if after >= 0 > before:
            return month - 1 + (-before) / (after - before)
    return None


def simple_payback_years(investment: float, annual_effect: float) -> float | None:
    """ТЗ 3.5.2: CAPEX / годовой эффект — only when the effect is positive."""
    if annual_effect <= 0:
        return None
    return investment / annual_effect


def roi_pct(cumulative_net: float, investment: float) -> float | None:
    """Q&A 16.09: ROI = (накопленный эффект − CAPEX) / CAPEX; cumulative_net already has CAPEX subtracted."""
    return None if investment <= 0 else cumulative_net / investment * 100
