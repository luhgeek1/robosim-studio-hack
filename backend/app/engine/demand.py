from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.engine.expressions import ExpressionError, MissingValueError, parse

MONTHS_PER_YEAR = 12


@dataclass(frozen=True, slots=True)
class DemandFormula:
    per_day: str
    hours_per_day: str
    peak_factor: str


@dataclass(frozen=True, slots=True)
class LaborGroupInput:
    key: str
    name: str
    headcount: float | None
    salary_rub_month: float | None


@dataclass(frozen=True, slots=True)
class ProcessInput:
    key: str
    name: str
    demand: DemandFormula | None
    labor_allocation: Mapping[str, float]


@dataclass(frozen=True, slots=True)
class LaborCost:
    key: str
    name: str
    headcount: float
    salary_rub_month: float
    allocation_share: float
    cost_rub_year: float


@dataclass(frozen=True, slots=True)
class ProcessDemandResult:
    process_key: str
    name: str
    demand_per_day: float | None
    hours_per_day: float | None
    peak_factor: float | None
    avg_per_hour: float | None
    peak_per_hour: float | None
    labor: list[LaborCost]
    fte: float
    cost_rub_year: float
    productivity_per_hour: float | None
    share_of_labor_cost: float
    missing: list[str]


def labor_cost_rub_year(headcount: float, salary_rub_month: float, payroll_coefficient: float) -> float:
    """Employer cost, ₽/year: headcount × gross salary × 12 × payroll coefficient (Q&A: полные затраты)."""
    return headcount * salary_rub_month * MONTHS_PER_YEAR * payroll_coefficient


def _evaluate(source: str, values: Mapping[str, float | None], missing: list[str]) -> float | None:
    try:
        return parse(source).evaluate(values)
    except MissingValueError as exc:
        missing.extend(name for name in exc.names if name not in missing)
    except ExpressionError:
        missing.append(source)
    return None


def _labor(
    process: ProcessInput,
    groups: Mapping[str, LaborGroupInput],
    payroll_coefficient: float,
    missing: list[str],
) -> list[LaborCost]:
    result: list[LaborCost] = []
    for key, share in process.labor_allocation.items():
        group = groups[key]
        if group.headcount is None or group.salary_rub_month is None:
            missing.append(f"labor:{key}")
            continue
        headcount = group.headcount * share
        result.append(
            LaborCost(
                key=key,
                name=group.name,
                headcount=headcount,
                salary_rub_month=group.salary_rub_month,
                allocation_share=share,
                cost_rub_year=labor_cost_rub_year(headcount, group.salary_rub_month, payroll_coefficient),
            )
        )
    return result


def total_labor_cost(groups: Sequence[LaborGroupInput], payroll_coefficient: float) -> float:
    return sum(
        labor_cost_rub_year(g.headcount, g.salary_rub_month, payroll_coefficient)
        for g in groups
        if g.headcount is not None and g.salary_rub_month is not None
    )


def process_demand(
    process: ProcessInput,
    values: Mapping[str, float | None],
    groups: Mapping[str, LaborGroupInput],
    payroll_coefficient: float,
    total_labor_rub_year: float,
) -> ProcessDemandResult:
    """Demand and current cost of one process.

    avg per hour = demand per day / working hours per day; peak per hour = avg × peak factor.
    Current cost = Σ labor groups × allocation share (seed data) so shared staff is not counted twice.
    """
    missing: list[str] = []
    per_day = hours = peak = None
    if process.demand is not None:
        per_day = _evaluate(process.demand.per_day, values, missing)
        hours = _evaluate(process.demand.hours_per_day, values, missing)
        peak = _evaluate(process.demand.peak_factor, values, missing)
    avg = per_day / hours if per_day is not None and hours else None
    labor = _labor(process, groups, payroll_coefficient, missing)
    fte = sum(item.headcount for item in labor)
    cost = sum(item.cost_rub_year for item in labor)
    return ProcessDemandResult(
        process_key=process.key,
        name=process.name,
        demand_per_day=per_day,
        hours_per_day=hours,
        peak_factor=peak,
        avg_per_hour=avg,
        peak_per_hour=avg * peak if avg is not None and peak is not None else None,
        labor=labor,
        fte=fte,
        cost_rub_year=cost,
        productivity_per_hour=avg / fte if avg is not None and fte else None,
        share_of_labor_cost=cost / total_labor_rub_year if total_labor_rub_year else 0.0,
        missing=missing,
    )
