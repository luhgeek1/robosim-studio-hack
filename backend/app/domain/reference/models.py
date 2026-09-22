from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

from app.domain.common.provenance import PValue, SourceInfo


class ObjectTypeKey(StrEnum):
    WAREHOUSE = "warehouse"
    AIRPORT = "airport"
    HOSPITAL = "hospital"
    CUSTOM = "custom"


class SizingModel(StrEnum):
    TRANSPORT_CYCLE = "transport_cycle"
    GOODS_TO_PERSON = "goods_to_person"
    AREA_COVERAGE = "area_coverage"
    STATION_THROUGHPUT = "station_throughput"
    TOW_TRAIN = "tow_train"
    ELEVATOR_CYCLE = "elevator_cycle"


class NormCategory(StrEnum):
    CAPEX = "capex"
    OPEX = "opex"
    LABOR = "labor"
    FINANCE = "finance"
    OPERATIONS = "operations"
    SIMULATION = "simulation"
    SIZING = "sizing"
    RISK = "risk"


class SpecGroup(StrEnum):
    IDENTIFICATION = "identification"
    TECHNICAL = "technical"
    INFRASTRUCTURE = "infrastructure"
    ECONOMICS = "economics"
    APPLICABILITY = "applicability"
    DATA_QUALITY = "data_quality"


@dataclass(frozen=True, slots=True)
class ParameterDef:
    key: str
    name: str
    group: str
    type: str
    unit: str | None
    required: bool
    min: float | None
    max: float | None
    step: float | None
    enum_values: list[dict[str, str]]
    default: PValue | None
    hint: str | None
    example: str | None
    affects: list[str]
    order: int


@dataclass(frozen=True, slots=True)
class ParameterGroup:
    key: str
    name: str
    order: int
    parameters: list[ParameterDef]


@dataclass(frozen=True, slots=True)
class ProcessDef:
    key: str
    name: str
    description: str | None
    demand_unit: str
    demand_formula: str | None
    demand_params: list[str]
    sla: dict[str, Any] | None
    labor_groups: list[str]
    solution_types: list[str]
    sizing_model: SizingModel | None


@dataclass(frozen=True, slots=True)
class LaborGroupDef:
    key: str
    name: str
    headcount_param: str
    salary_param: str | None


@dataclass(frozen=True, slots=True)
class DemoProjectRef:
    key: str
    name: str
    description: str | None


@dataclass(frozen=True, slots=True)
class ObjectTypeDetail:
    key: ObjectTypeKey
    name: str
    description: str | None
    industry: str
    depth: str
    parameter_groups: list[ParameterGroup]
    processes: list[ProcessDef]
    labor_groups: list[LaborGroupDef]
    layout_templates: list[str]
    demo_projects: list[DemoProjectRef] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class SolutionTypeInfo:
    key: str
    name: str
    description: str | None
    sizing_model: SizingModel | None
    capability_keys: list[str]
    processes: list[str]
    products_count: int


@dataclass(frozen=True, slots=True)
class SpecKeyInfo:
    key: str
    name: str
    group: SpecGroup
    unit: str | None
    value_type: str
    better: str
    is_key_constraint: bool
    solution_types: list[str]


@dataclass(frozen=True, slots=True)
class Industry:
    key: str
    name: str
    products_count: int


@dataclass(frozen=True, slots=True)
class NormInfo:
    key: str
    name: str
    value: float
    unit: str
    category: NormCategory
    range_min: float | None
    range_max: float | None
    source: SourceInfo
    rationale: str | None
    affects: list[str]
    editable_by_user: bool
    object_types: list[str]


@dataclass(frozen=True, slots=True)
class NormSetInfo:
    version: str
    published_at: datetime
    published_by: str | None
    notes: str | None
    norms_count: int
    is_current: bool
