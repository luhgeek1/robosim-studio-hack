from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

DISCLAIMER = (
    "Предварительная оценка. Результат требует верификации при обследовании объекта: параметры, отмеченные "
    "как допущения и значения по умолчанию, нужно подтвердить замером или данными заказчика."
)


class ReportFormat(StrEnum):
    PDF = "pdf"
    XLSX = "xlsx"
    DOCX = "docx"
    JSON = "json"


class ReportSection(StrEnum):
    SUMMARY = "summary"
    OBJECT_PARAMS = "object_params"
    PROCESSES = "processes"
    MATCHING = "matching"
    SIZING = "sizing"
    ECONOMICS = "economics"
    COMPARISON = "comparison"
    SENSITIVITY = "sensitivity"
    MONTE_CARLO = "monte_carlo"
    SIMULATION = "simulation"
    ASSUMPTIONS = "assumptions"
    SOURCES = "sources"
    SURVEY_PRIORITIES = "survey_priorities"
    NEXT_STEPS = "next_steps"


@dataclass(frozen=True, slots=True)
class ParamRow:
    group: str
    key: str
    name: str
    value: Any
    unit: str | None
    status: str
    source: str | None


@dataclass(frozen=True, slots=True)
class Visual:
    caption: str
    content_type: str
    data: bytes


@dataclass(slots=True)
class ScenarioReport:
    """One scenario as the report shows it: the stored calculation payload plus what was learnt about it."""

    id: str
    name: str
    kind: str
    is_baseline: bool
    is_recommended: bool
    financing: dict[str, Any]
    calculated_at: datetime
    result: dict[str, Any]
    trace: list[dict[str, Any]]
    narrative: dict[str, Any]
    simulation: dict[str, Any] | None = None


@dataclass(slots=True)
class ReportModel:
    """Everything a PDF or Excel report renders; collected by the service, rendered without the database."""

    title: str
    project: dict[str, Any]
    generated_at: datetime
    author: str
    versions: dict[str, Any]
    sections: list[ReportSection]
    params: list[ParamRow] = field(default_factory=list)
    process_names: dict[str, str] = field(default_factory=dict)
    processes: list[dict[str, Any]] = field(default_factory=list)
    matching: list[dict[str, Any]] = field(default_factory=list)
    scenarios: list[ScenarioReport] = field(default_factory=list)
    comparison: dict[str, Any] | None = None
    sensitivity: dict[str, Any] | None = None
    monte_carlo: dict[str, Any] | None = None
    survey: list[dict[str, Any]] = field(default_factory=list)
    layout: dict[str, Any] | None = None
    visuals: list[Visual] = field(default_factory=list)
    assumptions: list[dict[str, Any]] = field(default_factory=list)
    sources: list[dict[str, Any]] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    disclaimer: str = DISCLAIMER
    live_formulas: bool = True

    def has(self, section: ReportSection) -> bool:
        return section in self.sections

    @property
    def analysed(self) -> ScenarioReport | None:
        """The scenario the risk sections describe: the recommended one, else the first robotized."""
        robotized = [s for s in self.scenarios if not s.is_baseline]
        return next((s for s in robotized if s.is_recommended), robotized[0] if robotized else None)
