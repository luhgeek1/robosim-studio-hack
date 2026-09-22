from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.api.schemas.common import Provenance
from app.api.schemas.reference import Norm
from app.api.schemas.scenarios import CountResult
from app.domain.scenario.models import ScenarioKind
from app.service.scenarios.calculations import StoredCalculation
from app.service.scenarios.comparison import ComparisonView, RerunView

Section = Literal["demand", "sizing", "capex", "opex", "baseline", "effect", "cashflow", "metrics"]
Status = Literal["fresh", "stale"]
# Stored alongside the run for the comparison chart and the trace endpoint, not part of CalculationRun.
_PRIVATE_KEYS = ("cashflow_overlay", "undocumented_constants")


class TraceInput(ApiModel):
    key: str
    name: str
    value: float | str | None
    unit: str | None = None
    provenance: Provenance | None = None
    kind: Literal["param", "norm", "spec", "metric", "simulation"]


class CostItem(ApiModel):
    key: str
    name: str
    amount_rub: float
    formula: str
    formula_rendered: str | None = None
    inputs: list[TraceInput]
    norm_key: str | None = None
    note: str | None = None


class CostBreakdown(ApiModel):
    total_rub: float
    items: list[CostItem]


class EffectItem(ApiModel):
    key: str
    name: str
    amount_rub_year: float
    fte_released: float | None = None
    formula: str
    formula_rendered: str | None = None
    inputs: list[TraceInput]
    kind: Literal["cost_reduction", "extra_revenue", "avoided_loss", "extra_opex"] | None = None


class EffectBreakdown(ApiModel):
    total_rub_year: float
    items: list[EffectItem]


class CashflowPoint(ApiModel):
    period: int
    capex_rub: float
    opex_rub: float
    savings_rub: float
    financing_rub: float = 0.0
    net_rub: float
    cumulative_rub: float
    discounted_cumulative_rub: float | None = None


class Cashflow(ApiModel):
    monthly: list[CashflowPoint]
    yearly: list[CashflowPoint]
    ramp_up_months: int | None = None


class Metrics(ApiModel):
    capex_rub: float
    opex_rub_year: float
    baseline_cost_rub_year: float
    scenario_cost_rub_year: float | None = None
    opex_delta_rub_year: float | None = None
    effect_rub_year: float
    payback_years: float | None
    discounted_payback_years: float | None = None
    roi_pct: float
    npv_rub: float | None = None
    irr_pct: float | None = None
    tco_rub: float
    tco_baseline_rub: float | None = None
    fte_released: float | None = None
    robots_total: int | None = None
    throughput_gain_pct: float | None = None
    sla_after: float | None = None
    discount_rate_pct: float | None = None
    horizon_years: int


class Interpretation(ApiModel):
    verdict: Literal[
        "attractive", "reasonable", "questionable", "not_recommended", "insufficient_data", "baseline"
    ]
    band: Literal["lt3", "from3to5", "gt5", "never", "none"]
    headline: str
    summary: str
    key_drivers: list[str] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)


class Risk(ApiModel):
    code: str
    title: str
    severity: Literal["low", "medium", "high"]
    description: str
    mitigation: str | None = None
    related_params: list[str] = Field(default_factory=list)


class CycleComponent(ApiModel):
    key: str
    name: str
    seconds: float
    inputs: list[TraceInput] = Field(default_factory=list)


class RobotPerformance(ApiModel):
    cycle_components: list[CycleComponent] = Field(default_factory=list)
    cycle_time_s: float | None
    nominal_throughput_per_hour: float | None = None
    availability: float | None = None
    utilization_target: float | None = None
    effective_throughput_per_hour: float | None
    vendor_claim_per_hour: float | None = None


class SizingResult(ApiModel):
    process_key: str
    product_id: UUID
    product_name: str | None = None
    demand_peak_per_hour: float
    demand_avg_per_hour: float | None = None
    robot: RobotPerformance
    count: CountResult
    stations_count: int | None = None
    chargers_count: int | None = None
    fleet_throughput_per_hour: float | None = None
    coverage_of_peak: float | None = None


class CalibrationCheck(ApiModel):
    key: str
    name: str
    ours: float
    reference: float
    deviation_pct: float
    unit: str | None = None
    tolerance_pct: float | None = None


class Calibration(ApiModel):
    reference: str | None = None
    deviation_pct: float | None = None
    note: str | None = None
    within_tolerance: bool | None = None
    checks: list[CalibrationCheck] = Field(default_factory=list)


class VersionStamp(ApiModel):
    project_version: int
    catalog_version: str
    norm_set_version: str
    engine_version: str
    layout_version: int | None = None
    computed_at: datetime
    inputs_hash: str | None = None


