from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from app.domain.common.provenance import Provenance, Scalar
from app.domain.reference import ParameterDef


class ProjectStatus(StrEnum):
    DRAFT = "draft"
    READY = "ready"
    CALCULATED = "calculated"
    ARCHIVED = "archived"


class InitMode(StrEnum):
    BLANK = "blank"
    DEMO = "demo"
    COPY = "copy"


class Severity(StrEnum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


class ValidationState(StrEnum):
    OK = "ok"
    WARNING = "warning"
    ERROR = "error"
    MISSING = "missing"


class Blocks(StrEnum):
    MATCHING = "matching"
    CALCULATION = "calculation"
    SIMULATION = "simulation"
    REPORT = "report"


@dataclass(frozen=True, slots=True)
class StoredParam:
    key: str
    value: Scalar
    unit: str | None
    provenance: Provenance
    history_count: int = 0


@dataclass(frozen=True, slots=True)
class ParamValidation:
    status: ValidationState
    code: str | None = None
    message: str | None = None
    how_to_fix: str | None = None


@dataclass(frozen=True, slots=True)
class EffectiveParam:
    definition: ParameterDef
    value: Scalar
    unit: str | None
    provenance: Provenance
    validation: ParamValidation
    history_count: int = 0

    @property
    def key(self) -> str:
        return self.definition.key


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    key: str
    name: str
    severity: Severity
    code: str
    message: str
    how_to_fix: str | None
    blocks: tuple[Blocks, ...] = ()


@dataclass(frozen=True, slots=True)
class ValidationReport:
    issues: list[ValidationIssue]

    @property
    def status(self) -> str:
        if any(issue.severity == Severity.ERROR for issue in self.issues):
            return "errors"
        return "warnings" if any(i.severity == Severity.WARNING for i in self.issues) else "ok"

    def _blocked(self, stage: Blocks) -> bool:
        return any(stage in issue.blocks for issue in self.issues)

    @property
    def can_match(self) -> bool:
        return not self._blocked(Blocks.MATCHING)

    @property
    def can_calculate(self) -> bool:
        return not self._blocked(Blocks.CALCULATION)

    @property
    def can_simulate(self) -> bool:
        return not self._blocked(Blocks.SIMULATION)


@dataclass(frozen=True, slots=True)
class DataQualitySummary:
    score: float
    counts: dict[str, int]


@dataclass(frozen=True, slots=True)
class DataQualityItem:
    key: str
    name: str
    status: str
    impact: str
    source_title: str | None


@dataclass(frozen=True, slots=True)
class ProjectInfo:
    id: UUID
    name: str
    object_type: str
    status: ProjectStatus
    version: int
    owner_id: UUID
    organization: str | None
    notes: str | None
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    data_quality: DataQualitySummary
    scenarios_count: int
    is_demo: bool
    headline_metrics: dict[str, Any] = field(default_factory=dict)
    last_calculation_id: UUID | None = None
    recommended_scenario_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class ParamHistoryEntry:
    changed_at: datetime
    changed_by: str
    old_value: Scalar
    new_value: Scalar
    status: str
    note: str | None


@dataclass(frozen=True, slots=True)
class AuditEntry:
    id: UUID
    at: datetime
    actor: str
    entity: str
    action: str
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    note: str | None
