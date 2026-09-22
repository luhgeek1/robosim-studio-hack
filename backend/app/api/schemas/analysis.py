from datetime import datetime
from typing import Literal

from pydantic import Field

from app.api.schemas.base import ApiModel
from app.domain.common.provenance import ProvenanceStatus
from app.engine.sensitivity import Driver, MonteCarloOutcome, TornadoItem
from app.service.scenarios.analysis import DriverRequest, SensitivityView, SurveyView
from app.service.scenarios.narrative import NarrativeView

SensitivityMetric = Literal["payback_years", "npv_rub", "roi_pct", "effect_rub_year", "tco_rub"]
MonteCarloMetric = Literal["payback_years", "npv_rub", "roi_pct"]


def _status(driver: Driver) -> ProvenanceStatus | None:
    return ProvenanceStatus(driver.status) if driver.status else None


class SensitivityParameter(ApiModel):
    key: str = Field(
        description="Параметр объекта, норматив или группа: equipment_price, labor_cost, operations_volume"
    )
    low: float | None = None
    high: float | None = None
    low_pct: float | None = Field(default=None, examples=[-20])
    high_pct: float | None = Field(default=None, examples=[20])

    def to_domain(self) -> DriverRequest:
        return DriverRequest(self.key, self.low, self.high, self.low_pct, self.high_pct)


class HeatmapRequest(ApiModel):
    x_key: str
    y_key: str
    steps: int = Field(default=7, ge=2, le=15)


class SensitivityRequest(ApiModel):
    metric: SensitivityMetric = "payback_years"
    parameters: list[SensitivityParameter] = Field(default_factory=list)
    heatmap: HeatmapRequest | None = None


class SensitivityItem(ApiModel):
    key: str
    name: str
    kind: Literal["param", "norm", "catalog", "group"]
    unit: str | None = None
    base_input: float
    low_input: float
    high_input: float
    metric_at_low: float | None
    metric_at_high: float | None
    swing: float
    rank: int
    provenance_status: ProvenanceStatus | None = None

    @classmethod
    def from_domain(cls, item: TornadoItem) -> "SensitivityItem":
        driver = item.driver
        return cls(
            key=driver.key,
            name=driver.name,
            kind=driver.kind.value,
            unit=driver.unit,
            base_input=driver.base,
            low_input=driver.low,
            high_input=driver.high,
            metric_at_low=item.metric_at_low,
            metric_at_high=item.metric_at_high,
            swing=item.swing,
            rank=item.rank,
            provenance_status=_status(driver),
        )


class Heatmap(ApiModel):
    x_key: str
    y_key: str
    x_values: list[float]
    y_values: list[float]
    z: list[list[float | None]]


class SensitivityResult(ApiModel):
    metric: str
    base_value: float | None
    items: list[SensitivityItem]
    heatmap: Heatmap | None = None
    computed_at: datetime | None = None

    @classmethod
    def from_domain(cls, view: SensitivityView, computed_at: datetime) -> "SensitivityResult":
        grid = view.heatmap
        return cls(
            metric=view.metric,
            base_value=view.base_value,
            items=[SensitivityItem.from_domain(item) for item in view.items],
            heatmap=Heatmap(
                x_key=grid.x.key, y_key=grid.y.key, x_values=grid.x_values, y_values=grid.y_values, z=grid.z
            )
            if grid
            else None,
            computed_at=computed_at,
        )


class Distribution(ApiModel):
    key: str
    dist: Literal["triangular", "uniform", "normal"]
    params: dict[str, float] = Field(
        default_factory=dict,
        examples=[{"low": 0.8, "mode": 1.0, "high": 1.25}],
        description="triangular: low, mode, high; uniform: low, high; normal: mean, sd",
    )

    def to_domain(self) -> DriverRequest:
        p = self.params
        if self.dist == "normal" and "mean" in p and "sd" in p:
            return DriverRequest(
                self.key, p["mean"] - p["sd"], p["mean"] + p["sd"], mode=p["mean"], dist="normal"
            )
        return DriverRequest(self.key, p.get("low"), p.get("high"), mode=p.get("mode"), dist=self.dist)


class MonteCarloRequest(ApiModel):
    n: int | None = Field(
        default=None, ge=100, le=10000, description="По умолчанию — норматив monte_carlo_runs"
    )
    metric: MonteCarloMetric = "payback_years"
    distributions: list[Distribution] = Field(default_factory=list)
    method: Literal["analytic", "surrogate", "des"] = "analytic"
    seed: int | None = None


class Histogram(ApiModel):
    bins: list[float]
    counts: list[int]


class TopDriver(ApiModel):
    key: str
    name: str
    correlation: float


class MonteCarloResult(ApiModel):
    n: int
    metric: str
    method: Literal["analytic", "surrogate", "des"]
    p10: float
    p50: float
    p90: float
    mean: float
    probability: dict[str, float] = Field(default_factory=dict)
    histogram: Histogram
    top_drivers: list[TopDriver] = Field(default_factory=list)

    @classmethod
    def from_domain(cls, item: MonteCarloOutcome) -> "MonteCarloResult":
        return cls(
            n=item.n,
            metric=item.metric,
            method="analytic",
            p10=item.p10,
            p50=item.p50,
            p90=item.p90,
            mean=item.mean,
            probability=item.probability,
            histogram=Histogram(bins=item.bins, counts=item.counts),
            top_drivers=[
                TopDriver(key=d.key, name=d.name, correlation=round(c, 4)) for d, c in item.top_drivers
            ],
        )


class SurveyItem(ApiModel):
    key: str
    name: str
    status: ProvenanceStatus
    current_value: float | str | None = None
    unit: str | None = None
    swing: float
    rank: int
    recommendation: str
    how_to_measure: str | None = None


class SurveyPriorities(ApiModel):
    items: list[SurveyItem]

    @classmethod
    def from_domain(cls, view: SurveyView) -> "SurveyPriorities":
        return cls(
            items=[
                SurveyItem(
                    key=item.driver.key,
                    name=item.driver.name,
                    status=_status(item.driver) or ProvenanceStatus.ASSUMPTION,
                    current_value=item.current_value,
                    unit=item.driver.unit,
                    swing=item.swing,
                    rank=position,
                    recommendation=item.recommendation,
                    how_to_measure=item.how_to_measure,
                )
                for position, item in enumerate(view.items, start=1)
            ]
        )


class Narrative(ApiModel):
    executive_summary: str
    key_findings: list[str]
    risks_text: list[str] = Field(default_factory=list)
    next_steps: list[str]
    generated_by: Literal["llm", "rules"]
    generated_at: datetime

    @classmethod
    def from_domain(cls, view: NarrativeView) -> "Narrative":
        return cls.model_validate(view)
