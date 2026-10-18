from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.api.schemas.calculations import (
    CalculationRun,
    CalculationTrace,
    CashflowPoint,
    ComparisonTable,
    Interpretation,
    Metrics,
)
from app.api.schemas.layouts import Layout
from app.api.schemas.matching import MatchingResult
from app.api.schemas.processes import ProcessDemand
from app.api.schemas.projects import ProjectParam
from app.api.schemas.scenarios import Scenario
from app.api.schemas.simulations import FleetSweepResult, SimulationRun


class DemoHeadline(ApiModel):
    robots_total: int | None = None
    capex_rub: float | None = None
    payback_years: float | None = None
    effect_rub_year: float | None = None
    verdict: str | None = None


class DemoProject(ApiModel):
    key: str
    name: str
    object_type: str
    description: str
    headline: DemoHeadline = Field(default_factory=DemoHeadline)
    image_url: str | None = None
    scope: str


class DemoProjectList(ApiModel):
    items: list[DemoProject]


class DemoPreparation(ApiModel):
    status: Literal["preparing", "failed"]
    stage: str
    retry_after_s: int


class DemoSnapshot(ApiModel):
    demo: DemoProject
    params: list[ProjectParam]
    processes: list[ProcessDemand]
    matching: MatchingResult
    scenarios: list[Scenario]
    comparison: ComparisonTable
    calculations: list[CalculationRun]
    trace: CalculationTrace
    primary_scenario_id: UUID
    simulation: SimulationRun | None = None
    layout: Layout | None = None
    sweep: FleetSweepResult | None = None
    prepared_at: datetime
    revision: str


class DemoWhatIfRequest(ApiModel):
    fleet_source: Literal["formula", "simulation"] = "simulation"
    salary_multiplier: float = Field(default=1, ge=0.5, le=2, allow_inf_nan=False)
    volume_multiplier: float = Field(default=1, ge=0.5, le=2, allow_inf_nan=False)
    robot_price_multiplier: float = Field(default=1, ge=0.5, le=2, allow_inf_nan=False)
    labor_cash_realization_share: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    horizon_years: int | None = Field(default=None, ge=3, le=10)
    scenario_kind: Literal["purchase", "raas", "lease"] = "purchase"


class DemoWhatIfResult(ApiModel):
    metrics: Metrics
    interpretation: Interpretation
    cashflow_yearly: list[CashflowPoint]
    calculation: CalculationRun
    simulation_valid: bool
    notes: list[str]