class CalculationRun(ApiModel):
    id: UUID
    scenario_id: UUID
    scenario_kind: ScenarioKind | None = None
    versions: VersionStamp
    status: Status
    duration_ms: int | None = None
    sizing: list[SizingResult]
    capex: CostBreakdown
    opex_year: CostBreakdown
    baseline_cost_year: CostBreakdown
    scenario_cost_year: CostBreakdown | None = None
    effect_year: EffectBreakdown
    cashflow: Cashflow
    metrics: Metrics
    interpretation: Interpretation
    risks: list[Risk]
    warnings: list[str] = Field(default_factory=list)
    assumptions_used: list[Norm] = Field(default_factory=list)
    calibration: Calibration | None = None

    @classmethod
    def from_stored(cls, stored: StoredCalculation) -> "CalculationRun":
        run = stored.run
        body = {k: v for k, v in run.result.items() if k not in _PRIVATE_KEYS}
        return cls.model_validate(
            {
                **body,
                "id": run.id,
                "scenario_id": run.scenario_id,
                "status": stored.status,
                "duration_ms": run.duration_ms,
                "versions": stamp(run),
            }
        )


def stamp(run: Any) -> dict[str, Any]:
    return {
        "project_version": run.project_version,
        "catalog_version": run.catalog_version,
        "norm_set_version": run.norm_set_version,
        "engine_version": run.engine_version,
        "layout_version": run.layout_version,
        "computed_at": run.computed_at,
        "inputs_hash": run.inputs_hash,
    }


class TraceItem(ApiModel):
    metric_key: str
    name: str
    value: float | str | None
    unit: str | None = None
    formula: str
    formula_rendered: str | None = None
    inputs: list[TraceInput]
    depends_on: list[str]
    norm_keys: list[str] = Field(default_factory=list)
    section: Section | None = None


class CalculationTrace(ApiModel):
    calculation_id: UUID
    items: list[TraceItem]
    undocumented_constants: int = Field(description="Должно быть 0 — счётчик для слайда")


class RerunDiff(ApiModel):
    metric_key: str
    name: str
    old: float | None
    new: float | None
    delta_pct: float | None = None
    causes: list[str] = Field(default_factory=list)


class RerunResult(ApiModel):
    old_calculation_id: UUID
    new_calculation_id: UUID
    versions_before: VersionStamp
    versions_after: VersionStamp
    diff: list[RerunDiff]

    @classmethod
    def from_domain(cls, view: RerunView) -> "RerunResult":
        return cls(
            old_calculation_id=view.old.id,
            new_calculation_id=view.new.id,
            versions_before=VersionStamp.model_validate(stamp(view.old)),
            versions_after=VersionStamp.model_validate(stamp(view.new)),
            diff=[RerunDiff.model_validate(row) for row in view.diff],
        )


class ComparisonRow(ApiModel):
    metric_key: str
    name: str
    unit: str | None = None
    values: dict[str, float | None]
    better: Literal["higher", "lower", "none"]
    best_scenario_id: UUID | None = None


class ComparedScenario(ApiModel):
    scenario_id: UUID
    name: str
    kind: ScenarioKind
    calculation_id: UUID
    status: Status | None = None
    metrics: Metrics


class Recommendation(ApiModel):
    scenario_id: UUID | None = None
    rationale: list[str] = Field(default_factory=list)
    caveats: list[str] = Field(default_factory=list)


class ComparisonTable(ApiModel):
    project_id: UUID
    scenarios: list[ComparedScenario]
    rows: list[ComparisonRow]
    recommendation: Recommendation | None = None
    verdict: Interpretation
    cashflow_overlay: dict[str, list[CashflowPoint]] = Field(default_factory=dict)

    @classmethod
    def from_domain(cls, view: ComparisonView) -> "ComparisonTable":
        return cls(
            project_id=view.project_id,
            scenarios=[
                ComparedScenario(
                    scenario_id=item.scenario.id,
                    name=item.scenario.name,
                    kind=item.scenario.kind,
                    calculation_id=item.stored.run.id,
                    status=item.stored.status,
                    metrics=Metrics.model_validate(item.stored.run.result["metrics"]),
                )
                for item in view.scenarios
            ],
            rows=[ComparisonRow.model_validate(row) for row in view.rows],
            recommendation=Recommendation.model_validate(view.recommendation),
            verdict=Interpretation.model_validate(view.verdict),
            cashflow_overlay={
                sid: [CashflowPoint.model_validate(p) for p in points] for sid, points in view.overlay.items()
            },
        )
