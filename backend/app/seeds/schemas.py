from datetime import date
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, TypeAdapter, model_validator

from app.domain.catalog import Badge
from app.domain.common.provenance import ProvenanceStatus, SourceKind
from app.domain.layout.models import LayoutTemplate
from app.domain.reference import NormCategory, ObjectTypeKey, SizingModel, SpecGroup

DATA_DIR = Path(__file__).resolve().parent / "data"


class SeedModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class SolutionTypeSeed(SeedModel):
    key: str
    name: str
    description: str | None = None
    sizing_model: SizingModel | None
    capability_keys: list[str] = []


class SpecKeySeed(SeedModel):
    key: str
    name: str
    group: SpecGroup
    unit: str | None = None
    value_type: Literal["number", "string", "boolean"]
    better: Literal["higher", "lower", "none"] = "none"
    is_key_constraint: bool = False
    solution_types: list[str] = []


class DefaultSeed(SeedModel):
    value: Any
    status: Literal[ProvenanceStatus.ASSUMPTION, ProvenanceStatus.DERIVED]
    rationale: str


class ParameterSeed(SeedModel):
    key: str
    group: str
    name: str
    type: Literal["number", "integer", "string", "boolean", "enum", "dimensions"]
    unit: str | None = None
    required: bool = False
    dataset_row: str | None = None
    step: float | None = None
    min: float | None = None
    max: float | None = None
    enum_values: list[dict[str, str]] | None = None
    hint: str | None = None
    example: str | None = None
    affects: list[str] = []
    order: int = 0
    default: DefaultSeed | None = None


class ParameterGroupSeed(SeedModel):
    key: str
    name: str
    order: int = 0
    survey_hint: str | None = None


class LaborGroupSeed(SeedModel):
    key: str
    name: str
    headcount_param: str
    salary_param: str | None = None


class DemandSeed(SeedModel):
    per_day: str
    hours_per_day: str
    peak_factor: str
    load_per_trip: str | None = None
    trip_tare_kg: str | None = None
    manual_rate: str | None = None


class RequirementSeed(SeedModel):
    key: str
    kind: Literal["spec", "object"] = "spec"
    spec: str | None = None
    comparison: Literal["gte", "lte"] | None = None
    required: str | None = None
    unit: str | None = None
    solution_types: list[str] = []
    message: str
    why_needed: str = ""
    when: str | None = None
    condition: str | None = None
    severity: Literal["warning", "blocking"] = "blocking"

    @model_validator(mode="after")
    def _complete(self) -> "RequirementSeed":
        if self.kind == "spec" and not (self.spec and self.comparison and self.required):
            raise ValueError(f"{self.key}: a spec rule needs spec, comparison and required")
        if self.kind == "object" and not self.condition:
            raise ValueError(f"{self.key}: an object rule needs a condition")
        return self


class SimulationSeed(SeedModel):
    """How the discrete-event model reads this process: expressions over params and norms."""

    model: Literal["transport", "goods_to_person"]
    inbound: str | None = None
    outbound: str | None = None
    internal: str | None = None
    lines: str | None = None
    lines_per_trip: str | None = None
    station_lines_per_hour: str | None = None
    lead_time_min: str
    target_share: str

    def formulas(self) -> dict[str, str]:
        return {k: v for k, v in self.model_dump(exclude={"model"}).items() if v}


class CycleExtraSeed(SeedModel):
    key: str
    name: str
    formula: str


class ProcessSeed(SeedModel):
    key: str
    name: str
    description: str | None = None
    demand_unit: Literal["pallet", "line", "item", "m2", "trip", "kg", "bag", "portion", "container"]
    demand_formula: str | None = None
    demand_params: list[str] = []
    sla: dict[str, Any] | None = None
    labor_groups: list[str] = []
    solution_types: list[str] = []
    sizing_model: SizingModel | None = None
    demand: DemandSeed | None = None
    labor_allocation: dict[str, float] = {}
    labor_allocation_note: str | None = None
    route_length: str | None = None
    unit_weight: str | None = None
    requirements: list[RequirementSeed] = []
    labor_release: str | None = None
    labor_release_by_type: dict[str, str] = {}
    simulation: SimulationSeed | None = None
    cycle_extras: list[CycleExtraSeed] = []


class CheckSeed(SeedModel):
    key: str
    expression: str
    severity: Literal["error", "warning", "info"]
    params: list[str]
    message: str
    how_to_fix: str | None = None


