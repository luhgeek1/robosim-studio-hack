"""Pydantic contracts shared by services and the API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Source = Literal["confirmed", "assumption", "default", "missing"]


class RawRecord(BaseModel):
    """One field as it appeared in the user's file, before normalization."""

    field: str
    value: Any = None
    unit: str | None = None
    context: str | None = None  # sheet / section / row hint


class ParameterValue(BaseModel):
    key: str
    label: str
    group: str
    value: Any = None
    unit: str = ""
    source: Source = "missing"
    source_value: str = ""
    confidence: float = 0.0
    note: str = ""
    kind: str = "number"
    min: float | None = None
    max: float | None = None
    out_of_range: bool = False
    required: bool = False


class NormalizedDocument(BaseModel):
    object_type: str
    parameters: list[ParameterValue]
    unmapped: list[RawRecord] = Field(default_factory=list)
    recognized: int = 0
    total: int = 0
    provider: str = "rules"
    warnings: list[str] = Field(default_factory=list)


class ConfidenceReport(BaseModel):
    score: int
    recognized: int
    total: int
    confirmed: list[ParameterValue]
    assumptions: list[ParameterValue]
    missing: list[ParameterValue]
    warnings: list[str] = Field(default_factory=list)


class ValidationIssue(BaseModel):
    key: str
    level: Literal["error", "warning"]
    message: str


class Check(BaseModel):
    criterion: str
    passed: bool
    hard: bool = False
    text: str


class RobotSpec(BaseModel):
    value: Any
    unit: str = ""
    source: str = ""
    confidence: float = 0.8
    is_assumption: bool = False


class RobotOut(BaseModel):
    id: str
    name: str
    short_name: str
    vendor: str
    category: str
    subtype: str
    scenario: str
    status: str
    trl: int | None
    price_mln: float | None
    description: str
    cases: str
    specs: dict[str, RobotSpec]
    data_quality: Literal["high", "medium", "low"]
    data_quality_label: str


class MatchResult(BaseModel):
    robot: RobotOut
    eligible: bool
    compatibility: int  # 0..100
    score_breakdown: dict[str, float]
    fits: list[str]
    risks: list[str]
    checks: list[Check]
    required_count: int
    effective_throughput: float  # pallets/h per robot on this site
    fleet_capex_mln: float
    summary: str


class SimKpis(BaseModel):
    throughput: float  # capacity, pallets/h
    processed_per_hour: float
    queue_avg: float
    queue_max: float
    utilization: float  # %
    sla: float  # %
    escalated: int
    zones: list[float]  # receiving, storage, picking, shipping loads 0..1
    robots: int
    load_mode: str


class SimEvent(BaseModel):
    time: float
    robot_id: str
    state: str
    frm: str | None = Field(default=None, alias="from")
    to: str | None = None
    queue: int

    model_config = {"populate_by_name": True}


class EconResult(BaseModel):
    capex_mln: float
    capex_breakdown: dict[str, float]
    opex_mln: float
    opex_breakdown: dict[str, float]
    current_opex_mln: float
    savings_year_mln: float
    net_savings_5y_mln: float
    roi_5y: float | None
    payback_years: float | None
    replaced_fte: float
    manual_overflow_pallets: float
    curve: list[float]  # cumulative net position by month, 0..60


class Configuration(BaseModel):
    count: int
    normal: SimKpis
    peak: SimKpis
    econ: EconResult
    meets_sla: bool
    status: Literal["under", "optimal", "over"]


class Explanation(BaseModel):
    title: str
    body: str
    points: list[str]


class ConfigurationsOut(BaseModel):
    robot: RobotOut
    sizing: dict[str, Any]
    configurations: list[Configuration]
    recommended_count: int | None
    explanations: dict[str, Explanation]


class Scenario(BaseModel):
    id: Literal["current", "purchase", "raas"]
    name: str
    caption: str
    capex: float
    opex: float
    tco5y: float
    savings5y: float
    roi5y: float | None
    payback: float | None
    payback_label: str
    throughput: float
    sla: float
    robots: int
    recommended: bool
    note: str
    curve: list[float]


class Recommendation(BaseModel):
    verdict: Literal["recommended", "conditional", "not_recommended"]
    headline: str
    robot: RobotOut | None
    count: int | None
    capex_mln: float | None
    payback_years: float | None
    roi_5y: float | None
    sla: float | None
    throughput: float | None
    key_benefit: str
    key_risk: str
    next_steps: list[str]
    user_choice_note: str | None = None
    executive_summary: str
