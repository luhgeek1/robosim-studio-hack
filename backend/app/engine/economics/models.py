from dataclasses import dataclass, field
from enum import StrEnum

from app.domain.scenario.models import Financing, ScenarioKind
from app.engine.trace import Book, Quantity, TraceStep


class EffectKind(StrEnum):
    COST_REDUCTION = "cost_reduction"
    EXTRA_REVENUE = "extra_revenue"
    AVOIDED_LOSS = "avoided_loss"
    EXTRA_OPEX = "extra_opex"


@dataclass(frozen=True, slots=True)
class FleetItem:
    """One «process → product → N» line after sizing; every number is a traced quantity."""

    key: str
    process_name: str
    product_name: str
    solution_type: str
    price: Quantity
    robots: Quantity
    robots_working: Quantity
    chargers: Quantity
    stations: Quantity
    hours_per_day: Quantity
    coverage: Quantity
    labor_cost: Quantity
    labor_fte: float
    release: Quantity | None
    service_life: Quantity
    rent_month: Quantity | None = None
    annual_operations: Quantity | None = None
    release_cap_fte: Quantity | None = None


@dataclass(frozen=True, slots=True)
class SiteCost:
    key: str
    kind: str
    name: str
    formula: str
    amount: float
    inputs: tuple[Quantity, ...]
    in_raas: bool
    note: str | None = None


@dataclass(frozen=True, slots=True)
class LaborLine:
    key: str
    name: str
    headcount: Quantity
    salary: Quantity


@dataclass(frozen=True, slots=True)
class EconomicsInput:
    kind: ScenarioKind
    horizon_years: int
    discount_rate: Quantity
    financing: Financing
    items: list[FleetItem]
    site_costs: list[SiteCost]
    labor: list[LaborLine]
    payroll: Quantity
    working_days: Quantity
    norms: Book
    owner_discount_rate: Quantity | None = None


@dataclass(frozen=True, slots=True)
class Line:
    step: TraceStep
    effect_kind: EffectKind | None = None
    fte: float | None = None
    note: str | None = None


@dataclass(frozen=True, slots=True)
class Breakdown:
    total: float
    lines: list[Line]


@dataclass(frozen=True, slots=True)
class CashflowRow:
    period: int
    capex: float
    opex: float
    savings: float
    financing: float
    net: float
    cumulative: float
    discounted_cumulative: float | None = None


@dataclass(frozen=True, slots=True)
class Metrics:
    capex_rub: float
    opex_rub_year: float
    baseline_cost_rub_year: float
    scenario_cost_rub_year: float
    opex_delta_rub_year: float
    effect_rub_year: float
    payback_years: float | None
    discounted_payback_years: float | None
    roi_pct: float | None
    npv_rub: float
    irr_pct: float | None
    tco_rub: float
    tco_baseline_rub: float
    fte_released: float
    robots_total: int
    discount_rate_pct: float
    horizon_years: int
    project_effect_rub_year: float
    owner_upfront_rub: float
    owner_discount_rate_pct: float
    owner_npv_rub: float
    owner_roi_pct: float | None
    owner_irr_pct: float | None
    owner_discounted_payback_years: float | None
    labor_potential_savings_rub_year: float
    labor_savings_rub_year: float
    labor_cash_realization_pct: float
    labor_hours_released_year: float
    throughput_gain_pct: float | None = None
    sla_after: float | None = None


@dataclass(slots=True)
class EconomicsResult:
    capex: Breakdown
    opex: Breakdown
    baseline: Breakdown
    scenario_cost: Breakdown
    effect: Breakdown
    monthly: list[CashflowRow]
    yearly: list[CashflowRow]
    overlay: list[CashflowRow]
    ramp_up_months: int
    metrics: Metrics
    owner_monthly: list[CashflowRow] = field(default_factory=list)
    owner_yearly: list[CashflowRow] = field(default_factory=list)
    owner_overlay: list[CashflowRow] = field(default_factory=list)
    owner_upfront: float = 0.0
    upfront: float = 0.0
    warnings: list[str] = field(default_factory=list)