class SiteCostSeed(SeedModel):
    key: str
    kind: Literal["capex", "opex"]
    name: str
    formula: str
    solution_types: list[str] = []
    in_raas: bool = True
    note: str | None = None


class DemoParamSeed(SeedModel):
    value: float | int | bool | str
    rationale: str


class DemoProjectSeed(SeedModel):
    key: str
    name: str
    description: str | None = None
    # Values that differ from the parameter defaults: a team assumption, each with its reason.
    params: dict[str, DemoParamSeed] = {}


class ObjectTypeSeed(SeedModel):
    key: ObjectTypeKey
    name: str
    description: str | None = None
    industry: str
    depth: Literal["full", "basic"]
    dataset_sheet: str | None = None
    layout_templates: list[LayoutTemplate] = []
    parameter_groups: list[ParameterGroupSeed]
    parameters: list[ParameterSeed]
    labor_groups: list[LaborGroupSeed] = []
    processes: list[ProcessSeed] = []
    checks: list[CheckSeed] = []
    demo_projects: list[DemoProjectSeed] = []
    site_costs: list[SiteCostSeed] = []
    # Required by ТЗ 3.2.1 but only describe the object (identification, report), each with the reason.
    # Every other required parameter must reach a formula, a rule, a cost or a check (tested).
    descriptive_params: dict[str, str] = {}


class SourceSeed(SeedModel):
    key: str
    kind: SourceKind
    title: str
    url: str | None = None
    retrieved_at: date | None = None
    note: str | None = None


class RangeSeed(SeedModel):
    min: float | None = None
    max: float | None = None


class NormSeed(SeedModel):
    key: str
    name: str
    value: float
    unit: str
    category: NormCategory
    range: RangeSeed | None = None
    source: str
    rationale: str | None = None
    affects: list[str] = []
    editable_by_user: bool = True
    object_types: list[ObjectTypeKey] = []


class NormSetSeed(SeedModel):
    version: str
    notes: str | None = None
    sources: list[SourceSeed]
    norms: list[NormSeed]


class ProductMappingSeed(SeedModel):
    id: str
    name: str
    solution_type: str
    object_types: list[ObjectTypeKey] = []
    processes: list[str] = []
    specs_ref: str | None = None
    badges: list[Literal[Badge.IN_REGISTRY_719, Badge.TESTED_FCBAS]] = []
    website: str | None = None
    note: str | None = None


class CatalogMappingSeed(SeedModel):
    industry_keys: dict[str, str]
    subtype_synonyms: dict[str, str] = {}
    extra_solution_types: list[SolutionTypeSeed] = []
    products: list[ProductMappingSeed]


# libyaml parses the seed files an order of magnitude faster; the pure-Python loader is the fallback.
_LOADER = getattr(yaml, "CSafeLoader", yaml.SafeLoader)


def load_yaml[T](path: Path, model: type[T]) -> T:
    with path.open(encoding="utf-8") as handle:
        return TypeAdapter(model).validate_python(yaml.load(handle, Loader=_LOADER))  # noqa: S506


def load_solution_types() -> list[SolutionTypeSeed]:
    return load_yaml(DATA_DIR / "solution_types.yaml", list[SolutionTypeSeed])


def load_spec_keys() -> list[SpecKeySeed]:
    return load_yaml(DATA_DIR / "spec_keys.yaml", list[SpecKeySeed])


def load_object_types() -> list[ObjectTypeSeed]:
    items = [load_yaml(path, ObjectTypeSeed) for path in (DATA_DIR / "object_types").glob("*.yaml")]
    order = list(ObjectTypeKey)
    return sorted(items, key=lambda item: order.index(item.key))


def load_norm_set(version: str = "v1") -> NormSetSeed:
    return load_yaml(DATA_DIR / f"norms_{version}.yaml", NormSetSeed)


class CalibrationCaseSeed(SeedModel):
    key: str
    title: str
    source: str
    note: str
    solution_types: list[str] = []
    financing: list[str] = []
    inputs: dict[str, float]
    expected: dict[str, float]
    tolerance_pct: float


class CalibrationSeed(SeedModel):
    cases: list[CalibrationCaseSeed]


def load_calibration() -> CalibrationSeed:
    return load_yaml(DATA_DIR / "calibration.yaml", CalibrationSeed)


def load_catalog_mapping() -> CatalogMappingSeed:
    return load_yaml(DATA_DIR / "catalog_mapping.yaml", CatalogMappingSeed)
